import { AlertCircle, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ApiKeyWarningProps {
    onClose: () => void;
}

export const ApiKeyWarning = ({ onClose }: ApiKeyWarningProps) => {
    const navigate = useNavigate();

    return (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <div className="flex items-start gap-2">
                <AlertCircle size={14} className="text-amber-500 mt-0.5 shrink-0" />
                <div className="text-xs">
                    <p className="text-amber-600 dark:text-amber-400 font-medium">API kulcs szükséges</p>
                    <p className="text-amber-600/70 dark:text-amber-400/70 mt-1">
                        Az AI chat használatához állítsd be az API kulcsodat.
                    </p>
                    <button
                        onClick={() => {
                            onClose();
                            navigate('/settings?tab=ai');
                        }}
                        className="mt-2 text-amber-600 dark:text-amber-400 underline flex items-center gap-1"
                    >
                        <Settings size={12} />
                        Beállítások megnyitása
                    </button>
                </div>
            </div>
        </div>
    );
};
