/**
 * Webhooks Components Index
 * 
 * Re-exports all webhook-related components for easy importing.
 */

// Core components
export { WebhookForm } from './WebhookForm';
export { WebhookDeliveryLog } from './WebhookDeliveryLog';
export { EndpointForm } from './EndpointForm';
export { SecretDisplay } from './SecretDisplay';
export { WebhookHeader } from './WebhookHeader';
export { WebhookToolbar } from './WebhookToolbar';

// Unified card-based list components (AWWWARDS-level UX)
export { 
    OutgoingWebhookCard, 
    IncomingEndpointCard,
    OutgoingWebhookList,
    IncomingEndpointList
} from './WebhookCardList';

export { OutgoingWebhookTable, IncomingEndpointTable } from './WebhookTable';

// Legacy components (deprecated - use card-based components instead)
export { WebhookList } from './WebhookList';
export { EndpointList } from './EndpointList';
export { WebhookTableRow } from './WebhookTableRow';
