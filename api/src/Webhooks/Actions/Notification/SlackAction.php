<?php
/**
 * NOMAD CMS - Slack Action
 * 
 * Sends messages to Slack via webhooks or Bolt API.
 */

declare(strict_types=1);

namespace NomadCMS\Webhooks\Actions\Notification;

use NomadCMS\Webhooks\Actions\BaseAction;
use NomadCMS\Webhooks\Actions\ActionContext;
use NomadCMS\Webhooks\Actions\ActionResult;

class SlackAction extends BaseAction
{
    protected bool $requiresProvider = true;
    protected ?string $requiredProvider = 'slack';
    protected int $defaultTimeout = 10;
    
    public function getType(): string
    {
        return 'send_slack';
    }
    
    public function getName(): string
    {
        return 'Slack Üzenet';
    }
    
    public function getDescription(): string
    {
        return 'Üzenet küldése Slack csatornába webhook vagy Bolt API-n keresztül';
    }
    
    public function getCategory(): string
    {
        return 'notification';
    }
    
    public function getIcon(): string
    {
        return '📢';
    }
    
    public function getConfigSchema(): array
    {
        return [
            'type' => 'object',
            'required' => [],
            'properties' => [
                'webhook_url' => [
                    'type' => 'string',
                    'title' => 'Webhook URL',
                    'description' => 'Slack incoming webhook URL',
                    'format' => 'uri',
                ],
                'channel' => [
                    'type' => 'string',
                    'title' => 'Csatorna',
                    'description' => 'Slack csatorna (pl. #general vagy C123456)',
                ],
                'text' => [
                    'type' => 'string',
                    'title' => 'Üzenet szöveg',
                    'description' => 'Egyszerű szöveges üzenet',
                ],
                'username' => [
                    'type' => 'string',
                    'title' => 'Bot felhasználónév',
                    'default' => 'NomadCMS',
                ],
                'icon_emoji' => [
                    'type' => 'string',
                    'title' => 'Icon emoji',
                    'description' => 'pl. :robot_face:',
                ],
                'icon_url' => [
                    'type' => 'string',
                    'title' => 'Icon URL',
                    'format' => 'uri',
                ],
                'attachments' => [
                    'type' => 'array',
                    'title' => 'Attachments (régi stílus)',
                    'items' => [
                        'type' => 'object',
                        'properties' => [
                            'fallback' => ['type' => 'string'],
                            'color' => ['type' => 'string'],
                            'pretext' => ['type' => 'string'],
                            'author_name' => ['type' => 'string'],
                            'author_link' => ['type' => 'string'],
                            'author_icon' => ['type' => 'string'],
                            'title' => ['type' => 'string'],
                            'title_link' => ['type' => 'string'],
                            'text' => ['type' => 'string'],
                            'fields' => [
                                'type' => 'array',
                                'items' => [
                                    'type' => 'object',
                                    'properties' => [
                                        'title' => ['type' => 'string'],
                                        'value' => ['type' => 'string'],
                                        'short' => ['type' => 'boolean'],
                                    ],
                                ],
                            ],
                            'thumb_url' => ['type' => 'string'],
                            'footer' => ['type' => 'string'],
                            'footer_icon' => ['type' => 'string'],
                            'ts' => ['type' => 'integer'],
                        ],
                    ],
                ],
                'blocks' => [
                    'type' => 'array',
                    'title' => 'Block Kit blokkok',
                    'description' => 'Modern Slack Block Kit formátum',
                    'items' => ['type' => 'object'],
                ],
                'unfurl_links' => [
                    'type' => 'boolean',
                    'title' => 'Link előnézet',
                    'default' => true,
                ],
                'unfurl_media' => [
                    'type' => 'boolean',
                    'title' => 'Média előnézet',
                    'default' => true,
                ],
                'thread_ts' => [
                    'type' => 'string',
                    'title' => 'Thread timestamp',
                    'description' => 'Válasz egy thread-be',
                ],
                'reply_broadcast' => [
                    'type' => 'boolean',
                    'title' => 'Thread válasz broadcast',
                    'default' => false,
                ],
            ],
        ];
    }
    
    public function getExpectedFields(): array
    {
        return ['text', 'title', 'color', 'fields', 'author_name'];
    }
    
    public function execute(ActionContext $context): ActionResult
    {
        $startTime = microtime(true);
        
        try {
            $config = $this->replaceConfigVariables($context->actionConfig, $context);
            
            // Determine how to send
            $webhookUrl = $config['webhook_url'] ?? $context->getProviderConfig('webhook_url');
            $botToken = $context->getProviderConfig('bot_token');
            $channel = $config['channel'] ?? $context->getProviderConfig('channel');
            
            if (empty($webhookUrl) && (empty($botToken) || empty($channel))) {
                return ActionResult::failure('Either webhook_url or bot_token+channel is required');
            }
            
            // Build message
            $payload = $this->buildPayload($config, $context);
            
            // Add channel for API method
            if (empty($webhookUrl) && !empty($channel)) {
                $payload['channel'] = $channel;
            }
            
            // Send message
            if (!empty($webhookUrl)) {
                $result = $this->sendViaWebhook($webhookUrl, $payload);
            } else {
                $result = $this->sendViaApi($botToken, $payload);
            }
            
            $executionTime = (int)((microtime(true) - $startTime) * 1000);
            
            if ($result['success']) {
                return new ActionResult(
                    success: true,
                    data: $result['data'] ?? null,
                    statusCode: $result['status_code'],
                    executionTimeMs: $executionTime
                );
            }
            
            return ActionResult::failure($result['error'] ?? 'Unknown Slack error', $result['status_code']);
            
        } catch (\Exception $e) {
            $this->log('Slack send failed', ['error' => $e->getMessage()]);
            return ActionResult::failure($e->getMessage());
        }
    }
    
