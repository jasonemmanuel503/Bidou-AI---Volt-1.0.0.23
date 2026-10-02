// Bidou AI Types Definition
/**
 * BIDOU AI - Core TypeScript Definitions
 * Single source of truth for database entities, API structures, and platform models.
 */

export type GenerationType = 'image' | 'video' | 'music' | 'voice';

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';

export type TransactionType =
  | 'purchase'
  | 'generation_reservation'
  | 'generation_consumed'
  | 'generation_refund'
  | 'admin_adjustment'
  | 'bonus'
  | 'promotion'
  | 'subscription_credit'
  | 'expiration';

export type PaymentStatus = 'pending' | 'successful' | 'failed' | 'refunded';

export type PaymentRail = 'mtn_momo' | 'orange_money';

export type PaymentMethodCountry =
  | 'CM' // Cameroon (+237)
  | 'CI' // Côte d'Ivoire (+225)
  | 'SN' // Senegal (+221)
  | 'BJ' // Benin (+229)
  | 'TG' // Togo (+228)
  | 'ML' // Mali (+223)
  | 'BF' // Burkina Faso (+226)
  | 'GN' // Guinea (+224)
  | 'CG' // Congo (+242)
  | 'CD' // DR Congo (+243)
  | 'GA'; // Gabon (+241)

export interface UserPaymentMethod {
  id: string;
  user_id: string;
  rail: PaymentRail;               // 'mtn_momo' | 'orange_money'
  account_holder_name: string;
  country_iso2: string;            // 'CM'
  country_dial_code: string;       // '+237'
  national_number: string;         // '677123456' — digits only, no dial code
  logo_key?: 'mtn' | 'orange' | 'custom' | null;
  custom_logo_url?: string | null;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

// Backwards compatibility alias for SavedPaymentMethod
export type SavedPaymentMethod = UserPaymentMethod;

export type ShowcaseStatus = 'pending_review' | 'approved' | 'rejected';

export type FeaturedBy = 'user_opt_in' | 'admin';

export type PlanTier = 'free' | 'starter' | 'creator' | 'pro' | 'studio';

export type AppView = 'studio' | 'videos' | 'images' | 'music' | 'landing' | 'pricing' | 'projects' | 'discovery' | 'admin' | 'auth' | 'profile' | 'billing' | 'trash';

export type ThemePreference = 'system' | 'light' | 'dark';

export type LanguagePreference = 'fr' | 'en';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  phone?: string;
  avatar_url?: string;
  plan_tier: PlanTier;
  badges?: PlanTier[];
  media_badges?: ('image' | 'video' | 'music')[];
  lifetime_spend_fcfa?: number;
  affiliate_code?: string;
  referred_by?: string;
  language_preference: LanguagePreference;
  theme_preference: ThemePreference;
  created_at: string;
  is_admin?: boolean;
}

export interface CreditWallet {
  id: string;
  user_id: string;
  balance: number; // Universal credit wallet (anchored to Studio pack at ~0.79 XAF/credit)
  paid_balance?: number;
  promo_balance?: number;
  lifetime_spend_fcfa?: number;
  updated_at: string;
}

export type SupplierId = 'google' | 'kie' | 'alibaba' | 'cloudflare' | 'musicapi' | 'sunor';

export interface SupplierRoute {
  supplier: SupplierId;
  upstream_model: string;      // the id that supplier expects
  provider_model_id?: string;
  cost_usd_override?: number | null;
  priority: number;            // 1 = try first
  env: 'dev' | 'prod' | 'both';
  enabled: boolean;
}

export interface VideoOptions {
  resolutions: string[];                       // e.g. ['480p','720p','1080p']
  durations: number[] | { min: number; max: number; step: number };
  max_duration_by_plan?: Partial<Record<PlanTier, number>>;
}

export interface CreditTransaction {
  id: string;
  user_id: string;
  type: TransactionType;
  amount: number; // Signed integer
  balance_after: number; // Computed and written at write-time (immutable audit)
  reference_id: string; // Foreign key to job ID, payment ID, or admin action ID
  description: string;
  created_at: string;
}

export interface CreditReservation {
  id: string;
  user_id: string;
  job_id: string;
  amount: number;
  settled: boolean;
  expires_at: string;
  created_at: string;
}

