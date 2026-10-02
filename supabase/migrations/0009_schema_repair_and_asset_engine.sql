-- ============================================================================
-- Migration 0009: Schema repair + asset engine
-- Repairs the generation_jobs contract and adds tables for the asset
-- lifecycle (retry, upscale, download, delete).
-- ============================================================================

-- 1. Repair generation_jobs so the server contract matches reality.
alter table generation_jobs
  add column if not exists output_urls   text[] not null default '{}',
  add column if not exists thumbnail_url text,
  add column if not exists deleted_at    timestamptz,
  add column if not exists retry_of_job_id uuid references generation_jobs(id) on delete set null,
  add column if not exists client_settings jsonb not null default '{}'::jsonb;

-- media_type is the canonical column. Expose `type` as a generated alias so
-- existing server code that reads `type` keeps working during the transition.
-- (The server must still WRITE media_type — see 1.2.2.)
create or replace view generation_jobs_v as
  select g.*, g.media_type::text as type
  from generation_jobs g
  where g.deleted_at is null;

-- Allow 'queued' and 'cancelled' in the status vocabulary.
alter table generation_jobs
  drop constraint if exists generation_jobs_status_check;
alter table generation_jobs
  add constraint generation_jobs_status_check
  check (status in ('queued','pending','processing','completed','failed','cancelled'));

create index if not exists generation_jobs_user_recent_idx
  on generation_jobs (user_id, media_type, created_at desc)
  where deleted_at is null;

-- 2. Upscale jobs — one row per requested upscale of a completed variant.
create table if not exists generation_upscales (
  id              uuid primary key default gen_random_uuid(),
  variant_id      uuid not null references generation_job_variants(id) on delete cascade,
  job_id          uuid not null references generation_jobs(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  target_scale    text not null check (target_scale in ('1080p','1k','2k','4k')),
  source_url      text not null,
  output_url      text,
  status          text not null default 'queued'
                    check (status in ('queued','processing','completed','failed')),
  credits_cost    integer not null default 0,
  reservation_id  text,
  error_message   text,
  provider        text,
  created_at      timestamptz not null default now(),
  completed_at    timestamptz
);
create index if not exists gu_variant_idx on generation_upscales (variant_id);
create unique index if not exists gu_variant_scale_idx
  on generation_upscales (variant_id, target_scale)
  where status in ('queued','processing','completed');

alter table generation_upscales enable row level security;
create policy "own upscales readable"  on generation_upscales
  for select using (auth.uid() = user_id);
create policy "own upscales insertable" on generation_upscales
  for insert with check (auth.uid() = user_id);

-- 3. Download audit trail (needed for abuse limits and analytics).
create table if not exists generation_downloads (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  variant_id   uuid references generation_job_variants(id) on delete set null,
  upscale_id   uuid references generation_upscales(id) on delete set null,
  resolution   text not null,
  downloaded_at timestamptz not null default now()
);
create index if not exists gd_user_idx on generation_downloads (user_id, downloaded_at desc);
alter table generation_downloads enable row level security;
create policy "own downloads readable"  on generation_downloads
  for select using (auth.uid() = user_id);
create policy "own downloads insertable" on generation_downloads
  for insert with check (auth.uid() = user_id);

-- 4. Soft delete for variants (so the recent-gens strip can remove a tile
--    without destroying the credit audit trail).
alter table generation_job_variants
  add column if not exists deleted_at timestamptz,
  add column if not exists upscaled_urls jsonb not null default '{}'::jsonb;

-- 5. Per-model upscale capability + prompt-engineering guidance.
alter table ai_models
  add column if not exists max_upscale        text default '1080p'
    check (max_upscale in ('1080p','1k','2k','4k')),
  add column if not exists upscale_credit_cost integer not null default 0,
  add column if not exists prompt_style_guide  text;

update ai_models set max_upscale = '1k',  upscale_credit_cost = 35,
  prompt_style_guide = 'Fast 1K image model. Favour one clear subject, explicit lighting, explicit lens/camera framing, and a short comma-separated descriptor chain. Avoid multi-scene narratives, avoid embedded text, avoid more than two named subjects.'
  where id = 'img_nano_banana_2_lite';
update ai_models set max_upscale = '2k',  upscale_credit_cost = 70,
  prompt_style_guide = 'High-quality 1K image model. Handles material detail, texture and complex lighting well. Use photographic vocabulary (focal length, aperture, film stock, time of day). Keep composition to a single coherent frame.'
  where id = 'img_nano_banana_2';
update ai_models set max_upscale = '4k',  upscale_credit_cost = 140,
  prompt_style_guide = 'Cinematic 2K flagship. Rewards dense art-direction: colour grade, production design, atmosphere, depth cues, secondary light sources. Can hold two or three subjects and legible signage. Write like a cinematographer''s shot note.'
  where id = 'img_nano_banana_pro';
update ai_models set max_upscale = '1080p', upscale_credit_cost = 220,
  prompt_style_guide = 'Veo 3.1 Lite, 720p, 5-8s. Describe ONE continuous camera move and ONE action beat. State camera motion explicitly (slow dolly in, handheld pan left, static locked-off). Do not request cuts, scene changes, or on-screen text.'
  where id = 'vid_veo_3_1_lite';
update ai_models set max_upscale = '1080p', upscale_credit_cost = 260,
  prompt_style_guide = 'Veo 3.1 Fast, smooth 720p. Same single-shot discipline as Lite, but motion fidelity is higher — specify subject velocity and camera velocity separately. Ambient audio cues are honoured; name them.'
  where id = 'vid_veo_3_1_fast';
update ai_models set max_upscale = '4k',   upscale_credit_cost = 480,
  prompt_style_guide = 'Veo 3.1 Cinematic. Full shot-list vocabulary: lens, camera movement, blocking, lighting setup, grade, diegetic audio. Still ONE continuous take. Highest adherence to art-direction language of any video model in the catalogue.'
  where id = 'vid_veo_3_1_standard';
update ai_models set max_upscale = '1080p', upscale_credit_cost = 0,
  prompt_style_guide = 'Lyria 3 Pro. Describe instrumentation, tempo (BPM), rhythmic feel, arrangement sections, mix character and vocal treatment. Genre and tonality are supplied separately — do not repeat them verbatim in the prompt body.'
  where id = 'mus_lyria_3_pro';
update ai_models set max_upscale = '1080p', upscale_credit_cost = 0,
  prompt_style_guide = 'Suno / Sonic v5, vocalist-forward. Emphasise vocal timbre, delivery style, ad-libs, harmony stacking and hook structure. Instrumentation is secondary to voice.'
  where id = 'mus_suno_sonic_v5';
