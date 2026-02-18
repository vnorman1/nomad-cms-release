/**
 * Admin Konfigurációs Tervrajz
 * 
 * Ez a fájl biztosítja a visszafelé kompatibilitást a meglévő komponensek számára.
 * A tényleges konfiguráció dinamikusan töltődik be a backend-ről (nomad.schema.json).
 * 
 * HASZNÁLAT:
 * - Meglévő import-ok továbbra is működnek: import { ADMIN_CONFIG } from '@/config/admin.config'
 * - Az ADMIN_CONFIG automatikusan frissül, amikor a séma betöltődik
 * - Új komponensekhez használd a useSchema() hook-ot a reaktív frissítésekhez
 * 
 * @see /frontend/src/services/schemaService.ts - Schema betöltő service
 * @see /frontend/src/services/useSchema.ts - React hook a schema eléréséhez
 * @see /api/data/nomad.schema.json - A tényleges konfiguráció JSON formátumban
 */

import { schemaService } from '@/services/schemaService';
import type {
    LoggingConfig as SchemaLoggingConfig,
    ContentBatchingConfig as SchemaContentBatchingConfig,
} from '@/services/schemaValidator';

// ═══════════════════════════════════════════════════════════════════════════
// LOGGING KONFIGURÁCIÓ - Dinamikusan betöltődik, fallback értékekkel
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_LOGGING_CONFIG = {
    logActions: {
        create: true,
        update: true,
        delete: true,
        login: true,
        logout: true,
    },
    logSlots: [] as string[],
};

/**
 * Logging konfiguráció getter - dinamikusan a schema-ból
 */
