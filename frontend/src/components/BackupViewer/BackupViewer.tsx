import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    AlertTriangle, Key,
    Database, FileText, Download, Search,
    ShieldCheck, Archive,
    Image as ImageIcon, Code, Lock, X,
    Terminal, ArrowRight
} from 'lucide-react';
import { decryptBackup } from '../../utils/backup-crypto';
import { SQLiteViewer } from './SQLiteViewer';
import { cn } from '@/lib/utils';

// Helper for "Technical Badges"
const TechBadge = ({ children, className }: { children: React.ReactNode, className?: string }) => (
    <span className={cn("px-1.5 py-0.5 border border-foreground/20 text-[9px] font-mono uppercase tracking-widest bg-background/50", className)}>
        {children}
    </span>
);

interface BackupViewerProps {
    isOpen: boolean;
    onClose: () => void;
}

export const BackupViewer: React.FC<BackupViewerProps> = ({ isOpen, onClose }) => {
    // State
    const [backupFile, setBackupFile] = useState<File | null>(null);
    const [pemContent, setPemContent] = useState<string>('');
    const [isDecrypting, setIsDecrypting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Decrypted state
    const [decryptedFiles, setDecryptedFiles] = useState<Record<string, Blob> | null>(null);
    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    // Search State
    const [searchQuery, setSearchQuery] = useState('');
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Reset when closed
    useEffect(() => {
        if (!isOpen) {
            const timer = setTimeout(() => {
                setBackupFile(null);
                setPemContent('');
                setDecryptedFiles(null);
                setSelectedFile(null);
                setError(null);
                setSearchQuery('');
                if (previewUrl) URL.revokeObjectURL(previewUrl);
                setPreviewUrl(null);
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    // Cleanup preview URL
    useEffect(() => {
        return () => {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
        };
    }, [previewUrl]);

    // Keyboard Shortcuts
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            // Escape: Close viewer or clear search
            if (e.key === 'Escape') {
                if (searchQuery) {
                    setSearchQuery('');
                    searchInputRef.current?.blur();
                } else {
                    onClose();
                }
            }

            // Cmd+K / Ctrl+K: Focus search
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                searchInputRef.current?.focus();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose, searchQuery]);


    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            const file = e.target.files[0];
            if (file.name.endsWith('.nomad')) {
                setBackupFile(file);
                setError(null);
            } else {
                setError('Csak .nomad fájl tölthető fel');
            }
        }
    };

    const handlePemChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                setPemContent(ev.target?.result as string);
            };
            reader.readAsText(file);
        }
    };

    const handleDecrypt = async () => {
        if (!backupFile || !pemContent) return;

        setIsDecrypting(true);
        setError(null);

        try {
            const buffer = await backupFile.arrayBuffer();
            const result = await decryptBackup(buffer, pemContent);
            setDecryptedFiles(result.files);
        } catch (e: any) {
            console.error(e);
            setError(e.message || "Decryption failed");
        } finally {
            setIsDecrypting(false);
        }
    };

    const handleFileSelect = (fileName: string) => {
        if (!decryptedFiles) return;

        // Cleanup previous
        if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
            setPreviewUrl(null);
        }

        setSelectedFile(fileName);

        const blob = decryptedFiles[fileName];
        if (fileName.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) {
            const url = URL.createObjectURL(blob);
            setPreviewUrl(url);
        }
    };

    // Filter files
    const filteredFiles = useMemo(() => {
        if (!decryptedFiles) return [];
        const files = Object.keys(decryptedFiles).sort();
        if (!searchQuery) return files;
        return files.filter(f => f.toLowerCase().includes(searchQuery.toLowerCase()));
    }, [decryptedFiles, searchQuery]);

    // Helper to get file icon
    const getFileIcon = (fileName: string) => {
        if (fileName.endsWith('.sqlite')) return <Database size={14} className="text-foreground" />;
        if (fileName.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) return <ImageIcon size={14} className="text-foreground" />;
        if (fileName.endsWith('.json')) return <Code size={14} className="text-foreground" />;
        return <FileText size={14} className="text-muted-foreground" />;
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-[100] bg-background text-foreground font-sans flex flex-col"
            >
                {/* HEADER - Brutalist/Technical Style */}
                <div className="flex-none h-16 border-b border-foreground/20 flex items-center justify-between px-6 bg-background">
                    <div className="flex items-center gap-6">
                        <div className="flex flex-col items-start justify-center">
                            <h2 className="text-2xl font-black tracking-tighter uppercase leading-none">
                                Katasztrófa<br />Helyreállítás
                            </h2>
                        </div>
                        <div className="h-8 w-px bg-foreground/10 mx-2" />
                        <div className="flex flex-col gap-1">
                            <TechBadge>NOMAD RECOVERY PROTOCOL</TechBadge>
                            <span className="text-[9px] font-mono tracking-wider opacity-60">SECURE_ENVIRONMENT</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-6">
                        <div className="hidden sm:flex flex-col items-end text-[9px] font-mono opacity-60 uppercase tracking-widest border-r border-foreground/10 pr-6">
                            <span>Adatok csak a memóriában</span>
                            <span>Titkosított munkamenet</span>
                        </div>

                        <button
                            onClick={onClose}
                            className="group flex items-center gap-3 hover:opacity-70 transition-opacity"
                        >
                            <span className="text-xs font-mono uppercase tracking-widest hidden sm:inline-block">Bezárás</span>
                            <div className="w-8 h-8 flex items-center justify-center border border-foreground/20 group-hover:bg-foreground group-hover:text-background transition-colors">
                                <X size={16} />
                            </div>
                        </button>
                    </div>
                </div>

                {/* CONTENT */}
                <div className="flex-1 flex overflow-hidden">

                    {/* LEFT SIDEBAR - INPUT AREA */}
                    <div className="w-80 border-r border-foreground/20 bg-background flex flex-col">
                        {!decryptedFiles ? (
                            <div className="p-6 space-y-8 overflow-y-auto">
                                <div className="space-y-6 animate-in slide-in-from-left-4 duration-500 fade-in">

                                    {/* 1. BACKUP FILE */}
                                    <div className="group space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground group-hover:text-foreground transition-colors">
                                                // 01. Backup File
                                            </span>
                                            {backupFile && <TechBadge>READY</TechBadge>}
                                        </div>

                                        <div
                                            onClick={() => document.getElementById('backup-upload')?.click()}
                                            className={cn(
                                                "relative border h-32 flex flex-col items-center justify-center cursor-pointer transition-all duration-300",
                                                backupFile
                                                    ? "border-foreground bg-foreground/5"
                                                    : "border-foreground/20 hover:border-foreground hover:bg-foreground/5"
                                            )}
                                        >
                                            <input
                                                id="backup-upload"
                                                type="file"
                                                accept=".nomad"
                                                onChange={handleFileChange}
                                                className="hidden"
                                            />
                                            {backupFile ? (
                                                <div className="flex flex-col items-center gap-2">
                                                    <Archive size={24} strokeWidth={1} />
                                                    <span className="text-xs font-mono truncate max-w-[200px]">{backupFile.name}</span>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-center gap-2 text-muted-foreground group-hover:text-foreground transition-colors">
                                                    <span className="text-4xl font-thin">+</span>
                                                    <span className="text-[10px] uppercase tracking-widest">.NOMAD FILE</span>
                                                </div>
                                            )}
                                            {/* Corner Accents */}
                                            <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-foreground opacity-20" />
                                            <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-foreground opacity-20" />
                                            <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-foreground opacity-20" />
                                            <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-foreground opacity-20" />
                                        </div>
                                    </div>

                                    {/* 2. PRIVATE KEY */}
                                    <div className="group space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground group-hover:text-foreground transition-colors">
                                                // 02. Private Key
                                            </span>
                                            {pemContent && <TechBadge>LOADED</TechBadge>}
                                        </div>

                                        {/* Drop Zone */}
                                        <div
                                            onClick={() => document.getElementById('key-upload')?.click()}
                                            className={cn(
                                                "relative border h-20 flex items-center justify-center cursor-pointer transition-all duration-300",
                                                pemContent
                                                    ? "border-foreground bg-foreground/5"
                                                    : "border-foreground/20 hover:border-foreground hover:bg-foreground/5"
                                            )}
                                        >
                                            <input
                                                id="key-upload"
                                                type="file"
                                                accept=".pem"
                                                onChange={handlePemChange}
                                                className="hidden"
                                            />
                                            {pemContent ? (
                                                <div className="flex items-center gap-2">
                                                    <Key size={16} strokeWidth={1} />
                                                    <span className="text-[10px] font-mono">KEY_DATA_PRESENT</span>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-center gap-1 text-muted-foreground group-hover:text-foreground">
                                                    <span className="text-[10px] uppercase tracking-widest">UPLOAD .PEM</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Manual Entry */}
                                        <div className="relative">
                                            <textarea
                                                value={pemContent}
                                                onChange={(e) => setPemContent(e.target.value)}
                                                placeholder="--- BEGIN PRIVATE KEY ---"
                                                className="w-full h-24 p-3 bg-background border border-foreground/20 text-[9px] font-mono focus:border-foreground focus:ring-0 outline-none transition-all resize-none placeholder:text-muted-foreground/20 uppercase"
                                            />
                                            <div className="absolute bottom-2 right-2 pointer-events-none opacity-50">
                                                <Lock size={12} />
                                            </div>
                                        </div>
                                    </div>

                                    {error && (
                                        <div className="p-3 border border-destructive/50 bg-destructive/5 text-destructive text-xs font-mono flex items-center gap-2 uppercase tracking-wide">
                                            <AlertTriangle size={14} />
                                            <span>{error}</span>
                                        </div>
                                    )}

                                    <button
                                        onClick={handleDecrypt}
                                        disabled={!backupFile || !pemContent || isDecrypting}
                                        className="w-full h-12 bg-foreground text-background font-bold font-mono text-sm uppercase tracking-widest hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-3 relative overflow-hidden group"
                                    >
                                        {isDecrypting ? (
                                            <>
                                                <span className="animate-spin text-lg">/</span>
                                                PROCESSING...
                                            </>
                                        ) : (
                                            <>
                                                <Terminal size={14} />
                                                DECRYPT STREAM
                                                <div className="absolute right-0 top-0 bottom-0 w-2 bg-background/20 translate-x-full group-hover:translate-x-0 transition-transform" />
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            // FILE LIST AFTER DECRYPTION
                            <div className="flex flex-col h-full animate-in fade-in duration-300">
                                <div className="p-4 border-b border-foreground/20">
                                    <div className="relative group">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-foreground transition-colors" size={14} />
                                        <input
                                            ref={searchInputRef}
                                            type="text"
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            placeholder="SEARCH_INDEX..."
                                            className="w-full h-10 pl-10 pr-10 bg-background border border-foreground/20 text-xs font-mono focus:border-foreground focus:ring-0 outline-none transition-all placeholder:text-muted-foreground/50 uppercase"
                                        />
                                        {searchQuery && (
                                            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 hover:text-foreground text-muted-foreground">
                                                <X size={12} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto">
                                    <div>
                                        {filteredFiles.length > 0 ? (
                                            filteredFiles.map((fileName, idx) => (
                                                <button
                                                    key={fileName}
                                                    onClick={() => handleFileSelect(fileName)}
                                                    className={cn(
                                                        "w-full text-left px-4 py-3 border-b border-foreground/5 text-xs font-mono flex items-center justify-between transition-all group hover:bg-foreground hover:text-background",
                                                        selectedFile === fileName
                                                            ? "bg-foreground text-background"
                                                            : "text-muted-foreground"
                                                    )}
                                                >
                                                    <div className="flex items-center gap-3 truncate">
                                                        <span className="opacity-50 text-[9px] w-6 text-right">
                                                            {(idx + 1).toString().padStart(2, '0')}
                                                        </span>
                                                        <span className="truncate">{fileName}</span>
                                                    </div>
                                                    {selectedFile === fileName && <ArrowRight size={12} />}
                                                </button>
                                            ))
                                        ) : (
                                            <div className="p-8 text-center text-muted-foreground font-mono text-xs uppercase tracking-widest opacity-50">
                                                No_Matches_Found
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="p-2 border-t border-foreground/20 text-[9px] font-mono text-center uppercase tracking-widest opacity-60">
                                    Total_Objects: {Object.keys(decryptedFiles).length}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* MAIN PREVIEW AREA */}
                    <div className="flex-1 bg-background flex flex-col relative overflow-hidden bg-[radial-gradient(#00000010_1px,transparent_1px)] [background-size:16px_16px]">
                        {selectedFile && decryptedFiles ? (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ duration: 0.2 }}
                                className="flex flex-col h-full"
                            >
                                {/* File Header */}
                                <div className="h-16 border-b border-foreground/20 flex items-center justify-between px-8 bg-background/80 backdrop-blur z-10">
                                    <div className="flex items-center gap-4">
                                        <div className="p-2 border border-foreground/20 bg-background">
                                            {getFileIcon(selectedFile)}
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold tracking-tight">{selectedFile}</span>
                                            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                                                SIZE: {(decryptedFiles[selectedFile].size / 1024).toFixed(2)} KB
                                            </span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => {
                                            const url = URL.createObjectURL(decryptedFiles[selectedFile]);
                                            const a = document.createElement('a');
                                            a.href = url;
                                            a.download = selectedFile;
                                            a.click();
                                            URL.revokeObjectURL(url);
                                        }}
                                        className="h-9 px-4 border border-foreground/20 hover:border-foreground hover:bg-foreground hover:text-background text-xs font-mono uppercase tracking-wider flex items-center gap-2 transition-all"
                                    >
                                        <Download size={14} />
                                        <span>Download</span>
                                    </button>
                                </div>

                                {/* Content */}
                                <div className="flex-1 overflow-auto p-8">
                                    {selectedFile.endsWith('.sqlite') ? (
                                        <div className="h-full bg-background border border-foreground/20 shadow-xl">
                                            <SQLiteViewer dbBlob={decryptedFiles[selectedFile]} className="h-full" />
                                        </div>
                                    ) : selectedFile.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i) ? (
                                        <div className="w-full h-full flex items-center justify-center">
                                            {previewUrl && (
                                                <div className="relative border border-foreground/20 p-2 bg-background shadow-2xl">
                                                    <img
                                                        src={previewUrl}
                                                        alt={selectedFile}
                                                        className="max-w-full max-h-[70vh] object-contain"
                                                    />
                                                    <div className="absolute top-0 left-0 w-full h-full pointer-events-none border border-foreground/10" />
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-6">
                                            <div className="w-24 h-24 border border-foreground/20 flex items-center justify-center relative">
                                                <FileText size={32} strokeWidth={1} />
                                                <div className="absolute top-1 left-1 w-2 h-2 bg-foreground/20" />
                                                <div className="absolute bottom-1 right-1 w-2 h-2 bg-foreground/20" />
                                            </div>
                                            <div className="text-center font-mono uppercase tracking-widest text-xs space-y-2">
                                                <p>Preview_Not_Available</p>
                                                <p className="opacity-50">Please_Download_To_View</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        ) : (
                            // EMPTY STATE
                            <div className="flex-1 flex flex-col items-center justify-center text-foreground/20 gap-8 animate-in fade-in zoom-in duration-500 delay-100 p-8">
                                <div className="relative">
                                    <div className="w-48 h-48 border border-foreground/20 flex items-center justify-center rounded-full border-dashed animate-spin-slow">
                                        <div className="w-32 h-32 border border-foreground/20 flex items-center justify-center rotate-45">
                                            <ShieldCheck size={48} strokeWidth={0.5} />
                                        </div>
                                    </div>
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <div className="w-2 h-2 bg-foreground/20 rounded-full" />
                                    </div>
                                </div>
                                <div className="text-center space-y-4 max-w-sm">
                                    <h3 className="text-xl font-black uppercase tracking-tighter text-foreground/40">
                                        System Ready
                                    </h3>
                                    <p className="text-xs font-mono uppercase tracking-widest leading-relaxed">
                                        Awaiting input stream.<br />
                                        Select file to begin analysis.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    );
};
