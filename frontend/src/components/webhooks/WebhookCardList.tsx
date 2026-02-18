/**
 * Unified Webhook Card List Component
 * 
 * Nomad Design System card-based list for both outgoing and incoming webhooks.
 * Features:
 * - Consistent styling across both webhook types
 * - Micro-interactions and animations
 * - Visual hierarchy and scanning patterns
 * - Contextual actions
 */

import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowUpRight, ArrowDownLeft, MoreVertical, Play, Edit2, Trash2, Key,
    FileText, ExternalLink, CheckCircle2, XCircle, Copy, Check, Loader2,
    Webhook, Globe, Clock, Zap, Shield, Activity
} from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Webhook as WebhookType, WebhookEndpoint, WEBHOOK_HANDLERS } from '@/api/webhooks';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

interface OutgoingCardProps {
    webhook: WebhookType;
    onEdit: () => void;
    onDelete: () => void;
    onTest: () => void;
    onRotateSecret: () => void;
    onViewDeliveries: () => void;
    onToggleActive: () => void;
    isTesting: boolean;
}

interface IncomingCardProps {
    endpoint: WebhookEndpoint;
    onEdit: () => void;
    onDelete: () => void;
    onRotateSecret: () => void;
    onToggleActive: () => void;
}

// ============================================================================
// Helper Components
// ============================================================================

function StatusIndicator({ isActive, onClick }: { isActive: boolean; onClick: () => void }) {
    return (
        <button
            onClick={(e) => { e.stopPropagation(); onClick(); }}
            className={cn(
                "relative flex items-center justify-center w-8 h-8 transition-all duration-300 border",
                "group/status hover:scale-105",
                isActive
                    ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-500"
                    : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
            )}
            title={isActive ? 'Aktív - kattints a kikapcsoláshoz' : 'Inaktív - kattints a bekapcsoláshoz'}
        >
            {isActive ? (
                <>
                    <CheckCircle2 strokeWidth={1} size={14} className="relative z-10" />
                    <span className="absolute inset-0 bg-emerald-500/10 animate-pulse opacity-30" />
                </>
            ) : (
                <XCircle strokeWidth={1} size={14} />
            )}
        </button>
    );
}

function DirectionBadge({ type }: { type: 'outgoing' | 'incoming' }) {
    const isOutgoing = type === 'outgoing';
    return (
        <div className={cn(
            "inline-flex items-center gap-1.5 px-2 py-0.5 border text-[9px] font-mono uppercase tracking-widest",
            isOutgoing
                ? "border-blue-500/20 text-blue-500 bg-blue-500/5"
                : "border-emerald-500/20 text-emerald-500 bg-emerald-500/5"
        )}>
            {isOutgoing ? <ArrowUpRight size={10} /> : <ArrowDownLeft size={10} />}
            {isOutgoing ? 'OUTGOING' : 'INCOMING'}
        </div>
    );
}

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <button
            onClick={handleCopy}
            className={cn(
                "p-1.5 transition-all border border-transparent hover:border-foreground",
                copied
                    ? "text-emerald-500"
                    : "text-muted-foreground hover:text-foreground"
            )}
            title="URL másolása"
        >
            {copied ? <Check size={10} /> : <Copy size={10} />}
        </button>
    );
}

