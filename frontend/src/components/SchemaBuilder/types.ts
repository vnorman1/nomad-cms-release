/**
 * Schema Builder Types
 * 
 * Type definitions for the schema builder, mirroring admin.config.ts
 * but with additional builder-specific properties.
 */

// Re-export from admin.config for consistency
export type { FieldType, FieldConfig, SlotConfig, MassiveConfig, FileFieldConfig } from '@/config/admin.config';

/**
 * Static page configuration for sitemap
 */
export interface StaticPage {
    path: string;
    label?: string;
    priority: '1.0' | '0.9' | '0.8' | '0.7' | '0.6' | '0.5' | '0.4' | '0.3' | '0.2' | '0.1';
    changefreq: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
}

/**
 * Full schema structure matching nomad.schema.json
 */
export interface BuilderSchema {
    $schema?: string;
    $id?: string;
    version: string;
    description?: string;
    staticPages?: StaticPage[];
    slots: Record<string, BuilderSlotConfig>;
}

/**
 * Extended SlotConfig with builder metadata
 */
export interface BuilderSlotConfig {
    label: string;
    description?: string;
    icon?: string;
    type: 'object' | 'list' | 'collection' | 'massive';
    isSitemap?: boolean;
    slugField?: string;
    publishedField?: string;
    urlPattern?: string; // Custom URL pattern, e.g. "/projektek/{slug}" - defaults to "/{slotKey}/{slug}"
    fields: BuilderFieldConfig[];
    massive?: BuilderMassiveConfig;
}

/**
 * Extended FieldConfig with builder metadata
 */
export interface BuilderFieldConfig {
    id: string;
    label: string;
    type: FieldType;
    required?: boolean;
    placeholder?: string;
    defaultValue?: unknown;
    helpText?: string;
    hidden?: boolean;
    disabled?: boolean;
    readOnly?: boolean;
    validation?: {
        minLength?: number;
        maxLength?: number;
        min?: number;
        max?: number;
        pattern?: string;
    };
    options?: Array<{ value: string; label: string }>;
    fileConfig?: {
        allowedTypes?: string[];
        maxSizeMB?: number;
        secure?: boolean;
    };
    slugSource?: string;
    searchable?: boolean;
    sortable?: boolean;
    filterable?: boolean;
    columnWidth?: number;
    showInTable?: boolean;
    jsonSchema?: Record<string, unknown>; // JSON sablon (ajánlás)
}

/**
 * Extended MassiveConfig for builder
 */
export interface BuilderMassiveConfig {
    pageSize?: number;
    defaultSort?: {
        field: string;
        direction: 'asc' | 'desc';
    };
    searchFields?: string[];
    quickFilters?: Array<{
        field: string;
        label: string;
        options: Array<{ value: string; label: string }>;
    }>;
    bulkActions?: boolean;
    exportEnabled?: boolean;
    importEnabled?: boolean;
    encrypted?: boolean;
    searchableFields?: string[];
}

// Import FieldType for the type selector
import type { FieldType } from '@/config/admin.config';

/**
 * Field type metadata for the visual selector
 */
export interface FieldTypeInfo {
    type: FieldType;
    label: string;
    icon: string;
    color: string;
    description: string;
    hasOptions?: boolean;
    hasFileConfig?: boolean;
    hasSlugSource?: boolean;
}

/**
 * All available field types with metadata
 */
