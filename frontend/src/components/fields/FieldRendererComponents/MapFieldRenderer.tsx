import { useState, useEffect } from 'react';
import { MapPin, Link as LinkIcon, ExternalLink, Check, AlertCircle } from 'lucide-react';
import { BaseFieldProps, Label } from './types';
import { useUI } from '@/context/UIContext';

export default function MapFieldRenderer({ field, onChange, isDisabled, isReadOnly, safeValue, hasError }: BaseFieldProps) {
    const { showToast } = useUI();

    // Parse initial value - ROBUST version
    // Handles: [lat, lng], "lat, lng", JSON string, and PHPs array-as-object {0:lat, 1:lng}
    const parseValue = (val: any): [number, number] | null => {
        if (!val) return null;

        // 1. Standard Array
        if (Array.isArray(val) && val.length === 2) {
            const lat = Number(val[0]);
            const lng = Number(val[1]);
            return (!isNaN(lat) && !isNaN(lng)) ? [lat, lng] : null;
        }

        // 2. Object with numeric keys (PHP/Axios quirk)
        if (typeof val === 'object' && val !== null) {
            if ('0' in val && '1' in val) {
                const lat = Number(val[0]);
                const lng = Number(val[1]);
                return (!isNaN(lat) && !isNaN(lng)) ? [lat, lng] : null;
            }
            // Maybe named keys?
            if ('lat' in val && 'lng' in val) {
                const lat = Number(val.lat);
                const lng = Number(val.lng);
                return (!isNaN(lat) && !isNaN(lng)) ? [lat, lng] : null;
            }
        }

        // 3. String parsing
        if (typeof val === 'string') {
            const trimmed = val.trim();

            // "lat, lng"
            const parts = trimmed.split(',');
            if (parts.length === 2) {
                const lat = parseFloat(parts[0]);
                const lng = parseFloat(parts[1]);
                if (!isNaN(lat) && !isNaN(lng)) return [lat, lng];
            }

            // JSON String
            try {
                const json = JSON.parse(val);
                return parseValue(json); // Recursively try parsed JSON
            } catch (e) { }
        }

        return null;
    };

    const [coords, setCoords] = useState<[number, number] | null>(parseValue(safeValue));
    const [urlInput, setUrlInput] = useState('');
    const [parseError, setParseError] = useState(false);

    // Sync from outside props
    useEffect(() => {
        const parsed = parseValue(safeValue);
        // Only update if explicit change from outside differs from current
        if (parsed) {
            if (!coords || parsed[0] !== coords[0] || parsed[1] !== coords[1]) {
                setCoords(parsed);
            }
        } else if (safeValue === null || safeValue === undefined || safeValue === '') {
            // If explicit reset from outside
            if (coords) setCoords(null);
        }
    }, [safeValue]);

    const extractCoordsFromUrl = (input: string): [number, number] | null => {
        // Regex patterns
        const patterns = [
            /@(-?\d+\.\d+),(-?\d+\.\d+)/, // @lat,lng
            /[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/, // ?q=lat,lng
            /\/place\/[^/]+\/(-?\d+\.\d+),(-?\d+\.\d+)/, // /place/name/lat,lng
            /\/place\/(-?\d+\.\d+),(-?\d+\.\d+)/, // /place/lat,lng
            /^(-?\d+\.\d+),\s*(-?\d+\.\d+)$/ // lat, lng
        ];

        for (const p of patterns) {
            const match = input.match(p);
            if (match) {
                const lat = parseFloat(match[1]);
                const lng = parseFloat(match[2]);
                if (!isNaN(lat) && !isNaN(lng)) return [lat, lng];
            }
        }
        return null;
    };

    const updateCoords = (newCoords: [number, number] | null) => {
        setCoords(newCoords);
        // Force JSON string to ensure backend serialization works even if it expects text
        // This solves "Array to String" conversion issues in SQLite/PHP
        onChange(newCoords ? JSON.stringify(newCoords) : null);
    };

    const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setUrlInput(val);
        setParseError(false);

        if (!val.trim()) return;

        const extracted = extractCoordsFromUrl(val);
        if (extracted) {
            updateCoords(extracted);
            showToast('success', 'FELDOLGOZVA', 'Koordináták frissítve a linkből.');
        } else {
            if (val.includes('http') || val.includes('google')) {
                setParseError(true);
            }
        }
    };

    // Manual Input Handlers
    const handleCoordChange = (index: 0 | 1, val: string) => {
        // Allow typing (empty, minus sign, decimal point)
        // But for updateCoords, we try to construct numbers.
        const currentVals = coords ? [...coords] : [0, 0];
        const num = parseFloat(val);

        // We update internal state via parent loop? 
        // No, standard React controlled input pattern:
        // We need local state for inputs if we want "controlled" behavior that allows typing "47."
        // But here we rely on type="number" which handles some of it.
        // Issue: if user types "47." parseFloat is 47. 
        // If we setCoords(47), input value becomes "47". User loses query.
        // Solution: we don't control the Inputs directly with 'coords' formatted.
        // Actually, let's just push value to onChange if valid.

        if (!isNaN(num)) {
            const newCs: [number, number] = index === 0
                ? [num, currentVals[1] as number]
                : [currentVals[0] as number, num];

            updateCoords(newCs);
        }
    };

    const getEmbedUrl = (c: [number, number]) => {
        return `https://maps.google.com/maps?q=${c[0]},${c[1]}&hl=hu&z=15&output=embed`;
    };

    const getGoogleMapsLink = (c: [number, number]) => {
        return `https://www.google.com/maps/search/?api=1&query=${c[0]},${c[1]}`;
    };

    return (
        <div className="space-y-4">
            <Label required={field.required}>
                <div className="flex items-center gap-2">
                    <MapPin size={14} className="text-muted-foreground" />
                    {field.label}
                    <span className="text-[9px] text-muted-foreground ml-auto font-mono opacity-50">
                        RAW: {safeValue ? (typeof safeValue === 'object' ? JSON.stringify(safeValue) : String(safeValue)) : 'NULL'}
                    </span>
                </div>
            </Label>

            <div className={`
                w-full border rounded-lg transition-all duration-300 p-4 bg-background/50
                ${hasError ? 'border-destructive border-2' : 'border-border'}
                ${(isDisabled || isReadOnly) ? 'opacity-60 pointer-events-none' : ''}
            `}>
                {/* 1. URL Importer (Optional helper) */}
                {!isReadOnly && (
                    <div className="mb-6 relative pb-6 border-b border-border/50">
                        <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-2">
                            <LinkIcon size={10} />
                            Importálás Google Maps Linkből
                        </label>
                        <div className="relative">
                            <input
                                type="text"
                                value={urlInput}
                                onChange={handleUrlChange}
                                placeholder="Illeszd be a linket az automatikus kitöltéshez..."
                                disabled={isDisabled}
                                className={`
                                    w-full bg-muted/30 border rounded-md py-2 pl-3 pr-8 text-xs font-mono focus:outline-none focus:ring-1 transition-all
                                    ${parseError ? 'border-red-500 focus:ring-red-500 text-red-500' : 'border-border focus:ring-blue-500 focus:bg-background'}
                                `}
                            />
                            {parseError && (
                                <AlertCircle size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-red-500" />
                            )}
                            {urlInput && !parseError && (
                                <Check size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500" />
                            )}
                        </div>
                    </div>
                )}

                {/* 2. Main Editor Area */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Left: Inputs */}
                    <div className="flex flex-col gap-4">
                        <div className="space-y-3">
                            {/* Latitude */}
                            <div className="bg-background rounded-md px-3 py-2 border border-border focus-within:ring-1 focus-within:ring-blue-500 transition-all">
                                <label className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground mb-1 block">Szélesség (LAT)</label>
                                <input
                                    type="number"
                                    step="any"
                                    value={coords ? coords[0] : ''}
                                    onChange={(e) => handleCoordChange(0, e.target.value)}
                                    placeholder="0.000000"
                                    disabled={isDisabled || isReadOnly}
                                    className="w-full bg-transparent text-lg font-mono font-light focus:outline-none"
                                />
                            </div>

                            {/* Longitude */}
                            <div className="bg-background rounded-md px-3 py-2 border border-border focus-within:ring-1 focus-within:ring-blue-500 transition-all">
                                <label className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground mb-1 block">Hosszúság (LNG)</label>
                                <input
                                    type="number"
                                    step="any"
                                    value={coords ? coords[1] : ''}
                                    onChange={(e) => handleCoordChange(1, e.target.value)}
                                    placeholder="0.000000"
                                    disabled={isDisabled || isReadOnly}
                                    className="w-full bg-transparent text-lg font-mono font-light focus:outline-none"
                                />
                            </div>
                        </div>

                        {coords && (
                            <a
                                href={getGoogleMapsLink(coords)}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-auto flex items-center justify-center gap-2 p-2 bg-blue-500/10 text-blue-500 hover:bg-blue-500 hover:text-white rounded-md transition-all text-xs font-bold uppercase tracking-wider border border-blue-500/20"
                            >
                                <ExternalLink size={14} />
                                Megnyitás Google Térképen
                            </a>
                        )}
                    </div>

                    {/* Right: Embed Verification or Placeholder */}
                    <div className="aspect-square md:aspect-auto md:h-full min-h-[160px] rounded-md overflow-hidden border border-border bg-muted relative group">
                        {coords ? (
                            <>
                                <iframe
                                    title="Map Validation"
                                    width="100%"
                                    height="100%"
                                    frameBorder="0"
                                    scrolling="no"
                                    marginHeight={0}
                                    marginWidth={0}
                                    src={getEmbedUrl(coords)}
                                    className="w-full h-full filter grayscale-[20%] opacity-90 transition-all dark:invert-[90%] dark:hue-rotate-180 dark:brightness-90"
                                />
                                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 pointer-events-none">
                                    <div className="text-[9px] text-white font-mono text-center">ELŐNÉZET</div>
                                </div>
                            </>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full p-4 text-muted-foreground/40">
                                <MapPin size={32} className="mb-2 opacity-50" />
                                <span className="text-xs font-mono uppercase tracking-widest text-center">
                                    Nincs adat
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            {field.description && <div className="text-xs text-muted-foreground">{field.description}</div>}
        </div>
    );
}
