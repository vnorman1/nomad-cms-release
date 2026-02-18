import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind CSS classes with clsx
 */
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/**
 * Generate a slug from a string
 */
export function slugify(text: string): string {
    return text
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/**
 * Format a date string
 */
export function formatDate(date: string | Date, locale = 'en-US'): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString(locale, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
}

/**
 * Format relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(date: string | Date): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - d.getTime()) / 1000);

    const intervals: [number, string, string][] = [
        [31536000, 'year', 'years'],
        [2592000, 'month', 'months'],
        [86400, 'day', 'days'],
        [3600, 'hour', 'hours'],
        [60, 'minute', 'minutes'],
        [1, 'second', 'seconds'],
    ];

    for (const [seconds, singular, plural] of intervals) {
        const count = Math.floor(diffInSeconds / seconds);
        if (count >= 1) {
            return `${count} ${count === 1 ? singular : plural} ago`;
        }
    }

    return 'just now';
}

/**
 * Truncate text to a specified length
 */
export function truncate(text: string, length: number, suffix = '...'): string {
    if (text.length <= length) return text;
    return text.slice(0, length).trim() + suffix;
}

/**
 * Debounce a function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
    fn: T,
    delay: number
): (...args: Parameters<T>) => void {
    let timeoutId: ReturnType<typeof setTimeout>;

    return (...args: Parameters<T>) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    };
}

/**
 * Generate a unique ID
 */
export function generateId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

/**
 * Parse comma-separated string to array
 */
export function parseCommaSeparated(value: string): string[] {
    return value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}

/**
 * Capitalize first letter
 */
export function capitalize(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Check if a value is empty
 */
export function isEmpty(value: unknown): boolean {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string') return value.trim() === '';
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return Object.keys(value).length === 0;
    return false;
}

/**
 * Deep clone an object
 */
export function deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Get nested value from object using dot notation
 */
export function getNestedValue<T = unknown>(
    obj: Record<string, unknown>,
    path: string
): T | undefined {
    return path.split('.').reduce<unknown>((current, key) => {
        if (current && typeof current === 'object' && key in current) {
            return (current as Record<string, unknown>)[key];
        }
        return undefined;
    }, obj) as T | undefined;
}

/**
 * Set nested value in object using dot notation
 */
export function setNestedValue(
    obj: Record<string, unknown>,
    path: string,
    value: unknown
): void {
    const keys = path.split('.');
    const lastKey = keys.pop()!;

    const target = keys.reduce<Record<string, unknown>>((current, key) => {
        if (!(key in current) || typeof current[key] !== 'object') {
            current[key] = {};
        }
        return current[key] as Record<string, unknown>;
    }, obj);

    target[lastKey] = value;
}
