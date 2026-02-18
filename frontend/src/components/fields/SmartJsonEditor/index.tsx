/**
 * SmartJsonEditor - Fő komponens a Visual/JSON toggle-lel
 * Intelligens JSON szerkesztő nem-informatikus felhasználóknak
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { SmartJsonFieldRenderer } from './SmartJsonFieldRenderer';
import { JsonSuggestionHelper } from './components/JsonSuggestionHelper';

interface SmartJsonEditorProps {
    value: unknown;
    onChange: (value: unknown) => void;
    disabled?: boolean;
    label?: string;
    schema?: Record<string, unknown>; // Struktúra sablon (ajánlás)
}

// LocalStorage kulcs a preferencia mentéséhez
const EDITOR_MODE_KEY = 'smart-json-editor-mode';

export function SmartJsonEditor({ value, onChange, disabled = false, label, schema }: SmartJsonEditorProps) {
    // Track if we've already initialized with schema to avoid duplicate calls
    const hasInitializedWithSchema = useRef(false);
    
    // Check if value is empty (new item)
    const isValueEmpty = !value || (typeof value === 'object' && Object.keys(value as object).length === 0);
    const hasSchema = schema && typeof schema === 'object' && Object.keys(schema).length > 0;
    
    // Ha az érték üres és van schema, használjuk sablonként
    const effectiveValue = (() => {
        if (value && typeof value === 'object' && Object.keys(value as object).length > 0) {
            return value; // Van érték, használjuk azt
        }
        if (hasSchema) {
            return schema; // Nincs érték, de van schema → sablon
        }
        return value || {}; // Fallback
    })();
    
    // Initialize with schema value for NEW items only (best practice: don't overwrite existing data)
    useEffect(() => {
        if (isValueEmpty && hasSchema && !hasInitializedWithSchema.current) {
            hasInitializedWithSchema.current = true;
            // Call onChange with schema as default value for new items
            onChange(schema);
        }
    }, [isValueEmpty, hasSchema, schema, onChange]);
    
    // Mode preferencia: localStorage-ból vagy visual default
    const [mode, setMode] = useState<'visual' | 'json'>(() => {
        if (typeof window !== 'undefined') {
            return (localStorage.getItem(EDITOR_MODE_KEY) as 'visual' | 'json') || 'visual';
        }
        return 'visual';
    });

    // Raw JSON szerkesztéshez
    const [rawJson, setRawJson] = useState<string>(() =>
        effectiveValue ? JSON.stringify(effectiveValue, null, 2) : '{}'
    );
    const [jsonError, setJsonError] = useState<string | null>(null);

    // Sync raw JSON when value changes externally
    useEffect(() => {
        if (mode === 'visual') {
            setRawJson(effectiveValue ? JSON.stringify(effectiveValue, null, 2) : '{}');
        }
    }, [effectiveValue, mode]);

    // Mode váltás mentése
    const handleModeChange = useCallback((newMode: 'visual' | 'json') => {
        // Ha JSON módból váltunk, próbáljuk meg parse-olni
        if (mode === 'json' && newMode === 'visual') {
            try {
                const parsed = JSON.parse(rawJson);
                onChange(parsed);
                setJsonError(null);
            } catch (err) {
                setJsonError((err as Error).message);
                return; // Ne váltsunk módot hibás JSON esetén
            }
        }

        // Ha Visual módból váltunk, frissítsük a raw JSON-t
        if (mode === 'visual' && newMode === 'json') {
            setRawJson(effectiveValue ? JSON.stringify(effectiveValue, null, 2) : '{}');
        }

        setMode(newMode);
        localStorage.setItem(EDITOR_MODE_KEY, newMode);
    }, [mode, rawJson, value, onChange]);

    // Raw JSON változás kezelése
    const handleRawJsonChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newRaw = e.target.value;
        setRawJson(newRaw);

        try {
            const parsed = JSON.parse(newRaw);
            onChange(parsed);
            setJsonError(null);
        } catch (err) {
            setJsonError((err as Error).message);
        }
    }, [onChange]);

    return (
        <div className="space-y-3">
            {/* Toggle buttons */}
            <div className="flex items-center justify-between">
                {label && (
                    <div className="flex items-center gap-2">
                        <div className="w-1 h-1 rounded-full bg-foreground" />
                        <span className="text-[10px] font-mono uppercase tracking-[0.2em] opacity-60">
                            {label}
                        </span>
                    </div>
                )}

                <div className="flex border border-border">
                    {/* Visual mode button */}
                    <button
                        onClick={() => handleModeChange('visual')}
                        disabled={disabled}
                        className={`px-2 py-1 text-[10px] font-mono uppercase tracking-wider transition-colors
                            ${mode === 'visual'
                                ? 'bg-foreground text-background'
                                : 'bg-transparent text-foreground/60 hover:text-foreground hover:bg-secondary/20'
                            }
                            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                        Vizuális
                    </button>

                    {/* JSON mode button */}
                    <button
                        onClick={() => handleModeChange('json')}
                        disabled={disabled}
                        className={`px-2 py-1 text-[10px] font-mono uppercase tracking-wider transition-colors border-l border-border
                            ${mode === 'json'
                                ? 'bg-foreground text-background'
                                : 'bg-transparent text-foreground/60 hover:text-foreground hover:bg-secondary/20'
                            }
                            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                        {'{ } JSON'}
                    </button>
                </div>
            </div>

            {/* Content */}
            <motion.div
                key={mode}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15 }}
            >
                {mode === 'visual' ? (
                    <SmartJsonFieldRenderer
                        data={effectiveValue}
                        onChange={onChange}
                        disabled={disabled}
                    />
                ) : (
                    <JsonModeEditor
                        rawJson={rawJson}
                        jsonError={jsonError}
                        disabled={disabled}
                        onChange={handleRawJsonChange}
                    />
                )}
            </motion.div>
        </div>
    );
}

