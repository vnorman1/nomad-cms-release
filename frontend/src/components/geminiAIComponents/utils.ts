import { ADMIN_CONFIG } from '@/config/admin.config';

// -----------------------------------------------------------------------------
// HELPER FUNCTIONS
// -----------------------------------------------------------------------------

export function parseJsonFromResponse(text: string): Record<string, unknown> | Record<string, unknown>[] | null {
    console.log('[parseJsonFromResponse] Input:', text);

    // Clean the text - remove markdown code blocks if present
    let cleanText = text.trim();

    // Remove ```json and ``` markers (more robust)
    cleanText = cleanText.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').replace(/\s*```/gi, '');

    console.log('[parseJsonFromResponse] After cleanup:', cleanText);

    // Try to extract JSON array first (for multi-item generation)
    const arrayMatch = cleanText.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
        console.log('[parseJsonFromResponse] Found JSON array match:', arrayMatch[0]);
        try {
            const parsed = JSON.parse(arrayMatch[0]);
            if (Array.isArray(parsed) && parsed.length > 0) {
                console.log('[parseJsonFromResponse] Successfully parsed array with', parsed.length, 'items');
                return parsed as Record<string, unknown>[];
            }
        } catch (e) {
            console.log('[parseJsonFromResponse] Array parse error:', e);
        }
    }

    // Try to extract JSON object from response
    // First, try strict match for code blocks
    const codeBlockMatch = cleanText.match(/```json\s*(\{[\s\S]*?\})\s*```/);
    if (codeBlockMatch) {
        try {
            const parsed = JSON.parse(codeBlockMatch[1]);
            if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
                return parsed as Record<string, unknown>;
            }
        } catch (e) {
            // Continue
        }
    }

    // Heuristic: Find first '{' and last '}'
    const firstOpen = cleanText.indexOf('{');
    const lastClose = cleanText.lastIndexOf('}');

    if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
        const potentialJson = cleanText.substring(firstOpen, lastClose + 1);
        console.log('[parseJsonFromResponse] Potential JSON substring:', potentialJson);

        try {
            const parsed = JSON.parse(potentialJson);
            // Return if it's an object (form data)
            if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
                console.log('[parseJsonFromResponse] Successfully parsed object:', parsed);
                return parsed as Record<string, unknown>;
            }
        } catch (e) {
            console.log('[parseJsonFromResponse] Object parse error (substring):', e);
        }
    }

    // Fallback: Check if there was no JSON found
    if (!codeBlockMatch && (firstOpen === -1 || lastClose === -1)) {
        console.log('[parseJsonFromResponse] No JSON found in text');
    }

    return null;
}

// Parse multiple JSON objects from response (for batch generation)
export function parseMultipleJsonFromResponse(text: string): Record<string, unknown>[] {
    console.log('[parseMultipleJsonFromResponse] Input:', text);

    // Clean the text - remove markdown code blocks if present
    let cleanText = text.trim();
    cleanText = cleanText.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').replace(/\s*```/gi, '');

    console.log('[parseMultipleJsonFromResponse] After cleanup:', cleanText);

    // Try to extract JSON array first
    const arrayMatch = cleanText.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
        console.log('[parseMultipleJsonFromResponse] Found JSON array');
        try {
            const parsed = JSON.parse(arrayMatch[0]);
            if (Array.isArray(parsed)) {
                // Filter for valid objects only
                const validItems = parsed.filter(
                    item => typeof item === 'object' && item !== null && !Array.isArray(item)
                );
                console.log('[parseMultipleJsonFromResponse] Parsed array with', validItems.length, 'items');
                return validItems as Record<string, unknown>[];
            }
        } catch (e) {
            console.log('[parseMultipleJsonFromResponse] Array parse error:', e);
        }
    }

    // Fallback: try to extract individual objects separated by newlines or commas
    const objectMatches = cleanText.match(/\{[^{}]*\}/g);
    if (objectMatches && objectMatches.length > 0) {
        console.log('[parseMultipleJsonFromResponse] Found', objectMatches.length, 'individual objects');
        const items: Record<string, unknown>[] = [];
        for (const match of objectMatches) {
            try {
                const parsed = JSON.parse(match);
                if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
                    items.push(parsed as Record<string, unknown>);
                }
            } catch {
                // Skip invalid objects
            }
        }
        return items;
    }

    // Last fallback: try single object or array via parseJsonFromResponse
    const parsed = parseJsonFromResponse(text);
    if (!parsed) return [];
    // If it's already an array, return it
    if (Array.isArray(parsed)) return parsed;
    // Single object - wrap in array
    return [parsed];
}

