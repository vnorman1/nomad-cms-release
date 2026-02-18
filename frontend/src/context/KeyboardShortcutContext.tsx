/**
 * KeyboardShortcutContext - Global Keyboard Shortcut System
 * 
 * Centralized keyboard shortcut management for the CMS editor.
 * Components can register/unregister shortcuts dynamically.
 * 
 * Usage:
 *   useKeyboardShortcut('my-shortcut-id', {
 *     key: 's',
 *     ctrl: true,
 *     handler: () => console.log('Save!'),
 *     enabled: true
 *   });
 */

import { createContext, useContext, useCallback, useEffect, useRef, ReactNode } from 'react';

// Shortcut configuration
export interface ShortcutConfig {
    key: string;           // The key to listen for (e.g., 's', 'Escape', 'Enter')
    ctrl?: boolean;        // Require CTRL/CMD key
    shift?: boolean;       // Require SHIFT key
    alt?: boolean;         // Require ALT key
    handler: () => void;   // Function to execute
    enabled?: boolean;     // Whether the shortcut is active (default: true)
}

// Internal shortcut registration
interface RegisteredShortcut extends ShortcutConfig {
    id: string;
}

// Context type
interface KeyboardShortcutContextType {
    register: (id: string, config: ShortcutConfig) => void;
    unregister: (id: string) => void;
}

const KeyboardShortcutContext = createContext<KeyboardShortcutContextType | undefined>(undefined);

/**
 * Provider component that manages global keyboard shortcuts
 */
export function KeyboardShortcutProvider({ children }: { children: ReactNode }) {
    // Use ref to avoid re-renders when shortcuts change
    const shortcutsRef = useRef<Map<string, RegisteredShortcut>>(new Map());

    // Register a new shortcut
    const register = useCallback((id: string, config: ShortcutConfig) => {
        shortcutsRef.current.set(id, { ...config, id });
    }, []);

    // Unregister a shortcut
    const unregister = useCallback((id: string) => {
        shortcutsRef.current.delete(id);
    }, []);

    // Global keydown handler
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            // Iterate through all registered shortcuts
            for (const shortcut of shortcutsRef.current.values()) {
                // Skip disabled shortcuts
                if (shortcut.enabled === false) continue;

                // Check if the key matches (case-insensitive for letters)
                const keyMatches = event.key.toLowerCase() === shortcut.key.toLowerCase() ||
                    event.key === shortcut.key;

                if (!keyMatches) continue;

                // Check modifier keys
                const ctrlKey = event.ctrlKey || event.metaKey; // Support both CTRL and CMD (Mac)
                const ctrlMatches = shortcut.ctrl ? ctrlKey : !ctrlKey;
                const shiftMatches = shortcut.shift ? event.shiftKey : !event.shiftKey;
                const altMatches = shortcut.alt ? event.altKey : !event.altKey;

                if (ctrlMatches && shiftMatches && altMatches) {
                    // Prevent default browser behavior (e.g., save dialog)
                    event.preventDefault();
                    event.stopPropagation();

                    // Execute the handler
                    shortcut.handler();

                    // Only handle the first matching shortcut
                    break;
                }
            }
        };

        // Add global listener
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, []);

    return (
        <KeyboardShortcutContext.Provider value={{ register, unregister }}>
            {children}
        </KeyboardShortcutContext.Provider>
    );
}

/**
 * Hook to register a keyboard shortcut
 * Automatically unregisters when component unmounts or config changes
 * 
 * @param id - Unique identifier for this shortcut
 * @param config - Shortcut configuration
 */
export function useKeyboardShortcut(id: string, config: ShortcutConfig) {
    const context = useContext(KeyboardShortcutContext);

    if (context === undefined) {
        throw new Error('useKeyboardShortcut must be used within a KeyboardShortcutProvider');
    }

    const { register, unregister } = context;

    // Use ref for the handler to avoid re-registering on every render
    const handlerRef = useRef(config.handler);
    handlerRef.current = config.handler;

    useEffect(() => {
        // Register with a wrapped handler that uses the ref
        register(id, {
            ...config,
            handler: () => handlerRef.current()
        });

        return () => {
            unregister(id);
        };
    }, [id, config.key, config.ctrl, config.shift, config.alt, config.enabled, register, unregister]);
}

/**
 * Optional hook to get the context directly (for advanced use cases)
 */
export function useKeyboardShortcutContext() {
    const context = useContext(KeyboardShortcutContext);

    if (context === undefined) {
        throw new Error('useKeyboardShortcutContext must be used within a KeyboardShortcutProvider');
    }

    return context;
}