export interface AiModelConfig {
  id: string;
  provider: string; // e.g. 'google', 'musicapi', 'byte_dance_seedance', 'kuaishou_kling'
  model_name: string; // e.g. 'nano_banana_2_lite', 'veo_3_1_fast', 'lyria_3_pro' (legacy key for Sonic v4.5), 'suno_sonic_v5' (legacy key for Sonic v5)
  display_name: string;
  generation_type: GenerationType;
  unit: 'per_second' | 'per_song' | 'per_generation';
  provider_cost: number; // in USD
  credit_cost: number; // Derived via central pricing formula, read-only in UI
  active: boolean; // Gated strictly by licensing_verified
  quality_tier: 'lite' | 'fast' | 'standard' | 'pro';
  licensing_verified: boolean; // Must be true before model can be activated
  max_concurrent_variants: number; // 1-4 variants
  prompt_style_guide?: string;
  max_upscale?: '1080p' | '1k' | '2k' | '4k' | string;
  upscale_credit_cost?: number;
  supported_aspect_ratios?: string[]; // e.g. ['16:9', '9:16']
  pricing_kind?: 'per_image' | 'per_clip' | 'per_second' | 'per_song';
  promo_eligible?: boolean;      // free signup credits may be spent on this model
  is_premium?: boolean;          // counts toward the tier's monthly premium cap
  min_plan_tier?: PlanTier;      // optional gate
  min_margin?: number;
  pricing_overrides?: Record<string, any>;
  video_options?: VideoOptions;
  suppliers?: SupplierRoute[];   // ordered supplier routes
  created_at: string;
  updated_at: string;
}

export interface ModelCostHistory {
  id: string;
  model_id: string;
  provider_cost: number;
  credit_cost: number;
  effective_date: string;
  changed_by: string;
  reason: string;
}

export interface ModelPerformanceTelemetry {
  id: string;
  model_id: string;
  average_completion_seconds: number;
  total_runs: number;
  failure_rate_percentage: number;
  last_updated: string;
}

export interface GenerationJob {
  id: string;
  user_id: string;
  type: GenerationType;
  provider?: string;
  credit_cost?: number;
  model_name: string;
  status: JobStatus;
  prompt: string;
  media_type?: GenerationType;
  model_id?: string;
  enhanced_prompt?: string;
  negative_prompt?: string;
  aspect_ratio?: string; // 16:9, 9:16, 1:1
  duration_seconds?: number;
  resolution?: string; // 720p, 1080p, 4k
  audio_flag?: boolean;
  reference_image_url?: string;
  
  // Music specifics
  genre?: string;
  tonality?: string;
  lyrics?: string;
  has_cover_art?: boolean;
  cover_art_url?: string;
  
  // Results
  output_urls: string[]; // e.g. two audio takes or video/image url
  thumbnail_url?: string;
  fallback_triggered?: boolean;
  fallback_reason?: string;
  
  // Financial & ledger
  batch_count?: number;
  credits_reserved?: number;
  credits_consumed?: number;
  credits_refunded?: number;
  effective_cost_fcfa?: number;
  reservation_id?: string;
  
  // Timings
  queue_position?: number;
  estimated_duration_seconds?: number;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  error_message?: string;

  // Asset Engine & Retry snapshot (Section 5)
  client_settings?: Record<string, any>;
  deleted_at?: string | null;
  variants?: GenerationJobVariant[];
}

