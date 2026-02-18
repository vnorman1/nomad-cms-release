<?php
/**
 * NOMAD CMS - WebAuthn Service
 * Passkey/Biometric authentication using FIDO2
 */

declare(strict_types=1);

namespace NomadCMS\Auth;

use lbuchs\WebAuthn\WebAuthn;
use lbuchs\WebAuthn\Binary\ByteBuffer;
use NomadCMS\Config\Security;
use NomadCMS\Database\AuthDatabase;
use Ramsey\Uuid\Uuid;

final class WebAuthnService
{
    private static ?WebAuthn $webAuthn = null;
    
    /**
     * Get WebAuthn instance
     */
    private static function getInstance(): WebAuthn
    {
        if (self::$webAuthn === null) {
            $config = Security::getWebAuthnConfig();
            
            self::$webAuthn = new WebAuthn(
                $config['rp_name'],
                $config['rp_id'],
                ['none']  // attestation: none, indirect, or direct
            );
            
            // Set timeout
            self::$webAuthn->addRootCertificates(null); // Accept any manufacturer
        }
        
        return self::$webAuthn;
    }
    
    /**
     * Generate registration options (credential creation)
     * Call this to start passkey registration flow
     */
    public static function getRegistrationOptions(array $user, array $excludeCredentialIds = []): array
    {
        $webAuthn = self::getInstance();
        $config = Security::getWebAuthnConfig();
        
        // User handle is the unique identifier for WebAuthn
        $userHandle = new ByteBuffer(hex2bin($user['uuid']) ?: random_bytes(16));
        
        // Prepare excluded credentials (already registered passkeys)
        $excludeCredentials = [];
        foreach ($excludeCredentialIds as $credId) {
            $excludeCredentials[] = new ByteBuffer(base64_decode($credId));
        }
        
        // Generate creation options
        $createArgs = $webAuthn->getCreateArgs(
            $userHandle,                    // User ID
            $user['email'],                 // User name (display)
            $user['email'],                 // User display name
            $config['timeout'],             // Timeout in ms
            true,                           // Require resident key (discoverable)
            $config['user_verification'],   // 'required', 'preferred', 'discouraged'
            $excludeCredentials             // Already registered credentials
        );
        
        // Store challenge in session for verification
        $_SESSION['webauthn_challenge'] = $webAuthn->getChallenge()->getHex();
        $_SESSION['webauthn_user_id'] = $user['id'];
        
        return [
            'options' => $createArgs,
            'challenge' => $webAuthn->getChallenge()->getHex(),
        ];
    }
    
