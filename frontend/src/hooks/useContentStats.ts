import { useState, useEffect } from 'react';
import { getBatchData } from '@/api/data';
import { ADMIN_CONFIG } from '@/config/admin.config';

interface ContentStats {
    totalItems: number;
    totalMedia: number;
    dbSizeKB: number;
    activeModules: number;
    loading: boolean;
    slotData: Record<string, any>; // All loaded slot data for reuse
}

export function useContentStats() {
    const [stats, setStats] = useState<ContentStats>({
        totalItems: 0,
        totalMedia: 0,
        dbSizeKB: 0,
        activeModules: Object.keys(ADMIN_CONFIG).length,
        loading: true,
        slotData: {}
    });

    useEffect(() => {
        let isMounted = true;

        const fetchStats = async () => {
            let totalItems = 0;
            let totalMedia = 0;
            let totalSize = 0;

            const keys = Object.keys(ADMIN_CONFIG);

            try {
                // Use batch API to fetch all slots in a single request (or minimal chunks)
                // This reduces ~20 requests to 1 request
                const batchResults = await getBatchData(keys);

                // Process batch results
                keys.forEach((key) => {
                    const data = batchResults[key];
                    const config = ADMIN_CONFIG[key];

                    if (!data) return;

                    // 1. Calculate Storage Size (JSON string length as approximation)
                    const jsonString = JSON.stringify(data);
                    totalSize += new TextEncoder().encode(jsonString).length;

                    // 2. Count Items
                    if (Array.isArray(data)) {
                        totalItems += data.length;

                        // 3. Count Media in Lists/Collections
                        data.forEach((item: any) => {
                            // Check top-level fields for images/galleries
                            config.fields.forEach(field => {
                                if (field.type === 'image' && item[field.id]) {
                                    totalMedia++;
                                }
                                if (field.type === 'gallery' && Array.isArray(item[field.id])) {
                                    totalMedia += item[field.id].length;
                                }
                            });
                        });

                    } else if (typeof data === 'object') {
                        // Single Object Slot
                        totalItems += 1;

                        // Count Media in Object
                        const objData = data as Record<string, unknown>;
                        config.fields.forEach(field => {
                            if (field.type === 'image' && objData[field.id]) {
                                totalMedia++;
                            }
                            if (field.type === 'gallery' && Array.isArray(objData[field.id])) {
                                totalMedia += (objData[field.id] as unknown[]).length;
                            }
                        });
                    }
                });

                if (isMounted) {
                    setStats({
                        totalItems,
                        totalMedia,
                        dbSizeKB: Math.round(totalSize / 1024 * 10) / 10,
                        activeModules: keys.length,
                        loading: false,
                        slotData: batchResults
                    });
                }
            } catch (error) {
                console.error('Failed to fetch content stats:', error);
                if (isMounted) {
                    setStats(prev => ({ ...prev, loading: false }));
                }
            }
        };

        fetchStats();

        return () => {
            isMounted = false;
        };
    }, []);

    return stats;
}
