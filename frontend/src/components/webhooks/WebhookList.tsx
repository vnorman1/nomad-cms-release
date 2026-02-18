/**
 * Webhook List Component
 * 
 * Displays outgoing webhooks in a table/card format with actions.
 */

import { motion, AnimatePresence } from 'framer-motion';
import {
    Link2, MoreVertical, Edit2, Trash2, RotateCcw, History,
    Check, X as XIcon, Loader2, Globe, Zap
} from 'lucide-react';
import { Webhook, formatEventName } from '@/api/webhooks';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface WebhookListProps {
    webhooks: Webhook[];
    loading: boolean;
    onEdit: (webhook: Webhook) => void;
    onDelete: (webhook: Webhook) => void;
    onTest: (webhook: Webhook) => void;
    onRotateSecret: (webhook: Webhook) => void;
    onViewDeliveries: (webhook: Webhook) => void;
    onToggleActive: (webhook: Webhook) => void;
    testingId: number | null;
}

export function WebhookList({
    webhooks,
    loading,
    onEdit,
    onDelete,
    onTest,
    onRotateSecret,
    onViewDeliveries,
    onToggleActive,
    testingId
}: WebhookListProps) {
    const [openMenuId, setOpenMenuId] = useState<number | null>(null);

    if (loading && webhooks.length === 0) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 size={24} className="animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (webhooks.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <Link2 size={48} className="opacity-20 mb-4" />
                <p className="text-sm font-medium">Nincs még webhook</p>
                <p className="text-xs mt-1">Hozz létre egyet a fenti gombbal</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <AnimatePresence mode="popLayout">
                {webhooks.map((webhook, index) => (
                    <motion.div
                        key={webhook.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ delay: index * 0.05 }}
                        className={cn(
                            "group border rounded-xl p-4 transition-all hover:shadow-md",
                            webhook.is_active
                                ? "border-border bg-background"
                                : "border-border/50 bg-muted/30 opacity-75"
                        )}
                    >
                        <div className="flex items-start gap-4">
                            {/* Icon */}
                            <div className={cn(
                                "w-12 h-12 rounded-xl flex items-center justify-center shrink-0",
                                webhook.is_active
                                    ? "bg-primary/10"
                                    : "bg-muted"
                            )}>
                                <Link2 size={20} className={webhook.is_active ? "text-primary" : "text-muted-foreground"} />
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <h3 className="font-semibold text-sm truncate">
                                        {webhook.name}
                                    </h3>
                                    <span className={cn(
                                        "px-2 py-0.5 text-[10px] font-bold uppercase rounded-full",
                                        webhook.is_active
                                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                            : "bg-muted text-muted-foreground"
                                    )}>
                                        {webhook.is_active ? 'Aktív' : 'Inaktív'}
                                    </span>
                                </div>

                                {/* URL */}
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                                    <Globe size={12} />
                                    <span className="font-mono truncate">{webhook.url}</span>
                                </div>

                                {/* Events */}
                                <div className="flex flex-wrap gap-1">
                                    {webhook.events.slice(0, 4).map(event => (
                                        <span
                                            key={event}
                                            className="px-2 py-0.5 bg-muted/50 text-muted-foreground text-[10px] font-mono rounded"
                                        >
                                            {formatEventName(event)}
                                        </span>
                                    ))}
                                    {webhook.events.length > 4 && (
                                        <span className="px-2 py-0.5 bg-muted/50 text-muted-foreground text-[10px] rounded">
                                            +{webhook.events.length - 4} további
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-1 shrink-0">
                                {/* Test Button */}
                                <button
                                    onClick={() => onTest(webhook)}
                                    disabled={testingId === webhook.id || !webhook.is_active}
                                    className="h-9 px-3 flex items-center gap-1.5 text-xs font-medium rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Teszt küldése"
                                >
                                    {testingId === webhook.id ? (
                                        <Loader2 size={14} className="animate-spin" />
                                    ) : (
                                        <Zap size={14} />
                                    )}
                                    <span className="hidden sm:inline">Teszt</span>
                                </button>

                                {/* Delivery Log */}
                                <button
                                    onClick={() => onViewDeliveries(webhook)}
                                    className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
                                    title="Kézbesítési napló"
                                >
                                    <History size={16} />
                                </button>

                                {/* More Menu */}
                                <div className="relative">
                                    <button
                                        onClick={() => setOpenMenuId(openMenuId === webhook.id ? null : webhook.id)}
                                        className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
                                    >
                                        <MoreVertical size={16} />
                                    </button>

                                    <AnimatePresence>
                                        {openMenuId === webhook.id && (
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
                                                            onEdit(webhook);
                                                            setOpenMenuId(null);
                                                        }}
                                                        className="w-full px-3 py-2 flex items-center gap-2 text-sm hover:bg-muted transition-colors"
                                                    >
                                                        <Edit2 size={14} />
                                                        Szerkesztés
                                                    </button>

                                                    <button
                                                        onClick={() => {
                                                            onToggleActive(webhook);
                                                            setOpenMenuId(null);
                                                        }}
                                                        className="w-full px-3 py-2 flex items-center gap-2 text-sm hover:bg-muted transition-colors"
                                                    >
                                                        {webhook.is_active ? (
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
                                                            onRotateSecret(webhook);
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
                                                            onDelete(webhook);
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
