/**
 * JSON to Schema Converter Utility
 *
 * Converts raw JSON data (single object, array of objects, or multiple
 * pasted JSON objects) into a BuilderSlotConfig for the Schema Builder.
 */

import type { BuilderSlotConfig, BuilderFieldConfig, FieldType } from './types';

/**
 * Infers the NOMAD CMS field type from a JavaScript value.
 */
function inferFieldType(value: unknown): FieldType {
    if (value === null || value === undefined) {
        return 'text';
    }

    if (Array.isArray(value)) {
        // Per user request: always map arrays to 'array' type
        return 'array';
    }

    if (typeof value === 'boolean') {
        return 'boolean';
    }

    if (typeof value === 'number') {
        return 'number';
    }

    if (typeof value === 'string') {
        const str = value.trim();

        // Check for image URL patterns
        const imageExtensions = /\.(png|jpg|jpeg|gif|webp|svg|avif)(\?.*)?$/i;
        if (imageExtensions.test(str)) {
            return 'image';
        }

        // Check for GIF specifically
        if (/\.gif(\?.*)?$/i.test(str)) {
            return 'gif';
        }

        // Check for URL patterns
        if (/^https?:\/\//.test(str) || str.startsWith('/')) {
            return 'url';
        }

        // Check for long text (likely description or richtext)
        if (str.length > 150) {
            return 'textarea';
        }

        // Check for year-like patterns
        if (/^\d{4}$/.test(str)) {
            return 'text';
        }

        return 'text';
    }

    if (typeof value === 'object') {
        return 'json';
    }

    return 'text';
}

/**
 * Extracts all JSON objects from a potentially messy input string.
 * Handles:
 * - Single object: { ... }
 * - Array of objects: [ {...}, {...} ]
 * - Multiple objects pasted together: { ... } { ... }
 * - Objects with trailing commas: { ... },
 */
function extractJsonObjects(input: string): Record<string, unknown>[] {
    const objects: Record<string, unknown>[] = [];
    const trimmed = input.trim();

    // Try parsing as a JSON array first
    try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
            return parsed.filter((item): item is Record<string, unknown> =>
                typeof item === 'object' && item !== null && !Array.isArray(item)
            );
        }
        if (typeof parsed === 'object' && parsed !== null) {
            return [parsed as Record<string, unknown>];
        }
    } catch {
        // Not valid JSON, try to extract objects manually
    }

    // Extract individual JSON objects using brace matching
    let depth = 0;
    let start = -1;

    for (let i = 0; i < trimmed.length; i++) {
        const char = trimmed[i];

        if (char === '{') {
            if (depth === 0) {
                start = i;
            }
            depth++;
        } else if (char === '}') {
            depth--;
            if (depth === 0 && start !== -1) {
                const jsonStr = trimmed.slice(start, i + 1);
                try {
                    const obj = JSON.parse(jsonStr);
                    if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
                        objects.push(obj as Record<string, unknown>);
                    }
                } catch {
                    // Skip invalid JSON fragments
                }
                start = -1;
            }
        }
    }

    return objects;
}

/**
 * Merges field definitions from multiple objects.
 * If the same key appears with different types, picks the most common or first type.
 */
function mergeFields(objects: Record<string, unknown>[]): BuilderFieldConfig[] {
    const fieldMap = new Map<string, { type: FieldType; samples: unknown[] }>();

    for (const obj of objects) {
        for (const [key, value] of Object.entries(obj)) {
            const inferredType = inferFieldType(value);

            if (!fieldMap.has(key)) {
                fieldMap.set(key, { type: inferredType, samples: [value] });
            } else {
                const existing = fieldMap.get(key)!;
                existing.samples.push(value);
                // Keep the existing type unless the new one is more specific
                // For simplicity, we keep the first inferred type
            }
        }
    }

    const fields: BuilderFieldConfig[] = [];

    for (const [key, { type }] of fieldMap) {
        const field: BuilderFieldConfig = {
            id: key,
            label: formatLabel(key),
            type,
            required: false,
        };

        // Add helpful metadata based on type
        if (type === 'textarea') {
            field.placeholder = 'Hosszú szöveg...';
        }

        fields.push(field);
    }

    return fields;
}

/**
 * Formats a camelCase or snake_case key into a human-readable label.
 */
function formatLabel(key: string): string {
    return key
        .replace(/([A-Z])/g, ' $1') // camelCase -> camel Case
        .replace(/_/g, ' ')          // snake_case -> snake case
        .replace(/^\w/, c => c.toUpperCase()) // Capitalize first letter
        .trim();
}

/**
 * Tries to extract a meaningful slot name from the data.
 */
function inferSlotName(objects: Record<string, unknown>[]): string {
    // Look for common naming fields
    const namingFields = ['type', 'category', 'title', 'name'];

    for (const field of namingFields) {
        const values = objects
            .map(obj => obj[field])
            .filter((v): v is string => typeof v === 'string');

        if (values.length > 0) {
            // Use the first value as basis, clean it up for use as a key
            const name = values[0]
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '_')
                .replace(/^_|_$/g, '')
                .slice(0, 30);

            if (name.length > 0) {
                return name;
            }
        }
    }

    return 'imported_data';
}

/**
 * Main function: Converts raw JSON input into a BuilderSlotConfig.
 */
export function inferSchemaFromData(input: string): {
    slotKey: string;
    slotConfig: BuilderSlotConfig;
} | null {
    const objects = extractJsonObjects(input);

    if (objects.length === 0) {
        return null;
    }

    const slotKey = inferSlotName(objects);
    const fields = mergeFields(objects);

    const slotConfig: BuilderSlotConfig = {
        label: formatLabel(slotKey),
        description: `Automatikusan generált séma ${objects.length} JSON objektumból.`,
        icon: 'FileJson',
        type: objects.length > 1 ? 'list' : 'object',
        fields,
    };

    return { slotKey, slotConfig };
}
