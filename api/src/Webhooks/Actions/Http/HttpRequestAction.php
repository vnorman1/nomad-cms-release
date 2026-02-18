<?php
/**
 * NOMAD CMS - HTTP Request Action
 * 
 * Makes arbitrary HTTP requests to external services.
 * Ultimate flexibility for any integration!
 */

declare(strict_types=1);

namespace NomadCMS\Webhooks\Actions\Http;

use NomadCMS\Webhooks\Actions\BaseAction;
use NomadCMS\Webhooks\Actions\ActionContext;
use NomadCMS\Webhooks\Actions\ActionResult;

class HttpRequestAction extends BaseAction
{
    protected int $defaultTimeout = 30;
    
    public function getType(): string
    {
        return 'http_request';
    }
    
    public function getName(): string
    {
        return 'HTTP Kérés';
    }
    
    public function getDescription(): string
    {
        return 'Tetszőleges HTTP kérés küldése külső szolgáltatásokhoz';
    }
    
    public function getCategory(): string
    {
        return 'http';
    }
    
    public function getIcon(): string
    {
        return '🌐';
    }
    
    public function getConfigSchema(): array
    {
        return [
            'type' => 'object',
            'required' => ['url', 'method'],
            'properties' => [
                'url' => [
                    'type' => 'string',
                    'title' => 'URL',
                    'description' => 'A cél URL (támogatja a {{payload.field}} változókat)',
                    'format' => 'uri',
                ],
                'method' => [
                    'type' => 'string',
                    'title' => 'HTTP Metódus',
                    'enum' => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
                    'default' => 'POST',
                ],
                'headers' => [
                    'type' => 'object',
                    'title' => 'HTTP Fejlécek',
                    'description' => 'Egyéni fejlécek (kulcs-érték párok)',
                    'additionalProperties' => ['type' => 'string'],
                ],
                'body_type' => [
                    'type' => 'string',
                    'title' => 'Body típus',
                    'enum' => ['json', 'form', 'raw', 'none'],
                    'default' => 'json',
                ],
                'body' => [
                    'type' => 'object',
                    'title' => 'Request Body',
                    'description' => 'A kérés törzse (ha body_type != none)',
                ],
                'raw_body' => [
                    'type' => 'string',
                    'title' => 'Raw Body',
                    'description' => 'Nyers kérés törzs (ha body_type = raw)',
                ],
                'timeout' => [
                    'type' => 'integer',
                    'title' => 'Timeout (mp)',
                    'minimum' => 1,
                    'maximum' => 120,
                    'default' => 30,
                ],
                'retry_on_failure' => [
                    'type' => 'boolean',
                    'title' => 'Újrapróbálás hiba esetén',
                    'default' => false,
                ],
                'retry_count' => [
                    'type' => 'integer',
                    'title' => 'Újrapróbálások száma',
                    'minimum' => 1,
                    'maximum' => 5,
                    'default' => 3,
                ],
                'success_codes' => [
                    'type' => 'array',
                    'title' => 'Sikeres státuszkódok',
                    'description' => 'Melyik HTTP kódokat tekintjük sikeresnek',
                    'items' => ['type' => 'integer'],
                    'default' => [200, 201, 202, 204],
                ],
                'follow_redirects' => [
                    'type' => 'boolean',
                    'title' => 'Követi az átirányításokat',
                    'default' => true,
                ],
                'verify_ssl' => [
                    'type' => 'boolean',
                    'title' => 'SSL ellenőrzés',
                    'default' => true,
                ],
                'basic_auth' => [
                    'type' => 'object',
                    'title' => 'Basic Auth',
                    'properties' => [
                        'username' => ['type' => 'string'],
                        'password' => ['type' => 'string'],
                    ],
                ],
                'bearer_token' => [
                    'type' => 'string',
                    'title' => 'Bearer Token',
                    'description' => 'Authorization: Bearer <token>',
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
            
            $url = $config['url'] ?? '';
            $method = strtoupper($config['method'] ?? 'POST');
            $timeout = (int)($config['timeout'] ?? $this->defaultTimeout);
            $bodyType = $config['body_type'] ?? 'json';
            $successCodes = $config['success_codes'] ?? [200, 201, 202, 204];
            $retryOnFailure = (bool)($config['retry_on_failure'] ?? false);
            $retryCount = (int)($config['retry_count'] ?? 3);
            
            if (empty($url)) {
                return ActionResult::failure('URL is required');
            }
            
            // Build headers
            $headers = $config['headers'] ?? [];
            
            // Add authentication
            if (!empty($config['bearer_token'])) {
                $headers['Authorization'] = 'Bearer ' . $config['bearer_token'];
            } elseif (!empty($config['basic_auth'])) {
                $credentials = base64_encode(
                    ($config['basic_auth']['username'] ?? '') . ':' . 
                    ($config['basic_auth']['password'] ?? '')
                );
                $headers['Authorization'] = 'Basic ' . $credentials;
            }
            
            // Build body
            $body = null;
            if (!in_array($method, ['GET', 'HEAD', 'OPTIONS']) && $bodyType !== 'none') {
                switch ($bodyType) {
                    case 'json':
                        // Use mapped payload as body, or config body
                        $body = !empty($context->mappedPayload) ? $context->mappedPayload : ($config['body'] ?? []);
                        if (!isset($headers['Content-Type'])) {
                            $headers['Content-Type'] = 'application/json';
                        }
                        break;
                        
                    case 'form':
                        $body = http_build_query($config['body'] ?? []);
                        if (!isset($headers['Content-Type'])) {
                            $headers['Content-Type'] = 'application/x-www-form-urlencoded';
                        }
                        break;
                        
                    case 'raw':
                        $body = $config['raw_body'] ?? '';
                        break;
                }
            }
            
            // Execute request with retry logic
            $attempt = 0;
            $lastError = null;
            
            do {
                $attempt++;
                
                $response = $this->makeRequest(
                    $method,
                    $url,
                    $headers,
                    $body,
                    $timeout,
                    (bool)($config['follow_redirects'] ?? true),
                    (bool)($config['verify_ssl'] ?? true)
                );
                
                if ($response['success'] && in_array($response['status_code'], $successCodes)) {
                    $executionTime = (int)((microtime(true) - $startTime) * 1000);
                    
                    // Try to parse response as JSON
                    $responseData = $response['body'];
                    $jsonResponse = json_decode($response['body'], true);
                    if ($jsonResponse !== null) {
                        $responseData = $jsonResponse;
                    }
                    
                    return new ActionResult(
                        success: true,
                        data: $responseData,
                        statusCode: $response['status_code'],
                        executionTimeMs: $executionTime,
                        metadata: [
                            'url' => $url,
                            'method' => $method,
                            'attempts' => $attempt,
                        ]
                    );
                }
                
                $lastError = $response['error'] ?? "HTTP {$response['status_code']}";
                
                // Retry delay (exponential backoff)
                if ($retryOnFailure && $attempt < $retryCount) {
                    usleep($attempt * 500000); // 0.5s, 1s, 1.5s...
                }
                
            } while ($retryOnFailure && $attempt < $retryCount);
            
            $executionTime = (int)((microtime(true) - $startTime) * 1000);
            
            return new ActionResult(
                success: false,
                error: $lastError,
                statusCode: $response['status_code'] ?? null,
                executionTimeMs: $executionTime,
                metadata: [
                    'url' => $url,
                    'method' => $method,
                    'attempts' => $attempt,
                    'response_body' => $response['body'] ?? null,
                ]
            );
            
        } catch (\Exception $e) {
            $this->log('HTTP request failed', ['error' => $e->getMessage()]);
            return ActionResult::failure($e->getMessage());
        }
    }
    
    /**
     * Make HTTP request
     */
    private function makeRequest(
        string $method,
        string $url,
        array $headers,
        mixed $body,
        int $timeout,
        bool $followRedirects,
        bool $verifySsl
    ): array {
        $ch = curl_init();
        
        $curlOptions = [
            CURLOPT_URL => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => $timeout,
            CURLOPT_FOLLOWLOCATION => $followRedirects,
            CURLOPT_MAXREDIRS => 5,
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_HTTPHEADER => $this->formatHeaders($headers),
            CURLOPT_HEADER => false,
        ];
        
        if (!$verifySsl) {
            $curlOptions[CURLOPT_SSL_VERIFYPEER] = false;
            $curlOptions[CURLOPT_SSL_VERIFYHOST] = 0;
        }
        
        if ($body !== null) {
            if (is_array($body)) {
                $body = json_encode($body);
            }
            $curlOptions[CURLOPT_POSTFIELDS] = $body;
        }
        
        curl_setopt_array($ch, $curlOptions);
        
        $response = curl_exec($ch);
        $statusCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        $errorCode = curl_errno($ch);
        
        curl_close($ch);
        
        if ($errorCode !== 0) {
            return [
                'success' => false,
                'error' => $error ?: 'cURL error ' . $errorCode,
                'status_code' => 0,
                'body' => null,
            ];
        }
        
        return [
            'success' => true,
            'error' => null,
            'status_code' => $statusCode,
            'body' => $response,
        ];
    }
}
