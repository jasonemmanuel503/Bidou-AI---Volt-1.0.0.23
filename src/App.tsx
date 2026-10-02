import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Sidebar } from './components/navigation/Sidebar';
import { MobileTopBar } from './components/navigation/MobileTopBar';
import { AnnouncementBar } from './components/common/AnnouncementBar';
import { FeaturedStrip } from './components/studio/FeaturedStrip';
import { UnifiedPromptBox, EnhancePromptContext, PrefillRequest, RestoreRequest } from './components/studio/UnifiedPromptBox';
import { DedicatedPreviewCanvas } from './components/studio/DedicatedPreviewCanvas';
import { PricingPage } from './components/pricing/PricingPage';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { AdminPinModal } from './components/admin/AdminPinModal';
import { ProfileView } from './components/profile/ProfileView';
import { BillingTab } from './components/profile/BillingTab';
import { ProjectsView } from './components/studio/ProjectsView';
import { TrashView } from './components/studio/TrashView';
import { DiscoveryFeed } from './components/studio/DiscoveryFeed';
import { LandingPage } from './components/landing/LandingPage';
import { AuthScreen } from './components/auth/AuthScreen';
import { MediaLibraryView } from './components/library/MediaLibraryView';
import { MusicLibraryView } from './components/library/MusicLibraryView';
import { OutOfCreditsModal } from './components/studio/OutOfCreditsModal';
import { BidouLogo } from './components/common/BidouLogo';
import { INITIAL_AI_MODELS, INITIAL_PACKAGES, FREE_TIER_WELCOME_CREDITS } from './services/configData';
import { CreditLedger } from './services/creditLedger';
import { FuturaPayService } from './services/futuraPay';
import { ModelRouter } from './services/modelRouter';
import { quoteGenerationCost } from './services/pricingEngine';
import { persistence, hasSupabaseEnv, getSupabaseClient } from './services/persistence';
import { resetFavorites } from './hooks/useFavorites';
import { clearMediaUrlCache } from './services/media';
import { setCurrentUserId, getAuthToken } from './services/authToken';
import { newId } from './services/ids';
import { useProjects } from './hooks/useProjects';
import { useModelCatalog } from './hooks/useModelCatalog';
import { ToastContainer } from './components/common/ToastContainer';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { TIER_VARIANT_CAP } from './services/tiers';
import { ApiError, formatApiError } from './lib/errorMapping';
import { toast } from './services/toast';
import { variantsForJob } from './lib/variants';
import {
  apiRewriteLyrics,
  apiGenerateCoverArt,
  createCheckout,
  simulatePaymentSuccess,
  fetchPublicModels,
  PlanLimitInfo,
} from './services/apiClient';
import {
  AiModelConfig,
  CreditPackage,
  CreditWallet,
  GenerationJob,
  GenerationJobVariant,
  GenerationType,
  PaymentRail,
  PlanTier,
  ProjectFolder,
  UserProfile,
  AppView,
} from './types';

