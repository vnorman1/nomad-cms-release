import { motion } from 'framer-motion';
import type { FormContext } from './types';
import type { PendingAction } from '@/context/AiContext';
import { ChatHeader } from './ChatHeader';
import { ChatMessagesArea } from './ChatMessagesArea';
import { ChatInput } from './ChatInput';
import type { Message } from './types';

interface ChatWindowProps {
    messages: Message[];
    formContext?: FormContext;
    hasApiKey: boolean;
    isThinking: boolean;
    isNavigating: boolean;
    tokenCount: number;
    inputValue: string;
    setInputValue: (value: string) => void;
    onSend: () => void;
    onFillForm: (data: unknown) => void;
    onConfirmAction: (action: PendingAction) => void;
    onCancel: () => void;
    onClearSession: () => void;
    onClose: () => void;
}

export const ChatWindow = ({
    messages,
    formContext,
    hasApiKey,
    isThinking,
    isNavigating,
    tokenCount,
    inputValue,
    setInputValue,
    onSend,
    onFillForm,
    onConfirmAction,
    onCancel,
    onClearSession,
    onClose,
}: ChatWindowProps) => (
    <motion.div
        key="chat-window"
        initial={{ opacity: 0, scale: 0.9, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 10 }}
        transition={{ duration: 0.2, ease: "easeInOut" }}
        className="w-[380px] h-[580px] bg-background/95 backdrop-blur-xl border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden origin-bottom-right"
    >
        <ChatHeader
            hasApiKey={hasApiKey}
            onClearSession={onClearSession}
            onClose={onClose}
        />

        <ChatMessagesArea
            messages={messages}
            formContext={formContext}
            hasApiKey={hasApiKey}
            isThinking={isThinking}
            isNavigating={isNavigating}
            onFillForm={onFillForm}
            onConfirmAction={onConfirmAction}
            onCancel={onCancel}
            onClose={onClose}
        />

        <ChatInput
            inputValue={inputValue}
            setInputValue={setInputValue}
            onSend={onSend}
            isThinking={isThinking}
            hasApiKey={hasApiKey}
            tokenCount={tokenCount}
        />
    </motion.div>
);
