/**
 * Smart JSON Field Detection
 * Intelligens mező felismerés és magyar fordítás
 */

// Ismert mezők és mértékegységeik
export const KNOWN_FIELDS: Record<string, { unit?: string; type?: 'currency' | 'weight' | 'length' | 'percent' | 'energy' }> = {
    // Pénz
    price: { unit: 'Ft', type: 'currency' },
    cost: { unit: 'Ft', type: 'currency' },
    amount: { unit: 'Ft', type: 'currency' },
    huf: { unit: 'Ft', type: 'currency' },
    eur: { unit: '€', type: 'currency' },
    usd: { unit: '$', type: 'currency' },

    // Energia
    calories: { unit: 'kcal', type: 'energy' },
    kcal: { unit: 'kcal', type: 'energy' },

    // Súly (tápanyagok)
    protein: { unit: 'g', type: 'weight' },
    fat: { unit: 'g', type: 'weight' },
    carbohydrates: { unit: 'g', type: 'weight' },
    carbs: { unit: 'g', type: 'weight' },
    fiber: { unit: 'g', type: 'weight' },
    sugar: { unit: 'g', type: 'weight' },
    sodium: { unit: 'mg', type: 'weight' },
    salt: { unit: 'g', type: 'weight' },
    weight: { unit: 'g', type: 'weight' },
    mass: { unit: 'kg', type: 'weight' },

    // Hossz/méret
    width: { unit: 'cm', type: 'length' },
    height: { unit: 'cm', type: 'length' },
    depth: { unit: 'cm', type: 'length' },
    length: { unit: 'cm', type: 'length' },
    size: { unit: 'cm', type: 'length' },

    // Százalék
    percent: { unit: '%', type: 'percent' },
    percentage: { unit: '%', type: 'percent' },
    discount: { unit: '%', type: 'percent' },
    vat: { unit: '%', type: 'percent' },
    tax: { unit: '%', type: 'percent' },
};

// Magyar fordítások általános szavakhoz
export const TRANSLATIONS: Record<string, string> = {
    // Tápanyag/élelmiszer
    servingsize: 'Adag méret',
    serving: 'Adag',
    calories: 'Kalória',
    protein: 'Fehérje',
    fat: 'Zsír',
    carbohydrates: 'Szénhidrát',
    carbs: 'Szénhidrát',
    fiber: 'Rost',
    sugar: 'Cukor',
    sodium: 'Nátrium',
    salt: 'Só',
    allergens: 'Allergének',
    nutrition: 'Tápérték',
    ingredients: 'Összetevők',

    // Általános
    name: 'Név',
    title: 'Cím',
    description: 'Leírás',
    price: 'Ár',
    cost: 'Költség',
    amount: 'Összeg',
    quantity: 'Mennyiség',
    total: 'Összesen',
    subtotal: 'Részösszeg',

    // Méretek
    size: 'Méret',
    width: 'Szélesség',
    height: 'Magasság',
    depth: 'Mélység',
    length: 'Hossz',
    weight: 'Súly',
    mass: 'Tömeg',

    // Pénznem
    currency: 'Pénznem',
    huf: 'HUF',
    eur: 'EUR',
    usd: 'USD',

    // Üzleti
    discount: 'Kedvezmény',
    vat: 'ÁFA',
    tax: 'Adó',
    percent: 'Százalék',
    percentage: 'Százalék',

    // Állapot
    status: 'Állapot',
    active: 'Aktív',
    enabled: 'Engedélyezve',
    disabled: 'Letiltva',
    visible: 'Látható',
    hidden: 'Rejtett',

    // Idő
    date: 'Dátum',
    time: 'Idő',
    createdat: 'Létrehozva',
    updatedat: 'Módosítva',
    startat: 'Kezdés',
    endat: 'Befejezés',

    // Kontakt
    email: 'E-mail',
    phone: 'Telefon',
    address: 'Cím',
    city: 'Város',
    country: 'Ország',
    zip: 'Irányítószám',

    // Egyéb
    url: 'URL',
    link: 'Link',
    image: 'Kép',
    icon: 'Ikon',
    color: 'Szín',
    type: 'Típus',
    category: 'Kategória',
    tags: 'Címkék',
    id: 'Azonosító',
    slug: 'Slug',
    order: 'Sorrend',
    priority: 'Prioritás',
    notes: 'Megjegyzések',
    comments: 'Hozzászólások',
    value: 'Érték',
    label: 'Címke',
    key: 'Kulcs',
    data: 'Adat',
    content: 'Tartalom',
    text: 'Szöveg',
    message: 'Üzenet',
    options: 'Opciók',
    settings: 'Beállítások',
    config: 'Konfiguráció',
    meta: 'Meta',
    info: 'Információ',
    details: 'Részletek',
    items: 'Elemek',
    list: 'Lista',
    min: 'Minimum',
    max: 'Maximum',
    default: 'Alapértelmezett',
    required: 'Kötelező',
    optional: 'Opcionális',
};

