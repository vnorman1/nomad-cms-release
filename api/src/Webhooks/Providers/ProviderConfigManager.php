<?php
/**
 * NOMAD CMS - Webhook Provider Configurations
 * 
 * Default provider schemas and seed configurations for notification services.
 * These define the structure for Discord, Slack, Telegram, Email, and other providers.
 */

declare(strict_types=1);

namespace NomadCMS\Webhooks\Providers;

/**
 * Provider Configuration Manager
 * 
 * Handles provider schema definitions and default configurations
 */
class ProviderConfigManager
{
    /**
     * Get all provider type definitions with their schemas
     */
    public static function getProviderSchemas(): array
    {
        return [
            'discord' => self::getDiscordSchema(),
            'slack' => self::getSlackSchema(),
            'telegram' => self::getTelegramSchema(),
            'email_smtp' => self::getEmailSmtpSchema(),
            'email_sendgrid' => self::getEmailSendgridSchema(),
            'email_mailgun' => self::getEmailMailgunSchema(),
            'email_ses' => self::getEmailSesSchema(),
            'email_postmark' => self::getEmailPostmarkSchema(),
            'http' => self::getHttpSchema(),
            'ssg' => self::getSsgSchema(),
            'cache_cloudflare' => self::getCacheCloudflareSchema(),
            'cache_fastly' => self::getCacheFastlySchema(),
            'cache_bunny' => self::getCacheBunnySchema(),
        ];
    }
    
    /**
     * Get schema for a specific provider type
     */
    public static function getProviderSchema(string $type): ?array
    {
        return self::getProviderSchemas()[$type] ?? null;
    }
    
    /**
     * Validate config against provider schema
     */
    public static function validateProviderConfig(string $type, array $config): array
    {
        $schema = self::getProviderSchema($type);
        
        if (!$schema) {
            return ['valid' => false, 'errors' => ["Unknown provider type: {$type}"]];
        }
        
        $errors = [];
        
        foreach ($schema['required'] ?? [] as $field) {
            if (empty($config[$field])) {
                $errors[] = "Missing required field: {$field}";
            }
        }
        
        foreach ($config as $field => $value) {
            if (isset($schema['fields'][$field])) {
                $fieldSchema = $schema['fields'][$field];
                
                // Type validation
                $expectedType = $fieldSchema['type'] ?? 'string';
                $actualType = gettype($value);
                
                if ($expectedType === 'string' && !is_string($value) && !is_numeric($value)) {
                    $errors[] = "Field {$field} must be a string";
                } elseif ($expectedType === 'integer' && !is_int($value)) {
                    $errors[] = "Field {$field} must be an integer";
                } elseif ($expectedType === 'boolean' && !is_bool($value)) {
                    $errors[] = "Field {$field} must be a boolean";
                } elseif ($expectedType === 'array' && !is_array($value)) {
                    $errors[] = "Field {$field} must be an array";
                }
                
                // Enum validation
                if (isset($fieldSchema['enum']) && !in_array($value, $fieldSchema['enum'])) {
                    $errors[] = "Field {$field} must be one of: " . implode(', ', $fieldSchema['enum']);
                }
            }
        }
        
        return [
            'valid' => empty($errors),
            'errors' => $errors,
        ];
    }
    
    // ==========================================
    // DISCORD PROVIDER
    // ==========================================
    
