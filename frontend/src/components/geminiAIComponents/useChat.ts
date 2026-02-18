import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ADMIN_CONFIG } from '@/config/admin.config';
import { sendAiChat, type AiChatMessage } from '@/api/auth';
import { useAi, type PendingAction } from '@/context/AiContext';
import {
    Message,
    FormContext,
    parseJsonFromResponse,
    buildSchemaContext,
    detectRequestedSlot,
    detectActionType,
    isBulkRequest,
} from './index';

interface UseChatReturn {
    messages: Message[];
    setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
    conversationHistory: AiChatMessage[];
    isThinking: boolean;
    tokenCount: number;
    isNavigating: boolean;
    handleSend: () => Promise<void>;
    handleFillForm: (data: unknown) => void;
    handleConfirmAction: (action: PendingAction) => void;
    handleCancelAction: () => void;
    handleClearSession: () => void;
    inputValue: string;
    setInputValue: (value: string) => void;
}

export function useChat(
    formContext: FormContext | undefined,
    onFillForm: ((data: Record<string, unknown> | Record<string, unknown>[]) => void) | undefined
): UseChatReturn {
    const navigate = useNavigate();
    const location = useLocation();
    const {
        aiEnabled,
        hasApiKey,
        maxTokens,
        selectedModel,
        setPendingAction,
        setAutoGenerateRequest,
        registerSendHandler,
    } = useAi();

    const [messages, setMessages] = useState<Message[]>([]);
    const [conversationHistory, setConversationHistory] = useState<AiChatMessage[]>([]);
    const [isThinking, setIsThinking] = useState(false);
    const [tokenCount, setTokenCount] = useState(0);
    const [isNavigating, setIsNavigating] = useState(false);
    const [inputValue, setInputValue] = useState('');

    // Secret server-side session ID (generated once per chat session)
    const [sessionId] = useState(() => {
        // Generate a unique session ID for this chat instance
        return 'ncs_' + Math.random().toString(36).substring(2, 18);
    });

    // Ref for the send handler to avoid infinite loops
    const handleSendRef = useRef<(message?: string) => Promise<void>>();
    const registeredRef = useRef(false);

    const handleSend = useCallback(async (overrideMessage?: string) => {
        const messageToSend = overrideMessage || inputValue;
        if (!messageToSend.trim() || !aiEnabled || !hasApiKey) return;

        const userText = messageToSend;
        const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: messageToSend,
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMsg]);
        setInputValue('');

        // =====================================================
        // CONTEXT-AWARE: Check if user is confirming a pending action
        // =====================================================
        const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
        const hasPendingConfirm = lastMessage?.type === 'confirm' && lastMessage?.metadata?.pendingAction;

        if (hasPendingConfirm) {
            const pendingActionFromMsg = lastMessage.metadata!.pendingAction as PendingAction;
            const lowerText = userText.toLowerCase();

            // Check if user is confirming (yes, ok, all, összeset, etc.)
            const confirmKeywords = ['igen', 'ok', 'oké', 'yes', 'sure', 'persze', 'rendben', 'osszes', 'összeset', 'mindent', 'all', 'hajra', 'mehet', 'gyerunk'];
            const cancelKeywords = ['nem', 'no', 'cancel', 'megse', 'inkabb ne', 'visszavon', 'stop'];

            const isConfirm = confirmKeywords.some(kw => lowerText.includes(kw));
            const isCancel = cancelKeywords.some(kw => lowerText.includes(kw));

            if (isCancel) {
                handleCancelAction();
                setPendingAction(null);
                return;
            }

            if (isConfirm) {
                // User confirmed the pending action - execute it
                console.log('[useChat] User confirmed pending action:', pendingActionFromMsg);
                handleConfirmAction(pendingActionFromMsg);
                return;
            }
        }

        // Detect the type of action user wants (standard detection)
        const actionType = detectActionType(userText);
        const detectedSlot = detectRequestedSlot(userText);
        const currentSlotKey = formContext?.slotKey;
        const isBulk = isBulkRequest(userText);

        // Debug: Log detection results
        console.log('[useChat] Action Detection:', {
            userText: userText.substring(0, 50),
            actionType,
            detectedSlot: detectedSlot?.slotKey,
            currentSlot: currentSlotKey,
            isBulk,
        });

        // =====================================================
        // ROUTE 1: NAVIGATION ONLY (no generation)
        // =====================================================
        if (actionType === 'navigate' && detectedSlot) {
            const navMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'ai',
                content: `Máris viszlek! Irány a **${detectedSlot.label}** oldal...`,
                timestamp: new Date()
            };
            setMessages(prev => [...prev, navMsg]);

            navigate(`/edit/${detectedSlot.slotKey}`);
            return;
        }

        // =====================================================
        // ROUTE 2: DELETE OPERATION
        // =====================================================
        if (actionType === 'delete') {
            const targetSlot = detectedSlot?.slotKey || currentSlotKey;
            if (!targetSlot) {
                const errMsg: Message = {
                    id: (Date.now() + 1).toString(),
                    role: 'ai',
                    content: 'Hmm, nem vagyok biztos benne, melyik listából szeretnéd törölni. Navigálj oda, ahol a törlendő elem van, vagy mondd meg pontosabban!',
                    timestamp: new Date()
                };
                setMessages(prev => [...prev, errMsg]);
                return;
            }

            // Navigate if needed
            if (detectedSlot && currentSlotKey !== detectedSlot.slotKey) {
                navigate(`/edit/${detectedSlot.slotKey}`);
            }

            // Set pending delete action
            const slotConfig = ADMIN_CONFIG[targetSlot];
            const action: PendingAction = {
                type: isBulk ? 'bulk_delete' : 'delete_item',
                slotKey: targetSlot,
                slotLabel: slotConfig?.label || targetSlot,
                originalUserMessage: userText,
            };
            setPendingAction(action);

            const deleteMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'ai',
                content: isBulk
                    ? `Tömeges törlést kértél a **${slotConfig?.label || targetSlot}** listából! Ez visszafordíthatalan művelet.`
                    : `Törlést kértél a **${slotConfig?.label || targetSlot}** listából. Biztosan folytatod?`,
                timestamp: new Date(),
                type: 'confirm',
                metadata: { pendingAction: action }
            };
            setMessages(prev => [...prev, deleteMsg]);
            return;
        }

        // =====================================================
        // ROUTE 3: MOVE/REORDER OPERATION
        // =====================================================
        if (actionType === 'move') {
            const targetSlot = detectedSlot?.slotKey || currentSlotKey;
            if (!targetSlot) {
                const errMsg: Message = {
                    id: (Date.now() + 1).toString(),
                    role: 'ai',
                    content: 'Jaj, nem tudom melyik listában kellene átrendezni. Navigálj oda ahol az elemek vannak, aztán próbáld újra!',
                    timestamp: new Date()
                };
                setMessages(prev => [...prev, errMsg]);
                return;
            }

            // Navigate if needed
            if (detectedSlot && currentSlotKey !== detectedSlot.slotKey) {
                navigate(`/edit/${detectedSlot.slotKey}`);
            }

            // Set pending move action
            const slotConfig = ADMIN_CONFIG[targetSlot];
            const action: PendingAction = {
                type: 'move_item',
                slotKey: targetSlot,
                slotLabel: slotConfig?.label || targetSlot,
                originalUserMessage: userText,
            };
            setPendingAction(action);

            const moveMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'ai',
                content: `Persze, máris átrendezem! ↕️ Add meg a részleteket...`,
                timestamp: new Date()
            };
            setMessages(prev => [...prev, moveMsg]);
            return;
        }

        // =====================================================
        // ROUTE 4: GENERATION (navigate + create)
        // =====================================================
        const needsNavigation = detectedSlot && (!currentSlotKey || currentSlotKey !== detectedSlot.slotKey);

        if (actionType === 'generate' && needsNavigation && detectedSlot) {
            const slotConfig = ADMIN_CONFIG[detectedSlot.slotKey];
            const isCollectionType = slotConfig?.type === 'list' || slotConfig?.type === 'collection';

            console.log('[useChat] NAVIGATING to:', detectedSlot.slotKey);

            setIsThinking(true);
            // NE töröljük a történelmet, hogy megmaradjon a kontextus!
            // setConversationHistory([]); 

            // Injektáljunk egy rendszerüzenetet a történetbe a váltásról
            const contextSwitchMsg: AiChatMessage = {
                role: 'system',
                content: `[SYSTEM] A felhasználó átnavigált a "${detectedSlot.label}" (${detectedSlot.slotKey}) felületre. A továbbiakban ez az aktív kontextus.`
            };
            setConversationHistory(prev => [...prev, contextSwitchMsg]);

            const navMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'ai',
                content: isCollectionType
                    ? `Máris viszlek a **${detectedSlot.label}** oldalra és készítek egy új elemet!`
                    : `Megnyitom a **${detectedSlot.label}** oldalt és kitöltöm neked!`,
                timestamp: new Date()
            };
            setMessages(prev => [...prev, navMsg]);

            navigate(`/edit/${detectedSlot.slotKey}`);

            if (isCollectionType) {
                const action: PendingAction = {
                    type: 'create_new_item',
                    slotKey: detectedSlot.slotKey,
                    slotLabel: detectedSlot.label,
                    originalUserMessage: userText,
                };
                setPendingAction(action);
            }

            setAutoGenerateRequest(userText);

            setTimeout(() => {
                setIsThinking(false);
            }, 500);

            return;
        }

        // =====================================================
        // ROUTE 5: GENERAL CHAT - Send to AI (greetings, questions, ambiguous)
        // =====================================================
        // Instead of showing a hardcoded response, we now send ALL messages to the actual AI
        // so Nomi can respond naturally with her personality

        // Normal AI chat - send to Nomi
        setIsThinking(true);

        const newHistory: AiChatMessage[] = [
            ...conversationHistory,
            { role: 'user', content: userText }
        ];

        try {
            // Build route context from current location
            const routeContext = {
                path: location.pathname,
                // Try to extract slot from path like /edit/blog -> blog
                currentSlot: location.pathname.match(/\/edit\/([^/]+)/)?.[1] || null,
                currentSlotLabel: location.pathname.match(/\/edit\/([^/]+)/)?.[1]
                    ? ADMIN_CONFIG[location.pathname.match(/\/edit\/([^/]+)!/)?.[1] as keyof typeof ADMIN_CONFIG]?.label || null
                    : null,
            };

            const response = await sendAiChat({
                messages: newHistory,
                schema_context: buildSchemaContext(),
                route_context: routeContext,
                form_context: formContext ? {
                    slotKey: formContext.slotKey,
                    label: formContext.config.label,
                    type: formContext.config.type,
                    fields: formContext.config.fields.map(f => ({
                        id: f.id,
                        label: f.label,
                        type: f.type,
                        required: f.required,
                        options: f.options,
                    })),
                    currentData: formContext.currentData,
                } : undefined,
                model: selectedModel || undefined,
                temperature: 0.7,
                max_tokens: maxTokens,
                // Secret server-side history - enabled silently
                _sid: sessionId,
                _ssh: true,
            });

            if (response.success && response.message) {
                if (response.usage) {
                    setTokenCount(prev => prev + response.usage!.total_tokens);
                }

                const parsedData = parseJsonFromResponse(response.message);
                const canFillForm = parsedData && formContext && onFillForm;

                // Ha van szöveges válasz IS, és nem csak JSON
                let displayContent = response.message;

                // Ha sikerült JSON-t parsolni, tisztítsuk meg a megjelenített üzenetet a nyers JSON-től
                if (parsedData) {
                    // Egyszerűsített tisztítás: ha a válasz tartalmaz JSON blokkot, azt elrejtjük a chat buborékban
                    // (de a parseJsonFromResponse már kinyerte)
                    displayContent = response.message.replace(/```json[\s\S]*?```/g, '[Adatok generálva]');
                    displayContent = displayContent.replace(/\{[\s\S]*\}/g, (match) => {
                        // Csak akkor cseréljük, ha ez tényleg a generált JSON
                        return match.length > 50 ? '[Adatok generálva]' : match;
                    });

                    if (!displayContent.trim() || displayContent.includes('[Adatok generálva]')) {
                        if (Array.isArray(parsedData)) {
                            displayContent = `Kész is! Generáltam ${parsedData.length} elemet neked. Nézd meg, és ha tetszik, mentsd el!`;
                        } else {
                            displayContent = `Tessék, kitöltöttem az űrlapot! Nézd át, és ha minden oké, mentsd el.`;
                        }
                    }
                }

                const aiMsg: Message = {
                    id: (Date.now() + 1).toString(),
                    role: 'ai',
                    content: displayContent,
                    timestamp: new Date(),
                    type: canFillForm ? 'action' : 'text',
                    metadata: canFillForm ? {
                        schema: formContext.slotKey,
                        generatedData: parsedData,
                        tokens: response.usage?.total_tokens,
                    } : {
                        tokens: response.usage?.total_tokens,
                    }
                };

                setMessages(prev => [...prev, aiMsg]);
                setConversationHistory([
                    ...newHistory,
                    { role: 'assistant', content: response.message }
                ]);

                // =====================================================
                // POST-PROCESSING: Check for navigation commands in AI response
                // =====================================================
                // Handle multiple formats:
                // 1. ```navigate("slotKey")``` or ```\nnavigate("slotKey")\n```
                // 2. `navigate("slotKey")`
                // 3. navigate("slotKey") - without any markers
                // 4. navigate("/edit/slotKey") - path format

                // First, try to find in code block
                let targetSlotKey: string | null = null;

                // Pattern 1: Code block (```navigate("xxx")``` or with newlines)
                const codeBlockMatch = response.message.match(/```\s*navigate\s*\(\s*["']([^"']+)["']\s*\)\s*```/i);
                if (codeBlockMatch) {
                    targetSlotKey = codeBlockMatch[1];
                }

                // Pattern 2: Inline backticks `navigate("xxx")`
                if (!targetSlotKey) {
                    const backtickMatch = response.message.match(/`navigate\s*\(\s*["']([^"']+)["']\s*\)`/i);
                    if (backtickMatch) {
                        targetSlotKey = backtickMatch[1];
                    }
                }

                // Pattern 3: Raw navigate("xxx") without any markers
                if (!targetSlotKey) {
                    const rawMatch = response.message.match(/(?:^|\s)navigate\s*\(\s*["']([^"']+)["']\s*\)/im);
                    if (rawMatch) {
                        targetSlotKey = rawMatch[1];
                    }
                }

                // Pattern 4: Path-based format navigate("/edit/xxx")
                if (!targetSlotKey) {
                    const pathMatch = response.message.match(/navigate\s*\(\s*["']\/edit\/([^"']+)["']\s*\)/i);
                    if (pathMatch) {
                        targetSlotKey = pathMatch[1];
                    }
                }

                // If we found a target, execute navigation
                if (targetSlotKey) {
                    // Clean up the slotKey (remove any path prefix if present)
                    const cleanSlotKey = targetSlotKey.replace(/^\/edit\//, '');
                    const slotConfig = ADMIN_CONFIG[cleanSlotKey];

                    if (slotConfig) {
                        console.log('[useChat] AI requested navigation to:', cleanSlotKey);
                        setTimeout(() => {
                            navigate(`/edit/${cleanSlotKey}`);
                        }, 500);
                    } else {
                        console.warn('[useChat] AI requested navigation to unknown slot:', cleanSlotKey);
                    }
                }

                // =====================================================
                // POST-PROCESSING: Check for update commands in AI response
                // =====================================================
                // Handle: update("field", "value"), `update("field", "value")`, update("field", 40), etc.
                // More robust regex that handles various formats
                const cleanedMessage = response.message.replace(/`/g, ''); // Remove all backticks first
                const updateMatches = cleanedMessage.matchAll(/update\s*\(\s*["']([^"']+)["']\s*,\s*(.+?)\s*\)/gi);
                for (const match of updateMatches) {
                    const fieldId = match[1];
                    let valueStr = match[2].trim();

                    // Parse the value (handle strings, booleans, numbers)
                    let value: unknown;
                    if (valueStr.startsWith('"') || valueStr.startsWith("'")) {
                        value = valueStr.slice(1, -1); // Remove quotes
                    } else if (valueStr === 'true') {
                        value = true;
                    } else if (valueStr === 'false') {
                        value = false;
                    } else if (!isNaN(Number(valueStr))) {
                        value = Number(valueStr);
                    } else {
                        value = valueStr;
                    }

                    console.log('[useChat] AI requested update:', fieldId, '=', value);

                    // Apply the update via onFillForm with partial data
                    if (onFillForm && formContext) {
                        setTimeout(() => {
                            onFillForm({ [fieldId]: value });
                        }, 300);
                    }
                }

                if (canFillForm) {
                    setTimeout(() => {
                        try {
                            onFillForm(parsedData);
                            const confirmMsg: Message = {
                                id: (Date.now() + 2).toString(),
                                role: 'ai',
                                content: 'Az űrlap mezői kitöltve! Már csak mentened kell.',
                                timestamp: new Date()
                            };
                            setMessages(prev => [...prev, confirmMsg]);
                        } catch (e) {
                            console.error('[useChat] AUTO-FILL error:', e);
                        }
                    }, 300);
                }
            } else {
                throw new Error(response.error || 'Ismeretlen hiba');
            }
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : 'Nem sikerült kapcsolódni az AI szolgáltatáshoz.';
            const errorMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'ai',
                content: `Jaj, valami hiba történt! ${errorMessage}`,
                timestamp: new Date(),
                type: 'error'
            };
            setMessages(prev => [...prev, errorMsg]);
        } finally {
            setIsThinking(false);
        }
    }, [inputValue, aiEnabled, hasApiKey, conversationHistory, formContext, onFillForm, navigate, setPendingAction, setAutoGenerateRequest]);

    // Keep ref updated with latest handleSend
    useEffect(() => {
        handleSendRef.current = handleSend;
    }, [handleSend]);

    // Register handleSend with AiContext ONCE on mount
    useEffect(() => {
        if (registeredRef.current) return;
        registeredRef.current = true;

        const wrappedHandler = async (message: string) => {
            if (handleSendRef.current) {
                await handleSendRef.current(message);
            }
        };
        registerSendHandler(wrappedHandler);
    }, [registerSendHandler]);

    const handleFillForm = useCallback((data: unknown) => {
        if (onFillForm && data && typeof data === 'object') {
            onFillForm(data as Record<string, unknown>);
            const confirmMsg: Message = {
                id: Date.now().toString(),
                role: 'ai',
                content: 'Készen vagyok! Az űrlap kitöltve, már csak mentened kell.',
                timestamp: new Date()
            };
            setMessages(prev => [...prev, confirmMsg]);
        }
    }, [onFillForm]);

    const handleConfirmAction = useCallback((action: PendingAction) => {
        if (isNavigating) return;
        setIsNavigating(true);

        const targetPath = `/edit/${action.slotKey}`;
        navigate(targetPath);

        if (action.type === 'create_new_item') {
            setPendingAction(action);
            if (action.originalUserMessage) {
                setAutoGenerateRequest(action.originalUserMessage);
            }
            const navMsg: Message = {
                id: Date.now().toString(),
                role: 'ai',
                content: `Rendben, megyünk a **${action.slotLabel}** oldalra! Megnyitom az űrlapot és kitöltöm neked.`,
                timestamp: new Date()
            };
            setMessages(prev => [...prev, navMsg]);
        } else if (action.type === 'edit_existing') {
            if (action.originalUserMessage) {
                setAutoGenerateRequest(action.originalUserMessage);
            }
            const navMsg: Message = {
                id: Date.now().toString(),
                role: 'ai',
                content: `Oké, megnyitom a **${action.slotLabel}** oldalt és fríssítem a tartalmat!`,
                timestamp: new Date()
            };
            setMessages(prev => [...prev, navMsg]);
        } else if (action.type === 'delete_item' || action.type === 'bulk_delete') {
            // Handle delete confirmation - user has confirmed!
            const isBulk = action.type === 'bulk_delete';
            const deleteConfirmMsg: Message = {
                id: Date.now().toString(),
                role: 'ai',
                content: isBulk
                    ? `Töröljük a kijelölt elemeket a **${action.slotLabel}** listából...`
                    : `Az elem törlése folyamatban a **${action.slotLabel}** listából...`,
                timestamp: new Date()
            };
            setMessages(prev => [...prev, deleteConfirmMsg]);

            // Set the confirmed flag to true - SlotEditor will only execute with this flag
            const confirmedAction = { ...action, confirmed: true };
            setPendingAction(confirmedAction);

            // Navigate to the page so SlotEditor can process the confirmed delete
            navigate(`/edit/${action.slotKey}`);
        }

        setTimeout(() => setIsNavigating(false), 1000);
    }, [navigate, setPendingAction, isNavigating, setAutoGenerateRequest]);

    const handleCancelAction = useCallback(() => {
        const cancelMsg: Message = {
            id: Date.now().toString(),
            role: 'ai',
            content: 'Oké, visszavontam! Ha mégis kellene, csak szólj.',
            timestamp: new Date()
        };
        setMessages(prev => [...prev, cancelMsg]);
    }, []);

    const handleClearSession = useCallback(() => {
        setMessages([]);
        setConversationHistory([]);
        setTokenCount(0);

        const welcomeMessages: Message[] = [
            {
                id: 'welcome',
                role: 'ai',
                content: formContext
                    ? `Szia! Épp a **${formContext.config.label}** oldalon vagyunk. Miben segíthetek? Generáljak tartalmat, válaszoljak kérdésre, vagy vigyelek máshova?`
                    : 'Szia! Nomi vagyok, a CMS asszisztensed. Mondd meg mit szeretnél - generálhatok tartalmat, válaszolhatok kérdésekre, vagy navigálhatlak az oldalak között!',
                timestamp: new Date()
            }
        ];
        setMessages(welcomeMessages);
    }, [formContext]);

    return {
        messages,
        setMessages,
        conversationHistory,
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
    };
}
