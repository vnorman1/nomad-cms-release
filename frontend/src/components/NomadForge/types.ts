/**
 * NomadForge Types
 * Shared type definitions for the Forge ETL tool
 */

export interface ProcessResult {
    success: boolean;
    headers: string[];
    preview: string[][];
    total_rows: number;
    error?: string;
}

export interface MappingRule {
    source: string;
    target: string;
    transform?: TransformType;
}

export type TransformType =
    | 'none'
    | 'uppercase'
    | 'lowercase'
    | 'capitalize'
    | 'trim'
    | 'number'
    | 'date'
    | 'boolean'
    | 'slug'
    | 'phone'
    | 'email'
    | 'url'
    | 'json';

export interface TransformResult {
    success: boolean;
    data: Record<string, string>[];
    error?: string;
}

export interface SuggestedMapping {
    source: string;
    target: string;
    confidence: number;
    suggested_transform: string;
}

export interface SuggestionResult {
    success: boolean;
    suggestions: SuggestedMapping[];
    error?: string;
}

export interface TargetField {
    id: string;
    label: string;
    required: boolean;
    type?: string;
}

export type WasmModule = {
    process_file: (data: Uint8Array, filename: string, previewRows: number) => ProcessResult;
    transform_data: (data: Uint8Array, filename: string, mappingsJson: string) => TransformResult;
    suggest_mappings: (data: Uint8Array, filename: string, targetFieldsJson: string) => SuggestionResult;
    apply_transform: (value: string, transformType: string) => string;
};

export type ForgeStep = 'slot' | 'upload' | 'query' | 'processing' | 'complete';