// Helper function to check if user message is asking for form content generation
export function isFormFillRequest(text: string): boolean {
    // Kibővített kulcsszólista - magyar és angol kifejezések a generáláshoz
    const keywords = [
        // Magyar - generálás
        'adj hozzá', 'hozz létre', 'generálj', 'készíts', 'töltsd ki',
        'írj be', 'írj', 'add meg', 'állíts be', 'készíts el',
        'csinálj', 'alkoss', 'teremts',
        // Magyar - akarás/kérés
        'akarok', 'szeretnék', 'kérek', 'kellene', 'legyen',
        'akarom', 'szeretném', 'kell', 'új', 'újat',
        // Angol - generálás
        'add', 'create', 'generate', 'fill', 'make', 'new', 'set',
        'populate', 'provide', 'build', 'want', 'need', 'please',
        'would like', 'give me', 'i need', 'i want',
        // Szerkesztés
        'szerkeszd', 'módosítsd', 'frissítsd', 'változtasd',
        'edit', 'modify', 'update', 'change',
    ];
    const lowerText = text.toLowerCase();
    const result = keywords.some(kw => lowerText.includes(kw));
    console.log('[isFormFillRequest] Text:', text);
    console.log('[isFormFillRequest] Is generation request:', result);
    return result;
}

// Check if user wants to only navigate (without generating content)
export function isNavigationOnlyRequest(text: string): boolean {
    const lowerText = normalizeAccents(text.toLowerCase());
    const navKeywords = [
        // Hungarian navigation verbs
        'vigyel', 'menj', 'mutasd', 'nyisd meg', 'navigalj', 'ugorj',
        'vidd at', 'iranyits', 'menjunk', 'menjek', 'valtsd', 'valtson',
        'lepjunk', 'lepj', 'irany', 'nyisd', 'mutasd meg', 'meg akarom nezni',
        // English navigation verbs
        'go to', 'navigate', 'show me', 'open', 'take me', 'switch to',
        'bring me', 'jump to', 'go', 'head to', 'let me see', 'i want to see',
    ];
    // Must have navigation keyword but NOT generation/delete/move keyword
    const hasNavKeyword = navKeywords.some(kw => lowerText.includes(kw));
    const hasGenerationKeyword = isFormFillRequest(text);
    const hasDeleteKeyword = isDeleteRequest(text);
    const hasMoveKeyword = isMoveRequest(text);
    return hasNavKeyword && !hasGenerationKeyword && !hasDeleteKeyword && !hasMoveKeyword;
}

// Check if user is asking a question (Q&A mode)
export function isQuestionRequest(text: string): boolean {
    const lowerText = normalizeAccents(text.toLowerCase().trim());
    // Ends with question mark
    if (lowerText.endsWith('?')) return true;
    // Starts with question words
    const questionStarts = [
        'mi ', 'mit ', 'hany', 'mennyi', 'hogyan', 'miert', 'mikor', 'hol ', 'ki ', 'melyik',
        'milyen', 'mik ', 'kik ', 'mikortol', 'meddig',
        'what', 'how', 'why', 'when', 'where', 'who', 'which', 'can you', 'is there', 'are there',
    ];
    return questionStarts.some(qs => lowerText.startsWith(qs));
}

// Check if user wants to delete something
export function isDeleteRequest(text: string): boolean {
    const lowerText = normalizeAccents(text.toLowerCase());
    const deleteKeywords = [
        'torold', 'tavolitsd el', 'torol', 'torolj', 'torles', 'tuntess el',
        'delete', 'remove', 'clear', 'get rid of',
    ];
    return deleteKeywords.some(kw => lowerText.includes(kw));
}

// Check if user wants to reorder/move something
export function isMoveRequest(text: string): boolean {
    const lowerText = normalizeAccents(text.toLowerCase());

    // Explicit move verbs - these are strong indicators
    const moveVerbs = [
        'mozgasd', 'helyezd', 'tedd', 'mozditsd', 'rendezd', 'rakd', 'told',
        'move', 'reorder', 'put', 'place', 'sort', 'drag',
    ];

    // Position keywords - only count if combined with verb-like context
    const positionKeywords = [
        'felulre', 'lefele', 'elso helyre', 'utolso helyre',
        'legyen az elso', 'legyen elso', 'legyen utolso',
        'fel egyet', 'le egyet', 'felebb', 'lejjebb',
        'to the top', 'to the bottom', 'to first', 'to last', 'move up', 'move down',
    ];

    // Strong: explicit move verb
    if (moveVerbs.some(kw => lowerText.includes(kw))) return true;

    // Medium: position keyword with "az" or "a" (article) suggesting target
    if (positionKeywords.some(kw => lowerText.includes(kw))) {
        // Must have some action context, not just describe something
        return lowerText.includes(' az ') || lowerText.includes(' a ') ||
            lowerText.includes('tedd') || lowerText.includes('legyen');
    }

    return false;
}

