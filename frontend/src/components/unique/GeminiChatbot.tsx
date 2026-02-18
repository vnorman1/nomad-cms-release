import { useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useAi } from '@/context/AiContext';

import {
    ChatbotProps,
    Message,
    STORAGE_KEYS,
    useChat,
    useAutoGenerate,
    ChatWindow,
} from '@/components/geminiAIComponents';
import { ChatToggleButton } from '@/components/geminiAIComponents/ChatToggleButton';

// -----------------------------------------------------------------------------
// MAIN COMPONENT
// -----------------------------------------------------------------------------

export const GeminiChatbot = ({ formContext, onFillForm }: ChatbotProps) => {
    const { aiEnabled, hasApiKey, isLoading: aiLoading } = useAi();

    // Chat hook - manages messages, history, and actions
    const {
        messages,
        setMessages,
        isThinking,
        tokenCount,
        isNavigating,
        handleSend,
        handleFillForm,
        handleConfirmAction,
        handleCancelAction,
        handleClearSession,
        inputValue,
        setInputValue,
    } = useChat(formContext, onFillForm);

    // Auto-generate hook - manages auto-generation when navigating with pending action
    const { isOpen, setIsOpen } = useAutoGenerate(
        formContext,
        onFillForm,
        isThinking,
        setInputValue
    );

    // Initialize messages ONLY if no saved session exists
    useEffect(() => {
        if (aiEnabled === null || aiLoading) return;

        const hasSavedSession = sessionStorage.getItem(STORAGE_KEYS.messages);
        if (hasSavedSession) return;

        const initialMessages: Message[] = [];

        if (aiEnabled && hasApiKey) {
            initialMessages.push({
                id: 'init',
                role: 'system',
                content: 'AI RENDSZER INICIALIZÁLVA. CMS KONFIGURÁCIÓHOZ CSATLAKOZVA.',
                timestamp: new Date()
            });
            initialMessages.push({
                id: 'welcome',
                role: 'ai',
                content: formContext
                    ? `Kapcsolódva a "${formContext.config.label}" űrlaphoz. Kérj bármilyen tartalmat és automatikusan kitöltöm az űrlapot!`
                    : 'Készen állok, hogy segítsek!',
                timestamp: new Date()
            });
        } else if (aiEnabled && !hasApiKey) {
            initialMessages.push({
                id: 'no-key',
                role: 'system',
                content: 'API KULCS SZÜKSÉGES',
                timestamp: new Date()
            });
            initialMessages.push({
                id: 'setup',
                role: 'ai',
                content: 'Az AI használatához állítsd be az API kulcsodat a beállításokban.',
                timestamp: new Date()
            });
        }

        setMessages(initialMessages);
    }, [aiEnabled, hasApiKey, aiLoading, formContext, setMessages]);

    // Close chat when navigating with pending action
    const handleConfirmActionWithClose = (action: Parameters<typeof handleConfirmAction>[0]) => {
        handleConfirmAction(action);
        setIsOpen(false);
    };

    // Don't render if AI is disabled or loading
    if (aiEnabled === false || aiEnabled === null || aiLoading) {
        return null;
    }

    return (
        <div className="fixed bottom-6 right-6 z-[60] font-sans flex flex-col items-end">
            <AnimatePresence mode="wait">
                {isOpen ? (
                    <ChatWindow
                        messages={messages}
                        formContext={formContext}
                        hasApiKey={hasApiKey}
                        isThinking={isThinking}
                        isNavigating={isNavigating}
                        tokenCount={tokenCount}
                        inputValue={inputValue}
                        setInputValue={setInputValue}
                        onSend={handleSend}
                        onFillForm={handleFillForm}
                        onConfirmAction={handleConfirmActionWithClose}
                        onCancel={handleCancelAction}
                        onClearSession={handleClearSession}
                        onClose={() => setIsOpen(false)}
                    />
                ) : (
                    <ChatToggleButton
                        formContext={formContext}
                        onClick={() => setIsOpen(true)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};
