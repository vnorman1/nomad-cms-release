<?php
/**
 * NOMAD CMS - TOTP Service
 * Time-based One-Time Password for 2FA
 */

declare(strict_types=1);

namespace NomadCMS\Auth;

use OTPHP\TOTP;
use NomadCMS\Config\Security;
use ParagonIE\ConstantTime\Base32;
use Endroid\QrCode\Builder\Builder;
use Endroid\QrCode\Encoding\Encoding;
use Endroid\QrCode\ErrorCorrectionLevel;
use Endroid\QrCode\Writer\PngWriter;

final class TOTPService
{
    /**
     * Generate new TOTP secret for user
     * Returns the secret, provisioning URI, and local QR code data
     */
    public static function generateSecret(string $userEmail): array
    {
        $config = Security::getTotpConfig();
        
        // Generate 20 bytes of random data (160 bits) - industry standard
        // This results in a 32-character Base32 string
        $secret = trim(Base32::encodeUpper(random_bytes(20)), '=');
        
        // Create TOTP instance from manual secret
        $totp = TOTP::createFromSecret($secret);
        $totp->setLabel($userEmail);
        $totp->setIssuer($config['issuer']);
        $totp->setDigits($config['digits']);
        $totp->setPeriod($config['period']);
        
        // Get the provisioning URI for QR code generation
        $provisioningUri = $totp->getProvisioningUri();
        
        // Generate local QR code
        $qrData = self::generateQrCode($provisioningUri);
        
        return [
            'secret' => $totp->getSecret(),
            'provisioning_uri' => $provisioningUri,
            'qr_code_base64' => $qrData['base64'],
            'qr_code_data_uri' => $qrData['data_uri'],
        ];
    }
    
    /**
     * Generate QR code locally using endroid/qr-code v5
     * Returns base64 encoded PNG and data URI
     */
    public static function generateQrCode(string $data, int $size = 200): array
    {
        $result = Builder::create()
            ->writer(new PngWriter())
            ->data($data)
            ->encoding(new Encoding('UTF-8'))
            ->errorCorrectionLevel(ErrorCorrectionLevel::Medium)
            ->size($size)
            ->margin(10)
            ->build();
        
        $base64 = base64_encode($result->getString());
        
        return [
            'base64' => $base64,
            'data_uri' => $result->getDataUri(),
        ];
    }
    
    /**
     * Verify TOTP code against stored secret
     * 
     * @param string $secret The user's stored TOTP secret
     * @param string $code The code entered by user (6 digits)
     * @param int $window Number of periods to check (default: 1 = ± seconds)
     */
    public static function verifyCode(string $secret, string $code, int $window = 1): bool
    {
        $config = Security::getTotpConfig();
        
        $totp = TOTP::createFromSecret($secret);
        $totp->setDigits($config['digits']);
        $totp->setPeriod($config['period']);
        
        // Verify with time window for clock drift tolerance
        return $totp->verify($code, null, $window);
    }
    
    /**
     * Generate backup codes for account recovery
     * Returns array of 10 codes, each 8 characters
     */
    public static function generateBackupCodes(int $count = 10): array
    {
        $codes = [];
        
        for ($i = 0; $i < $count; $i++) {
            // Generate 8 character alphanumeric code (uppercase for readability)
            $codes[] = strtoupper(substr(bin2hex(random_bytes(4)), 0, 8));
        }
        
        return [
            'codes' => $codes,
            'hashes' => array_map(fn($code) => password_hash($code, PASSWORD_ARGON2ID), $codes),
        ];
    }
    
    /**
     * Verify backup code (one-time use)
     */
    public static function verifyBackupCode(string $code, array $hashedCodes): ?int
    {
        $normalizedCode = strtoupper(trim($code));
        
        foreach ($hashedCodes as $index => $hash) {
            if (password_verify($normalizedCode, $hash)) {
                return $index; // Return index so it can be marked as used
            }
        }
        
        return null;
    }
    
    /**
     * Check if secret is valid base32 format
     */
    public static function isValidSecret(string $secret): bool
    {
        try {
            Base32::decodeUpper($secret);
            return strlen($secret) >= 16; // Minimum 80-bit secret
        } catch (\Exception $e) {
            return false;
        }
    }
}
