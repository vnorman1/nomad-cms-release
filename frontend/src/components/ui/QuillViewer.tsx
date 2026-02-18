/**
 * QuillViewer Component
 * Read-only Quill content renderer for displaying rich text
 * 
 * Usage:
 * - Display changelog/announcement content in rich text format
 * - Non-editable view of Quill Delta format
 * - Supports all Quill formatting (bold, italic, lists, links, etc.)
 */

import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { useMemo } from 'react';

interface QuillViewerProps {
    /** Quill Delta format JSON string or HTML content */
    content: string;
    /** Optional CSS class name */
    className?: string;
    /** Whether content is in Delta JSON format (true) or HTML (false) */
    isDelta?: boolean;
}

export function QuillViewer({ content, className = '', isDelta = false }: QuillViewerProps) {
    // Parse content - if it's Delta JSON, keep as is; if HTML, convert for display
    const value = useMemo(() => {
        if (!content) return '';
        
        try {
            if (isDelta) {
                // Already in Delta format
                const delta = JSON.parse(content);
                return delta;
            } else {
                // HTML content - for display only
                return content;
            }
        } catch {
            // If parsing fails, treat as plain text/HTML
            return content;
        }
    }, [content, isDelta]);

    return (
        <div className={`quill-viewer ${className}`}>
            <ReactQuill
                value={value}
                readOnly={true}
                theme="snow"
                modules={{ toolbar: false }}
                className="border-0 bg-transparent
                    prose prose-sm dark:prose-invert max-w-none
                    [&_.ql-container]:border-0 [&_.ql-container]:font-sans [&_.ql-container]:text-xs
                    [&_.ql-editor]:p-0 [&_.ql-editor]:text-foreground
                    [&_.ql-editor_p]:my-1.5 [&_.ql-editor_ol]:my-1.5 [&_.ql-editor_ul]:my-1.5
                    [&_.ql-editor_li]:my-0.5 [&_.ql-editor_li_p]:my-0
                    [&_.ql-editor_blockquote]:border-l-2 [&_.ql-editor_blockquote]:pl-3 [&_.ql-editor_blockquote]:my-1.5
                    [&_.ql-editor_pre]:bg-foreground/10 [&_.ql-editor_pre]:p-2 [&_.ql-editor_pre]:rounded [&_.ql-editor_pre]:my-1.5
                    [&_.ql-editor_a]:text-foreground [&_.ql-editor_a]:underline [&_.ql-editor_a]:decoration-dotted
                    [&_.ql-editor_strong]:font-semibold
                    [&_.ql-editor_em]:italic
                    [&_.ql-editor_code]:bg-foreground/10 [&_.ql-editor_code]:px-1.5 [&_.ql-editor_code]:py-0.5 [&_.ql-editor_code]:rounded [&_.ql-editor_code]:text-[10px]"
            />
        </div>
    );
}

/**
 * Alternative: Simple HTML-to-Quill content converter
 * Use this if changelog is stored in HTML format instead of Delta
 * Renders markdown-generated HTML with proper Quill-like styling
 */