export default function App() {
  // Theme state
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  // Navigation & View state (Default to 'landing' - Section 2.1)
  const [currentView, setCurrentView] = useState<AppView>('landing');
  const [studioType, setStudioType] = useState<GenerationType>('image');
  const [prefillRequest, setPrefillRequest] = useState<PrefillRequest | null>(null);
  const [restoreRequest, setRestoreRequest] = useState<RestoreRequest | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const prefillTokenRef = useRef(0);

  const handlePrefill = (prompt: string, type: GenerationType) => {
    setStudioType(type);
    prefillTokenRef.current += 1;
    setPrefillRequest({
      prompt,
      type,
      token: prefillTokenRef.current,
    });
  };

  // Auth state (Section 2.1 - default unauthenticated)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [adminPinModalOpen, setAdminPinModalOpen] = useState<boolean>(false);
  const [pendingCheckoutPkg, setPendingCheckoutPkg] = useState<CreditPackage | null>(null);
  const [profileInitialTab, setProfileInitialTab] = useState<'account' | 'billing' | 'credits' | 'affiliate' | 'security'>('account');

  const handleOpenBilling = () => {
    setProfileInitialTab('billing');
    navigateToView('billing');
  };

  const handleOpenProfile = (tab: 'account' | 'billing' | 'credits' | 'affiliate' | 'security' = 'account') => {
    setProfileInitialTab(tab);
    navigateToView('profile');
  };

  // User profile
  const [user, setUser] = useState<UserProfile>(() => {
    if (hasSupabaseEnv()) {
      return {
        id: '',
        email: '',
        name: '',
        plan_tier: 'free',
        is_admin: false,
        language_preference: 'fr',
        theme_preference: 'dark',
        created_at: new Date().toISOString(),
      };
    }
    return {
      id: 'usr_amina_01',
      email: 'amina.bekolo@bidou.ai',
      name: 'Amina Bekolo',
      plan_tier: 'free',
      is_admin: false,
      language_preference: 'fr',
      theme_preference: 'dark',
      created_at: new Date().toISOString(),
    };
  });

  const [isSessionResolving, setIsSessionResolving] = useState<boolean>(() => hasSupabaseEnv());

  // URL param ?ref=CODE handling: capture ref code, store in localStorage with 30-day expiry, and clean address bar
  useEffect(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const refCode = urlParams.get('ref');
      if (refCode) {
        const cleanCode = refCode.trim().toUpperCase();
        const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
        localStorage.setItem(
          'bidou:ref',
          JSON.stringify({
            code: cleanCode,
            expiresAt,
            capturedAt: new Date().toISOString(),
          })
        );

        // Record click
        const clicksKey = `bidou:affiliate_clicks:${cleanCode}`;
        const current = parseInt(localStorage.getItem(clicksKey) || '0', 10);
        localStorage.setItem(clicksKey, String(current + 1));

        // Strip ?ref=... parameter cleanly from address bar using history.replaceState
        urlParams.delete('ref');
        const remainingQuery = urlParams.toString();
        const cleanUrl =
          window.location.pathname +
          (remainingQuery ? `?${remainingQuery}` : '') +
          window.location.hash;
        window.history.replaceState({}, document.title, cleanUrl);
      }
    } catch (err) {
      console.warn('[App] Error processing affiliate ref param:', err);
    }
  }, []);

  // Load persisted user profile and tier badges on mount / user change
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const stored = await persistence.loadProfile(user.id);
        const badges = await persistence.listTierBadges(user.id);
        if (mounted) {
          if (stored) {
            setUser((prev) => ({
              ...prev,
              ...stored,
              badges: badges.length > 0 ? badges : stored.badges || [],
            }));
          } else if (badges.length > 0) {
            setUser((prev) => ({ ...prev, badges }));
          }
        }
      } catch (err) {
        console.warn('[App] Error restoring profile:', err);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [user.id]);

  // Services instantiation
  const creditLedger = useMemo(() => new CreditLedger(), []);
  const futuraPayService = useMemo(() => new FuturaPayService(creditLedger), [creditLedger]);
  const { models, setModels, planLimits, providerEnv, refresh: refreshModels } = useModelCatalog();
  const modelRouter = useMemo(() => new ModelRouter(models), [models]);
  const [providerHealthMap, setProviderHealthMap] = useState<Record<string, boolean>>({
    google: true,
    musicapi: true,
    kuaishou: true,
    bytedance: true,
    elevenlabs: true,
  });

  // Reactive wallet state (two-bucket paid_balance + promo_balance)
  const [wallet, setWallet] = useState<CreditWallet>(() => {
    if (hasSupabaseEnv()) {
      return {
        id: 'wal_empty',
        user_id: '',
        balance: 0,
        paid_balance: 0,
        promo_balance: 0,
        updated_at: new Date().toISOString(),
      };
    }
    const initial = creditLedger.getWallet(user.id || 'usr_amina_01');
    return {
      ...initial,
      paid_balance: initial.paid_balance ?? 0,
      promo_balance: initial.promo_balance ?? initial.balance,
    };
  });
  const [transactionsVersion, setTransactionsVersion] = useState(0);

  // Sync wallet: authoritative read from /api/credits/wallet or credit_wallets when Supabase is active, fallback to CreditLedger
  const refreshWallet = async (userId?: string) => {
    const targetId = userId || user.id;
    if (!targetId) {
      setWallet({
        id: 'wal_empty',
        user_id: '',
        balance: 0,
        paid_balance: 0,
        promo_balance: 0,
        updated_at: new Date().toISOString(),
      });
      return;
    }

    // 1. Authoritative server check via /api/credits/wallet if session token exists
    try {
      const rawToken = await getAuthToken();
      const sessionToken = rawToken || (hasSupabaseEnv() ? null : targetId || 'usr_amina_01');
      if (sessionToken) {
        const res = await fetch('/api/credits/wallet', {
          headers: { Authorization: `Bearer ${sessionToken}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (typeof data.balance === 'number') {
            const promo = typeof data.promo_balance === 'number' ? data.promo_balance : 0;
            const paid =
              typeof data.paid_balance === 'number'
                ? data.paid_balance
                : Math.max(0, data.balance - promo);
            setWallet({
              id: `wal_${targetId}`,
              user_id: targetId,
              balance: paid + promo,
              paid_balance: paid,
              promo_balance: promo,
              lifetime_spend_fcfa: data.lifetime_spend_fcfa,
              updated_at: data.updated_at || new Date().toISOString(),
            });
            if (data.plan_tier && data.plan_tier !== user.plan_tier) {
              setUser((prev) => ({ ...prev, plan_tier: data.plan_tier }));
            }
            setTransactionsVersion((v) => v + 1);
            return;
          }
        }
      }
    } catch (err) {
      console.warn('[refreshWallet] /api/credits/wallet fetch error:', err);
    }

    if (hasSupabaseEnv()) {
      try {
        const remoteWallet = await persistence.getWallet(targetId);
        if (remoteWallet) {
          const promo = typeof remoteWallet.promo_balance === 'number' ? remoteWallet.promo_balance : 0;
          const paid =
            typeof remoteWallet.paid_balance === 'number'
              ? remoteWallet.paid_balance
              : Math.max(0, remoteWallet.balance - promo);
          setWallet({
            ...remoteWallet,
            balance: paid + promo,
            paid_balance: paid,
            promo_balance: promo,
          });
          setTransactionsVersion((v) => v + 1);
          return;
        }
      } catch (err) {
        console.warn('[refreshWallet] Error reading credit_wallets:', err);
      }
    }
    const localW = creditLedger.getWallet(targetId);
    setWallet({
      ...localW,
      paid_balance: localW.paid_balance ?? 0,
      promo_balance: localW.promo_balance ?? localW.balance,
    });
    setTransactionsVersion((v) => v + 1);
  };

  useEffect(() => {
    if (user.id) {
      refreshWallet(user.id);
    }

    const onFocus = () => {
      if (user.id) {
        refreshWallet(user.id);
      }
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [user.id]);

  // Step 4: Supabase Realtime subscription on credit_wallets for current user
  useEffect(() => {
    if (!hasSupabaseEnv() || !user.id) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`credit_wallets:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'credit_wallets',
          filter: `user_id=eq.${user.id}`,
        },
        (payload: any) => {
          const nextRow = payload?.new;
          if (nextRow && typeof nextRow.balance === 'number') {
            const promo = typeof nextRow.promo_balance === 'number' ? nextRow.promo_balance : 0;
            const paid =
              typeof nextRow.paid_balance === 'number'
                ? nextRow.paid_balance
                : Math.max(0, nextRow.balance - promo);
            setWallet((prev) => ({
              ...prev,
              balance: paid + promo,
              paid_balance: paid,
              promo_balance: promo,
              updated_at: nextRow.updated_at || new Date().toISOString(),
            }));
          } else {
            refreshWallet(user.id);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user.id]);

  // Session hygiene: resetUserSession clears favorites, media cache, jobs and preview state
  const resetUserSession = useCallback(() => {
    resetFavorites();
    clearMediaUrlCache();
    setJobs([]);
    setCurrentJob(null);
    setVariants([]);
  }, []);

  // Per-user state hygiene on user ID change
  const prevUserIdRef = useRef<string>(user.id);
  useEffect(() => {
    setCurrentUserId(user.id || null);
    if (prevUserIdRef.current && prevUserIdRef.current !== user.id) {
      resetUserSession();
      if (user.id) {
        refreshWallet(user.id);
      } else {
        setWallet({
          id: 'wal_empty',
          user_id: '',
          balance: 0,
          updated_at: new Date().toISOString(),
        });
      }
    }
    prevUserIdRef.current = user.id;
  }, [user.id, resetUserSession]);

  // Cleanly clear local session state without invoking remote signOut
  const clearLocalSessionState = useCallback(() => {
    resetUserSession();
    setCurrentUserId(null);
    setIsAuthenticated(false);
    setAccessToken(null);
    setUser({
      id: hasSupabaseEnv() ? '' : 'usr_amina_01',
      email: hasSupabaseEnv() ? '' : 'amina.bekolo@bidou.ai',
      name: hasSupabaseEnv() ? '' : 'Amina Bekolo',
      plan_tier: 'free',
      is_admin: false,
      language_preference: 'fr',
      theme_preference: 'dark',
      created_at: new Date().toISOString(),
    });
    setWallet({
      id: hasSupabaseEnv() ? 'wal_empty' : 'wal_usr_amina_01',
      user_id: hasSupabaseEnv() ? '' : 'usr_amina_01',
      balance: hasSupabaseEnv() ? 0 : FREE_TIER_WELCOME_CREDITS,
      updated_at: new Date().toISOString(),
    });
    setCurrentView('landing');
  }, [resetUserSession]);

  // Guarded handleSignOut for explicit user sign-out action (never loops with auth events)
  const isSigningOutRef = useRef(false);
  const handleSignOut = useCallback(async () => {
    if (isSigningOutRef.current) return;
    isSigningOutRef.current = true;
    try {
      clearLocalSessionState();
      if (hasSupabaseEnv()) {
        const supabase = getSupabaseClient();
        await supabase?.auth.signOut().catch(() => {});
      }
    } finally {
      isSigningOutRef.current = false;
    }
  }, [clearLocalSessionState]);

  // Live mode Supabase session restoration & auth state subscription
  useEffect(() => {
    if (!hasSupabaseEnv()) {
      setIsSessionResolving(false);
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      setIsSessionResolving(false);
      return;
    }

    let isMounted = true;

    // Safety watchdog: ensure session resolution never blocks initial app render longer than 2s
    const sessionTimeout = setTimeout(() => {
      if (isMounted) {
        setIsSessionResolving(false);
      }
    }, 2000);

    supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      clearTimeout(sessionTimeout);
      if (!isMounted) return;
      if (session?.user) {
        const u = session.user;
        const profile = await persistence.loadProfile(u.id);
        const resolvedUser: UserProfile = profile || {
          id: u.id,
          email: u.email || '',
          name: u.user_metadata?.name || u.email?.split('@')[0] || 'Creative Creator',
          plan_tier: 'free',
          is_admin: false,
          language_preference: 'fr',
          theme_preference: 'dark',
          created_at: u.created_at || new Date().toISOString(),
        };
        setCurrentUserId(u.id);
        setUser(resolvedUser);
        setIsAuthenticated(true);
        if (session.access_token) {
          setAccessToken(session.access_token);
        }
        await refreshWallet(u.id);
      } else {
        setIsAuthenticated(false);
      }
      setIsSessionResolving(false);
    }).catch((err) => {
      clearTimeout(sessionTimeout);
      console.warn('[App] Session check error:', err);
      if (isMounted) setIsSessionResolving(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;
      if (event === 'SIGNED_OUT') {
        // Clear local state only - do NOT call remote signOut() to avoid recursive storm
        clearLocalSessionState();
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        if (!session?.user) return;
        const u = session.user;
        const profile = await persistence.loadProfile(u.id);
        const resolvedUser: UserProfile = profile || {
          id: u.id,
          email: u.email || '',
          name: u.user_metadata?.name || u.email?.split('@')[0] || 'Creative Creator',
          plan_tier: 'free',
          is_admin: false,
          language_preference: 'fr',
          theme_preference: 'dark',
          created_at: u.created_at || new Date().toISOString(),
        };
        setCurrentUserId(u.id);
        setUser(resolvedUser);
        setIsAuthenticated(true);
        if (session.access_token) {
          setAccessToken(session.access_token);
        }
        await refreshWallet(u.id);
      }
    });

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, [clearLocalSessionState]);

  // Auth Handlers
  const handleOpenAuth = (mode: 'signin' | 'signup') => {
    setAuthMode(mode);
    setCurrentView('auth');
  };

  const handleAuthSuccess = async (authenticatedUser: UserProfile) => {
    resetUserSession();
    setCurrentUserId(authenticatedUser.id);
    let finalProfile = authenticatedUser;
    try {
      const stored = await persistence.loadProfile(authenticatedUser.id);
      const badges = await persistence.listTierBadges(authenticatedUser.id);
      if (stored) {
        finalProfile = {
          ...authenticatedUser,
          ...stored,
          badges: badges.length > 0 ? badges : stored.badges || [],
        };
      } else if (badges.length > 0) {
        finalProfile = {
          ...authenticatedUser,
          badges,
        };
      }
    } catch (err) {
      console.warn('[handleAuthSuccess] Error loading profile from persistence:', err);
    }
    setUser(finalProfile);
    setIsAuthenticated(true);
    await refreshWallet(finalProfile.id);

    // Carry over pending package selected on landing page before signup
    let targetView: AppView = 'studio';
    try {
      if (typeof window !== 'undefined') {
        const pendingPkgId = sessionStorage.getItem('bidou:pending_package');
        if (pendingPkgId) {
          sessionStorage.removeItem('bidou:pending_package');
          const foundPkg = INITIAL_PACKAGES.find((p) => p.id === pendingPkgId);
          if (foundPkg) {
            setPendingCheckoutPkg(foundPkg);
            targetView = 'pricing';
          }
        }
      }
    } catch (e) {
      console.warn('[handleAuthSuccess] Error checking pending package:', e);
    }
    setCurrentView(targetView);
  };

  // Gated navigation helper
  const navigateToView = (view: AppView) => {
    if (view === 'admin') {
      // Check if admin PIN was verified in current session
      import('./services/adminAuth').then(({ isAdminAuthenticated }) => {
        if (isAdminAuthenticated()) {
          setCurrentView('admin');
        } else {
          setAdminPinModalOpen(true);
        }
      });
      return;
    }

    const gatedViews: AppView[] = ['studio', 'videos', 'images', 'music', 'pricing', 'projects', 'discovery', 'profile', 'billing', 'trash'];
    if (!isAuthenticated && gatedViews.includes(view)) {
      setAuthMode('signin');
      setCurrentView('auth');
      return;
    }
    setCurrentView(view);
  };

  // Generation jobs & projects state
  const [jobs, setJobs] = useState<GenerationJob[]>(() => {
    if (hasSupabaseEnv()) return [];
    return [
      {
        id: 'job_sample_1',
        user_id: user.id || 'usr_amina_01',
        type: 'image',
        provider: 'google',
        model_name: 'Google Nano Banana',
        prompt: 'Afrofuturistic royal vocalist on stage in Douala with volumetric ambient cyan and amber lights, 8k',
        credit_cost: 70,
        status: 'completed',
        output_urls: ['https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800&auto=format&fit=crop&q=80'],
        created_at: new Date(Date.now() - 3600000).toISOString(),
      },
      {
        id: 'job_sample_2',
        user_id: user.id || 'usr_amina_01',
        type: 'music',
        provider: 'musicapi',
        model_name: 'Sonic v4.5 (Full Studio)',
        prompt: 'Makossa acoustic track titled "Soleil de Wouri"',
        genre: 'Makossa',
        tonality: 'Celebratory',
        credit_cost: 220,
        status: 'completed',
        output_urls: [
          '/samples/demo-track.mp3',
          '/samples/demo-track-2.mp3',
        ],
        created_at: new Date(Date.now() - 7200000).toISOString(),
      },
    ];
  });

  const [currentJob, setCurrentJob] = useState<GenerationJob | null>(null);
  const [variants, setVariants] = useState<GenerationJobVariant[]>([]);
  const pollingIntervalRef = useRef<number | null>(null);
  const pollingStartTimeRef = useRef<number>(0);

  // Clear polling interval on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  // Section 5.1: Hydrate jobs from backend API on mount / user change
  useEffect(() => {
    if (!user.id) {
      setJobs([]);
      return;
    }
    const fetchRecentJobs = async () => {
      try {
        const token = await getAuthToken();
        if (token && hasSupabaseEnv()) setAccessToken(token);
        const res = await fetch('/api/ai/jobs', {
          headers: token
            ? { Authorization: `Bearer ${token}` }
            : (hasSupabaseEnv() ? {} : { Authorization: `Bearer ${user.id}` }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.jobs)) {
            setJobs(data.jobs);
          }
        }
      } catch (err) {
        console.warn('Failed to hydrate recent jobs:', err);
      }
    };

    fetchRecentJobs();
  }, [user.id, isAuthenticated]);

  // Section B.3: Persisted projects via useProjects hook (replaces seeded in-memory folders)
  const {
    projects,
    isLoading: isProjectsLoading,
    isReconnecting: isProjectsReconnecting,
    createProject,
    deleteProject,
  } = useProjects({ userId: user.id });

  // Out of Credits Modal State
  const [outOfCreditsModal, setOutOfCreditsModal] = useState<{
    isOpen: boolean;
    mediaType: GenerationType;
    required: number;
    currentBalance?: number;
    variantCount?: number;
    unitCost?: number;
    errorCode?: string;
    errorMessage?: string;
    maxSeconds?: number;
    requiredTier?: string;
    usedCap?: number;
    monthlyCap?: number;
    resetsAt?: string;
  }>({
    isOpen: false,
    mediaType: 'image',
    required: 70,
    currentBalance: 0,
    variantCount: 1,
  });

  // Apply dark / light class on document
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Handle Prompt Enhancement using server-side Gemini API (Section 2.3.2)
  const handleEnhancePrompt = async (ctx: EnhancePromptContext): Promise<string> => {
    try {
      const token = await persistence.getAccessToken?.();
      const res = await fetch('/api/ai/enhance-prompt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          prompt: ctx.rawPrompt,
          mediaType: ctx.mediaType,
          modelId: ctx.modelId,
          aspectRatio: ctx.aspectRatio,
          variantCount: ctx.variantCount,
          durationSeconds: ctx.durationSeconds,
          resolution: ctx.resolution,
          genre: ctx.genre,
          tonality: ctx.tonality,
          hasReferenceImage: ctx.hasReferenceImage,
          previousVariants: ctx.previousVariants,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const code =
          err.error ||
          (res.status === 503
            ? 'PROMPT_ENHANCER_UNAVAILABLE'
            : res.status === 502
            ? 'ENHANCER_FAILED'
            : res.status === 401
            ? 'UNAUTHORIZED'
            : 'ENHANCER_FAILED');
        throw new ApiError(code, {
          status: res.status,
          detail: err.detail || err.message,
        });
      }

      const data = await res.json();
      return data.enhancedPrompt;
    } catch (err: any) {
      if (err instanceof ApiError) {
        throw err;
      }
      throw new ApiError('NETWORK_ERROR', {
        status: 0,
        detail: err?.message,
      });
    }
  };

  // Handle AI Lyrics Generation
  const handleGenerateLyrics = async (params: { title: string; genre: string; tonality: string }): Promise<string> => {
    try {
      const response = await fetch('/api/ai/generate-lyrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await response.json();
      return data.lyrics || '';
    } catch (err) {
      return `[Verse 1]\nRhythms flowing from Douala to the sky,\nEvery dream is soaring high.\n\n[Chorus]\nBidou AI, celebrate tonight,\nFeel the fire, shining bright!`;
    }
  };

  // Handle AI Lyrics Polish (30 credits add-on)
  const handleRewriteLyrics = async (currentLyrics: string): Promise<string> => {
    try {
      const rewritten = await apiRewriteLyrics(currentLyrics);
      await refreshWallet();
      return rewritten;
    } catch (err: any) {
      if (err.status === 402 || err.message === 'INSUFFICIENT_CREDITS') {
        setOutOfCreditsModal({
          isOpen: true,
          mediaType: 'music',
          required: err.required || 30,
          currentBalance: err.available ?? wallet.balance,
          variantCount: 1,
          unitCost: err.required || 30,
        });
      }
      return currentLyrics;
    }
  };

  // Handle Cover Art Generation (120 credits add-on)
  const handleGenerateCoverArt = async (params: { title: string; genre: string }): Promise<string> => {
    try {
      const res = await apiGenerateCoverArt(params);
      await refreshWallet();
      return res.coverUrl;
    } catch (err: any) {
      if (err.status === 402 || err.message === 'INSUFFICIENT_CREDITS') {
        setOutOfCreditsModal({
          isOpen: true,
          mediaType: 'image',
          required: err.required || 120,
          currentBalance: err.available ?? wallet.balance,
          variantCount: 1,
          unitCost: err.required || 120,
        });
      }
      throw err;
    }
  };

  // Centralized Generation Execution with Real Provider Architecture (Phase 3.6)
  const executeGeneration = async (params: {
    type: GenerationType;
    prompt: string;
    modelId: string;
    variantCount?: number;
    cost?: number;
    metadata?: any;
  }) => {
    const { type, prompt, modelId, variantCount = 1, metadata } = params;

    // Client pre-check: wallet balance vs quote
    const userSelectedModel = models.find((m) => m.id === modelId);
    const quote = quoteGenerationCost({
      model: userSelectedModel || ({ id: modelId, generation_type: type, credit_cost: params.cost || 70, provider_cost: 0.04 } as any),
      durationSeconds: metadata?.duration_seconds,
      resolution: metadata?.resolution,
      includeAudio: metadata?.include_audio ?? true,
      variantCount,
    });

    const isPromoEligible = Boolean(userSelectedModel?.promo_eligible);
    const paidBal = wallet.paid_balance ?? wallet.balance;
    const promoBal = wallet.promo_balance ?? 0;
    const effectiveBalance = isPromoEligible ? paidBal + promoBal : paidBal;

    if (effectiveBalance < quote.totalCost) {
      const isPromoBlocked = !isPromoEligible && promoBal > 0 && paidBal + promoBal >= quote.totalCost;
      setOutOfCreditsModal({
        isOpen: true,
        mediaType: type,
        required: quote.totalCost,
        currentBalance: effectiveBalance,
        variantCount,
        unitCost: quote.unitCost,
        errorCode: isPromoBlocked ? 'PROMO_NOT_ELIGIBLE' : 'INSUFFICIENT_CREDITS',
      });
      throw new Error('Insufficient credits');
    }

    // Real server-authoritative generation via POST /api/ai/generate
    let rawToken = await getAuthToken();
    if (!rawToken && hasSupabaseEnv()) {
      // No session in memory: try one refresh before asking the user to sign in again.
      try {
        const { data: refreshed } = await getSupabaseClient()!.auth.refreshSession();
        rawToken = refreshed.session?.access_token || null;
      } catch {
        rawToken = null;
      }
    }
    const accessToken = rawToken || (hasSupabaseEnv() ? null : user.id || 'usr_amina_01');
    if (!accessToken) {
      setCurrentJob({
        id: crypto.randomUUID(),
        user_id: user.id,
        type,
        model_name: modelId,
        prompt,
        credit_cost: 0,
        status: 'failed',
        error_message: 'Please sign in again to generate. Your session could not be authenticated.',
        output_urls: [],
        batch_count: variantCount,
        created_at: new Date().toISOString(),
      });
      throw new Error('Please sign in again to generate.');
    }

    const idempotencyKey = crypto.randomUUID();

    try {
      const response = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          prompt,
          modelId,
          type,
          variantCount,
          idempotencyKey,
          userId: user.id,
          aspectRatio: metadata?.aspect_ratio,
          durationSeconds: metadata?.duration_seconds,
          resolution: metadata?.resolution,
          includeAudio: metadata?.include_audio ?? true,
          referenceImageUrl: metadata?.reference_image_url,
          genre: metadata?.genre,
          tonality: metadata?.tonality,
          lyrics: metadata?.lyrics,
          title: metadata?.title,
          occasion: (metadata as any)?.occasion,
          language: (metadata as any)?.language,
          clientSettings: (metadata as any)?.clientSettings,
        }),
      });

      // 402 Insufficient credits or PROMO_NOT_ELIGIBLE — server-authoritative
      if (response.status === 402) {
        const errData = await response.json().catch(() => ({}));
        setOutOfCreditsModal({
          isOpen: true,
          mediaType: type,
          required: errData.required || errData.requiredCredits || quote.totalCost,
          currentBalance: errData.available ?? errData.currentBalance ?? wallet.balance,
          variantCount: errData.variantCount || variantCount,
          unitCost: errData.unitCost || quote.unitCost,
          errorCode: errData.code || errData.error,
          errorMessage: errData.message,
        });
        throw new Error(errData.message || errData.error || 'Insufficient credits');
      }

      // 403 PLAN_LIMIT_DURATION or 429 PREMIUM_CAP_REACHED
      if (response.status === 403 || response.status === 429) {
        const errData = await response.json().catch(() => ({}));
        if (errData.error === 'PLAN_LIMIT_DURATION' || errData.error === 'PREMIUM_CAP_REACHED') {
          setOutOfCreditsModal({
            isOpen: true,
            mediaType: type,
            required: quote.totalCost,
            currentBalance: wallet.balance,
            variantCount,
            unitCost: quote.unitCost,
            errorCode: errData.error,
            errorMessage: errData.message,
            maxSeconds: errData.maxSeconds,
            requiredTier: errData.requiredTier,
            usedCap: errData.used,
            monthlyCap: errData.cap,
            resetsAt: errData.resetsAt,
          });
          throw new Error(errData.message || errData.error);
        }
      }

      // 503 MODEL_TEMPORARILY_UNAVAILABLE
      if (response.status === 503) {
        const errData = await response.json().catch(() => ({}));
        const msg = errData.message || 'This model is temporarily busy — please try again shortly or choose another model.';
        toast.error(msg);
        throw new Error(msg);
      }

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const msg = errData.message || errData.error || `Server responded with ${response.status}`;
        toast.error(msg);
        throw new Error(msg);
      }

      const data = await response.json();
      const jobId = data.jobId;
      const count = data.variantCount || variantCount;
      const unitCost = data.unitCost || Math.round((data.totalCost || 70) / count);

      // Apply server wallet from generate response immediately (optimistic), then let realtime/refresh confirm
      if (data.wallet && typeof data.wallet.balance === 'number') {
        const paid = typeof data.wallet.paid_balance === 'number' ? data.wallet.paid_balance : data.wallet.balance;
        const promo = typeof data.wallet.promo_balance === 'number' ? data.wallet.promo_balance : 0;
        setWallet((w) => ({
          ...w,
          balance: paid + promo,
          paid_balance: paid,
          promo_balance: promo,
        }));
      } else if (typeof data.walletBalance === 'number') {
        const promo = typeof data.promoBalance === 'number' ? data.promoBalance : wallet.promo_balance ?? 0;
        const paid =
          typeof data.paidBalance === 'number'
            ? data.paidBalance
            : Math.max(0, data.walletBalance - promo);
        setWallet((w) => ({
          ...w,
          balance: paid + promo,
          paid_balance: paid,
          promo_balance: promo,
        }));
      }
      await refreshWallet();

      const newJob: GenerationJob = {
        id: jobId,
        user_id: user.id,
        type,
        provider: userSelectedModel?.provider || 'google',
        model_name: userSelectedModel?.display_name || modelId,
        prompt,
        credit_cost: data.totalCost,
        status: 'queued',
        output_urls: [],
        batch_count: count,
        created_at: new Date().toISOString(),
        client_settings: (metadata as any)?.clientSettings,
        ...metadata,
      };

      setCurrentJob(newJob);

      const initialVariants: GenerationJobVariant[] = Array.from({ length: count }).map((_, i) => ({
        id: `syn_${jobId}_${i}`,
        job_id: jobId,
        user_id: user.id,
        variant_index: i,
        status: 'queued',
        credits_unit: unitCost,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));
      setVariants(initialVariants);

      // Start polling on GET /api/ai/job/:jobId: first poll at 800ms, then every 2s for image, 4s for video/music
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
      pollingStartTimeRef.current = Date.now();

      const pollJob = async () => {
        try {
          // Check 35-minute timeout (35 * 60 * 1000 = 2,100,000 ms)
          if (Date.now() - pollingStartTimeRef.current > 35 * 60 * 1000) {
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }
            const failedTimeoutJob: GenerationJob = {
              ...newJob,
              status: 'failed',
              error_message: 'Job timed out after 35 minutes',
            };
            setCurrentJob(failedTimeoutJob);
            setJobs((prev) => {
              const exists = prev.some((j) => j.id === failedTimeoutJob.id);
              return exists ? prev.map((j) => (j.id === failedTimeoutJob.id ? failedTimeoutJob : j)) : [failedTimeoutJob, ...prev];
            });
            await refreshWallet();
            return;
          }

          const res = await fetch(`/api/ai/job/${jobId}`, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          });

          if (!res.ok) return;

          const jobData = await res.json();
          if (jobData && jobData.job) {
            const remoteJob = jobData.job;
            const remoteVariants: GenerationJobVariant[] = jobData.variants || [];

            const updatedJob: GenerationJob = {
              ...newJob,
              ...remoteJob,
              type: remoteJob.media_type || remoteJob.type || type,
              model_name: remoteJob.model_name || userSelectedModel?.display_name || modelId,
              output_urls: remoteJob.output_urls || [],
              aspect_ratio: remoteJob.aspect_ratio ?? newJob.aspect_ratio ?? metadata?.aspect_ratio,
              client_settings: remoteJob.client_settings || newJob.client_settings,
            };

            setCurrentJob(updatedJob);
            if (remoteVariants.length > 0) {
              setVariants(remoteVariants);
            }

            // Check if every variant is terminal
            const allVariantsTerminal =
              remoteVariants.length > 0 &&
              remoteVariants.every(
                (v) => v.status === 'completed' || v.status === 'failed' || v.status === 'cancelled'
              );

            const isJobTerminal =
              ['completed', 'failed', 'cancelled'].includes(remoteJob.status) || allVariantsTerminal;

            if (isJobTerminal) {
              if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
                pollingIntervalRef.current = null;
              }

              // Refresh wallet so post-settlement balance (including any auto-refund) is visible immediately
              await refreshWallet();

              // Section 5.1 & 5.3.3: Always add terminal jobs (completed AND failed) to history so failed jobs are displayed
              const finalJob: GenerationJob = { ...updatedJob, variants: remoteVariants };
              setJobs((prev) => {
                const exists = prev.some((j) => j.id === finalJob.id);
                return exists ? prev.map((j) => (j.id === finalJob.id ? finalJob : j)) : [finalJob, ...prev];
              });

              // Refresh profile to pick up any media_badges awarded by trg_generation_job_completed database trigger
              if (remoteJob.status === 'completed') {
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(
                    new CustomEvent('bidou_generation_completed', {
                      detail: { job: finalJob, variants: remoteVariants },
                    })
                  );
                }
                persistence.loadProfile(user.id).then((freshProfile) => {
                  if (freshProfile?.media_badges) {
                    setUser((prev) => ({
                      ...prev,
                      media_badges: freshProfile.media_badges,
                    }));
                  }
                });
              }
            }
          }
        } catch (pollErr) {
          console.warn('[Polling] Error checking job status:', pollErr);
        }
      };

      // Poll at 800ms, then every 2s for images or 4s for video/music
      setTimeout(pollJob, 800);
      const pollInterval = type === 'image' ? 2000 : 4000;
      pollingIntervalRef.current = window.setInterval(pollJob, pollInterval);
    } catch (err: any) {
      console.error('[executeGeneration] Error initiating generation:', err);
      setCurrentJob((prev) =>
        prev ? { ...prev, status: 'failed', error_message: err.message || 'Generation request failed' } : null
      );
      throw err;
    }
  };

  // Promotion of variant to Hero output (Section 3.5)
  const handlePickHeroVariant = (variant: GenerationJobVariant, _index: number) => {
    if (!currentJob) return;
    const heroUrl = variant.output_url;
    if (!heroUrl) return;

    // Place hero variant first in output_urls
    const otherUrls = (currentJob.output_urls || []).filter((u) => u !== heroUrl);
    const reorderedUrls = [heroUrl, ...otherUrls];

    // Reorder variants array so hero is at index 0
    const otherVariants = variants.filter((v) => v.id !== variant.id);
    const reorderedVariants = [variant, ...otherVariants].map((v, i) => ({
      ...v,
      variant_index: i,
    }));

    const updatedJob: GenerationJob = {
      ...currentJob,
      output_urls: reorderedUrls,
      thumbnail_url: heroUrl,
    };

    setCurrentJob(updatedJob);
    setVariants(reorderedVariants);
    setJobs((prev) => prev.map((j) => (j.id === updatedJob.id ? updatedJob : j)));
  };

  // Complete Payment via Authoritative Backend (FuturaPay / Demo Sandbox)
  const handleCompletePayment = async (rail: PaymentRail, phone: string, pkg: CreditPackage) => {
    try {
      const channel = rail;
      const checkout = await createCheckout({
        packageId: pkg.id,
        channel,
        phoneNumber: phone,
      });

      if (checkout.checkoutUrl) {
        window.location.href = checkout.checkoutUrl;
        return checkout;
      }

      if (checkout.mode === 'demo') {
        // In demo sandbox mode, automatically simulate successful payment callback
        await simulatePaymentSuccess(checkout.referenceId);
        await persistence.recordTierPurchase({
          userId: user.id,
          packageId: pkg.id,
          packageName: pkg.name,
          tier: pkg.tier,
          amountFcfa: pkg.price_fcfa,
          credits: pkg.credits,
          paymentRail: rail,
          phoneNumber: phone,
          referenceId: checkout.referenceId,
        });
      }

      await refreshWallet(); // authoritative source for balance + plan_tier — nothing after this should overwrite it
      return checkout;
    } catch (err: any) {
      console.error('[handleCompletePayment] Payment error:', err);
      await refreshWallet();
      throw err;
    }
  };

  const handleCreateFolder = async (name: string): Promise<any> => {
    return await createProject(name);
  };

  // 1. PUBLIC LANDING PAGE (Section 2.1 & 2.4 - Dedicated Layout Shell, No Studio Chrome)
  if (currentView === 'landing') {
    return (
      <>
        <LandingPage
          theme={theme}
          setTheme={setTheme}
          isAuthenticated={isAuthenticated}
          onOpenStudio={() => navigateToView('studio')}
          onSignOut={handleSignOut}
          onOpenSignIn={() => handleOpenAuth('signin')}
          onOpenSignUp={() => handleOpenAuth('signup')}
          onOpenAdmin={() => setAdminPinModalOpen(true)}
          onSelectPricingPlan={(_pkg) => {
            if (isAuthenticated) {
              setCurrentView('pricing');
            } else {
              handleOpenAuth('signup');
            }
          }}
          onCompletePayment={handleCompletePayment}
        />
        <AdminPinModal
          isOpen={adminPinModalOpen}
          onClose={() => setAdminPinModalOpen(false)}
          onSuccess={() => {
            setAdminPinModalOpen(false);
            setCurrentView('admin');
          }}
        />
      </>
    );
  }

  // 2. DEDICATED FULL-SCREEN AUTH SCREEN (Section 2.3)
  if (currentView === 'auth') {
    return (
      <AuthScreen
        initialMode={authMode}
        theme={theme}
        onSuccess={handleAuthSuccess}
        onBackToLanding={() => setCurrentView('landing')}
      />
    );
  }

  // 3. DEDICATED ADMIN WORKSPACE SHELL (PIN-Gated, Left Rail, Responsive)
  if (currentView === 'admin') {
    return (
      <AdminDashboard
        models={models}
        onRefreshModels={refreshModels}
        transactions={creditLedger.getTransactions()}
        payments={futuraPayService.getPayments()}
        packages={INITIAL_PACKAGES}
        onExitAdmin={() => {
          if (isAuthenticated) {
            setCurrentView('studio');
          } else {
            setCurrentView('landing');
          }
        }}
        theme={theme}
      />
    );
  }

  // Guard: If an unauthenticated user somehow attempts to render a gated view
  if (!isAuthenticated) {
    return (
      <AuthScreen
        initialMode="signin"
        theme={theme}
        onSuccess={handleAuthSuccess}
        onBackToLanding={() => setCurrentView('landing')}
      />
    );
  }

  // Section 5.3.4: Reuse prompt & settings from history or failed tiles
  const handleReusePrompt = (job: GenerationJob) => {
    const tab = job.type;
    const settings = job.client_settings || {
      tab: job.type,
      modelId: job.model_id,
      aspectRatio: (job as any).aspect_ratio || '16:9',
      variantCount: job.batch_count || 1,
      originalPrompt: job.prompt,
      enhancedPrompt: null,
      genre: job.genre,
      tonality: job.tonality,
      lyrics: job.lyrics,
      title: (job as any).title,
      durationSeconds: (job as any).duration_seconds,
      resolution: (job as any).resolution,
      includeAudio: (job as any).include_audio,
      referenceImageUrl: (job as any).reference_image_url,
    };

    setStudioType(tab);
    setRestoreRequest({
      tab,
      settings,
      token: Date.now(),
    });
  };

  // Section D.6 & 5.3.7: Soft-delete completed job variant into Trash, or permanently delete failed generation
  const handleDeleteJobVariant = async (jobId: string, variantId: string) => {
    // Save previous state for rollback
    const previousJobs = jobs;
    const previousVariants = variants;
    const previousCurrentJob = currentJob;

    const targetJob = jobs.find((j) => j.id === jobId) || (currentJob?.id === jobId ? currentJob : null);
    const targetVars = targetJob ? variantsForJob(targetJob) : variants;
    const targetVar = targetVars.find((v) => v.id === variantId);
    const isFailed =
      targetJob?.status === 'failed' ||
      targetVar?.status === 'failed' ||
      variantId.startsWith('syn_') ||
      variantId.startsWith('failed-') ||
      (targetVar && !targetVar.output_url && targetVar.status !== 'completed');
    const remainingVarsCount = targetVars.filter((v) => v.id !== variantId).length;

    // Optimistically update jobs: remove only that variant, remove job only when no variants remain
    setJobs((prevJobs) => {
      return prevJobs
        .map((j) => {
          if (j.id !== jobId) return j;
          const currentVars = variantsForJob(j);
          const filteredVars = currentVars.filter((v) => v.id !== variantId);
          if (filteredVars.length === 0) {
            return null;
          }
          const filteredUrls = filteredVars.map((v) => v.output_url).filter((u): u is string => Boolean(u));
          return {
            ...j,
            variants: filteredVars,
            output_urls: filteredUrls,
          };
        })
        .filter((j): j is GenerationJob => j !== null);
    });

    if (currentJob?.id === jobId) {
      const curVars = variants.length > 0 ? variants : variantsForJob(currentJob);
      const remainingVariants = curVars.filter((v) => v.id !== variantId);
      if (remainingVariants.length === 0) {
        setCurrentJob(null);
        setVariants([]);
      } else {
        setVariants(remainingVariants);
        setCurrentJob((prev) =>
          prev
            ? {
                ...prev,
                variants: remainingVariants,
                output_urls: remainingVariants.map((v) => v.output_url).filter((u): u is string => Boolean(u)),
              }
            : null
        );
      }
    }

    try {
      const token = accessToken || (await getAuthToken());
      if (isFailed) {
        const res = await fetch('/api/ai/jobs/delete-failed', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            jobIds: remainingVarsCount === 0 ? [jobId] : undefined,
            variantIds: [variantId],
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(formatApiError(data.error, data.detail));
        }
      } else {
        const res = await fetch('/api/trash', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ variantIds: [variantId] }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(formatApiError(data.error, data.detail));
        }
      }

      window.dispatchEvent(new CustomEvent('bidou_trash_updated'));
      window.dispatchEvent(new CustomEvent('bidou_assets_changed'));
    } catch (err: any) {
      console.error('Failed to delete variant:', err);
      toast.error(err?.message || 'Failed to delete generation');
      // Roll back
      setJobs(previousJobs);
      setVariants(previousVariants);
      setCurrentJob(previousCurrentJob);
      throw err;
    }
  };

  // Permanently delete one or more failed jobs
  const handleDeleteFailedJobs = async (jobIds: string[]) => {
    if (!jobIds.length) return;
    const previousJobs = jobs;
    const previousVariants = variants;
    const previousCurrentJob = currentJob;
    const idSet = new Set(jobIds);

    setJobs((prevJobs) => prevJobs.filter((j) => !idSet.has(j.id)));
    if (currentJob && idSet.has(currentJob.id)) {
      setCurrentJob(null);
      setVariants([]);
    }

    try {
      const token = accessToken || (await getAuthToken());
      const res = await fetch('/api/ai/jobs/delete-failed', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ jobIds }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(formatApiError(data.error, data.detail));
      }

      window.dispatchEvent(new CustomEvent('bidou_assets_changed'));
    } catch (err: any) {
      console.error('Failed to permanently delete failed jobs:', err);
      setJobs(previousJobs);
      setVariants(previousVariants);
      setCurrentJob(previousCurrentJob);
      throw err;
    }
  };

  // Dedicated generation dispatchers for UnifiedPromptBox (Section 2.3.5)
  const handleGenerateImage = async (p: {
    prompt: string;
    enhancedPrompt?: string;
    modelId: string;
    aspectRatio: string;
    referenceImageUrl?: string;
    variantCount?: number;
    clientSettings?: any;
  }) => {
    const m = models.find((mod) => mod.id === p.modelId);
    return executeGeneration({
      type: 'image',
      prompt: p.enhancedPrompt || p.prompt,
      modelId: p.modelId,
      variantCount: p.variantCount ?? 1,
      cost: m?.credit_cost || 70,
      metadata: {
        aspect_ratio: p.aspectRatio,
        reference_image_url: p.referenceImageUrl,
        original_prompt: p.enhancedPrompt ? p.prompt : undefined,
        clientSettings: p.clientSettings,
      },
    });
  };

  const handleGenerateVideo = async (p: {
    prompt: string;
    enhancedPrompt?: string;
    modelId: string;
    durationSeconds: number;
    resolution: '480p' | '720p' | '1080p';
    aspectRatio: string;
    referenceImageUrl?: string;
    variantCount?: number;
    clientSettings?: any;
  }) => {
    const m = models.find((mod) => mod.id === p.modelId);
    return executeGeneration({
      type: 'video',
      prompt: p.enhancedPrompt || p.prompt,
      modelId: p.modelId,
      variantCount: p.variantCount ?? 1,
      cost: m?.credit_cost || 480,
      metadata: {
        duration_seconds: p.durationSeconds,
        resolution: p.resolution,
        aspect_ratio: p.aspectRatio,
        reference_image_url: p.referenceImageUrl,
        original_prompt: p.enhancedPrompt ? p.prompt : undefined,
        clientSettings: p.clientSettings,
      },
    });
  };

  const handleGenerateMusic = async (p: {
    prompt: string;
    enhancedPrompt?: string;
    modelId: string;
    genre: string;
    tonality: string;
    lyrics?: string;
    title?: string;
    occasion?: any;
    language?: string;
    variantCount?: number;
    clientSettings?: any;
  }) => {
    const m = models.find((mod) => mod.id === p.modelId);
    const defaultMusicTakes = Math.min(2, TIER_VARIANT_CAP[user.plan_tier || 'free'] ?? 1);
    return executeGeneration({
      type: 'music',
      prompt: p.enhancedPrompt || p.prompt,
      modelId: p.modelId,
      variantCount: p.variantCount ?? defaultMusicTakes,
      cost: m?.credit_cost || 220,
      metadata: {
        genre: p.genre,
        tonality: p.tonality,
        lyrics: p.lyrics,
        title: p.title,
        occasion: p.occasion,
        language: p.language,
        original_prompt: p.enhancedPrompt ? p.prompt : undefined,
        clientSettings: p.clientSettings,
      },
    });
  };

  if (isSessionResolving) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#09090B] text-white">
        <div className="flex flex-col items-center gap-3">
          <BidouLogo size={48} variant="dark" />
          <div className="w-6 h-6 border-2 border-[#FF8800] border-t-transparent rounded-full animate-spin mt-2" />
        </div>
      </div>
    );
  }

  // 3. AUTHENTICATED APPLICATION SHELL (Fixed Left Sidebar + Scrolling Content Column)
  return (
    <div className="relative h-[100dvh] overflow-clip flex bg-[#FFFFFF] dark:bg-[#121214] text-[#1A1A1E] dark:text-[#F5F5F7] transition-colors duration-200">
      {/* Fixed Left Sidebar on Desktop & Left-sliding Drawer on Mobile (Sections 3.1 & 3.2) */}
      <Sidebar
        currentView={currentView}
        setCurrentView={navigateToView}
        user={user}
        wallet={wallet}
        theme={theme}
        setTheme={setTheme}
        onOpenPricing={() => navigateToView('pricing')}
        onOpenProfile={() => handleOpenProfile('account')}
        onOpenBilling={handleOpenBilling}
        onSignOut={handleSignOut}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
      />

      {/* Main Content Column — Sibling container offset by sidebar width (256px on lg) */}
      <div className="flex-1 flex flex-col lg:pl-64 min-w-0 h-full overflow-y-auto app-scroll transition-all duration-200">
        {/* Mobile Top Bar — First child of content column (Section 7.1) */}
        <MobileTopBar
          user={user}
          wallet={wallet}
          theme={theme}
          setTheme={setTheme}
          onOpenPricing={() => navigateToView('pricing')}
          onOpenProfile={() => navigateToView('profile')}
          onOpenMenu={() => setMobileMenuOpen(true)}
          onGoHome={() => navigateToView('landing')}
        />

        {/* Top Dismissible Announcement Bar (Section 3.3) */}
        <AnnouncementBar
          message="Google Veo 3.1 & Sonic v5 now live — Generate high-speed African cinematic takes with MTN & Orange MoMo!"
          ctaLabel="View Credit Packs"
          onCta={handleOpenBilling}
        />

        {/* Main Content View Switcher */}
        <main className="flex-1 flex flex-col">
          {currentView === 'studio' && (
            <ErrorBoundary onGoToStudio={() => navigateToView('studio')}>
              <div className="w-full max-w-7xl mx-auto flex flex-col gap-6 py-6 px-4 sm:px-6 lg:px-8 min-w-0 max-w-full overflow-x-clip">
                {/* Featured Horizontal Strip (Section 3.4) */}
                <FeaturedStrip
                  onSelectFeature={(feat) => {
                    if (feat.suggestedPrompt) {
                      handlePrefill(feat.suggestedPrompt, feat.type);
                    } else {
                      setStudioType(feat.type);
                    }
                  }}
                />

                {/* Unified Studio Prompt Box with Internal Tabs (Section 3.5 & 5.3.4) */}
                <UnifiedPromptBox
                  models={models}
                  activeTab={studioType}
                  onTabChange={(tab) => setStudioType(tab)}
                  planTier={user.plan_tier}
                  planLimits={planLimits}
                  providerEnv={providerEnv}
                  hasSimulatedVariants={variants.some((v) => Boolean(v.simulated))}
                  onRequestUpgrade={() => navigateToView('pricing')}
                  prefillRequest={prefillRequest}
                  restoreRequest={restoreRequest}
                  walletBalance={wallet.balance}
                  paidBalance={wallet.paid_balance}
                  promoBalance={wallet.promo_balance}
                  onInsufficientCredits={({ required, available, variantCount, unitCost, mediaType, errorCode, errorMessage }) => {
                    setOutOfCreditsModal({
                      isOpen: true,
                      mediaType,
                      required,
                      currentBalance: available,
                      variantCount,
                      unitCost,
                      errorCode,
                      errorMessage,
                    });
                  }}
                  onGenerateImage={handleGenerateImage}
                  onGenerateVideo={handleGenerateVideo}
                  onGenerateMusic={handleGenerateMusic}
                  onEnhancePrompt={handleEnhancePrompt}
                  onGenerateLyrics={handleGenerateLyrics}
                  onRewriteLyrics={handleRewriteLyrics}
                  onGenerateCoverArt={handleGenerateCoverArt}
                  isGenerating={currentJob?.status === 'processing' || currentJob?.status === 'queued'}
                />

                {/* Dedicated Media Preview Canvas below prompt box (Section 3.5 & Issue 5) */}
                <DedicatedPreviewCanvas
                  activeTab={studioType}
                  currentJob={currentJob?.type === studioType ? currentJob : null}
                  variants={variants}
                  historyJobs={jobs.filter((j) => j.type === studioType)}
                  onSelectHistoryJob={(job) => {
                    setCurrentJob(job);
                    setStudioType(job.type);
                    setVariants(variantsForJob(job));
                  }}
                  onRemixPrompt={(remixPrompt, type) => {
                    handlePrefill(remixPrompt, type);
                  }}
                  onPickHeroVariant={handlePickHeroVariant}
                  onReusePrompt={handleReusePrompt}
                  onDeleteJobVariant={handleDeleteJobVariant}
                  onDeleteFailedJobs={handleDeleteFailedJobs}
                  models={models}
                  accessToken={accessToken}
                  onRefreshWallet={refreshWallet}
                  onOpenMusicLibrary={() => navigateToView('music')}
                />
              </div>
            </ErrorBoundary>
          )}

          {currentView === 'videos' && (
            <ErrorBoundary onGoToStudio={() => navigateToView('studio')}>
              <MediaLibraryView
                type="video"
                jobs={jobs}
                userId={user?.id}
                accessToken={accessToken}
                planTier={user?.plan_tier}
                onRemixPrompt={(remixPrompt, type) => {
                  handlePrefill(remixPrompt, type);
                  setCurrentView('studio');
                }}
                onSelectMedia={(job) => {
                  setStudioType(job.type);
                  setCurrentJob(job);
                  setVariants(variantsForJob(job));
                  setCurrentView('studio');
                }}
                onNavigateToStudio={() => setCurrentView('studio')}
              />
            </ErrorBoundary>
          )}

          {currentView === 'images' && (
            <ErrorBoundary onGoToStudio={() => navigateToView('studio')}>
              <MediaLibraryView
                type="image"
                jobs={jobs}
                userId={user?.id}
                accessToken={accessToken}
                planTier={user?.plan_tier}
                onRemixPrompt={(remixPrompt, type) => {
                  handlePrefill(remixPrompt, type);
                  setCurrentView('studio');
                }}
                onSelectMedia={(job) => {
                  setStudioType(job.type);
                  setCurrentJob(job);
                  setVariants(variantsForJob(job));
                  setCurrentView('studio');
                }}
                onNavigateToStudio={() => setCurrentView('studio')}
              />
            </ErrorBoundary>
          )}

          {currentView === 'music' && (
            <ErrorBoundary onGoToStudio={() => navigateToView('studio')}>
              <MusicLibraryView
                jobs={jobs}
                userId={user?.id}
                accessToken={accessToken}
                planTier={user?.plan_tier}
                onRemixPrompt={(remixPrompt, type) => {
                  handlePrefill(remixPrompt, type);
                  setCurrentView('studio');
                }}
                onSelectMedia={(job) => {
                  setStudioType(job.type);
                  setCurrentJob(job);
                  setVariants(variantsForJob(job));
                  setCurrentView('studio');
                }}
                onNavigateToStudio={() => setCurrentView('studio')}
              />
            </ErrorBoundary>
          )}

          {currentView === 'billing' && (
            <ErrorBoundary onGoToStudio={() => navigateToView('studio')}>
              <div className="w-full max-w-5xl mx-auto py-6 px-4 sm:px-6">
                <BillingTab
                  user={user}
                  wallet={wallet}
                  onNavigateToView={navigateToView}
                />
              </div>
            </ErrorBoundary>
          )}

          {currentView === 'pricing' && (
            <ErrorBoundary onGoToStudio={() => navigateToView('studio')}>
              <PricingPage
                packages={INITIAL_PACKAGES}
                currentPlanTier={user.plan_tier}
                initialCheckoutPackage={pendingCheckoutPkg}
                onSelectPackage={() => {}}
                onCompletePayment={async (rail, phone, pkg) => {
                  setPendingCheckoutPkg(null);
                  return await handleCompletePayment(rail, phone, pkg);
                }}
                userId={user.id}
              />
            </ErrorBoundary>
          )}

          {currentView === 'projects' && (
            <ErrorBoundary onGoToStudio={() => navigateToView('studio')}>
              <ProjectsView
                jobs={jobs}
                folders={projects}
                accessToken={accessToken}
                userId={user?.id}
                onCreateFolder={handleCreateFolder}
                onDeleteFolder={deleteProject}
                isReconnecting={isProjectsReconnecting}
                onSelectMedia={(job) => {
                  setStudioType(job.type);
                  setCurrentJob(job);
                  setVariants(variantsForJob(job));
                  setCurrentView('studio');
                }}
              />
            </ErrorBoundary>
          )}

          {currentView === 'discovery' && (
            <ErrorBoundary onGoToStudio={() => navigateToView('studio')}>
              <DiscoveryFeed
                onRemixPrompt={(remixPrompt, type) => {
                  handlePrefill(remixPrompt, type);
                  setCurrentView('studio');
                }}
              />
            </ErrorBoundary>
          )}

          {currentView === 'profile' && (
            <ErrorBoundary onGoToStudio={() => navigateToView('studio')}>
              <ProfileView
                user={user}
                wallet={wallet}
                onUpdateUser={(updated) => setUser(updated)}
                onNavigateToView={navigateToView}
                theme={theme}
                setTheme={setTheme}
                initialTab={profileInitialTab}
              />
            </ErrorBoundary>
          )}

          {currentView === 'trash' && (
            <ErrorBoundary onGoToStudio={() => navigateToView('studio')}>
              <div className="w-full max-w-7xl mx-auto py-6 px-4 sm:px-6">
                <TrashView
                  planTier={user.plan_tier}
                  userId={user?.id}
                  onViewPlans={() => setCurrentView('pricing')}
                  onSelectMedia={(item) => {
                    if (item) {
                      setStudioType(item.media_type || 'image');
                      setCurrentView('studio');
                    }
                  }}
                />
              </div>
            </ErrorBoundary>
          )}
        </main>
      </div>

      {/* Out of Credits Modal (Section 6.7) */}
      <OutOfCreditsModal
        isOpen={outOfCreditsModal.isOpen}
        onClose={() => setOutOfCreditsModal((prev) => ({ ...prev, isOpen: false }))}
        mediaType={outOfCreditsModal.mediaType}
        requiredCredits={outOfCreditsModal.required}
        currentBalance={outOfCreditsModal.currentBalance ?? wallet.balance}
        paidBalance={wallet.paid_balance}
        promoBalance={wallet.promo_balance}
        variantCount={outOfCreditsModal.variantCount ?? 1}
        unitCost={outOfCreditsModal.unitCost}
        errorCode={outOfCreditsModal.errorCode}
        errorMessage={outOfCreditsModal.errorMessage}
        maxSeconds={outOfCreditsModal.maxSeconds}
        requiredTier={outOfCreditsModal.requiredTier}
        usedCap={outOfCreditsModal.usedCap}
        monthlyCap={outOfCreditsModal.monthlyCap}
        resetsAt={outOfCreditsModal.resetsAt}
        onBuyCredits={() => {
          setOutOfCreditsModal((prev) => ({ ...prev, isOpen: false }));
          setCurrentView('pricing');
        }}
        onUpgradePlan={() => {
          setOutOfCreditsModal((prev) => ({ ...prev, isOpen: false }));
          setCurrentView('pricing');
        }}
      />

      {/* Admin Security PIN Modal */}
      <AdminPinModal
        isOpen={adminPinModalOpen}
        onClose={() => setAdminPinModalOpen(false)}
        onSuccess={() => {
          setAdminPinModalOpen(false);
          setCurrentView('admin');
        }}
      />

      {/* Global Realtime & Error Toast Container */}
      <ToastContainer />
    </div>
  );
}
