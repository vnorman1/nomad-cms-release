// Custom Endpoint Builder Types

export interface CustomEndpoint {
    id: string;
    name: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    path: string;
    description: string;
    headers: Record<string, string>;
    queryParams: Record<string, string>;
    bodyTemplate: string;
    createdAt: string;
    updatedAt: string;
}

export interface RequestHistoryItem {
    id: string;
    endpointId: string;
    endpointName: string;
    method: string;
    url: string;
    headers: Record<string, string>;
    body: string;
    response: any;
    status: number;
    duration: number;
    timestamp: string;
}

export interface SavedCollection {
    id: string;
    name: string;
    description: string;
    endpoints: CustomEndpoint[];
    createdAt: string;
    updatedAt: string;
}
