/**
 * Endpoint Form Component
 * 
 * Modal form for creating and editing incoming webhook endpoints.
 * Supports configurable signature verification settings.
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle, Loader2, Webhook, Info, ChevronDown, Shield } from 'lucide-react';
import { EndpointFormData, WEBHOOK_HANDLERS, SIGNATURE_FORMATS, COMMON_SIGNATURE_HEADERS, COMMON_TIMESTAMP_HEADERS } from '@/api/webhooks';
import { cn } from '@/lib/utils';

interface EndpointFormProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: EndpointFormData) => Promise<void>;
    initialData?: Partial<EndpointFormData>;
    title: string;
    isEdit?: boolean;
}

export function EndpointForm({
    isOpen,
    onClose,
    onSubmit,
    initialData,
    title,
    isEdit = false
}: EndpointFormProps) {
    const [formData, setFormData] = useState<EndpointFormData>({
        name: initialData?.name || '',
        endpoint_key: initialData?.endpoint_key || '',
        handler: initialData?.handler || 'default',
        signature_header: initialData?.signature_header || 'X-Webhook-Signature',
        timestamp_header: initialData?.timestamp_header || '',
        signature_format: initialData?.signature_format || 'auto'
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [customSignatureHeader, setCustomSignatureHeader] = useState('');
    const [customTimestampHeader, setCustomTimestampHeader] = useState('');

    useEffect(() => {
        if (isOpen) {
            const sigHeader = initialData?.signature_header || 'X-Webhook-Signature';
            const tsHeader = initialData?.timestamp_header || '';

            // Check if custom header
            const isCustomSig = !COMMON_SIGNATURE_HEADERS.find(h => h.value === sigHeader);
            const isCustomTs = tsHeader && !COMMON_TIMESTAMP_HEADERS.find(h => h.value === tsHeader);

            setFormData({
                name: initialData?.name || '',
                endpoint_key: initialData?.endpoint_key || '',
                handler: initialData?.handler || 'default',
                signature_header: isCustomSig ? 'custom' : sigHeader,
                timestamp_header: isCustomTs ? 'custom' : tsHeader,
                signature_format: initialData?.signature_format || 'auto'
            });
            setCustomSignatureHeader(isCustomSig ? sigHeader : '');
            setCustomTimestampHeader(isCustomTs ? tsHeader : '');
            setShowAdvanced(isEdit || isCustomSig || isCustomTs ||
                !!(initialData?.signature_format && initialData.signature_format !== 'auto'));
            setError(null);
        }
    }, [isOpen, initialData, isEdit]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validate
        if (!formData.name.trim()) {
            setError('Név megadása kötelező');
            return;
        }
        if (!formData.endpoint_key.trim()) {
            setError('Endpoint kulcs megadása kötelező');
            return;
        }
        if (!/^[a-z0-9-]{3,64}$/.test(formData.endpoint_key)) {
            setError('Endpoint kulcs: csak kisbetűk, számok és kötőjel (3-64 karakter)');
            return;
        }

        // Resolve custom headers
        const finalSignatureHeader = formData.signature_header === 'custom'
            ? customSignatureHeader
            : formData.signature_header;
        const finalTimestampHeader = formData.timestamp_header === 'custom'
            ? customTimestampHeader
            : formData.timestamp_header;

        // Validate custom headers
        if (formData.signature_header === 'custom' && !customSignatureHeader.trim()) {
            setError('Egyedi signature header megadása kötelező');
            return;
        }
        if (formData.timestamp_header === 'custom' && !customTimestampHeader.trim()) {
            setError('Egyedi timestamp header megadása kötelező');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            await onSubmit({
                ...formData,
                signature_header: finalSignatureHeader,
                timestamp_header: finalTimestampHeader
            });
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Ismeretlen hiba');
        } finally {
            setLoading(false);
        }
    };

    // Generate endpoint key from name
    const generateKey = () => {
        const key = formData.name
            .toLowerCase()
            .replace(/[áàäâ]/g, 'a')
            .replace(/[éèëê]/g, 'e')
            .replace(/[íìïî]/g, 'i')
            .replace(/[óòöôő]/g, 'o')
            .replace(/[úùüûű]/g, 'u')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 64);

        setFormData(prev => ({ ...prev, endpoint_key: key }));
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-background border border-border w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh]"
                >
                    {/* Header */}
                    <div className="p-6 border-b border-border flex justify-between items-center shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 border border-emerald-500/20 bg-emerald-500/5 flex items-center justify-center">
                                <Webhook strokeWidth={1} size={18} className="text-emerald-500" />
                            </div>
                            <h3 className="text-lg font-light tracking-tight uppercase">{title}</h3>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-foreground hover:text-background transition-colors"
                        >
                            <X strokeWidth={1} size={20} />
                        </button>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto custom-scrollbar">
                        {error && (
                            <div className="p-3 bg-red-500/10 text-red-500 text-xs font-mono uppercase tracking-widest flex items-center gap-2 border border-red-500/20">
                                <AlertTriangle size={14} />
                                {error}
                            </div>
                        )}

                        {/* Name */}
                        <div>
                            <label className="block text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
                                Endpoint Neve
                            </label>
                            <input
                                type="text"
                                required
                                placeholder="PL. STRIPE FIZETÉSEK"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                onBlur={() => !formData.endpoint_key && formData.name && generateKey()}
                                className="w-full h-10 px-4 bg-background border border-border text-sm focus:outline-none focus:border-foreground transition-all placeholder:text-muted-foreground/30"
                            />
                        </div>

                        {/* Endpoint Key */}
                        <div>
                            <label className="block text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
                                Endpoint Kulcs
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    required
                                    placeholder="stripe-payments"
                                    value={formData.endpoint_key}
                                    onChange={e => setFormData({ ...formData, endpoint_key: e.target.value.toLowerCase() })}
                                    disabled={isEdit}
                                    className="flex-1 h-10 px-4 bg-background border border-border text-sm font-mono focus:outline-none focus:border-foreground transition-all disabled:opacity-50 disabled:cursor-not-allowed placeholder:text-muted-foreground/30"
                                />
                                {!isEdit && (
                                    <button
                                        type="button"
                                        onClick={generateKey}
                                        className="px-4 h-10 border border-border hover:bg-foreground hover:text-background text-[10px] font-mono uppercase tracking-widest transition-colors"
                                    >
                                        GENERÁLÁS
                                    </button>
                                )}
                            </div>
                            <p className="text-[10px] font-mono text-muted-foreground mt-2 opacity-60">
                                URL: /endpoints/webhook-receiver.php?endpoint=<span className="text-foreground">{formData.endpoint_key || 'kulcs'}</span>
                            </p>
                        </div>

                        {/* Handler */}
                        <div>
                            <label className="block text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
                                Handler
                            </label>
                            <div className="space-y-2">
                                {WEBHOOK_HANDLERS.map(handler => (
                                    <button
                                        key={handler.value}
                                        type="button"
                                        onClick={() => setFormData({ ...formData, handler: handler.value })}
                                        className={cn(
                                            "w-full p-3 border text-left transition-all group",
                                            formData.handler === handler.value
                                                ? "border-emerald-500 bg-emerald-500/5"
                                                : "border-border hover:border-foreground"
                                        )}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className={cn(
                                                "font-mono text-xs uppercase tracking-widest",
                                                formData.handler === handler.value ? "text-emerald-600" : "text-foreground"
                                            )}>{handler.label}</span>
                                            <div className={cn(
                                                "w-3 h-3 border transition-colors flex items-center justify-center",
                                                formData.handler === handler.value
                                                    ? "border-emerald-500 bg-emerald-500"
                                                    : "border-foreground/30 group-hover:border-foreground"
                                            )}>
                                                {formData.handler === handler.value && <div className="w-1.5 h-1.5 bg-white" />}
                                            </div>
                                        </div>
                                        <p className="text-[10px] text-muted-foreground mt-1 opacity-70">
                                            {handler.description}
                                        </p>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Advanced Settings Toggle */}
                        <button
                            type="button"
                            onClick={() => setShowAdvanced(!showAdvanced)}
                            className="w-full p-3 border border-border hover:border-foreground flex items-center justify-between transition-colors group"
                        >
                            <div className="flex items-center gap-2">
                                <Shield size={14} className="text-muted-foreground group-hover:text-foreground transition-colors" />
                                <span className="text-[10px] font-mono uppercase tracking-widest">
                                    Signature Konfiguráció
                                </span>
                            </div>
                            <ChevronDown
                                size={14}
                                className={cn(
                                    "text-muted-foreground transition-transform",
                                    showAdvanced && "rotate-180"
                                )}
                            />
                        </button>

                        {/* Advanced Signature Settings */}
                        <AnimatePresence>
                            {showAdvanced && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden"
                                >
                                    <div className="p-4 border border-border space-y-4 bg-muted/30">
                                        {/* Signature Header */}
                                        <div>
                                            <label className="block text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
                                                Signature Header
                                            </label>
                                            <select
                                                value={formData.signature_header}
                                                onChange={e => setFormData({ ...formData, signature_header: e.target.value })}
                                                className="w-full h-10 px-3 bg-background border border-border text-sm focus:outline-none focus:border-foreground transition-all"
                                            >
                                                {COMMON_SIGNATURE_HEADERS.map(h => (
                                                    <option key={h.value} value={h.value}>{h.label} - {h.description}</option>
                                                ))}
                                                <option value="custom">Egyedi...</option>
                                            </select>
                                            {formData.signature_header === 'custom' && (
                                                <input
                                                    type="text"
                                                    placeholder="X-Custom-Signature"
                                                    value={customSignatureHeader}
                                                    onChange={e => setCustomSignatureHeader(e.target.value)}
                                                    className="w-full h-10 px-4 mt-2 bg-background border border-border text-sm font-mono focus:outline-none focus:border-foreground transition-all"
                                                />
                                            )}
                                        </div>

                                        {/* Timestamp Header */}
                                        <div>
                                            <label className="block text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
                                                Timestamp Header
                                            </label>
                                            <select
                                                value={formData.timestamp_header}
                                                onChange={e => setFormData({ ...formData, timestamp_header: e.target.value })}
                                                className="w-full h-10 px-3 bg-background border border-border text-sm focus:outline-none focus:border-foreground transition-all"
                                            >
                                                {COMMON_TIMESTAMP_HEADERS.map(h => (
                                                    <option key={h.value} value={h.value}>{h.label || 'Nincs'} {h.description && `- ${h.description}`}</option>
                                                ))}
                                                <option value="custom">Egyedi...</option>
                                            </select>
                                            {formData.timestamp_header === 'custom' && (
                                                <input
                                                    type="text"
                                                    placeholder="X-Custom-Timestamp"
                                                    value={customTimestampHeader}
                                                    onChange={e => setCustomTimestampHeader(e.target.value)}
                                                    className="w-full h-10 px-4 mt-2 bg-background border border-border text-sm font-mono focus:outline-none focus:border-foreground transition-all"
                                                />
                                            )}
                                        </div>

                                        {/* Signature Format */}
                                        <div>
                                            <label className="block text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
                                                Signature Formátum
                                            </label>
                                            <div className="space-y-1.5">
                                                {SIGNATURE_FORMATS.map(format => (
                                                    <button
                                                        key={format.value}
                                                        type="button"
                                                        onClick={() => setFormData({ ...formData, signature_format: format.value })}
                                                        className={cn(
                                                            "w-full p-2 border text-left transition-all group",
                                                            formData.signature_format === format.value
                                                                ? "border-amber-500 bg-amber-500/5"
                                                                : "border-border hover:border-foreground"
                                                        )}
                                                    >
                                                        <div className="flex items-center justify-between">
                                                            <span className={cn(
                                                                "font-mono text-[10px] uppercase tracking-widest",
                                                                formData.signature_format === format.value ? "text-amber-600" : "text-foreground"
                                                            )}>{format.label}</span>
                                                            <div className={cn(
                                                                "w-2.5 h-2.5 border transition-colors flex items-center justify-center",
                                                                formData.signature_format === format.value
                                                                    ? "border-amber-500 bg-amber-500"
                                                                    : "border-foreground/30 group-hover:border-foreground"
                                                            )}>
                                                                {formData.signature_format === format.value && <div className="w-1 h-1 bg-white" />}
                                                            </div>
                                                        </div>
                                                        <p className="text-[9px] text-muted-foreground mt-0.5 opacity-70">
                                                            {format.description}
                                                        </p>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Provider Quick Setup */}
                                        <div className="pt-2 border-t border-border/50">
                                            <label className="block text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
                                                Gyors beállítás
                                            </label>
                                            <div className="flex gap-2 flex-wrap">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setFormData({
                                                            ...formData,
                                                            signature_header: 'X-Hub-Signature-256',
                                                            timestamp_header: '',
                                                            signature_format: 'sha256_prefixed'
                                                        });
                                                    }}
                                                    className="px-3 py-1.5 border border-border hover:border-foreground text-[9px] font-mono uppercase tracking-widest transition-colors"
                                                >
                                                    GitHub
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setFormData({
                                                            ...formData,
                                                            signature_header: 'Stripe-Signature',
                                                            timestamp_header: '',
                                                            signature_format: 'sha256_timestamped'
                                                        });
                                                    }}
                                                    className="px-3 py-1.5 border border-border hover:border-foreground text-[9px] font-mono uppercase tracking-widest transition-colors"
                                                >
                                                    Stripe
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setFormData({
                                                            ...formData,
                                                            signature_header: 'X-Nomad-Signature',
                                                            timestamp_header: '',
                                                            signature_format: 'sha256_timestamped'
                                                        });
                                                    }}
                                                    className="px-3 py-1.5 border border-border hover:border-foreground text-[9px] font-mono uppercase tracking-widest transition-colors"
                                                >
                                                    Nomad
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setFormData({
                                                            ...formData,
                                                            signature_header: 'X-Webhook-Signature',
                                                            timestamp_header: 'X-Webhook-Timestamp',
                                                            signature_format: 'sha256_simple'
                                                        });
                                                    }}
                                                    className="px-3 py-1.5 border border-border hover:border-foreground text-[9px] font-mono uppercase tracking-widest transition-colors"
                                                >
                                                    Generic
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Info Box */}
                        <div className="p-4 border border-blue-500/20 bg-blue-500/5 flex gap-3">
                            <Info size={16} className="text-blue-500 shrink-0 mt-0.5" />
                            <div className="text-[10px] text-blue-600/80 space-y-1 leading-relaxed">
                                <p>A webhook létrehozása után megkapod a <strong className="text-blue-600 font-mono uppercase">titkos kulcsot</strong>.</p>
                                <p>Ezt a kulcsot használd a külső szolgáltatásban az HMAC aláírás generálásához.</p>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex justify-end gap-3 pt-2 border-t border-border mt-4">
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={loading}
                                className="px-6 py-3 border border-border hover:bg-foreground hover:text-background text-[10px] font-mono uppercase tracking-widest transition-colors disabled:opacity-50"
                            >
                                Mégse
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                className="px-8 py-3 bg-foreground text-background hover:bg-foreground/90 text-[10px] font-mono uppercase tracking-widest transition-colors flex items-center gap-2 disabled:opacity-50"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 size={12} className="animate-spin" />
                                        MENTÉS...
                                    </>
                                ) : (
                                    <>
                                        {isEdit ? 'MENTÉS' : 'LÉTREHOZÁS'}
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