export function QuillViewerHTML({ content, className = '' }: Omit<QuillViewerProps, 'isDelta'>) {
    // For HTML content generated from markdown, apply comprehensive styling
    // Uses Tailwind arbitrary selectors for all markdown elements
    return (
        <div 
            className={`text-foreground leading-relaxed space-y-2 ${className}
                /* Headings */
                [&_h1]:text-lg [&_h1]:font-bold [&_h1]:font-mono [&_h1]:uppercase [&_h1]:tracking-wider
                [&_h1]:mt-6 [&_h1]:mb-4 [&_h1]:pb-3 [&_h1]:border-b [&_h1]:border-foreground/30
                
                [&_h2]:text-base [&_h2]:font-bold [&_h2]:font-mono [&_h2]:uppercase [&_h2]:tracking-wide
                [&_h2]:mt-5 [&_h2]:mb-3 [&_h2]:pb-2 [&_h2]:border-b [&_h2]:border-foreground/20
                
                [&_h3]:text-sm [&_h3]:font-bold [&_h3]:font-mono [&_h3]:uppercase [&_h3]:tracking-wide
                [&_h3]:mt-4 [&_h3]:mb-2
                
                [&_h4]:text-xs [&_h4]:font-bold [&_h4]:font-mono [&_h4]:uppercase [&_h4]:mt-3 [&_h4]:mb-2
                [&_h5]:text-xs [&_h5]:font-semibold [&_h5]:mt-2 [&_h5]:mb-1
                [&_h6]:text-xs [&_h6]:font-semibold [&_h6]:text-foreground/80 [&_h6]:mt-2 [&_h6]:mb-1
                
                /* Paragraphs */
                [&_p]:text-xs [&_p]:my-3 [&_p]:leading-relaxed [&_p]:opacity-90
                
                /* Lists */
                [&_ul]:my-3 [&_ul]:ml-4 [&_ul]:space-y-1
                [&_ol]:my-3 [&_ol]:ml-4 [&_ol]:space-y-1
                [&_li]:text-xs [&_li]:leading-relaxed
                [&_ul_li]:list-disc [&_ol_li]:list-decimal
                
                /* Nested lists */
                [&_ul_ul]:my-1 [&_ol_ol]:my-1
                [&_ul_ul_li]:list-circle [&_ul_ol_li]:list-decimal
                
                /* Block quotes */
                [&_blockquote]:border-l-4 [&_blockquote]:border-foreground/40 [&_blockquote]:pl-4 
                [&_blockquote]:my-3 [&_blockquote]:italic [&_blockquote]:opacity-75 [&_blockquote]:text-xs
                [&_blockquote_p]:my-1
                
                /* Code blocks */
                [&_pre]:bg-foreground/5 [&_pre]:p-3 [&_pre]:rounded [&_pre]:my-3 [&_pre]:overflow-x-auto
                [&_pre]:border [&_pre]:border-foreground/20 [&_pre]:text-[11px] [&_pre]:leading-relaxed
                [&_pre_code]:text-foreground [&_pre_code]:font-mono [&_pre_code]:p-0 [&_pre_code]:bg-transparent
                
                /* Inline code */
                [&_code]:text-[11px] [&_code]:bg-foreground/10 [&_code]:px-1.5 [&_code]:py-0.5
                [&_code]:rounded [&_code]:font-mono [&_code]:text-foreground [&_code]:whitespace-nowrap
                [&_pre_code]:bg-transparent [&_pre_code]:px-0 [&_pre_code]:py-0 [&_pre_code]:rounded-none
                
                /* Links */
                [&_a]:text-blue-500 [&_a]:underline [&_a]:decoration-dotted [&_a]:underline-offset-2
                [&_a]:hover:text-blue-400 [&_a]:hover:decoration-solid [&_a]:transition-colors
                [&_a]:break-words
                
                /* Strong & emphasis */
                [&_strong]:font-semibold [&_strong]:text-foreground
                [&_em]:italic [&_em]:text-foreground
                [&_b]:font-bold
                [&_i]:italic
                
                /* Horizontal rules */
                [&_hr]:my-4 [&_hr]:border [&_hr]:border-foreground/20
                
                /* Tables */
                [&_table]:w-full [&_table]:my-3 [&_table]:border-collapse [&_table]:text-xs
                [&_th]:bg-foreground/5 [&_th]:border [&_th]:border-foreground/20 [&_th]:px-2 [&_th]:py-1.5
                [&_th]:text-left [&_th]:font-semibold [&_th]:text-foreground
                [&_td]:border [&_td]:border-foreground/20 [&_td]:px-2 [&_td]:py-1
                [&_tr:hover]:bg-foreground/3
                
                /* Strikethrough */
                [&_del]:line-through [&_del]:opacity-60
                [&_s]:line-through [&_s]:opacity-60
                
                /* Definition lists */
                [&_dt]:font-semibold [&_dt]:mt-3
                [&_dd]:ml-4 [&_dd]:text-xs [&_dd]:opacity-80
                
                /* Images (if present) */
                [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded [&_img]:my-3 [&_img]:border [&_img]:border-foreground/20
                
                /* Mark/highlight */
                [&_mark]:bg-yellow-300/30 [&_mark]:px-1 [&_mark]:rounded
                
                /* Subscript/Superscript */
                [&_sub]:text-[10px] [&_sub]:relative [&_sub]:-bottom-1
                [&_sup]:text-[10px] [&_sup]:relative [&_sup]:-top-1
                
                /* Dark mode adjustments */
                dark:[&_pre]:bg-foreground/10 dark:[&_code]:bg-foreground/15
                dark:[&_blockquote]:border-foreground/30 dark:[&_blockquote]:opacity-80
                dark:[&_table]:border-foreground/20 dark:[&_th]:bg-foreground/10
                dark:[&_mark]:bg-yellow-400/20`}
            dangerouslySetInnerHTML={{ __html: content }}
        />
    );
}
