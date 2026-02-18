<?php
/**
 * NOMAD CMS - Forward Webhook Action
 * 
 * Forwards webhook payload to multiple external URLs.
 * Perfect for connecting to Zapier, Make, n8n, etc.
 */

declare(strict_types=1);

namespace NomadCMS\Webhooks\Actions\Http;

use NomadCMS\Webhooks\Actions\BaseAction;
use NomadCMS\Webhooks\Actions\ActionContext;
use NomadCMS\Webhooks\Actions\ActionResult;
use NomadCMS\Security\WebhookService;

class ForwardWebhookAction extends BaseAction
{
    protected int $defaultTimeout = 30;
    
    public function getType(): string
    {
        return 'forward_webhook';
    }
    
    public function getName(): string
    {
        return 'Webhook Továbbítás';
    }
    
    public function getDescription(): string
    {
        return 'Webhook payload továbbítása több külső URL-re (Zapier, Make, n8n, stb.)';
    }
    
    public function getCategory(): string
    {
        return 'http';
    }
    
    public function getIcon(): string
    {
        return '↗️';
    }
    
    public function getConfigSchema(): array
    {
        return [
            'type' => 'object',
            'required' => ['urls'],
            'properties' => [
                'urls' => [
                    'type' => 'array',
                    'title' => 'Cél URL-ek',
                    'description' => 'URL lista ahová továbbítjuk a webhook-ot',
                    'items' => ['type' => 'string', 'format' => 'uri'],
                    'minItems' => 1,
                ],
                'forward_mode' => [
                    'type' => 'string',
                    'title' => 'Továbbítási mód',
                    'enum' => ['original', 'mapped', 'wrapped'],
                    'default' => 'original',
                    'description' => 'original: eredeti payload, mapped: transzformált, wrapped: metaadatokkal',
                ],
                'add_signature' => [
                    'type' => 'boolean',
                    'title' => 'HMAC aláírás hozzáadása',
                    'description' => 'Nomad stílusú aláírás hozzáadása a fejléchez',
                    'default' => false,
                ],
                'signature_secret' => [
                    'type' => 'string',
                    'title' => 'Aláírás secret',
                    'description' => 'Ha üres, automatikusan generálunk',
                ],
                'include_metadata' => [
                    'type' => 'boolean',
                    'title' => 'Metaadatok hozzáadása',
                    'description' => 'Hozzáadja az eredeti endpoint és trigger infókat',
                    'default' => false,
                ],
                'custom_headers' => [
                    'type' => 'object',
                    'title' => 'Egyéni fejlécek',
                    'additionalProperties' => ['type' => 'string'],
                ],
                'parallel' => [
                    'type' => 'boolean',
                    'title' => 'Párhuzamos küldés',
                    'description' => 'Egyszerre küldi el mindenkinek (gyorsabb)',
                    'default' => true,
                ],
                'timeout' => [
                    'type' => 'integer',
                    'title' => 'Timeout (mp)',
                    'minimum' => 1,
                    'maximum' => 60,
                    'default' => 15,
                ],
                'fail_on_any_error' => [
                    'type' => 'boolean',
                    'title' => 'Hibás ha bármelyik sikertelen',
                    'default' => false,
                ],
            ],
        ];
    }
    
    public function getExpectedFields(): array
    {
        return [];
    }
    
