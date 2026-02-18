<?php
/**
 * NOMAD CMS - Email Action
 * 
 * Sends emails via SMTP or email providers (SendGrid, Mailgun, etc.)
 */

declare(strict_types=1);

namespace NomadCMS\Webhooks\Actions\Notification;

use NomadCMS\Webhooks\Actions\BaseAction;
use NomadCMS\Webhooks\Actions\ActionContext;
use NomadCMS\Webhooks\Actions\ActionResult;

class EmailAction extends BaseAction
{
    protected bool $requiresProvider = true;
    protected ?string $requiredProvider = 'email';
    protected int $defaultTimeout = 30;
    
    public function getType(): string
    {
        return 'send_email';
    }
    
    public function getName(): string
    {
        return 'Email Küldés';
    }
    
    public function getDescription(): string
    {
        return 'Email küldése SMTP-n vagy email szolgáltatón keresztül (SendGrid, Mailgun, stb.)';
    }
    
    public function getCategory(): string
    {
        return 'notification';
    }
    
    public function getIcon(): string
    {
        return '📧';
    }
    
    public function getConfigSchema(): array
    {
        return [
            'type' => 'object',
            'required' => ['to', 'subject'],
            'properties' => [
                'to' => [
                    'type' => 'array',
                    'title' => 'Címzett(ek)',
                    'items' => ['type' => 'string', 'format' => 'email'],
                    'minItems' => 1,
                ],
                'cc' => [
                    'type' => 'array',
                    'title' => 'CC',
                    'items' => ['type' => 'string', 'format' => 'email'],
                ],
                'bcc' => [
                    'type' => 'array',
                    'title' => 'BCC',
                    'items' => ['type' => 'string', 'format' => 'email'],
                ],
                'from' => [
                    'type' => 'string',
                    'title' => 'Feladó',
                    'format' => 'email',
                ],
                'from_name' => [
                    'type' => 'string',
                    'title' => 'Feladó neve',
                ],
                'reply_to' => [
                    'type' => 'string',
                    'title' => 'Válaszcím',
                    'format' => 'email',
                ],
                'subject' => [
                    'type' => 'string',
                    'title' => 'Tárgy',
                    'maxLength' => 998,
                ],
                'body_html' => [
                    'type' => 'string',
                    'title' => 'HTML tartalom',
                ],
                'body_text' => [
                    'type' => 'string',
                    'title' => 'Plaintext tartalom',
                ],
                'template_id' => [
                    'type' => 'string',
                    'title' => 'Template ID',
                    'description' => 'SendGrid/Mailgun template azonosító',
                ],
                'template_data' => [
                    'type' => 'object',
                    'title' => 'Template változók',
                    'additionalProperties' => true,
                ],
                'provider' => [
                    'type' => 'string',
                    'title' => 'Email szolgáltató',
                    'enum' => ['smtp', 'sendgrid', 'mailgun', 'ses', 'postmark'],
                    'default' => 'smtp',
                ],
                'priority' => [
                    'type' => 'string',
                    'title' => 'Prioritás',
                    'enum' => ['low', 'normal', 'high'],
                    'default' => 'normal',
                ],
                'attachments' => [
                    'type' => 'array',
                    'title' => 'Csatolmányok',
                    'items' => [
                        'type' => 'object',
                        'properties' => [
                            'filename' => ['type' => 'string'],
                            'content' => ['type' => 'string', 'description' => 'Base64 encoded content'],
                            'content_type' => ['type' => 'string'],
                            'url' => ['type' => 'string', 'description' => 'URL to fetch content from'],
                        ],
                    ],
                ],
            ],
        ];
    }
    
    public function getExpectedFields(): array
    {
        return ['to', 'subject', 'body', 'from', 'name'];
    }
    
