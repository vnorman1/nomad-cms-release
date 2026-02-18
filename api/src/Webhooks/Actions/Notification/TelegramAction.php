<?php
/**
 * NOMAD CMS - Telegram Action
 * 
 * Sends messages via Telegram Bot API
 */

declare(strict_types=1);

namespace NomadCMS\Webhooks\Actions\Notification;

use NomadCMS\Webhooks\Actions\BaseAction;
use NomadCMS\Webhooks\Actions\ActionContext;
use NomadCMS\Webhooks\Actions\ActionResult;

class TelegramAction extends BaseAction
{
    protected bool $requiresProvider = true;
    protected ?string $requiredProvider = 'telegram';
    protected int $defaultTimeout = 10;
    
    private const API_BASE = 'https://api.telegram.org/bot';
    
    public function getType(): string
    {
        return 'send_telegram';
    }
    
    public function getName(): string
    {
        return 'Telegram Üzenet';
    }
    
    public function getDescription(): string
    {
        return 'Üzenet küldése Telegram Bot API-n keresztül';
    }
    
    public function getCategory(): string
    {
        return 'notification';
    }
    
    public function getIcon(): string
    {
        return '✈️';
    }
    
    public function getConfigSchema(): array
    {
        return [
            'type' => 'object',
            'required' => ['chat_id'],
            'properties' => [
                'chat_id' => [
                    'type' => 'string',
                    'title' => 'Chat/Channel ID',
                    'description' => 'Telegram chat ID vagy @channel_username',
                ],
                'message_type' => [
                    'type' => 'string',
                    'title' => 'Üzenet típusa',
                    'enum' => ['text', 'photo', 'document', 'video', 'audio', 'location', 'sticker'],
                    'default' => 'text',
                ],
                'text' => [
                    'type' => 'string',
                    'title' => 'Üzenet szövege',
                    'description' => 'Támogatja a változókat: {{payload.field}}',
                ],
                'parse_mode' => [
                    'type' => 'string',
                    'title' => 'Formázás',
                    'enum' => ['HTML', 'Markdown', 'MarkdownV2'],
                    'default' => 'HTML',
                ],
                'disable_notification' => [
                    'type' => 'boolean',
                    'title' => 'Csend mód',
                    'default' => false,
                ],
                'disable_web_page_preview' => [
                    'type' => 'boolean',
                    'title' => 'Link előnézet kikapcsolása',
                    'default' => false,
                ],
                'protect_content' => [
                    'type' => 'boolean',
                    'title' => 'Védett tartalom',
                    'description' => 'Nem továbbítható és nem menthető',
                    'default' => false,
                ],
                'reply_to_message_id' => [
                    'type' => 'integer',
                    'title' => 'Válasz erre az üzenetre',
                ],
                'photo_url' => [
                    'type' => 'string',
                    'title' => 'Kép URL',
                    'description' => 'photo típusú üzenethez',
                ],
                'document_url' => [
                    'type' => 'string',
                    'title' => 'Dokumentum URL',
                ],
                'video_url' => [
                    'type' => 'string',
                    'title' => 'Videó URL',
                ],
                'audio_url' => [
                    'type' => 'string',
                    'title' => 'Hang URL',
                ],
                'caption' => [
                    'type' => 'string',
                    'title' => 'Média felirat',
                    'maxLength' => 1024,
                ],
                'latitude' => [
                    'type' => 'number',
                    'title' => 'Szélesség',
                    'description' => 'location típusú üzenethez',
                ],
                'longitude' => [
                    'type' => 'number',
                    'title' => 'Hosszúság',
                ],
                'sticker_id' => [
                    'type' => 'string',
                    'title' => 'Sticker file_id',
                ],
                'inline_keyboard' => [
                    'type' => 'array',
                    'title' => 'Inline gombok',
                    'items' => [
                        'type' => 'array',
                        'items' => [
                            'type' => 'object',
                            'properties' => [
                                'text' => ['type' => 'string'],
                                'url' => ['type' => 'string'],
                                'callback_data' => ['type' => 'string'],
                            ],
                        ],
                    ],
                ],
            ],
        ];
    }
    
    public function getExpectedFields(): array
    {
        return ['text', 'title', 'message', 'url', 'image'];
    }
    
