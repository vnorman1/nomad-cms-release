import { useState, useRef } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { Upload, FileText, AlertTriangle } from 'lucide-react';
import { useUI } from '@/context/UIContext';
import { marked } from 'marked';
import { BaseFieldProps, Label } from './types';
import { sanitizeHTML, sanitizeMarkdownInput } from '@/utils/sanitize';

export default function RichTextFieldRenderer({ field, onChange, isDisabled, isReadOnly, safeValue }: BaseFieldProps) {
    const { showToast } = useUI();
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const quillRef = useRef<ReactQuill>(null);

    const processFile = async (file: File) => {
        const isMarkdown = file.name.endsWith('.md') || file.name.endsWith('.markdown');

        if (!isMarkdown) {
            showToast('error', 'ÉRVÉNYTELEN FÁJL', 'Csak .md vagy .markdown fájlok importálhatók.');
            return;
        }

        try {
            const text = await file.text();
            // SECURITY: Pre-sanitize markdown before parsing
            const sanitizedMarkdown = sanitizeMarkdownInput(text);
            const htmlContent = await marked.parse(sanitizedMarkdown);
            // SECURITY: Post-sanitize HTML output to prevent XSS
            const safeHtml = sanitizeHTML(htmlContent);

            onChange(safeHtml);
            showToast('success', 'IMPORTÁLÁS SIKERES', 'Markdown tartalom konvertálva és betöltve.');
        } catch (error) {
            console.error(error);
            showToast('error', 'OLVASÁSI HIBA', 'Nem sikerült beolvasni a fájlt.');
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        if (!isDisabled && !isReadOnly) {
            setIsDragging(true);
        }
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        if (isDisabled || isReadOnly) return;

        const files = Array.from(e.dataTransfer.files);
        if (files.length === 0) return;

        await processFile(files[0]);
    };

    const handleManualUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (isDisabled || isReadOnly) return;
        const files = e.target.files;
        if (files && files.length > 0) {
            processFile(files[0]);
        }
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const modules = {
        toolbar: [
            [{ 'header': [1, 2, 3, false] }],
            ['bold', 'italic', 'underline', 'strike', 'blockquote'],
            [{ 'list': 'ordered' }, { 'list': 'bullet' }],
            ['link'],
            ['clean']
        ],
        clipboard: {
            matchVisual: false,
        }
    };

    return (
        <div className="space-y-2 group">
            <Label required={field.required}>{field.label}</Label>

            <div
                className={`relative border transition-all duration-300 
                    ${isDragging ? 'border-2 border-foreground bg-secondary/20 scale-[1.01] z-10' : 'border-border'}
                    ${(isDisabled || isReadOnly) ? 'opacity-60 pointer-events-none bg-secondary/5' : 'bg-background'}
                `}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                {isDragging && (
                    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/90 backdrop-blur-sm pointer-events-none">
                        <FileText size={48} className="mb-4 animate-bounce text-foreground" />
                        <h3 className="text-lg font-bold tracking-tight">EJTSE IDE A FÁJLT</h3>
                        <p className="text-xs font-mono uppercase tracking-widest opacity-60">Markdown importálása...</p>
                        <div className="mt-4 flex items-center gap-2 text-[10px] font-mono text-amber-500 bg-amber-500/10 px-2 py-1">
                            <AlertTriangle size={12} />
                            A KÉPEK AUTOMATIKUSAN ELTÁVOLÍTÁSRA KERÜLNEK
                        </div>
                    </div>
                )}

                <style>{`
                    .ql-toolbar {
                        border: none !important;
                        border-bottom: 1px solid var(--border) !important;
                        background: var(--secondary-bg);
                        font-family: inherit;
                    }
                    .ql-container {
                        border: none !important;
                        font-family: 'Inter', sans-serif;
                        font-size: 1rem;
                    }
                    .ql-editor {
                        min-height: 200px;
                        max-height: 600px;
                        overflow-y: auto;
                    }
                    .ql-editor.ql-blank::before {
                        color: rgba(255, 255, 255, 0.3);
                        font-style: normal;
                        font-family: monospace;
                        text-transform: uppercase;
                        font-size: 10px;
                        letter-spacing: 0.1em;
                    }
                    .ql-stroke {
                        stroke: currentColor !important;
                    }
                    .ql-fill {
                        fill: currentColor !important;
                    }
                    .ql-picker {
                        color: currentColor !important;
                    }
                    .ql-picker-options {
                        background-color: #000 !important;
                        border: 1px solid var(--border) !important;
                        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5);
                    }
                    .ql-picker-item {
                        color: rgba(255, 255, 255, 0.6) !important;
                    }
                    .ql-picker-item:hover, .ql-picker-item.ql-selected {
                        color: #fff !important;
                    }
                    .ql-picker-label {
                        color: currentColor !important;
                    }
                    .ql-picker-label:hover {
                        color: currentColor !important;
                        opacity: 0.7;
                    }
                `}</style>

                <ReactQuill
                    ref={quillRef}
                    theme="snow"
                    value={safeValue || ''}
                    onChange={onChange}
                    modules={isDisabled || isReadOnly ? { toolbar: false } : modules}
                    readOnly={isReadOnly || isDisabled}
                    placeholder={`// ${field.label.toUpperCase()} TARTALOM...`}
                    className="nomad-quill"
                />

                {!isDisabled && !isReadOnly && (
                    <>
                        <input
                            type="file"
                            ref={fileInputRef}
                            accept=".md,.markdown"
                            className="hidden"
                            onChange={handleManualUpload}
                        />
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            title="Import Markdown (.md)"
                            type="button"
                            className="absolute bottom-3 right-3 p-2 bg-secondary/10 hover:bg-foreground hover:text-background border border-transparent hover:border-foreground rounded-full transition-all duration-300 z-10 opacity-40 hover:opacity-100 group-hover:opacity-60"
                        >
                            <Upload size={14} />
                        </button>
                    </>
                )}
            </div>

            <div className="flex justify-between items-center text-[9px] font-mono opacity-40">
                <span>HTML MODE</span>
                <span>DRAG & DROP .MD SUPPORTED (NO IMAGES)</span>
            </div>
        </div>
    );
}