// Check if this is a bulk operation
export function isBulkRequest(text: string): boolean {
    const lowerText = normalizeAccents(text.toLowerCase());
    const bulkKeywords = [
        'az osszes', 'minden', 'mindegyik', 'osszes',
        'all', 'bulk', 'each', 'every', 'all of',
    ];
    return bulkKeywords.some(kw => lowerText.includes(kw));
}

// Determine the action type from user message
export type AiActionType = 'generate' | 'delete' | 'move' | 'question' | 'navigate' | 'chat';

export function detectActionType(text: string): AiActionType {
    // DEBUG
    console.log('[detectActionType]', {
        text: text.substring(0, 40),
        isDelete: isDeleteRequest(text),
        isMove: isMoveRequest(text),
        isNav: isNavigationOnlyRequest(text),
        isGen: isFormFillRequest(text),
        isQ: isQuestionRequest(text),
    });

    // Priority order matters!
    // 1. Delete is highest priority - explicit destructive action
    if (isDeleteRequest(text)) return 'delete';

    // 2. Move/reorder
    if (isMoveRequest(text)) return 'move';

    // 3. Generation - creating new content
    if (isFormFillRequest(text)) return 'generate';

    // 4. Navigation only (without generation intent)
    if (isNavigationOnlyRequest(text)) return 'navigate';

    // 5. Question
    if (isQuestionRequest(text)) return 'question';

    // 6. Default: general chat
    return 'chat';
}

export function buildSchemaContext() {
    const simplified: Record<string, { label: string; type: string; fields: string[] }> = {};

    for (const [key, config] of Object.entries(ADMIN_CONFIG)) {
        simplified[key] = {
            label: config.label,
            type: config.type,
            fields: config.fields.map(f => `${f.id} (${f.type}${f.required ? ', required' : ''})`),
        };
    }

    return simplified;
}

// Helper: remove Hungarian accents for matching
export function normalizeAccents(text: string): string {
    return text
        .replace(/[áàâä]/gi, 'a')
        .replace(/[éèêë]/gi, 'e')
        .replace(/[íìîï]/gi, 'i')
        .replace(/[óòôöő]/gi, 'o')
        .replace(/[úùûüű]/gi, 'u');
}

