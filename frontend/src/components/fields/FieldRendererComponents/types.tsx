import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FieldConfig } from '@/config/admin.config';

// --- INTERFACES ---

export interface PendingImage {
    file: File;
    preview: string;
    _isPending: true;
}

export interface PendingFile {
    file: File;
    _isPendingFile: true;
}

export interface StoredFileInfo {
    filename: string;
    url: string;
    prettyUrl?: string;
    size: number;
    originalName: string;
    encrypted: boolean;
}

export type GalleryItem = string | PendingImage;

export interface FieldRendererProps {
    field: FieldConfig;
    value: any;
    onChange: (value: any) => void;
    disabled?: boolean;
    hasError?: boolean;
}

export interface BaseFieldProps extends FieldRendererProps {
    isDisabled: boolean;
    isReadOnly: boolean;
    safeValue: any;
    hasError?: boolean;
}

// --- TYPE GUARDS ---

export function isPendingImage(value: unknown): value is PendingImage {
    return typeof value === 'object' && value !== null && '_isPending' in value && (value as PendingImage)._isPending === true;
}

export function isPendingFile(value: unknown): value is PendingFile {
    return typeof value === 'object' && value !== null && '_isPendingFile' in value && (value as PendingFile)._isPendingFile === true;
}

// Video types
export interface PendingVideo {
    file: File;
    preview: string;
    _isPendingVideo: true;
}

export function isPendingVideo(value: unknown): value is PendingVideo {
    return typeof value === 'object' && value !== null && '_isPendingVideo' in value && (value as PendingVideo)._isPendingVideo === true;
}

export function getVideoDisplayUrl(value: unknown): string {
    if (isPendingVideo(value)) {
        return value.preview;
    }
    if (typeof value === 'string') {
        return value;
    }
    return '';
}

// Audio types
export interface PendingAudio {
    file: File;
    preview: string;
    _isPendingAudio: true;
}

export function isPendingAudio(value: unknown): value is PendingAudio {
    return typeof value === 'object' && value !== null && '_isPendingAudio' in value && (value as PendingAudio)._isPendingAudio === true;
}

export function getAudioDisplayUrl(value: unknown): string {
    if (isPendingAudio(value)) {
        return value.preview;
    }
    if (typeof value === 'string') {
        return value;
    }
    return '';
}

export function getImageDisplayUrl(value: unknown): string {
    if (isPendingImage(value)) {
        return value.preview;
    }
    if (typeof value === 'string') {
        return value;
    }
    return '';
}

// --- SHARED COMPONENTS ---

export const Label = ({ children, required }: { children: React.ReactNode, required?: boolean }) => (
    <div className="flex items-center gap-2 mb-2" >
        <div className={`w-1 h-1 rounded-full ${required ? 'bg-red-500' : 'bg-foreground'}`} />
        < label className="text-[10px] font-mono uppercase tracking-[0.2em] opacity-60" >
            {children} {required && '*'}
        </label>
    </div>
);

export const InputWrapper = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => (
    <div className={`relative group ${className}`}>
        {children}
    </div>
);

export function SortableGalleryItem({ id, children, disabled }: { id: string, children: React.ReactNode, disabled?: boolean }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : undefined,
        position: 'relative' as 'relative',
        touchAction: 'none'
    };

    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="h-full" >
            {children}
        </div>
    );
}
