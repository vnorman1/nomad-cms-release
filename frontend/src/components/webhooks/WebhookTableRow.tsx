/**
 * Webhook Table Row Component
 * 
 * Table row for webhook display matching LogsPage style.
 */

import { motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { 
    MoreVertical, Play, Edit2, Trash2, Key, FileText, 
    CheckCircle, XCircle, ExternalLink, Loader2 
} from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { Webhook } from '@/api/webhooks';
import { cn } from '@/lib/utils';

interface WebhookTableRowProps {
    webhook: Webhook;
    index: number;
    isSelected: boolean;
    onSelect: () => void;
    onEdit: () => void;
    onDelete: () => void;
    onTest: () => void;
    onRotateSecret: () => void;
    onViewDeliveries: () => void;
    onToggleActive: () => void;
    isTesting: boolean;
}

export function WebhookTableRow({
    webhook,
    index,
    isSelected,
    onSelect,
    onEdit,
    onDelete,
    onTest,
    onRotateSecret,
    onViewDeliveries,
    onToggleActive,
    isTesting
}: WebhookTableRowProps) {
    const [showMenu, setShowMenu] = useState(false);
    const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
    const menuRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node) &&
                buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
                setShowMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleMenuClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setMenuPosition({
                top: rect.bottom + 4,
                left: rect.right - 192 // 192px = w-48
            });
        }
        setShowMenu(!showMenu);
    };

    const eventCount = webhook.events.length;
    const fieldCount = webhook.payload_fields?.length || 0;

    return (
        <motion.tr
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.03 }}
            className={cn(
                "group cursor-pointer transition-colors",
                isSelected ? "bg-primary/5" : "hover:bg-muted/30"
            )}
            onClick={onSelect}
        >
            {/* Status */}
            <td className="w-16 px-4 py-3 text-center">
                <button
                    onClick={(e) => { e.stopPropagation(); onToggleActive(); }}
                    className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center transition-all",
                        webhook.is_active 
                            ? "bg-green-500/10 text-green-500 hover:bg-green-500/20" 
                            : "bg-gray-500/10 text-gray-400 hover:bg-gray-500/20"
                    )}
                    title={webhook.is_active ? 'Aktív - kattints a kikapcsoláshoz' : 'Inaktív - kattints a bekapcsoláshoz'}
                >
                    {webhook.is_active ? <CheckCircle size={16} /> : <XCircle size={16} />}
                </button>
            </td>

            {/* Name */}
            <td className="px-4 py-3">
                <div className="flex flex-col">
                    <span className="font-medium text-foreground/90">{webhook.name}</span>
                    <span className="text-xs text-muted-foreground font-mono truncate max-w-[200px]">
                        {webhook.url}
                    </span>
                </div>
            </td>

            {/* Events */}
            <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                    <span className="px-2 py-1 bg-primary/10 text-primary text-xs font-medium rounded-md">
                        {eventCount} esemény
                    </span>
                </div>
            </td>

            {/* Payload Fields */}
            <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                    <span className="px-2 py-1 bg-blue-500/10 text-blue-500 text-xs font-medium rounded-md">
                        {fieldCount > 0 ? `${fieldCount} mező` : 'Összes'}
                    </span>
                </div>
            </td>

            {/* Created */}
            <td className="px-4 py-3 text-sm text-muted-foreground">
                {new Date(webhook.created_at).toLocaleDateString('hu-HU', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                })}
            </td>

            {/* Actions */}
            <td className="w-24 px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-1">
                    <button
                        onClick={(e) => { e.stopPropagation(); onTest(); }}
                        disabled={isTesting || !webhook.is_active}
                        className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center transition-all",
                            webhook.is_active 
                                ? "hover:bg-muted text-muted-foreground hover:text-primary"
                                : "opacity-30 cursor-not-allowed"
                        )}
                        title="Teszt küldése"
                    >
                        {isTesting ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                    </button>

                    <div className="relative">
                        <button
                            ref={buttonRef}
                            onClick={handleMenuClick}
                            className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-all"
                        >
                            <MoreVertical size={14} />
                        </button>

                        {showMenu && createPortal(
                            <div 
                                ref={menuRef}
                                style={{ top: menuPosition.top, left: menuPosition.left }}
                                className="fixed w-48 bg-background border border-border rounded-xl shadow-xl z-[9999] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
                            >
                                <button
                                    onClick={(e) => { e.stopPropagation(); onEdit(); setShowMenu(false); }}
                                    className="w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center gap-2"
                                >
                                    <Edit2 size={14} />
                                    Szerkesztés
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); onViewDeliveries(); setShowMenu(false); }}
                                    className="w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center gap-2"
                                >
                                    <FileText size={14} />
                                    Kézbesítések
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); onRotateSecret(); setShowMenu(false); }}
                                    className="w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center gap-2"
                                >
                                    <Key size={14} />
                                    Secret forgatás
                                </button>
                                <a
                                    href={webhook.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center gap-2"
                                >
                                    <ExternalLink size={14} />
                                    URL megnyitása
                                </a>
                                <hr className="my-1 border-border" />
                                <button
                                    onClick={(e) => { e.stopPropagation(); onDelete(); setShowMenu(false); }}
                                    className="w-full px-3 py-2 text-left text-sm hover:bg-destructive/10 text-destructive flex items-center gap-2"
                                >
                                    <Trash2 size={14} />
                                    Törlés
                                </button>
                            </div>,
                            document.body
                        )}
                    </div>
                </div>
            </td>
        </motion.tr>
    );
}
