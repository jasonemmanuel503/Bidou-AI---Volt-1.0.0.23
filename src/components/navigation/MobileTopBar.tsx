import React from 'react';
import { Menu, Moon, Sun } from 'lucide-react';
import { BidouLogo } from '../common/BidouLogo';
import { Avatar } from '../common/Avatar';
import { UserProfile, CreditWallet } from '../../types';
import { ModeBadge } from '../common/ModeBadge';
import { AnimatedBalance } from '../common/AnimatedBalance';

export interface MobileTopBarProps {
  user: UserProfile;
  wallet: CreditWallet;
  theme: 'light' | 'dark';
  setTheme: (t: 'light' | 'dark') => void;
  onOpenPricing: () => void;
  onOpenMenu: () => void;
  onOpenProfile?: () => void;
  onGoHome?: () => void;
}

export const MobileTopBar: React.FC<MobileTopBarProps> = ({
  user,
  wallet,
  theme,
  setTheme,
  onOpenPricing,
  onOpenMenu,
  onOpenProfile,
  onGoHome,
}) => {
  return (
    <header
      id="mobile-top-bar"
      className="lg:hidden sticky top-0 z-40 w-full glass-panel border-b border-[#FF8800]/15 px-4 py-2.5 pt-[calc(0.625rem+env(safe-area-inset-top))] flex items-center justify-between backdrop-blur-md shrink-0"
    >
      {/* Top-Left Cluster: Hamburger Icon Directly Next to Logo and Mode Badge */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenMenu}
          id="mobile-nav-trigger-left"
          className="min-h-11 min-w-11 p-2 rounded-xl text-[#1A1A1E] dark:text-[#F5F5F7] hover:text-[#F86A00] hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer flex items-center justify-center"
          aria-label="Open Navigation Drawer"
        >
          <Menu size={22} />
        </button>

        <div
          onClick={onGoHome}
          className="cursor-pointer flex items-center"
          title="Bidou AI Home"
        >
          <BidouLogo
            variant={theme === 'dark' ? 'dark' : 'light'}
            size={32}
          />
        </div>

        <ModeBadge />
      </div>

      {/* Top-Right Cluster: Credits Pill, Theme Toggle & User Avatar */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenPricing}
          title={
            (wallet.promo_balance ?? 0) > 0
              ? `Paid: ${(wallet.paid_balance ?? Math.max(0, wallet.balance - (wallet.promo_balance ?? 0))).toLocaleString()} credits • Free bonus: ${(wallet.promo_balance ?? 0).toLocaleString()} credits (for fast image models)`
              : `Paid: ${(wallet.paid_balance ?? wallet.balance).toLocaleString()} credits`
          }
          className="min-h-11 flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl glass-panel text-xs font-semibold border border-[#FF8800]/30 hover:border-[#FF8800] transition-colors cursor-pointer"
        >
          <div className="w-1.5 h-1.5 rounded-full bg-[#2ECC71] animate-ping" />
          <span className="font-mono text-xs font-bold text-brand-gradient">
            <AnimatedBalance
              value={wallet.balance}
              paidBalance={wallet.paid_balance}
              promoBalance={wallet.promo_balance}
              showIcon={false}
            />
          </span>
        </button>

        <button
          type="button"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="min-h-11 min-w-11 p-2 rounded-xl glass-panel text-[#6B6B75] dark:text-[#A0A0AA] hover:text-[#F86A00] transition-colors flex items-center justify-center cursor-pointer"
          aria-label="Toggle Theme"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        {onOpenProfile && (
          <button
            type="button"
            onClick={onOpenProfile}
            className="min-h-11 p-1 rounded-xl glass-panel hover:border-[#FF8800] transition-colors flex items-center justify-center cursor-pointer"
            aria-label="Open Profile and Settings"
            title="Profile & Settings"
          >
            <Avatar name={user.name} avatarUrl={user.avatar_url} size="xs" />
          </button>
        )}
      </div>
    </header>
  );
};
