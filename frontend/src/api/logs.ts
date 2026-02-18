/**
 * NOMAD CMS - Logs API Client
 */

import { apiClient } from './index';

export interface LogEntry {
    timestamp: string;
    level: string;
    message: string;
}

export interface LogStats {
    sizeBytes: number;
    sizeKB: number;
    sizeMB: number;
    lineCount: number;
    maxSizeMB: number;
}

export interface LogsResponse {
    success: boolean;
    logs: LogEntry[];
    total: number;
    hasMore: boolean;
    stats: LogStats;
}

export interface LogsParams {
    level?: string;
    search?: string;
    limit?: number;
    offset?: number;
}

export const fetchLogs = async (params?: LogsParams): Promise<LogsResponse> => {
    const queryParams = new URLSearchParams();
    if (params?.level) queryParams.set('level', params.level);
    if (params?.search) queryParams.set('search', params.search);
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    if (params?.offset) queryParams.set('offset', params.offset.toString());

    const query = queryParams.toString();
    const url = `/endpoints/system/logs.php${query ? `?${query}` : ''}`;

    const response = await apiClient.get(url);
    return response.data;
};

export const clearLogs = async (): Promise<{ success: boolean; message: string }> => {
    const response = await apiClient.delete('/endpoints/system/logs.php');
    return response.data;
};
