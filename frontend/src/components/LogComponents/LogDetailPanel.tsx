import { motion } from 'framer-motion';
import { useState } from 'react';
import { X, Copy, Check, Clock, Key, User, Globe, Server, ArrowRight, Webhook, AlertTriangle, RotateCw, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LogEntry } from '@/api/logs';
import { LEVEL_CONFIG } from './constants';

interface LogDetailPanelProps {
    log: LogEntry;
    onClose: () => void;
}

// Helper to render data row
function DataRow({ label, value, icon: RowIcon, className }: { label: string; value: React.ReactNode; icon?: LucideIcon; className?: string }) {
    return (
        <div className={cn("flex items-start gap-3 py-2 border-b border-border/30 last:border-0", className)}>
            <div className="flex items-center gap-2 w-28 flex-shrink-0">
                {RowIcon && <RowIcon size={12} className="text-muted-foreground" />}
                <span className="text-xs font-mono text-muted-foreground uppercase">{label}</span>
            </div>
            <div className="flex-1 text-sm font-mono break-all">{value}</div>
        </div>
    );
}

export function LogDetailPanel({ log, onClose }: LogDetailPanelProps) {
    const [copied, setCopied] = useState(false);
    const levelCfg = LEVEL_CONFIG[log.level as keyof typeof LEVEL_CONFIG] || LEVEL_CONFIG.INFO;
    const Icon = levelCfg.icon;

    // Parse the message to extract JSON context or Webhook data
    const parseLogMessage = (message: string) => {
        // 1. Try to parse Webhook Queue logs
        if (message.includes('[WEBHOOK QUEUE]')) {
            const parts = message.split('[WEBHOOK QUEUE]');
            const content = parts[1]?.trim() || '';

            const [statusMsg, ...rest] = content.split(':');
            const kvPart = rest.join(':').trim();

            const data: Record<string, unknown> = {
                type: 'webhook_queue',
                status_message: statusMsg.trim()
            };

            if (kvPart) {
                const regex = /([a-zA-Z0-9_]+)=(.*?)(?:, (?=[a-zA-Z0-9_]+=)|$)/g;
                let match;
                while ((match = regex.exec(kvPart)) !== null) {
                    const [_, key, value] = match;
                    data[key] = value;
                }
            }
            return { text: content, data };
        }

        // 2. Try to parse JSON
        const jsonMatch = message.match(/\{.*\}$/s);
        if (jsonMatch) {
            try {
                const jsonData = JSON.parse(jsonMatch[0]);
                const textPart = message.replace(jsonMatch[0], '').trim();
                return { text: textPart, data: jsonData };
            } catch {
                return { text: message, data: null };
            }
        }
        return { text: message, data: null };
    };

    const { text: messageText, data: logData } = parseLogMessage(log.message);

    const copyToClipboard = async () => {
        const fullData = {
            timestamp: log.timestamp,
            level: log.level,
            message: messageText,
            ...logData
        };
        await navigator.clipboard.writeText(JSON.stringify(fullData, null, 2));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-y-0 right-0 w-full max-w-lg bg-background border-l border-border z-50 overflow-hidden flex flex-col shadow-2xl"
        >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border bg-muted/30">
                <div className="flex items-center gap-3">
                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", levelCfg.bg, levelCfg.border, "border")}>
                        <Icon size={16} className={levelCfg.color} />
                    </div>
                    <div>
                        <h3 className="font-semibold text-sm">Log Részletek</h3>
                        <span className={cn("text-xs font-mono uppercase", levelCfg.color)}>{log.level}</span>
                    </div>
                </div>
                <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg transition-colors">
                    <X size={18} />
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {/* Timestamp & Message */}
                <div className="space-y-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock size={12} />
                        <span className="font-mono">{log.timestamp}</span>
                    </div>
                    <div className={cn("p-3 rounded-lg border", levelCfg.bg, levelCfg.border)}>
                        <p className="font-mono text-sm break-all">{messageText}</p>
                    </div>
                </div>

                {/* Parsed Data */}
                {logData && (
                    <div className="space-y-4">
                        {/* Webhook Queue Special Section */}
                        {logData.type === 'webhook_queue' && (
                            <div className="space-y-1">
                                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                                    <Webhook size={12} />
                                    Webhook Queue Info
                                </h4>
                                <div className="bg-muted/30 rounded-lg p-3 border border-border/50">
                                    <DataRow
                                        label="Status"
                                        value={
                                            <span className={cn(
                                                "font-bold",
                                                (logData.status_message as string)?.toLowerCase().includes('success') ? "text-emerald-500" : "text-amber-500"
                                            )}>
                                                {logData.status_message}
                                            </span>
                                        }
                                    />
                                    {logData.event && <DataRow label="Event" value={<span className="font-bold px-1.5 py-0.5 bg-foreground/10 rounded">{logData.event}</span>} />}
                                    {logData.webhook_id && <DataRow label="Webhook ID" value={logData.webhook_id} />}
                                    {logData.attempts && (
                                        <DataRow
                                            label="Attempts"
                                            value={logData.attempts}
                                            icon={RotateCw}
                                        />
                                    )}
                                    {logData.error && (
                                        <div className="mt-2 pt-2 border-t border-border/30">
                                            <div className="flex items-center gap-2 mb-1 text-red-400">
                                                <AlertTriangle size={12} />
                                                <span className="text-xs font-mono uppercase">Error Detail</span>
                                            </div>
                                            <p className="text-xs text-red-500/90 font-mono break-words bg-red-500/5 p-2 rounded border border-red-500/20">
                                                {logData.error}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Request Info */}
                        {(logData.method || logData.uri || logData.status) && (
                            <div className="space-y-1">
                                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                                    <Server size={12} />
                                    Request Info
                                </h4>
                                <div className="bg-muted/30 rounded-lg p-3 border border-border/50">
                                    {logData.method && <DataRow label="Method" value={<span className="font-bold">{logData.method}</span>} />}
                                    {logData.uri && <DataRow label="URI" value={logData.uri} />}
                                    {logData.status && (
                                        <DataRow
                                            label="Status"
                                            value={
                                                <span className={cn(
                                                    "px-2 py-0.5 rounded text-xs font-bold",
                                                    logData.status >= 500 ? "bg-red-500/20 text-red-500" :
                                                        logData.status >= 400 ? "bg-amber-500/20 text-amber-500" :
                                                            "bg-emerald-500/20 text-emerald-500"
                                                )}>
                                                    {logData.status}
                                                </span>
                                            }
                                        />
                                    )}
                                    {logData.time_ms !== undefined && <DataRow label="Time" value={`${logData.time_ms}ms`} />}
                                    {logData.request_id && <DataRow label="Request ID" value={logData.request_id} />}
                                </div>
                            </div>
                        )}

                        {/* Auth Info */}
                        {logData.auth_type && (
                            <div className="space-y-1">
                                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                                    {logData.auth_type === 'api_key' ? <Key size={12} /> : <User size={12} />}
                                    Authentication
                                </h4>
                                <div className="bg-muted/30 rounded-lg p-3 border border-border/50">
                                    <DataRow
                                        label="Type"
                                        value={
                                            <span className={cn(
                                                "px-2 py-0.5 rounded text-xs font-bold uppercase",
                                                logData.auth_type === 'api_key' ? "bg-purple-500/20 text-purple-500" :
                                                    logData.auth_type === 'jwt' ? "bg-blue-500/20 text-blue-500" :
                                                        "bg-gray-500/20 text-gray-500"
                                            )}>
                                                {logData.auth_type}
                                            </span>
                                        }
                                    />
                                    {logData.user_id && <DataRow label="User ID" value={logData.user_id} icon={User} />}
                                    {logData.email && <DataRow label="Email" value={logData.email} />}
                                    {logData.key_id && <DataRow label="API Key ID" value={logData.key_id} icon={Key} />}
                                    {logData.permissions && (
                                        <DataRow
                                            label="Permissions"
                                            value={
                                                <div className="flex gap-1 flex-wrap">
                                                    {logData.permissions.map((p: string, i: number) => (
                                                        <span key={i} className="px-1.5 py-0.5 bg-foreground/10 rounded text-xs">{p}</span>
                                                    ))}
                                                </div>
                                            }
                                        />
                                    )}
                                    {logData.is_admin !== undefined && (
                                        <DataRow label="Admin" value={logData.is_admin ? '✓ Igen' : '✗ Nem'} />
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Client Info */}
                        {logData.ip && (
                            <div className="space-y-1">
                                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                                    <Globe size={12} />
                                    Client
                                </h4>
                                <div className="bg-muted/30 rounded-lg p-3 border border-border/50">
                                    <DataRow label="IP" value={logData.ip} icon={Globe} />
                                </div>
                            </div>
                        )}

                        {/* Request Data */}
                        {logData.request && (
                            <div className="space-y-1">
                                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                                    <ArrowRight size={12} />
                                    Request Data
                                </h4>
                                <pre className="bg-muted/30 rounded-lg p-3 border border-border/50 text-xs font-mono overflow-x-auto">
                                    {JSON.stringify(logData.request, null, 2)}
                                </pre>
                            </div>
                        )}

                        {/* Response Data */}
                        {logData.response && (
                            <div className="space-y-1">
                                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                                    <ArrowRight size={12} className="rotate-180" />
                                    Response
                                </h4>
                                <pre className="bg-muted/30 rounded-lg p-3 border border-border/50 text-xs font-mono overflow-x-auto">
                                    {JSON.stringify(logData.response, null, 2)}
                                </pre>
                            </div>
                        )}
                    </div>
                )}

                {/* Raw Message (if no parsed data) */}
                {!logData && (
                    <div className="space-y-1">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Raw Message</h4>
                        <pre className="bg-muted/30 rounded-lg p-3 border border-border/50 text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                            {log.message}
                        </pre>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-border bg-muted/30">
                <button
                    onClick={copyToClipboard}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg transition-colors text-sm font-medium"
                >
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                    {copied ? 'Másolva!' : 'Teljes log másolása'}
                </button>
            </div>
        </motion.div>
    );
}
