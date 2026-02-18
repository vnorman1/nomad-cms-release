import { Bot, Terminal, User } from 'lucide-react';
import type { Message, FormContext } from './types';
import { ActionCard } from './ActionCard';
import { ConfirmCard } from './ConfirmCard';
import type { PendingAction } from '@/context/AiContext';

interface MessageBubbleProps {
    msg: Message;
    formContext?: FormContext;
    onFillForm: (data: unknown) => void;
    onConfirmAction: (action: PendingAction) => void;
    isNavigating: boolean;
    onCancel: () => void;
}

export const MessageBubble = ({
    msg,
    formContext,
    onFillForm,
    onConfirmAction,
    isNavigating,
    onCancel
}: MessageBubbleProps) => (
    <div className={`flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
        {/* Sender Label */}
        <div className="flex items-center gap-2 px-1">
            {msg.role === 'user' ? (
                <>
                    <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">Te</span>
                    <User size={10} className="text-muted-foreground" />
                </>
            ) : (
                <>
                    {msg.role === 'system' ? <Terminal size={10} className="text-blue-500" /> : <Bot size={10} className="text-foreground" />}
                    <span className={`text-[9px] font-mono uppercase tracking-widest ${msg.role === 'system' ? 'text-blue-500' : 'text-foreground'}`}>
                        {msg.role === 'system' ? 'Rendszer' : 'Nomi'}
                    </span>
                </>
            )}
        </div>

        {/* Bubble */}
        <div className={`
            max-w-[90%] p-3 text-xs leading-relaxed border
            ${msg.role === 'user'
                ? 'bg-foreground text-background border-transparent rounded-l-lg rounded-tr-lg rounded-br-none'
                : msg.role === 'system'
                    ? 'bg-blue-500/10 text-blue-500 border-blue-500/20 font-mono rounded-lg'
                    : msg.type === 'error'
                        ? 'bg-destructive/10 text-destructive border-destructive/20 rounded-lg'
                        : 'bg-muted/30 text-foreground border-border rounded-r-lg rounded-tl-lg rounded-bl-none'}
        `}>
            {/* Render markdown-like content */}
            <div className="whitespace-pre-wrap break-words">
                {msg.content.split('\n').map((line, i) => (
                    <span key={i}>
                        {line.startsWith('**') && line.endsWith('**') ? (
                            <strong>{line.slice(2, -2)}</strong>
                        ) : line.startsWith('• ') ? (
                            <span className="block ml-2">{line}</span>
                        ) : (
                            line
                        )}
                        {i < msg.content.split('\n').length - 1 && <br />}
                    </span>
                ))}
            </div>
        </div>

        {/* Action Card for Form Fill */}
        {msg.type === 'action' && msg.metadata?.generatedData && formContext && (
            <ActionCard
                generatedData={msg.metadata.generatedData}
                formContext={formContext}
                onFillForm={onFillForm}
            />
        )}

        {/* Confirm Card for New Item Creation */}
        {msg.type === 'confirm' && msg.metadata?.pendingAction && (
            <ConfirmCard
                pendingAction={msg.metadata.pendingAction}
                onConfirm={onConfirmAction}
                onCancel={onCancel}
                isNavigating={isNavigating}
            />
        )}

        {/* Timestamp */}
        <span className="text-[8px] text-muted-foreground/50 font-mono px-1">
            {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
    </div>
);
