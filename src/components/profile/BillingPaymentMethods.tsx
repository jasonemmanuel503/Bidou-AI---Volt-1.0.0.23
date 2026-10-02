import React, { useEffect, useState, useRef } from 'react';
import {
  CreditCard,
  Plus,
  Star,
  Trash2,
  Pencil,
  Check,
  X,
  Upload,
  AlertCircle,
  Loader2,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import { UserPaymentMethod, PaymentRail } from '../../types';
import { persistence } from '../../services/persistence';
import {
  COUNTRY_DIAL_CODES,
  DEFAULT_COUNTRY,
  getCountryByIso2,
  getCountryByDialCode,
} from '../../services/countryDialCodes';
import { CountryPhoneInput, CountryPhoneValue } from './CountryPhoneInput';

export interface BillingPaymentMethodsProps {
  userId: string;
  onMethodsChange?: (methods: UserPaymentMethod[]) => void;
}

export const BillingPaymentMethods: React.FC<BillingPaymentMethodsProps> = ({
  userId,
  onMethodsChange,
}) => {
  const [methods, setMethods] = useState<UserPaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Inline delete confirmation state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteWarning, setDeleteWarning] = useState<string | null>(null);

  // Form states
  const [rail, setRail] = useState<PaymentRail>('mtn_momo');
  const [accountHolderName, setAccountHolderName] = useState('');
  const [phoneValue, setPhoneValue] = useState<CountryPhoneValue>({
    dialCode: DEFAULT_COUNTRY.dialCode,
    iso2: DEFAULT_COUNTRY.iso2,
    nationalNumber: '677123456',
  });
  const [logoMode, setLogoMode] = useState<'preset' | 'custom'>('preset');
  const [customLogoFile, setCustomLogoFile] = useState<File | null>(null);
  const [customLogoPreview, setCustomLogoPreview] = useState<string | null>(null);
  const [isPrimary, setIsPrimary] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const reload = async () => {
    setLoading(true);
    try {
      const data = await persistence.listPaymentMethods(userId);
      setMethods(data);
      if (onMethodsChange) onMethodsChange(data);
    } catch (err: any) {
      console.error('Failed to load payment methods:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, [userId]);

  const openCreateForm = () => {
    setEditingId(null);
    setRail('mtn_momo');
    setAccountHolderName('');
    setPhoneValue({
      dialCode: DEFAULT_COUNTRY.dialCode,
      iso2: DEFAULT_COUNTRY.iso2,
      nationalNumber: '',
    });
    setLogoMode('preset');
    setCustomLogoFile(null);
    setCustomLogoPreview(null);
    setIsPrimary(methods.length === 0);
    setError(null);
    setSuccessMessage(null);
    setFormOpen(true);
  };

  const openEditForm = (m: UserPaymentMethod) => {
    setEditingId(m.id);
    setRail(m.rail);
    setAccountHolderName(m.account_holder_name);
    setPhoneValue({
      dialCode: m.country_dial_code,
      iso2: m.country_iso2,
      nationalNumber: m.national_number,
    });
    setLogoMode(m.logo_key === 'custom' ? 'custom' : 'preset');
    setCustomLogoFile(null);
    setCustomLogoPreview(m.custom_logo_url || null);
    setIsPrimary(m.is_primary);
    setError(null);
    setSuccessMessage(null);
    setFormOpen(true);
  };

  const handleCustomLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please choose a valid image file (PNG, JPG, WebP).');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setError('Custom logo must be under 2MB.');
      return;
    }

    setError(null);
    setCustomLogoFile(file);
    const previewUrl = URL.createObjectURL(file);
    setCustomLogoPreview(previewUrl);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    // Validation
    const cleanHolder = accountHolderName.trim();
    if (!cleanHolder) {
      setError('Please enter the account holder name.');
      return;
    }

    const cleanNum = phoneValue.nationalNumber.replace(/\D/g, '');
    const country = getCountryByIso2(phoneValue.iso2);
    if (cleanNum.length < Math.max(6, country.nationalNumberLength - 2) || cleanNum.length > 14) {
      setError(`Please enter a valid phone number for ${country.name}.`);
      return;
    }

    setIsSubmitting(true);
    try {
      let customUrl = customLogoPreview;
      if (logoMode === 'custom' && customLogoFile) {
        customUrl = await persistence.uploadPaymentLogo(userId, customLogoFile);
      }

      if (editingId) {
        await persistence.updatePaymentMethod(editingId, {
          rail,
          account_holder_name: cleanHolder,
          country_iso2: phoneValue.iso2,
          country_dial_code: phoneValue.dialCode,
          national_number: cleanNum,
          logo_key: logoMode === 'custom' ? 'custom' : (rail === 'mtn_momo' ? 'mtn' : 'orange'),
          custom_logo_url: logoMode === 'custom' ? customUrl : null,
          is_primary: isPrimary,
        });
        setSuccessMessage('Payment method updated successfully.');
      } else {
        await persistence.createPaymentMethod({
          user_id: userId,
          rail,
          account_holder_name: cleanHolder,
          country_iso2: phoneValue.iso2,
          country_dial_code: phoneValue.dialCode,
          national_number: cleanNum,
          logo_key: logoMode === 'custom' ? 'custom' : (rail === 'mtn_momo' ? 'mtn' : 'orange'),
          custom_logo_url: logoMode === 'custom' ? customUrl : null,
          is_primary: isPrimary || methods.length === 0,
        });
        setSuccessMessage('Payment method saved successfully.');
      }

      await reload();
      setFormOpen(false);
    } catch (err: any) {
      console.error('Failed to save payment method:', err);
      const msg = err.message || '';
      if (msg.includes('unique') || msg.includes('already saved') || msg.includes('duplicate')) {
        setError('This phone number is already saved for this payment rail.');
      } else {
        setError(msg || 'Failed to save payment method. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    const target = methods.find((m) => m.id === id);
    if (!target) return;

    // B.8 check: deleting primary when another method exists requires picking new primary first
    if (target.is_primary && methods.length > 1) {
      setDeleteWarning(
        'This is currently your primary payment method. Please set another method as primary before deleting it.'
      );
      return;
    }

    try {
      await persistence.deletePaymentMethod(id, userId);
      setDeletingId(null);
      setDeleteWarning(null);
      await reload();
    } catch (err: any) {
      console.error('Failed to delete payment method:', err);
      setError('Failed to delete payment method.');
    }
  };

  const handleSetPrimary = async (id: string) => {
    try {
      await persistence.setPrimaryPaymentMethod(id, userId);
      await reload();
    } catch (err: any) {
      console.error('Failed to set primary method:', err);
      setError('Failed to set primary payment method.');
    }
  };

  // Helper to render logo tile
  const renderLogoTile = (method: UserPaymentMethod) => {
    if (method.logo_key === 'custom' && method.custom_logo_url) {
      return (
        <img
          src={method.custom_logo_url}
          alt={method.rail}
          className="w-10 h-10 rounded-xl object-cover border border-black/10 dark:border-white/10 shrink-0"
        />
      );
    }

    if (method.rail === 'mtn_momo' || method.logo_key === 'mtn') {
      return (
        <div className="w-10 h-10 rounded-xl bg-[#FFCC00] flex items-center justify-center font-black text-black text-sm shadow-sm shrink-0 select-none">
          M
        </div>
      );
    }

    return (
      <div className="w-10 h-10 rounded-xl bg-[#FF6600] flex items-center justify-center font-black text-white text-sm shadow-sm shrink-0 select-none">
        O
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl glass-panel border border-[#FF8800]/25 bg-gradient-to-r from-[#FF8800]/10 via-transparent to-[#F86A00]/5">
        <div>
          <h3 className="jost text-base sm:text-lg font-bold text-[#1A1A1E] dark:text-[#F5F5F7] flex items-center gap-2">
            <CreditCard size={20} className="text-[#FF8800]" />
            Payment Methods & African Mobile Money
          </h3>
          <p className="inter text-xs text-[#6B6B75] dark:text-[#A0A0AA] mt-1 max-w-xl">
            Save MTN Mobile Money or Orange Money accounts for faster checkout. Your primary method is pre-filled automatically on future purchases across all 11 supported countries.
          </p>
        </div>

        {!formOpen && (
          <button
            type="button"
            id="add-payment-method-btn"
            onClick={openCreateForm}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-brand-gradient text-white text-xs font-bold shadow-md hover:opacity-95 transition-all cursor-pointer shrink-0"
          >
            <Plus size={15} /> Add method
          </button>
        )}
      </div>

      {/* Messages */}
      {successMessage && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-semibold animate-in fade-in">
          <CheckCircle2 size={16} />
          <span>{successMessage}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-semibold animate-in fade-in">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {deleteWarning && (
        <div className="flex items-start justify-between gap-2 p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/35 text-amber-700 dark:text-amber-300 text-xs font-medium">
          <div className="flex items-start gap-2">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{deleteWarning}</span>
          </div>
          <button
            type="button"
            onClick={() => setDeleteWarning(null)}
            className="text-amber-700 dark:text-amber-300 hover:opacity-80 p-0.5"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Form Modal / Inline Card */}
      {formOpen && (
        <div className="p-6 rounded-2xl glass-panel border border-[#FF8800]/30 shadow-lg flex flex-col gap-5 animate-in fade-in zoom-in-98 duration-200">
          <div className="flex items-center justify-between pb-3 border-b border-black/10 dark:border-white/10">
            <h4 className="jost text-sm font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
              {editingId ? 'Edit Payment Method' : 'Add New Payment Method'}
            </h4>
            <button
              type="button"
              onClick={() => {
                setFormOpen(false);
                setError(null);
              }}
              className="p-1 rounded-lg text-[#6B6B75] hover:text-[#1A1A1E] dark:hover:text-white transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Payment Rail Selector */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                Select Mobile Money Rail
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  id="rail-picker-mtn"
                  onClick={() => setRail('mtn_momo')}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer text-left ${
                    rail === 'mtn_momo'
                      ? 'border-[#FFCC00] bg-[#FFCC00]/10 ring-2 ring-[#FFCC00]/40'
                      : 'border-black/10 dark:border-white/10 hover:border-black/20 dark:hover:border-white/20'
                  }`}
                >
                  <div className="w-8 h-8 rounded-lg bg-[#FFCC00] flex items-center justify-center font-black text-black text-xs shrink-0">
                    M
                  </div>
                  <div>
                    <span className="block text-xs font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                      MTN MoMo
                    </span>
                    <span className="block text-[11px] text-[#6B6B75] dark:text-[#A0A0AA]">
                      Instant USSD push
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  id="rail-picker-orange"
                  onClick={() => setRail('orange_money')}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer text-left ${
                    rail === 'orange_money'
                      ? 'border-[#FF6600] bg-[#FF6600]/10 ring-2 ring-[#FF6600]/40'
                      : 'border-black/10 dark:border-white/10 hover:border-black/20 dark:hover:border-white/20'
                  }`}
                >
                  <div className="w-8 h-8 rounded-lg bg-[#FF6600] flex items-center justify-center font-black text-white text-xs shrink-0">
                    O
                  </div>
                  <div>
                    <span className="block text-xs font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                      Orange Money
                    </span>
                    <span className="block text-[11px] text-[#6B6B75] dark:text-[#A0A0AA]">
                      Fast verification
                    </span>
                  </div>
                </button>
              </div>
            </div>

            {/* Account Holder Name */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="holder-name" className="text-xs font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                Account Holder Full Name
              </label>
              <input
                id="holder-name"
                type="text"
                required
                value={accountHolderName}
                onChange={(e) => setAccountHolderName(e.target.value)}
                placeholder="e.g. Amina Diallo"
                className="w-full px-3 py-2.5 rounded-xl border border-black/15 dark:border-white/15 bg-black/5 dark:bg-white/5 text-xs text-[#1A1A1E] dark:text-[#F5F5F7] focus:outline-none focus:border-[#FF8800]"
              />
            </div>

            {/* Phone Input with Auto-Routing */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                Phone Number (Type or paste with +country code)
              </label>
              <CountryPhoneInput
                id="payment-method-phone"
                value={phoneValue}
                onChange={(next) => setPhoneValue(next)}
                placeholder="677123456"
              />
              <span className="text-[11px] text-[#6B6B75] dark:text-[#A0A0AA]">
                Tip: Typing a code like <strong className="text-[#FF8800]">+221</strong> or <strong className="text-[#FF8800]">+237</strong> automatically detects and switches the country.
              </span>
            </div>

            {/* Logo Configuration (B.6.3 Preset vs Custom) */}
            <div className="flex flex-col gap-2 p-3 rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                  Brand Icon / Logo Display
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setLogoMode('preset')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                      logoMode === 'preset'
                        ? 'bg-brand-gradient text-white shadow-xs'
                        : 'text-[#6B6B75] hover:text-[#1A1A1E] dark:hover:text-white'
                    }`}
                  >
                    Preset Badge
                  </button>
                  <button
                    type="button"
                    onClick={() => setLogoMode('custom')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                      logoMode === 'custom'
                        ? 'bg-brand-gradient text-white shadow-xs'
                        : 'text-[#6B6B75] hover:text-[#1A1A1E] dark:hover:text-white'
                    }`}
                  >
                    Upload Custom
                  </button>
                </div>
              </div>

              {logoMode === 'preset' ? (
                <div className="flex items-center gap-3 pt-1 text-xs text-[#6B6B75] dark:text-[#A0A0AA]">
                  {rail === 'mtn_momo' ? (
                    <div className="w-8 h-8 rounded-lg bg-[#FFCC00] flex items-center justify-center font-black text-black text-xs shrink-0">
                      M
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-[#FF6600] flex items-center justify-center font-black text-white text-xs shrink-0">
                      O
                    </div>
                  )}
                  <span>
                    Using vector {rail === 'mtn_momo' ? 'MTN yellow badge' : 'Orange Money badge'}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-3 pt-1">
                  {customLogoPreview && (
                    <img
                      src={customLogoPreview}
                      alt="Preview"
                      className="w-10 h-10 rounded-xl object-cover border border-black/10 dark:border-white/10 shrink-0"
                    />
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleCustomLogoSelect}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-black/15 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/5 text-xs font-semibold text-[#1A1A1E] dark:text-[#F5F5F7] cursor-pointer"
                  >
                    <Upload size={13} />
                    {customLogoPreview ? 'Change logo' : 'Choose image (max 2MB)'}
                  </button>
                </div>
              )}
            </div>

            {/* Set as Primary Checkbox */}
            <label className="flex items-center gap-2 cursor-pointer select-none pt-1">
              <input
                type="checkbox"
                checked={isPrimary}
                onChange={(e) => setIsPrimary(e.target.checked)}
                className="w-4 h-4 rounded text-[#FF8800] focus:ring-[#FF8800] border-black/20"
              />
              <span className="text-xs font-medium text-[#1A1A1E] dark:text-[#F5F5F7]">
                Set as primary payment method (pre-filled automatically at checkout)
              </span>
            </label>

            {/* Form Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl text-xs font-bold text-[#6B6B75] hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7] transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-brand-gradient text-white text-xs font-bold shadow-md hover:opacity-95 transition-all cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Saving...
                  </>
                ) : (
                  <>
                    <Check size={14} /> {editingId ? 'Update Method' : 'Save Method'}
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Methods List */}
      {loading ? (
        <div className="p-12 flex flex-col items-center justify-center gap-3 text-[#6B6B75]">
          <Loader2 size={24} className="animate-spin text-[#FF8800]" />
          <span className="text-xs font-medium">Loading saved payment methods...</span>
        </div>
      ) : methods.length === 0 ? (
        <div className="p-8 rounded-2xl glass-panel border border-dashed border-black/15 dark:border-white/15 text-center flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-brand-gradient/10 flex items-center justify-center text-[#FF8800]">
            <CreditCard size={24} />
          </div>
          <div>
            <h4 className="jost text-sm font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
              No Saved Payment Methods
            </h4>
            <p className="inter text-xs text-[#6B6B75] dark:text-[#A0A0AA] mt-1 max-w-sm mx-auto">
              Save your MTN Mobile Money or Orange Money accounts to enjoy 1-click checkout without having to re-enter your phone number each time.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreateForm}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-gradient text-white text-xs font-bold shadow-md hover:opacity-95 transition-all cursor-pointer mt-1"
          >
            <Plus size={14} /> Add your first method
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {methods.map((method) => {
            const country = getCountryByIso2(method.country_iso2);
            const isDeleting = deletingId === method.id;

            return (
              <div
                key={method.id}
                id={`payment-method-card-${method.id}`}
                className={`p-4 rounded-2xl glass-panel border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                  method.is_primary
                    ? 'border-[#FF8800]/50 bg-gradient-to-r from-[#FF8800]/5 to-transparent'
                    : 'border-black/10 dark:border-white/10 hover:border-black/20 dark:hover:border-white/20'
                }`}
              >
                {/* Method info */}
                <div className="flex items-center gap-3.5">
                  {renderLogoTile(method)}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="jost text-sm font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                        {method.rail === 'mtn_momo' ? 'MTN MoMo' : 'Orange Money'}
                      </span>
                      {method.is_primary && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand-gradient text-white shadow-xs">
                          Primary
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs font-mono font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                        {country.flag} {method.country_dial_code} {method.national_number}
                      </span>
                      <span className="text-[#6B6B75]">•</span>
                      <span className="text-xs text-[#6B6B75] dark:text-[#A0A0AA]">
                        {method.account_holder_name}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 self-end sm:self-center">
                  {isDeleting ? (
                    <div className="flex items-center gap-2 bg-rose-500/10 p-1.5 rounded-xl border border-rose-500/30">
                      <span className="text-[11px] text-rose-600 dark:text-rose-400 font-semibold px-1">
                        Delete?
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDelete(method.id)}
                        className="px-2.5 py-1 rounded-lg bg-rose-600 text-white text-[11px] font-bold hover:bg-rose-700 transition-colors"
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingId(null)}
                        className="px-2 py-1 rounded-lg text-[#6B6B75] hover:text-[#1A1A1E] dark:hover:text-white text-[11px] font-semibold"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      {!method.is_primary && (
                        <button
                          type="button"
                          id={`set-primary-${method.id}`}
                          onClick={() => handleSetPrimary(method.id)}
                          title="Set as primary default payment method"
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-black/10 dark:border-white/10 hover:border-[#FF8800]/40 text-[#6B6B75] hover:text-[#FF8800] text-xs font-semibold transition-all cursor-pointer"
                        >
                          <Star size={13} /> Set primary
                        </button>
                      )}

                      <button
                        type="button"
                        id={`edit-method-${method.id}`}
                        onClick={() => openEditForm(method)}
                        title="Edit payment method"
                        className="p-2 rounded-xl text-[#6B6B75] hover:text-[#1A1A1E] dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                      >
                        <Pencil size={15} />
                      </button>

                      <button
                        type="button"
                        id={`delete-method-${method.id}`}
                        onClick={() => {
                          setDeleteWarning(null);
                          setDeletingId(method.id);
                        }}
                        title="Delete payment method"
                        className="p-2 rounded-xl text-[#6B6B75] hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                      >
                        <Trash2 size={15} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Security Footnote */}
      <div className="flex items-center gap-2 text-[11px] text-[#6B6B75] dark:text-[#A0A0AA] px-1">
        <ShieldCheck size={14} className="text-emerald-500" />
        <span>
          Bank-grade encryption: PINs, OTPs, or passwords are never stored or requested by Bidou AI.
        </span>
      </div>
    </div>
  );
};
