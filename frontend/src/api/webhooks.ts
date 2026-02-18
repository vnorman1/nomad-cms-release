/**
 * Webhook API Module
 * 
 * Handles all webhook-related API calls for outgoing and incoming webhooks.
 * @security Uses apiClient for automatic token handling
 */

import { apiClient } from './client';

// ============================================================================
// Types
// ============================================================================

export interface Webhook {
    id: number;
    user_id: number;
    name: string;
    url: string;
    events: string[];
    payload_fields: string[];
    slot_filters: string[] | null;
    slot_type_filters: string[] | null;
    headers: string[]; // Only header names are returned (values are encrypted)
    is_active: boolean;
    retry_count: number;
    timeout_seconds: number;
    created_at: string;
    updated_at: string;
    secret?: string; // Only present on creation
}

export interface WebhookDelivery {
    id: number;
    webhook_id: number;
    event: string;
    payload: string;
    response_status: number | null;
    response_body: string | null;
    attempts: number;
    delivered_at: string | null;
    failed_at: string | null;
    next_retry_at: string | null;
    created_at: string;
}

export interface WebhookEndpoint {
    id: number;
    user_id: number;
    name: string;
    endpoint_key: string;
    handler: string;
    signature_header: string;
    timestamp_header: string | null;
    signature_format: string;
    is_active: boolean;
    last_called_at: string | null;
    created_at: string;
    url: string;
    secret?: string; // Only present on creation
}

export interface WebhookFormData {
    name: string;
    url: string;
    events: string[];
    payload_fields?: string[];
    slot_filters?: string[];
    slot_type_filters?: string[];
    headers?: Record<string, string>;
    retry_count?: number;
    timeout_seconds?: number;
}

export interface PayloadField {
    key: string;
    label: string;
    description: string;
}

export interface PayloadFieldCategory {
    name: string;
    fields: PayloadField[];
}

export interface PayloadFieldsResponse {
    [category: string]: PayloadFieldCategory;
}

export interface EndpointFormData {
    name: string;
    endpoint_key: string;
    handler?: string;
    signature_header?: string;
    timestamp_header?: string;
    signature_format?: string;
}

/**
 * Signature formats supported for incoming webhooks
 * These correspond to WebhookService::SIGNATURE_FORMATS in PHP
 */
export const SIGNATURE_FORMATS = [
    { value: 'auto', label: 'Automatikus', description: 'Automatikus formátum felismerés' },
    { value: 'sha256_simple', label: 'SHA-256 Simple', description: 'HMAC-SHA256 nyers payload-dal' },
    { value: 'sha256_prefixed', label: 'SHA-256 Prefixed', description: 'sha256=SIGNATURE formátum (GitHub)' },
    { value: 'sha256_timestamped', label: 'SHA-256 Timestamped', description: 't=TIMESTAMP,v1=SIGNATURE (Stripe)' },
    { value: 'sha1_simple', label: 'SHA-1 Simple', description: 'HMAC-SHA1 nyers payload-dal' },
    { value: 'sha1_prefixed', label: 'SHA-1 Prefixed', description: 'sha1=SIGNATURE formátum (GitHub legacy)' },
    { value: 'sha512_simple', label: 'SHA-512 Simple', description: 'HMAC-SHA512 extra biztonság' },
    { value: 'base64', label: 'Base64', description: 'Base64 kódolt HMAC-SHA256' },
];

/**
 * Common signature header names for incoming webhooks
 */
export const COMMON_SIGNATURE_HEADERS = [
    { value: 'X-Webhook-Signature', label: 'X-Webhook-Signature', description: 'Általános' },
    { value: 'X-Hub-Signature-256', label: 'X-Hub-Signature-256', description: 'GitHub (SHA-256)' },
    { value: 'X-Hub-Signature', label: 'X-Hub-Signature', description: 'GitHub (SHA-1 legacy)' },
    { value: 'Stripe-Signature', label: 'Stripe-Signature', description: 'Stripe' },
    { value: 'X-Nomad-Signature', label: 'X-Nomad-Signature', description: 'Nomad CMS' },
    { value: 'X-Signature', label: 'X-Signature', description: 'Általános egyszerű' },
    { value: 'X-Payload-Signature', label: 'X-Payload-Signature', description: 'Payload CMS' },
    { value: 'X-Request-Signature', label: 'X-Request-Signature', description: 'Általános kérés' },
];

