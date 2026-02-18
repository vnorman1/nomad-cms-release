import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Plus, Search, Shield, Trash2, Edit2, Lock, Unlock,
    Check, Loader2, User as UserIcon, RefreshCw
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useUI } from '@/context/UIContext';
import { fetchUsers, createUser, updateUser, deleteUser, toggleLockUser, UserFormData } from '@/api/admin';
import { UserModal } from '@/components/users/UserModal';
import { cn } from '@/lib/utils';

export default function UsersPage() {
    const { user: currentUser } = useAuth();
    const { confirm } = useUI();
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<any | null>(null);

    const loadUsers = async () => {
        try {
            setLoading(true);
            const data = await fetchUsers();
            if (data.success) {
                setUsers(data.users);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadUsers();
    }, []);

    const handleCreate = async (data: UserFormData) => {
        await createUser(data);
        await loadUsers();
    };

    const handleUpdate = async (data: UserFormData) => {
        if (!editingUser) return;
        await updateUser(editingUser.id, data);
        await loadUsers();
        setEditingUser(null);
    };

    const handleDelete = async (user: any) => {
        confirm({
            title: 'Felhasználó Törlése',
            message: `Biztosan törölni szeretnéd a(z) ${user.email} felhasználót? Ez a művelet nem visszavonható.`,
            confirmLabel: 'Törlés',
            cancelLabel: 'Mégse',
            isDestructive: true,
            onConfirm: async () => {
                try {
                    await deleteUser(user.id);
                    await loadUsers();
                } catch (err) {
                    console.error('Delete failed', err);
                }
            }
        });
    };

    const handleToggleLock = async (user: any) => {
        const isLocked = !!user.locked_until;
        const action = isLocked ? 'feloldani' : 'zárolni';

        confirm({
            title: isLocked ? 'Felhasználó Feloldása' : 'Felhasználó Zárolása',
            message: `Biztosan ${action} szeretnéd a(z) ${user.email} felhasználót?`,
            confirmLabel: isLocked ? 'Feloldás' : 'Zárolás',
            cancelLabel: 'Mégse',
            isDestructive: !isLocked,
            onConfirm: async () => {
                try {
                    await toggleLockUser(user.id, !isLocked);
                    await loadUsers();
                } catch (err) {
                    console.error('Lock toggle failed', err);
                }
            }
        });
    };

    const filteredUsers = users.filter(u =>
        u.email.toLowerCase().includes(search.toLowerCase()) ||
        u.uuid.includes(search)
    );

    return (
        <div className="flex flex-col h-full bg-background font-sans text-foreground">
            {/* ─────────────────────────────────────────────────────────────────── */}
            {/* MAIN CONTENT WRAPPER */}
            {/* ─────────────────────────────────────────────────────────────────── */}
            <div className="flex-1 flex flex-col h-full relative overflow-hidden">
                {/* HEADER AREA */}
                <div className="flex-none p-6 pb-2 space-y-6">
                    {/* Title & Stats */}
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center border border-primary/20 shadow-sm">
                                <UserIcon size={20} className="text-primary" />
                            </div>
                            <div>
                                <div className="flex items-center gap-3">
                                    <h2 className="text-2xl font-bold tracking-tight text-foreground/90">Felhasználók</h2>
                                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-foreground/5 text-foreground/60 rounded-lg text-xs font-medium border border-foreground/10">
                                        <Shield size={14} />
                                        <span>Adminisztráció</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                                    <span className="font-medium bg-muted px-2 py-0.5 rounded-md">{users.length} felhasználó</span>
                                    {loading && <span className="opacity-50 italic">Frissítés...</span>}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <button
                                onClick={loadUsers}
                                disabled={loading}
                                className="h-9 w-9 flex items-center justify-center rounded-lg border border-border/50 hover:bg-muted transition-all disabled:opacity-50"
                                title="Frissítés"
                            >
                                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                            </button>
                            <button
                                onClick={() => setIsCreateOpen(true)}
                                className="h-9 px-4 bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg shadow-lg shadow-primary/20 transition-all flex items-center gap-2 text-sm font-medium"
                            >
                                <Plus size={16} />
                                Új Felhasználó
                            </button>
                        </div>
                    </div>

                    {/* Toolbar: Search */}
                    <div className="flex w-full items-center gap-4">
                        <div className="group relative flex-1 max-w-xl transition-all duration-300 focus-within:max-w-2xl">
                            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 transition-colors group-focus-within:text-primary" />
                            <input
                                type="text"
                                placeholder="Keresés email vagy ID alapján..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="w-full h-10 pl-10 pr-4 bg-background border border-border/50 rounded-xl text-sm outline-none transition-all shadow-sm focus:border-primary/50 focus:ring-4 focus:ring-primary/10 placeholder:text-muted-foreground/50"
                            />
                        </div>
                    </div>
                </div>

                {/* DATA TABLE */}
                <div className="flex-1 overflow-auto px-6 pb-20 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                    <div className="rounded-xl border border-border/40 bg-background/50 shadow-sm overflow-hidden backdrop-blur-sm">
                        <table className="w-full border-collapse">
                            <thead className="bg-muted/30 border-b border-border/40 sticky top-0 z-10 backdrop-blur-md">
                                <tr>
                                    <th className="w-16 h-11 px-4 text-center align-middle text-xs font-semibold text-muted-foreground uppercase tracking-wider">#</th>
                                    <th className="h-11 px-4 text-left align-middle text-xs font-semibold text-muted-foreground uppercase tracking-wider">Felhasználó</th>
                                    <th className="w-32 h-11 px-4 text-center align-middle text-xs font-semibold text-muted-foreground uppercase tracking-wider">Jogosultság</th>
                                    <th className="w-32 h-11 px-4 text-center align-middle text-xs font-semibold text-muted-foreground uppercase tracking-wider">Státusz</th>
                                    <th className="w-32 h-11 px-4 text-right align-middle"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/30">
                                {loading && users.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="h-64 text-center">
                                            <div className="flex flex-col items-center justify-center gap-3 text-muted-foreground">
                                                <Loader2 size={24} className="animate-spin text-primary/50" />
                                                <span className="text-sm font-medium">Betöltés...</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : filteredUsers.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="h-64 text-center">
                                            <div className="flex flex-col items-center justify-center gap-3 text-muted-foreground/50">
                                                <UserIcon size={40} className="opacity-20" />
                                                <span className="text-sm font-medium">Nincs találat</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    <AnimatePresence mode="popLayout">
                                        {filteredUsers.map((u, i) => {
                                            const isLocked = !!u.locked_until;
                                            const isMe = currentUser?.email === u.email;

                                            return (
                                                <motion.tr
                                                    key={u.id}
                                                    initial={{ opacity: 0, y: 10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, scale: 0.95 }}
                                                    transition={{ delay: Math.min(i * 0.05, 0.5) }}
                                                    className={cn(
                                                        "group border-b border-border/30 transition-colors hover:bg-muted/20",
                                                        isLocked ? "bg-red-500/5 hover:bg-red-500/10" : ""
                                                    )}
                                                >
                                                    <td className="px-4 py-3 align-middle text-center">
                                                        <span className="font-mono text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                                                            {i + 1}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 align-middle">
                                                        <div className="min-w-0">
                                                            <div className="font-medium text-sm flex items-center gap-2 truncate text-foreground/90">
                                                                {u.email}
                                                                {isMe && (
                                                                    <span className="px-1.5 py-0.5 bg-primary/10 text-primary text-[10px] uppercase font-bold rounded leading-none shrink-0 border border-primary/20">
                                                                        TE
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="text-[10px] font-mono text-muted-foreground/60 mt-0.5 truncate">ID: {u.uuid}</div>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 align-middle text-center">
                                                        {u.is_admin ? (
                                                            <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-mono uppercase tracking-wider rounded border border-amber-500/20">
                                                                <Shield size={10} /> Admin
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-muted/40 text-muted-foreground text-xs font-mono uppercase tracking-wider rounded border border-border/50">
                                                                <UserIcon size={10} /> User
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 align-middle text-center">
                                                        {isLocked ? (
                                                            <span className="inline-flex items-center gap-1.5 text-destructive text-xs font-bold uppercase">
                                                                <Lock size={12} /> Zárolva
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-500 text-xs font-bold uppercase">
                                                                <Check size={12} /> Aktív
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 align-middle text-right">
                                                        <div className="flex items-center justify-end gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                                            <button
                                                                onClick={() => setEditingUser(u)}
                                                                className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all"
                                                                title="Szerkesztés"
                                                            >
                                                                <Edit2 size={15} />
                                                            </button>

                                                            {!isMe && (
                                                                <>
                                                                    <button
                                                                        onClick={() => handleToggleLock(u)}
                                                                        className={cn(
                                                                            "h-8 w-8 flex items-center justify-center rounded-lg transition-all",
                                                                            isLocked
                                                                                ? "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10"
                                                                                : "text-muted-foreground hover:text-amber-600 hover:bg-amber-500/10"
                                                                        )}
                                                                        title={isLocked ? 'Feloldás' : 'Zárolás'}
                                                                    >
                                                                        {isLocked ? <Unlock size={15} /> : <Lock size={15} />}
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleDelete(u)}
                                                                        className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                                                                        title="Törlés"
                                                                    >
                                                                        <Trash2 size={15} />
                                                                    </button>
                                                                </>
                                                            )}
                                                        </div>
                                                    </td>
                                                </motion.tr>
                                            );
                                        })}
                                    </AnimatePresence>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Modals */}
                <UserModal
                    isOpen={isCreateOpen}
                    onClose={() => setIsCreateOpen(false)}
                    onSubmit={handleCreate}
                    title="Új Felhasználó Létrehozása"
                />

                <UserModal
                    isOpen={!!editingUser}
                    onClose={() => setEditingUser(null)}
                    onSubmit={handleUpdate}
                    initialData={editingUser}
                    title="Felhasználó Szerkesztése"
                />
            </div>
        </div>
    );
}
