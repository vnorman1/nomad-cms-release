import { useRef, useEffect } from 'react';
import { Bot } from 'lucide-react';
import type { FormContext, Message } from './types';
import type { PendingAction } from '@/context/AiContext';
import { SchemaViewer } from './SchemaViewer';
import { ApiKeyWarning } from './ApiKeyWarning';
import { MessageBubble } from './MessageBubble';
import { TypingIndicator } from './TypingIndicator';

interface ChatMessagesAreaProps {
    messages: Message[];
    formContext?: FormContext;
    hasApiKey: boolean;
    isThinking: boolean;
    isNavigating: boolean;
    onFillForm: (data: unknown) => void;
    onConfirmAction: (action: PendingAction) => void;
    onCancel: () => void;
    onClose: () => void;
}

export const ChatMessagesArea = ({
    messages,
    formContext,
    hasApiKey,
    isThinking,
    isNavigating,
    onFillForm,
    onConfirmAction,
    onCancel,
    onClose,
}: ChatMessagesAreaProps) => {
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isThinking]);

    return (
        <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar"
        >
            {/* Schema/Form context */}
            <SchemaViewer formContext={formContext} />

            {/* No API Key Warning */}
            {!hasApiKey && (
                <ApiKeyWarning onClose={onClose} />
            )}

            {messages.map((msg) => (
                <MessageBubble
                    key={msg.id}
                    msg={msg}
                    formContext={formContext}
                    onFillForm={onFillForm}
                    onConfirmAction={onConfirmAction}
                    isNavigating={isNavigating}
                    onCancel={onCancel}
                />
            ))}

            {isThinking && (
                <div className="flex flex-col gap-1 items-start">
                    <div className="flex items-center gap-2 px-1">
                        <Bot size={10} className="text-foreground" />
                        <span className="text-[9px] font-mono uppercase tracking-widest text-foreground">Nomi</span>
                    </div>
                    <div className="bg-muted/30 border border-border rounded-r-lg rounded-tl-lg rounded-bl-none">
                        <TypingIndicator />
                    </div>
                </div>
            )}
        </div>
    );
};
