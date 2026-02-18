/**
 * SmartJsonFieldRenderer - Rekurzív JSON renderer
 * Dinamikusan építi a UI-t a JSON struktúra alapján
 */

import {
    StringField,
    NumberField,
    BooleanField,
    NullField,
    ArrayField,
    ObjectField
} from './components';
import {
    getFieldInfo,
    getValueType,
    getArrayType,
    getDepthStyle
} from './fieldDetection';

interface SmartJsonFieldRendererProps {
    data: unknown;
    onChange: (data: unknown) => void;
    depth?: number;
    fieldKey?: string;
    disabled?: boolean;
}

export function SmartJsonFieldRenderer({
    data,
    onChange,
    depth = 0,
    fieldKey = 'root',
    disabled = false
}: SmartJsonFieldRendererProps) {
    const valueType = getValueType(data);
    const fieldInfo = getFieldInfo(fieldKey);
    const depthStyle = getDepthStyle(depth);

    // Null érték
    if (valueType === 'null') {
        return (
            <NullField
                fieldKey={fieldKey}
                label={fieldInfo.label}
                onChange={(newValue) => onChange(newValue)}
                depth={depth}
                disabled={disabled}
            />
        );
    }

    // Boolean
    if (valueType === 'boolean') {
        return (
            <BooleanField
                fieldKey={fieldKey}
                label={fieldInfo.label}
                value={data as boolean}
                onChange={(newValue) => onChange(newValue)}
                depth={depth}
                disabled={disabled}
            />
        );
    }

    // Number
    if (valueType === 'number') {
        return (
            <NumberField
                fieldKey={fieldKey}
                label={fieldInfo.label}
                value={data as number}
                onChange={(newValue) => onChange(newValue)}
                unit={fieldInfo.unit}
                depth={depth}
                disabled={disabled}
            />
        );
    }

    // String
    if (valueType === 'string') {
        return (
            <StringField
                fieldKey={fieldKey}
                label={fieldInfo.label}
                value={data as string}
                onChange={(newValue) => onChange(newValue)}
                unit={fieldInfo.unit}
                depth={depth}
                disabled={disabled}
            />
        );
    }

    // Array
    if (valueType === 'array') {
        const arr = data as unknown[];
        const arrayType = getArrayType(arr);

        // Primitív tömb → Tag lista
        if (arrayType === 'primitive' || arrayType === 'empty' || arrayType === 'mixed') {
            return (
                <ArrayField
                    fieldKey={fieldKey}
                    label={fieldInfo.label}
                    value={arr.filter(item => typeof item === 'string' || typeof item === 'number') as (string | number)[]}
                    onChange={(newValue) => onChange(newValue)}
                    depth={depth}
                    disabled={disabled}
                />
            );
        }

        // Objektum tömb → Lista collapsible elemekkel
        return (
            <ObjectField
                fieldKey={fieldKey}
                label={fieldInfo.label}
                depth={depth}
                disabled={disabled}
                itemCount={arr.length}
            >
                <div className="space-y-3 pt-2">
                    {arr.map((item, index) => (
                        <div key={index} className="relative pl-2">
                            {/* Item Number Indicator */}
                            <div className="absolute left-0 top-2 text-[9px] font-mono text-muted-foreground/40 select-none">
                                {(index + 1).toString().padStart(2, '0')}
                            </div>

                            <div className="pl-5">
                                <SmartJsonFieldRenderer
                                    data={item}
                                    onChange={(newValue) => {
                                        const newArr = [...arr];
                                        newArr[index] = newValue;
                                        onChange(newArr);
                                    }}
                                    depth={depth + 1}
                                    fieldKey={`${fieldKey}[${index}]`}
                                    disabled={disabled}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </ObjectField>
        );
    }

    // Object
    if (valueType === 'object') {
        const obj = data as Record<string, unknown>;
        const entries = Object.entries(obj);

        // Root level (depth 0) → mezők közvetlenül
        if (depth === 0) {
            return (
                <div className="space-y-4">
                    {entries.map(([key, value]) => (
                        <SmartJsonFieldRenderer
                            key={key}
                            data={value}
                            onChange={(newValue) => {
                                onChange({ ...obj, [key]: newValue });
                            }}
                            depth={depth + 1}
                            fieldKey={key}
                            disabled={disabled}
                        />
                    ))}
                </div>
            );
        }

        // Nested object → Collapsible card
        return (
            <ObjectField
                fieldKey={fieldKey}
                label={fieldInfo.label}
                depth={depth}
                disabled={disabled}
                itemCount={entries.length}
            >
                <div className={`space-y-${depthStyle.compact ? '2' : '3'}`}>
                    {entries.map(([key, value]) => (
                        <SmartJsonFieldRenderer
                            key={key}
                            data={value}
                            onChange={(newValue) => {
                                onChange({ ...obj, [key]: newValue });
                            }}
                            depth={depth + 1}
                            fieldKey={key}
                            disabled={disabled}
                        />
                    ))}
                </div>
            </ObjectField>
        );
    }

    // Fallback - ismeretlen típus
    return (
        <div className="text-xs text-red-500 font-mono">
            Ismeretlen típus: {typeof data}
        </div>
    );
}
