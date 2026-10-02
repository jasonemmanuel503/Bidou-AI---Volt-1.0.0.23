-- ============================================================
-- Bidou AI — Seed credit packages catalogue
-- Synchronized with INITIAL_PACKAGES in src/services/configData.ts
-- ============================================================

insert into credit_packages (
  id,
  media_tab,
  tier,
  name,
  price_fcfa,
  credits,
  popular,
  discount_percent,
  features,
  active
) values
  -- Image Packages
  (
    'pkg_img_starter',
    'image',
    'starter',
    'Image Starter',
    1500,
    1500,
    false,
    null,
    '["1,500 Universal Credits", "High-resolution downloads", "Commercial usage included", "Fast Google Cloud inference"]'::jsonb,
    true
  ),
  (
    'pkg_img_creator',
    'image',
    'creator',
    'Image Creator',
    3500,
    3800,
    true,
    null,
    '["3,800 Universal Credits (Bonus included)", "Cinematic 2K upscale support", "Priority queue processing", "Dedicated project folders"]'::jsonb,
    true
  ),
  (
    'pkg_img_pro',
    'image',
    'pro',
    'Image Pro',
    7000,
    8500,
    false,
    null,
    '["8,500 Universal Credits (Best value)", "Full 4K Ultra-HD options", "Private mode (no showcase)", "Direct WhatsApp status & social exports"]'::jsonb,
    true
  ),

  -- Video Packages
  (
    'pkg_vid_starter',
    'video',
    'starter',
    'Video Starter',
    4000,
    4000,
    false,
    null,
    '["4,000 Universal Credits", "720p HD generation with audio", "Text-to-Video and Image-to-Video", "Zero Cloudflare R2 egress fees"]'::jsonb,
    true
  ),
  (
    'pkg_vid_creator',
    'video',
    'creator',
    'Video Creator',
    9000,
    10000,
    true,
    null,
    '["10,000 Universal Credits (+1,000 bonus)", "Smooth 60fps frame synthesis", "Aspect ratio presets (16:9, 9:16, 1:1)", "Prompt enhancer assistance"]'::jsonb,
    true
  ),
  (
    'pkg_vid_pro',
    'video',
    'pro',
    'Video Pro',
    20000,
    24000,
    false,
    null,
    '["24,000 Universal Credits", "Priority GPU cluster scheduling", "1080p full high-definition exports", "Full commercial license"]'::jsonb,
    true
  ),
  (
    'pkg_vid_studio',
    'video',
    'studio',
    'Video Studio',
    45000,
    60000,
    false,
    null,
    '["60,000 Universal Credits (Bulk discount)", "Multi-project management", "Highest queue priority", "Direct account manager support"]'::jsonb,
    true
  ),

  -- Music Packages
  (
    'pkg_mus_starter',
    'music',
    'starter',
    'Music Starter',
    2000,
    2000,
    false,
    null,
    '["2,000 Universal Credits", "Sonic v4.5 / Sonic v5", "2 generated takes per song request", "African & Western genre coverage"]'::jsonb,
    true
  ),
  (
    'pkg_mus_creator',
    'music',
    'creator',
    'Music Creator',
    4500,
    5000,
    true,
    null,
    '["5,000 Universal Credits (+500 bonus)", "AI Lyrics generation with tonality controls", "Makossa, Bikutsi, Amapiano, Afrobeats & Mbolé presets", "Separated Cover Art trigger available"]'::jsonb,
    true
  ),
  (
    'pkg_mus_pro',
    'music',
    'pro',
    'Music Pro',
    9000,
    11000,
    false,
    null,
    '["11,000 Universal Credits (+2,000 bonus)", "Publish-ready package export", "Lyrics AI-rewrite eligible (300 FCFA)", "Spotify / WhatsApp Status / YouTube export kit"]'::jsonb,
    true
  )
on conflict (id) do update set
  media_tab = excluded.media_tab,
  tier = excluded.tier,
  name = excluded.name,
  price_fcfa = excluded.price_fcfa,
  credits = excluded.credits,
  popular = excluded.popular,
  discount_percent = excluded.discount_percent,
  features = excluded.features,
  active = excluded.active;

-- ============================================================
-- Bidou AI — Seed AI Models catalogue
-- Synchronized with INITIAL_AI_MODELS in src/services/configData.ts
-- ============================================================

insert into ai_models (
  id,
  provider,
  model_name,
  display_name,
  generation_type,
  unit,
  provider_cost,
  credit_cost,
  active,
  quality_tier,
  licensing_verified,
  max_concurrent_variants
) values
  ('img_nano_banana_2_lite', 'google', 'nano_banana_2_lite', 'Nano Banana 2 Lite (Fast 1K)', 'image', 'per_generation', 0.0336, 70, true, 'lite', true, 4),
  ('img_nano_banana_2', 'google', 'nano_banana_2', 'Nano Banana 2 (HQ 1K)', 'image', 'per_generation', 0.067, 140, true, 'fast', true, 4),
  ('img_nano_banana_pro', 'google', 'nano_banana_pro', 'Nano Banana Pro (Cinematic 2K)', 'image', 'per_generation', 0.134, 280, true, 'pro', true, 2),
  ('vid_veo_3_1_lite', 'google', 'veo_3_1_lite', 'Google Veo 3.1 Lite (720p)', 'video', 'per_second', 0.05, 480, true, 'lite', true, 4),
  ('vid_veo_3_1_fast', 'google', 'veo_3_1_fast', 'Google Veo 3.1 Fast (Smooth 720p)', 'video', 'per_second', 0.10, 960, true, 'fast', true, 2),
  ('vid_veo_3_1_standard', 'google', 'veo_3_1_standard', 'Google Veo 3.1 Cinematic (Studio Tier)', 'video', 'per_second', 0.40, 3840, true, 'standard', true, 1),
  ('mus_lyria_3_pro', 'musicapi', 'lyria_3_pro', 'Sonic v4.5 (Full Studio)', 'music', 'per_song', 0.11, 220, true, 'fast', true, 2),
  ('mus_suno_sonic_v5', 'musicapi', 'suno_sonic_v5', 'Sonic v5 (Vocalist Master)', 'music', 'per_song', 0.12, 240, true, 'pro', true, 2),
  ('vid_kuaishou_kling', 'kuaishou', 'kling_1_5', 'Kling 1.5 Video (Fallback Candidate)', 'video', 'per_second', 0.07, 672, false, 'fast', false, 2),
  ('vid_bytedance_seedance', 'bytedance', 'seedance_v1', 'Seedance Video (Fallback Candidate)', 'video', 'per_second', 0.06, 576, false, 'lite', false, 2),
  ('voi_elevenlabs_tales', 'elevenlabs', 'eleven_multilingual_v2', 'ElevenLabs Voice & African Tales Narration', 'voice', 'per_generation', 0.04, 80, false, 'pro', false, 1)
on conflict (id) do update set
  provider = excluded.provider,
  model_name = excluded.model_name,
  display_name = excluded.display_name,
  generation_type = excluded.generation_type,
  unit = excluded.unit,
  provider_cost = excluded.provider_cost,
  credit_cost = excluded.credit_cost,
  active = excluded.active,
  quality_tier = excluded.quality_tier,
  licensing_verified = excluded.licensing_verified,
  max_concurrent_variants = excluded.max_concurrent_variants,
  updated_at = now();

