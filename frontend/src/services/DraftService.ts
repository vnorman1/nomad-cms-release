/**
 * DraftService - Automatikus mentés és draft kezelés
 * 
 * Dual storage stratégia:
 * - LocalStorage: Gyors hozzáféréshez, kisebb adatokhoz (< 5KB)
 * - IndexedDB: Nagyobb adatokhoz (képek, richtext tartalom)
 * 
 * Automatikus cleanup:
 * - 7 napnál régebbi draftoknál
 * - Maximum 50 draft tárolása
 */

// --- TYPES ---

export interface Draft {
    id: string;                 // Egyedi azonosító: `draft_${slotKey}_${itemId || 'new'}`
    slotKey: string;            // Slot neve (pl. 'blog', 'portfolio')
    itemId?: string;            // Elem ID-ja szerkesztésnél, undefined új elemnél
    data: Record<string, any>;  // A mentett adatok
    createdAt: number;          // Unix timestamp létrehozáskor
    updatedAt: number;          // Unix timestamp utolsó módosításkor
    version: number;            // Verzió szám (auto-increment mentésenként)
}

export interface DraftMeta {
    id: string;
    slotKey: string;
    itemId?: string;
    updatedAt: number;
    size: number;               // Becsült méret byte-ban
    previewTitle?: string;      // Előnézet cím (title/name mezőből)
}

// --- CONSTANTS ---

const DRAFT_PREFIX = 'nomad_draft_';
const META_KEY = 'nomad_drafts_meta';
const DB_NAME = 'NomadCMS_Drafts';
const DB_VERSION = 1;
const STORE_NAME = 'drafts';

const MAX_DRAFT_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 nap
const MAX_DRAFTS = 50;
const LOCALSTORAGE_SIZE_LIMIT = 5 * 1024; // 5KB alatt LocalStorage-ban marad

// --- INDEXEDDB SETUP ---

let db: IDBDatabase | null = null;
let dbReady: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
    if (db) return Promise.resolve(db);
    if (dbReady) return dbReady;

    dbReady = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            console.error('[DraftService] IndexedDB open error:', request.error);
            reject(request.error);
        };

        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const database = (event.target as IDBOpenDBRequest).result;
            
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
                store.createIndex('slotKey', 'slotKey', { unique: false });
                store.createIndex('updatedAt', 'updatedAt', { unique: false });
            }
        };
    });

    return dbReady;
}

// --- HELPER FUNCTIONS ---

function generateDraftId(slotKey: string, itemId?: string): string {
    return `${DRAFT_PREFIX}${slotKey}_${itemId || 'new_' + Date.now()}`;
}

function estimateSize(data: any): number {
    try {
        return new Blob([JSON.stringify(data)]).size;
    } catch {
        return JSON.stringify(data).length * 2; // UTF-16 fallback
    }
}

function getPreviewTitle(data: Record<string, any>): string | undefined {
    return data.title || data.name || data.label || undefined;
}

// --- META MANAGEMENT (LocalStorage) ---

function getMeta(): DraftMeta[] {
    try {
        const raw = localStorage.getItem(META_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function saveMeta(meta: DraftMeta[]): void {
    try {
        localStorage.setItem(META_KEY, JSON.stringify(meta));
    } catch (e) {
        console.error('[DraftService] Failed to save meta:', e);
    }
}

function updateMeta(draft: Draft): void {
    const meta = getMeta();
    const existingIndex = meta.findIndex(m => m.id === draft.id);
    
    const newMeta: DraftMeta = {
        id: draft.id,
        slotKey: draft.slotKey,
        itemId: draft.itemId,
        updatedAt: draft.updatedAt,
        size: estimateSize(draft.data),
        previewTitle: getPreviewTitle(draft.data)
    };

    if (existingIndex >= 0) {
        meta[existingIndex] = newMeta;
    } else {
        meta.push(newMeta);
    }

    saveMeta(meta);
}

function removeMeta(draftId: string): void {
    const meta = getMeta();
    saveMeta(meta.filter(m => m.id !== draftId));
}

// --- STORAGE OPERATIONS ---

async function saveToIndexedDB(draft: Draft): Promise<void> {
    const database = await openDB();
    
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(draft);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
}

async function getFromIndexedDB(draftId: string): Promise<Draft | null> {
    const database = await openDB();
    
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(draftId);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result || null);
    });
}

