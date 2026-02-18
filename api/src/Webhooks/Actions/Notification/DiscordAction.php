<?php
/**
 * NOMAD CMS - Discord Action
 * 
 * Sends messages to Discord via webhooks or bot API.
 */

declare(strict_types=1);

namespace NomadCMS\Webhooks\Actions\Notification;

use NomadCMS\Webhooks\Actions\BaseAction;
use NomadCMS\Webhooks\Actions\ActionContext;
use NomadCMS\Webhooks\Actions\ActionResult;

class DiscordAction extends BaseAction
{
    protected bool $requiresProvider = true;
    protected ?string $requiredProvider = 'discord';
    protected int $defaultTimeout = 10;
    
    public function getType(): string
    {
        return 'send_discord';
    }
    
    public function getName(): string
    {
        return 'Discord Üzenet';
    }
    
    public function getDescription(): string
    {
        return 'Üzenet küldése Discord csatornába webhook vagy bot API-n keresztül';
    }
    
    public function getCategory(): string
    {
        return 'notification';
    }
    
    public function getIcon(): string
    {
        return '💬';
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
                    'description' => 'Discord webhook URL (ha nincs provider config)',
                    'format' => 'uri',
                ],
                'channel_id' => [
                    'type' => 'string',
                    'title' => 'Csatorna ID',
                    'description' => 'Discord csatorna ID (bot API-hoz)',
                ],
                'message_type' => [
                    'type' => 'string',
                    'title' => 'Üzenet típus',
                    'enum' => ['text', 'embed'],
                    'default' => 'text',
                ],
                'content' => [
                    'type' => 'string',
                    'title' => 'Üzenet szöveg',
                    'description' => 'Egyszerű szöveges üzenet',
                    'maxLength' => 2000,
                ],
                'username' => [
                    'type' => 'string',
                    'title' => 'Webhook felhasználónév',
                    'description' => 'Egyéni név a webhookhoz',
                ],
                'avatar_url' => [
                    'type' => 'string',
                    'title' => 'Avatar URL',
                    'format' => 'uri',
                ],
                'embed' => [
                    'type' => 'object',
                    'title' => 'Embed konfiguráció',
                    'properties' => [
                        'title' => ['type' => 'string', 'maxLength' => 256],
                        'description' => ['type' => 'string', 'maxLength' => 4096],
                        'url' => ['type' => 'string', 'format' => 'uri'],
                        'color' => ['type' => 'string', 'description' => 'Hex szín (pl. #00ff00 vagy 65280)'],
                        'timestamp' => ['type' => 'string', 'description' => 'ISO8601 timestamp'],
                        'footer' => [
                            'type' => 'object',
                            'properties' => [
                                'text' => ['type' => 'string'],
                                'icon_url' => ['type' => 'string'],
                            ],
                        ],
                        'thumbnail' => [
                            'type' => 'object',
                            'properties' => [
                                'url' => ['type' => 'string'],
                            ],
                        ],
                        'image' => [
                            'type' => 'object',
                            'properties' => [
                                'url' => ['type' => 'string'],
                            ],
                        ],
                        'author' => [
                            'type' => 'object',
                            'properties' => [
                                'name' => ['type' => 'string'],
                                'url' => ['type' => 'string'],
                                'icon_url' => ['type' => 'string'],
                            ],
                        ],
                        'fields' => [
                            'type' => 'array',
                            'items' => [
                                'type' => 'object',
                                'properties' => [
                                    'name' => ['type' => 'string'],
                                    'value' => ['type' => 'string'],
                                    'inline' => ['type' => 'boolean'],
                                ],
                            ],
                        ],
                    ],
                ],
                'thread_id' => [
                    'type' => 'string',
                    'title' => 'Thread ID',
                    'description' => 'Küldés egy thread-be',
                ],
            ],
        ];
    }
    
    public function getExpectedFields(): array
    {
        return ['title', 'description', 'url', 'author', 'color', 'fields'];
    }
    
    public function execute(ActionContext $context): ActionResult
    {
        $startTime = microtime(true);
        
        try {
            $config = $this->replaceConfigVariables($context->actionConfig, $context);
            
            // Determine how to send (webhook URL or bot API)
            $webhookUrl = $config['webhook_url'] ?? $context->getProviderConfig('webhook_url');
            $botToken = $context->getProviderConfig('bot_token');
            $channelId = $config['channel_id'] ?? $context->getProviderConfig('channel_id');
            
            if (empty($webhookUrl) && (empty($botToken) || empty($channelId))) {
                return ActionResult::failure('Either webhook_url or bot_token+channel_id is required');
            }
            
            // Build message
            $messageType = $config['message_type'] ?? 'text';
            $payload = $this->buildPayload($config, $messageType, $context);
            
            // Send message
            if (!empty($webhookUrl)) {
                $result = $this->sendViaWebhook($webhookUrl, $payload, $config['thread_id'] ?? null);
            } else {
                $result = $this->sendViaBot($botToken, $channelId, $payload);
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
            
            return ActionResult::failure($result['error'] ?? 'Unknown Discord error', $result['status_code']);
            
        } catch (\Exception $e) {
            $this->log('Discord send failed', ['error' => $e->getMessage()]);
            return ActionResult::failure($e->getMessage());
        }
    }
    
    /**
     * Build Discord message payload
     */
    private function buildPayload(array $config, string $messageType, ActionContext $context): array
    {
        $payload = [];
        
        // Username and avatar
        if (!empty($config['username'])) {
            $payload['username'] = $config['username'];
        }
        if (!empty($config['avatar_url'])) {
            $payload['avatar_url'] = $config['avatar_url'];
        }
        
        if ($messageType === 'embed') {
            $embed = $config['embed'] ?? [];
            
            // Use mapped payload for embed if available
            if (!empty($context->mappedPayload)) {
                $embed = array_merge($embed, $context->mappedPayload);
            }
            
            // Convert color to integer
            if (isset($embed['color'])) {
                $embed['color'] = $this->parseColor($embed['color']);
            }
            
            // Add timestamp if not set
            if (!isset($embed['timestamp'])) {
                $embed['timestamp'] = date('c');
            }
            
            $payload['embeds'] = [$embed];
        } else {
            // Simple text message
            $content = $config['content'] ?? '';
            
            // If no content configured, use mapped payload as message
            if (empty($content) && !empty($context->mappedPayload)) {
                if (isset($context->mappedPayload['content'])) {
                    $content = $context->mappedPayload['content'];
                } elseif (isset($context->mappedPayload['message'])) {
                    $content = $context->mappedPayload['message'];
                } else {
                    $content = json_encode($context->mappedPayload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
                }
            }
            
            $payload['content'] = substr($content, 0, 2000);
        }
        
        return $payload;
    }
    
    /**
     * Send via Discord webhook
     */
    private function sendViaWebhook(string $url, array $payload, ?string $threadId): array
    {
        if ($threadId) {
            $url .= (str_contains($url, '?') ? '&' : '?') . 'thread_id=' . $threadId;
        }
        
        return $this->httpRequest('POST', $url, [
            'Content-Type' => 'application/json',
        ], $payload, $this->defaultTimeout);
    }
    
    /**
     * Send via Discord Bot API
     */
    private function sendViaBot(string $token, string $channelId, array $payload): array
    {
        $url = "https://discord.com/api/v10/channels/{$channelId}/messages";
        
        return $this->httpRequest('POST', $url, [
            'Authorization' => "Bot {$token}",
            'Content-Type' => 'application/json',
        ], $payload, $this->defaultTimeout);
    }
    
    /**
     * Parse color value to integer
     */
    private function parseColor(mixed $color): int
    {
        if (is_int($color)) {
            return $color;
        }
        
        if (is_string($color)) {
            // Hex color
            if (str_starts_with($color, '#')) {
                return hexdec(substr($color, 1));
            }
            if (str_starts_with($color, '0x')) {
                return hexdec($color);
            }
            if (is_numeric($color)) {
                return (int)$color;
            }
            
            // Named colors
            $colors = [
                'red' => 0xFF0000,
                'green' => 0x00FF00,
                'blue' => 0x0000FF,
                'yellow' => 0xFFFF00,
                'orange' => 0xFFA500,
                'purple' => 0x800080,
                'pink' => 0xFFC0CB,
                'white' => 0xFFFFFF,
                'black' => 0x000000,
                'gray' => 0x808080,
                'success' => 0x57F287,
                'warning' => 0xFEE75C,
                'error' => 0xED4245,
                'info' => 0x5865F2,
            ];
            
            return $colors[strtolower($color)] ?? 0x5865F2;
        }
        
        return 0x5865F2; // Discord blurple
    }
}