// Default export
export default SmartJsonEditor;

// Re-export components for direct use
export { SmartJsonFieldRenderer } from './SmartJsonFieldRenderer';
export * from './fieldDetection';

/**
 * JsonModeEditor - JSON szerkesztő mód egyszerű suggestion támogatással
 * Nem korlátozza a felhasználót, csak segít!
 */
interface JsonModeEditorProps {
    rawJson: string;
    jsonError: string | null;
    disabled: boolean;
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
}

function JsonModeEditor({ rawJson, jsonError, disabled, onChange }: JsonModeEditorProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [cursorPosition, setCursorPosition] = useState(0);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [suggestionPosition, setSuggestionPosition] = useState({ top: 0, left: 0 });

    // Kurzor pozíció követése
    const handleSelect = useCallback(() => {
        if (textareaRef.current) {
            setCursorPosition(textareaRef.current.selectionStart);
        }
    }, []);

    // Suggestion beillesztése a kurzor pozíciójába
    const handleInsertSuggestion = useCallback((text: string) => {
        if (!textareaRef.current) return;
        
        const textarea = textareaRef.current;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const before = rawJson.substring(0, start);
        const after = rawJson.substring(end);
        
        const newValue = before + text + after;
        
        // Szintetikus event létrehozása
        const event = {
            target: { value: newValue }
        } as React.ChangeEvent<HTMLTextAreaElement>;
        
        onChange(event);
        setShowSuggestions(false);
        
        // Kurzor mozgatása a beillesztett szöveg után
        setTimeout(() => {
            if (textareaRef.current) {
                const newPos = start + text.length;
                textareaRef.current.selectionStart = newPos;
                textareaRef.current.selectionEnd = newPos;
                textareaRef.current.focus();
            }
        }, 0);
    }, [rawJson, onChange]);

    // Billentyű kezelés - Ctrl+Space megnyitja a javaslatokat
    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if ((e.ctrlKey || e.metaKey) && e.key === ' ') {
            e.preventDefault();
            setShowSuggestions(prev => !prev);
            
            // Suggestion pozíció beállítása (egyszerűsített)
            if (textareaRef.current && containerRef.current) {
 
                // Egyszerű pozicionálás a textarea tetejéhez képest
                setSuggestionPosition({
                    top: 40,
                    left: 16
                });
            }
        }
        
        // Escape bezárja
        if (e.key === 'Escape') {
            setShowSuggestions(false);
        }
    }, []);

    return (
        <div ref={containerRef} className="relative space-y-2">
            <textarea
                ref={textareaRef}
                value={rawJson}
                onChange={onChange}
                onSelect={handleSelect}
                onKeyDown={handleKeyDown}
                onFocus={() => {
                    // Kis késleltetéssel megjelenítjük a hint-et
                }}
                disabled={disabled}
                className={`w-full min-h-[200px] bg-secondary/5 border p-4 text-sm font-mono 
                    focus:outline-none transition-all resize-y placeholder:text-muted-foreground/30 
                    rounded-none leading-relaxed
                    ${jsonError ? 'border-red-500 focus:border-red-500 bg-red-500/5' : 'border-border focus:border-foreground'}
                    ${disabled ? 'opacity-50 cursor-not-allowed bg-secondary/10' : ''}`}
                spellCheck={false}
            />

            {/* Suggestion Helper */}
            {showSuggestions && (
                <div 
                    style={{ 
                        position: 'absolute',
                        top: suggestionPosition.top,
                        left: suggestionPosition.left,
                    }}
                >
                    <JsonSuggestionHelper
                        value={rawJson}
                        cursorPosition={cursorPosition}
                        onInsert={handleInsertSuggestion}
                        visible={showSuggestions}
                    />
                </div>
            )}

            <div className="flex justify-between items-center">
                {jsonError ? (
                    <div className="text-[9px] font-mono text-red-500 opacity-80 truncate" title={jsonError}>
                        {jsonError}
                    </div>
                ) : (
                    <div className="text-[9px] font-mono opacity-40 flex items-center gap-1">
                        <span className="text-emerald-500">✓</span> Érvényes JSON
                    </div>
                )}
                
                {/* Hint a javaslatokhoz */}
                <div className="text-[9px] font-mono opacity-40 flex items-center gap-2">
                    <kbd className="px-1.5 py-0.5 bg-muted/50 border border-border/50 rounded text-[8px]">
                        Ctrl+Space
                    </kbd>
                    <span>javaslatok</span>
                </div>
            </div>
        </div>
    );
}
