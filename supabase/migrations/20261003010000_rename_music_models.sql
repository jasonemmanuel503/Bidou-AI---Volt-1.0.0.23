-- ============================================================================
-- Migration: 20261003010000_rename_music_models.sql
-- Purpose:
--   Renames the customer-facing display names and neutralizes the prompt style
--   guides for the two MusicAPI products:
--     1. `mus_lyria_3_pro` -> "Sonic v4.5 (Full Studio)", upstream_model = 'sonic-v4-5'
--     2. `mus_suno_sonic_v5` -> "Sonic v5 (Vocalist Master)", upstream_model = 'sonic-v5'
--   Internal IDs and model_name keys are strictly preserved for foreign key,
--   pricing engine, and historical job backwards compatibility.
--
-- Idempotent: safe to run multiple times.
-- ============================================================================

-- 1. Update ai_models display names and prompt style guides
UPDATE public.ai_models
SET
  display_name = 'Sonic v4.5 (Full Studio)',
  prompt_style_guide = 'Sonic v4.5 Full Studio. Describe instrumentation, tempo (BPM), rhythmic feel, arrangement sections, mix character and vocal treatment. Genre and tonality are supplied separately — do not repeat them verbatim in the prompt body.',
  updated_at = now()
WHERE id = 'mus_lyria_3_pro';

UPDATE public.ai_models
SET
  display_name = 'Sonic v5 (Vocalist Master)',
  prompt_style_guide = 'Sonic v5, vocalist-forward master. Emphasise vocal timbre, delivery style, ad-libs, harmony stacking and hook structure. Instrumentation is secondary to voice.',
  updated_at = now()
WHERE id = 'mus_suno_sonic_v5';

-- 2. Ensure model_suppliers rows route to the confirmed Sonic models
UPDATE public.model_suppliers
SET
  upstream_model = 'sonic-v4-5',
  updated_at = now()
WHERE model_id = 'mus_lyria_3_pro' AND supplier = 'musicapi';

UPDATE public.model_suppliers
SET
  upstream_model = 'sonic-v5',
  updated_at = now()
WHERE model_id = 'mus_suno_sonic_v5' AND supplier = 'musicapi';
