import { useState } from 'react';
import { Upload, X, Download, Lock, FileText } from 'lucide-react';
import { deleteFile as deleteFileApi, validateFileClient, formatFileSize, getDownloadUrl, uploadFile as uploadFileApiDirect } from '@/api/files';
import { useUI } from '@/context/UIContext';
import { BaseFieldProps, Label, isPendingFile, PendingFile, StoredFileInfo } from './types';

export default function FileFieldRenderer({ field, onChange, isDisabled, isReadOnly, safeValue }: BaseFieldProps) {
    const { showToast, confirm } = useUI();
    const [isDragging, setIsDragging] = useState(false);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        if (!isDisabled && !isReadOnly) setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const dropActive = isDragging;
    const fileConfig = field.fileConfig || {};
    const isSecure = fileConfig.secure || false;
    const maxSizeMB = fileConfig.maxSizeMB || 25;
    const allowedTypes = fileConfig.allowedTypes || ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'zip', 'csv'];

    const hasFile = safeValue && (
        typeof safeValue === 'string' ||
        isPendingFile(safeValue) ||
        (typeof safeValue === 'object' && 'url' in (safeValue as StoredFileInfo))
    );

    const isPending = isPendingFile(safeValue);
    const storedFile = (!isPending && typeof safeValue === 'object' && 'url' in (safeValue as StoredFileInfo))
        ? (safeValue as StoredFileInfo)
        : null;

    const fileUrl = typeof safeValue === 'string' ? safeValue : storedFile?.url || '';
    const fileName = isPending
        ? (safeValue as PendingFile).file.name
        : (storedFile?.originalName || storedFile?.filename || fileUrl.split('/').pop() || 'file');
    const fileSize = isPending
        ? (safeValue as PendingFile).file.size
        : (storedFile?.size || 0);
    const isEncrypted = storedFile?.encrypted || isSecure;

    const handleFileSelect = (files: FileList) => {
        if (files.length === 0) return;
        const file = files[0];

        const validation = validateFileClient(file, fileConfig);
        if (!validation.valid) {
            showToast('error', 'ÉRVÉNYTELEN FÁJL', validation.error || 'A fájl nem megfelelő.');
            return;
        }

        const pendingFile: PendingFile = { file, _isPendingFile: true };
        onChange(pendingFile);
        showToast('info', 'FÁJL KIVÁLASZTVA', 'A fájl mentéskor kerül feltöltésre.');
    };

    const handleFileDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (isDisabled || isReadOnly) return;

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFileSelect(e.dataTransfer.files);
        }
    };

    const handleClearFile = () => {
        if (isDisabled || isReadOnly) return;

        if (isPending) {
            onChange(null);
            return;
        }

        confirm({
            title: 'Fájl Törlése',
            message: 'Biztosan törölni szeretné ezt a fájlt? A fájl törlődik a szerverről.',
            isDestructive: true,
            confirmLabel: 'Végleges Törlés',
            onConfirm: async () => {
                if (fileUrl) {
                    try { await deleteFileApi(fileUrl); } catch (e) { }
                }
                onChange(null);
            }
        });
    };

    const handleDownload = async () => {
        if (!fileUrl) return;
        showToast('info', 'LETÖLTÉS', 'Letöltés előkészítése...');
        const downloadUrl = await getDownloadUrl(fileUrl);

        // Safari detection - Safari blocks window.open in async callbacks
        const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

        if (isSafari) {
            // Safari-compatible download using anchor click
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = fileName;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } else {
            // Chrome and other browsers
            window.open(downloadUrl, '_blank');
        }
    };

    const acceptTypes = allowedTypes.map(t => `.${t}`).join(',');

    return (
        <div className="space-y-4">
            <Label required={field.required}>{field.label}</Label>

            {isSecure && (
                <div className="flex items-center gap-2 mb-2">
                    <Lock size={12} className="text-yellow-500" />
                    <span className="text-[9px] font-mono uppercase tracking-wider text-yellow-500">
                        BIZTONSÁGOS FELTÖLTÉS (AES-256)
                    </span>
                </div>
            )}

            {!hasFile ? (
                <div
                    className={`
                        relative w-full min-h-[140px] border transition-all duration-300 flex flex-col items-center justify-center gap-3 group
                        ${dropActive ? 'border-2 border-foreground bg-secondary/20 scale-[1.01]' : 'border-dashed border-border hover:border-foreground/50'}
                        ${isSecure ? 'border-yellow-500/50 hover:border-yellow-500' : ''}
                        ${(isDisabled || isReadOnly) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                    `}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleFileDrop}
                >
                    {!(isDisabled || isReadOnly) && (
                        <input
                            type="file"
                            accept={acceptTypes}
                            onChange={(e) => e.target.files && handleFileSelect(e.target.files)}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                        />
                    )}

                    <div className={`p-3 border rounded-full ${isSecure ? 'border-yellow-500/50' : 'border-border'}`}>
                        {isSecure ? <Lock size={20} className="text-yellow-500" /> : <Upload size={20} className="text-foreground/40" />}
                    </div>

                    <span className="text-[10px] font-mono uppercase tracking-widest opacity-60">
                        {dropActive ? 'ENGEDD EL A FELTÖLTÉSHEZ' : 'HÚZZ IDE FÁJLT VAGY KATTINTS'}
                    </span>

                    <span className="text-[9px] font-mono text-foreground/40 uppercase">
                        {allowedTypes.join(', ')} • MAX {maxSizeMB}MB
                    </span>
                </div>
            ) : (
                <div className={`
                    relative w-full border p-4 transition-all group
                    ${isSecure || isEncrypted ? 'border-yellow-500/50 bg-yellow-500/5' : 'border-border bg-secondary/5'}
                `}>
                    <div className="flex items-center gap-4">
                        <div className={`
                            w-12 h-12 flex items-center justify-center text-2xl border
                            ${isEncrypted ? 'border-yellow-500/50 bg-yellow-500/10' : 'border-border bg-secondary/10'}
                        `}>
                            {isEncrypted ? <Lock size={20} className="text-yellow-500" /> : <FileText size={20} className="text-foreground/60" />}
                        </div>

                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-mono truncate">{fileName}</span>
                                {isPending && (
                                    <span className="px-1.5 py-0.5 bg-yellow-500/90 text-black text-[8px] font-mono uppercase animate-pulse">
                                        NINCS MENTVE
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-[9px] font-mono text-foreground/50 uppercase">
                                <span>{formatFileSize(fileSize)}</span>
                                {isEncrypted && (
                                    <span className="text-yellow-500 flex items-center gap-1">
                                        <Lock size={8} /> AES-256
                                    </span>
                                )}
                            </div>
                        </div>

                        {!(isDisabled || isReadOnly) && (
                            <div className="flex items-center gap-2">
                                {!isPending && fileUrl && (
                                    <button
                                        onClick={handleDownload}
                                        className="p-2 border border-border hover:border-foreground hover:bg-foreground hover:text-background transition-colors"
                                        title="Letöltés"
                                    >
                                        <Download size={14} />
                                    </button>
                                )}
                                <button
                                    onClick={handleClearFile}
                                    className="p-2 border border-border hover:border-destructive hover:bg-destructive hover:text-white transition-colors"
                                    title="Törlés"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {isPending && (
                <div className="flex items-center gap-3 animate-pulse">
                    <span className="text-[9px] font-mono text-yellow-500">● A fájl mentéskor töltődik fel a szerverre</span>
                    <button
                        onClick={async () => {
                            if (!isPendingFile(safeValue)) return;
                            showToast('info', 'FELTÖLTÉS', 'Fájl feltöltése folyamatban...');
                            try {
                                const response = await uploadFileApiDirect(safeValue.file, fileConfig);
                                if (response.success && response.file) {
                                    onChange(response.file);
                                    showToast('success', 'FELTÖLTVE', 'A fájl sikeresen feltöltve.');
                                } else {
                                    showToast('error', 'HIBA', response.error || 'Ismeretlen hiba történt.');
                                }
                            } catch (e) {
                                const errorMsg = e instanceof Error ? e.message : 'Nem sikerült feltölteni a fájlt.';
                                showToast('error', 'FELTÖLTÉSI HIBA', errorMsg);
                            }
                        }}
                        className="px-2 py-1 text-[9px] font-mono uppercase tracking-wider border border-yellow-500 text-yellow-500 hover:bg-yellow-500 hover:text-black transition-colors animate-none hover:animate-none"
                    >
                        FELTÖLTÉS MOST
                    </button>
                </div>
            )}

            {field.helpText && (
                <div className="text-[9px] font-mono opacity-40">{field.helpText}</div>
            )}
        </div>
    );
}
