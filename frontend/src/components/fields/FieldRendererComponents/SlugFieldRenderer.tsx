import { useState, useCallback } from 'react';
import { Link2, RefreshCw, Copy, Check } from 'lucide-react';
import { BaseFieldProps, Label, InputWrapper } from './types';

/**
 * Ékezetes karakterek normalizálása ASCII-vé
 * Pl: "klímaváltozás" → "klimavaltozas"
 */
const ACCENT_MAP: Record<string, string> = {
    // Magyar ékezetes betűk
    'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ö': 'o', 'ő': 'o', 'ú': 'u', 'ü': 'u', 'ű': 'u',
    'Á': 'a', 'É': 'e', 'Í': 'i', 'Ó': 'o', 'Ö': 'o', 'Ő': 'o', 'Ú': 'u', 'Ü': 'u', 'Ű': 'u',
    // Egyéb ékezetes karakterek
    'à': 'a', 'â': 'a', 'ã': 'a', 'ä': 'a', 'å': 'a', 'æ': 'ae',
    'ç': 'c', 'è': 'e', 'ê': 'e', 'ë': 'e', 'ì': 'i', 'î': 'i', 'ï': 'i',
    'ñ': 'n', 'ò': 'o', 'ô': 'o', 'õ': 'o', 'ø': 'o', 'œ': 'oe',
    'ß': 'ss', 'ù': 'u', 'û': 'u', 'ý': 'y', 'ÿ': 'y',
    'À': 'a', 'Â': 'a', 'Ã': 'a', 'Ä': 'a', 'Å': 'a', 'Æ': 'ae',
    'Ç': 'c', 'È': 'e', 'Ê': 'e', 'Ë': 'e', 'Ì': 'i', 'Î': 'i', 'Ï': 'i',
    'Ñ': 'n', 'Ò': 'o', 'Ô': 'o', 'Õ': 'o', 'Ø': 'o', 'Œ': 'oe',
    'Ù': 'u', 'Û': 'u', 'Ý': 'y',
};

/**
 * Szöveg normalizálása URL-barát slug-gá
 * "A klímaváltozás veszélyei" → "a-klimavaltozas-veszelyei"
 */
export function generateSlug(text: string): string {
    if (!text) return '';

    return text
        // Ékezetes karakterek cseréje
        .split('')
        .map(char => ACCENT_MAP[char] || char)
        .join('')
        // Kisbetűsítés
        .toLowerCase()
        // Speciális karakterek eltávolítása, szóközök kötőjelre cserélése
        .replace(/[^\w\s-]/g, '')
        // Szóközök és többszörös kötőjelek egyszeres kötőjelre
        .replace(/[\s_]+/g, '-')
        // Szélső kötőjelek eltávolítása
        .replace(/^-+|-+$/g, '')
        // Többszörös kötőjelek összevonása
        .replace(/-+/g, '-');
}

export default function SlugFieldRenderer({ field, value, isDisabled, hasError }: BaseFieldProps) {
    const [copied, setCopied] = useState(false);

    // Slug másolása vágólapra
    const handleCopy = useCallback(async () => {
        if (value) {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    }, [value]);

    // Slug manuális frissítése a forrásból
    const handleRefresh = useCallback(() => {
        if (field.slugSource) {
            // A frissítés a parent komponens felelőssége
            // Itt triggerlünk egy eseményt
            const event = new CustomEvent('slugRefresh', {
                detail: { fieldId: field.id, sourceField: field.slugSource }
            });
            window.dispatchEvent(event);
        }
    }, [field.id, field.slugSource]);

    return (
        <InputWrapper className={`space-y-2 ${isDisabled ? 'opacity-60' : ''}`}>
            <Label required={field.required}>{field.label}</Label>
            <div className="relative group">
                {/* Slug ikon */}
                <div className="absolute left-0 top-1/2 -translate-y-1/2 opacity-40">
                    <Link2 size={14} />
                </div>

                {/* Slug input - read only */}
                <input
                    type="text"
                    value={value || ''}
                    readOnly
                    className={`w-full bg-transparent border-b py-2 pl-6 pr-16 focus:outline-none transition-all placeholder:text-muted-foreground/20 rounded-none text-base md:text-xl font-light font-mono text-muted-foreground cursor-default
                        ${hasError ? 'border-destructive border-b-2 animate-pulse' : 'border-border focus:border-foreground'}`}
                    placeholder={field.placeholder || "automatikusan-generalt-slug"}
                />

                {/* Action buttons */}
                <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {/* Refresh button */}
                    {field.slugSource && (
                        <button
                            type="button"
                            onClick={handleRefresh}
                            className="p-1.5 hover:bg-foreground/5 rounded transition-colors"
                            title="Slug újragenerálása"
                        >
                            <RefreshCw size={14} className="opacity-50 hover:opacity-100" />
                        </button>
                    )}

                    {/* Copy button */}
                    <button
                        type="button"
                        onClick={handleCopy}
                        className="p-1.5 hover:bg-foreground/5 rounded transition-colors"
                        title="Slug másolása"
                    >
                        {copied ? (
                            <Check size={14} className="text-green-500" />
                        ) : (
                            <Copy size={14} className="opacity-50 hover:opacity-100" />
                        )}
                    </button>
                </div>

                {/* Source field indicator */}
                {field.slugSource && (
                    <div className="absolute right-0 top-0 -mt-6 text-[9px] font-mono opacity-30">
                        FORRÁS: {field.slugSource}
                    </div>
                )}
            </div>

            {/* Help text */}
            {field.helpText && (
                <p className="text-[10px] font-mono opacity-40 mt-1">{field.helpText}</p>
            )}
        </InputWrapper>
    );
}
