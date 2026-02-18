/**
 * Webhooks Admin Page
 * 
 * Full-featured webhook management interface with:
 * - Outgoing webhooks (CMS → external services)
 * - Incoming webhook endpoints (external services → CMS)
 * - Delivery logs and retry functionality
 * - Dynamic payload field selection
 * - Secret management
 * 
 * Design matches LogsPage for consistent UX.
 */

import { useState, useEffect } from 'react';
import {
    AlertCircle
} from 'lucide-react';
import { useUI } from '@/context/UIContext';
import { useAuth } from '@/context/AuthContext';
import { useSchema } from '@/services/useSchema';
import {
    Webhook as WebhookType,
    WebhookEndpoint,
    WebhookFormData,
    EndpointFormData,
    PayloadFieldsResponse,
    getWebhooks,
    createWebhook,
    updateWebhook,
    deleteWebhook,
    testWebhook,
    rotateWebhookSecret,
    getWebhookEvents,
    getWebhookEndpoints,
    createWebhookEndpoint,
    updateWebhookEndpoint,
    deleteWebhookEndpoint,
    rotateEndpointSecret
} from '@/api/webhooks';
import {
    WebhookForm,
    WebhookDeliveryLog,
    EndpointForm,
    SecretDisplay,
    WebhookHeader,
    WebhookToolbar,
    OutgoingWebhookTable,
    IncomingEndpointTable
} from '@/components/webhooks';

type TabType = 'outgoing' | 'incoming';

