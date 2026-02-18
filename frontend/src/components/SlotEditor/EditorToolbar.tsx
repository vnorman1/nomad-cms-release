/**
 * EditorToolbar - Top Toolbar Component
 * Felső eszköztár a SlotEditor-hoz
 */

import {
    ArrowLeft,
    Search,
    Eye,
    EyeOff,
    LayoutGrid,
    List as ListIcon,
    Plus,
    History
} from 'lucide-react';
import { ToolbarBtn } from './ToolbarButton';
import type { ToolbarProps } from './types';

export function EditorToolbar({
    config,
    // slotKey - available via props but unused in this component
    slotKey: _slotKey,
    isListType,
    searchTerm,
    viewMode,
    showPublishedOnly,
    publishedField,
    onBack,
    onSearchChange,
    onViewModeChange,
    onPublishedFilterChange,
    onNewItem,
    onShowVersionHistory
}: ToolbarProps) {
    return (
        <div className="sticky top-20 z-40 bg-background/80 backdrop-blur border-b border-border py-4 mb-12 transition-all">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-1">
                {/* Left Section: Back Button and Title */}
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="hover:opacity-50 transition-opacity">
                        <ArrowLeft size={18} />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight uppercase leading-none">
                            {config.label}
                        </h1>
                        <span className="text-[10px] font-mono opacity-40 tracking-widest">
                            NÉZET: {isListType ? 'ADATHÁLÓ' : 'EGYEDI ELEM'}
                        </span>
                    </div>

                    {/* Version History Button */}
                    {onShowVersionHistory && (
                        <button
                            onClick={onShowVersionHistory}
                            className="ml-4 flex items-center gap-1.5 px-3 py-1.5 bg-secondary/50 hover:bg-secondary border border-border hover:border-foreground/20 transition-all text-[10px] font-mono uppercase tracking-wider"
                            title="Verzió történet megtekintése"
                        >
                            <History size={14} />
                            <span>VERZIÓK</span>
                        </button>
                    )}
                </div>

                {/* Center Section: Search */}
                {isListType && (
                    <div className="flex-1 max-w-md relative group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                        <input
                            type="text"
                            placeholder="KERESÉS AZ INDEXBEN..."
                            value={searchTerm}
                            onChange={e => onSearchChange(e.target.value)}
                            className="w-full bg-secondary/5 border-b border-border py-1.5 pl-9 pr-4 text-xs font-mono focus:outline-none focus:border-foreground transition-all"
                        />
                    </div>
                )}

                {/* Right Section: Filters and Actions */}
                <div className="flex items-center gap-2 flex-wrap">
                    {isListType && (
                        <>
                            {/* Published Filter */}
                            {publishedField && (
                                <div className="flex bg-secondary/10 rounded-lg p-1 mr-4">
                                    <button
                                        onClick={() => onPublishedFilterChange(null)}
                                        className={`
                                            px-3 py-1.5 text-[9px] font-mono uppercase rounded-md transition-all
                                            ${showPublishedOnly === null
                                                ? 'bg-foreground text-background shadow-sm'
                                                : 'text-muted-foreground hover:text-foreground hover:bg-white/5'}
                                        `}
                                    >
                                        Mind
                                    </button>
                                    <button
                                        onClick={() => onPublishedFilterChange(true)}
                                        className={`
                                            px-3 py-1.5 text-[9px] font-mono uppercase rounded-md transition-all flex items-center gap-1.5
                                            ${showPublishedOnly === true
                                                ? 'bg-foreground text-background shadow-sm'
                                                : 'text-muted-foreground hover:text-foreground hover:bg-white/5'}
                                        `}
                                    >
                                        <Eye size={10} />
                                        <span>Publikált</span>
                                    </button>
                                    <button
                                        onClick={() => onPublishedFilterChange(false)}
                                        className={`
                                            px-3 py-1.5 text-[9px] font-mono uppercase rounded-md transition-all flex items-center gap-1.5
                                            ${showPublishedOnly === false
                                                ? 'bg-foreground text-background shadow-sm'
                                                : 'text-muted-foreground hover:text-foreground hover:bg-white/5'}
                                        `}
                                    >
                                        <EyeOff size={10} />
                                        <span>Vázlat</span>
                                    </button>
                                </div>
                            )}

                            {/* View Mode Toggle */}
                            <div className="flex bg-secondary/10 rounded-lg p-1 mr-4">
                                <button
                                    onClick={() => onViewModeChange('cards')}
                                    className={`
                                        p-1.5 rounded-md transition-all
                                        ${viewMode === 'cards'
                                            ? 'bg-foreground text-background shadow-sm'
                                            : 'text-muted-foreground hover:text-foreground hover:bg-white/5'}
                                    `}
                                    title="Kártya nézet"
                                >
                                    <LayoutGrid size={14} />
                                </button>
                                <button
                                    onClick={() => onViewModeChange('table')}
                                    className={`
                                        p-1.5 rounded-md transition-all
                                        ${viewMode === 'table'
                                            ? 'bg-foreground text-background shadow-sm'
                                            : 'text-muted-foreground hover:text-foreground hover:bg-white/5'}
                                    `}
                                    title="Táblázat nézet"
                                >
                                    <ListIcon size={14} />
                                </button>
                            </div>

                            {/* New Item Button */}
                            <ToolbarBtn onClick={onNewItem}>
                                <Plus size={12} className="mr-2" /> ÚJ ELEM
                            </ToolbarBtn>
                        </>
                    )}

                    {/* Auto-save indicator for single object */}
                    {!isListType && (
                        <div className="flex items-center gap-2">
                            <span className="text-[9px] font-mono opacity-40 uppercase mr-4">
                                Automatikus Mentés
                            </span>
                            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