    /**
     * Verify registration response and store credential
     */
    public static function verifyRegistration(string $clientDataJSON, string $attestationObject, ?string $friendlyName = null): array
    {
        $webAuthn = self::getInstance();
        
        // Verify challenge from session
        if (empty($_SESSION['webauthn_challenge'])) {
            throw new \Exception('No registration challenge found');
        }
        
        $challenge = $_SESSION['webauthn_challenge'];
        $userId = $_SESSION['webauthn_user_id'];
        
        // Clear session data
        unset($_SESSION['webauthn_challenge'], $_SESSION['webauthn_user_id']);
        
        // Process the response
        $data = $webAuthn->processCreate(
            base64_decode($clientDataJSON),
            base64_decode($attestationObject),
            new ByteBuffer(hex2bin($challenge)),
            true,   // Require user verification
            true,   // Require user presence
            false   // Check origin (handled by browser)
        );
        
        // Store credential in database
        // Handle different return types from processCreate()
        $credentialIdRaw = $data->credentialId;
        if ($credentialIdRaw instanceof ByteBuffer) {
            $credentialId = base64_encode($credentialIdRaw->getBinaryString());
        } else {
            // Already a string (base64 encoded or binary)
            $credentialId = is_string($credentialIdRaw) ? base64_encode($credentialIdRaw) : base64_encode((string)$credentialIdRaw);
        }
        $publicKey = base64_encode($data->credentialPublicKey);
        
        $db = AuthDatabase::getInstance();
        $stmt = $db->prepare("
            INSERT INTO webauthn_credentials 
            (user_id, credential_id, public_key, attestation_type, transports, sign_count, user_handle, friendly_name)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ");
        
        // SECURITY FIX: Use prepared statement to prevent SQL injection
        $uuidStmt = $db->prepare("SELECT uuid FROM users WHERE id = ?");
        $uuidStmt->execute([$userId]);
        $userUuid = $uuidStmt->fetchColumn();
        
        $stmt->execute([
            $userId,
            $credentialId,
            $publicKey,
            $data->attestationFormat ?? 'none',
            json_encode(['internal', 'hybrid']), // Common transports
            $data->signatureCounter ?? 0,
            $userUuid,
            $friendlyName ?? 'Passkey ' . date('Y-m-d'),
        ]);
        
        return [
            'credential_id' => $credentialId,
            'message' => 'Passkey registered successfully',
        ];
    }
    
    /**
     * Generate authentication options (assertion)
     * Call this to start passkey login flow
     */
    public static function getAuthenticationOptions(?string $email = null): array
    {
        $webAuthn = self::getInstance();
        $config = Security::getWebAuthnConfig();
        
        // Get allowed credentials for user (if email provided)
        $allowCredentials = [];
        if ($email) {
            $db = AuthDatabase::getInstance();
            $stmt = $db->prepare("
                SELECT wc.credential_id 
                FROM webauthn_credentials wc
                JOIN users u ON wc.user_id = u.id
                WHERE u.email = ?
            ");
            $stmt->execute([$email]);
            
            while ($row = $stmt->fetch()) {
                $allowCredentials[] = new ByteBuffer(base64_decode($row['credential_id']));
            }
        }
        
        // Generate get args
        $getArgs = $webAuthn->getGetArgs(
            $allowCredentials,
            $config['timeout'],
            true,   // Require user verification
            $config['user_verification']
        );
        
        // Store challenge in session
        $_SESSION['webauthn_challenge'] = $webAuthn->getChallenge()->getHex();
        
        return [
            'options' => $getArgs,
            'challenge' => $webAuthn->getChallenge()->getHex(),
        ];
    }
    
    /**
     * Verify authentication response
     * Returns user data if successful
     */
    public static function verifyAuthentication(
        string $credentialId,
        string $clientDataJSON,
        string $authenticatorData,
        string $signature,
        ?string $userHandle = null
    ): array {
        $webAuthn = self::getInstance();
        
        // Verify challenge
        if (empty($_SESSION['webauthn_challenge'])) {
            throw new \Exception('No authentication challenge found');
        }
        
        $challenge = $_SESSION['webauthn_challenge'];
        unset($_SESSION['webauthn_challenge']);
        
        // Find credential in database
        $db = AuthDatabase::getInstance();
        // Fix: Handle both Base64 and Base64URL (replace -_ with +/)
        $credentialId = str_replace(['-', '_'], ['+', '/'], $credentialId);
        $decodedCredId = base64_encode(base64_decode($credentialId)); // Normalize
        
        $stmt = $db->prepare("
            SELECT wc.*, u.id as user_id, u.uuid, u.email, u.is_admin
            FROM webauthn_credentials wc
            JOIN users u ON wc.user_id = u.id
            WHERE wc.credential_id = ?
        ");
        $stmt->execute([$decodedCredId]);
        $credential = $stmt->fetch();
        
        if (!$credential) {
            throw new \Exception('Credential not found');
        }
        
        // Verify the assertion
        $data = $webAuthn->processGet(
            base64_decode($clientDataJSON),
            base64_decode($authenticatorData),
            base64_decode($signature),
            base64_decode($credential['public_key']),
            new ByteBuffer(hex2bin($challenge)),
            null,  // Credential public key (already decoded)
            true,  // Require user verification
            true   // Require user presence
        );
        
        // Update sign count (replay protection)
        $stmt = $db->prepare("
            UPDATE webauthn_credentials 
            SET sign_count = ?, last_used_at = datetime('now')
            WHERE credential_id = ?
        ");
        $stmt->execute([$data->signatureCounter ?? 0, $decodedCredId]);
        
        return [
            'id' => $credential['user_id'],
            'uuid' => $credential['uuid'],
            'email' => $credential['email'],
            'is_admin' => (bool) $credential['is_admin'],
        ];
    }
    
    /**
     * Get user's registered credentials
     */
    public static function getUserCredentials(int $userId): array
    {
        $db = AuthDatabase::getInstance();
        $stmt = $db->prepare("
            SELECT id, credential_id, friendly_name, created_at, last_used_at
            FROM webauthn_credentials
            WHERE user_id = ?
            ORDER BY created_at DESC
        ");
        $stmt->execute([$userId]);
        
        return $stmt->fetchAll();
    }
    
    /**
     * Delete a credential
     */
    public static function deleteCredential(int $userId, int $credentialDbId): bool
    {
        $db = AuthDatabase::getInstance();
        $stmt = $db->prepare("DELETE FROM webauthn_credentials WHERE id = ? AND user_id = ?");
        return $stmt->execute([$credentialDbId, $userId]);
    }
}
