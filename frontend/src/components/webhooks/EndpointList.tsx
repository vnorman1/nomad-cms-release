/**
 * Endpoint List Component
 * 
 * Displays incoming webhook endpoints in a table/card format with actions.
 */

import { motion, AnimatePresence } from 'framer-motion';
import {
    Webhook, MoreVertical, Edit2, Trash2, RotateCcw, Copy,
    Check, X as XIcon, Loader2, CheckCircle2
} from 'lucide-react';
import { WebhookEndpoint, WEBHOOK_HANDLERS } from '@/api/webhooks';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface EndpointListProps {
    endpoints: WebhookEndpoint[];
    loading: boolean;
    onEdit: (endpoint: WebhookEndpoint) => void;
    onDelete: (endpoint: WebhookEndpoint) => void;
    onRotateSecret: (endpoint: WebhookEndpoint) => void;
    onToggleActive: (endpoint: WebhookEndpoint) => void;
}

export function EndpointList({
    endpoints,
    loading,
    onEdit,
    onDelete,
    onRotateSecret,
    onToggleActive
}: EndpointListProps) {
    const [openMenuId, setOpenMenuId] = useState<number | null>(null);
    const [copiedId, setCopiedId] = useState<number | null>(null);

    const copyUrl = (endpoint: WebhookEndpoint) => {
        navigator.clipboard.writeText(endpoint.url);
        setCopiedId(endpoint.id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const getHandlerLabel = (handler: string) => {
        return WEBHOOK_HANDLERS.find(h => h.value === handler)?.label || handler;
    };

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return 'Még soha';
        return new Date(dateStr).toLocaleString('hu-HU', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    if (loading && endpoints.length === 0) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 size={24} className="animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (endpoints.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <Webhook size={48} className="opacity-20 mb-4" />
                <p className="text-sm font-medium">Nincs még bejövő endpoint</p>
                <p className="text-xs mt-1">Hozz létre egyet a fenti gombbal</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <AnimatePresence mode="popLayout">
                {endpoints.map((endpoint, index) => (
                    <motion.div
                        key={endpoint.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ delay: index * 0.05 }}
                        className={cn(
                            "group border rounded-xl p-4 transition-all hover:shadow-md",
                            endpoint.is_active
                                ? "border-border bg-background"
                                : "border-border/50 bg-muted/30 opacity-75"
                        )}
                    >
                        <div className="flex items-start gap-4">
                            {/* Icon */}
                            <div className={cn(
                                "w-12 h-12 rounded-xl flex items-center justify-center shrink-0",
                                endpoint.is_active
                                    ? "bg-emerald-500/10"
                                    : "bg-muted"
                            )}>
                                <Webhook size={20} className={endpoint.is_active ? "text-emerald-500" : "text-muted-foreground"} />
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <h3 className="font-semibold text-sm truncate">
                                        {endpoint.name}
                                    </h3>
                                    <span className={cn(
                                        "px-2 py-0.5 text-[10px] font-bold uppercase rounded-full",
                                        endpoint.is_active
                                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                            : "bg-muted text-muted-foreground"
                                    )}>
                                        {endpoint.is_active ? 'Aktív' : 'Inaktív'}
                                    </span>
                                </div>

                                {/* URL with Copy */}
                                <div className="flex items-center gap-2 mb-2">
                                    <code className="px-2 py-1 bg-muted/50 text-xs font-mono rounded truncate max-w-md">
                                        {endpoint.url}
                                    </code>
                                    <button
                                        onClick={() => copyUrl(endpoint)}
                                        className="p-1.5 hover:bg-muted rounded transition-colors shrink-0"
                                        title="URL másolása"
                                    >
                                        {copiedId === endpoint.id ? (
                                            <CheckCircle2 size={14} className="text-emerald-500" />
                                        ) : (
                                            <Copy size={14} className="text-muted-foreground" />
                                        )}
                                    </button>
                                </div>

                                {/* Handler & Last Called */}
                                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                    <span>
                                        Handler: <strong>{getHandlerLabel(endpoint.handler)}</strong>
                                    </span>
                                    <span>
                                        Utolsó hívás: <strong>{formatDate(endpoint.last_called_at)}</strong>
                                    </span>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-1 shrink-0">
                                {/* More Menu */}
                                <div className="relative">
                                    <button
                                        onClick={() => setOpenMenuId(openMenuId === endpoint.id ? null : endpoint.id)}
                                        className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
                                    >
                                        <MoreVertical size={16} />
                                    </button>

                                    <AnimatePresence>
                                        {openMenuId === endpoint.id && (
                                            <>
                                                {/* Backdrop */}
                                                <div
                                                    className="fixed inset-0 z-10"
                                                    onClick={() => setOpenMenuId(null)}
                                                />

                                                {/* Menu */}
                                                <motion.div
                                                    initial={{ opacity: 0, scale: 0.95 }}
                                                    animate={{ opacity: 1, scale: 1 }}
                                                    exit={{ opacity: 0, scale: 0.95 }}
                                                    className="absolute right-0 top-full mt-1 w-48 bg-background border border-border rounded-lg shadow-xl z-20 py-1 overflow-hidden"
                                                >
                                                    <button
                                                        onClick={() => {
                                                            onEdit(endpoint);
                                                            setOpenMenuId(null);
                                                        }}
                                                        className="w-full px-3 py-2 flex items-center gap-2 text-sm hover:bg-muted transition-colors"
                                                    >
                                                        <Edit2 size={14} />
                                                        Szerkesztés
                                                    </button>

                                                    <button
                                                        onClick={() => {
                                                            onToggleActive(endpoint);
                                                            setOpenMenuId(null);
                                                        }}
                                                        className="w-full px-3 py-2 flex items-center gap-2 text-sm hover:bg-muted transition-colors"
                                                    >
                                                        {endpoint.is_active ? (
                                                            <>
                                                                <XIcon size={14} />
                                                                Deaktiválás
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Check size={14} />
                                                                Aktiválás
                                                            </>
                                                        )}
                                                    </button>

                                                    <button
                                                        onClick={() => {
                                                            onRotateSecret(endpoint);
                                                            setOpenMenuId(null);
                                                        }}
                                                        className="w-full px-3 py-2 flex items-center gap-2 text-sm hover:bg-muted transition-colors"
                                                    >
                                                        <RotateCcw size={14} />
                                                        Secret Újragenerálás
                                                    </button>

                                                    <div className="border-t border-border my-1" />

                                                    <button
                                                        onClick={() => {
                                                            onDelete(endpoint);
                                                            setOpenMenuId(null);
                                                        }}
                                                        className="w-full px-3 py-2 flex items-center gap-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                                                    >
                                                        <Trash2 size={14} />
                                                        Törlés
                                                    </button>
                                                </motion.div>
                                            </>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
}
