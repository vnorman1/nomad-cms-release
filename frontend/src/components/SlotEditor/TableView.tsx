/**
 * TableView - Table View Component
 * Táblázat nézet a lista elemekhez
 */

import { CheckSquare, Square, XSquare, Edit3, Trash2 } from 'lucide-react';
import type { TableViewProps } from './types';

export function TableView({ 
    items, 
    config, 
    onEdit, 
    onDelete, 
    disabled,
    selectedItems,
    onToggleSelect,
    onToggleSelectAll,
    publishedField
}: TableViewProps) {
    const allSelected = items.length > 0 && selectedItems?.size === items.length;
    const someSelected = selectedItems && selectedItems.size > 0 && selectedItems.size < items.length;
    
    return (
        <div className="overflow-x-auto border-t border-border mt-4">
            <table className={`w-full text-left border-collapse ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
                <thead>
                    <tr>
                        {/* Select All Checkbox */}
                        {onToggleSelect && (
                            <th className="py-2 pl-4 border-b border-border w-10">
                                <button onClick={onToggleSelectAll} className="p-1 hover:bg-secondary/20 transition-colors">
                                    {allSelected 
                                        ? <CheckSquare size={14} className="text-blue-500" /> 
                                        : someSelected 
                                            ? <XSquare size={14} className="text-blue-400" /> 
                                            : <Square size={14} className="text-muted-foreground" />
                                    }
                                </button>
                            </th>
                        )}
                        <th className="py-2 pl-4 text-[9px] font-mono uppercase tracking-widest opacity-40 border-b border-border w-16">#</th>
                        {publishedField && (
                            <th className="py-2 px-4 text-[9px] font-mono uppercase tracking-widest opacity-40 border-b border-border w-24">Státusz</th>
                        )}
                        {config.fields.slice(0, publishedField ? 3 : 4).map((f) => (
                            <th key={f.id} className="py-2 px-4 text-[9px] font-mono uppercase tracking-widest opacity-40 border-b border-border">
                                {f.label}
                            </th>
                        ))}
                        <th className="py-2 pr-4 text-[9px] font-mono uppercase tracking-widest opacity-40 border-b border-border text-right w-24">Műveletek</th>
                    </tr>
                </thead>
                <tbody>
                    {items.length === 0 ? (
                        <tr>
                            <td 
                                colSpan={config.fields.slice(0, 4).length + (onToggleSelect ? 3 : 2) + (publishedField ? 1 : 0)} 
                                className="py-12 text-center text-xs font-mono opacity-40 uppercase"
                            >
                                Nincs megjeleníthető adat
                            </td>
                        </tr>
                    ) : (
                        items.map((item: any, idx: number) => {
                            const isSelected = selectedItems?.has(idx);
                            return (
                                <tr 
                                    key={idx} 
                                    className={`group hover:bg-secondary/10 transition-colors ${isSelected ? 'bg-blue-500/10' : ''}`}
                                >
                                    {onToggleSelect && (
                                        <td className="py-3 pl-4 border-b border-border">
                                            <button onClick={() => onToggleSelect(idx)} className="p-1">
                                                {isSelected 
                                                    ? <CheckSquare size={14} className="text-blue-500" /> 
                                                    : <Square size={14} className="text-muted-foreground" />
                                                }
                                            </button>
                                        </td>
                                    )}
                                    <td className="py-3 pl-4 border-b border-border font-mono text-xs opacity-50">
                                        {(idx + 1).toString().padStart(2, '0')}
                                    </td>
                                    {publishedField && (
                                        <td className="py-3 px-4 border-b border-border">
                                            <span className={`
                                                text-[9px] border px-2 py-0.5 
                                                ${item[publishedField] 
                                                    ? 'border-green-500/50 text-green-400 bg-green-500/10' 
                                                    : 'border-yellow-500/50 text-yellow-400 bg-yellow-500/10'
                                                }
                                            `}>
                                                {item[publishedField] ? 'PUBLIKÁLT' : 'VÁZLAT'}
                                            </span>
                                        </td>
                                    )}
                                    {config.fields.slice(0, publishedField ? 3 : 4).map((f) => (
                                        <td key={f.id} className="py-3 px-4 border-b border-border text-sm font-light">
                                            {f.type === 'image' ? (
                                                item[f.id] 
                                                    ? <img src={item[f.id] as string} className="w-8 h-8 object-cover border border-border" alt="Thumb" /> 
                                                    : <div className="w-8 h-8 bg-secondary/20" />
                                            ) : f.type === 'boolean' ? (
                                                <span className={`text-[9px] border px-1 ${item[f.id] ? 'border-foreground text-foreground' : 'border-border text-muted-foreground'}`}>
                                                    {item[f.id] ? 'IGEN' : 'NEM'}
                                                </span>
                                            ) : (
                                                <div className="truncate max-w-[200px]">{String(item[f.id] ?? '')}</div>
                                            )}
                                        </td>
                                    ))}
                                    <td className="py-3 pr-4 border-b border-border text-right">
                                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button 
                                                disabled={disabled} 
                                                onClick={() => onEdit(idx)} 
                                                className="hover:text-foreground text-muted-foreground"
                                            >
                                                <Edit3 size={14} />
                                            </button>
                                            <button 
                                                disabled={disabled} 
                                                onClick={() => onDelete(idx)} 
                                                className="hover:text-destructive text-muted-foreground"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })
                    )}
                </tbody>
            </table>
        </div>
    );
}