export const LOGGING_CONFIG = new Proxy(DEFAULT_LOGGING_CONFIG, {
    get(target, prop) {
        const schemaConfig = schemaService.getLoggingConfig();
        if (schemaConfig && prop in schemaConfig) {
            return schemaConfig[prop as keyof SchemaLoggingConfig];
        }
        return target[prop as keyof typeof target];
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// CONTENT BATCHING - Dinamikusan betöltődik, fallback értékekkel
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_CONTENT_BATCHING_CONFIG = {
    enabled: true,
    maxKeysPerBatch: 25,
    timeoutMs: 10000,
};

/**
 * Content batching konfiguráció getter - dinamikusan a schema-ból
 */
export const CONTENT_BATCHING_CONFIG = new Proxy(DEFAULT_CONTENT_BATCHING_CONFIG, {
    get(target, prop) {
        const schemaConfig = schemaService.getContentBatchingConfig();
        if (schemaConfig && prop in schemaConfig) {
            return schemaConfig[prop as keyof SchemaContentBatchingConfig];
        }
        return target[prop as keyof typeof target];
    }
});

// Mezőtípus definíciók
export type FieldType =
    | 'text'
    | 'textarea'
    | 'richtext'
    | 'number'
    | 'email'
    | 'url'
    | 'date'
    | 'datetime'
    | 'boolean'
    | 'select'
    | 'multiselect'
    | 'image'
    | 'gif'        // Csak animált GIF fájlok (mozgóképek)
    | 'gallery'
    | 'color'
    | 'json'
    | 'array'
    | 'file'       // Dokumentum fájlok (PDF, DOCX stb.) - opcionálisan titkosítva
    | 'slug'       // Automatikusan generált URL slug (ékezetek normalizálása, kötőjelek)
    | 'map'        // Google Térkép embed
    | 'iframe'     // Bármilyen iframe embed (YouTube, Vimeo, etc.)
    | 'blocks'     // Dynamic content blocks (Gutenberg-style)
    | 'video'      // Videó feltöltés (WebM konverzió)
    | 'audio'      // Hangfájl feltöltés (MP3, WAV, OGG stb.

// Fájl mező konfiguráció
export interface FileFieldConfig {
    allowedTypes?: string[];     // Engedélyezett kiterjesztések (pl. ['pdf', 'docx'])
    maxSizeMB?: number;          // Maximum fájlméret MB-ban (default: 25)
    secure?: boolean;            // Ha true, AES-256 titkosítással tárolódik
}

export interface FieldConfig {
    id: string;
    label: string;
    description?: string;
    type: FieldType;
    required?: boolean;
    placeholder?: string;
    defaultValue?: unknown;
    helpText?: string;
    hidden?: boolean;
    disabled?: boolean;
    readOnly?: boolean;
    localized?: boolean; // If true, value is stored as { [locale]: value } and rendered with split view
    validation?: {
        minLength?: number;
        maxLength?: number;
        min?: number;
        max?: number;
        pattern?: string;
    };
    options?: Array<{ value: string; label: string }>; // Select/multiselect mezőkhöz
    fileConfig?: FileFieldConfig;  // File mezőkhöz - típusok, méret, titkosítás
    slugSource?: string;           // Slug mezőkhöz: melyik másik mezőből generálódjon (pl. 'title')
    // Massive típushoz
    searchable?: boolean;      // Kereshető mező
    sortable?: boolean;        // Rendezhető mező
    filterable?: boolean;      // Szűrhető mező
    columnWidth?: number;      // Oszlop szélesség (px)
    showInTable?: boolean;     // Megjelenjen-e a táblázatban (default: true az első 5 mezőnél)
    jsonSchema?: Record<string, unknown>; // JSON mezőkhöz: struktúra sablon (ajánlás, nem szigorú validáció)
}

// Massive típus specifikus beállítások
export interface MassiveConfig {
    pageSize?: number;          // Elemek száma oldalanként (default: 50)
    defaultSort?: {
        field: string;
        direction: 'asc' | 'desc';
    };
    searchFields?: string[];    // Mely mezőkben keresünk (plaintext)
    quickFilters?: Array<{      // Gyors szűrők
        field: string;
        label: string;
        options: Array<{ value: string; label: string }>;
    }>;
    bulkActions?: boolean;      // Tömeges műveletek engedélyezése (default: true)
    exportEnabled?: boolean;    // CSV export engedélyezése (default: true)
    importEnabled?: boolean;    // CSV import engedélyezése (default: false)
    encrypted?: boolean;        // Ha true, adatok titkosítva tárolódnak
    /**
     * Blind Indexing - Keresés titkosított mezőkben
     * 
     * Ha az encrypted=true és searchableFields meg van adva, a felsorolt mezők
     * "blind index" tokeneket kapnak, amik lehetővé teszik a keresést anélkül,
     * hogy a titkosított adatokat decrypt-olni kellene.
     * 
     * Működés:
     * - A megadott mezők értékei HMAC-SHA256 hash-elve tárolódnak az FTS indexben
     * - Kereséskor a keresőkifejezés ugyanúgy hash-elődik és összehasonlításra kerül
     * - Csak pontos egyezés (exact match) keresés működik, részleges keresés nem
     * - A hash determinisztikus, így ugyanaz az érték mindig ugyanazt a tokent adja
     * 
     * Biztonsági megfontolások:
     * - A tokenek egyirányúak - nem lehet visszafejteni az eredeti értéket
     * - Külön kulcs használható (BLIND_INDEX_KEY) a titkosítási kulcstól
     * - Érzékeny adatoknál mérlegelni kell a kereshetőség vs. biztonság közti egyensúlyt
     * 
     * Példa: ['email', 'name'] - Email és név mező kereshető lesz titkosítva is
     */
    searchableFields?: string[];
}

export interface SlotConfig {
    label: string;
    description?: string;
    icon?: string; // Lucide ikon neve
    type: 'object' | 'list' | 'collection' | 'massive';
    isSitemap?: boolean; // Ha igaz, az elemek bekerülnek a sitemap.xml-be
    slugField?: string; // Gyűjteményekhez: melyik mezőt használjuk URL slug-ként
    publishedField?: string; // Opcionális: melyik boolean mező jelzi a publikált státuszt (pl. 'published')
    fields: FieldConfig[];
    // Massive típushoz
    massive?: MassiveConfig;
}

export interface AdminConfig {
    [key: string]: SlotConfig;
}

// ═══════════════════════════════════════════════════════════════════════════
// DINAMIKUS ADMIN_CONFIG PROXY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Dinamikus Admin konfiguráció
 * 
 * Ez a Proxy biztosítja a visszafelé kompatibilitást:
 * - A konfiguráció kizárólag a backend-ről (nomad.schema.json) töltődik be
 * - NINCS fallback - minden site saját sémával rendelkezik
 * - Ha a séma még nem töltődött be, üres objektumot ad vissza
 * - Az Object.entries(), Object.keys() stb. mind működnek
 * 
 * @example
 * // Szinkron használat (ha a séma már betöltődött)
 * const heroConfig = ADMIN_CONFIG['hero'];
 * 
 * // Iterálás
 * Object.entries(ADMIN_CONFIG).forEach(([key, config]) => {...});
 */
export const ADMIN_CONFIG: AdminConfig = new Proxy({} as AdminConfig, {
    get(_target, prop: string | symbol) {
        // Handle Symbol.toStringTag for [object Object] display
        if (prop === Symbol.toStringTag) {
            return 'AdminConfig';
        }

        // Get from schema service only - no fallback
        const schemaConfig = schemaService.getConfig();
        if (schemaConfig && typeof prop === 'string' && prop in schemaConfig) {
            return schemaConfig[prop];
        }

        return undefined;
    },

    has(_target, prop: string | symbol) {
        if (typeof prop !== 'string') return false;
        const schemaConfig = schemaService.getConfig();
        return schemaConfig ? prop in schemaConfig : false;
    },

    ownKeys() {
        const schemaConfig = schemaService.getConfig();
        return schemaConfig ? Object.keys(schemaConfig) : [];
    },

    getOwnPropertyDescriptor(_target, prop: string | symbol) {
        if (typeof prop !== 'string') return undefined;
        const schemaConfig = schemaService.getConfig();
        const value = schemaConfig?.[prop];
        if (value !== undefined) {
            return {
                enumerable: true,
                configurable: true,
                value,
            };
        }
        return undefined;
    },
});

/**
 * Ikon komponens lekérése egy slothoz
 * Az admin felület használja a megfelelő ikonok megjelenítésére
 */
export function getSlotIcon(key: string): string {
    const config = schemaService.getConfig();
    return config?.[key]?.icon || 'File';
}

/**
 * Összes gyűjtemény kulcs lekérése (sitemap generáláshoz)
 */
export function getSitemapKeys(): string[] {
    const config = schemaService.getConfig();
    if (!config) return [];
    return Object.entries(config)
        .filter(([, slotConfig]) => slotConfig.isSitemap)
        .map(([key]) => key);
}

/**
 * Inicializálja a sémát - hívd meg az alkalmazás indításakor
 * Ez biztosítja, hogy a séma betöltődik a backend-ről
 */
export async function initializeSchema(): Promise<void> {
    await schemaService.loadSchema();
}

/**
 * Ellenőrzi, hogy a dinamikus séma be van-e töltve
 */
export function isSchemaLoaded(): boolean {
    return schemaService.isLoaded();
}

/**
 * Séma verzió lekérése
 */
export function getSchemaVersion(): string | null {
    return schemaService.getVersion();
}