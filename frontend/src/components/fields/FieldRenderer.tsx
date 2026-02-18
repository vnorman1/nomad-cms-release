import { useEffect, useCallback } from 'react';
import {
    FieldRendererProps,
    // ...
    // (I will use multi_replace or simple replace correctly this time)
    isPendingImage,
    isPendingFile,
    getImageDisplayUrl,
    GalleryItem,
    PendingImage,
    PendingFile,
    StoredFileInfo,
    PendingVideo,
    isPendingVideo,
    BooleanFieldRenderer,
    ImageFieldRenderer,
    GifFieldRenderer,
    GalleryFieldRenderer,
    FileFieldRenderer,
    RichTextFieldRenderer,
    TextareaFieldRenderer,
    MultiselectFieldRenderer,
    SelectFieldRenderer,
    DefaultFieldRenderer,
    SlugFieldRenderer,
    JsonFieldRenderer,
    MapFieldRenderer,
    IframeFieldRenderer,
    BlocksFieldRenderer,
    VideoFieldRenderer,
    AudioFieldRenderer,
    isPendingAudio,
    PendingAudio,
} from './FieldRendererComponents';


// Re-export types for backwards compatibility
export type { PendingImage, PendingFile, StoredFileInfo, GalleryItem, FieldRendererProps, PendingVideo, PendingAudio };
export { isPendingImage, isPendingFile, getImageDisplayUrl, isPendingVideo, isPendingAudio };

export default function FieldRenderer({ field, value, onChange, disabled = false, hasError = false }: FieldRendererProps) {
    // Cleanup blob URLs on unmount to prevent memory leaks
    useEffect(() => {
        return () => {
            if (isPendingImage(value)) {
                URL.revokeObjectURL(value.preview);
            }
            if (isPendingVideo(value)) {
                URL.revokeObjectURL(value.preview);
            }
            if (isPendingAudio(value)) {
                URL.revokeObjectURL(value.preview);
            }
            if (Array.isArray(value)) {
                value.forEach((item: GalleryItem) => {
                    if (isPendingImage(item)) {
                        URL.revokeObjectURL(item.preview);
                    }
                });
            }
        };
    }, []);

    // Hidden check
    if (field.hidden) return null;

    // Shared props
    const isDisabled = disabled || field.disabled;

    // Inner render function for the actual field type
    const renderInnerField = useCallback((props: {
        field: typeof field;
        value: unknown;
        onChange: (val: unknown) => void;
        disabled?: boolean;
        hasError?: boolean;
    }) => {
        const safeValue = props.value ?? (props.field.defaultValue !== undefined ? props.field.defaultValue : '');
        const baseProps = {
            field: props.field,
            value: props.value,
            onChange: props.onChange,
            disabled: props.disabled,
            isDisabled: !!props.disabled || !!props.field.disabled,
            isReadOnly: !!props.field.readOnly,
            safeValue,
            hasError: props.hasError
        };

        switch (props.field.type) {
            case 'boolean':
                return <BooleanFieldRenderer {...baseProps} />;
            case 'image':
                return <ImageFieldRenderer {...baseProps} />;
            case 'gif':
                return <GifFieldRenderer {...baseProps} />;
            case 'gallery':
                return <GalleryFieldRenderer {...baseProps} />;
            case 'file':
                return <FileFieldRenderer {...baseProps} />;
            case 'richtext':
                return <RichTextFieldRenderer {...baseProps} />;
            case 'textarea':
                return <TextareaFieldRenderer {...baseProps} />;
            case 'json':
                return <JsonFieldRenderer {...baseProps} />;
            case 'multiselect':
            case 'array':
                return <MultiselectFieldRenderer {...baseProps} />;
            case 'select':
                return <SelectFieldRenderer {...baseProps} />;
            case 'slug':
                return <SlugFieldRenderer {...baseProps} />;
            case 'map':
                return <MapFieldRenderer {...baseProps} />;
            case 'iframe':
                return <IframeFieldRenderer {...baseProps} />;
            case 'blocks':
                return <BlocksFieldRenderer {...baseProps} value={baseProps.value as any} />;
            case 'video':
                return <VideoFieldRenderer {...baseProps} />;
            case 'audio':
                return <AudioFieldRenderer {...baseProps} />;
            default:
                return <DefaultFieldRenderer {...baseProps} />;
        }
    }, []);



    // Standard non-localized rendering
    return renderInnerField({ field, value, onChange: onChange, disabled: isDisabled, hasError });
}