    public function execute(ActionContext $context): ActionResult
    {
        $startTime = microtime(true);
        
        try {
            $config = $this->replaceConfigVariables($context->actionConfig, $context);
            
            $provider = $config['provider'] ?? $context->getProviderConfig('type') ?? 'smtp';
            
            // Get recipients
            $to = $config['to'] ?? [];
            if (!is_array($to)) {
                $to = [$to];
            }
            
            // Use mapped payload for to if available
            if (empty($to) && !empty($context->mappedPayload['to'])) {
                $to = is_array($context->mappedPayload['to']) 
                    ? $context->mappedPayload['to'] 
                    : [$context->mappedPayload['to']];
            }
            
            if (empty($to)) {
                return ActionResult::failure('At least one recipient is required');
            }
            
            // Build email data
            $email = [
                'to' => $to,
                'cc' => $config['cc'] ?? [],
                'bcc' => $config['bcc'] ?? [],
                'from' => $config['from'] ?? $context->getProviderConfig('from'),
                'from_name' => $config['from_name'] ?? $context->getProviderConfig('from_name') ?? 'NomadCMS',
                'reply_to' => $config['reply_to'] ?? null,
                'subject' => $config['subject'] ?? $context->mappedPayload['subject'] ?? 'Webhook Notification',
                'body_html' => $config['body_html'] ?? $context->mappedPayload['body_html'] ?? $context->mappedPayload['body'] ?? null,
                'body_text' => $config['body_text'] ?? $context->mappedPayload['body_text'] ?? null,
                'template_id' => $config['template_id'] ?? null,
                'template_data' => $config['template_data'] ?? $context->mappedPayload ?? [],
                'priority' => $config['priority'] ?? 'normal',
                'attachments' => $config['attachments'] ?? [],
            ];
            
            // Generate text from HTML if needed
            if (empty($email['body_text']) && !empty($email['body_html'])) {
                $email['body_text'] = strip_tags($email['body_html']);
            }
            
            // Generate basic HTML from text if needed
            if (empty($email['body_html']) && !empty($email['body_text'])) {
                $email['body_html'] = '<pre>' . htmlspecialchars($email['body_text']) . '</pre>';
            }
            
            // Send based on provider
            $result = match ($provider) {
                'sendgrid' => $this->sendViaSendGrid($email, $context),
                'mailgun' => $this->sendViaMailgun($email, $context),
                'ses' => $this->sendViaSes($email, $context),
                'postmark' => $this->sendViaPostmark($email, $context),
                default => $this->sendViaSmtp($email, $context),
            };
            
            $executionTime = (int)((microtime(true) - $startTime) * 1000);
            
            if ($result['success']) {
                return new ActionResult(
                    success: true,
                    data: [
                        'message_id' => $result['message_id'] ?? null,
                        'recipients' => count($to),
                    ],
                    statusCode: 200,
                    executionTimeMs: $executionTime
                );
            }
            
            return ActionResult::failure($result['error'] ?? 'Failed to send email');
            
        } catch (\Exception $e) {
            $this->log('Email send failed', ['error' => $e->getMessage()]);
            return ActionResult::failure($e->getMessage());
        }
    }
    
    /**
     * Send via PHP mail() or SMTP
     */
    private function sendViaSmtp(array $email, ActionContext $context): array
    {
        // Build headers
        $headers = [];
        $headers[] = 'MIME-Version: 1.0';
        $headers[] = 'Content-type: text/html; charset=utf-8';
        
        $from = $email['from'] ?? 'noreply@example.com';
        $fromName = $email['from_name'] ?? 'NomadCMS';
        $headers[] = "From: {$fromName} <{$from}>";
        
        if ($email['reply_to']) {
            $headers[] = "Reply-To: {$email['reply_to']}";
        }
        
        // Priority
        if ($email['priority'] === 'high') {
            $headers[] = 'X-Priority: 1';
            $headers[] = 'X-MSMail-Priority: High';
        } elseif ($email['priority'] === 'low') {
            $headers[] = 'X-Priority: 5';
            $headers[] = 'X-MSMail-Priority: Low';
        }
        
        $to = implode(', ', $email['to']);
        $success = @mail($to, $email['subject'], $email['body_html'], implode("\r\n", $headers));
        
        return [
            'success' => $success,
            'error' => $success ? null : 'Failed to send email via mail()',
            'message_id' => $success ? uniqid('mail_') : null,
        ];
    }
    
    /**
     * Send via SendGrid API
     */
    private function sendViaSendGrid(array $email, ActionContext $context): array
    {
        $apiKey = $context->getProviderConfig('api_key');
        if (empty($apiKey)) {
            return ['success' => false, 'error' => 'SendGrid API key not configured'];
        }
        
        $payload = [
            'personalizations' => [[
                'to' => array_map(fn($e) => ['email' => $e], $email['to']),
            ]],
            'from' => [
                'email' => $email['from'] ?? 'noreply@example.com',
                'name' => $email['from_name'] ?? 'NomadCMS',
            ],
            'subject' => $email['subject'],
        ];
        
        if (!empty($email['cc'])) {
            $payload['personalizations'][0]['cc'] = array_map(fn($e) => ['email' => $e], $email['cc']);
        }
        if (!empty($email['bcc'])) {
            $payload['personalizations'][0]['bcc'] = array_map(fn($e) => ['email' => $e], $email['bcc']);
        }
        
        if ($email['template_id']) {
            $payload['template_id'] = $email['template_id'];
            $payload['personalizations'][0]['dynamic_template_data'] = $email['template_data'];
        } else {
            $payload['content'] = [];
            if ($email['body_text']) {
                $payload['content'][] = ['type' => 'text/plain', 'value' => $email['body_text']];
            }
            if ($email['body_html']) {
                $payload['content'][] = ['type' => 'text/html', 'value' => $email['body_html']];
            }
        }
        
        $result = $this->httpRequest('POST', 'https://api.sendgrid.com/v3/mail/send', [
            'Authorization' => "Bearer {$apiKey}",
            'Content-Type' => 'application/json',
        ], $payload, $this->defaultTimeout);
        
        return [
            'success' => $result['status_code'] >= 200 && $result['status_code'] < 300,
            'error' => $result['error'] ?? ($result['status_code'] >= 300 ? 'SendGrid error: ' . ($result['body'] ?? '') : null),
            'message_id' => uniqid('sg_'),
        ];
    }
    