    public function execute(ActionContext $context): ActionResult
    {
        $startTime = microtime(true);
        
        try {
            $config = $this->replaceConfigVariables($context->actionConfig, $context);
            
            $urls = $config['urls'] ?? [];
            if (empty($urls)) {
                return ActionResult::failure('No target URLs configured');
            }
            
            $forwardMode = $config['forward_mode'] ?? 'original';
            $addSignature = (bool)($config['add_signature'] ?? false);
            $includeMetadata = (bool)($config['include_metadata'] ?? false);
            $parallel = (bool)($config['parallel'] ?? true);
            $timeout = (int)($config['timeout'] ?? 15);
            $failOnAnyError = (bool)($config['fail_on_any_error'] ?? false);
            
            // Build payload
            $payload = match ($forwardMode) {
                'original' => $context->originalPayload,
                'mapped' => $context->mappedPayload ?: $context->originalPayload,
                'wrapped' => [
                    'data' => $context->mappedPayload ?: $context->originalPayload,
                    'original' => $context->originalPayload,
                    'metadata' => [
                        'source' => 'nomad-cms',
                        'endpoint' => $context->endpoint['name'] ?? null,
                        'event' => $context->triggerEvent,
                        'timestamp' => date('c'),
                    ],
                ],
                default => $context->originalPayload,
            };
            
            if ($includeMetadata && $forwardMode !== 'wrapped') {
                $payload['_nomad_metadata'] = [
                    'source' => 'nomad-cms',
                    'endpoint' => $context->endpoint['name'] ?? null,
                    'event' => $context->triggerEvent,
                    'forwarded_at' => date('c'),
                ];
            }
            
            // Build headers
            $headers = [
                'Content-Type' => 'application/json',
                'User-Agent' => 'NomadCMS-Webhook/2.0',
                'X-Forwarded-By' => 'NomadCMS',
            ];
            
            if (!empty($config['custom_headers'])) {
                $headers = array_merge($headers, $config['custom_headers']);
            }
            
            $jsonPayload = json_encode($payload);
            
            // Add signature if requested
            if ($addSignature) {
                $secret = $config['signature_secret'] ?? $this->generateSecret();
                $timestamp = time();
                $signaturePayload = $timestamp . '.' . $jsonPayload;
                $signature = hash_hmac('sha256', $signaturePayload, $secret);
                $headers['X-Nomad-Signature'] = "t={$timestamp},v1={$signature}";
            }
            
            // Send to all URLs
            $results = [];
            
            if ($parallel && count($urls) > 1) {
                $results = $this->sendParallel($urls, $headers, $jsonPayload, $timeout);
            } else {
                foreach ($urls as $url) {
                    $results[$url] = $this->sendSingle($url, $headers, $jsonPayload, $timeout);
                }
            }
            
            // Analyze results
            $successCount = count(array_filter($results, fn($r) => $r['success']));
            $failCount = count($results) - $successCount;
            
            $executionTime = (int)((microtime(true) - $startTime) * 1000);
            
            $isSuccess = $failOnAnyError ? ($failCount === 0) : ($successCount > 0);
            
            return new ActionResult(
                success: $isSuccess,
                data: [
                    'forwarded_to' => count($urls),
                    'success_count' => $successCount,
                    'fail_count' => $failCount,
                    'results' => $results,
                ],
                error: $isSuccess ? null : "Failed to forward to {$failCount} URL(s)",
                statusCode: $isSuccess ? 200 : 502,
                executionTimeMs: $executionTime,
                metadata: [
                    'forward_mode' => $forwardMode,
                    'parallel' => $parallel,
                ]
            );
            
        } catch (\Exception $e) {
            $this->log('Forward webhook failed', ['error' => $e->getMessage()]);
            return ActionResult::failure($e->getMessage());
        }
    }
    
    /**
     * Send webhook to multiple URLs in parallel using curl_multi
     */
    private function sendParallel(array $urls, array $headers, string $payload, int $timeout): array
    {
        $mh = curl_multi_init();
        $handles = [];
        $formattedHeaders = $this->formatHeaders($headers);
        
        foreach ($urls as $url) {
            $ch = curl_init();
            curl_setopt_array($ch, [
                CURLOPT_URL => $url,
                CURLOPT_POST => true,
                CURLOPT_POSTFIELDS => $payload,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => $timeout,
                CURLOPT_HTTPHEADER => $formattedHeaders,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_MAXREDIRS => 3,
            ]);
            
            curl_multi_add_handle($mh, $ch);
            $handles[$url] = $ch;
        }
        
        // Execute all requests
        $running = null;
        do {
            curl_multi_exec($mh, $running);
            curl_multi_select($mh);
        } while ($running > 0);
        
        // Collect results
        $results = [];
        foreach ($handles as $url => $ch) {
            $response = curl_multi_getcontent($ch);
            $statusCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $error = curl_error($ch);
            
            $results[$url] = [
                'success' => $statusCode >= 200 && $statusCode < 300,
                'status_code' => $statusCode,
                'error' => $error ?: null,
                'response' => strlen($response) < 1000 ? $response : substr($response, 0, 1000) . '...',
            ];
            
            curl_multi_remove_handle($mh, $ch);
            curl_close($ch);
        }
        
        curl_multi_close($mh);
        
        return $results;
    }
    
    /**
     * Send webhook to a single URL
     */
    private function sendSingle(string $url, array $headers, string $payload, int $timeout): array
    {
        $ch = curl_init();
        
        curl_setopt_array($ch, [
            CURLOPT_URL => $url,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $payload,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => $timeout,
            CURLOPT_HTTPHEADER => $this->formatHeaders($headers),
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 3,
        ]);
        
        $response = curl_exec($ch);
        $statusCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        
        curl_close($ch);
        
        return [
            'success' => $statusCode >= 200 && $statusCode < 300,
            'status_code' => $statusCode,
            'error' => $error ?: null,
            'response' => strlen($response) < 1000 ? $response : substr($response, 0, 1000) . '...',
        ];
    }
    
    /**
     * Generate a secure secret
     */
    private function generateSecret(): string
    {
        return bin2hex(random_bytes(32));
    }
}
