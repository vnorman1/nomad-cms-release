/**
 * NOMAD CMS - HTML/XSS Sanitization Utilities
 * 
 * Centralized sanitization for preventing XSS attacks.
 * Uses a whitelist approach for allowed HTML tags and attributes.
 * 
 * @security CRITICAL - This module prevents XSS injection attacks
 */

// ==========================================
// SAFE HTML ENTITIES ENCODING
// ==========================================

const HTML_ENTITIES: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;',
};

/**
 * Escape HTML special characters to prevent XSS
 * Use this for any user input that will be displayed as text
 */
export function escapeHTML(unsafe: string): string {
    if (typeof unsafe !== 'string') {
        return '';
    }
    return unsafe.replace(/[&<>"'`=/]/g, (char) => HTML_ENTITIES[char] || char);
}

/**
 * Escape for use in HTML attributes
 */
export function escapeAttribute(unsafe: string): string {
    if (typeof unsafe !== 'string') {
        return '';
    }
    return unsafe
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// ==========================================
// RICH TEXT SANITIZATION (Whitelist Approach)
// ==========================================

// Allowed HTML tags for rich text content
const ALLOWED_TAGS = new Set([
    'p', 'br', 'b', 'i', 'u', 'em', 'strong', 'strike', 's',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li',
    'blockquote', 'pre', 'code',
    'a', 'span',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'hr',
]);

// Allowed attributes per tag
const ALLOWED_ATTRIBUTES: Record<string, Set<string>> = {
    'a': new Set(['href', 'target', 'rel', 'title']),
    'span': new Set(['class']),
    'code': new Set(['class']),
    'pre': new Set(['class']),
    'th': new Set(['colspan', 'rowspan']),
    'td': new Set(['colspan', 'rowspan']),
};

// Dangerous attribute patterns (event handlers, javascript:, etc.)
const DANGEROUS_PATTERNS = [
    /^on\w+/i,                    // Event handlers (onclick, onerror, etc.)
    /^javascript:/i,              // JavaScript protocol
    /^data:/i,                    // Data URLs (can contain scripts)
    /^vbscript:/i,                // VBScript protocol
    /expression\s*\(/i,           // CSS expression
    /url\s*\(/i,                  // CSS url() in attributes
];

/**
 * Check if a URL is safe (no javascript:, data:, etc.)
 */
function isSafeURL(url: string): boolean {
    const trimmed = url.trim().toLowerCase();
    return (
        trimmed.startsWith('http://') ||
        trimmed.startsWith('https://') ||
        trimmed.startsWith('/') ||
        trimmed.startsWith('#') ||
        trimmed.startsWith('mailto:')
    );
}

/**
 * Check if an attribute value is safe
 */
function isSafeAttributeValue(name: string, value: string): boolean {
    const lowerName = name.toLowerCase();
    const lowerValue = value.toLowerCase();
    
    // Check for dangerous patterns
    for (const pattern of DANGEROUS_PATTERNS) {
        if (pattern.test(lowerValue)) {
            return false;
        }
    }
    
    // Special check for href/src attributes
    if (lowerName === 'href' || lowerName === 'src') {
        return isSafeURL(value);
    }
    
    return true;
}

/**
 * Sanitize HTML content using whitelist approach
 * Removes dangerous tags, attributes, and scripts
 * 
 * @param dirty - Untrusted HTML string
 * @returns Sanitized HTML string safe for rendering
 */
export function sanitizeHTML(dirty: string): string {
    if (typeof dirty !== 'string' || !dirty.trim()) {
        return '';
    }
    
    // Create a DOM parser to safely parse HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(dirty, 'text/html');
    
    // Process all elements recursively
    const cleanNode = (node: Node): Node | null => {
        // Text nodes are safe
        if (node.nodeType === Node.TEXT_NODE) {
            return node.cloneNode(true);
        }
        
        // Only process element nodes
        if (node.nodeType !== Node.ELEMENT_NODE) {
            return null;
        }
        
        const element = node as Element;
        const tagName = element.tagName.toLowerCase();
        
        // Remove disallowed tags entirely (script, style, iframe, etc.)
        if (!ALLOWED_TAGS.has(tagName)) {
            // For disallowed tags, only keep text content
            const fragment = document.createDocumentFragment();
            element.childNodes.forEach(child => {
                const cleaned = cleanNode(child);
                if (cleaned) {
                    fragment.appendChild(cleaned);
                }
            });
            return fragment;
        }
        
        // Create clean element
        const cleanElement = document.createElement(tagName);
        
        // Copy only allowed attributes
        const allowedAttrs = ALLOWED_ATTRIBUTES[tagName] || new Set();
        
        for (const attr of Array.from(element.attributes)) {
            const attrName = attr.name.toLowerCase();
            
            // Skip event handlers and disallowed attributes
            if (attrName.startsWith('on')) continue;
            if (!allowedAttrs.has(attrName)) continue;
            if (!isSafeAttributeValue(attrName, attr.value)) continue;
            
            cleanElement.setAttribute(attrName, attr.value);
        }
        
        // For links, always add rel="noopener noreferrer" for security
        if (tagName === 'a' && cleanElement.hasAttribute('href')) {
            if (cleanElement.getAttribute('target') === '_blank') {
                cleanElement.setAttribute('rel', 'noopener noreferrer');
            }
        }
        
        // Recursively clean children
        element.childNodes.forEach(child => {
            const cleaned = cleanNode(child);
            if (cleaned) {
                cleanElement.appendChild(cleaned);
            }
        });
        
        return cleanElement;
    };
    
    // Clean the body content
    const fragment = document.createDocumentFragment();
    doc.body.childNodes.forEach(child => {
        const cleaned = cleanNode(child);
        if (cleaned) {
            fragment.appendChild(cleaned);
        }
    });
    
    // Serialize back to string
    const temp = document.createElement('div');
    temp.appendChild(fragment);
    return temp.innerHTML;
}

// ==========================================
// JSON SYNTAX HIGHLIGHTING (XSS-SAFE)
// ==========================================

interface HighlightedToken {
    type: 'key' | 'string' | 'number' | 'boolean' | 'null' | 'punctuation';
    value: string;
}

/**
 * Tokenize JSON string for safe syntax highlighting
 * Returns array of tokens instead of HTML string
 */
export function tokenizeJSON(json: string): HighlightedToken[] {
    const tokens: HighlightedToken[] = [];
    let i = 0;
    
    const addToken = (type: HighlightedToken['type'], value: string) => {
        tokens.push({ type, value });
    };
    
    while (i < json.length) {
        const char = json[i];
        
        // Skip whitespace but preserve it
        if (/\s/.test(char)) {
            let ws = '';
            while (i < json.length && /\s/.test(json[i])) {
                ws += json[i];
                i++;
            }
            addToken('punctuation', ws);
            continue;
        }
        
        // Punctuation
        if ('{}[],:'.includes(char)) {
            addToken('punctuation', char);
            i++;
            continue;
        }
        
        // String (key or value)
        if (char === '"') {
            let str = '"';
            i++;
            while (i < json.length && json[i] !== '"') {
                if (json[i] === '\\' && i + 1 < json.length) {
                    str += json[i] + json[i + 1];
                    i += 2;
                } else {
                    str += json[i];
                    i++;
                }
            }
            str += '"';
            i++;
            
            // Check if it's a key (followed by :)
            const nextNonWs = json.slice(i).match(/^\s*:/);
            if (nextNonWs) {
                addToken('key', str);
            } else {
                addToken('string', str);
            }
            continue;
        }
        
        // Number
        if (/[-\d]/.test(char)) {
            let num = '';
            while (i < json.length && /[-\d.eE+]/.test(json[i])) {
                num += json[i];
                i++;
            }
            addToken('number', num);
            continue;
        }
        
        // Boolean or null
        if (json.slice(i, i + 4) === 'true') {
            addToken('boolean', 'true');
            i += 4;
            continue;
        }
        if (json.slice(i, i + 5) === 'false') {
            addToken('boolean', 'false');
            i += 5;
            continue;
        }
        if (json.slice(i, i + 4) === 'null') {
            addToken('null', 'null');
            i += 4;
            continue;
        }
        
        // Unknown character - skip
        i++;
    }
    
    return tokens;
}

/**
 * Get CSS class for token type (for use with React spans)
 */
export function getTokenClass(type: HighlightedToken['type']): string {
    const classMap: Record<string, string> = {
        key: 'text-purple-400',
        string: 'text-amber-300',
        number: 'text-blue-400',
        boolean: 'text-emerald-400',
        null: 'text-red-400',
        punctuation: 'text-zinc-500',
    };
    return classMap[type] || '';
}

// ==========================================
// MARKDOWN SANITIZATION
// ==========================================

/**
 * Pre-process markdown to remove potentially dangerous content
 * Run BEFORE parsing with marked/similar library
 */
export function sanitizeMarkdownInput(markdown: string): string {
    if (typeof markdown !== 'string') {
        return '';
    }
    
    return markdown
        // Remove HTML script tags
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        // Remove HTML style tags
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        // Remove HTML comments (can contain IE conditional attacks)
        .replace(/<!--[\s\S]*?-->/g, '')
        // Remove event handlers in any remaining HTML
        .replace(/\bon\w+\s*=\s*(['"])[^'"]*\1/gi, '')
        // Remove javascript: URLs
        .replace(/javascript:/gi, '')
        // Remove data: URLs in markdown images/links
        .replace(/\]\(data:[^)]+\)/gi, ']()')
        // Remove vbscript: URLs
        .replace(/vbscript:/gi, '');
}

// ==========================================
// URL SANITIZATION
// ==========================================

/**
 * Sanitize a URL to prevent javascript: and other dangerous protocols
 */
export function sanitizeURL(url: string): string {
    if (typeof url !== 'string') {
        return '';
    }
    
    const trimmed = url.trim();
    
    // Allow safe protocols
    if (
        trimmed.startsWith('http://') ||
        trimmed.startsWith('https://') ||
        trimmed.startsWith('/') ||
        trimmed.startsWith('#') ||
        trimmed.startsWith('mailto:') ||
        trimmed.startsWith('tel:')
    ) {
        return trimmed;
    }
    
    // Reject everything else
    return '';
}

// ==========================================
// EXPORT DEFAULT SANITIZER
// ==========================================

export default {
    escapeHTML,
    escapeAttribute,
    sanitizeHTML,
    sanitizeMarkdownInput,
    sanitizeURL,
    tokenizeJSON,
    getTokenClass,
};