// Helper: detect which slot/schema the user is asking about
export function detectRequestedSlot(text: string): { slotKey: string; label: string } | null {
    const lowerText = text.toLowerCase();
    const normalizedText = normalizeAccents(lowerText);
    console.log('[detectRequestedSlot] Analyzing text:', lowerText, '| normalized:', normalizedText);

    // First check exact matches against ADMIN_CONFIG labels and keys
    for (const [key, config] of Object.entries(ADMIN_CONFIG)) {
        const label = config.label.toLowerCase();
        const normalizedLabel = normalizeAccents(label);
        console.log('[detectRequestedSlot] Checking key:', key, 'label:', label);

        // Check both original and normalized versions
        if (lowerText.includes(label) || lowerText.includes(key.toLowerCase()) ||
            normalizedText.includes(normalizedLabel) || normalizedText.includes(key.toLowerCase())) {
            console.log('[detectRequestedSlot] Match found! key:', key, 'label:', config.label);
            return { slotKey: key, label: config.label };
        }
    }

    // Try to match common keywords to schemas - expanded list with Hungarian word forms
    const keywordMap: Record<string, string> = {
        // About - rólunk szekció
        'about': 'about',
        'rolunk': 'about',
        'rólunk': 'about',
        'bemutatkozás': 'about',
        'bemutatkozas': 'about',
        'magamról': 'about',
        'magamrol': 'about',
        // Hero - hero szekció  
        'hero': 'hero',
        'főoldal': 'hero',
        'fooldal': 'hero',
        'landing': 'hero',
        'bevezető': 'hero',
        'bevezeto': 'hero',
        // SEO beállítások
        'seo': 'seo',
        'meta': 'seo',
        'metatag': 'seo',
        'keresőoptimalizálás': 'seo',
        'keresooptimalizalas': 'seo',
        // Site Settings - oldal beállítások
        'beállítás': 'siteSettings',
        'beallitas': 'siteSettings',
        'settings': 'siteSettings',
        'oldal': 'siteSettings',
        'site': 'siteSettings',
        // Skills - különböző ragozott formák
        'skill': 'skills',
        'kepesseg': 'skills',
        'képességet': 'skills',  // tárgyeset
        'képességek': 'skills',  // többes szám
        'technológia': 'skills',
        'technológiá': 'skills', // ragozott
        'tech': 'skills',
        'typescript': 'skills',
        'javascript': 'skills',
        'react': 'skills',
        'python': 'skills',
        'java': 'skills',
        'node': 'skills',
        'css': 'skills',
        'html': 'skills',
        'sql': 'skills',
        'nyelv': 'skills',
        'nyelvet': 'skills',
        'language': 'skills',
        'framework': 'skills',
        // Services - szolgáltatások
        'szolgáltatás': 'services',
        'szolgáltatást': 'services',
        'szolgáltatások': 'services',
        'service': 'services',
        // Projects - projektek
        'projekt': 'projects',
        'projektet': 'projects',
        'projektek': 'projects',
        'project': 'projects',
        'munka': 'projects',
        'munkát': 'projects',
        'work': 'projects',
        'portfolio': 'projects',
        'portfólió': 'projects',
        'app': 'projects',
        'alkalmazás': 'projects',
        'alkalmazást': 'projects',
        'website': 'projects',
        'weboldal': 'projects',
        'weboldalt': 'projects',
        // Experience - tapasztalatok
        'experience': 'experience',
        'tapasztalat': 'experience',
        'tapasztalatot': 'experience',
        'tapasztalatok': 'experience',
        'job': 'experience',
        'állás': 'experience',
        'állást': 'experience',
        'pozíció': 'experience',
        'pozíciót': 'experience',
        'cég': 'experience',
        'céget': 'experience',
        'company': 'experience',
        // Education - tanulmányok
        'tanulmány': 'education',
        'tanulmányt': 'education',
        'tanulmányok': 'education',
        'education': 'education',
        'iskola': 'education',
        'iskolát': 'education',
        'egyetem': 'education',
        'egyetemet': 'education',
        'university': 'education',
        'degree': 'education',
        'diploma': 'education',
        'diplomát': 'education',
        // Blog - blogok
        'blog': 'blog',
        'blogot': 'blog',
        'post': 'blog',
        'posztot': 'blog',
        'cikk': 'blog',
        'cikket': 'blog',
        'article': 'blog',
        'írás': 'blog',
        'írást': 'blog',
        // Contact - kapcsolat
        'contact': 'contact',
        'kapcsolat': 'contact',
        'kapcsolatot': 'contact',
        'email': 'contact',
        'telefon': 'contact',
        'telefont': 'contact',
        'phone': 'contact',
        // Testimonials - vélemények
        'vélemény': 'testimonials',
        'véleményt': 'testimonials',
        'vélemények': 'testimonials',
        'testimonial': 'testimonials',
        'review': 'testimonials',
        'referencia': 'testimonials',
        'referenciát': 'testimonials',
        // Social Links - közösségi linkek
        'közösségi': 'socialLinks',
        'kozossegi': 'socialLinks',
        'social': 'socialLinks',
        'sociallinks': 'socialLinks',
        'facebook': 'socialLinks',
        'twitter': 'socialLinks',
        'linkedin': 'socialLinks',
        'github': 'socialLinks',
        'instagram': 'socialLinks',
        'youtube': 'socialLinks',
        'tiktok': 'socialLinks',
        'link': 'socialLinks',
        'linket': 'socialLinks',
        'linkek': 'socialLinks',
        'profil': 'socialLinks',
        'profilt': 'socialLinks',
    };

    for (const [keyword, slotKey] of Object.entries(keywordMap)) {
        if (lowerText.includes(keyword) && ADMIN_CONFIG[slotKey]) {
            console.log('[detectRequestedSlot] Keyword match! keyword:', keyword, 'slotKey:', slotKey);
            return { slotKey, label: ADMIN_CONFIG[slotKey].label };
        }
    }

    console.log('[detectRequestedSlot] No match found');
    return null;
}
