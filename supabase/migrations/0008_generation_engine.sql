-- Migration 0008: Generation Engine Schema & Extensions

-- 1.1 — ai_models table (replaces the hardcoded array)
create table if not exists ai_models (
  id                      text primary key,
  provider                text not null,
  model_name              text not null,
  display_name            text not null,
  generation_type         text not null check (generation_type in ('image','video','music','voice')),
  unit                    text not null check (unit in ('per_second','per_song','per_generation')),
  provider_cost           numeric not null,
  credit_cost             integer not null,
  active                  boolean not null default false,
  quality_tier            text not null check (quality_tier in ('lite','fast','standard','pro')),
  licensing_verified      boolean not null default false,
  max_concurrent_variants smallint not null default 1
                            check (max_concurrent_variants between 1 and 4),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

alter table ai_models enable row level security;
create policy "models public read" on ai_models for select using (true);
-- writes are service-role only (admin dashboard goes through the server)

-- Seed ai_models from INITIAL_AI_MODELS
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
  ('mus_lyria_3_pro', 'musicapi', 'lyria_3_pro', 'Google Lyria 3 Pro (Full Studio)', 'music', 'per_song', 0.11, 220, true, 'fast', true, 2),
  ('mus_suno_sonic_v5', 'musicapi', 'suno_sonic_v5', 'Suno / Sonic v5 (Vocalist Master)', 'music', 'per_song', 0.12, 240, true, 'pro', true, 2),
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

-- 1.2 — Extend generation_jobs to match the TypeScript type
alter table generation_jobs
  add column if not exists batch_count       smallint not null default 1
    check (batch_count between 1 and 4),
  add column if not exists aspect_ratio      text,
  add column if not exists resolution        text,
  add column if not exists duration_seconds  integer,
  add column if not exists provider          text,
  add column if not exists enhanced_prompt   text,
  add column if not exists negative_prompt   text,
  add column if not exists genre             text,
  add column if not exists tonality          text,
  add column if not exists lyrics            text,
  add column if not exists cover_art_url     text,
  add column if not exists credits_reserved  integer default 0,
  add column if not exists credits_consumed  integer default 0,
  add column if not exists credits_refunded  integer default 0,
  add column if not exists reservation_id    text,
  add column if not exists idempotency_key   text,
  add column if not exists error_message     text,
  add column if not exists started_at        timestamptz,
  add column if not exists completed_at      timestamptz;

create unique index if not exists generation_jobs_idempotency_idx
  on generation_jobs (user_id, idempotency_key)
  where idempotency_key is not null;

-- 1.3 — generation_job_variants (one row per rendered variant)

create table if not exists generation_job_variants (
  id              uuid primary key default gen_random_uuid(),
  job_id          uuid not null references generation_jobs(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  variant_index   smallint not null,
  status          text not null default 'queued'
                    check (status in ('queued','processing','completed','failed','cancelled')),
  output_url      text,
  thumbnail_url   text,
  provider_job_id text,          -- Veo operation name / MusicAPI task id
  error_message   text,
  credits_unit    integer not null default 0,
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (job_id, variant_index)
);

create index if not exists gjv_job_idx on generation_job_variants (job_id);

alter table generation_job_variants enable row level security;
create policy "own variants readable" on generation_job_variants
  for select using (auth.uid() = user_id);
create policy "own variants insertable" on generation_job_variants
  for insert with check (auth.uid() = user_id);
create policy "own variants updatable" on generation_job_variants
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 1.4 — Real credit tables + server-authoritative RPCs

create table if not exists credit_transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  type          text not null check (type in (
                  'purchase','generation_reservation','generation_consumed',
                  'generation_refund','admin_adjustment','bonus','promotion',
                  'subscription_credit','expiration')),
  amount        integer not null,
  balance_after integer not null,
  reference_id  text not null,
  description   text not null,
  created_at    timestamptz not null default now()
);
create index if not exists credit_tx_user_idx on credit_transactions (user_id, created_at desc);

alter table credit_transactions enable row level security;
create policy "own transactions readable" on credit_transactions
  for select using (auth.uid() = user_id);
-- no client insert policy: writes happen only inside the security-definer RPCs below

create table if not exists credit_reservations (
  id            text primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  job_id        uuid not null references generation_jobs(id) on delete cascade,
  amount        integer not null,
  settled       boolean not null default false,
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now()
);
alter table credit_reservations enable row level security;
create policy "own reservations readable" on credit_reservations
  for select using (auth.uid() = user_id);

-- RPC 1 — reserve (atomic, row-locked):
create or replace function reserve_credits(
  p_job_id uuid, p_amount integer, p_timeout_seconds integer default 900
) returns text as $$
declare
  v_user uuid := auth.uid();
  v_balance integer;
  v_res_id text := 'res_' || gen_random_uuid()::text;
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;

  select balance into v_balance from credit_wallets
    where user_id = v_user for update;        -- row lock prevents double-spend
  if v_balance is null then raise exception 'NO_WALLET'; end if;
  if v_balance < p_amount then
    raise exception 'INSUFFICIENT_CREDITS: required % available %', p_amount, v_balance;
  end if;

  update credit_wallets set balance = balance - p_amount, updated_at = now()
    where user_id = v_user;

  insert into credit_transactions (user_id, type, amount, balance_after, reference_id, description)
    values (v_user, 'generation_reservation', -p_amount, v_balance - p_amount,
            p_job_id::text, 'Hold for generation job');

  insert into credit_reservations (id, user_id, job_id, amount, expires_at)
    values (v_res_id, v_user, p_job_id, p_amount,
            now() + make_interval(secs => p_timeout_seconds));

  return v_res_id;
end;
$$ language plpgsql security definer;

-- RPC 2 — settle (partial consume + automatic refund of the remainder):
create or replace function settle_reservation(
  p_reservation_id text, p_consumed_amount integer, p_reason text default null
) returns void as $$
declare
  r credit_reservations%rowtype;
  v_refund integer;
  v_balance integer;
begin
  select * into r from credit_reservations where id = p_reservation_id for update;
  if not found or r.settled then return; end if;         -- idempotent
  if p_consumed_amount < 0 or p_consumed_amount > r.amount then
    raise exception 'INVALID_SETTLEMENT';
  end if;

  v_refund := r.amount - p_consumed_amount;

  insert into credit_transactions (user_id, type, amount, balance_after, reference_id, description)
    select r.user_id, 'generation_consumed', 0, w.balance, r.job_id::text,
           coalesce(p_reason, 'Generation settled: ' || p_consumed_amount || ' credits consumed')
    from credit_wallets w where w.user_id = r.user_id;

  if v_refund > 0 then
    update credit_wallets set balance = balance + v_refund, updated_at = now()
      where user_id = r.user_id returning balance into v_balance;
    insert into credit_transactions (user_id, type, amount, balance_after, reference_id, description)
      values (r.user_id, 'generation_refund', v_refund, v_balance, r.job_id::text,
              'Auto-refund for ' || v_refund || ' credits (failed or unrendered variants)');
  end if;

  update credit_reservations set settled = true where id = r.id;
  update generation_jobs
    set credits_consumed = p_consumed_amount, credits_refunded = v_refund
    where id = r.job_id;
end;
$$ language plpgsql security definer;

-- RPC 3 — sweep: settle every unsettled reservation past expires_at with p_consumed_amount = 0
create or replace function sweep_expired_reservations() returns void as $$
declare
  r record;
begin
  for r in
    select id from credit_reservations
    where settled = false and expires_at < now()
  loop
    perform settle_reservation(r.id, 0, 'Auto-settled: reservation expired');
  end loop;
end;
$$ language plpgsql security definer;

