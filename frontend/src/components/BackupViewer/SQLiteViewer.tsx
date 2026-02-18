import React, { useEffect, useState } from 'react';
import initSqlJs, { Database, SqlValue } from 'sql.js';
import { Database as DbIcon, Table, AlertTriangle, Loader2, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SQLiteViewerProps {
    dbBlob: Blob;
    className?: string;
}

export const SQLiteViewer: React.FC<SQLiteViewerProps> = ({ dbBlob, className }) => {
    const [db, setDb] = useState<Database | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [tables, setTables] = useState<string[]>([]);
    const [selectedTable, setSelectedTable] = useState<string | null>(null);
    const [tableData, setTableData] = useState<{ columns: string[], values: SqlValue[][] } | null>(null);

    // Initialize DB
    useEffect(() => {
        let database: Database | null = null;
        let isMounted = true;

        const loadDb = async () => {
            try {
                setLoading(true);
                const SQL = await initSqlJs({
                    locateFile: file => `${import.meta.env.BASE_URL}assets/${file}`
                });

                const buffer = await dbBlob.arrayBuffer();
                if (!isMounted) return;

                database = new SQL.Database(new Uint8Array(buffer));
                setDb(database);

                // Get tables
                const result = database.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
                if (result.length > 0 && result[0].values) {
                    setTables(result[0].values.flat() as string[]);
                } else {
                    setTables([]);
                }
                setError(null);
            } catch (err: any) {
                console.error("SQLite load error:", err);
                if (isMounted) setError(err.message || 'Failed to load database');
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        loadDb();

        return () => {
            isMounted = false;
            if (database) {
                database.close();
            }
        };
    }, [dbBlob]);

    // Query table data when selected
    useEffect(() => {
        if (!db || !selectedTable) {
            setTableData(null);
            return;
        }

        try {
            // Limit to 100 rows for performance in preview
            const result = db.exec(`SELECT * FROM "${selectedTable}" LIMIT 100`);
            if (result.length > 0) {
                setTableData({
                    columns: result[0].columns,
                    values: result[0].values
                });
            } else {
                setTableData({ columns: [], values: [] });
            }
        } catch (err: any) {
            console.error("Query error:", err);
        }
    }, [db, selectedTable]);

    if (loading) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground bg-background">
                <Loader2 size={32} className="animate-spin mb-4 text-primary" />
                <p className="text-sm font-medium">Adatbázis betöltése...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-destructive bg-background p-6 text-center">
                <div className="w-16 h-16 bg-destructive/10 rounded-2xl flex items-center justify-center mb-4">
                    <AlertTriangle size={32} />
                </div>
                <h3 className="font-bold mb-1">Hiba az adatbázis megnyitásakor</h3>
                <p className="text-sm opacity-70 max-w-sm">{error}</p>
            </div>
        );
    }

    return (
        <div className={cn("flex h-full w-full overflow-hidden bg-background font-sans", className)}>
            {/* Sidebar: Table List */}
            <div className="w-64 border-r border-border/50 bg-muted/5 flex flex-col">
                <div className="h-10 flex items-center px-4 border-b border-border/50 bg-muted/10">
                    <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                        <DbIcon size={12} />
                        Táblák ({tables.length})
                    </h3>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                    {tables.map(table => (
                        <button
                            key={table}
                            onClick={() => setSelectedTable(table)}
                            className={cn(
                                "w-full text-left px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-between transition-colors group",
                                selectedTable === table
                                    ? "bg-primary/10 text-primary"
                                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                            )}
                        >
                            <div className="flex items-center gap-2 truncate">
                                <Table size={14} className={selectedTable === table ? "opacity-100" : "opacity-50 group-hover:opacity-100"} />
                                <span className="truncate">{table}</span>
                            </div>
                            {selectedTable === table && <ArrowRight size={12} />}
                        </button>
                    ))}
                    {tables.length === 0 && (
                        <p className="px-4 py-8 text-center text-xs text-muted-foreground/50">
                            Nem található tábla
                        </p>
                    )}
                </div>
            </div>

            {/* Main Content: Data Grid */}
            <div className="flex-1 overflow-hidden flex flex-col bg-background">
                {selectedTable && tableData ? (
                    <div className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                        <div className="min-w-full inline-block align-middle">
                            <table className="min-w-full border-separate border-spacing-0">
                                <thead className="bg-muted/30 sticky top-0 backdrop-blur-md z-10">
                                    <tr>
                                        {tableData.columns.map(col => (
                                            <th key={col} className="px-4 py-3 text-left border-b border-border/50 font-medium text-[11px] text-muted-foreground uppercase tracking-wider whitespace-nowrap bg-background/50">
                                                {col}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/20">
                                    {tableData.values.map((row, i) => (
                                        <tr key={i} className="hover:bg-muted/10 transition-colors group">
                                            {row.map((val, j) => (
                                                <td key={j} className="px-4 py-2 border-b border-border/30 max-w-xs truncate font-mono text-xs text-foreground/80 group-hover:text-foreground" title={String(val)}>
                                                    {val === null ? <span className="text-muted-foreground/30 italic">null</span> : String(val)}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                    {tableData.values.length === 0 && (
                                        <tr>
                                            <td colSpan={tableData.columns.length} className="p-12 text-center text-muted-foreground">
                                                <div className="flex flex-col items-center gap-2 opacity-50">
                                                    <Table size={32} />
                                                    <span className="text-sm">A tábla üres</span>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground/40">
                        <div className="w-20 h-20 bg-muted/10 rounded-full flex items-center justify-center mb-4">
                            <Table size={40} strokeWidth={1.5} className="opacity-50" />
                        </div>
                        <p className="font-medium">Válassz ki egy táblát az adatok betöltéséhez</p>
                    </div>
                )}
            </div>
        </div>
    );
};
