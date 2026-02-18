import { BaseFieldProps, InputWrapper } from './types';
import { SmartJsonEditor } from '../SmartJsonEditor';

export default function JsonFieldRenderer({ field, onChange, isDisabled, isReadOnly, safeValue }: BaseFieldProps) {
    // Parse the value - ensure we have a valid object or undefined (to trigger schema template)
    const parsedValue = (() => {
        if (safeValue && typeof safeValue === 'object') {
            // Check if object is empty
            if (Object.keys(safeValue).length === 0) return undefined;
            return safeValue;
        }
        if (typeof safeValue === 'string' && safeValue.trim()) {
            try {
                const parsed = JSON.parse(safeValue);
                // Treat empty parsed object as undefined to trigger schema default
                if (parsed && typeof parsed === 'object' && Object.keys(parsed).length === 0) {
                    return undefined;
                }
                return parsed;
            } catch {
                return undefined;
            }
        }
        return undefined;
    })();

    return (
        <InputWrapper className="space-y-2">
            <SmartJsonEditor
                value={parsedValue}
                onChange={onChange}
                disabled={isDisabled || isReadOnly}
                label={field.label}
                schema={field.jsonSchema}
            />
        </InputWrapper>
    );
}
