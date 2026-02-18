/**
 * BlocksFieldRenderer
 * 
 * A dynamic content block editor inspired by Gutenberg/Notion.
 * Features a pure "Web Page Builder" experience in a full-screen modal.
 * 
 * - Form View: Displays a clean "Open Editor" button and stats.
 * - Editor View: Full-screen overlay with spacious drag-and-drop area.
 */

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion';
import {
    Plus,
    GripVertical,
    Trash2,
    Maximize2,
    X,
    Save,
    Layout,
    ArrowLeft
} from 'lucide-react';
import * as Icons from 'lucide-react';
import { cn } from '@/lib/utils';
import FieldRenderer from '../FieldRenderer';
import type { FieldConfig, FieldType } from '@/config/admin.config';
import { FIELD_TYPES } from '@/components/SchemaBuilder/types';
import { useTheme } from '@/context/ThemeContext';


// Block structure
interface ContentBlock {
    id: string;
    type: FieldType;
    data: unknown;
}

interface BlocksFieldRendererProps {
    field: FieldConfig;
    value: ContentBlock[] | null | undefined;
    onChange: (value: ContentBlock[]) => void;
    disabled?: boolean;
}



// Generate unique ID for blocks
const generateBlockId = () => `block_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

// ----------------------------------------------------------------------------
// FULL SCREEN EDITOR COMPONENT
// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------
// PREVIEW COMPONENTS
// ----------------------------------------------------------------------------

function BlockPreviewRenderer({ block }: { block: ContentBlock }) {
    if (!block.data) return null;

    // RICHTEXT / MARKDOWN (Legacy support for 'markdown')
    if (block.type === 'richtext' || (block.type as string) === 'markdown') {
        const htmlContent = block.data as string;
        // Helper to handle Quill classes that standard prose might miss
        // ... (preserving this comment logic is fine, or simplifying)

        return (
            <div
                className={cn(
                    "w-full text-foreground/90",
                    // Headings - Force styles
                    "[&_h1]:text-4xl [&_h1]:font-extrabold [&_h1]:tracking-tight [&_h1]:mt-8 [&_h1]:mb-4 [&_h1]:leading-tight [&_h1]:text-foreground",
                    "[&_h2]:text-3xl [&_h2]:font-bold [&_h2]:tracking-tight [&_h2]:mt-6 [&_h2]:mb-4 [&_h2]:leading-tight [&_h2]:text-foreground",
                    "[&_h3]:text-2xl [&_h3]:font-bold [&_h3]:tracking-tight [&_h3]:mt-5 [&_h3]:mb-3 [&_h3]:text-foreground",
                    "[&_h4]:text-xl [&_h4]:font-semibold [&_h4]:tracking-tight [&_h4]:mt-4 [&_h4]:mb-2 [&_h4]:text-foreground",
                    "[&_h5]:text-lg [&_h5]:font-semibold [&_h5]:mt-4 [&_h5]:mb-2 [&_h5]:text-foreground",
                    "[&_h6]:text-base [&_h6]:font-semibold [&_h6]:mt-4 [&_h6]:mb-2 [&_h6]:text-foreground",
                    // Content
                    "[&_p]:text-base [&_p]:leading-7 [&_p]:mb-4",
                    "[&_a]:font-medium [&_a]:underline [&_a]:underline-offset-4 [&_a]:text-primary hover:[&_a]:text-primary/80 [&_a]:transition-colors",
                    "[&_blockquote]:border-l-4 [&_blockquote]:border-primary/50 [&_blockquote]:pl-6 [&_blockquote]:py-2 [&_blockquote]:italic [&_blockquote]:bg-muted/30 [&_blockquote]:rounded-r [&_blockquote]:my-4",
                    "[&_hr]:my-8 [&_hr]:border-border",
                    // Lists - Strict overrides
                    "[&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4",
                    "[&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-4",
                    "[&_li]:my-1.5 [&_li]:pl-1",
                    "[&_ul_ul]:list-[circle] [&_ul_ul]:mt-2",
                    "[&_ul_ul_ul]:list-[square] [&_ul_ul_ul]:mt-2",
                    "[&_ol_ol]:list-[lower-alpha] [&_ol_ol]:mt-2",
                    "[&_ol_ol_ol]:list-[lower-roman] [&_ol_ol_ol]:mt-2",
                    // Code
                    "[&_code]:px-1.5 [&_code]:py-0.5 [&_code]:bg-muted [&_code]:rounded [&_code]:font-mono [&_code]:text-sm [&_code]:text-foreground",
                    "[&_pre]:p-4 [&_pre]:bg-zinc-950 [&_pre]:text-zinc-50 [&_pre]:rounded-lg [&_pre]:shadow-lg [&_pre]:overflow-x-auto [&_pre]:my-4",
                    // Images & Media
                    "[&_img]:rounded-lg [&_img]:shadow-md [&_img]:border [&_img]:border-border/50 [&_img]:mx-auto [&_img]:my-8 [&_img]:max-w-full",
                    // Specific Quill/Editor overrides
                    "[&_.ql-align-center]:text-center [&_.ql-align-right]:text-right [&_.ql-align-justify]:text-justify",
                    "[&_.ql-size-small]:text-sm [&_.ql-size-large]:text-lg [&_.ql-size-huge]:text-3xl",
                    "[&_.ql-font-serif]:font-serif [&_.ql-font-monospace]:font-mono",
                    // Indentation (Quill uses ql-indent-1 ... ql-indent-8)
                    "[&_.ql-indent-1]:pl-8",
                    "[&_.ql-indent-2]:pl-16",
                    "[&_.ql-indent-3]:pl-24",
                    "[&_.ql-indent-4]:pl-32",
                    "[&_.ql-indent-5]:pl-40",
                    "[&_.ql-indent-6]:pl-48",
                    "[&_.ql-indent-7]:pl-56",
                    "[&_.ql-indent-8]:pl-64",
                    // Fix for empty paragraphs often generated by editors
                    "[&_p:empty]:hidden"
                )}
                dangerouslySetInnerHTML={{ __html: htmlContent }}
            />
        );
    }

    // IMAGE
    if (block.type === 'image') {
        const src = typeof block.data === 'string' ? block.data : (block.data as any).preview;
        if (!src) return null;
        return (
            <figure className="my-8 flex justify-center">
                <img
                    src={src}
                    alt="Block Content"
                    className="w-full h-auto max-h-[80vh] object-contain rounded-lg shadow-sm border border-border/50 bg-muted/20"
                    loading="lazy"
                    decoding="async"
                />
            </figure>
        );
    }

    // IFRAME / EMBED
    if (block.type === 'iframe') {
        let src = block.data as string;
        if (!src) return null;

        if (src.includes('<iframe')) {
            const match = src.match(/src=["'](.*?)["']/);
            if (match && match[1]) src = match[1];
        }

        try {
            const url = new URL(src);

            if (url.protocol !== 'http:' && url.protocol !== 'https:') {
                console.warn('Blocked unsafe iframe protocol:', url.protocol);
                return null;
            }

            if (url.hostname.includes('youtube.com') || url.hostname.includes('youtu.be')) {
                url.searchParams.set('mute', '1');
                url.searchParams.set('autoplay', '0');
                src = url.toString();
            }
            if (url.hostname.includes('vimeo.com')) {
                url.searchParams.set('muted', '1');
                url.searchParams.set('autoplay', '0');
                src = url.toString();
            }
        } catch { }

        return (
            <div className="my-8 w-full aspect-video bg-black/5 rounded-lg overflow-hidden border border-border/50 shadow-sm">
                <iframe
                    src={src}
                    className="w-full h-full"
                    allowFullScreen
                    allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    sandbox="allow-scripts allow-same-origin allow-presentation"
                    title="Embedded Content"
                />
            </div>
        );
    }

    // VIDEO
    if (block.type === 'video') {
        const src = typeof block.data === 'string' ? block.data : (block.data as any)?.preview;
        if (!src) return null;
        return (
            <div className="my-8 w-full max-w-4xl mx-auto">
                <video
                    src={src}
                    controls
                    className="w-full rounded-lg shadow-sm border border-border/50 bg-black"
                    preload="metadata"
                >
                    A böngésződ nem támogatja a video elemet.
                </video>
            </div>
        );
    }

    // AUDIO
    if (block.type === 'audio') {
        const src = typeof block.data === 'string' ? block.data : (block.data as any)?.preview;
        if (!src) return null;
        return (
            <div className="my-8 w-full max-w-2xl mx-auto p-4 bg-muted/20 rounded-lg border border-border/50">
                <audio
                    src={src}
                    controls
                    className="w-full"
                    preload="metadata"
                >
                    A böngésződ nem támogatja a audio elemet.
                </audio>
            </div>
        );
    }



    // TEXT / TEXTAREA (Headline vs Paragraph heuristic)
    if (block.type === 'text' || block.type === 'textarea') {
        const text = block.data as string;
        // Simple heuristic: Short text = Headline, Long text = Paragraph
        if (text.length < 100 && !text.includes('\n')) {
            return (
                <h2 className="text-3xl md:text-4xl font-bold tracking-tight my-6 leading-tight text-foreground">
                    {text}
                </h2>
            );
        }
        return (
            <p className="leading-relaxed text-lg my-4 whitespace-pre-wrap text-muted-foreground">
                {text}
            </p>
        );
    }

    // FALLBACK
    return (
        <div className="p-4 border border-dashed border-border rounded font-mono text-xs my-4 opacity-50 text-muted-foreground">
            [{block.type.toUpperCase()}] Content
        </div>
    );
}

function BrowserFrame({ children, device }: { children: React.ReactNode, device: 'desktop' | 'mobile' }) {
    return (
        <div className={cn(
            "mx-auto transition-all duration-500 ease-in-out flex flex-col shadow-2xl overflow-hidden ring-1 ring-foreground/10 bg-background text-foreground",
            device === 'mobile'
                ? "w-[375px] rounded-[3rem] border-[8px] border-foreground/10 my-10 min-h-[700px] shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)]"
                : "w-full max-w-5xl rounded-xl border border-border/50 my-10 min-h-[600px] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)]"
        )}>
            {/* Header / StatusBar */}
            <div className={cn(
                "flex items-center shrink-0 px-4 transition-colors duration-300 relative z-10",
                "bg-muted/50 border-b border-border",
                device === 'mobile' ? "h-11 justify-center" : "h-12 justify-between gap-4"
            )}>
                {device === 'mobile' ? (
                    // Mobile Notch
                    <div className="w-28 h-5 bg-black rounded-b-xl absolute top-0 left-1/2 -translate-x-1/2 flex items-center justify-center">
                        <div className="w-10 h-1 bg-zinc-800 rounded-full opacity-30 mt-1" />
                    </div>
                ) : (
                    // Desktop Browser Bar
                    <>
                        <div className="flex gap-2">
                            <div className="w-3 h-3 rounded-full bg-[#FF5F57] border border-black/10" />
                            <div className="w-3 h-3 rounded-full bg-[#FEBC2E] border border-black/10" />
                            <div className="w-3 h-3 rounded-full bg-[#28C840] border border-black/10" />
                        </div>
                        <div className={cn(
                            "flex-1 max-w-2xl mx-auto h-7 rounded-[4px] flex items-center justify-center text-[10px] font-medium tracking-wide transition-colors",
                            "bg-background border border-border shadow-sm text-muted-foreground"
                        )}>
                            <Icons.Lock size={8} className="mr-1.5 opacity-50" />
                            nomad.no/preview/example_page
                        </div>
                        <div className="w-16" />
                    </>
                )}
            </div>

            {/* Content Area */}
            <div className={cn(
                "flex-1 overflow-y-auto transition-colors duration-300 custom-scrollbar",
                "bg-background text-foreground"
            )}>
                <div className={cn(
                    "min-h-full transition-all duration-500",
                    device === 'mobile' ? "p-5 pt-8 pb-10" : "p-12 md:p-16"
                )}>
                    {children}
                </div>
            </div>
        </div>
    );
}

// ----------------------------------------------------------------------------
// FULL SCREEN EDITOR COMPONENT
// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------
// SORTABLE BLOCK ITEM (Extracted for DragControls)
// ----------------------------------------------------------------------------

interface SortableBlockItemProps {
    block: ContentBlock;
    index: number;
    onUpdate: (index: number, data: unknown) => void;
    onRemove: (index: number) => void;
    onDuplicate: (index: number) => void;
    collapsed: boolean;
    onToggleCollapse: (id: string) => void;
}

function SortableBlockItem({
    block,
    index,
    onUpdate,
    onRemove,
    onDuplicate,
    collapsed,
    onToggleCollapse
}: SortableBlockItemProps) {
    const { theme: _theme } = useTheme();
    const dragControls = useDragControls();
    const typeInfo = FIELD_TYPES.find(t => t.type === block.type);

    const virtualField: FieldConfig = {
        id: block.id,
        label: typeInfo?.label || block.type,
        type: block.type,
        required: false,
    };

    return (
        <Reorder.Item
            value={block}
            id={block.id}
            dragListener={false}
            dragControls={dragControls}
            dragElastic={0}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className={cn(
                "relative group bg-background border border-border/50 shadow-sm rounded-lg overflow-hidden transition-shadow",
                "hover:border-foreground/20 hover:shadow-md"
            )}
        >
            {/* Block Handle & Toolbar */}
            <div
                className="absolute left-0 top-0 bottom-0 w-12 bg-muted/20 border-r border-border/50 flex flex-col items-center py-3 z-10 transition-colors hover:bg-muted/40"
            >
                {/* Drag Handle - Explicit Control */}
                <div
                    onPointerDown={(e) => dragControls.start(e)}
                    className="p-2 mb-2 cursor-grab active:cursor-grabbing opacity-40 hover:opacity-100 transition-opacity touch-none"
                    title="Húzás a mozgatáshoz"
                >
                    <GripVertical size={16} />
                </div>

                <button
                    onClick={() => onToggleCollapse(block.id)}
                    className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-background rounded-md transition-colors mb-2"
                    title={collapsed ? "Kinyitás" : "Összecsukás"}
                >
                    {collapsed ? <Icons.ChevronDown size={14} /> : <Icons.ChevronUp size={14} />}
                </button>

                <div className="mt-auto flex flex-col gap-2">
                    <button
                        onClick={() => onDuplicate(index)}
                        className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-background rounded-md transition-colors"
                        title="Duplikálás"
                    >
                        <Icons.Copy size={14} />
                    </button>
                    <button
                        onClick={() => onRemove(index)}
                        className="p-1.5 text-red-500/40 hover:text-red-500 hover:bg-red-500/10 rounded-md transition-colors"
                        title="Törlés"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>

            {/* Label Badge */}
            <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                <span className={cn(
                    "text-[8px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded border",
                    typeInfo?.color ? typeInfo.color + " bg-background" : "bg-muted border-foreground/10"
                )}>
                    {typeInfo?.label}
                </span>
            </div>

            {/* Block Content Wrapper */}
            <div className="pl-12 p-6 relative min-h-[160px]">
                {collapsed ? (
                    <div
                        className="flex items-center gap-3 opacity-60 cursor-pointer h-full"
                        onClick={() => onToggleCollapse(block.id)}
                    >
                        <div className={cn(
                            "ml-4 w-10 h-10 rounded flex items-center justify-center bg-muted/30 border border-border",
                            typeInfo?.color
                        )}>
                            {typeInfo?.icon && (Icons as any)[typeInfo.icon] ?
                                (() => {
                                    const Icon = (Icons as any)[typeInfo.icon];
                                    return <Icon size={18} />;
                                })()
                                : <Icons.Box size={18} />
                            }
                        </div>
                        <div className="flex flex-col">
                            <span className="font-mono text-xs uppercase tracking-wider text-foreground">
                                {typeInfo?.label}
                            </span>
                            <span className="text-[10px] text-muted-foreground italic">
                                Kattints a kinyitáshoz
                            </span>
                        </div>
                    </div>
                ) : (
                    <div className="block-content">
                        <FieldRenderer
                            field={virtualField}
                            value={block.data}
                            onChange={(d) => onUpdate(index, d)}
                            disabled={false}
                        />
                    </div>
                )}
            </div>
        </Reorder.Item>
    );
}

// ----------------------------------------------------------------------------
// FULL SCREEN EDITOR COMPONENT
// ----------------------------------------------------------------------------

function FullScreenEditor({
    blocks,
    onChange,
    onClose,
    activeFieldLabel
}: {
    blocks: ContentBlock[];
    onChange: (blocks: ContentBlock[]) => void;
    onClose: () => void;
    activeFieldLabel: string;
}) {
    const { theme, toggleTheme } = useTheme();
    // Local state to prevent instant autosave on every keystroke
    const [localBlocks, setLocalBlocks] = useState<ContentBlock[]>(blocks);

    const [showPicker, setShowPicker] = useState(false);
    const [scrolled, setScrolled] = useState(false);
    const [isPreviewMode, setIsPreviewMode] = useState(false);
    const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

    // Update local state if external blocks change (e.g. initial load) - optional, 
    // but usually bad if we want to isolate state. 
    // For now, let's assume 'blocks' is just the initial seed or we sync only if we are not dirty.
    // Simplifying: we trust localBlocks after mount.

    // Scroll listener for header shadow
    useEffect(() => {
        const handleScroll = (e: Event) => {
            const target = e.target as HTMLElement;
            setScrolled(target.scrollTop > 10);
        };

        // Listen to both potential scroll areas
        const canvas = document.getElementById('block-editor-canvas');
        const preview = document.getElementById('block-editor-preview');

        canvas?.addEventListener('scroll', handleScroll);
        preview?.addEventListener('scroll', handleScroll);

        return () => {
            canvas?.removeEventListener('scroll', handleScroll);
            preview?.removeEventListener('scroll', handleScroll);
        };
    }, [isPreviewMode]); // Re-bind when mode changes to ensure we catch the new element

    // Lock body scroll when editor is open
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = '';
        };
    }, []);

    const handleSave = useCallback(() => {
        onChange(localBlocks);
        onClose();
    }, [localBlocks, onChange, onClose]);

    const handleAddBlock = useCallback((type: FieldType) => {
        const newBlock: ContentBlock = {
            id: generateBlockId(),
            type,
            data: null,
        };
        setLocalBlocks(prev => [...prev, newBlock]);
        setShowPicker(false);
    }, []);

    const handleUpdateBlock = useCallback((index: number, data: unknown) => {
        setLocalBlocks(prev => {
            const newBlocks = [...prev];
            newBlocks[index] = { ...newBlocks[index], data };
            return newBlocks;
        });
    }, []);

    const handleRemoveBlock = useCallback((index: number) => {
        setLocalBlocks(prev => prev.filter((_, i) => i !== index));
    }, []);

    const handleDuplicateBlock = useCallback((index: number) => {
        setLocalBlocks(prev => {
            const blockToDuplicate = prev[index];
            const newBlock = {
                ...blockToDuplicate,
                id: generateBlockId()
            };
            const newBlocks = [...prev];
            newBlocks.splice(index + 1, 0, newBlock);
            return newBlocks;
        });
    }, []);

    const toggleCollapse = useCallback((id: string) => {
        setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));
    }, []);

    const handleReorder = useCallback((newOrder: ContentBlock[]) => {
        setLocalBlocks(newOrder);
    }, []);

    // Filter types for the picker
    const blockableTypes = FIELD_TYPES.filter(t =>
        !['slug', 'boolean', 'select', 'multiselect', 'array', 'blocks'].includes(t.type)
    );

    const fieldTypesMap = FIELD_TYPES.reduce((acc, t) => ({ ...acc, [t.type]: t }), {} as Record<string, typeof FIELD_TYPES[0]>);

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className={cn(
                "fixed inset-0 z-50 bg-background flex flex-col text-foreground",
                theme === 'dark' && "dark"
            )}
        >
            {/* Header */}
            <header className={cn(
                "flex items-center justify-between px-6 py-4 transition-all z-20",
                scrolled ? "bg-background/95 backdrop-blur border-b border-border shadow-sm" : "bg-transparent"
            )}>
                <div className="flex items-center gap-4">
                    <button
                        onClick={onClose}
                        className="p-2 -ml-2 hover:bg-foreground/5 rounded-full transition-colors"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h2 className="font-bold text-lg leading-none">{activeFieldLabel}</h2>
                        <span className="text-[10px] font-mono uppercase tracking-widest opacity-50">
                            Weboldal Szerkesztő • {localBlocks.length} blokk
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {isPreviewMode && (
                        <>
                            {/* Device Toggle */}
                            <div className="flex rounded-lg overflow-hidden border border-border mr-2">
                                <button
                                    onClick={() => setPreviewDevice('desktop')}
                                    className={cn("px-3 py-1.5 transition-colors", previewDevice === 'desktop' ? "bg-foreground text-background" : "hover:bg-muted")}
                                    title="Asztali nézet"
                                >
                                    <Icons.Monitor size={14} />
                                </button>
                                <button
                                    onClick={() => setPreviewDevice('mobile')}
                                    className={cn("px-3 py-1.5 transition-colors", previewDevice === 'mobile' ? "bg-foreground text-background" : "hover:bg-muted")}
                                    title="Mobil nézet"
                                >
                                    <Icons.Smartphone size={14} />
                                </button>
                            </div>

                            {/* Theme Toggle */}
                            <button
                                onClick={toggleTheme}
                                className={cn(
                                    "w-9 h-8 flex items-center justify-center border transition-colors mr-4",
                                    theme === 'dark' ? "bg-zinc-800 border-zinc-700 text-white" : "bg-zinc-100 border-zinc-200 text-zinc-900"
                                )}
                                title={theme === 'dark' ? "Váltás világos módra" : "Váltás sötét módra"}
                            >
                                {theme === 'dark' ? <Icons.Sun size={14} /> : <Icons.Moon size={14} />}
                            </button>
                        </>
                    )}

                    <button
                        onClick={() => setIsPreviewMode(!isPreviewMode)}
                        className={cn(
                            "flex items-center px-3 py-1.5 rounded border text-[10px] font-mono transition-colors",
                            isPreviewMode
                                ? "bg-foreground/10 border-foreground/20 text-foreground"
                                : "bg-transparent border-transparent text-muted-foreground hover:bg-foreground/5"
                        )}
                    >
                        {isPreviewMode ? <Icons.EyeOff size={12} className="mr-2" /> : <Icons.Eye size={12} className="mr-2" />}
                        {isPreviewMode ? 'SZERKESZTÉS' : 'ELŐNÉZET'}
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-4 py-2 bg-foreground text-background text-xs font-bold uppercase tracking-wider hover:bg-foreground/90 transition-colors flex items-center gap-2"
                    >
                        <Save size={14} />
                        Mentés & Bezárás
                    </button>
                </div>
            </header>

            {/* Main Editor Area */}
            <div
                id="block-editor-scroll-area"
                className={cn(
                    "flex-1 overflow-hidden relative transition-colors duration-500", // Changed overflow-y-auto to overflow-hidden
                    isPreviewMode ? "bg-background/50" : "bg-muted/10",
                    theme === 'dark' && "dark"
                )}
            >
                {isPreviewMode ? (
                    /* PREVIEW MODE: Device Frame */
                    <div
                        id="block-editor-preview"
                        className="h-full overflow-y-auto flex items-start justify-center p-8 animate-in fade-in zoom-in-95 duration-300 relative z-10 custom-scrollbar"
                    >
                        <BrowserFrame device={previewDevice}>
                            {localBlocks.length > 0 ? (
                                localBlocks.map((block) => (
                                    <BlockPreviewRenderer key={block.id} block={block} />
                                ))
                            ) : (
                                <div className="flex flex-col items-center justify-center opacity-30 min-h-[400px]">
                                    <Layout size={48} className="mb-4" />
                                    <p className="font-mono uppercase tracking-widest text-sm">Üres az oldal</p>
                                </div>
                            )}
                        </BrowserFrame>
                    </div>
                ) : (
                    <div className="flex h-full min-h-full overflow-hidden">

                        {/* LEFT SIDEBAR: NAVIGATOR */}
                        <div className="w-64 hidden xl:block h-full overflow-y-auto border-r border-border/40 bg-background/50 backdrop-blur-sm p-4 custom-scrollbar">
                            <div className="mb-4 flex items-center justify-between">
                                <h3 className="text-xs font-bold uppercase tracking-widest opacity-70">Tartalomjegyzék</h3>
                                <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono">{localBlocks.length}</span>
                            </div>
                            <div className="space-y-1">
                                {localBlocks.map((block) => {
                                    const typeInfo = fieldTypesMap[block.type] || { icon: 'Box', label: block.type, color: 'text-foreground' };
                                    const TypeIcon = (Icons as any)[typeInfo.icon] || Icons.Box;

                                    return (
                                        <button
                                            key={block.id}
                                            onClick={() => document.getElementById(block.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                                            className="flex items-center gap-2 w-full text-left p-2 rounded hover:bg-foreground/5 text-xs text-muted-foreground hover:text-foreground transition-colors group"
                                        >
                                            <div className={cn("w-4 h-4 flex items-center justify-center rounded bg-muted/40 group-hover:bg-background border border-transparent group-hover:border-border", typeInfo.color)}>
                                                <TypeIcon size={10} />
                                            </div>
                                            <span className="truncate flex-1 font-mono">{typeInfo.label}</span>
                                        </button>
                                    );
                                })}
                                {localBlocks.length === 0 && (
                                    <div className="text-[10px] text-muted-foreground italic px-2">Nincsenek blokkok</div>
                                )}
                            </div>
                        </div>

                        {/* CENTER: CANVAS */}
                        <div
                            id="block-editor-canvas"
                            className="flex-1 h-full overflow-y-auto custom-scrollbar relative"
                        >
                            <div className="max-w-3xl mx-auto px-6 py-12 min-h-full">
                                {/* Drag & Drop List */}
                                <Reorder.Group
                                    axis="y"
                                    values={localBlocks}
                                    onReorder={handleReorder}
                                    className="space-y-4"
                                >
                                    <AnimatePresence mode="popLayout">
                                        {localBlocks.map((block, index) => (
                                            <SortableBlockItem
                                                key={block.id}
                                                block={block}
                                                index={index}
                                                onUpdate={handleUpdateBlock}
                                                onRemove={handleRemoveBlock}
                                                onDuplicate={handleDuplicateBlock}
                                                collapsed={!!collapsed[block.id]}
                                                onToggleCollapse={toggleCollapse}
                                            />
                                        ))}
                                    </AnimatePresence>
                                </Reorder.Group>

                                {/* Add Block Interface - Restored */}
                                <div className="mt-8">
                                    <AnimatePresence mode="wait">
                                        {!showPicker ? (
                                            <motion.button
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                onClick={() => setShowPicker(true)}
                                                className="w-full h-24 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-foreground hover:border-foreground/50 hover:bg-foreground/5 transition-all group"
                                            >
                                                <div className="p-2 rounded-full bg-background border border-border group-hover:scale-110 transition-transform">
                                                    <Plus size={24} />
                                                </div>
                                                <span className="text-xs font-mono uppercase tracking-widest">Új blokk beillesztése</span>
                                            </motion.button>
                                        ) : (
                                            <motion.div
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: 10 }}
                                                className="bg-background border border-border rounded-xl shadow-lg p-6"
                                            >
                                                <div className="flex items-center justify-between mb-4">
                                                    <h3 className="text-sm font-bold">Válassz egy komponenst</h3>
                                                    <button onClick={() => setShowPicker(false)} className="opacity-50 hover:opacity-100">
                                                        <X size={16} />
                                                    </button>
                                                </div>
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                                    {blockableTypes.map((typeInfo) => {
                                                        const TypeIcon = (Icons as any)[typeInfo?.icon || 'HelpCircle'];
                                                        return (
                                                            <button
                                                                key={typeInfo.type}
                                                                onClick={() => handleAddBlock(typeInfo.type)}
                                                                className="flex flex-col items-center justify-center gap-2 p-4 rounded bg-muted/20 hover:bg-foreground/5 border border-transparent hover:border-foreground/10 transition-all text-center group"
                                                            >
                                                                <div className={cn(
                                                                    "w-10 h-10 flex items-center justify-center rounded-full bg-background border border-border group-hover:scale-110 transition-transform",
                                                                    typeInfo.color
                                                                )}>
                                                                    {TypeIcon ? <TypeIcon size={20} /> : <Icons.Box size={20} />}
                                                                </div>
                                                                <span className="text-[10px] font-mono font-medium truncate w-full">
                                                                    {typeInfo.label}
                                                                </span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>

                                {/* Empty State / Bottom Add Hint (Only if NO blocks, to guide first interaction if needed, but the button above works too) */}
                                {localBlocks.length === 0 && (
                                    <div className="mt-4 text-center text-xs text-muted-foreground opacity-50">
                                        Vagy használd a jobb oldali menüt (asztali nézetben)
                                    </div>
                                )}

                                {/* Bottom Spacer */}
                                <div className="h-32" />
                            </div>
                        </div>

                        {/* RIGHT SIDEBAR: COMPONENT PALETTE */}
                        <div className="w-72 hidden xl:block h-full overflow-y-auto border-l border-border/40 bg-background/50 backdrop-blur-sm p-4 custom-scrollbar">
                            <div className="mb-4">
                                <h3 className="text-xs font-bold uppercase tracking-widest opacity-70">Eszközök</h3>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                {blockableTypes.map((typeInfo) => {
                                    const TypeIcon = (Icons as any)[typeInfo?.icon || 'HelpCircle'];
                                    return (
                                        <button
                                            key={typeInfo.type}
                                            onClick={() => handleAddBlock(typeInfo.type)}
                                            className="flex flex-col items-center justify-center gap-2 p-3 rounded bg-background border border-border/50 hover:border-foreground/20 hover:shadow-md transition-all text-center group"
                                        >
                                            <div className={cn(
                                                "w-8 h-8 flex items-center justify-center rounded-full bg-muted/30 group-hover:scale-110 transition-transform",
                                                typeInfo.color
                                            )}>
                                                {TypeIcon ? <TypeIcon size={16} /> : <Icons.Box size={16} />}
                                            </div>
                                            <span className="text-[10px] font-mono uppercase tracking-wider opacity-50 flex items-center gap-2">
                                                <div className="w-1 h-1 rounded-full bg-foreground/50 ml-6" />
                                                {typeInfo.label}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                    </div>
                )}
            </div>
        </motion.div>
    );
}

// ----------------------------------------------------------------------------
// MAIN FIELD RENDERER (TRIGGER BUTTON)
// ----------------------------------------------------------------------------

export function BlocksFieldRenderer({
    field: _field,
    value,
    onChange,
    disabled
}: BlocksFieldRendererProps) {
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const blocks: ContentBlock[] = Array.isArray(value) ? value : [];

    return (
        <>
            <div className="border border-border bg-background p-1 hover:border-foreground/30 transition-colors group">
                {/* Visual Summary */}
                <div className="relative aspect-[21/9] bg-muted/5 flex flex-col items-center justify-center overflow-hidden transition-all duration-500 group-hover:bg-muted/10">
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/10 to-transparent opacity-50" />

                    {/* Animated Content Representation */}
                    <div className="w-full h-full p-8 flex flex-col gap-2 items-center justify-center opacity-70 group-hover:opacity-100 transition-opacity duration-300">
                        {blocks.length > 0 ? (
                            <div className="w-full max-w-[240px] flex flex-col gap-2">
                                {/* Simulated Document Flow */}
                                {Array.from({ length: 6 }).map((_, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0.5, x: -10 }}
                                        animate={{
                                            opacity: [0.4, 0.7, 0.4],
                                            x: 0,
                                            scaleX: [0.95, 1, 0.95]
                                        }}
                                        transition={{
                                            duration: 2 + i * 0.5,
                                            repeat: Infinity,
                                            repeatType: "reverse",
                                            ease: "easeInOut",
                                            delay: i * 0.1
                                        }}
                                        className={cn(
                                            "rounded-full bg-foreground/10",
                                            i === 0 ? "h-3 w-3/4 mb-1 bg-foreground/15" : // Heading-ish
                                                i === 5 ? "h-2 w-1/2" : // Last line short
                                                    "h-2 w-full"
                                        )}
                                    />
                                ))}
                                <div className="flex justify-center mt-1">
                                    <div className="text-[9px] text-muted-foreground font-mono bg-background/50 px-2 rounded-full border border-border/20 backdrop-blur-sm">
                                        {blocks.length} blokk
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-3">
                                <motion.div
                                    whileHover={{ scale: 1.1, rotate: 90 }}
                                    transition={{ type: "spring", stiffness: 300 }}
                                    className="w-16 h-16 rounded-xl border-2 border-dashed border-foreground/10 flex items-center justify-center cursor-pointer hover:border-foreground/30 hover:bg-muted/20"
                                >
                                    <Icons.Plus size={24} className="text-foreground/20" />
                                </motion.div>
                                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
                                    Kezdj el építkezni
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Ambient Glow */}
                    <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent pointer-events-none" />
                </div>

                {/* Actions */}
                <div className="p-3 border-t border-border flex items-center justify-between bg-card">
                    <div className="text-xs font-mono opacity-50">
                        {blocks.length === 0 ? 'Üres oldal' : 'Oldal tartalma'}
                    </div>
                    <button
                        type="button"
                        onClick={() => setIsEditorOpen(true)}
                        disabled={disabled}
                        className="px-4 py-2 bg-foreground text-background text-[10px] font-bold uppercase tracking-widest hover:bg-foreground/90 transition-colors flex items-center gap-2"
                    >
                        <Maximize2 size={12} />
                        Szerkesztő Megnyitása
                    </button>
                </div>
            </div>

            {/* FULL SCREEN MODAL */}
            <AnimatePresence>
                {isEditorOpen && (
                    <FullScreenEditor
                        activeFieldLabel={_field.label}
                        blocks={blocks}
                        onChange={onChange}
                        onClose={() => setIsEditorOpen(false)}
                    />
                )}
            </AnimatePresence>
        </>
    );
}

export default BlocksFieldRenderer;