export default function WebhooksPage() {
    const { confirm, showToast } = useUI();
    const { user } = useAuth();
    const { config: schemaConfig, isLoaded: schemaLoaded } = useSchema();

    // State
    const [activeTab, setActiveTab] = useState<TabType>('outgoing');
    const [webhooks, setWebhooks] = useState<WebhookType[]>([]);
    const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([]);
    const [availableEvents, setAvailableEvents] = useState<string[]>([]);
    const [payloadFields, setPayloadFields] = useState<PayloadFieldsResponse>({});
    const [availableSlots, setAvailableSlots] = useState<{ key: string; type: string; label: string }[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');

    // Modal states
    const [isCreateWebhookOpen, setIsCreateWebhookOpen] = useState(false);
    const [editingWebhook, setEditingWebhook] = useState<WebhookType | null>(null);
    const [isCreateEndpointOpen, setIsCreateEndpointOpen] = useState(false);
    const [editingEndpoint, setEditingEndpoint] = useState<WebhookEndpoint | null>(null);
    const [viewingDeliveries, setViewingDeliveries] = useState<WebhookType | null>(null);
    const [displaySecret, setDisplaySecret] = useState<{ secret: string; title: string } | null>(null);

    // Action states
    const [testingId, setTestingId] = useState<number | null>(null);

    // Load data
    const loadWebhooks = async () => {
        try {
            const data = await getWebhooks();
            setWebhooks(data);
        } catch (err) {
            console.error('Failed to load webhooks:', err);
        }
    };

    const loadEndpoints = async () => {
        try {
            const data = await getWebhookEndpoints();
            setEndpoints(data);
        } catch (err) {
            console.error('Failed to load endpoints:', err);
        }
    };

    const loadEvents = async () => {
        try {
            const data = await getWebhookEvents();
            setAvailableEvents(data.events);
            setPayloadFields(data.payload_fields);
        } catch (err) {
            console.error('Failed to load events:', err);
        }
    };

    const loadSlots = async () => {
        // Use schema config directly from useSchema hook
        // This ensures slots are available when schema is loaded
        if (schemaConfig) {
            const slotsWithTypes = Object.entries(schemaConfig).map(([key, config]) => ({
                key,
                type: config?.type || 'object',
                label: config?.label || key
            }));
            setAvailableSlots(slotsWithTypes);
        }
    };

    const loadAll = async () => {
        setLoading(true);
        await Promise.all([loadWebhooks(), loadEndpoints(), loadEvents(), loadSlots()]);
        setLoading(false);
    };

    useEffect(() => {
        loadAll();
    }, []);

    // Reload slots when schema becomes available
    useEffect(() => {
        if (schemaLoaded && schemaConfig) {
            loadSlots();
        }
    }, [schemaLoaded, schemaConfig]);

    // =========================================================================
    // Outgoing Webhook Handlers
    // =========================================================================

    const handleCreateWebhook = async (data: WebhookFormData) => {
        const webhook = await createWebhook(data);
        await loadWebhooks();

        if (webhook.secret) {
            setDisplaySecret({
                secret: webhook.secret,
                title: 'Webhook Létrehozva'
            });
        }
    };

    const handleUpdateWebhook = async (data: WebhookFormData) => {
        if (!editingWebhook) return;
        await updateWebhook(editingWebhook.id, data);
        await loadWebhooks();
        setEditingWebhook(null);
    };

    const handleDeleteWebhook = (webhook: WebhookType) => {
        confirm({
            title: 'Webhook Törlése',
            message: `Biztosan törölni szeretnéd a(z) "${webhook.name}" webhookot? Ez a művelet nem visszavonható.`,
            confirmLabel: 'Törlés',
            cancelLabel: 'Mégse',
            isDestructive: true,
            onConfirm: async () => {
                await deleteWebhook(webhook.id);
                await loadWebhooks();
            }
        });
    };

    const handleTestWebhook = async (webhook: WebhookType) => {
        try {
            setTestingId(webhook.id);
            const result = await testWebhook(webhook.id);

            if (result.success) {
                showToast('success', 'Webhook teszt sikeres!', `A "${webhook.name}" webhook sikeresen elérte a cél URL-t.`);
            } else if (result.status_code === 429) {
                showToast('warning', 'Rate Limit', `A cél szerver túl sok kérést kapott (429). Próbáld később!`);
            } else if (result.status_code === 401 || result.status_code === 403) {
                showToast('error', 'Hitelesítési hiba', `A cél szerver visszautasította a kérést (${result.status_code}).`);
            } else if (result.status_code === 404) {
                showToast('error', 'URL nem található', 'A webhook URL nem létezik vagy rossz.');
            } else if (result.status_code && result.status_code >= 500) {
                showToast('error', 'Szerver hiba', `A cél szerver hibát jelzett (${result.status_code}).`);
            } else {
                showToast('error', 'Webhook teszt sikertelen', result.error || `Státusz: ${result.status_code || 'ismeretlen'}`);
            }
        } catch (err) {
            console.error('Test webhook error:', err);
            showToast('error', 'Hiba', 'Nem sikerült a webhook tesztelése.');
        } finally {
            setTestingId(null);
        }
    };

    const handleRotateWebhookSecret = (webhook: WebhookType) => {
        confirm({
            title: 'Secret Újragenerálás',
            message: `Új titkos kulcsot generálsz a(z) "${webhook.name}" webhookhoz. A régi kulcs érvénytelenné válik!`,
            confirmLabel: 'Újragenerálás',
            cancelLabel: 'Mégse',
            isDestructive: false,
            onConfirm: async () => {
                const newSecret = await rotateWebhookSecret(webhook.id);
                setDisplaySecret({
                    secret: newSecret,
                    title: 'Új Secret Generálva'
                });
            }
        });
    };

    const handleToggleWebhookActive = async (webhook: WebhookType) => {
        await updateWebhook(webhook.id, { is_active: !webhook.is_active });
        await loadWebhooks();
    };

    // =========================================================================
    // Incoming Endpoint Handlers
    // =========================================================================

    const handleCreateEndpoint = async (data: EndpointFormData) => {
        const endpoint = await createWebhookEndpoint(data);
        await loadEndpoints();

        if (endpoint.secret) {
            setDisplaySecret({
                secret: endpoint.secret,
                title: 'Endpoint Létrehozva'
            });
        }
    };

    const handleUpdateEndpoint = async (data: EndpointFormData) => {
        if (!editingEndpoint) return;
        await updateWebhookEndpoint(editingEndpoint.id, data);
        await loadEndpoints();
        setEditingEndpoint(null);
    };

    const handleDeleteEndpoint = (endpoint: WebhookEndpoint) => {
        confirm({
            title: 'Endpoint Törlése',
            message: `Biztosan törölni szeretnéd a(z) "${endpoint.name}" endpointot? A külső szolgáltatások nem tudják majd elérni.`,
            confirmLabel: 'Törlés',
            cancelLabel: 'Mégse',
            isDestructive: true,
            onConfirm: async () => {
                await deleteWebhookEndpoint(endpoint.id);
                await loadEndpoints();
            }
        });
    };

    const handleRotateEndpointSecret = (endpoint: WebhookEndpoint) => {
        confirm({
            title: 'Secret Újragenerálás',
            message: `Új titkos kulcsot generálsz a(z) "${endpoint.name}" endpointhoz. Frissítsd a külső szolgáltatás beállításait!`,
            confirmLabel: 'Újragenerálás',
            cancelLabel: 'Mégse',
            isDestructive: false,
            onConfirm: async () => {
                const newSecret = await rotateEndpointSecret(endpoint.id);
                setDisplaySecret({
                    secret: newSecret,
                    title: 'Új Secret Generálva'
                });
            }
        });
    };

    const handleToggleEndpointActive = async (endpoint: WebhookEndpoint) => {
        await updateWebhookEndpoint(endpoint.id, { is_active: !endpoint.is_active });
        await loadEndpoints();
    };

    // Filter
    const filteredWebhooks = webhooks.filter(w => {
        const matchesSearch = w.name.toLowerCase().includes(search.toLowerCase()) ||
            w.url.toLowerCase().includes(search.toLowerCase());
        const matchesStatus = !statusFilter ||
            (statusFilter === 'active' && w.is_active) ||
            (statusFilter === 'inactive' && !w.is_active);
        return matchesSearch && matchesStatus;
    });

    const filteredEndpoints = endpoints.filter(e => {
        const matchesSearch = e.name.toLowerCase().includes(search.toLowerCase()) ||
            e.endpoint_key.toLowerCase().includes(search.toLowerCase());
        const matchesStatus = !statusFilter ||
            (statusFilter === 'active' && e.is_active) ||
            (statusFilter === 'inactive' && !e.is_active);
        return matchesSearch && matchesStatus;
    });

    // Admin check
    if (!user?.is_admin) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-center text-muted-foreground">
                    <AlertCircle size={48} className="mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium">Hozzáférés megtagadva</p>
                    <p className="text-sm">Admin jogosultság szükséges.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-background font-sans text-foreground">
            <div className="flex-1 flex flex-col h-full relative overflow-hidden">
                {/* HEADER */}
                <div className="flex-none p-6 pb-4 space-y-4">
                    <WebhookHeader
                        webhookCount={webhooks.length}
                        endpointCount={endpoints.length}
                        loading={loading}
                        activeTab={activeTab}
                        onRefresh={loadAll}
                        onCreate={() => activeTab === 'outgoing' ? setIsCreateWebhookOpen(true) : setIsCreateEndpointOpen(true)}
                    />
                    <WebhookToolbar
                        search={search}
                        onSearchChange={setSearch}
                        activeTab={activeTab}
                        onTabChange={setActiveTab}
                        statusFilter={statusFilter}
                        onStatusFilterChange={setStatusFilter}
                        webhookCount={webhooks.length}
                        endpointCount={endpoints.length}
                    />
                </div>

                {/* WEBHOOK TABLE */}
                <div className="flex-1 overflow-auto px-6 pb-32 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                    {activeTab === 'outgoing' ? (
                        <OutgoingWebhookTable
                            webhooks={filteredWebhooks}
                            onEdit={setEditingWebhook}
                            onDelete={handleDeleteWebhook}
                            onTest={handleTestWebhook}
                            onRotateSecret={handleRotateWebhookSecret}
                            onViewDeliveries={setViewingDeliveries}
                            onToggleActive={handleToggleWebhookActive}
                            testingId={testingId}
                        />
                    ) : (
                        <IncomingEndpointTable
                            endpoints={filteredEndpoints}
                            onEdit={setEditingEndpoint}
                            onDelete={handleDeleteEndpoint}
                            onRotateSecret={handleRotateEndpointSecret}
                            onToggleActive={handleToggleEndpointActive}
                        />
                    )}
                </div>
            </div>

            {/* Modals */}
            <WebhookForm
                isOpen={isCreateWebhookOpen}
                onClose={() => setIsCreateWebhookOpen(false)}
                onSubmit={handleCreateWebhook}
                availableEvents={availableEvents}
                payloadFields={payloadFields}
                availableSlots={availableSlots}
                title="Új Webhook Létrehozása"
            />

            <WebhookForm
                isOpen={!!editingWebhook}
                onClose={() => setEditingWebhook(null)}
                onSubmit={handleUpdateWebhook}
                initialData={editingWebhook ? {
                    ...editingWebhook,
                    slot_filters: editingWebhook.slot_filters || [],
                    slot_type_filters: editingWebhook.slot_type_filters || undefined,
                    headers: editingWebhook.headers as any
                } : undefined}
                availableEvents={availableEvents}
                payloadFields={payloadFields}
                availableSlots={availableSlots}
                title="Webhook Szerkesztése"
                isEdit
            />

            <EndpointForm
                isOpen={isCreateEndpointOpen}
                onClose={() => setIsCreateEndpointOpen(false)}
                onSubmit={handleCreateEndpoint}
                title="Új Bejövő Endpoint"
            />

            <EndpointForm
                isOpen={!!editingEndpoint}
                onClose={() => setEditingEndpoint(null)}
                onSubmit={handleUpdateEndpoint}
                initialData={editingEndpoint ? {
                    ...editingEndpoint,
                    timestamp_header: editingEndpoint.timestamp_header || undefined,
                    signature_header: editingEndpoint.signature_header || undefined,
                    signature_format: editingEndpoint.signature_format || undefined
                } : undefined}
                title="Endpoint Szerkesztése"
                isEdit
            />

            <WebhookDeliveryLog
                isOpen={!!viewingDeliveries}
                onClose={() => setViewingDeliveries(null)}
                webhookId={viewingDeliveries?.id || 0}
                webhookName={viewingDeliveries?.name || ''}
            />

            <SecretDisplay
                isOpen={!!displaySecret}
                onClose={() => setDisplaySecret(null)}
                secret={displaySecret?.secret || ''}
                title={displaySecret?.title}
            />
        </div>
    );
}
