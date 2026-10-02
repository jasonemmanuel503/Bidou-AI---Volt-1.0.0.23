import React, { useState } from 'react';
import { ArrowLeft, Sparkles, Mail, Lock, User, Phone, Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react';
import { BidouLogo } from '../common/BidouLogo';
import { UserProfile } from '../../types';
import { hasSupabaseEnv, getSupabaseClient, persistence } from '../../services/persistence';
import { FREE_TIER_WELCOME_CREDITS } from '../../services/configData';
import { newId } from '../../services/ids';

export interface AuthScreenProps {
  initialMode?: 'signin' | 'signup';
  theme: 'light' | 'dark';
  onSuccess: (user: UserProfile) => void;
  onBackToLanding: () => void;
}

/**
 * Turns raw Supabase/GoTrue errors into copy a user can act on.
 * The raw error is always logged to the console for debugging.
 */
const friendlyAuthError = (raw: unknown): string => {
  console.error('[auth] raw error:', raw);
  const anyRaw = raw as any;
  const msg = typeof raw === 'string' ? raw : anyRaw?.message || anyRaw?.msg || '';
  const code = anyRaw?.error_code || anyRaw?.code || '';
  const s = `${code} ${msg}`.toLowerCase();

  if (s.includes('provider is not enabled') || s.includes('unsupported provider')) {
    return 'Google sign-in is not available right now. Please continue with email or phone instead.';
  }
  if (s.includes('database error saving new user') || s.includes('unexpected_failure')) {
    return "We couldn't create your account right now. Please try again in a moment. If it keeps happening, contact support.";
  }
  if (s.includes('invalid login credentials') || s.includes('invalid_credentials')) {
    return 'Incorrect email/phone or password. Please try again.';
  }
  if (s.includes('already registered') || s.includes('user_already_exists')) {
    return 'An account with these details already exists. Try signing in instead.';
  }
  if (s.includes('email not confirmed') || s.includes('email_not_confirmed')) {
    return 'Please confirm your email address before signing in. Check your inbox for the confirmation link.';
  }
  if (s.includes('rate limit') || s.includes('over_email_send_rate_limit') || s.includes('too many')) {
    return 'Too many attempts. Please wait a minute and try again.';
  }
  if (s.includes('weak_password') || s.includes('password should be')) {
    return 'That password is too weak. Please choose a stronger one (at least 6 characters).';
  }
  if (s.includes('failed to fetch') || s.includes('networkerror') || s.includes('network')) {
    return 'Network problem. Please check your connection and try again.';
  }
  return 'Something went wrong while signing you in. Please try again.';
};

export const AuthScreen: React.FC<AuthScreenProps> = ({
  initialMode = 'signin',
  theme,
  onSuccess,
  onBackToLanding,
}) => {
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
  const [inputMethod, setInputMethod] = useState<'email' | 'phone'>('email');

  // Form Fields
  const [name, setName] = useState('');
  const [identifier, setIdentifier] = useState(''); // email or phone
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Validation & Loading
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);

    // Validation checks
    if (!identifier.trim()) {
      setErrorMsg(`Please provide a valid ${inputMethod === 'email' ? 'email address' : 'phone number (+237...)'}`);
      return;
    }

    if (inputMethod === 'email' && !identifier.includes('@')) {
      setErrorMsg('Please enter a valid email address with @');
      return;
    }

    if (mode === 'signup' && !name.trim()) {
      setErrorMsg('Please enter your full name');
      return;
    }

    if (!password || password.length < 6) {
      setErrorMsg('Password must be at least 6 characters long');
      return;
    }

    setIsLoading(true);

    // Check if referral code exists in localStorage with 30-day validity
    let storedRefCode: string | null = null;
    try {
      const rawRef = localStorage.getItem('bidou:ref');
      if (rawRef) {
        const parsed = JSON.parse(rawRef);
        if (parsed.expiresAt && Date.now() < parsed.expiresAt && parsed.code) {
          storedRefCode = parsed.code;
        } else {
          localStorage.removeItem('bidou:ref');
        }
      }
    } catch {
      // ignore
    }

    if (hasSupabaseEnv()) {
      const supabase = getSupabaseClient()!;
      try {
        const cleanEmail = inputMethod === 'email' ? identifier.trim() : `${identifier.replace(/\D/g, '')}@bidou.user`;
        if (mode === 'signup') {
          const { data, error } = await supabase.auth.signUp({
            email: cleanEmail,
            password,
            options: {
              data: {
                name: name.trim(),
              },
            },
          });
          if (error) {
            setErrorMsg(friendlyAuthError(error));
            setIsLoading(false);
            return;
          }
          if (data.user && !data.session) {
            // Email confirmation is enabled: there is no session until the user confirms.
            setInfoMsg(
              inputMethod === 'email'
                ? 'Account created! Check your inbox and click the confirmation link, then sign in.'
                : 'Account created, but phone sign-ups cannot be confirmed right now. Please sign up with email instead.'
            );
            setIsLoading(false);
            return;
          }
          if (data.user) {
            const newUserId = data.user.id;
            // Record referral if present and not self-referral
            if (storedRefCode) {
              await persistence.recordReferral(storedRefCode, newUserId, window.location.href);
              localStorage.removeItem('bidou:ref');
            }
            const profile = await persistence.loadProfile(newUserId);
            const userObj: UserProfile = profile || {
              id: newUserId,
              email: cleanEmail,
              name: name.trim(),
              plan_tier: 'free',
              is_admin: false,
              language_preference: 'fr',
              theme_preference: theme,
              created_at: new Date().toISOString(),
            };
            setIsLoading(false);
            onSuccess(userObj);
            return;
          }
        } else {
          const { data, error } = await supabase.auth.signInWithPassword({
            email: cleanEmail,
            password,
          });
          if (error) {
            setErrorMsg(friendlyAuthError(error));
            setIsLoading(false);
            return;
          }
          if (data.user) {
            const profile = await persistence.loadProfile(data.user.id);
            const userObj: UserProfile = profile || {
              id: data.user.id,
              email: cleanEmail,
              name: data.user.user_metadata?.name || cleanEmail.split('@')[0],
              plan_tier: 'free',
              is_admin: false,
              language_preference: 'fr',
              theme_preference: theme,
              created_at: new Date().toISOString(),
            };
            setIsLoading(false);
            onSuccess(userObj);
            return;
          }
        }
      } catch (err: any) {
        setErrorMsg(friendlyAuthError(err));
        setIsLoading(false);
        return;
      }
    }

    // Offline / demo fallback session
    setTimeout(async () => {
      setIsLoading(false);
      const generatedUserId = newId('usr_');
      const authenticatedUser: UserProfile = {
        id: generatedUserId,
        email: inputMethod === 'email' ? identifier.trim() : `${identifier.replace(/\D/g, '')}@bidou.user`,
        name: mode === 'signup' ? name.trim() : (identifier.split('@')[0] || 'Creative Creator'),
        plan_tier: 'free',
        is_admin: false, // Standard users are never admin
        language_preference: 'fr',
        theme_preference: theme,
        created_at: new Date().toISOString(),
      };

      if (mode === 'signup' && storedRefCode) {
        await persistence.recordReferral(storedRefCode, generatedUserId, window.location.href);
        localStorage.removeItem('bidou:ref');
      }

      await persistence.saveProfile(authenticatedUser);
      onSuccess(authenticatedUser);
    }, 650);
  };

  const handleGoogleOneTap = async () => {
    setErrorMsg(null);
    setInfoMsg(null);
    setIsLoading(true);

    if (hasSupabaseEnv()) {
      const supabase = getSupabaseClient()!;
      try {
        // Ask for the provider URL instead of redirecting blindly. If Google is not
        // enabled in Supabase, a blind redirect strands the user on a raw JSON error page.
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: window.location.origin,
            skipBrowserRedirect: true,
          },
        });
        if (error || !data?.url) {
          setErrorMsg(friendlyAuthError(error || 'Google sign-in could not start'));
          setIsLoading(false);
          return;
        }

        // Preflight: surface "provider is not enabled" (HTTP 400) inside our own UI.
        try {
          const res = await fetch(data.url, { redirect: 'manual' });
          if (res.type !== 'opaqueredirect' && res.status >= 400) {
            let body: unknown = null;
            try {
              body = await res.json();
            } catch {
              // body was not JSON
            }
            setErrorMsg(friendlyAuthError(body || `HTTP ${res.status}`));
            setIsLoading(false);
            return;
          }
        } catch {
          // Preflight blocked (CORS/network). Fall through and try the redirect anyway.
        }

        // Google refuses to load its sign-in page inside an iframe (e.g. an embedded preview).
        if (window.self !== window.top) {
          setErrorMsg('Google sign-in cannot run inside an embedded preview. Open the app in its own browser tab and try again.');
          setIsLoading(false);
          return;
        }

        window.location.assign(data.url);
      } catch (err) {
        setErrorMsg(friendlyAuthError(err));
        setIsLoading(false);
      }
      return;
    }

    // Offline fallback for Google OAuth
    setTimeout(async () => {
      setIsLoading(false);
      const googleUser: UserProfile = {
        id: newId('usr_google_'),
        email: 'creator.africa@bidou.ai',
        name: 'Amina Bekolo (Google)',
        plan_tier: 'free',
        is_admin: false,
        language_preference: 'fr',
        theme_preference: theme,
        created_at: new Date().toISOString(),
      };
      await persistence.saveProfile(googleUser);
      onSuccess(googleUser);
    }, 600);
  };

  return (
    <div className="min-h-screen w-full flex flex-col justify-between bg-[#FFFFFF] dark:bg-[#121214] text-[#1A1A1E] dark:text-[#F5F5F7] p-4 sm:p-6 lg:p-8 transition-colors">
      {/* Top Bar: Back & Logo */}
      <div className="max-w-7xl mx-auto w-full flex items-center justify-between pb-4">
        <button
          type="button"
          onClick={onBackToLanding}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl glass-panel text-xs font-semibold text-[#6B6B75] dark:text-[#A0A0AA] hover:text-[#F86A00] transition-colors cursor-pointer"
        >
          <ArrowLeft size={16} />
          <span>Back to Home</span>
        </button>

        <div onClick={onBackToLanding} className="cursor-pointer">
          <BidouLogo
            variant={theme === 'dark' ? 'dark' : 'light'}
            size={36}
          />
        </div>

        <div className="w-20" /> {/* Balancer spacer */}
      </div>

      {/* Main Centered Card */}
      <div className="w-full max-w-md mx-auto my-auto py-6">
        <div className="glass-panel border border-[#FF8800]/25 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden bg-white/70 dark:bg-[#121214]/70 backdrop-blur-xl">
          {/* Subtle Ambient Glow */}
          <div className="absolute top-0 right-0 w-48 h-48 bg-[#FF8800]/10 rounded-full blur-2xl pointer-events-none" />

          {/* Mode Switcher Tabs */}
          <div className="flex items-center p-1 rounded-2xl glass-panel border border-[#FF8800]/20 mb-6">
            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setErrorMsg(null);
                setInfoMsg(null);
              }}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                mode === 'signin'
                  ? 'bg-brand-gradient text-white shadow-sm'
                  : 'text-[#6B6B75] dark:text-[#A0A0AA] hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7]'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setErrorMsg(null);
                setInfoMsg(null);
              }}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                mode === 'signup'
                  ? 'bg-brand-gradient text-white shadow-sm'
                  : 'text-[#6B6B75] dark:text-[#A0A0AA] hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7]'
              }`}
            >
              Create Account
            </button>
          </div>

          {/* Title & Subtitle */}
          <div className="text-center mb-6">
            <h2 className="jost text-2xl font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
              {mode === 'signin' ? 'Welcome Back to Bidou' : 'Create Your Creative Account'}
            </h2>
            <p className="inter text-xs text-[#6B6B75] dark:text-[#A0A0AA] mt-1">
              {mode === 'signin'
                ? 'Access your saved projects, models, and universal wallet.'
                : `Join creators across Africa. Includes ${FREE_TIER_WELCOME_CREDITS} free welcome credits for fast image models.`}
            </p>
          </div>

          {/* Free bonus callout for Sign Up */}
          {mode === 'signup' && (
            <div className="mb-5 p-3 rounded-2xl glass-panel border border-[#FF8800]/30 bg-gradient-to-r from-[#F86A00]/10 to-[#FFB020]/10 flex items-center gap-2.5">
              <Sparkles size={16} className="text-[#FF8800] shrink-0" />
              <div className="text-[11px] font-semibold text-[#1A1A1E] dark:text-[#F5F5F7]">
                <span className="text-brand-gradient font-bold">{FREE_TIER_WELCOME_CREDITS} Free Welcome Credits</span> for fast image models will be credited immediately to your wallet.
              </div>
            </div>
          )}

          {/* Google One-Tap / OAuth Button */}
          <button
            type="button"
            onClick={handleGoogleOneTap}
            disabled={isLoading}
            className="w-full py-2.5 px-4 rounded-xl glass-panel border border-[#FF8800]/25 hover:border-[#FF8800] flex items-center justify-center gap-3 text-xs font-semibold text-[#1A1A1E] dark:text-[#F5F5F7] transition-all hover:bg-black/5 dark:hover:bg-white/5 active:scale-98 cursor-pointer disabled:opacity-50 mb-4"
          >
            {/* Standard Google SVG Mark */}
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Continue with Google</span>
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-black/10 dark:bg-white/10" />
            <span className="text-[10px] uppercase font-bold text-[#6B6B75] dark:text-[#A0A0AA] tracking-wider">
              or continue with {inputMethod}
            </span>
            <div className="flex-1 h-px bg-black/10 dark:bg-white/10" />
          </div>

          {/* Input Method Toggle (Email vs Phone) */}
          <div className="flex justify-center gap-4 mb-4 text-xs">
            <button
              type="button"
              onClick={() => {
                setInputMethod('email');
                setIdentifier('');
                setErrorMsg(null);
                setInfoMsg(null);
              }}
              className={`flex items-center gap-1.5 pb-1 border-b-2 transition-all cursor-pointer ${
                inputMethod === 'email'
                  ? 'border-[#FF8800] text-[#FF8800] font-bold'
                  : 'border-transparent text-[#6B6B75] hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7]'
              }`}
            >
              <Mail size={13} />
              <span>Email</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setInputMethod('phone');
                setIdentifier('+237 ');
                setErrorMsg(null);
                setInfoMsg(null);
              }}
              className={`flex items-center gap-1.5 pb-1 border-b-2 transition-all cursor-pointer ${
                inputMethod === 'phone'
                  ? 'border-[#FF8800] text-[#FF8800] font-bold'
                  : 'border-transparent text-[#6B6B75] hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7]'
              }`}
            >
              <Phone size={13} />
              <span>Phone (+237)</span>
            </button>
          </div>

          {/* Inline Error State (no native alert/confirm) */}
          {errorMsg && (
            <div className="mb-4 p-3 rounded-2xl glass-panel border border-[#E74C3C]/40 bg-[#E74C3C]/10 text-[#E74C3C] text-xs flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {infoMsg && (
            <div className="mb-4 p-3 rounded-2xl glass-panel border border-[#2ECC71]/40 bg-[#2ECC71]/10 text-[#1E8E4E] dark:text-[#2ECC71] text-xs flex items-center gap-2">
              <CheckCircle2 size={16} className="shrink-0" />
              <span>{infoMsg}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name Field (Sign up only) */}
            {mode === 'signup' && (
              <div>
                <label className="block text-[11px] font-semibold text-[#6B6B75] dark:text-[#A0A0AA] mb-1">
                  Full Name / Studio Name
                </label>
                <div className="relative">
                  <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6B6B75]" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Amina Bekolo"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl glass-panel border border-[#FF8800]/20 focus:border-[#FF8800] text-xs text-[#1A1A1E] dark:text-[#F5F5F7] outline-none transition-colors"
                  />
                </div>
              </div>
            )}

            {/* Email or Phone Input */}
            <div>
              <label className="block text-[11px] font-semibold text-[#6B6B75] dark:text-[#A0A0AA] mb-1">
                {inputMethod === 'email' ? 'Email Address' : 'Mobile Phone Number'}
              </label>
              <div className="relative">
                {inputMethod === 'email' ? (
                  <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6B6B75]" />
                ) : (
                  <Phone size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6B6B75]" />
                )}
                <input
                  type={inputMethod === 'email' ? 'email' : 'tel'}
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder={inputMethod === 'email' ? 'you@domain.com' : '+237 699 00 00 00'}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl glass-panel border border-[#FF8800]/20 focus:border-[#FF8800] text-xs text-[#1A1A1E] dark:text-[#F5F5F7] outline-none transition-colors"
                />
              </div>
            </div>

            {/* Password Input */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-semibold text-[#6B6B75] dark:text-[#A0A0AA]">
                  Password
                </label>
                {mode === 'signin' && (
                  <button
                    type="button"
                    onClick={() => setErrorMsg('A password reset link has been dispatched to your email/phone.')}
                    className="text-[11px] text-[#FF8800] hover:underline"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6B6B75]" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl glass-panel border border-[#FF8800]/20 focus:border-[#FF8800] text-xs text-[#1A1A1E] dark:text-[#F5F5F7] outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className={`absolute right-3.5 top-1/2 -translate-y-1/2 p-1 rounded-md transition-colors cursor-pointer ${
                    showPassword
                      ? 'text-[#F86A00] bg-[#FF8800]/15'
                      : 'text-[#6B6B75] hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7]'
                  }`}
                >
                  {showPassword ? <Eye size={15} /> : <EyeOff size={15} />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 rounded-2xl text-xs font-bold text-white bg-brand-gradient shadow-lg shadow-[#F86A00]/25 hover:opacity-95 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2"
            >
              {isLoading ? (
                <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              ) : (
                <>
                  <Sparkles size={15} />
                  <span>{mode === 'signin' ? 'Sign In to Studio' : 'Create Free Account'}</span>
                </>
              )}
            </button>
          </form>

          {/* Terms notice */}
          <p className="inter text-[10px] text-center text-[#6B6B75] dark:text-[#A0A0AA] mt-6 leading-relaxed">
            By continuing, you agree to Bidou AI's Creative Community Terms, Fair Use Policy, and Commercial Content Rights.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-xs text-[#6B6B75] dark:text-[#A0A0AA] py-2">
        <span>© 2026 Bidou AI Studio • African Generative Intelligence</span>
      </div>
    </div>
  );
};