    private static function getDiscordSchema(): array
    {
        return [
            'name' => 'Discord',
            'description' => 'Discord webhook and bot API integration',
            'icon' => 'discord',
            'documentation' => 'https://discord.com/developers/docs/resources/webhook',
            'required' => [], // At least one of webhook_url or bot_token
            'sensitive_fields' => ['webhook_url', 'bot_token'],
            'fields' => [
                'webhook_url' => [
                    'type' => 'string',
                    'label' => 'Webhook URL',
                    'description' => 'Discord webhook URL for sending messages',
                    'placeholder' => 'https://discord.com/api/webhooks/...',
                    'sensitive' => true,
                ],
                'bot_token' => [
                    'type' => 'string',
                    'label' => 'Bot Token',
                    'description' => 'Discord bot token for advanced API access',
                    'placeholder' => 'Bot token from Discord Developer Portal',
                    'sensitive' => true,
                ],
                'default_channel_id' => [
                    'type' => 'string',
                    'label' => 'Default Channel ID',
                    'description' => 'Default Discord channel ID for bot messages',
                    'placeholder' => '123456789012345678',
                ],
                'username' => [
                    'type' => 'string',
                    'label' => 'Default Username',
                    'description' => 'Override webhook username',
                    'default' => 'NOMAD CMS',
                ],
                'avatar_url' => [
                    'type' => 'string',
                    'label' => 'Avatar URL',
                    'description' => 'Override webhook avatar image',
                ],
            ],
            'examples' => [
                'webhook' => [
                    'name' => 'Discord Webhook',
                    'config' => [
                        'webhook_url' => 'https://discord.com/api/webhooks/xxx/xxx',
                        'username' => 'CMS Notifications',
                    ],
                ],
                'bot' => [
                    'name' => 'Discord Bot',
                    'config' => [
                        'bot_token' => 'your-bot-token',
                        'default_channel_id' => '123456789012345678',
                    ],
                ],
            ],
        ];
    }
    
    // ==========================================
    // SLACK PROVIDER
    // ==========================================
    
    private static function getSlackSchema(): array
    {
        return [
            'name' => 'Slack',
            'description' => 'Slack incoming webhooks and Web API integration',
            'icon' => 'slack',
            'documentation' => 'https://api.slack.com/messaging/webhooks',
            'required' => [],
            'sensitive_fields' => ['webhook_url', 'bot_token'],
            'fields' => [
                'webhook_url' => [
                    'type' => 'string',
                    'label' => 'Webhook URL',
                    'description' => 'Slack incoming webhook URL',
                    'placeholder' => 'https://hooks.slack.com/services/...',
                    'sensitive' => true,
                ],
                'bot_token' => [
                    'type' => 'string',
                    'label' => 'Bot Token',
                    'description' => 'Slack bot OAuth token for Web API access',
                    'placeholder' => 'xoxb-...',
                    'sensitive' => true,
                ],
                'default_channel' => [
                    'type' => 'string',
                    'label' => 'Default Channel',
                    'description' => 'Default channel for bot messages',
                    'placeholder' => '#general or C1234567890',
                ],
                'username' => [
                    'type' => 'string',
                    'label' => 'Default Username',
                    'description' => 'Override webhook username',
                    'default' => 'NOMAD CMS',
                ],
                'icon_emoji' => [
                    'type' => 'string',
                    'label' => 'Icon Emoji',
                    'description' => 'Override webhook icon with emoji',
                    'placeholder' => ':robot_face:',
                ],
                'icon_url' => [
                    'type' => 'string',
                    'label' => 'Icon URL',
                    'description' => 'Override webhook icon with image URL',
                ],
            ],
            'examples' => [
                'webhook' => [
                    'name' => 'Slack Webhook',
                    'config' => [
                        'webhook_url' => 'https://hooks.slack.com/services/xxx/xxx/xxx',
                        'username' => 'CMS Bot',
                        'icon_emoji' => ':page_facing_up:',
                    ],
                ],
                'bot' => [
                    'name' => 'Slack Bot',
                    'config' => [
                        'bot_token' => 'xoxb-your-token',
                        'default_channel' => '#cms-notifications',
                    ],
                ],
            ],
        ];
    }
    
    // ==========================================
    // TELEGRAM PROVIDER
    // ==========================================
    
