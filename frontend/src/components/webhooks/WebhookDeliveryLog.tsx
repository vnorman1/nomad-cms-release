/**
 * Webhook Delivery Log Component
 * 
 * Displays delivery history for a webhook with status, response details,
 * and retry functionality.
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X, Check, AlertCircle, Clock, RefreshCw, Loader2,
    ChevronDown, ExternalLink, Copy, CheckCircle2
} from 'lucide-react';
import { WebhookDelivery, getWebhookDeliveries, retryDelivery, formatEventName } from '@/api/webhooks';
import { cn } from '@/lib/utils';

interface WebhookDeliveryLogProps {
    isOpen: boolean;
    onClose: () => void;
    webhookId: number;
    webhookName: string;
}

export function WebhookDeliveryLog({
    isOpen,
    onClose,
    webhookId,
    webhookName
}: WebhookDeliveryLogProps) {
    const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
    const [loading, setLoading] = useState(true);
    const [retrying, setRetrying] = useState<number | null>(null);
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [copied, setCopied] = useState(false);

    const loadDeliveries = async () => {
        try {
            setLoading(true);
            const data = await getWebhookDeliveries(webhookId);
            setDeliveries(data);
        } catch (err) {
            console.error('Failed to load deliveries:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen && webhookId) {
            loadDeliveries();
        }
    }, [isOpen, webhookId]);

    const handleRetry = async (deliveryId: number) => {
        try {
            setRetrying(deliveryId);
            await retryDelivery(deliveryId);
            await loadDeliveries();
        } catch (err) {
            console.error('Retry failed:', err);
        } finally {
            setRetrying(null);
        }
    };

    const copyPayload = (payload: string) => {
        navigator.clipboard.writeText(payload);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const getStatusInfo = (delivery: WebhookDelivery) => {
        if (delivery.delivered_at) {
            return { 
                icon: Check, 
                color: 'text-emerald-500', 
                bg: 'bg-emerald-500/10',
                label: 'Sikeres' 
            };
        }
        if (delivery.failed_at && delivery.next_retry_at) {
            return { 
                icon: Clock, 
                color: 'text-amber-500', 
                bg: 'bg-amber-500/10',
                label: 'Újrapróbálás...' 
            };
        }
        return { 
            icon: AlertCircle, 
            color: 'text-destructive', 
            bg: 'bg-destructive/10',
            label: 'Sikertelen' 
        };
    };

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleString('hu-HU', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-background border border-border w-full max-w-4xl shadow-2xl rounded-xl max-h-[85vh] flex flex-col"
                >
                    {/* Header */}
                    <div className="p-6 border-b border-border flex justify-between items-center shrink-0">
                        <div>
                            <h3 className="font-bold text-lg">Kézbesítési Napló</h3>
                            <p className="text-sm text-muted-foreground">{webhookName}</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={loadDeliveries}
                                disabled={loading}
                                className="p-2 hover:bg-muted rounded-lg transition-colors disabled:opacity-50"
                                title="Frissítés"
                            >
                                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                            </button>
                            <button 
                                onClick={onClose}
                                className="p-2 hover:bg-muted rounded-lg transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-auto p-6">
                        {loading ? (
                            <div className="flex items-center justify-center h-48">
                                <Loader2 size={24} className="animate-spin text-muted-foreground" />
                            </div>
                        ) : deliveries.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                                <ExternalLink size={40} className="opacity-20 mb-3" />
                                <p className="text-sm">Még nincs kézbesítési előzmény</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {deliveries.map(delivery => {
                                    const status = getStatusInfo(delivery);
                                    const StatusIcon = status.icon;
                                    const isExpanded = expandedId === delivery.id;
                                    
                                    return (
                                        <motion.div
                                            key={delivery.id}
                                            layout
                                            className="border border-border rounded-lg overflow-hidden"
                                        >
                                            {/* Summary Row */}
                                            <button
                                                onClick={() => setExpandedId(isExpanded ? null : delivery.id)}
                                                className="w-full p-4 flex items-center gap-4 hover:bg-muted/30 transition-colors text-left"
                                            >
                                                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", status.bg)}>
                                                    <StatusIcon size={16} className={status.color} />
                                                </div>
                                                
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-medium text-sm">
                                                            {formatEventName(delivery.event)}
                                                        </span>
                                                        <span className={cn("text-xs px-1.5 py-0.5 rounded", status.bg, status.color)}>
                                                            {status.label}
                                                        </span>
                                                    </div>
                                                    <div className="text-xs text-muted-foreground mt-0.5">
                                                        {formatDate(delivery.created_at)}
                                                        {delivery.response_status && (
                                                            <span className="ml-2">
                                                                HTTP {delivery.response_status}
                                                            </span>
                                                        )}
                                                        <span className="ml-2">
                                                            {delivery.attempts} próbálkozás
                                                        </span>
                                                    </div>
                                                </div>

                                                <ChevronDown 
                                                    size={16} 
                                                    className={cn(
                                                        "text-muted-foreground transition-transform",
                                                        isExpanded && "rotate-180"
                                                    )} 
                                                />
                                            </button>

                                            {/* Expanded Details */}
                                            <AnimatePresence>
                                                {isExpanded && (
                                                    <motion.div
                                                        initial={{ height: 0 }}
                                                        animate={{ height: 'auto' }}
                                                        exit={{ height: 0 }}
                                                        className="overflow-hidden border-t border-border"
                                                    >
                                                        <div className="p-4 space-y-4 bg-muted/20">
                                                            {/* Payload */}
                                                            <div>
                                                                <div className="flex items-center justify-between mb-2">
                                                                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                                                        Payload
                                                                    </span>
                                                                    <button
                                                                        onClick={() => copyPayload(delivery.payload)}
                                                                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                                                                    >
                                                                        {copied ? (
                                                                            <>
                                                                                <CheckCircle2 size={12} />
                                                                                Másolva!
                                                                            </>
                                                                        ) : (
                                                                            <>
                                                                                <Copy size={12} />
                                                                                Másolás
                                                                            </>
                                                                        )}
                                                                    </button>
                                                                </div>
                                                                <pre className="bg-background p-3 rounded-lg text-xs font-mono overflow-x-auto max-h-40 border border-border">
                                                                    {JSON.stringify(JSON.parse(delivery.payload), null, 2)}
                                                                </pre>
                                                            </div>

                                                            {/* Response */}
                                                            {delivery.response_body && (
                                                                <div>
                                                                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-2">
                                                                        Válasz
                                                                    </span>
                                                                    <pre className="bg-background p-3 rounded-lg text-xs font-mono overflow-x-auto max-h-32 border border-border">
                                                                        {delivery.response_body}
                                                                    </pre>
                                                                </div>
                                                            )}

                                                            {/* Timestamps & Actions */}
                                                            <div className="flex items-center justify-between pt-2">
                                                                <div className="text-xs text-muted-foreground space-x-4">
                                                                    {delivery.delivered_at && (
                                                                        <span>✓ Kézbesítve: {formatDate(delivery.delivered_at)}</span>
                                                                    )}
                                                                    {delivery.failed_at && (
                                                                        <span>✗ Sikertelen: {formatDate(delivery.failed_at)}</span>
                                                                    )}
                                                                    {delivery.next_retry_at && (
                                                                        <span>⏱ Következő: {formatDate(delivery.next_retry_at)}</span>
                                                                    )}
                                                                </div>

                                                                {!delivery.delivered_at && (
                                                                    <button
                                                                        onClick={() => handleRetry(delivery.id)}
                                                                        disabled={retrying === delivery.id}
                                                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary text-xs font-medium rounded-lg hover:bg-primary/20 transition-colors disabled:opacity-50"
                                                                    >
                                                                        {retrying === delivery.id ? (
                                                                            <Loader2 size={12} className="animate-spin" />
                                                                        ) : (
                                                                            <RefreshCw size={12} />
                                                                        )}
                                                                        Újrapróbálás
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
