/**
 * ForgeTab - Nomad Forge ETL Tool
 * Refactored with slot selection, WASM intelligent mapping, and advanced mode
 */

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Maximize2 } from 'lucide-react';
import { TabProps } from './types';
import { ADMIN_CONFIG } from '@/config/admin.config';
import {
    FileDropZone,
    DataPreview,
    QueryBuilder,
    MigrationComplete,
    ProcessingOverlay,
    SlotSelector,
    SlotOption,
    AdvancedQueryModal,
    ProcessResult,
    MappingRule,
    WasmModule,
    ForgeStep,
    TargetField,
    TransformType,
    getLocalFolderHandle,
    clearLocalFolderHandle,
    uploadImagesFromLocalFolder,
} from '../NomadForge';

export function ForgeTab({ setError, setSuccess }: TabProps) {
    const [step, setStep] = useState<ForgeStep>('slot');
    const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
    const [file, setFile] = useState<File | null>(null);
    const [fileData, setFileData] = useState<Uint8Array | null>(null);
    const [processResult, setProcessResult] = useState<ProcessResult | null>(null);
    const [mappings, setMappings] = useState<MappingRule[]>([]);
    const [processing, setProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [processingStage, setProcessingStage] = useState<'transform' | 'encrypt' | 'upload' | 'complete'>('transform');
    const [wasm, setWasm] = useState<WasmModule | null>(null);
    const [wasmLoading, setWasmLoading] = useState(false);
    const [recordCount, setRecordCount] = useState(0);
    const [showAdvanced, setShowAdvanced] = useState(false);

    // Image source settings
    const [imageSourceDir, setImageSourceDir] = useState('');
    const [imageBaseUrl, setImageBaseUrl] = useState('');

    // Get ALL slots from admin config (not just massive)
    // Supports: massive, list, collection, object
    const allSlots: SlotOption[] = useMemo(() => {
        return Object.entries(ADMIN_CONFIG)
            .filter(([_, config]) => ['massive', 'list', 'collection', 'object'].includes(config.type))
            .map(([id, config]) => ({
                id,
                label: config.label,
                description: config.description,
                icon: config.icon,
                fieldCount: config.fields.length,
                encrypted: config.massive?.encrypted,
                slotType: config.type as 'massive' | 'list' | 'collection' | 'object',
            }));
    }, []);

    // Get target fields for selected slot
    const targetFields: TargetField[] = useMemo(() => {
        if (!selectedSlot) return [];
        const slotConfig = ADMIN_CONFIG[selectedSlot];
        if (!slotConfig) return [];
        return slotConfig.fields.map(f => ({
            id: f.id,
            label: f.label,
            required: f.required || false,
            type: f.type,
        }));
    }, [selectedSlot]);

    // Load WASM module on mount
    useEffect(() => {
        const loadWasm = async () => {
            setWasmLoading(true);
            try {
                const wasmModule = await import('@/wasm-lib/nomad-forge/nomad_forge_rust');
                await wasmModule.default();
                setWasm(wasmModule as unknown as WasmModule);
            } catch (err) {
                console.error('WASM load error:', err);
                setError('WASM modul betöltése sikertelen');
            } finally {
                setWasmLoading(false);
            }
        };
        loadWasm();
    }, [setError]);

    const handleSlotSelect = (slotId: string) => {
        setSelectedSlot(slotId);
        setStep('upload');
    };

    const handleFileSelect = async (selectedFile: File) => {
        if (!wasm || !selectedSlot) {
            setError('WASM modul vagy slot nincs kiválasztva');
            return;
        }

        const ext = selectedFile.name.toLowerCase();
        if (!ext.endsWith('.xlsx') && !ext.endsWith('.xls') && !ext.endsWith('.csv') && !ext.endsWith('.json')) {
            setError('Csak XLSX, CSV vagy JSON fájlok támogatottak');
            return;
        }

        setFile(selectedFile);
        setProcessing(true);
        setProgress(10);

        try {
            // Read file as ArrayBuffer
            const buffer = await selectedFile.arrayBuffer();
            const data = new Uint8Array(buffer);
            setFileData(data);
            setProgress(30);

            // Process with WASM
            const result = wasm.process_file(data, selectedFile.name, 10);
            setProgress(50);

            if (result.success) {
                setProcessResult(result);

                // Use WASM for intelligent mapping suggestions
                const targetFieldIds = targetFields.map(f => f.id);
                const suggestions = wasm.suggest_mappings(
                    data,
                    selectedFile.name,
                    JSON.stringify(targetFieldIds)
                );

                setProgress(80);

                if (suggestions.success) {
                    // Initialize mappings from WASM suggestions
                    const initialMappings: MappingRule[] = suggestions.suggestions.map(s => ({
                        source: s.source,
                        target: s.target,
                        transform: (s.suggested_transform || 'none') as TransformType,
                    }));
                    setMappings(initialMappings);
                } else {
                    // Fallback: Initialize empty mappings
                    setMappings(result.headers.map(h => ({
                        source: h,
                        target: '',
                        transform: 'none' as TransformType,
                    })));
                }

                setProgress(100);

                // Auto-advance after short delay
                setTimeout(() => {
                    setProcessing(false);
                }, 300);
            } else {
                setError(result.error || 'Fájl feldolgozása sikertelen');
                setProcessing(false);
            }
        } catch (err) {
            console.error('File process error:', err);
            setError('Fájl feldolgozása sikertelen');
            setProcessing(false);
        }
    };

    const handleStartMigration = async () => {
        if (!wasm || !fileData || !file || !selectedSlot) return;

        const activeMappings = mappings.filter(m => m.target);
        if (activeMappings.length === 0) {
            setError('Legalább egy oszlop párosítása szükséges');
            return;
        }

        // Validate that all target fields exist in the slot schema
        const validTargetIds = targetFields.map(f => f.id);
        const invalidMappings = activeMappings.filter(m => !validTargetIds.includes(m.target));

        if (invalidMappings.length > 0) {
            const invalidTargets = invalidMappings.map(m => m.target).join(', ');
            setError(`A következő mezők nem léteznek a "${ADMIN_CONFIG[selectedSlot]?.label}" slotban: ${invalidTargets}`);
            return;
        }

        setShowAdvanced(false);
        setProcessing(true);
        setProgress(0);
        setProcessingStage('transform');

        try {
            // Stage 1: Transform data with WASM
            setProgress(10);
            const mappingsJson = JSON.stringify(activeMappings);
            console.log('[Forge] Active mappings:', activeMappings);
            const result = wasm.transform_data(fileData, file.name, mappingsJson);
            console.log('[Forge] transform_data result:', result);
            console.log('[Forge] First 3 records:', result.data?.slice(0, 3));

            if (!result.success) {
                setError(result.error || 'Átalakítás sikertelen');
                setProcessing(false);
                return;
            }

            setProgress(20);
            setRecordCount(result.data.length);

            // Stage 2: Handshake - Get server public key
            setProcessingStage('encrypt');
            setProgress(25);

            const { fetchServerPublicKey, encryptJsonData, prepareChunkedUpload, uploadChunk, finalizeUpload } = await import('../NomadForge/ForgeEncryption');

            const handshake = await fetchServerPublicKey();
            if (!handshake.success) {
                throw new Error(handshake.error || 'Handshake sikertelen');
            }
            setProgress(30);

            // Stage 3: Convert Map objects to plain objects (WASM serde_wasm_bindgen returns Maps)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let plainData = result.data.map((item: any) => {
                if (item instanceof Map) {
                    return Object.fromEntries(item);
                }
                return item;
            });
            console.log('[Forge] Converted to plain objects:', plainData.slice(0, 3));

            // Stage 3b: Upload local images if folder was selected (BEFORE encryption!)
            const localFolder = getLocalFolderHandle();
            if (localFolder) {
                setProgress(32);
                console.log('[Forge] Local folder detected, uploading images BEFORE encryption...');

                // Extract image field values from the data
                const imageFields = targetFields.filter(f => 
                    f.type && ['image', 'gif', 'gallery'].includes(f.type)
                );
                const imageFieldIds = imageFields.map(f => f.id);
                
                // Collect all image names from the transformed data
                const imageNames: string[] = [];
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                plainData.forEach((record: any) => {
                    imageFieldIds.forEach(fieldId => {
                        const value = record[fieldId];
                        if (value && typeof value === 'string') {
                            // Handle both single images and galleries (comma-separated)
                            value.split(',').forEach((v: string) => {
                                const trimmed = v.trim();
                                if (trimmed) imageNames.push(trimmed);
                            });
                        }
                    });
                });

                if (imageNames.length > 0) {
                    console.log(`[Forge] Found ${imageNames.length} image references to upload`);
                    setProgress(33);
                    
                    const uploadResult = await uploadImagesFromLocalFolder(
                        localFolder,
                        imageNames,
                        selectedSlot,
                        (progress, status) => {
                            // Map 33-38% progress range
                            const mappedProgress = 33 + (progress / 100) * 5;
                            setProgress(Math.round(mappedProgress));
                            console.log(`[Forge] ${status}`);
                        }
                    );

                    console.log('[Forge] Local upload result:', uploadResult);
                    
                    // UPDATE plainData with new image paths!
                    if (Object.keys(uploadResult.mapping).length > 0) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        plainData = plainData.map((record: any) => {
                            const updatedRecord = { ...record };
                            imageFieldIds.forEach(fieldId => {
                                const value = record[fieldId];
                                if (value && typeof value === 'string') {
                                    // Check if this is a gallery (comma-separated) or single image
                                    if (value.includes(',')) {
                                        // Gallery: update each image path
                                        const updatedPaths = value.split(',').map((v: string) => {
                                            const trimmed = v.trim();
                                            const filename = trimmed.split('/').pop() || trimmed;
                                            // Check if we have a mapping for this filename
                                            return uploadResult.mapping[filename] || uploadResult.mapping[trimmed] || trimmed;
                                        });
                                        updatedRecord[fieldId] = updatedPaths.join(',');
                                    } else {
                                        // Single image
                                        const filename = value.split('/').pop() || value;
                                        updatedRecord[fieldId] = uploadResult.mapping[filename] || uploadResult.mapping[value] || value;
                                    }
                                }
                            });
                            return updatedRecord;
                        });
                        console.log('[Forge] Updated plainData with uploaded image paths:', plainData.slice(0, 3));
                    }

                    if (uploadResult.errors.length > 0) {
                        console.warn('[Forge] Some images failed:', uploadResult.errors);
                    }
                }

                // Clear the folder handle after use
                clearLocalFolderHandle();
            }
            
            setProgress(40);

            // Stage 4: Encrypt data with crypto_box_seal
            const encryptedBase64 = encryptJsonData(plainData, handshake.publicKey);
            const encryptedData = new TextEncoder().encode(encryptedBase64);

            // Stage 4: Prepare chunks
            setProcessingStage('upload');
            const { chunks, metadata } = await prepareChunkedUpload(
                encryptedData,
                handshake.sessionId,
                512 * 1024 // 512KB chunks
            );
            setProgress(45);

            // Stage 5: Upload chunks
            const chunkCount = chunks.length;
            for (let i = 0; i < chunkCount; i++) {
                const chunkResult = await uploadChunk(chunks[i], metadata[i]);

                if (!chunkResult.success) {
                    throw new Error(chunkResult.error || `Chunk ${i} feltöltése sikertelen`);
                }

                // Progress from 45% to 90%
                const chunkProgress = 45 + ((i + 1) / chunkCount) * 45;
                setProgress(Math.round(chunkProgress));
            }

            // Stage 6: Finalize upload
            setProgress(92);
            const finalResult = await finalizeUpload(
                handshake.sessionId,
                selectedSlot,
                chunkCount,
                imageSourceDir || undefined,
                imageBaseUrl || undefined
            );

            if (!finalResult.success) {
                throw new Error(finalResult.error || 'Véglegesítés sikertelen');
            }

            // Process queued images in background (for remote URL images)
            // This handles cases where images were queued instead of downloaded synchronously
            try {
                const { processImageQueue } = await import('../NomadForge/ForgeEncryption');
                await processImageQueue(handshake.sessionId, 20); // Process up to 20 images
            } catch (queueError) {
                console.warn('[Forge] Queue processing failed, images will be processed in background:', queueError);
                // Don't fail the migration, piggyback processing will handle remaining images
            }

            // Complete
            setProgress(100);
            setProcessingStage('complete');
            await new Promise(r => setTimeout(r, 300));

            setStep('complete');
            setSuccess(`${finalResult.recordCount || result.data.length} rekord sikeresen importálva a "${ADMIN_CONFIG[selectedSlot]?.label}" slotba`);
        } catch (err) {
            console.error('Migration error:', err);
            setError(err instanceof Error ? err.message : 'Migráció sikertelen');
        } finally {
            setProcessing(false);
        }
    };

    const handleReset = () => {
        setStep('slot');
        setSelectedSlot(null);
        setFile(null);
        setFileData(null);
        setProcessResult(null);
        setMappings([]);
        setProgress(0);
        setRecordCount(0);
        clearLocalFolderHandle(); // Clear any selected local folder
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
                        <Sparkles size={24} className="text-amber-500" />
                    </div>
                    <div>
                        <h2 className="text-lg font-mono font-medium flex items-center gap-2">
                            Nomad Forge
                            <span className="text-xs px-2 py-0.5 bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded uppercase">
                                ETL
                            </span>
                        </h2>
                        <p className="text-xs opacity-50">
                            Adatmigráció és transzformáció
                        </p>
                    </div>
                </div>

                {/* Advanced Mode Button */}
                {step === 'query' && processResult && (
                    <button
                        onClick={() => setShowAdvanced(true)}
                        className="
                            flex items-center gap-2 px-4 py-2 
                            border border-border rounded-lg
                            text-xs font-mono uppercase tracking-wider
                            hover:border-foreground hover:bg-foreground hover:text-background
                            transition-all
                        "
                    >
                        <Maximize2 size={14} />
                        Advanced
                    </button>
                )}
            </div>

            {/* WASM Loading State */}
            {wasmLoading && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center justify-center py-12 gap-3"
                >
                    <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        className="w-5 h-5 border-2 border-foreground/20 border-t-foreground rounded-full"
                    />
                    <span className="text-sm opacity-50 font-mono">WASM betöltése...</span>
                </motion.div>
            )}

            {/* Main Content */}
            {!wasmLoading && (
                <AnimatePresence mode="wait">
                    {/* Step 1: Slot Selection */}
                    {step === 'slot' && (
                        <motion.div
                            key="slot"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="space-y-4"
                        >
                            <div className="text-sm opacity-60 mb-2">
                                Válaszd ki a cél adatbázist:
                            </div>
                            <SlotSelector
                                slots={allSlots}
                                selectedSlot={selectedSlot}
                                onSelect={handleSlotSelect}
                            />
                        </motion.div>
                    )}

                    {/* Step 2: Upload */}
                    {step === 'upload' && !processResult && (
                        <motion.div
                            key="upload"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="space-y-4"
                        >
                            {/* Selected Slot Info */}
                            {selectedSlot && (
                                <div className="flex items-center justify-between p-3 bg-foreground/[0.02] border border-border rounded-lg">
                                    <div className="text-sm">
                                        <span className="opacity-50">Cél:</span>{' '}
                                        <span className="font-mono font-medium">{ADMIN_CONFIG[selectedSlot]?.label}</span>
                                        <span className="text-xs opacity-40 ml-2">({targetFields.length} mező)</span>
                                    </div>
                                    <button
                                        onClick={() => setStep('slot')}
                                        className="text-xs opacity-50 hover:opacity-100 underline"
                                    >
                                        Változtatás
                                    </button>
                                </div>
                            )}
                            <FileDropZone
                                onFileSelect={handleFileSelect}
                                processing={processing}
                                progress={progress}
                            />
                        </motion.div>
                    )}

                    {/* Data Preview */}
                    {step === 'upload' && processResult && !processing && (
                        <motion.div
                            key="preview"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                        >
                            <DataPreview
                                processResult={processResult}
                                fileName={file?.name || 'file'}
                                onContinue={() => setStep('query')}
                                onCancel={handleReset}
                            />
                        </motion.div>
                    )}

                    {/* Query Builder */}
                    {step === 'query' && processResult && (
                        <motion.div
                            key="query"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                        >
                            <QueryBuilder
                                processResult={processResult}
                                targetFields={targetFields}
                                mappings={mappings}
                                onMappingsChange={setMappings}
                                onBack={() => setStep('upload')}
                                onExecute={handleStartMigration}
                                executing={processing}
                                imageSourceDir={imageSourceDir}
                                imageBaseUrl={imageBaseUrl}
                                onImageSourceDirChange={setImageSourceDir}
                                onImageBaseUrlChange={setImageBaseUrl}
                            />
                        </motion.div>
                    )}

                    {/* Complete */}
                    {step === 'complete' && (
                        <motion.div
                            key="complete"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="border border-emerald-500/30 bg-emerald-500/5 rounded-lg"
                        >
                            <MigrationComplete
                                recordCount={recordCount}
                                onReset={handleReset}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>
            )}

            {/* Processing Overlay */}
            <AnimatePresence>
                {processing && step === 'query' && (
                    <ProcessingOverlay
                        progress={progress}
                        stage={processingStage}
                    />
                )}
            </AnimatePresence>

            {/* Advanced Query Modal */}
            <AnimatePresence>
                {showAdvanced && processResult && (
                    <AdvancedQueryModal
                        isOpen={showAdvanced}
                        onClose={() => setShowAdvanced(false)}
                        processResult={processResult}
                        targetFields={targetFields}
                        mappings={mappings}
                        onMappingsChange={setMappings}
                        onExecute={handleStartMigration}
                        wasmApplyTransform={wasm?.apply_transform}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