    /**
     * Build Slack message payload
     */
    private function buildPayload(array $config, ActionContext $context): array
    {
        $payload = [];
        
        // Basic fields
        if (!empty($config['username'])) {
            $payload['username'] = $config['username'];
        }
        if (!empty($config['icon_emoji'])) {
            $payload['icon_emoji'] = $config['icon_emoji'];
        }
        if (!empty($config['icon_url'])) {
            $payload['icon_url'] = $config['icon_url'];
        }
        
        // Threading
        if (!empty($config['thread_ts'])) {
            $payload['thread_ts'] = $config['thread_ts'];
            if (!empty($config['reply_broadcast'])) {
                $payload['reply_broadcast'] = true;
            }
        }
        
        // Unfurl options
        $payload['unfurl_links'] = $config['unfurl_links'] ?? true;
        $payload['unfurl_media'] = $config['unfurl_media'] ?? true;
        
        // Check for Block Kit blocks
        if (!empty($config['blocks'])) {
            $payload['blocks'] = $config['blocks'];
        }
        
        // Check for attachments
        if (!empty($config['attachments'])) {
            $payload['attachments'] = $config['attachments'];
        }
        
        // Use mapped payload to build message if no blocks/attachments
        if (empty($payload['blocks']) && empty($payload['attachments'])) {
            $mapped = $context->mappedPayload;
            
            if (!empty($mapped)) {
                // Try to build an attachment from mapped data
                $attachment = [];
                
                if (isset($mapped['title'])) {
                    $attachment['title'] = $mapped['title'];
                }
                if (isset($mapped['title_link']) || isset($mapped['url'])) {
                    $attachment['title_link'] = $mapped['title_link'] ?? $mapped['url'];
                }
                if (isset($mapped['text']) || isset($mapped['description'])) {
                    $attachment['text'] = $mapped['text'] ?? $mapped['description'];
                }
                if (isset($mapped['color'])) {
                    $attachment['color'] = $this->normalizeColor($mapped['color']);
                }
                if (isset($mapped['author_name'])) {
                    $attachment['author_name'] = $mapped['author_name'];
                }
                if (isset($mapped['author_link'])) {
                    $attachment['author_link'] = $mapped['author_link'];
                }
                if (isset($mapped['author_icon'])) {
                    $attachment['author_icon'] = $mapped['author_icon'];
                }
                if (isset($mapped['thumb_url']) || isset($mapped['image'])) {
                    $attachment['thumb_url'] = $mapped['thumb_url'] ?? $mapped['image'];
                }
                if (isset($mapped['footer'])) {
                    $attachment['footer'] = $mapped['footer'];
                }
                if (isset($mapped['fields']) && is_array($mapped['fields'])) {
                    $attachment['fields'] = $mapped['fields'];
                }
                
                $attachment['ts'] = time();
                $attachment['fallback'] = $attachment['title'] ?? $attachment['text'] ?? 'Webhook notification';
                
                if (!empty($attachment)) {
                    $payload['attachments'] = [$attachment];
                }
            }
        }
        
        // Text fallback
        $text = $config['text'] ?? '';
        if (empty($text) && !empty($context->mappedPayload['message'])) {
            $text = $context->mappedPayload['message'];
        }
        if (!empty($text)) {
            $payload['text'] = $text;
        }
        
        return $payload;
    }
    
    /**
     * Send via Slack incoming webhook
     */
    private function sendViaWebhook(string $url, array $payload): array
    {
        $result = $this->httpRequest('POST', $url, [
            'Content-Type' => 'application/json',
        ], $payload, $this->defaultTimeout);
        
        // Slack webhook returns "ok" as body on success
        if ($result['success'] && $result['body'] === 'ok') {
            $result['data'] = ['ok' => true];
        }
        
        return $result;
    }
    
    /**
     * Send via Slack Web API (chat.postMessage)
     */
    private function sendViaApi(string $token, array $payload): array
    {
        $url = 'https://slack.com/api/chat.postMessage';
        
        $result = $this->httpRequest('POST', $url, [
            'Authorization' => "Bearer {$token}",
            'Content-Type' => 'application/json',
        ], $payload, $this->defaultTimeout);
        
        if ($result['success'] && !empty($result['body'])) {
            $data = json_decode($result['body'], true);
            if ($data && isset($data['ok'])) {
                $result['success'] = $data['ok'];
                $result['data'] = $data;
                if (!$data['ok']) {
                    $result['error'] = $data['error'] ?? 'Unknown Slack API error';
                }
            }
        }
        
        return $result;
    }
    
    /**
     * Normalize color value for Slack
     */
    private function normalizeColor(string $color): string
    {
        // Named colors
        $colors = [
            'good' => 'good',
            'warning' => 'warning',
            'danger' => 'danger',
            'success' => '#36a64f',
            'error' => '#dc3545',
            'info' => '#17a2b8',
        ];
        
        if (isset($colors[strtolower($color)])) {
            return $colors[strtolower($color)];
        }
        
        // Ensure hex format
        if (!str_starts_with($color, '#')) {
            $color = '#' . $color;
        }
        
        return $color;
    }
}