    private static function getTelegramSchema(): array
    {
        return [
            'name' => 'Telegram',
            'description' => 'Telegram Bot API integration',
            'icon' => 'telegram',
            'documentation' => 'https://core.telegram.org/bots/api',
            'required' => ['bot_token'],
            'sensitive_fields' => ['bot_token'],
            'fields' => [
                'bot_token' => [
                    'type' => 'string',
                    'label' => 'Bot Token',
                    'description' => 'Telegram bot token from @BotFather',
                    'placeholder' => '123456789:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
                    'sensitive' => true,
                ],
                'default_chat_id' => [
                    'type' => 'string',
                    'label' => 'Default Chat ID',
                    'description' => 'Default chat/group/channel ID for messages',
                    'placeholder' => '-1001234567890 or @channelname',
                ],
                'parse_mode' => [
                    'type' => 'string',
                    'label' => 'Parse Mode',
                    'description' => 'Default message formatting mode',
                    'enum' => ['HTML', 'Markdown', 'MarkdownV2'],
                    'default' => 'HTML',
                ],
                'disable_notification' => [
                    'type' => 'boolean',
                    'label' => 'Silent Messages',
                    'description' => 'Send messages silently by default',
                    'default' => false,
                ],
                'disable_web_page_preview' => [
                    'type' => 'boolean',
                    'label' => 'Disable Link Preview',
                    'description' => 'Disable link previews by default',
                    'default' => false,
                ],
            ],
            'examples' => [
                'channel' => [
                    'name' => 'Telegram Channel',
                    'config' => [
                        'bot_token' => 'your-bot-token',
                        'default_chat_id' => '@your_channel',
                        'parse_mode' => 'HTML',
                    ],
                ],
                'group' => [
                    'name' => 'Telegram Group',
                    'config' => [
                        'bot_token' => 'your-bot-token',
                        'default_chat_id' => '-1001234567890',
                        'parse_mode' => 'Markdown',
                        'disable_notification' => true,
                    ],
                ],
            ],
        ];
    }
    
    // ==========================================
    // EMAIL PROVIDERS
    // ==========================================
    
    private static function getEmailSmtpSchema(): array
    {
        return [
            'name' => 'Email (SMTP)',
            'description' => 'SMTP email sending configuration',
            'icon' => 'email',
            'required' => ['host', 'port', 'from_email'],
            'sensitive_fields' => ['password'],
            'fields' => [
                'host' => [
                    'type' => 'string',
                    'label' => 'SMTP Host',
                    'description' => 'SMTP server hostname',
                    'placeholder' => 'smtp.example.com',
                ],
                'port' => [
                    'type' => 'integer',
                    'label' => 'SMTP Port',
                    'description' => 'SMTP server port',
                    'default' => 587,
                    'enum' => [25, 465, 587, 2525],
                ],
                'username' => [
                    'type' => 'string',
                    'label' => 'Username',
                    'description' => 'SMTP authentication username',
                ],
                'password' => [
                    'type' => 'string',
                    'label' => 'Password',
                    'description' => 'SMTP authentication password',
                    'sensitive' => true,
                ],
                'encryption' => [
                    'type' => 'string',
                    'label' => 'Encryption',
                    'description' => 'Connection encryption type',
                    'enum' => ['none', 'tls', 'ssl'],
                    'default' => 'tls',
                ],
                'from_email' => [
                    'type' => 'string',
                    'label' => 'From Email',
                    'description' => 'Default sender email address',
                    'placeholder' => 'noreply@example.com',
                ],
                'from_name' => [
                    'type' => 'string',
                    'label' => 'From Name',
                    'description' => 'Default sender name',
                    'default' => 'NOMAD CMS',
                ],
                'reply_to' => [
                    'type' => 'string',
                    'label' => 'Reply-To',
                    'description' => 'Default reply-to address',
                ],
            ],
        ];
    }
    
    private static function getEmailSendgridSchema(): array
    {
        return [
            'name' => 'Email (SendGrid)',
            'description' => 'SendGrid email API integration',
            'icon' => 'sendgrid',
            'documentation' => 'https://docs.sendgrid.com/api-reference/mail-send/mail-send',
            'required' => ['api_key', 'from_email'],
            'sensitive_fields' => ['api_key'],
            'fields' => [
                'api_key' => [
                    'type' => 'string',
                    'label' => 'API Key',
                    'description' => 'SendGrid API key',
                    'placeholder' => 'SG.xxxxxxxxxxxxx',
                    'sensitive' => true,
                ],
                'from_email' => [
                    'type' => 'string',
                    'label' => 'From Email',
                    'description' => 'Verified sender email address',
                    'placeholder' => 'noreply@example.com',
                ],
                'from_name' => [
                    'type' => 'string',
                    'label' => 'From Name',
                    'description' => 'Default sender name',
                    'default' => 'NOMAD CMS',
                ],
                'sandbox_mode' => [
                    'type' => 'boolean',
                    'label' => 'Sandbox Mode',
                    'description' => 'Enable sandbox mode for testing',
                    'default' => false,
                ],
                'ip_pool_name' => [
                    'type' => 'string',
                    'label' => 'IP Pool',
                    'description' => 'SendGrid IP pool name',
                ],
            ],
        ];
    }
    