/**
 * Mező információ lekérése kulcsnév alapján
 */
export function getFieldInfo(key: string): {
    label: string;
    unit?: string;
    type?: string;
} {
    // Ensure key is a string to prevent crashes if something else is passed
    const safeKey = typeof key === 'string' ? key : String(key || '');
    const normalizedKey = safeKey.toLowerCase().replace(/[_-]/g, '');

    // Magyar fordítás keresése - Safe lookup to handle reserved words (e.g. constructor)
    const translation = Object.prototype.hasOwnProperty.call(TRANSLATIONS, normalizedKey)
        ? TRANSLATIONS[normalizedKey]
        : undefined;

    // Mértékegység keresése - Safe lookup
    const fieldInfo = Object.prototype.hasOwnProperty.call(KNOWN_FIELDS, normalizedKey)
        ? KNOWN_FIELDS[normalizedKey]
        : undefined;

    // CamelCase szétbontása ha nincs fordítás
    const fallbackLabel = translation || camelCaseToHuman(safeKey);

    return {
        label: fallbackLabel,
        unit: fieldInfo?.unit,
        type: fieldInfo?.type,
    };
}

/**
 * CamelCase vagy snake_case átalakítása olvasható formátumra
 */
function camelCaseToHuman(str: string): string {
    return str
        // camelCase → camel Case
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        // snake_case → snake case
        .replace(/[_-]/g, ' ')
        // Első betű nagy
        .replace(/^./, s => s.toUpperCase())
        .trim();
}

/**
 * Depth-aware stílus meghatározása
 * Mélyebb szinteknél kompaktabb megjelenés
 */
export function getDepthStyle(depth: number): {
    compact: boolean;
    indentClass: string;
    fontSize: 'normal' | 'small' | 'tiny';
    showBorder: boolean;
} {
    if (depth <= 2) {
        return {
            compact: false,
            indentClass: 'pl-4',
            fontSize: 'normal',
            showBorder: true,
        };
    } else if (depth <= 4) {
        return {
            compact: false,
            indentClass: 'pl-3',
            fontSize: 'small',
            showBorder: true,
        };
    } else if (depth <= 7) {
        return {
            compact: true,
            indentClass: 'pl-2',
            fontSize: 'small',
            showBorder: false,
        };
    } else {
        // 7+ mélység: nagyon kompakt, de nem omlik össze
        return {
            compact: true,
            indentClass: 'pl-1',
            fontSize: 'tiny',
            showBorder: false,
        };
    }
}

/**
 * JSON érték típusának meghatározása
 */
export function getValueType(value: unknown): 'string' | 'number' | 'boolean' | 'null' | 'array' | 'object' {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object') return 'object';
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number') return 'number';
    return 'string';
}

/**
 * Tömb típusának meghatározása (primitív vagy objektum)
 */
export function getArrayType(arr: unknown[]): 'primitive' | 'object' | 'mixed' | 'empty' {
    if (arr.length === 0) return 'empty';

    const types = new Set(arr.map(item => {
        if (item === null) return 'null';
        if (typeof item === 'object') return 'object';
        return 'primitive';
    }));

    if (types.size === 1) {
        if (types.has('object')) return 'object';
        return 'primitive';
    }

    return 'mixed';
}