    public function execute(ActionContext $context): ActionResult
    {
        $startTime = microtime(true);
        
        try {
            $config = $this->replaceConfigVariables($context->actionConfig, $context);
            
            $botToken = $context->getProviderConfig('bot_token');
            if (empty($botToken)) {
                return ActionResult::failure('Telegram bot token not configured');
            }
            
            $chatId = $config['chat_id'] ?? $context->getProviderConfig('default_chat_id');
            if (empty($chatId)) {
                return ActionResult::failure('Chat ID is required');
            }
            
            $messageType = $config['message_type'] ?? 'text';
            
            $result = match ($messageType) {
                'photo' => $this->sendPhoto($botToken, $chatId, $config, $context),
                'document' => $this->sendDocument($botToken, $chatId, $config, $context),
                'video' => $this->sendVideo($botToken, $chatId, $config, $context),
                'audio' => $this->sendAudio($botToken, $chatId, $config, $context),
                'location' => $this->sendLocation($botToken, $chatId, $config, $context),
                'sticker' => $this->sendSticker($botToken, $chatId, $config, $context),
                default => $this->sendMessage($botToken, $chatId, $config, $context),
            };
            
            $executionTime = (int)((microtime(true) - $startTime) * 1000);
            
            if ($result['success']) {
                return new ActionResult(
                    success: true,
                    data: [
                        'message_id' => $result['message_id'] ?? null,
                        'chat_id' => $chatId,
                        'message_type' => $messageType,
                    ],
                    statusCode: 200,
                    executionTimeMs: $executionTime
                );
            }
            
            return ActionResult::failure($result['error'] ?? 'Failed to send Telegram message');
            
        } catch (\Exception $e) {
            $this->log('Telegram send failed', ['error' => $e->getMessage()]);
            return ActionResult::failure($e->getMessage());
        }
    }
    
    /**
     * Send text message
     */
    private function sendMessage(string $botToken, string $chatId, array $config, ActionContext $context): array
    {
        $text = $config['text'] ?? $context->mappedPayload['text'] ?? $context->mappedPayload['message'] ?? null;
        
        // Build text from mapped payload if not provided
        if (empty($text)) {
            $text = $this->buildDefaultMessage($context);
        }
        
        if (empty($text)) {
            return ['success' => false, 'error' => 'Message text is required'];
        }
        
        $payload = [
            'chat_id' => $chatId,
            'text' => $text,
            'parse_mode' => $config['parse_mode'] ?? 'HTML',
        ];
        
        if (!empty($config['disable_notification'])) {
            $payload['disable_notification'] = true;
        }
        if (!empty($config['disable_web_page_preview'])) {
            $payload['disable_web_page_preview'] = true;
        }
        if (!empty($config['protect_content'])) {
            $payload['protect_content'] = true;
        }
        if (!empty($config['reply_to_message_id'])) {
            $payload['reply_to_message_id'] = (int)$config['reply_to_message_id'];
        }
        
        // Add inline keyboard if specified
        if (!empty($config['inline_keyboard'])) {
            $payload['reply_markup'] = json_encode([
                'inline_keyboard' => $config['inline_keyboard'],
            ]);
        }
        
        return $this->apiCall($botToken, 'sendMessage', $payload);
    }
    
    /**
     * Send photo
     */
    private function sendPhoto(string $botToken, string $chatId, array $config, ActionContext $context): array
    {
        $photoUrl = $config['photo_url'] ?? $context->mappedPayload['image'] ?? $context->mappedPayload['url'] ?? null;
        
        if (empty($photoUrl)) {
            return ['success' => false, 'error' => 'Photo URL is required'];
        }
        
        $payload = [
            'chat_id' => $chatId,
            'photo' => $photoUrl,
        ];
        
        if (!empty($config['caption'])) {
            $payload['caption'] = $config['caption'];
            $payload['parse_mode'] = $config['parse_mode'] ?? 'HTML';
        }
        
        $this->addCommonOptions($payload, $config);
        
        return $this->apiCall($botToken, 'sendPhoto', $payload);
    }
    
    /**
     * Send document
     */
    private function sendDocument(string $botToken, string $chatId, array $config, ActionContext $context): array
    {
        $documentUrl = $config['document_url'] ?? $context->mappedPayload['url'] ?? null;
        
        if (empty($documentUrl)) {
            return ['success' => false, 'error' => 'Document URL is required'];
        }
        
        $payload = [
            'chat_id' => $chatId,
            'document' => $documentUrl,
        ];
        
        if (!empty($config['caption'])) {
            $payload['caption'] = $config['caption'];
            $payload['parse_mode'] = $config['parse_mode'] ?? 'HTML';
        }
        
        $this->addCommonOptions($payload, $config);
        
        return $this->apiCall($botToken, 'sendDocument', $payload);
    }
    
    /**
     * Send video
     */
    private function sendVideo(string $botToken, string $chatId, array $config, ActionContext $context): array
    {
        $videoUrl = $config['video_url'] ?? $context->mappedPayload['url'] ?? null;
        
        if (empty($videoUrl)) {
            return ['success' => false, 'error' => 'Video URL is required'];
        }
        
        $payload = [
            'chat_id' => $chatId,
            'video' => $videoUrl,
        ];
        
        if (!empty($config['caption'])) {
            $payload['caption'] = $config['caption'];
            $payload['parse_mode'] = $config['parse_mode'] ?? 'HTML';
        }
        
        $this->addCommonOptions($payload, $config);
        
        return $this->apiCall($botToken, 'sendVideo', $payload);
    }
    
