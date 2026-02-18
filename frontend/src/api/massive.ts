/**
 * Massive Data API
 * 
 * API szolgáltatás nagy adatmennyiségre optimalizált 'massive' típusú slotokhoz.
 * Támogatja: pagination, sorting, filtering, search, bulk operations, CSV export.
 */
import { apiClient } from './client';
import { getSlotHeaders } from '@/lib/slotSigning';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface MassiveRecord<T = Record<string, unknown>> {
    id: number;
    data: T;
    created_at: string;
    updated_at: string;
}

export interface MassivePaginatedResponse<T = Record<string, unknown>> {
    success: boolean;
    items: MassiveRecord<T>[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    // Encryption info (only present for encrypted slots)
    isEncrypted?: boolean;
    searchDisabled?: boolean;
    filterDisabled?: boolean;
    sortDisabled?: boolean;
    // Blind indexing info (for encrypted slots with searchable fields)
    blindIndexEnabled?: boolean;
    searchableFields?: string[];
}

export interface MassiveStats {
    total: number;
    oldest: string | null;
    newest: string | null;
    last_updated: string | null;
}

export interface MassiveListParams {
    page?: number;
    pageSize?: number;
    sort?: string;
    dir?: 'asc' | 'desc';
    search?: string;
    filters?: Record<string, string | number | boolean>;
}

export interface MassiveCreateParams<T = Record<string, unknown>> {
    slot: string;
    data: T;
}

export interface MassiveUpdateParams<T = Record<string, unknown>> {
    slot: string;
    id: number;
    data: T;
}

export interface MassiveBulkInsertParams<T = Record<string, unknown>> {
    slot: string;
    bulk: T[];
}

// ═══════════════════════════════════════════════════════════════════════════
// API FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get paginated list of records
 */
export async function getMassiveList<T = Record<string, unknown>>(
    slot: string,
    params: MassiveListParams = {}
): Promise<MassivePaginatedResponse<T>> {
    const queryParams: Record<string, string | number> = {
        slot,
        page: params.page ?? 1,
        pageSize: params.pageSize ?? 50,
    };

    if (params.sort) {
        queryParams.sort = params.sort;
    }
    if (params.dir) {
        queryParams.dir = params.dir;
    }
    if (params.search) {
        queryParams.search = params.search;
    }

    // Add filters as filter[field]=value
    if (params.filters) {
        for (const [field, value] of Object.entries(params.filters)) {
            if (value !== undefined && value !== null && value !== '') {
                queryParams[`filter[${field}]`] = String(value);
            }
        }
    }

    // Get signed slot config headers
    const slotHeaders = await getSlotHeaders(slot);

    const response = await apiClient.get<MassivePaginatedResponse<T>>(
        '/endpoints/massive.php',
        {
            params: queryParams,
            headers: slotHeaders,
        }
    );

    return response.data;
}

/**
 * Get single record by ID
 */
export async function getMassiveRecord<T = Record<string, unknown>>(
    slot: string,
    id: number
): Promise<MassiveRecord<T> | null> {
    try {
        const slotHeaders = await getSlotHeaders(slot);
        const response = await apiClient.get<{ success: boolean; record: MassiveRecord<T> }>(
            '/endpoints/massive.php',
            {
                params: { slot, id },
                headers: slotHeaders,
            }
        );

        if (response.data.success) {
            return response.data.record;
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Get statistics for a massive slot
 */
export async function getMassiveStats(slot: string): Promise<MassiveStats | null> {
    try {
        const response = await apiClient.get<{ success: boolean; stats: MassiveStats }>(
            '/endpoints/massive.php',
            { params: { slot, stats: 1 } }
        );

        if (response.data.success) {
            return response.data.stats;
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Create a new record
 */
export async function createMassiveRecord<T = Record<string, unknown>>(
    slot: string,
    data: T
): Promise<{ id: number } | null> {
    try {
        const slotHeaders = await getSlotHeaders(slot);
        const response = await apiClient.post<{ success: boolean; id: number }>(
            '/endpoints/massive.php',
            { slot, data },
            { headers: slotHeaders }
        );

        if (response.data.success) {
            return { id: response.data.id };
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Update an existing record
 */
export async function updateMassiveRecord<T = Record<string, unknown>>(
    slot: string,
    id: number,
    data: T
): Promise<boolean> {
    try {
        const slotHeaders = await getSlotHeaders(slot);
        const response = await apiClient.put<{ success: boolean }>(
            '/endpoints/massive.php',
            { slot, id, data },
            { headers: slotHeaders }
        );

        return response.data.success;
    } catch {
        return false;
    }
}

/**
 * Delete a single record
 */
export async function deleteMassiveRecord(slot: string, id: number): Promise<boolean> {
    try {
        const response = await apiClient.delete<{ success: boolean }>(
            '/endpoints/massive.php',
            { params: { slot, id } }
        );

        return response.data.success;
    } catch {
        return false;
    }
}

/**
 * Bulk delete multiple records
 */
export async function bulkDeleteMassiveRecords(
    slot: string,
    ids: number[]
): Promise<{ deleted: number }> {
    try {
        const response = await apiClient.delete<{ success: boolean; deleted: number }>(
            '/endpoints/massive.php',
            { params: { slot, ids: ids.join(',') } }
        );

        return { deleted: response.data.deleted ?? 0 };
    } catch {
        return { deleted: 0 };
    }
}

/**
 * Bulk insert multiple records
 */
export async function bulkInsertMassiveRecords<T = Record<string, unknown>>(
    slot: string,
    records: T[]
): Promise<{ inserted: number }> {
    try {
        const slotHeaders = await getSlotHeaders(slot);
        const response = await apiClient.post<{ success: boolean; inserted: number }>(
            '/endpoints/massive.php',
            { slot, bulk: records, data: {} },
            { headers: slotHeaders }
        );

        return { inserted: response.data.inserted ?? 0 };
    } catch {
        return { inserted: 0 };
    }
}

/**
 * Export all records as CSV (triggers download with auth)
 */
export async function exportMassiveCSV(
    slot: string,
    sort?: string,
    dir?: 'asc' | 'desc'
): Promise<void> {
    const params = new URLSearchParams({
        slot,
        export: 'csv',
    });

    if (sort) {
        params.set('sort', sort);
    }
    if (dir) {
        params.set('dir', dir);
    }

    try {
        // Use apiClient for auth headers
        const response = await apiClient.get<Blob>(
            `/endpoints/massive.php`,
            {
                params: Object.fromEntries(params),
                responseType: 'blob',
            }
        );

        // Check if we got an error response (JSON) instead of CSV
        const contentType = response.headers['content-type'];
        if (contentType && contentType.includes('application/json')) {
            // Server returned JSON error - read it from the blob
            const text = await response.data.text();
            try {
                const errorData = JSON.parse(text);
                throw new Error(errorData.error || 'Export failed');
            } catch {
                throw new Error('Export failed: Unexpected response');
            }
        }

        // Create blob URL and trigger download
        const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${slot}_export_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
    } catch (error) {
        console.error('CSV export failed:', error);
        throw error;
    }
}

/**
 * Export records as JSON (client-side)
 */
export async function exportMassiveJSON<T = Record<string, unknown>>(
    slot: string,
    sort?: string,
    dir?: 'asc' | 'desc'
): Promise<MassiveRecord<T>[]> {
    // Fetch all by requesting a very high page size
    // For truly massive datasets, you'd want to paginate this
    let allItems: MassiveRecord<T>[] = [];
    let page = 1;
    const pageSize = 200;
    let hasMore = true;

    while (hasMore) {
        const response = await getMassiveList<T>(slot, {
            page,
            pageSize,
            sort,
            dir,
        });

        allItems = [...allItems, ...response.items];
        hasMore = page < response.totalPages;
        page++;
    }

    return allItems;
}

/**
 * Import records from CSV (client-side parsing)
 */
export async function importMassiveCSV(
    slot: string,
    file: File
): Promise<{ inserted: number; errors: string[] }> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = async (e) => {
            try {
                const text = e.target?.result as string;
                if (!text) {
                    throw new Error('Empty file');
                }

                // Parse CSV
                const rows = parseCSV(text);
                if (rows.length === 0) {
                    throw new Error('No data found in CSV');
                }

                // Extract headers
                const headers = Object.keys(rows[0]).filter(k => k !== 'id' && k !== 'created_at' && k !== 'updated_at');

                // Prepare data for API (clean up objects)
                const buildData = rows.map(row => {
                    const cleanRow: Record<string, unknown> = {};
                    headers.forEach(header => {
                        if (row[header] !== undefined) {
                            cleanRow[header] = row[header];
                        }
                    });
                    return cleanRow;
                });

                // Send to API in chunks of 500 to avoid payload limits
                const chunkSize = 500;
                let totalInserted = 0;

                for (let i = 0; i < buildData.length; i += chunkSize) {
                    const chunk = buildData.slice(i, i + chunkSize);
                    const result = await bulkInsertMassiveRecords(slot, chunk);
                    totalInserted += result.inserted;
                }

                resolve({ inserted: totalInserted, errors: [] });
            } catch (error) {
                reject(error);
            }
        };

        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsText(file);
    });
}

/**
 * Simple CSV Parser helper
 * Handles basic quotes and commas
 */
function parseCSV(text: string): Record<string, string>[] {
    const lines = text.split(/\r\n|\n/).filter(line => line.trim() !== '');
    if (lines.length < 2) return [];

    // Parse header
    const headers = parseCSVLine(lines[0]);

    const result: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length === headers.length) {
            const row: Record<string, string> = {};
            headers.forEach((header, index) => {
                row[header] = values[index]?.trim() || '';
            });
            result.push(row);
        }
    }

    return result;
}

/**
 * Parse a single CSV line handling quotes
 */
function parseCSVLine(line: string): string[] {
    const values: string[] = [];
    let currentValue = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                // Escaped quote
                currentValue += '"';
                i++;
            } else {
                // Toggle quotes
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            // End of value
            values.push(currentValue);
            currentValue = '';
        } else {
            currentValue += char;
        }
    }

    values.push(currentValue); // Push last value
    return values;
}