    private static function getEmailMailgunSchema(): array
    {
        return [
            'name' => 'Email (Mailgun)',
            'description' => 'Mailgun email API integration',
            'icon' => 'mailgun',
            'documentation' => 'https://documentation.mailgun.com/en/latest/api-sending-messages.html',
            'required' => ['api_key', 'domain', 'from_email'],
            'sensitive_fields' => ['api_key'],
            'fields' => [
                'api_key' => [
                    'type' => 'string',
                    'label' => 'API Key',
                    'description' => 'Mailgun API key',
                    'placeholder' => 'key-xxxxxxxxxxxxx',
                    'sensitive' => true,
                ],
                'domain' => [
                    'type' => 'string',
                    'label' => 'Domain',
                    'description' => 'Mailgun sending domain',
                    'placeholder' => 'mg.example.com',
                ],
                'region' => [
                    'type' => 'string',
                    'label' => 'Region',
                    'description' => 'Mailgun region',
                    'enum' => ['us', 'eu'],
                    'default' => 'us',
                ],
                'from_email' => [
                    'type' => 'string',
                    'label' => 'From Email',
                    'description' => 'Default sender email address',
                ],
                'from_name' => [
                    'type' => 'string',
                    'label' => 'From Name',
                    'description' => 'Default sender name',
                    'default' => 'NOMAD CMS',
                ],
            ],
        ];
    }
    
    private static function getEmailSesSchema(): array
    {
        return [
            'name' => 'Email (Amazon SES)',
            'description' => 'Amazon Simple Email Service integration',
            'icon' => 'aws',
            'documentation' => 'https://docs.aws.amazon.com/ses/latest/APIReference/Welcome.html',
            'required' => ['access_key', 'secret_key', 'region', 'from_email'],
            'sensitive_fields' => ['access_key', 'secret_key'],
            'fields' => [
                'access_key' => [
                    'type' => 'string',
                    'label' => 'AWS Access Key',
                    'description' => 'AWS access key ID',
                    'placeholder' => 'AKIAXXXXXXXXXXXXXXXX',
                    'sensitive' => true,
                ],
                'secret_key' => [
                    'type' => 'string',
                    'label' => 'AWS Secret Key',
                    'description' => 'AWS secret access key',
                    'sensitive' => true,
                ],
                'region' => [
                    'type' => 'string',
                    'label' => 'AWS Region',
                    'description' => 'SES region',
                    'placeholder' => 'us-east-1',
                ],
                'from_email' => [
                    'type' => 'string',
                    'label' => 'From Email',
                    'description' => 'Verified sender email address',
                ],
                'from_name' => [
                    'type' => 'string',
                    'label' => 'From Name',
                    'description' => 'Default sender name',
                    'default' => 'NOMAD CMS',
                ],
                'configuration_set' => [
                    'type' => 'string',
                    'label' => 'Configuration Set',
                    'description' => 'SES configuration set name',
                ],
            ],
        ];
    }
    