    /**
     * Send via Mailgun API
     */
    private function sendViaMailgun(array $email, ActionContext $context): array
    {
        $apiKey = $context->getProviderConfig('api_key');
        $domain = $context->getProviderConfig('domain');
        
        if (empty($apiKey) || empty($domain)) {
            return ['success' => false, 'error' => 'Mailgun API key and domain required'];
        }
        
        $from = $email['from_name'] 
            ? "{$email['from_name']} <{$email['from']}>" 
            : $email['from'];
        
        $data = [
            'from' => $from,
            'to' => implode(',', $email['to']),
            'subject' => $email['subject'],
        ];
        
        if (!empty($email['cc'])) {
            $data['cc'] = implode(',', $email['cc']);
        }
        if (!empty($email['bcc'])) {
            $data['bcc'] = implode(',', $email['bcc']);
        }
        
        if ($email['template_id']) {
            $data['template'] = $email['template_id'];
            foreach ($email['template_data'] as $key => $value) {
                $data["v:{$key}"] = is_string($value) ? $value : json_encode($value);
            }
        } else {
            if ($email['body_text']) {
                $data['text'] = $email['body_text'];
            }
            if ($email['body_html']) {
                $data['html'] = $email['body_html'];
            }
        }
        
        $url = "https://api.mailgun.net/v3/{$domain}/messages";
        
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => $url,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => http_build_query($data),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => $this->defaultTimeout,
            CURLOPT_USERPWD => "api:{$apiKey}",
        ]);
        
        $response = curl_exec($ch);
        $statusCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);
        
        if ($error) {
            return ['success' => false, 'error' => $error];
        }
        
        $responseData = json_decode($response, true);
        
        return [
            'success' => $statusCode >= 200 && $statusCode < 300,
            'error' => $statusCode >= 300 ? ($responseData['message'] ?? 'Mailgun error') : null,
            'message_id' => $responseData['id'] ?? null,
        ];
    }
    
    /**
     * Send via Amazon SES
     */
    private function sendViaSes(array $email, ActionContext $context): array
    {
        // Simplified SES implementation - in production, use AWS SDK
        return ['success' => false, 'error' => 'AWS SES requires AWS SDK - not implemented in simplified version'];
    }
    
    /**
     * Send via Postmark
     */
    private function sendViaPostmark(array $email, ActionContext $context): array
    {
        $apiKey = $context->getProviderConfig('api_key');
        if (empty($apiKey)) {
            return ['success' => false, 'error' => 'Postmark API key not configured'];
        }
        
        $payload = [
            'From' => $email['from_name'] 
                ? "{$email['from_name']} <{$email['from']}>" 
                : $email['from'],
            'To' => implode(',', $email['to']),
            'Subject' => $email['subject'],
        ];
        
        if ($email['body_html']) {
            $payload['HtmlBody'] = $email['body_html'];
        }
        if ($email['body_text']) {
            $payload['TextBody'] = $email['body_text'];
        }
        if ($email['template_id']) {
            $payload['TemplateId'] = $email['template_id'];
            $payload['TemplateModel'] = $email['template_data'];
        }
        
        $result = $this->httpRequest('POST', 'https://api.postmarkapp.com/email', [
            'X-Postmark-Server-Token' => $apiKey,
            'Content-Type' => 'application/json',
            'Accept' => 'application/json',
        ], $payload, $this->defaultTimeout);
        
        $responseData = json_decode($result['body'] ?? '', true);
        
        return [
            'success' => $result['status_code'] >= 200 && $result['status_code'] < 300,
            'error' => $result['status_code'] >= 300 ? ($responseData['Message'] ?? 'Postmark error') : null,
            'message_id' => $responseData['MessageID'] ?? null,
        ];
    }
}
