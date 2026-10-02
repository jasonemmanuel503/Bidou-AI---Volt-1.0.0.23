import React, { useState, useEffect } from 'react';
import { Menu, X, Sun, Moon, ArrowRight, Sparkles, Shield } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { BidouLogo } from '../common/BidouLogo';

export interface LandingHeaderProps {
  theme: 'light' | 'dark';
  setTheme: (t: 'light' | 'dark') => void;
  isAuthenticated?: boolean;
  onSignIn: () => void;
  onSignUp: () => void;
  onOpenStudio?: () => void;
  onSignOut?: () => void;
  onNavigateToSection?: (sectionId: string) => void;
  onOpenAdmin?: () => void;
}

export const LandingHeader: React.FC<LandingHeaderProps> = ({
  theme,
  setTheme,
  isAuthenticated = false,
  onSignIn,
  onSignUp,
  onOpenStudio,
  onSignOut,
  onNavigateToSection,
  onOpenAdmin,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isSticky, setIsSticky] = useState(false);

  // Monitor scroll depth: become sticky after user scrolls 10% down the page
  useEffect(() => {
    let ticking = false;

    const checkScrollProgress = () => {
      const scrollHeight = document.documentElement.scrollHeight;
      const clientHeight = window.innerHeight;
      const scrollTotal = scrollHeight - clientHeight;

      if (scrollTotal > 0) {
        const progress = window.scrollY / scrollTotal;
        // 10% threshold with 8.5% hysteresis to eliminate border jitter
        setIsSticky((curr) => {
          if (!curr && progress >= 0.1) return true;
          if (curr && progress < 0.085) return false;
          return curr;
        });
      } else {
        // Fallback for short screens or early DOM hydration
        setIsSticky(window.scrollY > 320);
      }
      ticking = false;
    };

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(checkScrollProgress);
        ticking = true;
      }
    };

    // Run initial measurement on mount
    checkScrollProgress();

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, []);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [mobileMenuOpen]);

  const handleNavClick = (sectionId: string) => {
    setMobileMenuOpen(false);
    if (onNavigateToSection) {
      onNavigateToSection(sectionId);
    } else {
      const el = document.getElementById(sectionId);
      if (el) {
        const yOffset = -72; // Header offset
        const y = el.getBoundingClientRect().top + window.pageYOffset + yOffset;
        window.scrollTo({ top: y, behavior: 'smooth' });
      }
    }
  };

  const renderNavContent = (isStickyMode: boolean) => {
    const idPrefix = isStickyMode ? 'landing-sticky-' : 'landing-';

    return (
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Left Cluster: Mobile Hamburger + Brand Logo */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open Navigation Menu"
            id={`${idPrefix}mobile-menu-trigger`}
            className="lg:hidden min-h-11 min-w-11 p-2 rounded-xl glass-panel border border-[#FF8800]/30 text-[#1A1A1E] dark:text-[#F5F5F7] hover:text-[#F86A00] transition-colors cursor-pointer flex items-center justify-center"
          >
            <Menu size={22} />
          </button>

          <div
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="cursor-pointer transition-opacity hover:opacity-90 flex items-center"
            id={`${idPrefix}brand-logo`}
          >
            <BidouLogo
              variant={theme === 'dark' ? 'dark' : 'light'}
              size={isStickyMode ? 34 : 38}
            />
          </div>
        </div>

        {/* Center Quick Navigation (Desktop lg+) */}
        <nav className="hidden lg:flex items-center gap-6 text-xs font-semibold text-[#6B6B75] dark:text-[#A0A0AA]">
          <button
            type="button"
            onClick={() => handleNavClick('features-pillars')}
            className="hover:text-[#F86A00] transition-colors cursor-pointer"
          >
            Studios
          </button>
          <button
            type="button"
            onClick={() => handleNavClick('showcase-section')}
            className="hover:text-[#F86A00] transition-colors cursor-pointer"
          >
            Showcase
          </button>
          <button
            type="button"
            onClick={() => handleNavClick('trust-section')}
            className="hover:text-[#F86A00] transition-colors cursor-pointer"
          >
            Mobile Money
          </button>
          <button
            type="button"
            onClick={() => handleNavClick('pricing-preview')}
            className="hover:text-[#F86A00] transition-colors cursor-pointer"
          >
            Pricing (FCFA)
          </button>
          <button
            type="button"
            onClick={() => handleNavClick('faq-section')}
            className="hover:text-[#F86A00] transition-colors cursor-pointer"
          >
            FAQ
          </button>
          {onOpenAdmin && (
            <button
              type="button"
              onClick={onOpenAdmin}
              className="hover:text-[#F86A00] transition-colors cursor-pointer flex items-center gap-1 opacity-75 hover:opacity-100"
              title="Admin Security Gate"
            >
              <Shield size={13} />
              <span>Admin</span>
            </button>
          )}
        </nav>

        {/* Desktop Right Actions: Theme + Sign In + Get Started (lg+) */}
        <div className="hidden lg:flex items-center gap-3">
          {/* Theme Toggle */}
          <button
            type="button"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="p-2 rounded-xl glass-panel text-[#6B6B75] dark:text-[#A0A0AA] hover:text-[#F86A00] transition-colors cursor-pointer"
            aria-label="Toggle Theme"
            id={`${idPrefix}theme-toggle`}
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>

          {isAuthenticated ? (
            <>
              <button
                type="button"
                onClick={onSignOut}
                id={`${idPrefix}signout-btn`}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#6B6B75] dark:text-[#A0A0AA] hover:text-[#E74C3C] hover:bg-black/5 dark:hover:bg-white/5 transition-all cursor-pointer"
              >
                Sign Out
              </button>
              <button
                type="button"
                onClick={onOpenStudio}
                id={`${idPrefix}openstudio-btn`}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-brand-gradient shadow-md shadow-[#F86A00]/20 hover:opacity-95 active:scale-95 transition-all cursor-pointer"
              >
                <Sparkles size={14} />
                <span>Open Studio</span>
                <ArrowRight size={14} />
              </button>
            </>
          ) : (
            <>
              {/* Sign In Ghost Button */}
              <button
                type="button"
                onClick={onSignIn}
                id={`${idPrefix}signin-btn`}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#1A1A1E] dark:text-[#F5F5F7] hover:text-[#F86A00] hover:bg-black/5 dark:hover:bg-white/5 transition-all cursor-pointer"
              >
                Sign In
              </button>

              {/* Get Started / Create Free Primary Button */}
              <button
                type="button"
                onClick={onSignUp}
                id={`${idPrefix}getstarted-btn`}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-brand-gradient shadow-md shadow-[#F86A00]/20 hover:opacity-95 active:scale-95 transition-all cursor-pointer"
              >
                <Sparkles size={14} />
                <span>Get Started</span>
                <ArrowRight size={14} />
              </button>
            </>
          )}
        </div>

        {/* Mobile / Tablet Right Cluster (<lg): Theme Toggle */}
        <div className="flex lg:hidden items-center gap-2">
          <button
            type="button"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="min-h-11 min-w-11 p-2 rounded-xl glass-panel text-[#6B6B75] dark:text-[#A0A0AA] flex items-center justify-center cursor-pointer"
            aria-label="Toggle Theme"
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* 1. Static Top Header (in document flow at the very top of the page) */}
      <header
        id="landing-static-header"
        className="relative z-30 w-full glass-panel border-b border-[#FF8800]/15 px-4 sm:px-6 lg:px-8 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))] transition-colors bg-white/80 dark:bg-[#121214]/80 backdrop-blur-md"
      >
        {renderNavContent(false)}
      </header>

      {/* 2. Sticky Animated Header (Slides in smoothly after scrolling 10% down the page) */}
      <AnimatePresence>
        {isSticky && (
          <motion.header
            id="landing-sticky-header"
            key="landing-sticky-header"
            initial={{ y: -80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -80, opacity: 0 }}
            transition={{
              duration: 0.38,
              ease: [0.25, 0.1, 0.25, 1.0], // Refined ease-in with graceful deceleration
            }}
            className="fixed top-0 left-0 right-0 z-40 w-full glass-panel border-b border-[#FF8800]/25 px-4 sm:px-6 lg:px-8 py-2.5 pt-[calc(0.6rem+env(safe-area-inset-top))] transition-colors bg-white/92 dark:bg-[#121214]/92 backdrop-blur-md shadow-lg shadow-black/5 dark:shadow-black/35"
          >
            {renderNavContent(true)}
          </motion.header>
        )}
      </AnimatePresence>

      {/* Mobile Drawer (Left Slide-in matching studio drawer) */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setMobileMenuOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />

            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="absolute left-0 top-0 bottom-0 w-[min(86vw,320px)] h-[100dvh] overlay-panel border-r border-[#FF8800]/25 p-6 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))] flex flex-col justify-between overflow-y-auto"
            >
              <div>
                {/* Header Row */}
                <div className="flex items-center justify-between pb-5 border-b border-[#FF8800]/15 mb-6">
                  <BidouLogo
                    variant={theme === 'dark' ? 'dark' : 'light'}
                    size={32}
                  />
                  <button
                    type="button"
                    onClick={() => setMobileMenuOpen(false)}
                    className="min-h-11 min-w-11 p-2 rounded-xl text-[#6B6B75] dark:text-[#A0A0AA] hover:text-[#F86A00] transition-colors cursor-pointer flex items-center justify-center"
                    aria-label="Close menu"
                  >
                    <X size={20} />
                  </button>
                </div>

                {/* Navigation links */}
                <div className="flex flex-col gap-3 mb-8">
                  <button
                    type="button"
                    onClick={() => handleNavClick('features-pillars')}
                    className="min-h-11 text-left text-sm font-semibold text-[#1A1A1E] dark:text-[#F5F5F7] py-2 px-1 hover:text-[#F86A00] flex items-center"
                  >
                    Creative Studios
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNavClick('showcase-section')}
                    className="min-h-11 text-left text-sm font-semibold text-[#1A1A1E] dark:text-[#F5F5F7] py-2 px-1 hover:text-[#F86A00] flex items-center"
                  >
                    Showcase
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNavClick('trust-section')}
                    className="min-h-11 text-left text-sm font-semibold text-[#1A1A1E] dark:text-[#F5F5F7] py-2 px-1 hover:text-[#F86A00] flex items-center"
                  >
                    MTN & Orange MoMo
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNavClick('pricing-preview')}
                    className="min-h-11 text-left text-sm font-semibold text-[#1A1A1E] dark:text-[#F5F5F7] py-2 px-1 hover:text-[#F86A00] flex items-center"
                  >
                    Pricing in FCFA
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNavClick('faq-section')}
                    className="min-h-11 text-left text-sm font-semibold text-[#1A1A1E] dark:text-[#F5F5F7] py-2 px-1 hover:text-[#F86A00] flex items-center"
                  >
                    FAQ
                  </button>
                  {onOpenAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        onOpenAdmin();
                      }}
                      className="min-h-11 text-left text-sm font-semibold text-[#6B6B75] dark:text-[#A0A0AA] py-2 px-1 hover:text-[#F86A00] flex items-center gap-2 border-t border-black/5 dark:border-white/5 pt-3"
                    >
                      <Shield size={16} className="text-[#F86A00]" />
                      <span>Admin Security Gate</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Public Auth CTAs */}
              <div className="pt-6 border-t border-[#FF8800]/15 flex flex-col gap-3">
                {isAuthenticated ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        if (onOpenStudio) onOpenStudio();
                      }}
                      id="landing-mobile-openstudio"
                      className="w-full min-h-11 py-3 rounded-xl text-xs font-bold text-white bg-brand-gradient shadow-md shadow-[#F86A00]/25 text-center flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Sparkles size={15} />
                      <span>Open Studio</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        if (onSignOut) onSignOut();
                      }}
                      id="landing-mobile-signout"
                      className="w-full min-h-11 py-3 rounded-xl text-xs font-semibold text-[#E74C3C] glass-panel border border-[#E74C3C]/30 text-center flex items-center justify-center cursor-pointer"
                    >
                      Sign Out
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        onSignIn();
                      }}
                      id="landing-mobile-signin"
                      className="w-full min-h-11 py-3 rounded-xl text-xs font-bold text-[#1A1A1E] dark:text-[#F5F5F7] glass-panel border border-[#FF8800]/30 hover:border-[#FF8800] text-center flex items-center justify-center cursor-pointer"
                    >
                      Sign In
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        onSignUp();
                      }}
                      id="landing-mobile-signup"
                      className="w-full min-h-11 py-3 rounded-xl text-xs font-bold text-white bg-brand-gradient shadow-md shadow-[#F86A00]/25 text-center flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Sparkles size={15} />
                      <span>Get Started Free</span>
                    </button>
                  </>
                )}
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