    private static function getEmailPostmarkSchema(): array
    {
        return [
            'name' => 'Email (Postmark)',
            'description' => 'Postmark email API integration',
            'icon' => 'postmark',
            'documentation' => 'https://postmarkapp.com/developer/user-guide/send-email-with-api',
            'required' => ['server_token', 'from_email'],
            'sensitive_fields' => ['server_token'],
            'fields' => [
                'server_token' => [
                    'type' => 'string',
                    'label' => 'Server Token',
                    'description' => 'Postmark server token',
                    'placeholder' => 'xxxxx-xxxxx-xxxxx-xxxxx-xxxxx',
                    'sensitive' => true,
                ],
                'from_email' => [
                    'type' => 'string',
                    'label' => 'From Email',
                    'description' => 'Verified sender signature email',
                ],
                'from_name' => [
                    'type' => 'string',
                    'label' => 'From Name',
                    'description' => 'Default sender name',
                    'default' => 'NOMAD CMS',
                ],
                'message_stream' => [
                    'type' => 'string',
                    'label' => 'Message Stream',
                    'description' => 'Postmark message stream ID',
                    'default' => 'outbound',
                ],
                'track_opens' => [
                    'type' => 'boolean',
                    'label' => 'Track Opens',
                    'description' => 'Enable open tracking',
                    'default' => true,
                ],
                'track_links' => [
                    'type' => 'string',
                    'label' => 'Track Links',
                    'description' => 'Link tracking mode',
                    'enum' => ['None', 'HtmlAndText', 'HtmlOnly', 'TextOnly'],
                    'default' => 'None',
                ],
            ],
        ];
    }
    
    // ==========================================
    // HTTP PROVIDER
    // ==========================================
    
    private static function getHttpSchema(): array
    {
        return [
            'name' => 'HTTP Endpoint',
            'description' => 'Generic HTTP endpoint configuration',
            'icon' => 'http',
            'required' => [],
            'sensitive_fields' => ['auth_token', 'api_key'],
            'fields' => [
                'base_url' => [
                    'type' => 'string',
                    'label' => 'Base URL',
                    'description' => 'Base URL for requests',
                    'placeholder' => 'https://api.example.com',
                ],
                'auth_type' => [
                    'type' => 'string',
                    'label' => 'Auth Type',
                    'description' => 'Authentication method',
                    'enum' => ['none', 'basic', 'bearer', 'api_key'],
                    'default' => 'none',
                ],
                'auth_token' => [
                    'type' => 'string',
                    'label' => 'Auth Token',
                    'description' => 'Authentication token or password',
                    'sensitive' => true,
                ],
                'api_key' => [
                    'type' => 'string',
                    'label' => 'API Key',
                    'description' => 'API key for authentication',
                    'sensitive' => true,
                ],
                'api_key_header' => [
                    'type' => 'string',
                    'label' => 'API Key Header',
                    'description' => 'Header name for API key',
                    'default' => 'X-API-Key',
                ],
                'timeout' => [
                    'type' => 'integer',
                    'label' => 'Timeout (seconds)',
                    'description' => 'Request timeout',
                    'default' => 30,
                ],
                'default_headers' => [
                    'type' => 'array',
                    'label' => 'Default Headers',
                    'description' => 'Headers to include in all requests',
                ],
            ],
        ];
    }
    
    // ==========================================
    // SSG PROVIDER
    // ==========================================
    
    private static function getSsgSchema(): array
    {
        return [
            'name' => 'Static Site Generator',
            'description' => 'SSG build configuration',
            'icon' => 'ssg',
            'required' => [],
            'sensitive_fields' => [],
            'fields' => [
                'build_command' => [
                    'type' => 'string',
                    'label' => 'Build Command',
                    'description' => 'Command to run for builds',
                    'default' => 'npm run build',
                ],
                'output_dir' => [
                    'type' => 'string',
                    'label' => 'Output Directory',
                    'description' => 'Build output directory',
                    'default' => 'dist',
                ],
                'deploy_url' => [
                    'type' => 'string',
                    'label' => 'Deploy URL',
                    'description' => 'Deployment webhook URL',
                ],
                'callback_url' => [
                    'type' => 'string',
                    'label' => 'Callback URL',
                    'description' => 'URL to notify when build completes',
                ],
                'node_version' => [
                    'type' => 'string',
                    'label' => 'Node Version',
                    'description' => 'Node.js version for builds',
                    'default' => '18',
                ],
            ],
        ];
    }
    
    // ==========================================
    // CACHE/CDN PROVIDERS
    // ==========================================
    