/**
 * Common timestamp header names for incoming webhooks
 */
export const COMMON_TIMESTAMP_HEADERS = [
    { value: '', label: 'Nincs', description: 'Időbélyeg beágyazva a signature-ben' },
    { value: 'X-Webhook-Timestamp', label: 'X-Webhook-Timestamp', description: 'Általános' },
    { value: 'X-Timestamp', label: 'X-Timestamp', description: 'Egyszerű' },
    { value: 'X-Hook-Timestamp', label: 'X-Hook-Timestamp', description: 'Hook specifikus' },
    { value: 'X-Request-Timestamp', label: 'X-Request-Timestamp', description: 'Kérés időbélyeg' },
];

export interface DeliveryResult {
    success: boolean;
    status_code: number | null;
    response_body: string | null;
    error: string | null;
    delivery_id: number;
    attempts: number;
}

// ============================================================================
// Outgoing Webhooks API
// ============================================================================

/**
 * Get all webhooks for the current user
 */
export async function getWebhooks(): Promise<Webhook[]> {
    const response = await apiClient.get('/endpoints/admin/webhooks.php');
    return response.data.webhooks;
}

/**
 * Get a single webhook by ID
 */
export async function getWebhook(id: number): Promise<Webhook> {
    const response = await apiClient.get(`/endpoints/admin/webhooks.php?id=${id}`);
    return response.data.webhook;
}

/**
 * Create a new webhook
 * Returns the webhook with the secret (shown only once!)
 */
export async function createWebhook(formData: WebhookFormData): Promise<Webhook> {
    // Sanitize: empty arrays should be null for backend
    const sanitizedData = {
        ...formData,
        payload_fields: formData.payload_fields?.length ? formData.payload_fields : null,
        slot_filters: formData.slot_filters?.length ? formData.slot_filters : null,
        slot_type_filters: formData.slot_type_filters?.length ? formData.slot_type_filters : null,
        retry_count: Math.min(Math.max(formData.retry_count ?? 3, 1), 10),
        timeout_seconds: Math.min(Math.max(formData.timeout_seconds ?? 30, 5), 120)
    };

    const response = await apiClient.post('/endpoints/admin/webhooks.php', sanitizedData);
    return response.data.webhook;
}

/**
 * Update a webhook
 */
export async function updateWebhook(id: number, updates: Partial<WebhookFormData> & { is_active?: boolean }): Promise<void> {
    // Sanitize: handle empty arrays and bounds
    const sanitizedUpdates: Record<string, unknown> = { id };

    if (updates.name !== undefined) sanitizedUpdates.name = updates.name;
    if (updates.url !== undefined) sanitizedUpdates.url = updates.url;
    if (updates.events !== undefined) sanitizedUpdates.events = updates.events;
    if (updates.is_active !== undefined) sanitizedUpdates.is_active = updates.is_active;

    // Handle arrays - explicitly set null for empty
    if ('payload_fields' in updates) {
        sanitizedUpdates.payload_fields = updates.payload_fields?.length ? updates.payload_fields : null;
    }
    if ('slot_filters' in updates) {
        sanitizedUpdates.slot_filters = updates.slot_filters?.length ? updates.slot_filters : null;
    }
    if ('slot_type_filters' in updates) {
        sanitizedUpdates.slot_type_filters = updates.slot_type_filters?.length ? updates.slot_type_filters : null;
    }

    if (updates.retry_count !== undefined) {
        sanitizedUpdates.retry_count = Math.min(Math.max(updates.retry_count, 1), 10);
    }
    if (updates.timeout_seconds !== undefined) {
        sanitizedUpdates.timeout_seconds = Math.min(Math.max(updates.timeout_seconds, 5), 120);
    }

    await apiClient.put('/endpoints/admin/webhooks.php', sanitizedUpdates);
}

/**
 * Delete a webhook
 */
export async function deleteWebhook(id: number): Promise<void> {
    await apiClient.delete(`/endpoints/admin/webhooks.php?id=${id}`);
}

/**
 * Send a test webhook
 */
