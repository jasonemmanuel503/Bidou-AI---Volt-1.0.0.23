// Bidou AI FuturaPay Checkout Modal
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Smartphone, CheckCircle2, ShieldCheck, ArrowRight, Loader2, Star, CreditCard, AlertCircle } from 'lucide-react';
import { CreditPackage, PaymentRail, SavedPaymentMethod, PaymentMethodCountry } from '../../types';
import { persistence } from '../../services/persistence';
import { getCurrentUserId } from '../../services/authToken';
import { checkPaymentStatus } from '../../services/apiClient';
import {
  SUPPORTED_PAYMENT_COUNTRIES,
  getPaymentCountry,
  formatDisplayPhoneNumber,
  normalizePhoneNumber,
} from '../../services/paymentCountries';
import { PaymentRailLogo } from '../common/PaymentRailLogo';

export interface FuturaPayCheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedPackage: CreditPackage | null;
  onCompletePayment: (rail: PaymentRail, phone: string, pkg: CreditPackage) => Promise<any>;
  isAuthenticated?: boolean;
  userId?: string;
}

export const FuturaPayCheckoutModal: React.FC<FuturaPayCheckoutModalProps> = ({
  isOpen,
  onClose,
  selectedPackage,
  onCompletePayment,
  isAuthenticated = true,
  userId = getCurrentUserId() || '',
}) => {
  const [savedMethods, setSavedMethods] = useState<SavedPaymentMethod[]>([]);
  const [selectedMethodMode, setSelectedMethodMode] = useState<'saved' | 'new'>('saved');
  const [selectedSavedMethodId, setSelectedSavedMethodId] = useState<string | null>(null);

  const [paymentRail, setPaymentRail] = useState<PaymentRail>('mtn_momo');
  const [countryCode, setCountryCode] = useState<PaymentMethodCountry>('CM');
  const [phoneNumber, setPhoneNumber] = useState('677123456');
  const [saveForFuture, setSaveForFuture] = useState(true);

  const [isProcessing, setIsProcessing] = useState(false);
  const [step, setStep] = useState<'details' | 'awaiting_push' | 'success' | 'error'>('details');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setIsProcessing(false);
  };

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, []);

  const handleClose = () => {
    stopPolling();
    setStep('details');
    setErrorMessage('');
    onClose();
  };

  // Load saved payment methods on modal open and autofill primary method
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    (async () => {
      try {
        const methods = await persistence.listPaymentMethods(userId);
        if (isMounted) {
          setSavedMethods(methods);
          if (methods.length > 0) {
            const primary = methods.find((m) => m.is_primary) || methods[0];
            setSelectedMethodMode('saved');
            setSelectedSavedMethodId(primary.id);
            setPaymentRail(primary.rail);
            setCountryCode((primary.country_iso2 || (primary as any).country || 'CM') as PaymentMethodCountry);
            setPhoneNumber(primary.national_number || (primary as any).phone_number || '677123456');
          } else {
            setSelectedMethodMode('new');
            setSelectedSavedMethodId(null);
            setPaymentRail('mtn_momo');
            setCountryCode('CM');
            setPhoneNumber('677123456');
          }
        }
      } catch (err) {
        console.warn('[FuturaPay] Could not fetch saved payment methods:', err);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [isOpen, userId]);

  if (!isOpen || !selectedPackage) return null;

  const currentCountry = getPaymentCountry(countryCode);

  const handleSelectSavedMethod = (method: SavedPaymentMethod) => {
    setSelectedSavedMethodId(method.id);
    setPaymentRail(method.rail);
    setCountryCode((method.country_iso2 || (method as any).country || 'CM') as PaymentMethodCountry);
    setPhoneNumber(method.national_number || (method as any).phone_number || '');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = normalizePhoneNumber(phoneNumber, currentCountry.dialing_code);
    const fullFormattedPhone = `${currentCountry.dialing_code} ${cleanPhone}`;

    if (isAuthenticated === false) {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('bidou:pending_package', selectedPackage.id);
      }
      onClose();
      await onCompletePayment(paymentRail, fullFormattedPhone, selectedPackage);
      return;
    }

    // If using a new method and saveForFuture is checked, persist it
    if (selectedMethodMode === 'new' && saveForFuture && userId) {
      try {
        await persistence.createPaymentMethod({
          user_id: userId,
          rail: paymentRail,
          account_holder_name: 'Account Holder',
          country_iso2: countryCode,
          country_dial_code: currentCountry.dialing_code,
          national_number: cleanPhone,
          is_primary: savedMethods.length === 0,
        });
      } catch (saveErr) {
        console.warn('[FuturaPay] Error saving payment method for future use:', saveErr);
      }
    }

    setIsProcessing(true);
    setErrorMessage('');

    try {
      const checkout: any = await onCompletePayment(paymentRail, fullFormattedPhone, selectedPackage);

      if (checkout?.checkoutUrl) {
        return;
      }

      if (checkout?.mode === 'demo') {
        // In demo mode, keep the existing 2.8 s simulated timer but wrap it in try/catch
        setStep('awaiting_push');
        try {
          await new Promise((resolve) => setTimeout(resolve, 2800));
          setStep('success');
        } catch (simErr: any) {
          setErrorMessage(simErr?.message || 'Payment simulation failed');
          setStep('error');
        } finally {
          setIsProcessing(false);
        }
        return;
      }

      // LIVE MODE:
      setStep('awaiting_push');
      const refId = checkout?.referenceId;
      if (!refId) {
        throw new Error('Transaction reference could not be found');
      }

      const MAX_POLLS = 45; // 45 * 2s = 90s timeout
      let pollCount = 0;

      pollIntervalRef.current = setInterval(async () => {
        pollCount++;
        try {
          const statusRes = await checkPaymentStatus(refId);
          if (statusRes.status === 'successful') {
            stopPolling();
            setStep('success');
            return;
          }
          if (statusRes.status === 'failed' || statusRes.status === 'cancelled') {
            stopPolling();
            setErrorMessage('Payment was declined or cancelled. Please verify your mobile money balance and try again.');
            setStep('error');
            return;
          }
        } catch (err: any) {
          console.warn('[FuturaPay Poll] Check status warning:', err?.message || err);
        }

        if (pollCount >= MAX_POLLS) {
          stopPolling();
          setErrorMessage('Payment timed out waiting for authorization. If you already confirmed on your phone, credits will be added shortly.');
          setStep('error');
        }
      }, 2000);
    } catch (err: any) {
      stopPolling();
      setErrorMessage(err?.message || 'Failed to initiate payment. Please check your phone number and try again.');
      setStep('error');
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
          onClick={() => !isProcessing && handleClose()}
          className="absolute inset-0 bg-black/75 backdrop-blur-md"
        />

        {/* Modal Window with top and bottom framing accents */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full max-w-lg rounded-2xl overlay-panel p-6 overflow-hidden max-h-[90vh] overflow-y-auto"
        >
          {/* Top subtle gradient accent */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-brand-gradient" />

          {/* Close button */}
          {!isProcessing && (
            <button
              type="button"
              onClick={handleClose}
              className="absolute top-3 right-3 min-h-11 min-w-11 p-2 rounded-xl text-[#6B6B75] dark:text-[#A0A0AA] hover:text-[#FF4B4B] transition-colors cursor-pointer flex items-center justify-center"
              aria-label="Close Checkout"
            >
              <X size={18} />
            </button>
          )}

          {step === 'details' && (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-brand-gradient">
                  FuturaPay Secure Mobile Checkout
                </span>
                <h3 className="jost text-xl font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                  {selectedPackage.name}
                </h3>
                <p className="inter text-xs text-[#6B6B75] dark:text-[#A0A0AA] mt-0.5">
                  Instant credit delivery to your Universal Wallet
                </p>
              </div>

              {/* Package Summary Box */}
              <div className="p-3.5 rounded-xl bg-black/5 dark:bg-white/5 border border-[#FF8800]/25 flex items-center justify-between">
                <div>
                  <span className="text-xs text-[#6B6B75] dark:text-[#A0A0AA] block">Total Amount:</span>
                  <span className="text-xl font-extrabold text-[#1A1A1E] dark:text-[#F5F5F7] font-mono">
                    {selectedPackage.price_fcfa.toLocaleString()} FCFA
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-[#6B6B75] dark:text-[#A0A0AA] block">Credits Granted:</span>
                  <span className="text-base font-bold text-brand-gradient font-mono">
                    +{selectedPackage.credits.toLocaleString()} Cr
                  </span>
                </div>
              </div>

              {/* Saved Methods Switcher (If user has saved methods) */}
              {savedMethods.length > 0 && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#1A1A1E] dark:text-[#F5F5F7] flex items-center gap-1.5">
                      <CreditCard size={14} className="text-[#FF8800]" />
                      <span>Payment Method</span>
                    </span>
                    <div className="flex items-center gap-1 text-[11px]">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedMethodMode('saved');
                          const primary = savedMethods.find((m) => m.is_primary) || savedMethods[0];
                          handleSelectSavedMethod(primary);
                        }}
                        className={`px-2 py-0.5 rounded-lg font-bold transition-all ${
                          selectedMethodMode === 'saved'
                            ? 'bg-[#FF8800]/20 text-[#FF8800]'
                            : 'text-[#6B6B75] hover:text-[#1A1A1E] dark:hover:text-white'
                        }`}
                      >
                        Saved Method ({savedMethods.length})
                      </button>
                      <span>•</span>
                      <button
                        type="button"
                        onClick={() => setSelectedMethodMode('new')}
                        className={`px-2 py-0.5 rounded-lg font-bold transition-all ${
                          selectedMethodMode === 'new'
                            ? 'bg-[#FF8800]/20 text-[#FF8800]'
                            : 'text-[#6B6B75] hover:text-[#1A1A1E] dark:hover:text-white'
                        }`}
                      >
                        New Number
                      </button>
                    </div>
                  </div>

                  {selectedMethodMode === 'saved' && (
                    <div className="flex flex-col gap-2">
                      {savedMethods.map((m) => {
                        const isSelected = selectedSavedMethodId === m.id;
                        const countryIso = (m.country_iso2 || (m as any).country || 'CM') as PaymentMethodCountry;
                        const c = getPaymentCountry(countryIso);
                        const dialCode = m.country_dial_code || (m as any).dialing_code || c.dialing_code;
                        const nationalNum = m.national_number || (m as any).phone_number || '';
                        return (
                          <div
                            key={m.id}
                            onClick={() => handleSelectSavedMethod(m)}
                            className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                              isSelected
                                ? 'border-[#FF8800] bg-[#FF8800]/10 shadow-xs'
                                : 'border-black/10 dark:border-white/10 hover:border-[#FF8800]/50'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <PaymentRailLogo rail={m.rail} size="md" />
                              <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                                    {m.rail === 'mtn_momo' ? 'MTN MoMo' : 'Orange Money'}
                                  </span>
                                  {m.is_primary && (
                                    <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-[#FF8800]/15 text-[#FF8800] flex items-center gap-0.5">
                                      <Star size={9} />
                                      Primary
                                    </span>
                                  )}
                                </div>
                                <span className="text-xs font-mono text-[#6B6B75] dark:text-[#A0A0AA]">
                                  {c.flag_emoji} {formatDisplayPhoneNumber(dialCode, nationalNum)}
                                </span>
                              </div>
                            </div>

                            <div
                              className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                                isSelected ? 'border-[#FF8800] bg-[#FF8800]' : 'border-[#6B6B75]'
                              }`}
                            >
                              {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Enter / Edit Number Mode */}
              {selectedMethodMode === 'new' && (
                <div className="flex flex-col gap-3">
                  {/* Payment Rail Selector */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-[#1A1A1E] dark:text-[#F5F5F7]">
                      Select Mobile Money Rail:
                    </span>
                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => setPaymentRail('mtn_momo')}
                        className={`flex items-center gap-2 p-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                          paymentRail === 'mtn_momo'
                            ? 'border-[#FFCC00] bg-[#FFCC00]/15 text-[#1A1A1E] dark:text-white shadow-sm ring-1 ring-[#FFCC00]'
                            : 'border-black/10 dark:border-white/10 text-[#6B6B75] hover:bg-black/5'
                        }`}
                      >
                        <PaymentRailLogo rail="mtn_momo" size="sm" />
                        <span>MTN MoMo</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setPaymentRail('orange_money')}
                        className={`flex items-center gap-2 p-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                          paymentRail === 'orange_money'
                            ? 'border-[#FF6600] bg-[#FF6600]/15 text-[#1A1A1E] dark:text-white shadow-sm ring-1 ring-[#FF6600]'
                            : 'border-black/10 dark:border-white/10 text-[#6B6B75] hover:bg-black/5'
                        }`}
                      >
                        <PaymentRailLogo rail="orange_money" size="sm" />
                        <span>Orange Money</span>
                      </button>
                    </div>
                  </div>

                  {/* Country Selector & Phone Number Field */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-[#1A1A1E] dark:text-[#F5F5F7]">
                      Mobile Money Country & Phone Number:
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={countryCode}
                        onChange={(e) => setCountryCode(e.target.value as PaymentMethodCountry)}
                        className="w-2/5 px-2.5 py-2.5 rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 text-xs font-semibold text-[#1A1A1E] dark:text-[#F5F5F7] focus:outline-none focus:border-[#FF8800]"
                      >
                        {SUPPORTED_PAYMENT_COUNTRIES.map((c) => (
                          <option key={c.code} value={c.code} className="bg-[#18181B] text-white">
                            {c.flag_emoji} {c.name} ({c.dialing_code})
                          </option>
                        ))}
                      </select>

                      <div className="flex-1 flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5">
                        <span className="text-xs font-mono font-bold text-[#FF8800]">
                          {currentCountry.dialing_code}
                        </span>
                        <input
                          type="tel"
                          required
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(e.target.value)}
                          placeholder="6XXXXXXXX"
                          className="w-full bg-transparent text-xs text-[#1A1A1E] dark:text-[#F5F5F7] font-mono focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Save for future checkbox */}
                  <label className="flex items-center gap-2 text-xs text-[#6B6B75] dark:text-[#A0A0AA] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={saveForFuture}
                      onChange={(e) => setSaveForFuture(e.target.checked)}
                      className="rounded border-[#6B6B75] text-[#FF8800] focus:ring-[#FF8800]"
                    />
                    <span>Save this payment method to my account for instant future checkout</span>
                  </label>
                </div>
              )}

              <div className="flex items-center gap-2 text-[11px] text-[#6B6B75] dark:text-[#A0A0AA] px-1">
                <ShieldCheck size={14} className="text-[#2ECC71] shrink-0" />
                <span>Encrypted 256-bit payment via FuturaPay API (api.futurapay.com)</span>
              </div>

              {!isAuthenticated && (
                <div className="p-3 rounded-xl bg-[#FF8800]/10 border border-[#FF8800]/30 text-xs text-[#1A1A1E] dark:text-[#F5F5F7] flex items-center gap-2">
                  <span className="leading-snug">
                    Create a free account to complete this purchase — your selected plan will carry over.
                  </span>
                </div>
              )}

              <button
                type="submit"
                className="w-full min-h-11 py-3 rounded-xl text-xs font-bold text-white bg-brand-gradient shadow-lg shadow-[#F86A00]/25 hover:opacity-95 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer mt-2"
              >
                <span>
                  {isAuthenticated === false
                    ? `Continue to Sign Up (${selectedPackage.price_fcfa.toLocaleString()} FCFA)`
                    : `Pay ${selectedPackage.price_fcfa.toLocaleString()} FCFA`}
                </span>
                <ArrowRight size={15} />
              </button>
            </form>
          )}

          {step === 'awaiting_push' && (
            <div className="flex flex-col items-center justify-center text-center p-6 gap-3">
              <div className="w-16 h-16 rounded-full bg-brand-gradient flex items-center justify-center text-white shadow-xl shadow-[#F86A00]/25 animate-pulse">
                <Smartphone size={32} />
              </div>
              <h4 className="jost text-lg font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                Authorize on your phone
              </h4>
              <p className="inter text-xs text-[#6B6B75] dark:text-[#A0A0AA] max-w-xs">
                A USSD push has been sent to <strong>{currentCountry.dialing_code} {phoneNumber}</strong> via {paymentRail === 'mtn_momo' ? 'MTN MoMo' : 'Orange Money'}. Please enter your PIN to approve the transaction.
              </p>
              <div className="flex items-center gap-2 text-xs font-semibold text-brand-gradient mt-3">
                <Loader2 size={16} className="animate-spin" />
                <span>Waiting for mobile money approval...</span>
              </div>
            </div>
          )}

          {step === 'error' && (
            <div className="flex flex-col items-center justify-center text-center p-6 gap-3">
              <div className="w-16 h-16 rounded-full bg-[#FF4B4B]/15 text-[#FF4B4B] flex items-center justify-center shadow-lg">
                <AlertCircle size={36} />
              </div>
              <h4 className="jost text-xl font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                Payment Incomplete
              </h4>
              <p className="inter text-xs text-[#6B6B75] dark:text-[#A0A0AA] max-w-xs leading-relaxed">
                {errorMessage || 'Unable to confirm transaction approval. Please verify your mobile money balance and try again.'}
              </p>
              <button
                type="button"
                onClick={() => {
                  setErrorMessage('');
                  setStep('details');
                }}
                className="w-full py-2.5 rounded-xl text-xs font-bold text-white bg-brand-gradient shadow-md shadow-[#F86A00]/20 hover:opacity-95 transition-all mt-4 cursor-pointer"
              >
                Try Again
              </button>
            </div>
          )}

          {step === 'success' && (
            <div className="flex flex-col items-center justify-center text-center p-6 gap-3">
              <div className="w-16 h-16 rounded-full bg-[#2ECC71]/15 text-[#2ECC71] flex items-center justify-center shadow-lg">
                <CheckCircle2 size={36} />
              </div>
              <h4 className="jost text-xl font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                Payment Confirmed!
              </h4>
              <p className="inter text-xs text-[#6B6B75] dark:text-[#A0A0AA]">
                <strong>+{selectedPackage.credits.toLocaleString()} Universal Credits</strong> have been deposited into your account ledger.
              </p>
              <button
                type="button"
                onClick={() => {
                  handleClose();
                }}
                className="w-full py-2.5 rounded-xl text-xs font-bold text-white bg-brand-gradient shadow-md shadow-[#F86A00]/20 hover:opacity-95 transition-all mt-4 cursor-pointer"
              >
                Return to Creative Studio
              </button>
            </div>
          )}

          {/* Bottom subtle gradient accent */}
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-brand-gradient opacity-60" />
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
