-- ============================================================================
-- Migration: 20261002010000_add_suno_v6_sunor.sql
-- Purpose:
--   1. Extend `supplier` CHECK constraints on `public.model_suppliers` and
--      `public.supplier_status` to include `'sunor'`.
--   2. Register the `sunor` supplier (`https://sunor.cc/api/v1`) in `supplier_status`
--      with a $25/day default spend limit.
--   3. Seed the `mus_suno_v6` ("Suno V6 (Flagship Studio)") music model in `ai_models`
--      at 410 credits ($0.10/task provider cost with a 0.20 target COGS ratio /
--      80% target gross margin), active and licensing_verified so it appears in the
--      Music Studio model picker.
--   4. Map `mus_suno_v6` exclusively to `sunor` (`upstream_model = 'suno'`, priority 1)
--      in `model_suppliers` (no silent fallback to other models or suppliers).
--
-- Idempotent: safe to run multiple times.
-- ============================================================================

-- 1. Update CHECK constraints on model_suppliers and supplier_status to allow 'sunor'
ALTER TABLE public.model_suppliers
  DROP CONSTRAINT IF EXISTS model_suppliers_supplier_check;

ALTER TABLE public.model_suppliers
  ADD CONSTRAINT model_suppliers_supplier_check
  CHECK (supplier IN ('google', 'kie', 'alibaba', 'cloudflare', 'musicapi', 'sunor'));

ALTER TABLE public.supplier_status
  DROP CONSTRAINT IF EXISTS supplier_status_supplier_check;

ALTER TABLE public.supplier_status
  ADD CONSTRAINT supplier_status_supplier_check
  CHECK (supplier IN ('google', 'kie', 'alibaba', 'cloudflare', 'musicapi', 'sunor'));

-- 2. Seed `sunor` in `supplier_status`
INSERT INTO public.supplier_status (supplier, enabled, tripped_until, trip_reason, daily_spend_limit_usd, updated_at)
VALUES ('sunor', TRUE, NULL, NULL, 25.00, now())
ON CONFLICT (supplier) DO UPDATE SET
  daily_spend_limit_usd = COALESCE(public.supplier_status.daily_spend_limit_usd, EXCLUDED.daily_spend_limit_usd),
  updated_at            = now();

-- 3. Seed `mus_suno_v6` in `ai_models`
-- Pricing math: $0.10/task * 1.05 retry + $0.002 storage = $0.107 -> 410 credits at 0.20 target COGS ratio.
INSERT INTO public.ai_models (
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
  max_concurrent_variants,
  max_upscale,
  upscale_credit_cost,
  pricing_kind,
  promo_eligible,
  is_premium,
  video_options
) VALUES (
  'mus_suno_v6',
  'sunor',
  'suno_v6',
  'Suno V6 (Flagship Studio)',
  'music',
  'per_song',
  0.10,
  410,
  TRUE,
  'pro',
  TRUE,
  2,
  '1080p',
  0,
  'per_song',
  FALSE,
  TRUE,
  NULL
)
ON CONFLICT (id) DO UPDATE SET
  provider                = EXCLUDED.provider,
  model_name              = EXCLUDED.model_name,
  display_name            = EXCLUDED.display_name,
  generation_type         = EXCLUDED.generation_type,
  unit                    = EXCLUDED.unit,
  provider_cost           = EXCLUDED.provider_cost,
  credit_cost             = EXCLUDED.credit_cost,
  active                  = EXCLUDED.active,
  quality_tier            = EXCLUDED.quality_tier,
  licensing_verified      = EXCLUDED.licensing_verified,
  max_concurrent_variants = EXCLUDED.max_concurrent_variants,
  max_upscale             = EXCLUDED.max_upscale,
  upscale_credit_cost     = EXCLUDED.upscale_credit_cost,
  pricing_kind            = EXCLUDED.pricing_kind,
  promo_eligible          = EXCLUDED.promo_eligible,
  is_premium              = EXCLUDED.is_premium,
  updated_at              = now();

-- 4. Seed `model_suppliers` routing for `mus_suno_v6` -> `sunor` only
INSERT INTO public.model_suppliers (model_id, supplier, upstream_model, priority, env, enabled, note)
VALUES (
  'mus_suno_v6',
  'sunor',
  'suno',
  1,
  'both',
  TRUE,
  'Suno V6 flagship music generation via Sunor ($0.10/task, 2 clips returned)'
)
ON CONFLICT (model_id, supplier) DO UPDATE SET
  upstream_model = EXCLUDED.upstream_model,
  priority       = EXCLUDED.priority,
  env            = EXCLUDED.env,
  enabled        = EXCLUDED.enabled,
  note           = EXCLUDED.note,
  updated_at     = now();
