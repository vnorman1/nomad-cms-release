/**
 * API Type Definitions
 */

export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    exists?: boolean;
    error?: string;
    message?: string;
}

export interface SlotKey {
    key: string;
    updated_at: string;
}

export interface UploadResponse {
    success: boolean;
    url?: string;
    filename?: string;
    error?: string;
}

export interface DeleteResponse {
    success: boolean;
    message?: string;
    error?: string;
}

// Deep search types
export interface SearchResult {
    slot: string;
    updated_at: string;
    type: 'field' | 'collection_item';
    field: string;
    value: string;
    match: string;
    context: string;
    score: number;
    index?: number;
    itemId?: string | number;
    itemTitle?: string;
}

export interface SearchResponse {
    success: boolean;
    query: string;
    results: SearchResult[];
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
    error?: string;
}
