/**
 * FileDropZone - Drag & Drop file upload component
 */

import { useRef, useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { Upload, Loader2, FileSpreadsheet, FileJson, Table2 } from 'lucide-react';

interface FileDropZoneProps {
    onFileSelect: (file: File) => void;
    processing: boolean;
    progress: number;
}

const FILE_ICONS: Record<string, typeof FileSpreadsheet> = {
    xlsx: FileSpreadsheet,
    xls: FileSpreadsheet,
    csv: Table2,
    json: FileJson,
};

export function FileDropZone({ onFileSelect, processing, progress }: FileDropZoneProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [draggedFileName, setDraggedFileName] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleDragEnter = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);

        // Try to get filename from drag event
        const items = e.dataTransfer.items;
        if (items.length > 0 && items[0].kind === 'file') {
            const fileName = e.dataTransfer.files[0]?.name;
            if (fileName) setDraggedFileName(fileName);
        }
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        setDraggedFileName(null);
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        setDraggedFileName(null);

        const droppedFile = e.dataTransfer.files[0];
        if (droppedFile) {
            onFileSelect(droppedFile);
        }
    }, [onFileSelect]);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            onFileSelect(selectedFile);
        }
    };

    const getFileIcon = (filename: string | null) => {
        if (!filename) return Upload;
        const ext = filename.split('.').pop()?.toLowerCase() || '';
        return FILE_ICONS[ext] || Upload;
    };

    const FileIcon = getFileIcon(draggedFileName);

    return (
        <div className="relative">
            <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv,.json"
                onChange={handleFileSelect}
                className="hidden"
            />

            <motion.div
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => !processing && fileInputRef.current?.click()}
                animate={{
                    scale: isDragging ? 1.02 : 1,
                    borderColor: isDragging ? 'hsl(var(--foreground))' : 'hsl(var(--border))',
                }}
                className={`
                    relative overflow-hidden
                    border-2 border-dashed rounded-lg
                    min-h-[200px] flex items-center justify-center
                    cursor-pointer transition-colors
                    ${isDragging ? 'bg-foreground/5' : 'hover:bg-foreground/[0.02]'}
                    ${processing ? 'pointer-events-none' : ''}
                `}
            >
                {/* Animated background pattern */}
                <div className="absolute inset-0 opacity-[0.03]">
                    <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                        <defs>
                            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="currentColor" strokeWidth="0.5" />
                            </pattern>
                        </defs>
                        <rect width="100%" height="100%" fill="url(#grid)" />
                    </svg>
                </div>

                {processing ? (
                    <div className="flex flex-col items-center gap-4 z-10">
                        <div className="relative">
                            <Loader2 size={40} className="animate-spin opacity-50" />
                            <motion.div
                                className="absolute inset-0 rounded-full border-2 border-foreground/20"
                                animate={{ rotate: 360 }}
                                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                            />
                        </div>
                        <div className="text-center">
                            <p className="text-sm font-mono">FELDOLGOZÁS...</p>
                            <p className="text-xs opacity-50 mt-1">{progress}%</p>
                        </div>
                        <div className="w-48 h-1 bg-border rounded-full overflow-hidden">
                            <motion.div
                                className="h-full"
                                style={{ backgroundColor: 'currentColor' }}
                                initial={{ width: 0 }}
                                animate={{ width: `${progress}%` }}
                                transition={{ ease: 'easeOut', duration: 0.3 }}
                            />
                        </div>
                    </div>
                ) : (
                    <motion.div
                        className="flex flex-col items-center gap-4 z-10"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                    >
                        <motion.div
                            animate={{
                                y: isDragging ? -5 : 0,
                                scale: isDragging ? 1.1 : 1,
                            }}
                            className="relative"
                        >
                            <FileIcon size={48} className="opacity-30" strokeWidth={1} />
                            {isDragging && (
                                <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center"
                                >
                                    <span className="text-white text-xs">+</span>
                                </motion.div>
                            )}
                        </motion.div>

                        <div className="text-center max-w-xs">
                            {isDragging ? (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                >
                                    <p className="text-sm font-medium">Engedd el a fájlt</p>
                                    {draggedFileName && (
                                        <p className="text-xs opacity-50 mt-1 font-mono truncate max-w-[200px]">
                                            {draggedFileName}
                                        </p>
                                    )}
                                </motion.div>
                            ) : (
                                <>
                                    <p className="text-sm mb-1">
                                        <span className="font-medium">Húzd ide</span> a fájlt vagy{' '}
                                        <span className="text-foreground underline underline-offset-2">böngéssz</span>
                                    </p>
                                    <p className="text-xs opacity-40 font-mono">
                                        XLSX • CSV • JSON — max 100MB
                                    </p>
                                </>
                            )}
                        </div>
                    </motion.div>
                )}
            </motion.div>
        </div>
    );
}
