import React, { useState, useEffect, useRef } from 'react';
import {
  User,
  Shield,
  CreditCard,
  Award,
  Sparkles,
  Share2,
  Copy,
  Check,
  Upload,
  Globe,
  Palette,
  AlertCircle,
  MousePointer,
  Users,
  CheckCircle2,
  TrendingUp,
} from 'lucide-react';
import { UserProfile, CreditWallet, AppView, AffiliateStats } from '../../types';
import { Avatar } from '../common/Avatar';
import { TierBadge } from '../common/TierBadge';
import { persistence } from '../../services/persistence';
import { TIER_LABEL } from '../../services/tiers';
import { BillingTab } from './BillingTab';

export type ProfileTab = 'account' | 'billing' | 'credits' | 'affiliate' | 'security';

export interface ProfileViewProps {
  user: UserProfile;
  wallet: CreditWallet;
  onUpdateUser: (updated: UserProfile) => void;
  onNavigateToView: (view: AppView) => void;
  theme: 'light' | 'dark';
  setTheme: (t: 'light' | 'dark') => void;
  initialTab?: ProfileTab;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  user,
  wallet,
  onUpdateUser,
  onNavigateToView,
  theme,
  setTheme,
  initialTab,
}) => {
  const [activeTab, setActiveTab] = useState<ProfileTab>(initialTab || 'account');

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone || '');
  const [language, setLanguage] = useState<'fr' | 'en'>(user.language_preference || 'fr');
  const [copiedAffiliate, setCopiedAffiliate] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [optimisticPreview, setOptimisticPreview] = useState<string | null>(null);
  const optimisticUrlRef = useRef<string | null>(null);

  // Revoke optimistic preview object URL on unmount or before replacement
  useEffect(() => {
    return () => {
      if (optimisticUrlRef.current) {
        URL.revokeObjectURL(optimisticUrlRef.current);
      }
    };
  }, []);

  // Generate an affiliate code if not present
  const affiliateCode = user.affiliate_code || `BIDOU-${user.id.slice(-6).toUpperCase()}`;

  const [affiliateStats, setAffiliateStats] = useState<AffiliateStats>({
    clicks: 0,
    signups: 0,
    qualified: 0,
    earned: 0,
    paid: 0,
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await persistence.getAffiliateStats(user.id, affiliateCode);
        if (mounted) {
          setAffiliateStats(data);
        }
      } catch (err) {
        console.warn('Failed to load affiliate stats:', err);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [user.id, affiliateCode]);

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate MIME type client-side: image/png, image/jpeg, image/webp
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setAvatarError('Please select a valid image file (PNG, JPG/JPEG, or WebP)');
      return;
    }

    // Validate size <= 5 MB
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError('Image must be 5 MB or smaller');
      return;
    }

    setAvatarError(null);

    // Create optimistic preview from URL.createObjectURL and store for unmount cleanup
    if (optimisticUrlRef.current) {
      URL.revokeObjectURL(optimisticUrlRef.current);
    }
    const previewUrl = URL.createObjectURL(file);
    optimisticUrlRef.current = previewUrl;
    setOptimisticPreview(previewUrl);

    // Downscale to 512x512 square via HTML5 canvas before storing
    const img = new Image();
    img.onload = async () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas context could not be initialized');

        // Square cropping logic: crop center square from source image
        const minDim = Math.min(img.width, img.height);
        const startX = (img.width - minDim) / 2;
        const startY = (img.height - minDim) / 2;

        ctx.drawImage(img, startX, startY, minDim, minDim, 0, 0, 512, 512);

        // Convert to WebP format data URL (or JPEG fallback)
        const webpDataUrl = canvas.toDataURL('image/webp', 0.88);

        const updated: UserProfile = {
          ...user,
          avatar_url: webpDataUrl,
        };
        onUpdateUser(updated);
        await persistence.saveProfile(updated);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2500);
      } catch (err) {
        console.error('Avatar processing error:', err);
        setAvatarError('Failed to process avatar image');
      }
    };
    img.onerror = () => {
      setAvatarError('Could not load image file');
    };
    img.src = previewUrl;
  };

  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    const updated: UserProfile = {
      ...user,
      name: name.trim() || user.name,
      phone: phone.trim() || undefined,
      language_preference: language,
      theme_preference: theme,
      affiliate_code: affiliateCode,
    };
    onUpdateUser(updated);
    await persistence.saveProfile(updated);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const fullShareUrl =
    typeof window !== 'undefined' && window.location.origin
      ? `${window.location.origin}/?ref=${affiliateCode}`
      : `https://bidou.ai/?ref=${affiliateCode}`;

  const handleCopyAffiliate = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(fullShareUrl);
      } else {
        // Safe fallback for HTTP or Android WebViews
        const textArea = document.createElement('textarea');
        textArea.value = fullShareUrl;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
      }
      setCopiedAffiliate(true);
      setTimeout(() => setCopiedAffiliate(false), 2000);
    } catch (err) {
      console.warn('Affiliate link copy error:', err);
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join Bidou AI - Creative AI Studio',
          text: `Create studio-grade images, video, and music in Africa using Mobile Money! Join with my referral code ${affiliateCode}:`,
          url: fullShareUrl,
        });
      } catch {
        // Dismissed
      }
    } else {
      await handleCopyAffiliate();
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto py-8 px-4 sm:px-6 lg:px-8 flex flex-col gap-8">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#FF8800]/15 pb-6">
        <div className="flex items-center gap-4">
          {/* Main User Avatar with Upload Trigger */}
          <div className="relative group shrink-0">
            <Avatar
              name={user.name}
              avatarUrl={optimisticPreview || user.avatar_url}
              size="xl"
              className="ring-4 ring-[#FF8800]/20 group-hover:ring-[#FF8800] transition-all"
            />
            <label
              htmlFor="profile-avatar-input"
              className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white text-[10px] font-bold cursor-pointer transition-opacity backdrop-blur-xs"
            >
              <Upload size={18} className="mb-0.5" />
              <span>Change</span>
            </label>
            <input
              id="profile-avatar-input"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleAvatarUpload}
              className="hidden"
            />
          </div>

          <div className="flex flex-col">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="jost text-2xl sm:text-3xl font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                {user.name}
              </h2>
              <TierBadge tier={user.plan_tier} mediaBadges={user.media_badges} size="md" />
            </div>
            <span className="inter text-xs text-[#6B6B75] dark:text-[#A0A0AA] mt-0.5">
              {user.email}
            </span>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 text-[#6B6B75] dark:text-[#A0A0AA]">
                ID: {user.id}
              </span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-[#FF8800]/10 border border-[#FF8800]/20 text-[#FF8800]">
                Spend: {(user.lifetime_spend_fcfa || 0).toLocaleString()} FCFA
              </span>
              {user.is_admin && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#FF4B4B]/10 text-[#FF4B4B]">
                  Admin
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Balance Snapshot Card */}
        <div className="p-4 rounded-2xl glass-panel border border-[#FF8800]/25 flex items-center justify-between sm:flex-col sm:items-end gap-2">
          <div className="text-left sm:text-right">
            <span className="text-[11px] uppercase font-bold tracking-wider text-[#6B6B75] dark:text-[#A0A0AA] block">
              Universal Credits
            </span>
            <span className="jost text-2xl font-black font-mono text-brand-gradient">
              {wallet.balance.toLocaleString()}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onNavigateToView('pricing')}
            className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-brand-gradient shadow-md shadow-[#F86A00]/20 hover:opacity-95 active:scale-95 transition-all cursor-pointer"
          >
            Add Credits
          </button>
        </div>
      </div>

      {avatarError && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-[#FF4B4B]/10 border border-[#FF4B4B]/20 text-[#FF4B4B] text-xs">
          <AlertCircle size={15} />
          <span>{avatarError}</span>
        </div>
      )}

      {saveSuccess && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-[#2ECC71]/10 border border-[#2ECC71]/20 text-[#2ECC71] text-xs font-semibold animate-fadeIn">
          <Check size={16} />
          <span>Profile changes updated successfully!</span>
        </div>
      )}

      {/* Profile Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-[#FF8800]/15 pb-2 overflow-x-auto no-scrollbar">
        {[
          { key: 'account', label: 'Account & Preferences', icon: <User size={15} /> },
          { key: 'billing', label: 'Billing', icon: <CreditCard size={15} /> },
          { key: 'credits', label: 'Credits & Tiers', icon: <Award size={15} /> },
          { key: 'affiliate', label: 'Referral Rewards', icon: <Share2 size={15} /> },
          { key: 'security', label: 'Security', icon: <Shield size={15} /> },
        ].map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key as ProfileTab)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'text-white bg-brand-gradient shadow-sm shadow-[#F86A00]/20'
                  : 'text-[#6B6B75] dark:text-[#A0A0AA] hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7] hover:bg-black/5 dark:hover:bg-white/5'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content Display */}
      {activeTab === 'billing' && (
        <BillingTab user={user} wallet={wallet} onNavigateToView={onNavigateToView} />
      )}

      {activeTab === 'account' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 flex flex-col gap-6">
            <div className="p-6 rounded-3xl glass-panel border border-[#FF8800]/20 flex flex-col gap-5">
              <div className="flex items-center gap-2.5 pb-3 border-b border-[#FF8800]/15">
                <User size={18} className="text-[#F86A00]" />
                <h3 className="jost text-base font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                  Identity & Creative Preferences
                </h3>
              </div>

              <form onSubmit={handleSavePreferences} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-[#6B6B75] dark:text-[#A0A0AA]">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-xs font-semibold text-[#1A1A1E] dark:text-[#F5F5F7] focus:outline-none focus:border-[#FF8800]"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-[#6B6B75] dark:text-[#A0A0AA]">
                    Email Address
                  </label>
                  <input
                    type="email"
                    disabled
                    value={user.email}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-xs font-semibold text-[#6B6B75] dark:text-[#A0A0AA] opacity-70 cursor-not-allowed"
                  />
                  <span className="text-[10px] text-[#6B6B75] dark:text-[#A0A0AA]">
                    Managed via authentication credentials
                  </span>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-[#6B6B75] dark:text-[#A0A0AA]">
                    Default Phone Number (+237 Cameroon, 9 digits — MTN / Orange)
                  </label>
                  <div className="flex items-center">
                    <span className="px-3 py-2.5 rounded-l-xl bg-black/10 dark:bg-white/10 border-y border-l border-black/10 dark:border-white/10 text-xs font-bold text-[#F86A00]">
                      +237
                    </span>
                    <input
                      type="tel"
                      placeholder="6XX XX XX XX"
                      value={phone.startsWith('+237') ? phone.slice(4).trim() : phone}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^0-9]/g, '').slice(0, 9);
                        setPhone(raw ? `+237 ${raw}` : '');
                      }}
                      className="flex-1 px-3.5 py-2.5 rounded-r-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-xs font-semibold text-[#1A1A1E] dark:text-[#F5F5F7] focus:outline-none focus:border-[#FF8800]"
                    />
                  </div>
                  <span className="text-[10px] text-[#6B6B75] dark:text-[#A0A0AA]">
                    Used for notifications. To manage saved payment methods, open the Billing tab.
                  </span>
                </div>

                {/* Interface Preferences */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-[#6B6B75] dark:text-[#A0A0AA] flex items-center gap-1.5">
                      <Globe size={14} className="text-[#FF8800]" />
                      <span>Language</span>
                    </label>
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value as 'fr' | 'en')}
                      className="w-full px-3 py-2 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-xs font-semibold text-[#1A1A1E] dark:text-[#F5F5F7] focus:outline-none focus:border-[#FF8800]"
                    >
                      <option value="fr">Français (Cameroun & Afrique)</option>
                      <option value="en">English (Global & West Africa)</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-[#6B6B75] dark:text-[#A0A0AA] flex items-center gap-1.5">
                      <Palette size={14} className="text-[#FF8800]" />
                      <span>Appearance</span>
                    </label>
                    <select
                      value={theme}
                      onChange={(e) => setTheme(e.target.value as 'light' | 'dark')}
                      className="w-full px-3 py-2 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-xs font-semibold text-[#1A1A1E] dark:text-[#F5F5F7] focus:outline-none focus:border-[#FF8800]"
                    >
                      <option value="dark">Dark Theme (Studio Night)</option>
                      <option value="light">Light Theme (Daylight)</option>
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  className="mt-3 py-2.5 px-5 rounded-xl text-xs font-bold text-white bg-brand-gradient shadow-md shadow-[#F86A00]/20 hover:opacity-95 active:scale-95 transition-all self-start cursor-pointer"
                >
                  Save Preferences
                </button>
              </form>
            </div>
          </div>

          <div className="lg:col-span-4 flex flex-col gap-6">
            <div className="p-6 rounded-3xl glass-panel border border-[#FF8800]/20 flex flex-col gap-4">
              <div className="flex items-center gap-2 pb-3 border-b border-[#FF8800]/15">
                <CreditCard size={18} className="text-[#F86A00]" />
                <h3 className="jost text-base font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                  Quick Billing Access
                </h3>
              </div>
              <p className="inter text-xs text-[#6B6B75] dark:text-[#A0A0AA] leading-relaxed">
                Save MTN MoMo or Orange Money phone numbers across 11 African countries for instant top-up.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab('billing')}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-brand-gradient shadow-sm hover:opacity-95 transition-all cursor-pointer text-center"
              >
                Manage Saved Payment Methods
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'credits' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-7 flex flex-col gap-6">
            <div className="p-6 rounded-3xl glass-panel border border-[#FF8800]/20 flex flex-col gap-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#FF8800]/15 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <CreditCard size={18} className="text-[#F86A00]" />
                  <h3 className="jost text-base font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                    Membership & Tier Ladder
                  </h3>
                </div>
                <TierBadge tier={user.plan_tier} mediaBadges={user.media_badges} size="md" />
              </div>

              <p className="inter text-xs text-[#6B6B75] dark:text-[#A0A0AA] leading-relaxed">
                Your tier reflects your lifetime spend on Bidou AI. Tiers <strong>never downgrade</strong> and unlock higher generation concurrency, priority GPU queues, and exclusive creator badges.
              </p>

              <div className="p-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 flex items-center justify-between">
                <span className="text-xs font-semibold text-[#6B6B75] dark:text-[#A0A0AA]">
                  Lifetime Total Spend
                </span>
                <span className="text-sm font-mono font-bold text-brand-gradient">
                  {(user.lifetime_spend_fcfa || 0).toLocaleString()} FCFA
                </span>
              </div>

              {/* Badges Collection */}
              <div className="flex flex-col gap-2 pt-2">
                <span className="text-xs font-bold text-[#1A1A1E] dark:text-[#F5F5F7] flex items-center gap-1.5">
                  <Award size={15} className="text-[#FF8800]" />
                  <span>Earned Tier & Media Badges</span>
                </span>
                <div className="flex flex-wrap gap-2 items-center">
                  <TierBadge tier={user.plan_tier} mediaBadges={user.media_badges} size="md" />
                </div>
              </div>

              <button
                type="button"
                onClick={() => onNavigateToView('pricing')}
                className="mt-4 w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-brand-gradient shadow-md shadow-[#F86A00]/20 hover:opacity-95 transition-all text-center cursor-pointer"
              >
                Buy Studio Credits & Upgrade Tier
              </button>
            </div>
          </div>

          <div className="lg:col-span-5 flex flex-col gap-6">
            <div className="p-6 rounded-3xl glass-panel border border-[#FF8800]/20 flex flex-col gap-4">
              <span className="text-[11px] uppercase font-bold tracking-wider text-[#6B6B75] dark:text-[#A0A0AA]">
                Current Credit Balance
              </span>
              <div className="flex items-baseline gap-2">
                <span className="jost text-4xl font-black font-mono text-brand-gradient">
                  {wallet.balance.toLocaleString()}
                </span>
                <span className="text-xs text-[#6B6B75] dark:text-[#A0A0AA]">credits</span>
              </div>
              <p className="inter text-xs text-[#6B6B75] dark:text-[#A0A0AA] leading-relaxed">
                Universal credits work across all AI modalities: Image (Flux 1.1 Pro), Video (Wan 2.1 / Luma), Voice Cloning (ElevenLabs), and Audio synthesis.
              </p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'affiliate' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 flex flex-col gap-6">
            <div className="p-6 rounded-3xl glass-panel border border-[#FF8800]/20 flex flex-col gap-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#FF8800]/15">
                <div className="flex items-center gap-2">
                  <Share2 size={18} className="text-[#F86A00]" />
                  <h3 className="jost text-base font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                    Creator Referral Program
                  </h3>
                </div>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#FF8800]/10 text-[#FF8800]">
                  500 FCFA / Qualified Invite
                </span>
              </div>

              <p className="inter text-xs text-[#6B6B75] dark:text-[#A0A0AA] leading-relaxed">
                Invite other African creators, studios, and agencies. Earn <strong>500 FCFA cash reward</strong> or bonus credits as soon as your referral completes their first Mobile Money purchase.
              </p>

              {/* Share Link Box */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-[#6B6B75] dark:text-[#A0A0AA]">
                  Your Exclusive Referral Link
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 py-2 px-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 font-mono text-xs font-bold text-brand-gradient truncate select-all">
                    {fullShareUrl}
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyAffiliate}
                    className="px-3 py-2 rounded-xl text-xs font-bold text-white bg-brand-gradient flex items-center gap-1.5 shadow-xs cursor-pointer hover:opacity-95 active:scale-95 transition-all"
                    title="Copy full referral link"
                  >
                    {copiedAffiliate ? <Check size={14} /> : <Copy size={14} />}
                    <span>{copiedAffiliate ? 'Copied' : 'Copy'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleNativeShare}
                    className="p-2 rounded-xl text-xs font-bold glass-panel border border-[#FF8800]/25 text-[#F86A00] hover:bg-[#FF8800]/10 active:scale-95 transition-all cursor-pointer"
                    title="Share link"
                  >
                    <Share2 size={15} />
                  </button>
                </div>
              </div>

              {/* Referral Performance Stats */}
              <div className="pt-2 border-t border-[#FF8800]/15 flex flex-col gap-2.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B6B75] dark:text-[#A0A0AA] flex items-center gap-1.5">
                  <TrendingUp size={13} className="text-[#FF8800]" />
                  <span>Referral Performance</span>
                </span>

                <div className="grid grid-cols-3 gap-2">
                  <div className="p-2.5 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 flex flex-col items-center justify-center text-center">
                    <div className="flex items-center gap-1 text-[#6B6B75] dark:text-[#A0A0AA] text-[10px] mb-0.5">
                      <MousePointer size={11} />
                      <span>Clicks</span>
                    </div>
                    <span className="font-mono text-sm font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                      {affiliateStats.clicks}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 flex flex-col items-center justify-center text-center">
                    <div className="flex items-center gap-1 text-[#6B6B75] dark:text-[#A0A0AA] text-[10px] mb-0.5">
                      <Users size={11} />
                      <span>Signups</span>
                    </div>
                    <span className="font-mono text-sm font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                      {affiliateStats.signups}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 flex flex-col items-center justify-center text-center">
                    <div className="flex items-center gap-1 text-[#2ECC71] text-[10px] mb-0.5">
                      <CheckCircle2 size={11} />
                      <span>Qualified</span>
                    </div>
                    <span className="font-mono text-sm font-bold text-[#2ECC71]">
                      {affiliateStats.qualified}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-1">
                  <div className="p-2.5 rounded-xl bg-[#FF8800]/5 border border-[#FF8800]/20 flex items-center justify-between">
                    <span className="text-[11px] text-[#6B6B75] dark:text-[#A0A0AA] font-medium">Earned:</span>
                    <span className="font-mono text-xs font-bold text-brand-gradient">
                      {affiliateStats.earned.toLocaleString()} FCFA
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 flex items-center justify-between">
                    <span className="text-[11px] text-[#6B6B75] dark:text-[#A0A0AA] font-medium">Paid Out:</span>
                    <span className="font-mono text-xs font-bold text-[#6B6B75] dark:text-[#A0A0AA]">
                      {affiliateStats.paid.toLocaleString()} FCFA
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'security' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 flex flex-col gap-6">
            <div className="p-6 rounded-3xl glass-panel border border-[#FF8800]/20 flex flex-col gap-5">
              <div className="flex items-center gap-2 pb-3 border-b border-[#FF8800]/15">
                <Shield size={18} className="text-[#F86A00]" />
                <h3 className="jost text-base font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                  Account Security & Mobile Money Safeguards
                </h3>
              </div>

              <div className="flex flex-col gap-4">
                <div className="p-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                    Zero-Credential Mobile Money Authorization
                  </span>
                  <p className="inter text-xs text-[#6B6B75] dark:text-[#A0A0AA] leading-relaxed">
                    Bidou AI strictly never asks for, records, or stores your MTN MoMo or Orange Money secret PIN or OTP codes. All transactions are securely routed via official telecommunication USSD push notifications to your physical SIM card.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                    Account Identifier & Session
                  </span>
                  <span className="font-mono text-xs text-[#6B6B75] dark:text-[#A0A0AA]">
                    User ID: {user.id}
                  </span>
                  <span className="font-mono text-xs text-[#6B6B75] dark:text-[#A0A0AA]">
                    Authenticated Email: {user.email}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