export const FIELD_TYPES: FieldTypeInfo[] = [
    { type: 'text', label: 'Szöveg', icon: 'Type', color: 'text-foreground', description: 'Egysoros szövegmező' },
    { type: 'textarea', label: 'Hosszú szöveg', icon: 'AlignLeft', color: 'text-foreground', description: 'Többsoros szövegmező' },
    { type: 'richtext', label: 'Rich Text', icon: 'FileText', color: 'text-foreground', description: 'Formázott szöveg (HTML)' },
    { type: 'number', label: 'Szám', icon: 'Hash', color: 'text-foreground', description: 'Numerikus érték' },
    { type: 'email', label: 'E-mail', icon: 'Mail', color: 'text-foreground', description: 'E-mail cím' },
    { type: 'url', label: 'URL', icon: 'Link', color: 'text-foreground', description: 'Webcím' },
    { type: 'date', label: 'Dátum', icon: 'Calendar', color: 'text-foreground', description: 'Dátum választó' },
    { type: 'datetime', label: 'Dátum+Idő', icon: 'Clock', color: 'text-foreground', description: 'Dátum és idő' },
    { type: 'boolean', label: 'Logikai', icon: 'ToggleLeft', color: 'text-emerald-500', description: 'Igen/Nem kapcsoló' },
    { type: 'select', label: 'Választó', icon: 'ChevronDown', color: 'text-foreground', description: 'Legördülő lista', hasOptions: true },
    { type: 'multiselect', label: 'Többválasztó', icon: 'CheckSquare', color: 'text-foreground', description: 'Több elem kiválasztása', hasOptions: true },
    { type: 'image', label: 'Kép', icon: 'Image', color: 'text-zinc-400', description: 'Képfeltöltés' },
    { type: 'gif', label: 'GIF', icon: 'Film', color: 'text-purple-500', description: 'Animált GIF' },
    { type: 'gallery', label: 'Galéria', icon: 'Images', color: 'text-zinc-400', description: 'Több kép' },
    { type: 'video', label: 'Videó', icon: 'Video', color: 'text-red-500', description: 'Videó feltöltés' },
    { type: 'audio', label: 'Hang', icon: 'Music', color: 'text-green-500', description: 'Hangfájl feltöltés' },
    { type: 'color', label: 'Szín', icon: 'Palette', color: 'text-foreground', description: 'Színválasztó' },
    { type: 'json', label: 'JSON', icon: 'Braces', color: 'text-foreground', description: 'JSON struktúra' },
    { type: 'array', label: 'Tömb', icon: 'List', color: 'text-foreground', description: 'Értékek listája' },
    { type: 'file', label: 'Fájl', icon: 'File', color: 'text-amber-500', description: 'Dokumentum feltöltés', hasFileConfig: true },
    { type: 'map', label: 'Térkép', icon: 'MapPin', color: 'text-blue-500', description: 'Google Térkép koordináták' },
    { type: 'slug', label: 'Slug', icon: 'Link2', color: 'text-foreground', description: 'URL-barát azonosító', hasSlugSource: true },
    { type: 'iframe', label: 'Iframe / Embed', icon: 'Globe', color: 'text-pink-500', description: 'Beágyazott tartalom (YouTube, Térkép, stb.)' },
    { type: 'blocks', label: 'Blokkok', icon: 'Layers', color: 'text-indigo-500', description: 'Dinamikus tartalom blokkok' },
];

/**
 * Slot type metadata
 */
export interface SlotTypeInfo {
    type: 'object' | 'list' | 'collection' | 'massive';
    label: string;
    icon: string;
    description: string;
}

export const SLOT_TYPES: SlotTypeInfo[] = [
    { type: 'object', label: 'Objektum', icon: 'Box', description: 'Egyetlen rekord (pl. beállítások)' },
    { type: 'list', label: 'Lista', icon: 'Layout', description: 'Rendezett elemek listája' },
    { type: 'collection', label: 'Gyűjtemény', icon: 'Layers', description: 'Elemek gyűjteménye egyedi azonosítóval' },
    { type: 'massive', label: 'Massive', icon: 'Database', description: 'Nagy adatmennyiség (2M+ sor)' },
];

/**
 * Default empty schema
 */
export const DEFAULT_SCHEMA: BuilderSchema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'my-project-schema',
    version: '1.0.0',
    description: '',
    staticPages: [
        { path: '/', label: 'Főoldal', priority: '1.0', changefreq: 'daily' },
    ],
    slots: {},
};

/**
 * Create a new empty slot
 */
export function createEmptySlot(key: string): BuilderSlotConfig {
    return {
        label: key,
        description: '',
        icon: 'File',
        type: 'object',
        fields: [],
    };
}

/**
 * Create a new empty field
 */
export function createEmptyField(id: string): BuilderFieldConfig {
    return {
        id,
        label: id,
        type: 'text',
        required: false,
    };
}
