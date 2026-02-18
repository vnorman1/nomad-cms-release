import { useState, useEffect } from 'react';
import { FieldRendererProps } from './index';
import { Globe } from 'lucide-react';
import { cn } from '@/lib/utils';

export function IframeFieldRenderer({ value, onChange, disabled, hasError }: FieldRendererProps) {
    const [inputValue, setInputValue] = useState(value as string || '');
    const [previewSrc, setPreviewSrc] = useState<string | null>(null);

    // Sync from prop
    useEffect(() => {
        setInputValue(value as string || '');
    }, [value]);

    // Parse URL on change or init to Update Preview
    useEffect(() => {
        const raw = inputValue.trim();
        if (!raw) {
            setPreviewSrc(null);
            return;
        }

        let src = raw;
        // Check if it's an iframe tag
        if (raw.includes('<iframe')) {
            const match = raw.match(/src=["'](.*?)["']/);
            if (match && match[1]) {
                src = match[1];
            }
        }

        try {
            // Validate URL roughly
            const url = new URL(src);

            if (url.protocol !== 'http:' && url.protocol !== 'https:') {
                throw new Error('Invalid protocol');
            }

            // Auto-mute for known providers
            if (url.hostname.includes('youtube.com') || url.hostname.includes('youtu.be')) {
                url.searchParams.set('mute', '1');
                url.searchParams.set('autoplay', '0');
            }
            if (url.hostname.includes('vimeo.com')) {
                url.searchParams.set('muted', '1'); // Vimeo property
                url.searchParams.set('autoplay', '0');
            }

            setPreviewSrc(url.toString());
        } catch {
            // Invalid URL - maybe show error in preview or just blank
            setPreviewSrc(null);
        }

    }, [inputValue]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setInputValue(val);
        onChange(val);
    };

    return (
        <div className="rounded border border-border bg-muted/30 overflow-hidden group hover:border-border/80 transition-colors">
            {/* Input Section */}
            <div className="p-3 bg-background/50 border-b border-border/50 backdrop-blur-sm">
                <div className="relative">
                    <input
                        type="text"
                        value={inputValue}
                        onChange={handleChange}
                        disabled={disabled}
                        placeholder="https://... vagy <iframe...>"
                        className={cn(
                            "flex h-9 w-full rounded-lg border border-input bg-background/80 px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                            hasError ? "border-red-500" : "border-border/50",
                            "pl-9 pr-4"
                        )}
                    />
                    <Globe className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground opacity-70" />
                </div>
                <div className="mt-1.5 flex items-center justify-between px-1">
                    <p className="text-[10px] text-muted-foreground/80 font-medium">
                        YouTube, Vimeo, Google Maps Embed
                    </p>
                </div>
            </div>

            {/* Preview Section */}
            <div className="relative bg-black/5 min-h-[160px] flex flex-col items-center justify-center">
                {previewSrc ? (
                    <div className="aspect-video w-full bg-black relative group-hover:shadow-inner transition-all">
                        <iframe
                            src={previewSrc}
                            className="w-full h-full pointer-events-none opacity-90 transition-opacity group-hover:opacity-100"
                            title="Iframe Preview"
                            tabIndex={-1}
                            sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
                            loading="lazy"
                            onError={() => setPreviewSrc(null)}
                        />
                        {/* Overlay to indicate it's just a preview */}
                        <div className="absolute inset-0 z-10 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
                        <div className="absolute bottom-2 right-2 z-20 pointer-events-none">
                            <span className="bg-black/60 text-white/[0.8] text-[10px] uppercase font-bold px-2 py-0.5 rounded backdrop-blur">
                                Némított Előnézet
                            </span>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center p-8 text-muted-foreground/40 gap-3">
                        <Globe size={48} strokeWidth={1} className="opacity-50" />
                        <p className="text-xs font-medium uppercase tracking-widest text-center">
                            Nincs megjeleníthető tartalom<br />
                            <span className="text-[10px] opacity-70 normal-case font-normal">
                                {inputValue ? 'Ellenőrizd az URL formátumát' : 'Illessz be egy hivatkozást'}
                            </span>
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

