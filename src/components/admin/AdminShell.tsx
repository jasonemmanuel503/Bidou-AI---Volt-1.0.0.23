import React, { useState, useEffect, useRef } from 'react';
import {
  Shield,
  Cpu,
  DollarSign,
  FileSpreadsheet,
  CheckCircle,
  ArrowLeft,
  LogOut,
  Users,
  UserPlus,
  Menu,
  X,
} from 'lucide-react';
import { BidouLogo } from '../common/BidouLogo';
import { clearAdminSession } from '../../services/adminAuth';

export type AdminTab = 'models' | 'financials' | 'ledger' | 'affiliates' | 'users' | 'checklist';

export interface AdminShellProps {
  activeTab: AdminTab;
  setActiveTab: (tab: AdminTab) => void;
  onExitAdmin: () => void;
  theme: 'light' | 'dark';
  children: React.ReactNode;
}

export const AdminShell: React.FC<AdminShellProps> = ({
  activeTab,
  setActiveTab,
  onExitAdmin,
  theme,
  children,
}) => {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const mobileHeaderRef = useRef<HTMLDivElement>(null);

  const handleSignOutAdmin = () => {
    clearAdminSession();
    onExitAdmin();
  };

  // Close mobile drawer when activeTab changes
  useEffect(() => {
    setMobileNavOpen(false);
  }, [activeTab]);

  // Close mobile drawer on Escape key or outside clicks
  useEffect(() => {
    if (!mobileNavOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileNavOpen(false);
      }
    };

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (
        mobileHeaderRef.current &&
        !mobileHeaderRef.current.contains(e.target as Node)
      ) {
        setMobileNavOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [mobileNavOpen]);

  const navItems: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
    { id: 'models', label: 'Models & Router', icon: <Cpu size={18} /> },
    { id: 'financials', label: 'Revenues & Analytics', icon: <DollarSign size={18} /> },
    { id: 'ledger', label: 'Audit Ledger', icon: <FileSpreadsheet size={18} /> },
    { id: 'affiliates', label: 'Affiliates & Payouts', icon: <Users size={18} /> },
    { id: 'users', label: 'Users & Growth', icon: <UserPlus size={18} /> },
    { id: 'checklist', label: 'Launch Checklist', icon: <CheckCircle size={18} /> },
  ];

  return (
    <div className="min-h-[100dvh] w-full flex flex-col md:flex-row bg-[#FFFFFF] dark:bg-[#121214] text-[#1A1A1E] dark:text-[#F5F5F7] lg:h-[100dvh] lg:overflow-hidden transition-colors">
      {/* ========================================================================= */}
      {/* 1. MOBILE STICKY TOP BAR + HAMBURGER DRAWER (<768px, md:hidden)           */}
      {/* ========================================================================= */}
      <div
        ref={mobileHeaderRef}
        className="sticky top-0 z-30 md:hidden w-full glass-panel border-b border-[#FF8800]/15 bg-white/95 dark:bg-[#121214]/95 backdrop-blur-md"
      >
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BidouLogo
              variant={theme === 'dark' ? 'dark' : 'light'}
              size={30}
            />
            <div>
              <span className="jost text-sm font-bold block leading-tight">
                Bidou AI
              </span>
              <span className="text-[10px] font-mono uppercase font-bold text-brand-gradient">
                Admin Console
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onExitAdmin}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl glass-panel text-xs font-semibold text-[#6B6B75] hover:text-[#F86A00] transition-colors"
              title="Return to Studio"
            >
              <ArrowLeft size={14} />
              <span>Exit</span>
            </button>

            <button
              type="button"
              onClick={() => setMobileNavOpen((prev) => !prev)}
              aria-label="Toggle admin navigation menu"
              aria-expanded={mobileNavOpen}
              className="p-2 rounded-xl glass-panel text-[#6B6B75] dark:text-[#A0A0AA] hover:text-[#F86A00] transition-colors"
            >
              {mobileNavOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation & Actions Drawer */}
        {mobileNavOpen && (
          <>
            <div
              className="fixed inset-0 top-[57px] bg-black/40 backdrop-blur-xs z-20 md:hidden"
              onClick={() => setMobileNavOpen(false)}
              aria-hidden="true"
            />
            <div className="relative z-30 border-t border-[#FF8800]/15 p-4 shadow-2xl flex flex-col gap-4 bg-white/98 dark:bg-[#121214]/98 backdrop-blur-xl animate-fadeIn max-h-[calc(100dvh-57px)] overflow-y-auto">
              <nav className="flex flex-col gap-1.5">
                {navItems.map((item) => {
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActiveTab(item.id);
                        setMobileNavOpen(false);
                      }}
                      className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
                        isActive
                          ? 'bg-brand-gradient text-white shadow-md shadow-[#F86A00]/20'
                          : 'text-[#6B6B75] dark:text-[#A0A0AA] hover:bg-black/5 dark:hover:bg-white/5 hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7]'
                      }`}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>

              <div className="flex flex-col gap-2 pt-3 border-t border-[#FF8800]/15">
                <button
                  type="button"
                  onClick={() => {
                    setMobileNavOpen(false);
                    onExitAdmin();
                  }}
                  className="w-full flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-[#6B6B75] dark:text-[#A0A0AA] hover:bg-black/5 dark:hover:bg-white/5 hover:text-[#1A1A1E] transition-colors"
                >
                  <ArrowLeft size={15} />
                  <span>Return to Studio</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMobileNavOpen(false);
                    handleSignOutAdmin();
                  }}
                  className="w-full flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-[#FF4B4B] hover:bg-[#FF4B4B]/10 transition-colors"
                >
                  <LogOut size={15} />
                  <span>Lock Admin Gate</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 2. TABLET & DESKTOP LEFT RAIL (≥768px, md:flex)                           */}
      {/* ========================================================================= */}
      <aside className="hidden md:flex md:w-64 md:shrink-0 md:sticky md:top-0 md:h-[100dvh] md:self-start md:flex-col md:justify-between md:overflow-y-auto glass-panel md:border-r border-[#FF8800]/15 z-20">
        {/* Top Zone: Pinned to TOP of the viewport */}
        <div className="sticky top-0 z-10 flex flex-col gap-6 p-4 md:p-5 bg-white/95 dark:bg-[#121214]/95 backdrop-blur-md">
          {/* Top Logo & Workspace Badge */}
          <div className="flex items-center gap-3">
            <BidouLogo
              variant={theme === 'dark' ? 'dark' : 'light'}
              size={34}
            />
            <div>
              <span className="jost text-sm font-bold block leading-tight">
                Bidou AI
              </span>
              <span className="text-[10px] font-mono uppercase font-bold text-brand-gradient">
                Admin Console
              </span>
            </div>
          </div>

          {/* Navigation Items */}
          <nav className="flex flex-col gap-1.5">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
                    isActive
                      ? 'bg-brand-gradient text-white shadow-md shadow-[#F86A00]/20'
                      : 'text-[#6B6B75] dark:text-[#A0A0AA] hover:bg-black/5 dark:hover:bg-white/5 hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7]'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Zone: Pinned to BOTTOM of the viewport */}
        <div className="sticky bottom-0 z-10 flex flex-col gap-2 p-4 md:p-5 border-t border-[#FF8800]/15 bg-white/95 dark:bg-[#121214]/95 backdrop-blur-md">
          <button
            type="button"
            onClick={onExitAdmin}
            className="w-full flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-[#6B6B75] dark:text-[#A0A0AA] hover:bg-black/5 dark:hover:bg-white/5 hover:text-[#1A1A1E] transition-colors cursor-pointer"
          >
            <ArrowLeft size={15} />
            <span>Return to Studio</span>
          </button>

          <button
            type="button"
            onClick={handleSignOutAdmin}
            className="w-full flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-[#FF4B4B] hover:bg-[#FF4B4B]/10 transition-colors cursor-pointer"
          >
            <LogOut size={15} />
            <span>Lock Admin Gate</span>
          </button>
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* 3. MAIN ADMIN CONTENT WORKSPACE                                            */}
      {/* ========================================================================= */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 min-w-0 md:h-[100dvh]">
        {children}
      </main>
    </div>
  );
};
