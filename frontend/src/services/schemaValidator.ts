/**
 * Schema Validator - Zod schemas for validating the CMS configuration
 * 
 * This module provides runtime validation for the dynamically loaded schema,
 * ensuring type safety even when the configuration comes from an external source.
 */

import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════════════════
// FIELD TYPES
// ═══════════════════════════════════════════════════════════════════════════

export const FieldTypeSchema = z.enum([
    'text',
    'textarea',
    'richtext',
    'number',
    'email',
    'url',
    'date',
    'datetime',
    'boolean',
    'select',
    'multiselect',
    'image',
    'gif',
    'gallery',
    'color',
    'json',
    'array',
    'file',
    'slug',
    'map',
    'iframe',
    'blocks',
]);

// ═══════════════════════════════════════════════════════════════════════════
// FIELD CONFIG
// ═══════════════════════════════════════════════════════════════════════════

export const SelectOptionSchema = z.object({
    value: z.string(),
    label: z.string(),
});

export const ValidationSchema = z.object({
    minLength: z.number().optional(),
    maxLength: z.number().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    pattern: z.string().optional(),
}).optional();

export const FileConfigSchema = z.object({
    allowedTypes: z.array(z.string()).optional(),
    maxSizeMB: z.number().optional(),
    secure: z.boolean().optional(),
}).optional();

export const FieldConfigSchema = z.object({
    id: z.string(),
    label: z.string(),
    description: z.string().optional(),
    type: FieldTypeSchema,
    required: z.boolean().optional(),
    placeholder: z.string().optional(),
    defaultValue: z.unknown().optional(),
    helpText: z.string().optional(),
    hidden: z.boolean().optional(),
    disabled: z.boolean().optional(),
    readOnly: z.boolean().optional(),
    localized: z.boolean().optional(), // New i18n support
    validation: ValidationSchema,
    options: z.array(SelectOptionSchema).optional(),
    fileConfig: FileConfigSchema,
    slugSource: z.string().optional(),
    // Massive-specific field options
    searchable: z.boolean().optional(),
    sortable: z.boolean().optional(),
    filterable: z.boolean().optional(),
    columnWidth: z.number().optional(),
    showInTable: z.boolean().optional(),
    // JSON field template (recommendation)
    jsonSchema: z.record(z.string(), z.unknown()).optional(),
});

// ═══════════════════════════════════════════════════════════════════════════
// MASSIVE CONFIG
// ═══════════════════════════════════════════════════════════════════════════

export const QuickFilterSchema = z.object({
    field: z.string(),
    label: z.string(),
    options: z.array(SelectOptionSchema),
});

export const MassiveConfigSchema = z.object({
    pageSize: z.number().optional(),
    defaultSort: z.object({
        field: z.string(),
        direction: z.enum(['asc', 'desc']),
    }).optional(),
    searchFields: z.array(z.string()).optional(),
    quickFilters: z.array(QuickFilterSchema).optional(),
    bulkActions: z.boolean().optional(),
    exportEnabled: z.boolean().optional(),
    importEnabled: z.boolean().optional(),
    encrypted: z.boolean().optional(),
    searchableFields: z.array(z.string()).optional(),
}).optional();

// ═══════════════════════════════════════════════════════════════════════════
// SLOT CONFIG
// ═══════════════════════════════════════════════════════════════════════════

export const SlotTypeSchema = z.enum(['object', 'list', 'collection', 'massive']);

export const SlotConfigSchema = z.object({
    label: z.string(),
    description: z.string().optional(),
    icon: z.string().optional(),
    type: SlotTypeSchema,
    isSitemap: z.boolean().optional(),
    slugField: z.string().optional(),
    publishedField: z.string().optional(),
    fields: z.array(FieldConfigSchema),
    massive: MassiveConfigSchema,
});

// ═══════════════════════════════════════════════════════════════════════════
// LOGGING CONFIG
// ═══════════════════════════════════════════════════════════════════════════

export const LoggingConfigSchema = z.object({
    logActions: z.object({
        create: z.boolean(),
        update: z.boolean(),
        delete: z.boolean(),
        login: z.boolean(),
        logout: z.boolean(),
    }),
    logSlots: z.array(z.string()),
});

// ═══════════════════════════════════════════════════════════════════════════
// CONTENT BATCHING CONFIG
// ═══════════════════════════════════════════════════════════════════════════

export const ContentBatchingConfigSchema = z.object({
    enabled: z.boolean(),
    maxKeysPerBatch: z.number(),
    timeoutMs: z.number(),
});

// ═══════════════════════════════════════════════════════════════════════════
// FULL SCHEMA
// ═══════════════════════════════════════════════════════════════════════════

export const AdminConfigSchema = z.record(z.string(), SlotConfigSchema);

export const FullSchemaSchema = z.object({
    $schema: z.string().optional(),
    $id: z.string().optional(),
    version: z.string(),
    lastModified: z.string().optional(),
    logging: LoggingConfigSchema.optional(),
    contentBatching: ContentBatchingConfigSchema.optional(),
    slots: AdminConfigSchema,
});

// ═══════════════════════════════════════════════════════════════════════════
// TYPE EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export type FieldType = z.infer<typeof FieldTypeSchema>;
export type SelectOption = z.infer<typeof SelectOptionSchema>;
export type FieldConfig = z.infer<typeof FieldConfigSchema>;
export type MassiveConfig = z.infer<typeof MassiveConfigSchema>;
export type SlotConfig = z.infer<typeof SlotConfigSchema>;
export type LoggingConfig = z.infer<typeof LoggingConfigSchema>;
export type ContentBatchingConfig = z.infer<typeof ContentBatchingConfigSchema>;
export type AdminConfig = z.infer<typeof AdminConfigSchema>;
export type FullSchema = z.infer<typeof FullSchemaSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface ValidationResult {
    success: boolean;
    data?: FullSchema;
    errors?: Array<{
        path: string;
        message: string;
        code: string;
    }>;
}

/**
 * Validates the full schema from API response
 */
export function validateSchema(data: unknown): ValidationResult {
    const result = FullSchemaSchema.safeParse(data);

    if (result.success) {
        return {
            success: true,
            data: result.data,
        };
    }

    return {
        success: false,
        errors: result.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
            code: issue.code,
        })),
    };
}

/**
 * Validates just the slots portion of the schema
 */
export function validateAdminConfig(data: unknown): ValidationResult {
    const result = AdminConfigSchema.safeParse(data);

    if (result.success) {
        return {
            success: true,
            data: { version: 'unknown', slots: result.data } as FullSchema,
        };
    }

    return {
        success: false,
        errors: result.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
            code: issue.code,
        })),
    };
}

/**
 * Validates a single slot configuration
 */
export function validateSlotConfig(data: unknown): { success: boolean; data?: SlotConfig; errors?: ValidationResult['errors'] } {
    const result = SlotConfigSchema.safeParse(data);

    if (result.success) {
        return {
            success: true,
            data: result.data,
        };
    }

    return {
        success: false,
        errors: result.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
            code: issue.code,
        })),
    };
}