    private static function getCacheCloudflareSchema(): array
    {
        return [
            'name' => 'Cloudflare',
            'description' => 'Cloudflare cache purging configuration',
            'icon' => 'cloudflare',
            'documentation' => 'https://developers.cloudflare.com/api/operations/zone-cache-settings',
            'required' => ['api_token', 'zone_id'],
            'sensitive_fields' => ['api_token'],
            'fields' => [
                'api_token' => [
                    'type' => 'string',
                    'label' => 'API Token',
                    'description' => 'Cloudflare API token with cache purge permissions',
                    'sensitive' => true,
                ],
                'zone_id' => [
                    'type' => 'string',
                    'label' => 'Zone ID',
                    'description' => 'Cloudflare zone identifier',
                    'placeholder' => '023e105f4ecef8ad9ca31a8372d0c353',
                ],
                'email' => [
                    'type' => 'string',
                    'label' => 'Email (for Global Key)',
                    'description' => 'Account email if using Global API Key',
                ],
            ],
        ];
    }
    
    private static function getCacheFastlySchema(): array
    {
        return [
            'name' => 'Fastly',
            'description' => 'Fastly cache purging configuration',
            'icon' => 'fastly',
            'documentation' => 'https://developer.fastly.com/reference/api/purging/',
            'required' => ['api_key', 'service_id'],
            'sensitive_fields' => ['api_key'],
            'fields' => [
                'api_key' => [
                    'type' => 'string',
                    'label' => 'API Key',
                    'description' => 'Fastly API token',
                    'sensitive' => true,
                ],
                'service_id' => [
                    'type' => 'string',
                    'label' => 'Service ID',
                    'description' => 'Fastly service identifier',
                ],
            ],
        ];
    }
    
    private static function getCacheBunnySchema(): array
    {
        return [
            'name' => 'Bunny CDN',
            'description' => 'Bunny CDN cache purging configuration',
            'icon' => 'bunny',
            'documentation' => 'https://docs.bunny.net/reference/pullzonepublic_purgecache',
            'required' => ['api_key', 'pull_zone_id'],
            'sensitive_fields' => ['api_key'],
            'fields' => [
                'api_key' => [
                    'type' => 'string',
                    'label' => 'API Key',
                    'description' => 'Bunny API key',
                    'sensitive' => true,
                ],
                'pull_zone_id' => [
                    'type' => 'string',
                    'label' => 'Pull Zone ID',
                    'description' => 'Bunny pull zone identifier',
                ],
            ],
        ];
    }
    
    // ==========================================
    // DEFAULT CONFIGURATIONS
    // ==========================================
    
    /**
     * Get seed provider configurations for initial setup
     */
    public static function getSeedConfigurations(): array
    {
        return [
            [
                'name' => 'Default Discord Webhook',
                'provider_type' => 'discord',
                'is_default' => true,
                'config' => [
                    'webhook_url' => '', // To be configured
                    'username' => 'NOMAD CMS',
                ],
            ],
            [
                'name' => 'Default Slack Webhook',
                'provider_type' => 'slack',
                'is_default' => true,
                'config' => [
                    'webhook_url' => '', // To be configured
                    'username' => 'NOMAD CMS',
                    'icon_emoji' => ':page_facing_up:',
                ],
            ],
            [
                'name' => 'Default Telegram Bot',
                'provider_type' => 'telegram',
                'is_default' => true,
                'config' => [
                    'bot_token' => '', // To be configured
                    'parse_mode' => 'HTML',
                ],
            ],
            [
                'name' => 'Default SMTP',
                'provider_type' => 'email_smtp',
                'is_default' => true,
                'config' => [
                    'host' => '', // To be configured
                    'port' => 587,
                    'encryption' => 'tls',
                    'from_name' => 'NOMAD CMS',
                ],
            ],
            [
                'name' => 'Default HTTP Endpoint',
                'provider_type' => 'http',
                'is_default' => true,
                'config' => [
                    'auth_type' => 'none',
                    'timeout' => 30,
                ],
            ],
            [
                'name' => 'Default SSG',
                'provider_type' => 'ssg',
                'is_default' => true,
                'config' => [
                    'build_command' => 'npm run build',
                    'output_dir' => 'dist',
                ],
            ],
            [
                'name' => 'Default Cloudflare',
                'provider_type' => 'cache_cloudflare',
                'is_default' => true,
                'config' => [
                    'api_token' => '', // To be configured
                    'zone_id' => '', // To be configured
                ],
            ],
        ];
    }
}