function ActionMenu({ 
    children, 
    isOpen, 
    onToggle 
}: { 
    children: React.ReactNode; 
    isOpen: boolean; 
    onToggle: () => void 
}) {
    const buttonRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ top: 0, left: 0 });

    useEffect(() => {
        if (isOpen && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setPosition({
                top: rect.bottom + 4,
                left: rect.right - 192
            });
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (
                menuRef.current && !menuRef.current.contains(e.target as Node) &&
                buttonRef.current && !buttonRef.current.contains(e.target as Node)
            ) {
                onToggle();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen, onToggle]);

    return (
        <>
            <button
                ref={buttonRef}
                onClick={(e) => { e.stopPropagation(); onToggle(); }}
                className={cn(
                    "w-8 h-8 flex items-center justify-center transition-all border border-transparent",
                    isOpen
                        ? "bg-foreground text-background"
                        : "hover:border-foreground text-muted-foreground hover:text-foreground"
                )}
            >
                <MoreVertical size={14} />
            </button>

            {isOpen && createPortal(
                <motion.div
                    ref={menuRef}
                    initial={{ opacity: 0, scale: 0.95, y: -8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    style={{ top: position.top, left: position.left }}
                    className="fixed w-48 bg-background border border-border shadow-2xl z-[9999]"
                >
                    {children}
                </motion.div>,
                document.body
            )}
        </>
    );
}

function MenuItem({ 
    icon: Icon, 
    label, 
    onClick, 
    variant = 'default' 
}: { 
    icon: React.ElementType; 
    label: string; 
    onClick: () => void; 
    variant?: 'default' | 'danger' 
}) {
    return (
        <button
            onClick={(e) => { e.stopPropagation(); onClick(); }}
            className={cn(
                "w-full px-4 py-3 text-left text-[10px] font-mono uppercase tracking-widest flex items-center gap-3 transition-colors border-b border-border last:border-0",
                variant === 'danger'
                    ? "hover:bg-red-500/10 text-red-500"
                    : "hover:bg-foreground/5 text-foreground"
            )}
        >
            <Icon size={12} className={variant === 'danger' ? 'text-red-500' : 'text-muted-foreground'} />
            {label}
        </button>
    );
}

// ============================================================================
// Outgoing Webhook Card
// ============================================================================

export function OutgoingWebhookCard({
    webhook,
    onEdit,
    onDelete,
    onTest,
    onRotateSecret,
    onViewDeliveries,
    onToggleActive,
    isTesting
}: OutgoingCardProps) {
    const [menuOpen, setMenuOpen] = useState(false);

    const eventCount = webhook.events.length;
    const fieldCount = webhook.payload_fields?.length || 0;

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={cn(
                "group relative border bg-background transition-all duration-300",
                "hover:border-foreground",
                webhook.is_active
                    ? "border-border"
                    : "border-border/50 opacity-60 hover:opacity-100"
            )}
        >
            {/* Blueprint Crosshairs */}
            <div className="absolute inset-x-6 top-1/2 h-px bg-foreground/10 scale-x-0 group-hover:scale-x-100 transition-transform duration-700 delay-100 pointer-events-none" />
            <div className="absolute inset-y-6 left-1/2 w-px bg-foreground/10 scale-y-0 group-hover:scale-y-100 transition-transform duration-700 delay-200 pointer-events-none" />

            <div className="p-6 relative z-10">
                <div className="flex items-start gap-6">
                    {/* Status */}
                    <StatusIndicator isActive={webhook.is_active} onClick={onToggleActive} />

                    {/* Content */}
                    <div className="flex-1 min-w-0 space-y-4">
                        {/* Header */}
                        <div className="flex items-start justify-between gap-4">
                            <div className="space-y-2">
                                <div className="flex items-center gap-3 flex-wrap">
                                    <h3 className="text-xl font-light tracking-tight text-foreground truncate max-w-[200px] sm:max-w-none group-hover:translate-x-1 transition-transform duration-300">
                                        {webhook.name}
                                    </h3>
                                    <DirectionBadge type="outgoing" />
                                </div>
                                <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
                                    <Globe size={10} />
                                    <code className="truncate max-w-[240px] sm:max-w-[360px] opacity-60">
                                        {webhook.url}
                                    </code>
                                    <CopyButton text={webhook.url} />
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-2 shrink-0">
                                <button
                                    onClick={(e) => { e.stopPropagation(); onTest(); }}
                                    disabled={isTesting || !webhook.is_active}
                                    className={cn(
                                        "w-8 h-8 flex items-center justify-center transition-all border border-transparent",
                                        webhook.is_active
                                            ? "hover:border-blue-500 text-muted-foreground hover:text-blue-500"
                                            : "opacity-30 cursor-not-allowed"
                                    )}
                                    title="Teszt küldése"
                                >
                                    {isTesting ? (
                                        <Loader2 size={14} className="animate-spin" />
                                    ) : (
                                        <Play size={14} />
                                    )}
                                </button>

                                <ActionMenu isOpen={menuOpen} onToggle={() => setMenuOpen(!menuOpen)}>
                                    <MenuItem icon={Edit2} label="Szerkesztés" onClick={() => { onEdit(); setMenuOpen(false); }} />
                                    <MenuItem icon={FileText} label="Kézbesítések" onClick={() => { onViewDeliveries(); setMenuOpen(false); }} />
                                    <MenuItem icon={Key} label="Secret forgatás" onClick={() => { onRotateSecret(); setMenuOpen(false); }} />
                                    <a
                                        href={webhook.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="w-full px-3 py-2.5 text-left text-sm flex items-center gap-2.5 hover:bg-muted text-foreground transition-colors"
                                    >
                                        <ExternalLink size={12} className="text-muted-foreground" />
                                        URL megnyitása
                                    </a>
                                    <div className="h-px bg-border mx-2 my-1" />
                                    <MenuItem icon={Trash2} label="Törlés" onClick={() => { onDelete(); setMenuOpen(false); }} variant="danger" />
                                </ActionMenu>
                            </div>
                        </div>

                        {/* Stats */}
                        <div className="flex items-center gap-4 pt-2 border-t border-border/50 group-hover:border-foreground/20 transition-colors">
                            <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest">
                                <Zap size={10} className="text-amber-500" />
                                <span className="text-muted-foreground">{eventCount} esemény</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest">
                                <Shield size={10} className="text-blue-500" />
                                <span className="text-muted-foreground">
                                    {fieldCount > 0 ? `${fieldCount} mező` : 'Teljes payload'}
                                </span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest ml-auto">
                                <Clock size={10} className="text-muted-foreground" />
                                <span className="text-muted-foreground">
                                    {new Date(webhook.created_at).toLocaleDateString('hu-HU', {
                                        month: 'short',
                                        day: 'numeric'
                                    })}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

// ============================================================================
// Incoming Endpoint Card
// ============================================================================

export function IncomingEndpointCard({
    endpoint,
    onEdit,
    onDelete,
    onRotateSecret,
    onToggleActive
}: IncomingCardProps) {
    const [menuOpen, setMenuOpen] = useState(false);

    const getHandlerLabel = (handler: string) => {
        return WEBHOOK_HANDLERS.find(h => h.value === handler)?.label || handler;
    };

    const formatLastCalled = (dateStr: string | null) => {
        if (!dateStr) return 'Még soha';
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return 'Most';
        if (minutes < 60) return `${minutes} perce`;
        if (hours < 24) return `${hours} órája`;
        if (days < 7) return `${days} napja`;
        return date.toLocaleDateString('hu-HU', { month: 'short', day: 'numeric' });
    };

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={cn(
                "group relative border bg-background transition-all duration-300",
                "hover:border-foreground",
                endpoint.is_active
                    ? "border-border"
                    : "border-border/50 opacity-60 hover:opacity-100"
            )}
        >
            {/* Blueprint Crosshairs */}
            <div className="absolute inset-x-6 top-1/2 h-px bg-foreground/10 scale-x-0 group-hover:scale-x-100 transition-transform duration-700 delay-100 pointer-events-none" />
            <div className="absolute inset-y-6 left-1/2 w-px bg-foreground/10 scale-y-0 group-hover:scale-y-100 transition-transform duration-700 delay-200 pointer-events-none" />

            <div className="p-6 relative z-10">
                <div className="flex items-start gap-6">
                    {/* Status */}
                    <StatusIndicator isActive={endpoint.is_active} onClick={onToggleActive} />

                    {/* Content */}
                    <div className="flex-1 min-w-0 space-y-4">
                        {/* Header */}
                        <div className="flex items-start justify-between gap-4">
                            <div className="space-y-2">
                                <div className="flex items-center gap-3 flex-wrap">
                                    <h3 className="text-xl font-light tracking-tight text-foreground truncate max-w-[200px] sm:max-w-none group-hover:translate-x-1 transition-transform duration-300">
                                        {endpoint.name}
                                    </h3>
                                    <DirectionBadge type="incoming" />
                                </div>
                                <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
                                    <Webhook size={10} />
                                    <code className="truncate max-w-[240px] sm:max-w-[360px] opacity-60">
                                        {endpoint.url}
                                    </code>
                                    <CopyButton text={endpoint.url} />
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-2 shrink-0">
                                <ActionMenu isOpen={menuOpen} onToggle={() => setMenuOpen(!menuOpen)}>
                                    <MenuItem icon={Edit2} label="Szerkesztés" onClick={() => { onEdit(); setMenuOpen(false); }} />
                                    <MenuItem icon={Key} label="Secret forgatás" onClick={() => { onRotateSecret(); setMenuOpen(false); }} />
                                    <div className="h-px bg-border mx-2 my-1" />
                                    <MenuItem icon={Trash2} label="Törlés" onClick={() => { onDelete(); setMenuOpen(false); }} variant="danger" />
                                </ActionMenu>
                            </div>
                        </div>

                        {/* Stats */}
                        <div className="flex items-center gap-4 pt-2 border-t border-border/50 group-hover:border-foreground/20 transition-colors">
                            <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest">
                                <Zap size={10} className="text-emerald-500" />
                                <span className="text-muted-foreground">{getHandlerLabel(endpoint.handler)}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest ml-auto">
                                <Activity size={10} className="text-muted-foreground" />
                                <span className="text-muted-foreground">
                                    {formatLastCalled(endpoint.last_called_at)}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

// ============================================================================
// List Wrappers
// ============================================================================

interface OutgoingListProps {
    webhooks: WebhookType[];
    loading: boolean;
    testingId: number | null;
    onEdit: (webhook: WebhookType) => void;
    onDelete: (webhook: WebhookType) => void;
    onTest: (webhook: WebhookType) => void;
    onRotateSecret: (webhook: WebhookType) => void;
    onViewDeliveries: (webhook: WebhookType) => void;
    onToggleActive: (webhook: WebhookType) => void;
    onCreateNew: () => void;
}

interface IncomingListProps {
    endpoints: WebhookEndpoint[];
    loading: boolean;
    onEdit: (endpoint: WebhookEndpoint) => void;
    onDelete: (endpoint: WebhookEndpoint) => void;
    onRotateSecret: (endpoint: WebhookEndpoint) => void;
    onToggleActive: (endpoint: WebhookEndpoint) => void;
    onCreateNew: () => void;
}

// Empty state component
function EmptyState({ type, onCreateNew }: { type: 'outgoing' | 'incoming'; onCreateNew: () => void }) {
    const isOutgoing = type === 'outgoing';
    
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative flex flex-col items-center justify-center py-24 px-4 border border-dashed border-border/50"
        >
            {/* Animated background rings - kept as circles for visual interest but container is sharp */}
            <div className="absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none">
                {[0, 1, 2].map((i) => (
                    <motion.div
                        key={i}
                        className={cn(
                            "absolute border",
                            isOutgoing ? "border-blue-500/5" : "border-emerald-500/5"
                        )}
                        initial={{ width: 100 + i * 80, height: 100 + i * 80, opacity: 0 }}
                        animate={{
                            width: [100 + i * 80, 140 + i * 80, 100 + i * 80],
                            height: [100 + i * 80, 140 + i * 80, 100 + i * 80],
                            opacity: [0.3, 0.1, 0.3]
                        }}
                        transition={{
                            duration: 3,
                            delay: i * 0.5,
                            repeat: Infinity,
                            ease: "easeInOut"
                        }}
                    />
                ))}
            </div>

            {/* Icon */}
            <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.1 }}
                className={cn(
                    "relative z-10 w-16 h-16 flex items-center justify-center mb-6 border",
                    isOutgoing ? "border-blue-500/20 bg-blue-500/5 text-blue-500" : "border-emerald-500/20 bg-emerald-500/5 text-emerald-500"
                )}
            >
                {isOutgoing ? (
                    <ArrowUpRight strokeWidth={1} size={32} />
                ) : (
                    <ArrowDownLeft strokeWidth={1} size={32} />
                )}
            </motion.div>

            {/* Text */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="relative z-10 text-center space-y-2 mb-8"
            >
                <h3 className="text-xl font-light tracking-tight text-foreground uppercase">
                    {isOutgoing ? 'NINCS KIMENŐ WEBHOOK' : 'NINCS BEJÖVŐ ENDPOINT'}
                </h3>
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground max-w-md leading-relaxed">
                    {isOutgoing
                        ? 'A kimenő webhookok értesítik a külső szolgáltatásokat amikor események történnek a CMS-ben.'
                        : 'A bejövő endpointok fogadják a külső szolgáltatások webhookjait, pl. fizetési értesítések.'}
                </p>
            </motion.div>

            {/* CTA */}
            <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={onCreateNew}
                className={cn(
                    "relative z-10 px-6 py-3 text-[10px] font-mono uppercase tracking-widest transition-all border",
                    "border-foreground hover:bg-foreground hover:text-background"
                )}
            >
                {isOutgoing ? 'ELSŐ WEBHOOK LÉTREHOZÁSA' : 'ELSŐ ENDPOINT LÉTREHOZÁSA'}
            </motion.button>
        </motion.div>
    );
}

// Loading state
function LoadingState() {
    return (
        <div className="flex flex-col items-center justify-center py-24">
            <Loader2 strokeWidth={1} size={32} className="animate-spin text-foreground/50 mb-4" />
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Betöltés...</span>
        </div>
    );
}

export function OutgoingWebhookList({
    webhooks,
    loading,
    testingId,
    onEdit,
    onDelete,
    onTest,
    onRotateSecret,
    onViewDeliveries,
    onToggleActive,
    onCreateNew
}: OutgoingListProps) {
    if (loading && webhooks.length === 0) {
        return <LoadingState />;
    }

    if (webhooks.length === 0) {
        return <EmptyState type="outgoing" onCreateNew={onCreateNew} />;
    }

    return (
        <div className="space-y-3">
            <AnimatePresence mode="popLayout">
                {webhooks.map((webhook) => (
                    <OutgoingWebhookCard
                        key={webhook.id}
                        webhook={webhook}
                        onEdit={() => onEdit(webhook)}
                        onDelete={() => onDelete(webhook)}
                        onTest={() => onTest(webhook)}
                        onRotateSecret={() => onRotateSecret(webhook)}
                        onViewDeliveries={() => onViewDeliveries(webhook)}
                        onToggleActive={() => onToggleActive(webhook)}
                        isTesting={testingId === webhook.id}
                    />
                ))}
            </AnimatePresence>
        </div>
    );
}

export function IncomingEndpointList({
    endpoints,
    loading,
    onEdit,
    onDelete,
    onRotateSecret,
    onToggleActive,
    onCreateNew
}: IncomingListProps) {
    if (loading && endpoints.length === 0) {
        return <LoadingState />;
    }

    if (endpoints.length === 0) {
        return <EmptyState type="incoming" onCreateNew={onCreateNew} />;
    }

    return (
        <div className="space-y-3">
            <AnimatePresence mode="popLayout">
                {endpoints.map((endpoint) => (
                    <IncomingEndpointCard
                        key={endpoint.id}
                        endpoint={endpoint}
                        onEdit={() => onEdit(endpoint)}
                        onDelete={() => onDelete(endpoint)}
                        onRotateSecret={() => onRotateSecret(endpoint)}
                        onToggleActive={() => onToggleActive(endpoint)}
                    />
                ))}
            </AnimatePresence>
        </div>
    );
}
