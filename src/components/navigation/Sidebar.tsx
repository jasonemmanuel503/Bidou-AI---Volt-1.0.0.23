// Bidou AI Navigation Sidebar
import React, { useState, useEffect, useRef } from 'react';
import {
  Menu,
  X,
  Sparkles,
  Moon,
  Sun,
  Shield,
  FolderGit2,
  Compass,
  Layers,
  CreditCard,
  LogOut,
  Settings,
  User as UserIcon,
  MoreVertical,
  ChevronRight,
  Award,
  Trash2,
  Video,
  Image as ImageIcon,
  Music,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { BidouLogo } from '../common/BidouLogo';
import { Avatar } from '../common/Avatar';
import { UserProfile, CreditWallet, AppView } from '../../types';
import { TierBadge } from '../common/TierBadge';
import { useTrash } from '../../hooks/useTrash';
import { ModeBadge } from '../common/ModeBadge';
import { AnimatedBalance } from '../common/AnimatedBalance';
import { TIER_LABEL } from '../../services/tiers';

export interface SidebarProps {
  currentView: AppView;
  setCurrentView: (view: AppView) => void;
  user: UserProfile;
  wallet: CreditWallet;
  theme: 'light' | 'dark';
  setTheme: (t: 'light' | 'dark') => void;
  onOpenPricing: () => void;
  onOpenProfile?: () => void;
  onOpenBilling?: () => void;
  onSignOut?: () => void;
  mobileMenuOpen?: boolean;
  setMobileMenuOpen?: (open: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  setCurrentView,
  user,
  wallet,
  theme,
  setTheme,
  onOpenPricing,
  onOpenProfile,
  onOpenBilling,
  onSignOut,
  mobileMenuOpen = false,
  setMobileMenuOpen,
}) => {
  const [internalMobileOpen, setInternalMobileOpen] = useState(false);
  const isDrawerOpen = setMobileMenuOpen !== undefined ? mobileMenuOpen : internalMobileOpen;
  const setDrawerOpen = (val: boolean) => {
    if (setMobileMenuOpen) {
      setMobileMenuOpen(val);
    } else {
      setInternalMobileOpen(val);
    }
  };

  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  // Close account menu on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const { trashCount } = useTrash({ userId: user?.id, autoFetch: true });

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (isDrawerOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isDrawerOpen]);

  const navItems = [
    { key: 'studio', label: 'Create / Studio', icon: <Sparkles size={17} /> },
    { key: 'videos', label: 'Videos', icon: <Video size={17} /> },
    { key: 'images', label: 'Images', icon: <ImageIcon size={17} /> },
    { key: 'music', label: 'Music', icon: <Music size={17} /> },
    { key: 'discovery', label: 'Discovery Feed', icon: <Compass size={17} /> },
    { key: 'projects', label: 'Projects', icon: <FolderGit2 size={17} /> },
    { key: 'billing', label: 'Billing', icon: <CreditCard size={17} /> },
    { key: 'pricing', label: 'Pricing Plans', icon: <Layers size={17} /> },
    { key: 'profile', label: 'Studio Settings', icon: <Settings size={17} /> },
    { key: 'trash', label: 'Trash', icon: <Trash2 size={17} />, badge: trashCount },
    ...(user.is_admin ? [{ key: 'admin', label: 'Admin Dashboard', icon: <Shield size={17} /> }] : []),
  ];

  return (
    <>
      {/* ========================================================================= */}
      {/* 3.1 DESKTOP & LARGE-TABLET FIXED LEFT SIDEBAR (lg:flex, fixed left-0)      */}
      {/* ========================================================================= */}
      <aside
        id="desktop-sidebar"
        className="hidden lg:flex fixed left-0 top-0 bottom-0 w-64 z-40 bg-white/95 dark:bg-[#121214]/95 border-r border-[#FF8800]/15 backdrop-blur-xl flex-col justify-between p-4 select-none"
      >
        {/* Top Section: Logo & Primary Vertical Nav Items */}
        <div className="flex flex-col gap-6">
          {/* Logo & Mode Badge */}
          <div className="flex items-center justify-between px-2 py-1">
            <div
              onClick={() => setCurrentView('landing')}
              className="cursor-pointer transition-opacity hover:opacity-90 flex items-center"
              title="Go to Bidou AI Home"
            >
              <BidouLogo
                variant={theme === 'dark' ? 'dark' : 'light'}
                size={36}
              />
            </div>
            <ModeBadge />
          </div>

          {/* Primary Navigation - One per row vertical list */}
          <nav className="flex flex-col gap-1.5" aria-label="Main Studio Navigation">
            {navItems.map((item) => {
              const isActive = currentView === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setCurrentView(item.key as any)}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 cursor-pointer text-left w-full ${
                    isActive
                      ? 'bg-brand-gradient text-white shadow-md shadow-[#F86A00]/25'
                      : 'text-[#6B6B75] dark:text-[#A0A0AA] hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7] hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                >
                  <span className={isActive ? 'text-white' : 'text-[#F86A00]'}>{item.icon}</span>
                  <span className="flex-1">{item.label}</span>
                  {(item as any).badge !== undefined && (item as any).badge > 0 && (
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full font-semibold ${
                        isActive
                          ? 'bg-white/25 text-white'
                          : 'bg-black/10 dark:bg-white/10 text-[#6B6B75] dark:text-[#A0A0AA]'
                      }`}
                    >
                      {(item as any).badge}
                    </span>
                  )}
                  {isActive && <ChevronRight size={14} className="opacity-75" />}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Section: Divider, Credits Card, Theme Toggle, User Account Block */}
        <div className="flex flex-col gap-3 pt-4 border-t border-[#FF8800]/15 relative">
          {/* Universal Credits Balance Card */}
          <div
            onClick={onOpenPricing}
            className="p-3.5 rounded-2xl glass-panel border border-[#FF8800]/25 hover:border-[#FF8800] transition-all cursor-pointer group bg-gradient-to-br from-white/40 to-white/10 dark:from-white/5 dark:to-transparent"
            title="Click to buy more credits via MTN Mobile Money or Orange Money"
          >
            <div className="flex items-center justify-between text-xs text-[#6B6B75] dark:text-[#A0A0AA] mb-1">
              <span className="font-semibold">{TIER_LABEL[user.plan_tier] ? `${TIER_LABEL[user.plan_tier]} Plan` : 'Credit Wallet'}</span>
              <span className="text-[10px] uppercase font-bold text-brand-gradient">Universal</span>
            </div>
            <div className="flex items-baseline justify-between mb-1">
              <span className="font-mono text-xl font-extrabold text-[#1A1A1E] dark:text-[#F5F5F7]">
                <AnimatedBalance
                  value={wallet.balance}
                  paidBalance={wallet.paid_balance}
                  promoBalance={wallet.promo_balance}
                  showIcon={false}
                />
              </span>
              <span className="text-[11px] text-[#6B6B75]">credits</span>
            </div>
            <div className="flex flex-col gap-0.5 mb-2 text-[10px] font-medium text-[#6B6B75] dark:text-[#A0A0AA]">
              <span>
                Paid: {(wallet.paid_balance ?? Math.max(0, wallet.balance - (wallet.promo_balance ?? 0))).toLocaleString()} credits
              </span>
              {(wallet.promo_balance ?? 0) > 0 && (
                <span className="text-[#2ECC71] font-semibold">
                  Free bonus: {(wallet.promo_balance ?? 0).toLocaleString()} credits (for fast image models)
                </span>
              )}
            </div>
            <div className="w-full py-1.5 rounded-xl text-[11px] font-bold text-white bg-brand-gradient shadow-sm flex items-center justify-center gap-1.5 group-hover:opacity-95 transition-opacity">
              <span>Top-Up (FCFA)</span>
              <ChevronRight size={12} />
            </div>
          </div>

          {/* Theme Toggle Button */}
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-xs text-[#6B6B75] dark:text-[#A0A0AA] font-medium">Appearance</span>
            <button
              type="button"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold glass-panel text-[#6B6B75] dark:text-[#A0A0AA] hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7] transition-colors cursor-pointer"
            >
              {theme === 'dark' ? (
                <>
                  <Sun size={14} className="text-[#FFB020]" />
                  <span>Light</span>
                </>
              ) : (
                <>
                  <Moon size={14} className="text-[#4A90E2]" />
                  <span>Dark</span>
                </>
              )}
            </button>
          </div>

          {/* Persistent Desktop Sign Out Affordance */}
          {onSignOut && (
            <div className="flex items-center justify-between px-2">
              <button
                type="button"
                onClick={onSignOut}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-[#6B6B75] dark:text-[#A0A0AA] hover:text-[#E74C3C] hover:bg-[#E74C3C]/10 transition-colors cursor-pointer"
              >
                <LogOut size={14} />
                <span>Sign Out</span>
              </button>
            </div>
          )}

          {/* Account Popover Menu */}
          {accountMenuOpen && (
            <div
              ref={accountMenuRef}
              className="absolute bottom-16 left-2 right-2 p-2 rounded-2xl overlay-panel z-50 flex flex-col gap-1 text-xs"
            >
              <div className="p-3 border-b border-black/5 dark:border-white/5 flex items-center gap-3">
                <Avatar name={user.name} avatarUrl={user.avatar_url} size="md" />
                <div className="flex flex-col min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1.5 mb-0.5">
                    <span className="font-bold text-[#1A1A1E] dark:text-[#F5F5F7] truncate">{user.name}</span>
                    <TierBadge tier={user.plan_tier} mediaBadges={user.media_badges} size="sm" />
                  </div>
                  <span className="text-[11px] text-[#6B6B75] dark:text-[#A0A0AA] truncate">{user.email}</span>
                </div>
              </div>
              {user.badges && user.badges.length > 0 && (
                <div className="px-3 py-2 border-b border-black/5 dark:border-white/5 flex flex-wrap gap-1 items-center">
                  <span className="text-[9px] uppercase font-bold text-[#6B6B75] dark:text-[#A0A0AA] block w-full mb-0.5">Badges Earned</span>
                  {user.badges.map((b) => (
                    <TierBadge key={b} tier={b} size="sm" />
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  setAccountMenuOpen(false);
                  if (onOpenProfile) onOpenProfile();
                  else setCurrentView('profile');
                }}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-[#1A1A1E] dark:text-[#F5F5F7] hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-left"
              >
                <UserIcon size={15} className="text-[#F86A00]" />
                <span>Profile & Settings</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAccountMenuOpen(false);
                  if (onOpenBilling) {
                    onOpenBilling();
                  } else if (onOpenProfile) {
                    onOpenProfile();
                  } else {
                    setCurrentView('profile');
                  }
                }}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-[#1A1A1E] dark:text-[#F5F5F7] hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-left"
              >
                <CreditCard size={15} className="text-[#FF8800]" />
                <span>Billing & Payment Methods</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAccountMenuOpen(false);
                  onOpenPricing();
                }}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-[#1A1A1E] dark:text-[#F5F5F7] hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-left"
              >
                <Award size={15} className="text-[#FF8800]" />
                <span>Subscription & Tier Ladder</span>
              </button>

              {user.is_admin && (
                <button
                  type="button"
                  onClick={() => {
                    setAccountMenuOpen(false);
                    setCurrentView('admin');
                  }}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl text-[#1A1A1E] dark:text-[#F5F5F7] hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-left"
                >
                  <Shield size={15} className="text-[#F86A00]" />
                  <span>Admin Workspace</span>
                </button>
              )}

              {onSignOut && (
                <button
                  type="button"
                  onClick={() => {
                    setAccountMenuOpen(false);
                    onSignOut();
                  }}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl text-[#E74C3C] hover:bg-[#E74C3C]/10 transition-colors text-left font-semibold border-t border-black/5 dark:border-white/5 mt-1"
                >
                  <LogOut size={15} />
                  <span>Sign Out</span>
                </button>
              )}
            </div>
          )}

          {/* User / Account Block */}
          <div
            onClick={() => setAccountMenuOpen(!accountMenuOpen)}
            className="flex items-center justify-between p-2 rounded-2xl glass-panel-subtle hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2.5 overflow-hidden">
              <Avatar
                name={user.name}
                avatarUrl={user.avatar_url}
                size="sm"
              />
              <div className="flex flex-col overflow-hidden">
                <span className="text-xs font-bold text-[#1A1A1E] dark:text-[#F5F5F7] truncate">
                  {user.name}
                </span>
                <div className="mt-0.5">
                  <TierBadge tier={user.plan_tier} mediaBadges={user.media_badges} size="sm" />
                </div>
              </div>
            </div>

            <MoreVertical size={16} className="text-[#6B6B75] dark:text-[#A0A0AA] shrink-0" />
          </div>
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* 3.2 MOBILE DRAWER (Left Slide-in matching top-left trigger position)       */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {isDrawerOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            {/* Dimmed Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setDrawerOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />

            {/* Slide-In from LEFT matching trigger location */}
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="absolute left-0 top-0 bottom-0 w-[min(86vw,320px)] h-[100dvh] overlay-panel border-r border-[#FF8800]/25 p-5 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-[calc(1.25rem+env(safe-area-inset-bottom))] flex flex-col justify-between overflow-y-auto app-scroll"
            >
              <div>
                {/* Top Row: Logo & Close Button */}
                <div className="flex items-center justify-between pb-4 border-b border-[#FF8800]/15 mb-5">
                  <div className="flex items-center gap-2">
                    <BidouLogo
                      variant={theme === 'dark' ? 'dark' : 'light'}
                      size={30}
                    />
                    <ModeBadge />
                  </div>
                  <button
                    type="button"
                    onClick={() => setDrawerOpen(false)}
                    className="min-h-11 min-w-11 p-2 rounded-xl text-[#6B6B75] dark:text-[#A0A0AA] hover:text-[#F86A00] transition-colors cursor-pointer flex items-center justify-center"
                    aria-label="Close Navigation Menu"
                  >
                    <X size={20} />
                  </button>
                </div>

                {/* Credits Card */}
                <div className="p-3.5 rounded-2xl bg-black/5 dark:bg-white/5 border border-[#FF8800]/30 mb-5 flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs text-[#6B6B75] dark:text-[#A0A0AA]">
                    <span className="font-semibold">{TIER_LABEL[user.plan_tier] ? `${TIER_LABEL[user.plan_tier]} Plan` : 'Credit Wallet'}</span>
                    <span className="text-[10px] uppercase font-bold text-brand-gradient">Universal</span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-xl font-bold font-mono text-[#1A1A1E] dark:text-[#F5F5F7]">
                      <AnimatedBalance
                        value={wallet.balance}
                        paidBalance={wallet.paid_balance}
                        promoBalance={wallet.promo_balance}
                        showIcon={false}
                      />
                    </span>
                    <span className="text-xs text-[#6B6B75]">credits</span>
                  </div>
                  <div className="flex flex-col gap-0.5 text-[10px] font-medium text-[#6B6B75] dark:text-[#A0A0AA]">
                    <span>
                      Paid: {(wallet.paid_balance ?? Math.max(0, wallet.balance - (wallet.promo_balance ?? 0))).toLocaleString()} credits
                    </span>
                    {(wallet.promo_balance ?? 0) > 0 && (
                      <span className="text-[#2ECC71] font-semibold">
                        Free bonus: {(wallet.promo_balance ?? 0).toLocaleString()} credits (for fast image models)
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setDrawerOpen(false);
                      onOpenPricing();
                    }}
                    className="w-full min-h-11 py-2.5 rounded-xl text-xs font-bold text-white bg-brand-gradient shadow-md shadow-[#F86A00]/20 active:scale-98 transition-all text-center flex items-center justify-center"
                  >
                    Top-Up (MTN / Orange)
                  </button>
                </div>

                {/* Vertical Navigation Links */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B6B75] dark:text-[#A0A0AA] px-2 mb-1">
                    Navigation
                  </span>
                  {navItems.map((item) => {
                    const isActive = currentView === item.key;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => {
                          setCurrentView(item.key as any);
                          setDrawerOpen(false);
                        }}
                        className={`min-h-11 flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all text-left w-full cursor-pointer ${
                          isActive
                            ? 'bg-brand-gradient text-white shadow-sm'
                            : 'text-[#1A1A1E] dark:text-[#F5F5F7] hover:bg-black/5 dark:hover:bg-white/5'
                        }`}
                      >
                        {item.icon}
                        <span className="flex-1">{item.label}</span>
                        {(item as any).badge !== undefined && (item as any).badge > 0 && (
                          <span
                            className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full font-semibold ${
                              isActive
                                ? 'bg-white/25 text-white'
                                : 'bg-black/10 dark:bg-white/10 text-[#6B6B75] dark:text-[#A0A0AA]'
                            }`}
                          >
                            {(item as any).badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Bottom Enclosed Items: Account & Sign Out */}
              <div className="pt-5 border-t border-[#FF8800]/15 flex flex-col gap-3">
                <div
                  onClick={() => {
                    setDrawerOpen(false);
                    if (onOpenProfile) onOpenProfile();
                    else setCurrentView('profile');
                  }}
                  className="flex items-center justify-between p-2.5 rounded-xl glass-panel-subtle hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                  title="Profile & Settings"
                >
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    <Avatar
                      name={user.name}
                      avatarUrl={user.avatar_url}
                      size="sm"
                    />
                    <div className="flex flex-col overflow-hidden">
                      <span className="text-xs font-bold text-[#1A1A1E] dark:text-[#F5F5F7] truncate">
                        {user.name}
                      </span>
                      <div className="mt-0.5 mb-0.5">
                        <TierBadge tier={user.plan_tier} mediaBadges={user.media_badges} size="sm" />
                      </div>
                      <span className="text-[10px] text-[#6B6B75] dark:text-[#A0A0AA] truncate">
                        {user.email}
                      </span>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-[#6B6B75] dark:text-[#A0A0AA] shrink-0" />
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    if (onOpenBilling) {
                      onOpenBilling();
                    } else if (onOpenProfile) {
                      onOpenProfile();
                    } else {
                      setCurrentView('profile');
                    }
                  }}
                  className="w-full min-h-11 py-2 px-3 rounded-xl text-xs font-semibold text-[#1A1A1E] dark:text-[#F5F5F7] glass-panel border border-[#FF8800]/25 hover:border-[#FF8800] transition-colors flex items-center justify-between cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <CreditCard size={15} className="text-[#FF8800]" />
                    <span>Billing & Payment Methods</span>
                  </div>
                  <ChevronRight size={14} className="text-[#6B6B75] dark:text-[#A0A0AA]" />
                </button>

                {onSignOut && (
                  <button
                    type="button"
                    onClick={() => {
                      setDrawerOpen(false);
                      onSignOut();
                    }}
                    className="w-full min-h-11 py-2.5 px-3 rounded-xl text-xs font-semibold text-[#E74C3C] border border-[#E74C3C]/30 hover:bg-[#E74C3C]/10 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <LogOut size={15} />
                    <span>Sign Out</span>
                  </button>
                )}
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
