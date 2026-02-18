import { useState, useEffect } from 'react';
import {
    Key, Plus, Trash2, Copy, Eye, EyeOff, Clock, CheckCircle, XCircle,
    Loader2, AlertTriangle, Shield, X, Terminal, Lock
} from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import ApiPlayground from '../unique/ApiPlayground';
import { TabProps } from './types';
import { getApiKeys, createApiKey, revokeApiKey, ApiKey, CreatedApiKey } from '@/api/admin';

type PermissionType = 'read' | 'write' | 'admin';
type EncryptedPermissionType = 'encrypted_read' | 'encrypted_write';

export function ApiTab({ setError, setSuccess }: TabProps) {
    const [keys, setKeys] = useState<ApiKey[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [revoking, setRevoking] = useState<number | null>(null);

    // Create modal state
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newKeyName, setNewKeyName] = useState('');
    const [newKeyPermissions, setNewKeyPermissions] = useState<PermissionType[]>(['read']);
    const [newKeyExpiry, setNewKeyExpiry] = useState('');
    const [isEnhancedKey, setIsEnhancedKey] = useState(false);
    const [encryptedPermissions, setEncryptedPermissions] = useState<EncryptedPermissionType[]>([]);

    // TOTP modal for PRO keys
    const [showTotpModal, setShowTotpModal] = useState(false);
    const [totpCode, setTotpCode] = useState('');

    // Created key display (one-time view)
    const [createdKey, setCreatedKey] = useState<CreatedApiKey | null>(null);
    const [keyCopied, setKeyCopied] = useState(false);
    const [keyVisible, setKeyVisible] = useState(false);

    // Revoke confirmation
    const [confirmRevoke, setConfirmRevoke] = useState<number | null>(null);

    // Playground Toggle
    const [showPlayground, setShowPlayground] = useState(false);

    useEffect(() => {
        loadKeys();
    }, []);

    const loadKeys = async () => {
        try {
            setLoading(true);
            const data = await getApiKeys();
            setKeys(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Nem sikerült betölteni az API kulcsokat');
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async () => {
        if (!newKeyName.trim()) {
            setError('Név megadása kötelező');
            return;
        }

        // PRO kulcsokhoz TOTP szükséges - mutassuk a TOTP modalt
        if (isEnhancedKey && !showTotpModal) {
            setShowCreateModal(false);
            setShowTotpModal(true);
            return;
        }

        // PRO kulcshoz ellenőrizzük a TOTP kódot
        if (isEnhancedKey && totpCode.length !== 6) {
            setError('A TOTP kód 6 számjegyű kell legyen');
            return;
        }

        setCreating(true);
        setError(null);

        try {
            const expiryDays = newKeyExpiry ? parseInt(newKeyExpiry) : undefined;
            const key = await createApiKey(
                newKeyName.trim(),
                newKeyPermissions,
                expiryDays,
                isEnhancedKey,
                isEnhancedKey ? encryptedPermissions : undefined,
                isEnhancedKey ? totpCode : undefined
            );
            setCreatedKey(key);
            setShowCreateModal(false);
            setShowTotpModal(false);
            setNewKeyName('');
            setNewKeyPermissions(['read']);
            setNewKeyExpiry('');
            setIsEnhancedKey(false);
            setEncryptedPermissions([]);
            setTotpCode('');
            await loadKeys();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Nem sikerült létrehozni az API kulcsot');
        } finally {
            setCreating(false);
        }
    };

    const handleRevoke = async (keyId: number) => {
        setRevoking(keyId);
        setError(null);

        try {
            await revokeApiKey(keyId);
            setSuccess('API kulcs visszavonva');
            setConfirmRevoke(null);
            await loadKeys();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Nem sikerült visszavonni az API kulcsot');
        } finally {
            setRevoking(null);
        }
    };

    const copyToClipboard = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setKeyCopied(true);
            setTimeout(() => setKeyCopied(false), 2000);
        } catch {
            setError('Nem sikerült másolni');
        }
    };

    const togglePermission = (perm: PermissionType) => {
        setNewKeyPermissions(prev => {
            if (prev.includes(perm)) {
                // Can't remove last permission
                if (prev.length === 1) return prev;
                const updated = prev.filter(p => p !== perm);
                
                // Remove corresponding encrypted permission when removing standard permission in PRO mode
                if (isEnhancedKey) {
                    if (perm === 'read') {
                        setEncryptedPermissions(ep => ep.filter(p => p !== 'encrypted_read'));
                    }
                    if (perm === 'write') {
                        setEncryptedPermissions(ep => ep.filter(p => p !== 'encrypted_write'));
                    }
                }
                
                return updated;
            }
            const updated = [...prev, perm];
            
            // Auto-enable corresponding encrypted permissions when enabling standard permissions in PRO mode
            if (isEnhancedKey) {
                if (perm === 'read' && !encryptedPermissions.includes('encrypted_read')) {
                    setEncryptedPermissions(ep => [...ep, 'encrypted_read']);
                }
                if (perm === 'write' && !encryptedPermissions.includes('encrypted_write')) {
                    setEncryptedPermissions(ep => [...ep, 'encrypted_write']);
                }
            }
            
            return updated;
        });
    };

    const toggleEncryptedPermission = (perm: EncryptedPermissionType) => {
        setEncryptedPermissions(prev => {
            if (prev.includes(perm)) {
                const updated = prev.filter(p => p !== perm);
                // Remove corresponding standard permission when removing encrypted permission
                if (perm === 'encrypted_read') {
                    setNewKeyPermissions(np => np.filter(p => p !== 'read'));
                }
                if (perm === 'encrypted_write') {
                    setNewKeyPermissions(np => np.filter(p => p !== 'write'));
                }
                return updated;
            }
            // When enabling encrypted permission, also enable corresponding standard permission
            if (perm === 'encrypted_read' && !newKeyPermissions.includes('read')) {
                setNewKeyPermissions(np => [...np, 'read']);
            }
            if (perm === 'encrypted_write' && !newKeyPermissions.includes('write')) {
                setNewKeyPermissions(np => [...np, 'write']);
            }
            return [...prev, perm];
        });
    };

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleDateString('hu-HU', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-mono uppercase tracking-widest opacity-60 flex items-center gap-2">
                        <Key size={14} />
                        API Kulcsok
                    </h3>
                    <p className="text-xs opacity-40 mt-1">
                        Webhook integrációkhoz, email szolgáltatásokhoz, automatizációhoz
                    </p>
                </div>
                <div className="flex flex-col md:flex-row gap-3">
                    <button
                        onClick={() => setShowPlayground(true)}
                        className="px-4 py-2 border border-foreground/20 font-mono text-xs uppercase tracking-widest hover:bg-foreground/5 transition-all flex items-center justify-center gap-2"
                    >
                        <Terminal size={14} />
                        API Playground
                    </button>
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="px-4 py-2 bg-foreground text-background font-mono text-xs uppercase tracking-widest hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                    >
                        <Plus size={14} />
                        Új Kulcs
                    </button>
                </div>
            </div>

            {/* API Playground Overlay */}
            <AnimatePresence>
                {showPlayground && (
                    <ApiPlayground
                        apiKey={keys.length > 0 ? keys[0].key_prefix : ''}
                        onClose={() => setShowPlayground(false)}
                    />
                )}
            </AnimatePresence>

            {/* Info box */}
            <div className="border border-amber-500/30 bg-amber-500/5 p-4 text-xs">
                <p className="flex items-start gap-2">
                    <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                    <span>
                        Az API kulcsok csak <strong>egyszer láthatók</strong> létrehozáskor!
                        A kulcsot biztonságos helyen tárold. Elvesztés esetén új kulcsot kell generálni.
                    </span>
                </p>
            </div>

            {/* Keys list */}
            {loading ? (
                <div className="flex items-center justify-center py-12 opacity-50">
                    <Loader2 size={20} className="animate-spin" />
                </div>
            ) : keys.length === 0 ? (
                <div className="text-center py-12 opacity-50">
                    <Key size={32} className="mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Még nincsenek API kulcsok</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {keys.map(key => (
                        <div
                            key={key.id}
                            className={`border p-4 ${key.is_active ? 'border-border' : 'border-border/50 opacity-50'}`}
                        >
                            <div className="flex flex-col md:flex-row items-start justify-between gap-4">
                                <div className="flex-1 min-w-0 w-full">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="font-mono text-sm font-medium">{key.name}</span>
                                        {key.key_type === 'enhanced' && (
                                            <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-500 text-[10px] font-mono uppercase tracking-wider flex items-center gap-1">
                                                <Lock size={10} />
                                                PRO
                                            </span>
                                        )}
                                        {key.is_active ? (
                                            <CheckCircle size={12} className="text-green-500" />
                                        ) : (
                                            <XCircle size={12} className="text-red-500" />
                                        )}
                                    </div>

                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs opacity-50">
                                        <span className="font-mono bg-foreground/5 px-2 py-0.5 whitespace-nowrap">
                                            {key.key_prefix}...
                                        </span>
                                        <span className="flex items-center gap-1 whitespace-nowrap">
                                            <Shield size={10} />
                                            {key.permissions.join(', ')}
                                        </span>
                                        {key.key_type === 'enhanced' && key.encrypted_permissions && key.encrypted_permissions.length > 0 && (
                                            <span className="flex items-center gap-1 whitespace-nowrap text-amber-500">
                                                <Lock size={10} />
                                                {key.encrypted_permissions.map(p => p.replace('encrypted_', '')).join(', ')}
                                            </span>
                                        )}
                                        <span className="flex items-center gap-1 whitespace-nowrap">
                                            <Clock size={10} />
                                            {key.last_used_at ? `Használva: ${formatDate(key.last_used_at)}` : 'Még nem használt'}
                                        </span>
                                        {key.expires_at && (
                                            <span className="whitespace-nowrap">Lejár: {formatDate(key.expires_at)}</span>
                                        )}
                                    </div>
                                </div>

                                {key.is_active && (
                                    <button
                                        onClick={() => setConfirmRevoke(key.id)}
                                        disabled={revoking === key.id}
                                        className="p-2 opacity-50 hover:opacity-100 hover:text-red-500 transition-all self-end md:self-center"
                                    >
                                        {revoking === key.id ? (
                                            <Loader2 size={14} className="animate-spin" />
                                        ) : (
                                            <Trash2 size={14} />
                                        )}
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Create Modal */}
            {showCreateModal && (
                <div
                    className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
                    onClick={() => !creating && setShowCreateModal(false)}
                >
                    <div
                        className="bg-background border border-border p-8 max-w-md w-full mx-4"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-sm font-mono uppercase tracking-widest flex items-center gap-2">
                                <Plus size={14} />
                                Új API Kulcs
                            </h3>
                            <button
                                onClick={() => setShowCreateModal(false)}
                                disabled={creating}
                                className="opacity-50 hover:opacity-100 transition-opacity disabled:opacity-20"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-xs opacity-50 block mb-2">Kulcs Neve</label>
                                <input
                                    type="text"
                                    value={newKeyName}
                                    onChange={e => setNewKeyName(e.target.value)}
                                    placeholder="pl. Mailchimp Webhook"
                                    className="w-full bg-transparent border-b border-border py-2 focus:outline-none focus:border-foreground transition-colors font-mono text-sm"
                                    autoFocus
                                />
                            </div>

                            {/* PRO Key Toggle */}
                            <div>
                                <button
                                    onClick={() => {
                                        setIsEnhancedKey(!isEnhancedKey);
                                        if (!isEnhancedKey) {
                                            setEncryptedPermissions([]);
                                        }
                                    }}
                                    className={`w-full px-4 py-3 border font-mono text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                                        isEnhancedKey
                                            ? 'border-amber-500 bg-amber-500/10 text-amber-500'
                                            : 'border-border hover:border-foreground/50'
                                    }`}
                                >
                                    <Lock size={14} />
                                    {isEnhancedKey ? 'PRO Kulcs (200 karakter)' : 'Standard Kulcs (68 karakter)'}
                                </button>
                                <p className="text-xs opacity-40 mt-2">
                                    PRO kulcsok 3x hosszabbak és titkosított adatokhoz adnak hozzáférést
                                </p>
                            </div>

                            <div>
                                <label className="text-xs opacity-50 block mb-2">Jogosultságok</label>
                                <div className="flex flex-wrap gap-2">
                                    {(['read', 'write', 'admin'] as PermissionType[]).map(perm => (
                                        <button
                                            key={perm}
                                            onClick={() => togglePermission(perm)}
                                            className={`px-3 py-1.5 border font-mono text-xs uppercase transition-all ${newKeyPermissions.includes(perm)
                                                ? 'border-foreground bg-foreground text-background'
                                                : 'border-border hover:border-foreground'
                                                }`}
                                        >
                                            {perm}
                                        </button>
                                    ))}
                                </div>
                                <p className="text-xs opacity-40 mt-2">
                                    read: olvasás | write: írás | admin: teljes hozzáférés
                                </p>
                            </div>

                            {/* Encrypted Permissions (only for PRO keys) */}
                            {isEnhancedKey && (
                                <div className="border border-amber-500/30 bg-amber-500/5 p-4">
                                    <label className="text-xs text-amber-500 block mb-3 flex items-center gap-2">
                                        <Lock size={12} />
                                        Titkosított Adat Jogosultságok
                                    </label>
                                    <div className="flex flex-wrap gap-2">
                                        {(['encrypted_read', 'encrypted_write'] as EncryptedPermissionType[]).map(perm => (
                                            <button
                                                key={perm}
                                                onClick={() => toggleEncryptedPermission(perm)}
                                                className={`px-3 py-1.5 border font-mono text-xs uppercase transition-all ${encryptedPermissions.includes(perm)
                                                    ? 'border-amber-500 bg-amber-500 text-black'
                                                    : 'border-amber-500/30 hover:border-amber-500'
                                                    }`}
                                            >
                                                {perm === 'encrypted_read' ? 'olvasás' : 'írás'}
                                            </button>
                                        ))}
                                    </div>
                                    <p className="text-xs opacity-50 mt-2">
                                        Titkosított adatok olvasása/írása külön engedélyezendő
                                    </p>
                                </div>
                            )}

                            <div>
                                <label className="text-xs opacity-50 block mb-2">
                                    Lejárat <span className="opacity-50">(opcionális)</span>
                                </label>
                                <select
                                    value={newKeyExpiry}
                                    onChange={e => setNewKeyExpiry(e.target.value)}
                                    className="w-full bg-transparent border-b border-border py-2 focus:outline-none focus:border-foreground transition-colors font-mono text-sm appearance-none"
                                >
                                    <option value="">Soha nem jár le</option>
                                    <option value="30">30 nap</option>
                                    <option value="90">90 nap</option>
                                    <option value="180">180 nap</option>
                                    <option value="365">1 év</option>
                                </select>
                            </div>
                        </div>

                        <div className="mt-8 flex gap-3">
                            <button
                                onClick={() => setShowCreateModal(false)}
                                disabled={creating}
                                className="flex-1 px-4 py-3 border border-border font-mono text-xs uppercase tracking-widest hover:bg-foreground/5 transition-colors disabled:opacity-30"
                            >
                                Mégse
                            </button>
                            <button
                                onClick={handleCreate}
                                disabled={creating || !newKeyName.trim()}
                                className="flex-1 px-4 py-3 bg-foreground text-background font-mono text-xs uppercase tracking-widest disabled:opacity-30 hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                            >
                                {creating && <Loader2 size={14} className="animate-spin" />}
                                Létrehozás
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Created Key Display (One-time view) */}
            {createdKey && (
                <div
                    className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
                    onClick={() => {
                        setCreatedKey(null);
                        setKeyVisible(false);
                    }}
                >
                    <div
                        className="bg-background border border-green-500 p-8 max-w-lg w-full mx-4"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center gap-2 mb-4 text-green-500">
                            <CheckCircle size={20} />
                            <h3 className="text-sm font-mono uppercase tracking-widest">
                                {createdKey.key_type === 'enhanced' ? 'PRO API Kulcs Létrehozva' : 'API Kulcs Létrehozva'}
                            </h3>
                            {createdKey.key_type === 'enhanced' && (
                                <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-500 text-[10px] font-mono uppercase tracking-wider flex items-center gap-1">
                                    <Lock size={10} />
                                    PRO
                                </span>
                            )}
                        </div>

                        <div className="bg-red-500/10 border border-red-500/30 p-4 mb-4">
                            <p className="text-xs text-red-400 flex items-start gap-2">
                                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                                <span>
                                    <strong>FIGYELEM!</strong> Ez a kulcs többé NEM lesz látható!
                                    Másold ki és tárold biztonságos helyen!
                                </span>
                            </p>
                        </div>

                        <div className="mb-6">
                            <label className="text-xs opacity-50 block mb-2">API Kulcs</label>
                            <div className="flex items-center gap-2">
                                <code className="flex-1 bg-foreground/5 p-3 font-mono text-sm break-all">
                                    {keyVisible ? createdKey.key : '•'.repeat(40)}
                                </code>
                                <button
                                    onClick={() => setKeyVisible(!keyVisible)}
                                    className="p-2 opacity-50 hover:opacity-100 transition-opacity"
                                >
                                    {keyVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                                <button
                                    onClick={() => copyToClipboard(createdKey.key)}
                                    className="p-2 opacity-50 hover:opacity-100 transition-opacity"
                                >
                                    {keyCopied ? <CheckCircle size={16} className="text-green-500" /> : <Copy size={16} />}
                                </button>
                            </div>
                        </div>

                        <div className="text-xs opacity-50 mb-6 space-y-1">
                            <p><strong>Név:</strong> {createdKey.name}</p>
                            <p><strong>Típus:</strong> {createdKey.key_type === 'enhanced' ? 'PRO (200 karakter)' : 'Standard (68 karakter)'}</p>
                            <p><strong>Jogosultságok:</strong> {createdKey.permissions.join(', ')}</p>
                            {createdKey.key_type === 'enhanced' && createdKey.encrypted_permissions && createdKey.encrypted_permissions.length > 0 && (
                                <p className="text-amber-500"><strong>Titkosított jogok:</strong> {createdKey.encrypted_permissions.map(p => p.replace('encrypted_', '')).join(', ')}</p>
                            )}
                            <p><strong>Lejárat:</strong> {createdKey.expires_at ? formatDate(createdKey.expires_at) : 'Soha'}</p>
                        </div>

                        <button
                            onClick={() => {
                                setCreatedKey(null);
                                setKeyVisible(false);
                            }}
                            className="w-full px-4 py-3 bg-foreground text-background font-mono text-xs uppercase tracking-widest hover:opacity-90 transition-opacity"
                        >
                            Bezárás (Kimásoltam)
                        </button>
                    </div>
                </div>
            )}

            {/* Revoke Confirmation */}
            {confirmRevoke && (
                <div
                    className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
                    onClick={() => setConfirmRevoke(null)}
                >
                    <div
                        className="bg-background border border-red-500 p-8 max-w-sm w-full mx-4"
                        onClick={e => e.stopPropagation()}
                    >
                        <h3 className="text-sm font-mono uppercase tracking-widest mb-4 flex items-center gap-2 text-red-500">
                            <AlertTriangle size={14} />
                            Kulcs Visszavonása
                        </h3>
                        <p className="text-sm opacity-80 mb-6">
                            Biztosan visszavonod ezt az API kulcsot?
                            A kulcsot használó integrációk azonnal leállnak!
                        </p>
                        <div className="flex flex-col md:flex-row gap-3">
                            <button
                                onClick={() => setConfirmRevoke(null)}
                                className="flex-1 px-4 py-3 border border-border font-mono text-xs uppercase tracking-widest hover:bg-foreground/5 transition-colors"
                            >
                                Mégse
                            </button>
                            <button
                                onClick={() => handleRevoke(confirmRevoke)}
                                disabled={revoking !== null}
                                className="flex-1 px-4 py-3 bg-red-500 text-white font-mono text-xs uppercase tracking-widest hover:bg-red-600 transition-colors flex items-center justify-center gap-2"
                            >
                                {revoking && <Loader2 size={14} className="animate-spin" />}
                                Visszavonás
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* TOTP Modal for PRO Keys */}
            {showTotpModal && (
                <div
                    className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
                    onClick={() => {
                        if (!creating) {
                            setShowTotpModal(false);
                            setTotpCode('');
                        }
                    }}
                >
                    <div
                        className="bg-background border border-amber-500 p-8 max-w-md w-full mx-4"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-sm font-mono uppercase tracking-widest flex items-center gap-2 text-amber-500">
                                <Lock size={14} />
                                PRO Kulcs - 2FA Hitelesítés
                            </h3>
                            <button
                                onClick={() => {
                                    setShowTotpModal(false);
                                    setTotpCode('');
                                }}
                                disabled={creating}
                                className="opacity-50 hover:opacity-100 transition-opacity disabled:opacity-20"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="border border-amber-500/30 bg-amber-500/5 p-4 mb-6">
                            <p className="text-xs text-amber-500 flex items-start gap-2">
                                <Shield size={14} className="shrink-0 mt-0.5" />
                                <span>
                                    A PRO kulcsok titkosított adatokhoz adnak hozzáférést.
                                    A létrehozáshoz TOTP kód szükséges a biztonság érdekében.
                                </span>
                            </p>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-xs opacity-50 block mb-2">TOTP Kód (6 számjegy)</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    maxLength={6}
                                    value={totpCode}
                                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                                    placeholder="000000"
                                    className="w-full bg-transparent border-b border-amber-500/50 py-2 focus:outline-none focus:border-amber-500 transition-colors font-mono text-2xl tracking-[0.5em] text-center"
                                    autoFocus
                                />
                            </div>

                            <div className="text-xs opacity-50 space-y-1 pt-2">
                                <p><strong>Kulcs neve:</strong> {newKeyName}</p>
                                <p><strong>Jogosultságok:</strong> {newKeyPermissions.join(', ')}</p>
                                <p className="text-amber-500"><strong>Titkosított jogok:</strong> {encryptedPermissions.map(p => p.replace('encrypted_', '')).join(', ') || 'nincs'}</p>
                            </div>
                        </div>

                        <div className="mt-8 flex gap-3">
                            <button
                                onClick={() => {
                                    setShowTotpModal(false);
                                    setShowCreateModal(true);
                                    setTotpCode('');
                                }}
                                disabled={creating}
                                className="flex-1 px-4 py-3 border border-border font-mono text-xs uppercase tracking-widest hover:bg-foreground/5 transition-colors disabled:opacity-30"
                            >
                                Vissza
                            </button>
                            <button
                                onClick={handleCreate}
                                disabled={creating || totpCode.length !== 6}
                                className="flex-1 px-4 py-3 bg-amber-500 text-black font-mono text-xs uppercase tracking-widest disabled:opacity-30 hover:bg-amber-400 transition-colors flex items-center justify-center gap-2"
                            >
                                {creating ? (
                                    <Loader2 size={14} className="animate-spin" />
                                ) : (
                                    <Lock size={14} />
                                )}
                                PRO Kulcs Létrehozása
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
