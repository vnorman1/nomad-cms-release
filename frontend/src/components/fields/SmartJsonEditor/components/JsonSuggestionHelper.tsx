/**
 * JsonSuggestionHelper - Egyszerű javaslat segéd a JSON nézethez
 * Nem korlátozza a felhasználót, csak segít!
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface JsonSuggestion {
    text: string;
    description: string;
    icon: string;
}

// Gyakori JSON minták és javaslatok
const COMMON_PATTERNS: JsonSuggestion[] = [
    { text: '{}', description: 'Üres objektum', icon: '{ }' },
    { text: '[]', description: 'Üres tömb', icon: '[ ]' },
    { text: 'true', description: 'Igaz érték', icon: '✓' },
    { text: 'false', description: 'Hamis érték', icon: '✗' },
    { text: 'null', description: 'Null érték', icon: '∅' },
    { text: '""', description: 'Üres string', icon: '"' },
];

// Dátum javaslatok
const getDateSuggestions = (): JsonSuggestion[] => {
    const now = new Date();
    const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
    const nextWeek = new Date(now); nextWeek.setDate(now.getDate() + 7);
    
    const format = (d: Date) => d.toISOString().split('T')[0];
    
    return [
        { text: `"${format(now)}"`, description: 'Mai dátum', icon: 'D' },
        { text: `"${format(tomorrow)}"`, description: 'Holnap', icon: 'D+1' },
        { text: `"${format(nextWeek)}"`, description: 'Jövő hét', icon: 'D+7' },
        { text: `"${now.toISOString()}"`, description: 'Most (ISO)', icon: 'T' },
    ];
};

// Szám javaslatok kontextus alapján
const getNumberSuggestions = (context: string): JsonSuggestion[] => {
    const suggestions: JsonSuggestion[] = [];
    
    if (context.includes('price') || context.includes('cost') || context.includes('amount')) {
        suggestions.push(
            { text: '0', description: 'Nulla', icon: '$' },
            { text: '1000', description: 'Ezer', icon: '$' },
            { text: '10000', description: 'Tízezer', icon: '$' },
        );
    } else if (context.includes('percent') || context.includes('discount')) {
        suggestions.push(
            { text: '0', description: '0%', icon: '%' },
            { text: '10', description: '10%', icon: '%' },
            { text: '25', description: '25%', icon: '%' },
            { text: '50', description: '50%', icon: '%' },
        );
    } else {
        suggestions.push(
            { text: '0', description: 'Nulla', icon: '0' },
            { text: '1', description: 'Egy', icon: '1' },
            { text: '100', description: 'Száz', icon: '100' },
        );
    }
    
    return suggestions;
};

interface JsonSuggestionHelperProps {
    value: string;
    cursorPosition: number;
    onInsert: (text: string) => void;
    visible: boolean;
}

export function JsonSuggestionHelper({ 
    value, 
    cursorPosition, 
    onInsert, 
    visible 
}: JsonSuggestionHelperProps) {
    const [suggestions, setSuggestions] = useState<JsonSuggestion[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    
    // Kontextus elemzése a kurzor pozíciója alapján
    useEffect(() => {
        if (!visible) return;
        
        // Az utolsó 50 karakter elemzése
        const contextBefore = value.substring(Math.max(0, cursorPosition - 50), cursorPosition);
        
        const newSuggestions: JsonSuggestion[] = [];
        
        // Ha : után vagyunk (érték pozíció)
        if (contextBefore.match(/:\s*$/)) {
            // Dátum mezők
            if (contextBefore.toLowerCase().match(/"(date|created|updated|time|born)"\s*:\s*$/i)) {
                newSuggestions.push(...getDateSuggestions());
            }
            // Boolean mezők
            else if (contextBefore.toLowerCase().match(/"(active|enabled|visible|required|is\w+)"\s*:\s*$/i)) {
                newSuggestions.push(
                    { text: 'true', description: 'Aktív/Igen', icon: '✓' },
                    { text: 'false', description: 'Inaktív/Nem', icon: '✗' },
                );
            }
            // Szám mezők
            else if (contextBefore.toLowerCase().match(/"(price|cost|amount|count|quantity|percent|discount|width|height)"\s*:\s*$/i)) {
                newSuggestions.push(...getNumberSuggestions(contextBefore.toLowerCase()));
            }
            // Általános érték pozíció
            else {
                newSuggestions.push(...COMMON_PATTERNS);
            }
        }
        // Ha [ után vagyunk (tömb elem)
        else if (contextBefore.match(/\[\s*$/) || contextBefore.match(/,\s*$/)) {
            newSuggestions.push(
                { text: '""', description: 'Szöveg elem', icon: '"' },
                { text: '0', description: 'Szám elem', icon: '#' },
                { text: '{}', description: 'Objektum elem', icon: '{ }' },
            );
        }
        // Ha { után vagyunk (új kulcs)
        else if (contextBefore.match(/\{\s*$/) || (contextBefore.match(/,\s*$/) && !contextBefore.match(/\[\s*[^[\]]*,\s*$/))) {
            newSuggestions.push(
                { text: '"name": ""', description: 'Név mező', icon: 'Aa' },
                { text: '"id": 0', description: 'Azonosító', icon: '#' },
                { text: '"title": ""', description: 'Cím mező', icon: 'T' },
                { text: '"description": ""', description: 'Leírás', icon: 'i' },
                { text: '"active": true', description: 'Aktív státusz', icon: '✓' },
                { text: '"createdAt": ""', description: 'Létrehozva', icon: 'D' },
            );
        }
        
        setSuggestions(newSuggestions);
        setSelectedIndex(0);
    }, [value, cursorPosition, visible]);

    if (!visible || suggestions.length === 0) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className="absolute z-50 mt-1 bg-popover border border-border rounded-lg shadow-lg overflow-hidden min-w-[200px]"
            >
                <div className="px-2 py-1.5 bg-muted/30 border-b border-border">
                    <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                        Javaslatok
                    </span>
                </div>
                <div className="max-h-[180px] overflow-y-auto">
                    {suggestions.map((suggestion, index) => (
                        <button
                            key={index}
                            type="button"
                            onClick={() => onInsert(suggestion.text)}
                            onMouseEnter={() => setSelectedIndex(index)}
                            className={`
                                w-full text-left px-3 py-2 flex items-center gap-2 text-sm
                                transition-colors
                                ${index === selectedIndex 
                                    ? 'bg-accent text-accent-foreground' 
                                    : 'hover:bg-accent/50'
                                }
                            `}
                        >
                            <span className="w-6 text-center text-xs opacity-70">{suggestion.icon}</span>
                            <div className="flex-1">
                                <code className="text-xs bg-muted/50 px-1 rounded">{suggestion.text}</code>
                                <div className="text-[10px] text-muted-foreground mt-0.5">
                                    {suggestion.description}
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
                <div className="px-3 py-1.5 bg-muted/20 border-t border-border text-[9px] text-muted-foreground">
                    Kattints a beszúráshoz
                </div>
            </motion.div>
        </AnimatePresence>
    );
}

export default JsonSuggestionHelper;
