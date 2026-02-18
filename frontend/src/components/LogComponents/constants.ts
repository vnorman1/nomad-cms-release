import { Bug, Info, AlertTriangle, XCircle, AlertCircle } from 'lucide-react';

export const LEVEL_CONFIG = {
    DEBUG: { icon: Bug, color: 'text-gray-500', bg: 'bg-gray-500/10', border: 'border-gray-500/20' },
    INFO: { icon: Info, color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
    WARNING: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
    ERROR: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/20' },
    CRITICAL: { icon: AlertCircle, color: 'text-rose-600', bg: 'bg-rose-500/10', border: 'border-rose-500/20' },
} as const;

export type LogLevel = keyof typeof LEVEL_CONFIG;
