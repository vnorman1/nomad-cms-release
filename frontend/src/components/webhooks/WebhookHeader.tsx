/**
 * Webhook Header Component
 * 
 * Header component for WebhooksPage with unified styling matching the Nomad design system.
 */

import { motion } from 'framer-motion';
import { ArrowUpRight, ArrowDownLeft, RefreshCw, Plus, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WebhookHeaderProps {
    webhookCount: number;
    endpointCount: number;
    loading: boolean;
    activeTab: 'outgoing' | 'incoming';
    onRefresh: () => void;
    onCreate: () => void;
}

export function WebhookHeader({
    webhookCount,
    endpointCount,
    loading,
    activeTab,
    onRefresh,
    onCreate
}: WebhookHeaderProps) {
    const isOutgoing = activeTab === 'outgoing';
    
    return (
        <div className="flex items-end justify-between border-b border-border pb-6">
            <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                    <motion.div 
                        key={activeTab}
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className={cn(
                            "w-8 h-8 flex items-center justify-center border transition-all",
                            isOutgoing 
                                ? "bg-blue-500/10 border-blue-500/20 text-blue-500"
                                : "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
                        )}
                    >
                        {isOutgoing ? (
                            <ArrowUpRight strokeWidth={1} size={18} />
                        ) : (
                            <ArrowDownLeft strokeWidth={1} size={18} />
                        )}
                    </motion.div>
                    <span className="text-[10px] font-mono uppercase tracking-widest opacity-60">
                        {isOutgoing ? 'Kimenő Rendszer' : 'Bejövő Kapu'}
                    </span>
                </div>

                <div className="flex items-baseline gap-4">
                    <h2 className="text-4xl font-light tracking-tight text-foreground">WEBHOOKS</h2>
                    <div className="flex items-center gap-1.5 px-1.5 py-0.5 border border-foreground/20 text-[9px] font-mono uppercase tracking-widest opacity-60">
                        <Shield size={10} />
                        <span>HMAC SECURE</span>
                    </div>
                </div>
                
                <div className="flex items-center gap-4 text-[10px] font-mono uppercase tracking-widest mt-1">
                    <span className={cn(
                        "transition-all",
                        isOutgoing ? "text-blue-500" : "text-muted-foreground"
                    )}>
                        {webhookCount} OUTGOING
                    </span>
                    <span className="text-border">/</span>
                    <span className={cn(
                        "transition-all",
                        !isOutgoing ? "text-emerald-500" : "text-muted-foreground"
                    )}>
                        {endpointCount} INCOMING
                    </span>
                    {loading && <span className="animate-pulse text-foreground">SYNCING...</span>}
                </div>
            </div>

            <div className="flex items-center gap-3">
                <button
                    onClick={onRefresh}
                    disabled={loading}
                    className="h-10 w-10 flex items-center justify-center border border-border hover:bg-foreground hover:text-background transition-all disabled:opacity-50"
                    title="Frissítés"
                >
                    <RefreshCw strokeWidth={1} size={16} className={loading ? 'animate-spin' : ''} />
                </button>
                <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={onCreate}
                    className={cn(
                        "h-10 px-6 transition-all flex items-center gap-2 text-xs font-mono uppercase tracking-widest",
                        "border border-foreground hover:bg-foreground hover:text-background"
                    )}
                >
                    <Plus strokeWidth={1} size={14} />
                    {isOutgoing ? 'ÚJ WEBHOOK' : 'ÚJ ENDPOINT'}
                </motion.button>
            </div>
        </div>
    );
}