export interface GenerationJobVariant {
  id: string;
  job_id: string;
  user_id: string;
  variant_index: number;
  status: JobStatus;
  output_url?: string;
  thumbnail_url?: string;
  provider_job_id?: string;
  supplier?: SupplierId;
  simulated?: boolean;
  error_message?: string;
  credits_unit: number;
  upscaled_urls?: Record<string, string>;
  deleted_at?: string | null;
  purge_after?: string | null;
  deleted_by_tier?: PlanTier | null;
  storage_path?: string | null;
  purged_at?: string | null;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface RestoreRequest {
  tab: GenerationType;
  settings: Record<string, any>;
  token: number;
}

export interface FuturaPayPayment {
  id: string;
  reference_id: string; // Unique transaction identifier
  user_id: string;
  package_id: string;
  amount_fcfa: number;
  credits_to_add: number;
  payment_rail: PaymentRail;
  phone_number: string;
  status: PaymentStatus;
  futurapay_tx_id?: string;
  fee_fcfa: number;
  created_at: string;
  completed_at?: string;
}

export interface ShowcaseItem {
  id: string;
  generation_id: string;
  user_id: string;
  user_name: string;
  media_type: GenerationType;
  title: string;
  prompt: string;
  preview_url: string;
  thumbnail_url?: string;
  status: ShowcaseStatus;
  featured_by: FeaturedBy;
  display_order: number;
  genre_or_style?: string;
  created_at: string;
}

export interface Project {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  position?: number;
  item_count?: number;
  cover_url?: string;
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
  item_ids?: string[];
}

export type ProjectFolder = Project;

export interface ProjectItem {
  id: string;
  project_id: string;
  variant_id: string;
  job_id: string;
  user_id: string;
  position: number;
  added_at: string;
  variant?: GenerationJobVariant;
  job?: GenerationJob;
}

export interface AddonPurchase {
  id: string;
  user_id: string;
  addon_type: 'lyrics_ai_rewrite' | 'cover_art_pro_upgrade';
  cost_fcfa: number;
  created_at: string;
}

export interface AdminAuditLog {
  id: string;
  admin_email: string;
  action: string;
  target_resource: string;
  details: string;
  created_at: string;
}

export interface UserMediaBadge {
  user_id?: string;
  media: 'image' | 'video' | 'music';
  generations_count: number;
  earned_at: string | null;
}

export interface CreditPackage {
  id: string;
  media_tab?: 'image' | 'video' | 'music';
  tier?: PlanTier;
  name: string;
  price_fcfa: number;
  credits: number;
  bonus_credits?: number;
  popular?: boolean;
  active?: boolean;
  discount_percent?: number;
  estimated_generations?: {
    label: string;
    count: number;
  }[];
  features: string[];
}

export type ReferralStatus = 'pending' | 'qualified' | 'rewarded' | 'rejected';
export type RewardKind = 'bonus_credits' | 'cash_fcfa';

export interface ReferralRecord {
  id: string;
  referrer_id: string;
  referred_user_id: string;
  affiliate_code: string;
  status: ReferralStatus;
  signed_up_at: string;
  qualified_at?: string;
  qualifying_purchase_id?: string;
  landing_page?: string;
}

export interface ReferralRewardRecord {
  id: string;
  referral_id: string;
  referrer_id: string;
  referrer_name?: string;
  referrer_email?: string;
  referred_user_email?: string;
  kind: RewardKind;
  amount: number;
  paid_out: boolean;
  paid_out_at?: string;
  payout_reference?: string;
  created_at: string;
  is_payable?: boolean;
  hold_days_remaining?: number;
}

export interface AffiliateStats {
  clicks: number;
  signups: number;
  qualified: number;
  earned: number;
  paid: number;
}

export interface AffiliateLeaderboardItem {
  referrer_id: string;
  name: string;
  email: string;
  code: string;
  signups_count: number;
  qualified_count: number;
  total_earned_fcfa: number;
}

export interface AffiliateFraudFlag {
  id: string;
  type: 'same_device' | 'same_phone_prefix' | 'high_velocity' | 'suspicious';
  description: string;
  affiliate_code: string;
  referrer_id: string;
  severity: 'low' | 'medium' | 'high';
  created_at: string;
}

export interface Favorite {
  id: string;
  user_id: string;
  variant_id: string;
  created_at: string;
}

export interface Playlist {
  id: string;
  user_id: string;
  name: string;
  tags: string[];
  position: number;
  item_count: number;
  cover_urls: string[];
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlaylistItem {
  id: string;
  playlist_id: string;
  variant_id: string;
  user_id: string;
  position: number;
  added_at: string;
  variant?: GenerationJobVariant;
  job?: GenerationJob;
}

export interface LibraryItem extends GenerationJobVariant {
  prompt: string;
  model_name: string;
  aspect_ratio?: string;
  resolution?: string;
  duration_seconds?: number;
  genre?: string;
  tonality?: string;
  cover_art_url?: string;
  media_type: GenerationType;
  is_favorite: boolean;
  rawJob?: GenerationJob;
}