async function deleteFromIndexedDB(draftId: string): Promise<void> {
    const database = await openDB();
    
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(draftId);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
}

function saveToLocalStorage(draft: Draft): boolean {
    try {
        localStorage.setItem(draft.id, JSON.stringify(draft));
        return true;
    } catch (e) {
        // Quota exceeded - fallback to IndexedDB
        console.warn('[DraftService] LocalStorage full, using IndexedDB');
        return false;
    }
}

function getFromLocalStorage(draftId: string): Draft | null {
    try {
        const raw = localStorage.getItem(draftId);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function deleteFromLocalStorage(draftId: string): void {
    try {
        localStorage.removeItem(draftId);
    } catch {
        // Ignore
    }
}

// --- MAIN API ---

/**
 * Draft mentése
 * Automatikusan választ LocalStorage vagy IndexedDB között méret alapján
 */
export async function saveDraft(
    slotKey: string, 
    data: Record<string, any>, 
    itemId?: string
): Promise<Draft> {
    const now = Date.now();
    const draftId = generateDraftId(slotKey, itemId);
    
    // Meglévő draft keresése verzió növeléshez
    const existing = await getDraft(slotKey, itemId);
    
    const draft: Draft = {
        id: draftId,
        slotKey,
        itemId,
        data,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        version: (existing?.version || 0) + 1
    };

    const size = estimateSize(data);
    
    // Kis adatok LocalStorage-ba, nagyok IndexedDB-be
    if (size < LOCALSTORAGE_SIZE_LIMIT) {
        if (!saveToLocalStorage(draft)) {
            await saveToIndexedDB(draft);
        }
    } else {
        // Nagy adat - távolítsuk el LocalStorage-ból ha ott volt és tegyük IndexedDB-be
        deleteFromLocalStorage(draftId);
        await saveToIndexedDB(draft);
    }

    updateMeta(draft);
    
    // Cleanup futtatása mentés után (aszinkron, nem blokkoló)
    scheduleCleanup();
    
    return draft;
}

/**
 * Draft lekérése
 */
export async function getDraft(slotKey: string, itemId?: string): Promise<Draft | null> {
    const draftId = generateDraftId(slotKey, itemId);
    
    // Először LocalStorage-ban keresünk (gyorsabb)
    let draft = getFromLocalStorage(draftId);
    
    if (!draft) {
        // Ha nincs, IndexedDB-ben próbáljuk
        draft = await getFromIndexedDB(draftId);
    }
    
    return draft;
}

/**
 * Draft törlése
 */
export async function deleteDraft(slotKey: string, itemId?: string): Promise<void> {
    const draftId = generateDraftId(slotKey, itemId);
    
    deleteFromLocalStorage(draftId);
    await deleteFromIndexedDB(draftId);
    removeMeta(draftId);
}

/**
 * Slot összes draft-jének lekérése
 */
export function getDraftsBySlot(slotKey: string): DraftMeta[] {
    return getMeta().filter(m => m.slotKey === slotKey);
}

/**
 * Összes draft meta lekérése
 */
export function getAllDraftsMeta(): DraftMeta[] {
    return getMeta().sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Ellenőrzi van-e mentetlen draft a slot-hoz
 */
export async function hasDraft(slotKey: string, itemId?: string): Promise<boolean> {
    const draft = await getDraft(slotKey, itemId);
    return draft !== null;
}

// --- CLEANUP ---

let cleanupScheduled = false;

function scheduleCleanup(): void {
    if (cleanupScheduled) return;
    cleanupScheduled = true;
    
    // Késleltetett futtatás hogy ne lassítsa a mentést
    setTimeout(async () => {
        await runCleanup();
        cleanupScheduled = false;
    }, 1000);
}

/**
 * Cleanup futtatása
 * - Törli a 7 napnál régebbi draftokat
 * - Törli a legrégebbi draftokat ha túl sok van
 */
export async function runCleanup(): Promise<{ removed: number; reason: string[] }> {
    const meta = getMeta();
    const now = Date.now();
    const removed: string[] = [];
    const reasons: string[] = [];

    // 1. Régi draftok törlése
    const oldDrafts = meta.filter(m => now - m.updatedAt > MAX_DRAFT_AGE_MS);
    for (const draft of oldDrafts) {
        deleteFromLocalStorage(draft.id);
        await deleteFromIndexedDB(draft.id);
        removed.push(draft.id);
        reasons.push(`${draft.id}: 7 napnál régebbi`);
    }

    // Frissített meta a régi draftok törlése után
    let updatedMeta = meta.filter(m => now - m.updatedAt <= MAX_DRAFT_AGE_MS);

    // 2. Maximum korlát ellenőrzése
    if (updatedMeta.length > MAX_DRAFTS) {
        // Rendezzük frissítési idő szerint, legrégebbiek törlése
        updatedMeta.sort((a, b) => b.updatedAt - a.updatedAt);
        const toRemove = updatedMeta.slice(MAX_DRAFTS);
        
        for (const draft of toRemove) {
            deleteFromLocalStorage(draft.id);
            await deleteFromIndexedDB(draft.id);
            removed.push(draft.id);
            reasons.push(`${draft.id}: Maximum ${MAX_DRAFTS} draft túllépve`);
        }

        updatedMeta = updatedMeta.slice(0, MAX_DRAFTS);
    }

    saveMeta(updatedMeta);

    if (removed.length > 0) {
        console.log(`[DraftService] Cleanup: ${removed.length} draft törölve`, reasons);
    }

    return { removed: removed.length, reason: reasons };
}

/**
 * Összes draft törlése (teljes reset)
 */
export async function clearAllDrafts(): Promise<void> {
    const meta = getMeta();
    
    for (const draft of meta) {
        deleteFromLocalStorage(draft.id);
        await deleteFromIndexedDB(draft.id);
    }
    
    saveMeta([]);
    
    // IndexedDB teljes törlése
    try {
        const database = await openDB();
        const transaction = database.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        store.clear();
    } catch (e) {
        console.error('[DraftService] Failed to clear IndexedDB:', e);
    }

    console.log('[DraftService] All drafts cleared');
}

/**
 * Tárhelyhasználat lekérése
 */
export function getStorageUsage(): { 
    draftCount: number; 
    totalSize: number; 
    oldestDraft?: DraftMeta;
    newestDraft?: DraftMeta;
} {
    const meta = getMeta();
    const sorted = [...meta].sort((a, b) => a.updatedAt - b.updatedAt);
    
    return {
        draftCount: meta.length,
        totalSize: meta.reduce((sum, m) => sum + m.size, 0),
        oldestDraft: sorted[0],
        newestDraft: sorted[sorted.length - 1]
    };
}

// --- HOOK HELPER ---

/**
 * Auto-save helper konfiguráció alapú debounce-szal
 */
export function createAutoSaver(
    slotKey: string, 
    itemId: string | undefined,
    debounceMs: number = 2000
) {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let lastSavedVersion = 0;

    return {
        /**
         * Adat változáskor hívandó - debounce-olt mentés
         */
        onChange: (data: Record<string, any>) => {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }

            timeoutId = setTimeout(async () => {
                const draft = await saveDraft(slotKey, data, itemId);
                lastSavedVersion = draft.version;
            }, debounceMs);
        },

        /**
         * Azonnali mentés (pl. komponens unmount-nál)
         */
        saveNow: async (data: Record<string, any>) => {
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
            const draft = await saveDraft(slotKey, data, itemId);
            lastSavedVersion = draft.version;
            return draft;
        },

        /**
         * Draft törlése (sikeres mentés után)
         */
        discard: async () => {
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
            await deleteDraft(slotKey, itemId);
            lastSavedVersion = 0;
        },

        /**
         * Cleanup timeout-nál (komponens unmount)
         */
        cleanup: () => {
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
        },

        /**
         * Utolsó mentett verzió
         */
        getLastVersion: () => lastSavedVersion
    };
}

// --- EXPORT DEFAULT ---

const DraftService = {
    saveDraft,
    getDraft,
    deleteDraft,
    getDraftsBySlot,
    getAllDraftsMeta,
    hasDraft,
    runCleanup,
    clearAllDrafts,
    getStorageUsage,
    createAutoSaver
};

export default DraftService;
