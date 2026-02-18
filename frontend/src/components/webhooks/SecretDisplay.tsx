/**
 * Secret Display Component
 * 
 * Modal for displaying a webhook secret (shown only once after creation or rotation).
 * Includes copy functionality and security warnings.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Copy, CheckCircle2, AlertTriangle, Eye, EyeOff, Key } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SecretDisplayProps {
    isOpen: boolean;
    onClose: () => void;
    secret: string;
    title?: string;
    description?: string;
}

export function SecretDisplay({
    isOpen,
    onClose,
    secret,
    title = 'Webhook Secret',
    description = 'Ez a titkos kulcs csak most jelenik meg. Mentsd el biztonságos helyre!'
}: SecretDisplayProps) {
    const [copied, setCopied] = useState(false);
    const [visible, setVisible] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(secret);
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
    };

    const maskedSecret = secret.replace(/./g, '•');

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-background border border-border w-full max-w-lg shadow-2xl rounded-xl"
                >
                    {/* Header */}
                    <div className="p-6 border-b border-border flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center">
                                <Key size={18} className="text-amber-500" />
                            </div>
                            <h3 className="font-bold text-lg">{title}</h3>
                        </div>
                        <button 
                            onClick={onClose}
                            className="p-2 hover:bg-muted rounded-lg transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="p-6 space-y-5">
                        {/* Warning */}
                        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg flex gap-3">
                            <AlertTriangle size={20} className="text-amber-500 shrink-0" />
                            <div className="text-sm">
                                <p className="font-medium text-amber-600 dark:text-amber-400">
                                    Fontos!
                                </p>
                                <p className="text-muted-foreground mt-1">
                                    {description}
                                </p>
                            </div>
                        </div>

                        {/* Secret Display */}
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                                Titkos Kulcs
                            </label>
                            <div className="relative">
                                <div className="p-4 bg-muted/50 border border-border rounded-lg font-mono text-sm break-all pr-24">
                                    {visible ? secret : maskedSecret}
                                </div>
                                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                                    <button
                                        onClick={() => setVisible(!visible)}
                                        className="p-2 hover:bg-muted rounded-lg transition-colors"
                                        title={visible ? 'Elrejtés' : 'Megjelenítés'}
                                    >
                                        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                    <button
                                        onClick={handleCopy}
                                        className={cn(
                                            "p-2 rounded-lg transition-colors",
                                            copied ? "bg-emerald-500/10 text-emerald-500" : "hover:bg-muted"
                                        )}
                                        title="Másolás"
                                    >
                                        {copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Instructions */}
                        <div className="text-xs text-muted-foreground space-y-2">
                            <p className="font-medium">Használat:</p>
                            <ul className="list-disc list-inside space-y-1 ml-2">
                                <li>Add meg ezt a kulcsot a külső szolgáltatás webhook beállításaiban</li>
                                <li>A kulcsot HMAC-SHA256 aláírás generálásához használd</li>
                                <li>Soha ne oszd meg publikusan vagy verziókezelőben</li>
                            </ul>
                        </div>

                        {/* HMAC Example */}
                        <details className="group">
                            <summary className="text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground flex items-center gap-1">
                                <span>HMAC Aláírás Példa</span>
                            </summary>
                            <pre className="mt-2 p-3 bg-muted/30 rounded-lg text-xs font-mono overflow-x-auto">
{`// Node.js / JavaScript
const crypto = require('crypto');
const timestamp = Math.floor(Date.now() / 1000);
const payload = JSON.stringify(data);
const signedPayload = timestamp + '.' + payload;
const signature = crypto
  .createHmac('sha256', secret)
  .update(signedPayload)
  .digest('hex');

// Header: X-Nomad-Signature: t={timestamp},v1={signature}`}
                            </pre>
                        </details>
                    </div>

                    {/* Footer */}
                    <div className="p-6 border-t border-border">
                        <button
                            onClick={onClose}
                            className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
                        >
                            {copied ? 'Elmentettem ✓' : 'Bezárás'}
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
