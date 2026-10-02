import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { toast, ToastMessage } from '../../services/toast';

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    return toast.subscribe((updated) => {
      setToasts(updated);
    });
  }, []);

  return (
    <div className="fixed bottom-5 inset-x-4 sm:inset-x-auto sm:right-5 sm:left-auto z-[9999] flex flex-col gap-2 max-w-sm sm:w-full mx-auto sm:mx-0 pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => {
          const isError = t.type === 'error';
          const isSuccess = t.type === 'success';
          const isWarning = t.type === 'warning';

          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 15, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl shadow-xl border backdrop-blur-md ${
                isError
                  ? 'bg-[#1C1212]/95 border-[#E23636]/40 text-[#F5F5F7]'
                  : isSuccess
                  ? 'bg-[#0E1A14]/95 border-[#28A745]/40 text-[#F5F5F7]'
                  : isWarning
                  ? 'bg-[#1A1810]/95 border-[#FFB020]/40 text-[#F5F5F7]'
                  : 'bg-[#18181B]/95 border-white/15 text-[#F5F5F7]'
              }`}
            >
              <div className="mt-0.5 shrink-0">
                {isError && <AlertCircle size={16} className="text-[#E23636]" />}
                {isSuccess && <CheckCircle2 size={16} className="text-[#28A745]" />}
                {isWarning && <AlertTriangle size={16} className="text-[#FFB020]" />}
                {!isError && !isSuccess && !isWarning && <Info size={16} className="text-[#FF8800]" />}
              </div>

              <div className="flex-1 text-xs font-medium leading-relaxed break-words">
                {t.message}
              </div>

              <button
                type="button"
                onClick={() => toast.dismiss(t.id)}
                className="shrink-0 p-1 text-[#A0A0AA] hover:text-white rounded-md transition-colors"
                aria-label="Dismiss"
              >
                <X size={14} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};
