import React, { useState, useEffect, useRef } from 'react';
import { Shield, Lock, X, ArrowRight, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { verifyAdminPin } from '../../services/adminAuth';

export interface AdminPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (pin?: string) => void;
}

export const AdminPinModal: React.FC<AdminPinModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const isAuthenticatingRef = useRef(false);

  // Reset state whenever the modal opens or closes
  useEffect(() => {
    if (isOpen) {
      setPin('');
      setShowPin(false);
      setError(null);
      setIsLoading(false);
      isAuthenticatingRef.current = false;
    }
  }, [isOpen]);

  // Auto-login: continuously check credentials against DB/persistence as user types
  useEffect(() => {
    const trimmedPin = pin.trim();
    if (trimmedPin.length < 4 || isAuthenticatingRef.current || !isOpen) {
      return;
    }

    let isMounted = true;

    const checkCredentials = async () => {
      try {
        const isValid = await verifyAdminPin(trimmedPin);
        if (isValid && isMounted && !isAuthenticatingRef.current) {
          isAuthenticatingRef.current = true;
          setIsLoading(true);
          setError(null);

          // Brief delay for smooth tactile feedback
          setTimeout(() => {
            if (isMounted) {
              setPin('');
              setIsLoading(false);
              onSuccess(trimmedPin);
            }
          }, 200);
        }
      } catch {
        // Silently allow manual submission if async check fails
      }
    };

    checkCredentials();

    return () => {
      isMounted = false;
    };
  }, [pin, isOpen, onSuccess]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isAuthenticatingRef.current || isLoading) return;

    const enteredPin = pin.trim();
    if (!enteredPin) {
      setError('Please enter your security PIN');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const isValid = await verifyAdminPin(enteredPin);
      if (isValid) {
        isAuthenticatingRef.current = true;
        setPin('');
        onSuccess(enteredPin);
      } else {
        setError('Invalid Security PIN. Access denied.');
      }
    } catch {
      setError('Verification failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/70 backdrop-blur-md"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-sm rounded-3xl overlay-panel p-6 sm:p-7 flex flex-col gap-5 border border-[#FF8800]/30 shadow-2xl z-10"
        >
          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-xl text-[#6B6B75] dark:text-[#A0A0AA] hover:text-[#F86A00] transition-colors cursor-pointer"
            aria-label="Close PIN modal"
          >
            <X size={18} />
          </button>

          {/* Header */}
          <div className="flex flex-col items-center text-center gap-2">
            <div className="w-12 h-12 rounded-2xl bg-brand-gradient flex items-center justify-center text-white shadow-lg shadow-[#F86A00]/25">
              <Shield size={22} />
            </div>
            <h3 className="jost text-xl font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
              Admin Security Gate
            </h3>
            <p className="inter text-xs text-[#6B6B75] dark:text-[#A0A0AA] max-w-xs leading-relaxed">
              Enter the master operational PIN to unlock the centralized pricing engine, router rules, and audit ledger.
            </p>
          </div>

          {/* PIN Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="admin-pin-input"
                className="text-xs font-semibold text-[#6B6B75] dark:text-[#A0A0AA]"
              >
                Operational PIN Code
              </label>
              <div className="relative flex items-center">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-[#6B6B75] dark:text-[#A0A0AA]">
                  <Lock size={15} />
                </div>
                <input
                  id="admin-pin-input"
                  type={showPin ? 'text' : 'password'}
                  maxLength={8}
                  autoFocus
                  value={pin}
                  onChange={(e) => {
                    setPin(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder={showPin ? 'PIN' : '••••'}
                  className="w-full text-center tracking-widest text-lg font-mono font-bold py-2.5 pl-9 pr-10 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-[#1A1A1E] dark:text-[#F5F5F7] placeholder-[#A0A0AA] focus:outline-none focus:border-[#FF8800] transition-colors"
                />
                <button
                  type="button"
                  id="admin-pin-toggle-visibility"
                  onClick={() => setShowPin(!showPin)}
                  aria-label={showPin ? 'Hide PIN' : 'Reveal PIN'}
                  title={showPin ? 'Hide PIN (Eye is ON)' : 'Reveal PIN (Eye is OFF)'}
                  className={`absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center ${
                    showPin
                      ? 'text-[#F86A00] bg-[#FF8800]/15 border border-[#FF8800]/30 shadow-xs'
                      : 'text-[#6B6B75] dark:text-[#A0A0AA] hover:text-[#F86A00] hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                >
                  {showPin ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[#FF4B4B]/10 border border-[#FF4B4B]/20 text-[#FF4B4B] text-xs font-medium">
                <AlertCircle size={14} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              id="admin-login-btn"
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 rounded-xl text-xs font-bold text-white bg-brand-gradient shadow-md shadow-[#F86A00]/25 hover:opacity-95 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <span>{isLoading ? 'Logging in...' : 'Login'}</span>
              <ArrowRight size={14} />
            </button>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
