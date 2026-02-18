import { Send, Loader2, TextSelect } from 'lucide-react';

interface ChatInputProps {
    inputValue: string;
    setInputValue: (value: string) => void;
    onSend: () => void;
    isThinking: boolean;
    hasApiKey: boolean;
    tokenCount: number;
}

export const ChatInput = ({
    inputValue,
    setInputValue,
    onSend,
    isThinking,
    hasApiKey,
    tokenCount
}: ChatInputProps) => (
    <div className="p-4 border-t border-border bg-background">
        <div className="relative flex items-center gap-2 bg-muted/10 border border-border rounded-lg p-1.5 focus-within:border-foreground/50 focus-within:bg-background transition-all">
            <div className="p-2">
                <TextSelect size={16} className="text-muted-foreground" />
            </div>
            <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onSend()}
                placeholder={hasApiKey ? "Kérdezz Nomitól..." : "API kulcs szükséges..."}
                disabled={!hasApiKey}
                className="flex-1 bg-transparent text-xs font-medium focus:outline-none placeholder:text-muted-foreground/50 disabled:cursor-not-allowed"
            />
            <button
                data-ai-send-button
                onClick={onSend}
                disabled={!inputValue.trim() || isThinking || !hasApiKey}
                className="p-2 bg-foreground text-background rounded-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
                {isThinking ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            </button>
        </div>
        <div className="mt-2 flex items-center justify-between px-1">
            <span className="text-[9px] font-mono text-muted-foreground/50">
                TOKEN: {tokenCount.toLocaleString()}
            </span>
        </div>
    </div>
);
