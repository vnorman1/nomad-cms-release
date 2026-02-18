import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import {
    MoreVertical, Edit2, Trash2, Play, RotateCcw,
    Check, Copy, ExternalLink,
    CheckCircle2, XCircle, Globe, Zap, Clock
} from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { Webhook, WebhookEndpoint, WEBHOOK_HANDLERS } from '@/api/webhooks';
import { cn } from '@/lib/utils';

// ============================================================================
// Shared Components
// ============================================================================

function StatusBadge({ isActive }: { isActive: boolean }) {
    return (
        <span className={cn(
            "inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider rounded border",
            isActive
                ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                : "bg-muted text-muted-foreground border-border"
        )}>
            <span className={cn("w-1.5 h-1.5 rounded-full", isActive ? "bg-emerald-500" : "bg-muted-foreground")} />
            {isActive ? 'AKTÍV' : 'INAKTÍV'}
        </span>
    );
}

function ActionMenu({
    onEdit,
    onDelete,
    onRotateSecret,
    onTest,
    onViewDeliveries,
    onToggleActive,
    isActive,
    isOutgoing
}: {
    onEdit: () => void;
    onDelete: () => void;
    onRotateSecret: () => void;
    onTest?: () => void;
    onViewDeliveries?: () => void;
    onToggleActive: () => void;
    isActive: boolean;
    isOutgoing: boolean;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
    const menuRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node) &&
                buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Close on scroll or resize to prevent floating menu
    useEffect(() => {
        if (!isOpen) return;
        const handleScroll = () => setIsOpen(false);
        window.addEventListener('scroll', handleScroll, { capture: true });
        window.addEventListener('resize', handleScroll);
        return () => {
            window.removeEventListener('scroll', handleScroll, { capture: true });
            window.removeEventListener('resize', handleScroll);
        };
    }, [isOpen]);

    const toggleMenu = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isOpen) {
            setIsOpen(false);
            return;
        }

        if (buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;
            const MENU_HEIGHT = 240; // Estimated height with padding
            const MENU_WIDTH = 192; // w-48 = 12rem = 192px

            // Intelligent placement logic
            let isTop = false;
            // Prefer bottom, but if not enough space and top has more space, go top
            if (spaceBelow < MENU_HEIGHT && spaceAbove > spaceBelow) {
                isTop = true;
            }

            const style: React.CSSProperties = {
                position: 'fixed',
                zIndex: 9999,
                width: '12rem', // w-48
            };

            if (isTop) {
                style.bottom = window.innerHeight - rect.top + 8;
                style.transformOrigin = 'bottom right';
            } else {
                style.top = rect.bottom + 8;
                style.transformOrigin = 'top right';
            }

            // Align right edge of menu with right edge of button
            style.left = rect.right - MENU_WIDTH;

            // Safety check: if it goes off screen to the left, align left
            if (style.left < 16) {
                style.left = 16;
                style.transformOrigin = isTop ? 'bottom left' : 'top left';
            }

            setMenuStyle(style);
            setIsOpen(true);
        }
    };

    return (
        <>
            <button
                ref={buttonRef}
                onClick={toggleMenu}
                className={cn(
                    "p-2 rounded-lg transition-colors",
                    isOpen ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
            >
                <MoreVertical size={16} />
            </button>

            {createPortal(
                <AnimatePresence>
                    {isOpen && (
                        <motion.div
                            ref={menuRef}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            style={menuStyle}
                            className="bg-background border border-border rounded-xl shadow-xl overflow-hidden"
                        >
                            <div className="p-1 space-y-0.5">
                                {isOutgoing && onTest && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onTest(); setIsOpen(false); }}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted rounded-lg transition-colors"
                                    >
                                        <Play size={14} />
                                        Tesztelés
                                    </button>
                                )}

                                <button
                                    onClick={(e) => { e.stopPropagation(); onToggleActive(); setIsOpen(false); }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted rounded-lg transition-colors"
                                >
                                    {isActive ? <XCircle size={14} /> : <CheckCircle2 size={14} />}
                                    {isActive ? 'Kikapcsolás' : 'Bekapcsolás'}
                                </button>

                                <button
                                    onClick={(e) => { e.stopPropagation(); onEdit(); setIsOpen(false); }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted rounded-lg transition-colors"
                                >
                                    <Edit2 size={14} />
                                    Szerkesztés
                                </button>

                                <button
                                    onClick={(e) => { e.stopPropagation(); onRotateSecret(); setIsOpen(false); }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted rounded-lg transition-colors"
                                >
                                    <RotateCcw size={14} />
                                    Titok Rotálása
                                </button>

                                {isOutgoing && onViewDeliveries && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onViewDeliveries(); setIsOpen(false); }}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted rounded-lg transition-colors"
                                    >
                                        <Clock size={14} />
                                        Naplók
                                    </button>
                                )}

                                <div className="h-px bg-border/50 my-1" />

                                <button
                                    onClick={(e) => { e.stopPropagation(); onDelete(); setIsOpen(false); }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                                >
                                    <Trash2 size={14} />
                                    Törlés
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}
        </>
    );
}

// ============================================================================
// Outgoing Webhook Table
// ============================================================================

interface OutgoingTableProps {
    webhooks: Webhook[];
    onEdit: (webhook: Webhook) => void;
    onDelete: (webhook: Webhook) => void;
    onTest: (webhook: Webhook) => void;
    onRotateSecret: (webhook: Webhook) => void;
    onViewDeliveries: (webhook: Webhook) => void;
    onToggleActive: (webhook: Webhook) => void;
    testingId: number | null;
}

export function OutgoingWebhookTable({
    webhooks,
    onEdit,
    onDelete,
    onTest,
    onRotateSecret,
    onViewDeliveries,
    onToggleActive,
    testingId: _testingId
}: OutgoingTableProps) {
    return (
        <div className="rounded-xl border border-border/40 bg-background/50 shadow-sm backdrop-blur-sm">
            <table className="w-full border-separate border-spacing-0">
                <thead className="bg-muted/30">
                    <tr>
                        <th className="w-16 px-4 py-3 text-center align-middle text-xs font-semibold text-muted-foreground uppercase tracking-wider first:rounded-tl-xl border-b border-border/40">
                            #
                        </th>
                        <th className="px-4 py-3 text-left align-middle text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/40">
                            Név & Események
                        </th>
                        <th className="px-4 py-3 text-left align-middle text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/40">
                            Cél URL
                        </th>
                        <th className="w-32 px-4 py-3 text-center align-middle text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/40">
                            Állapot
                        </th>
                        <th className="w-16 px-4 py-3 text-right align-middle text-xs font-semibold text-muted-foreground uppercase tracking-wider last:rounded-tr-xl border-b border-border/40">
                            Műveletek
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {webhooks.map((webhook, i) => (
                        <motion.tr
                            key={webhook.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className="group"
                        >
                            <td className={cn(
                                "px-4 py-3 align-middle text-center group-hover:bg-muted/20 transition-colors border-b border-border/30",
                                i === webhooks.length - 1 && "border-b-0 rounded-bl-xl"
                            )}>
                                <div className="w-8 h-8 mx-auto bg-blue-500/10 rounded-lg flex items-center justify-center text-blue-500">
                                    <Globe size={14} />
                                </div>
                            </td>
                            <td className={cn(
                                "px-4 py-3 align-middle group-hover:bg-muted/20 transition-colors border-b border-border/30",
                                i === webhooks.length - 1 && "border-b-0"
                            )}>
                                <div className="flex flex-col">
                                    <span className="font-medium text-sm text-foreground">{webhook.name}</span>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                        {webhook.events.slice(0, 3).map(event => (
                                            <span key={event} className="text-[10px] font-mono px-1.5 py-0.5 bg-muted rounded text-muted-foreground">
                                                {event}
                                            </span>
                                        ))}
                                        {webhook.events.length > 3 && (
                                            <span className="text-[10px] font-mono px-1.5 py-0.5 bg-muted rounded text-muted-foreground">
                                                +{webhook.events.length - 3}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </td>
                            <td className={cn(
                                "px-4 py-3 align-middle group-hover:bg-muted/20 transition-colors border-b border-border/30",
                                i === webhooks.length - 1 && "border-b-0"
                            )}>
                                <div className="flex items-center gap-2 text-sm font-mono text-muted-foreground max-w-[300px] truncate">
                                    <span className="truncate">{webhook.url}</span>
                                    <ExternalLink size={12} className="shrink-0 opacity-50" />
                                </div>
                            </td>
                            <td className={cn(
                                "px-4 py-3 align-middle text-center group-hover:bg-muted/20 transition-colors border-b border-border/30",
                                i === webhooks.length - 1 && "border-b-0"
                            )}>
                                <StatusBadge isActive={webhook.is_active} />
                            </td>
                            <td className={cn(
                                "px-4 py-3 align-middle text-right group-hover:bg-muted/20 transition-colors border-b border-border/30",
                                i === webhooks.length - 1 && "border-b-0 rounded-br-xl"
                            )}>
                                <ActionMenu
                                    onEdit={() => onEdit(webhook)}
                                    onDelete={() => onDelete(webhook)}
                                    onRotateSecret={() => onRotateSecret(webhook)}
                                    onTest={() => onTest(webhook)}
                                    onViewDeliveries={() => onViewDeliveries(webhook)}
                                    onToggleActive={() => onToggleActive(webhook)}
                                    isActive={webhook.is_active}
                                    isOutgoing={true}
                                />
                            </td>
                        </motion.tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ============================================================================
// Incoming Endpoint Table
// ============================================================================

interface IncomingTableProps {
    endpoints: WebhookEndpoint[];
    onEdit: (endpoint: WebhookEndpoint) => void;
    onDelete: (endpoint: WebhookEndpoint) => void;
    onRotateSecret: (endpoint: WebhookEndpoint) => void;
    onToggleActive: (endpoint: WebhookEndpoint) => void;
}

export function IncomingEndpointTable({
    endpoints,
    onEdit,
    onDelete,
    onRotateSecret,
    onToggleActive
}: IncomingTableProps) {
    const [copiedId, setCopiedId] = useState<number | null>(null);

    const copyUrl = (url: string, id: number) => {
        navigator.clipboard.writeText(url);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    return (
        <div className="rounded-xl border border-border/40 bg-background/50 shadow-sm backdrop-blur-sm">
            <table className="w-full border-separate border-spacing-0">
                <thead className="bg-muted/30">
                    <tr>
                        <th className="w-16 px-4 py-3 text-center align-middle text-xs font-semibold text-muted-foreground uppercase tracking-wider first:rounded-tl-xl border-b border-border/40">
                            #
                        </th>
                        <th className="px-4 py-3 text-left align-middle text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/40">
                            Leírás & Handler
                        </th>
                        <th className="px-4 py-3 text-left align-middle text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/40">
                            Endpoint URL
                        </th>
                        <th className="w-32 px-4 py-3 text-center align-middle text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/40">
                            Állapot
                        </th>
                        <th className="w-16 px-4 py-3 text-right align-middle text-xs font-semibold text-muted-foreground uppercase tracking-wider last:rounded-tr-xl border-b border-border/40">
                            Műveletek
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {endpoints.map((endpoint, i) => (
                        <motion.tr
                            key={endpoint.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className="group"
                        >
                            <td className={cn(
                                "px-4 py-3 align-middle text-center group-hover:bg-muted/20 transition-colors border-b border-border/30",
                                i === endpoints.length - 1 && "border-b-0 rounded-bl-xl"
                            )}>
                                <div className="w-8 h-8 mx-auto bg-emerald-500/10 rounded-lg flex items-center justify-center text-emerald-500">
                                    <Zap size={14} />
                                </div>
                            </td>
                            <td className={cn(
                                "px-4 py-3 align-middle group-hover:bg-muted/20 transition-colors border-b border-border/30",
                                i === endpoints.length - 1 && "border-b-0"
                            )}>
                                <div className="flex flex-col">
                                    <span className="font-medium text-sm text-foreground">{endpoint.name || 'Névtelen Endpoint'}</span>
                                    <span className="text-[10px] font-mono text-muted-foreground mt-0.5">
                                        {WEBHOOK_HANDLERS.find(h => h.value === endpoint.handler)?.label || endpoint.handler}
                                    </span>
                                </div>
                            </td>
                            <td className={cn(
                                "px-4 py-3 align-middle group-hover:bg-muted/20 transition-colors border-b border-border/30",
                                i === endpoints.length - 1 && "border-b-0"
                            )}>
                                <div className="flex items-center gap-2 group/url">
                                    <code className="text-xs font-mono bg-muted/50 px-2 py-1 rounded text-muted-foreground max-w-[300px] truncate">
                                        {endpoint.url}
                                    </code>
                                    <button
                                        onClick={() => copyUrl(endpoint.url, endpoint.id)}
                                        className="p-1 text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover/url:opacity-100"
                                        title="Másolás"
                                    >
                                        {copiedId === endpoint.id ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                                    </button>
                                </div>
                            </td>
                            <td className={cn(
                                "px-4 py-3 align-middle text-center group-hover:bg-muted/20 transition-colors border-b border-border/30",
                                i === endpoints.length - 1 && "border-b-0"
                            )}>
                                <StatusBadge isActive={endpoint.is_active} />
                            </td>
                            <td className={cn(
                                "px-4 py-3 align-middle text-right group-hover:bg-muted/20 transition-colors border-b border-border/30",
                                i === endpoints.length - 1 && "border-b-0 rounded-br-xl"
                            )}>
                                <ActionMenu
                                    onEdit={() => onEdit(endpoint)}
                                    onDelete={() => onDelete(endpoint)}
                                    onRotateSecret={() => onRotateSecret(endpoint)}
                                    onToggleActive={() => onToggleActive(endpoint)}
                                    isActive={endpoint.is_active}
                                    isOutgoing={false}
                                />
                            </td>
                        </motion.tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