    /**
     * Send audio
     */
    private function sendAudio(string $botToken, string $chatId, array $config, ActionContext $context): array
    {
        $audioUrl = $config['audio_url'] ?? $context->mappedPayload['url'] ?? null;
        
        if (empty($audioUrl)) {
            return ['success' => false, 'error' => 'Audio URL is required'];
        }
        
        $payload = [
            'chat_id' => $chatId,
            'audio' => $audioUrl,
        ];
        
        if (!empty($config['caption'])) {
            $payload['caption'] = $config['caption'];
            $payload['parse_mode'] = $config['parse_mode'] ?? 'HTML';
        }
        
        $this->addCommonOptions($payload, $config);
        
        return $this->apiCall($botToken, 'sendAudio', $payload);
    }
    
    /**
     * Send location
     */
    private function sendLocation(string $botToken, string $chatId, array $config, ActionContext $context): array
    {
        $lat = $config['latitude'] ?? $context->mappedPayload['latitude'] ?? $context->mappedPayload['lat'] ?? null;
        $lon = $config['longitude'] ?? $context->mappedPayload['longitude'] ?? $context->mappedPayload['lon'] ?? null;
        
        if ($lat === null || $lon === null) {
            return ['success' => false, 'error' => 'Latitude and longitude are required'];
        }
        
        $payload = [
            'chat_id' => $chatId,
            'latitude' => (float)$lat,
            'longitude' => (float)$lon,
        ];
        
        $this->addCommonOptions($payload, $config);
        
        return $this->apiCall($botToken, 'sendLocation', $payload);
    }
    
    /**
     * Send sticker
     */
    private function sendSticker(string $botToken, string $chatId, array $config, ActionContext $context): array
    {
        $stickerId = $config['sticker_id'] ?? $context->mappedPayload['sticker_id'] ?? null;
        
        if (empty($stickerId)) {
            return ['success' => false, 'error' => 'Sticker ID is required'];
        }
        
        $payload = [
            'chat_id' => $chatId,
            'sticker' => $stickerId,
        ];
        
        $this->addCommonOptions($payload, $config);
        
        return $this->apiCall($botToken, 'sendSticker', $payload);
    }
    
    /**
     * Add common options to payload
     */
    private function addCommonOptions(array &$payload, array $config): void
    {
        if (!empty($config['disable_notification'])) {
            $payload['disable_notification'] = true;
        }
        if (!empty($config['protect_content'])) {
            $payload['protect_content'] = true;
        }
        if (!empty($config['reply_to_message_id'])) {
            $payload['reply_to_message_id'] = (int)$config['reply_to_message_id'];
        }
        if (!empty($config['inline_keyboard'])) {
            $payload['reply_markup'] = json_encode([
                'inline_keyboard' => $config['inline_keyboard'],
            ]);
        }
    }
    
    /**
     * Make Telegram API call
     */
    private function apiCall(string $botToken, string $method, array $payload): array
    {
        $url = self::API_BASE . $botToken . '/' . $method;
        
        $result = $this->httpRequest('POST', $url, [
            'Content-Type' => 'application/json',
        ], $payload, $this->defaultTimeout);
        
        if (!empty($result['error'])) {
            return ['success' => false, 'error' => $result['error']];
        }
        
        $responseData = json_decode($result['body'] ?? '', true);
        
        if (empty($responseData['ok'])) {
            return [
                'success' => false,
                'error' => $responseData['description'] ?? 'Telegram API error',
            ];
        }
        
        return [
            'success' => true,
            'message_id' => $responseData['result']['message_id'] ?? null,
            'data' => $responseData['result'] ?? null,
        ];
    }
    
    /**
     * Build default message from mapped payload
     */
    private function buildDefaultMessage(ActionContext $context): string
    {
        $payload = $context->mappedPayload;
        
        if (empty($payload)) {
            return '';
        }
        
        $parts = [];
        
        if (!empty($payload['title'])) {
            $parts[] = "<b>" . htmlspecialchars($payload['title']) . "</b>";
        }
        
        if (!empty($payload['message'])) {
            $parts[] = htmlspecialchars($payload['message']);
        }
        
        if (!empty($payload['description'])) {
            $parts[] = htmlspecialchars($payload['description']);
        }
        
        if (!empty($payload['url'])) {
            $parts[] = "\n🔗 <a href=\"" . htmlspecialchars($payload['url']) . "\">Link</a>";
        }
        
        return implode("\n\n", $parts);
    }
    
    /**
     * Get provider configuration schema
     */
    public static function getProviderSchema(): array
    {
        return [
            'type' => 'object',
            'required' => ['bot_token'],
            'properties' => [
                'bot_token' => [
                    'type' => 'string',
                    'title' => 'Bot Token',
                    'description' => 'Get it from @BotFather',
                    'encrypted' => true,
                ],
                'default_chat_id' => [
                    'type' => 'string',
                    'title' => 'Alapértelmezett Chat ID',
                    'description' => 'Chat/Channel ID ha nincs megadva az akcióban',
                ],
            ],
        ];
    }
}