export async function testWebhook(id: number): Promise<DeliveryResult> {
    const response = await apiClient.post(`/endpoints/admin/webhooks.php?action=test&id=${id}`);
    return response.data.delivery;
}

/**
 * Rotate webhook secret
 * Returns the new secret (shown only once!)
 */
export async function rotateWebhookSecret(id: number): Promise<string> {
    const response = await apiClient.post(`/endpoints/admin/webhooks.php?action=rotate-secret&id=${id}`);
    return response.data.secret;
}

/**
 * Get webhook delivery history
 */
export async function getWebhookDeliveries(webhookId: number, limit = 50): Promise<WebhookDelivery[]> {
    const response = await apiClient.get(`/endpoints/admin/webhooks.php?action=deliveries&id=${webhookId}&limit=${limit}`);
    return response.data.deliveries;
}

/**
 * Retry a failed delivery
 */
export async function retryDelivery(deliveryId: number): Promise<DeliveryResult> {
    const response = await apiClient.post(`/endpoints/admin/webhooks.php?action=retry&id=${deliveryId}`);
    return response.data.delivery;
}

/**
 * Get available webhook events and payload fields
 */
export async function getWebhookEvents(): Promise<{ events: string[], payload_fields: PayloadFieldsResponse }> {
    const response = await apiClient.get('/endpoints/admin/webhooks.php?action=events');
    return { events: response.data.events, payload_fields: response.data.payload_fields };
}

// ============================================================================
// Incoming Webhook Endpoints API
// ============================================================================

/**
 * Get all incoming webhook endpoints
 */
export async function getWebhookEndpoints(): Promise<WebhookEndpoint[]> {
    const response = await apiClient.get('/endpoints/admin/webhooks.php?type=endpoints');
    return response.data.endpoints;
}

/**
 * Create a new incoming webhook endpoint
 * Returns the endpoint with the secret (shown only once!)
 */
export async function createWebhookEndpoint(formData: EndpointFormData): Promise<WebhookEndpoint> {
    const response = await apiClient.post('/endpoints/admin/webhooks.php?type=endpoints', formData);
    return response.data.endpoint;
}

/**
 * Update an incoming webhook endpoint
 */
export async function updateWebhookEndpoint(id: number, updates: Partial<EndpointFormData> & { is_active?: boolean }): Promise<void> {
    await apiClient.put('/endpoints/admin/webhooks.php?type=endpoints', { id, ...updates });
}

/**
 * Delete an incoming webhook endpoint
 */
export async function deleteWebhookEndpoint(id: number): Promise<void> {
    await apiClient.delete(`/endpoints/admin/webhooks.php?type=endpoints&id=${id}`);
}

/**
 * Rotate incoming webhook endpoint secret
 * Returns the new secret (shown only once!)
 */
export async function rotateEndpointSecret(id: number): Promise<string> {
    const response = await apiClient.post(`/endpoints/admin/webhooks.php?type=endpoints&action=rotate-secret&id=${id}`);
    return response.data.secret;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format event name for display
 */
export function formatEventName(event: string): string {
    return event
        .split('.')
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' › ');
}

/**
 * Get event category from event name
 */
export function getEventCategory(event: string): string {
    return event.split('.')[0];
}

/**
 * Group events by category
 */
export function groupEventsByCategory(events: string[]): Record<string, string[]> {
    return events.reduce((acc, event) => {
        const category = getEventCategory(event);
        if (!acc[category]) acc[category] = [];
        acc[category].push(event);
        return acc;
    }, {} as Record<string, string[]>);
}

/**
 * Available webhook handlers for incoming endpoints
 */
export const WEBHOOK_HANDLERS = [
    { value: 'default', label: 'Default', description: 'Logs the payload for debugging' },
    { value: 'content', label: 'Content', description: 'CMS tartalom kezelés (massive.update/create/delete)' },
    { value: 'stripe', label: 'Stripe', description: 'Handles Stripe payment events' },
    { value: 'github', label: 'GitHub', description: 'Handles GitHub repository events' },
    { value: 'zapier', label: 'Zapier', description: 'Handles Zapier automation events' },
    { value: 'custom', label: 'Custom', description: 'Custom handler (extend as needed)' },
];
