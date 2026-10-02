-- ============================================================================
-- Bidou AI (Volt) — Migration 20261002000000: Multi-Supplier Routing,
-- Two-Bucket Promo Wallet, Security Lockdown & Cost Ledger
--
-- Plain-language summary:
--   A. Locks down money-moving SECURITY DEFINER RPCs (refund_credits,
--      debit_credits, grant_purchase, ensure_wallet, reserve_credits,
--      reserve_credits_for, settle_reservation, sweep_expired_reservations)
--      so browser clients (anon / authenticated) can never invoke them directly.
--   B. Splits credit_wallets into paid `balance` + signup `promo_balance`
--      (500 welcome credits in promo_balance, spendable only on promo_eligible
--      image models; promo bucket is consumed first, refunded to the bucket it
--      came from).
--   C. Extends ai_models and generation_job_variants with multi-supplier and
--      pricing metadata.
--   D. Adds model_suppliers, supplier_status, plan_limits, provider_cost_ledger,
--      v_profit_daily, and supplier_spend_today_usd().
--   E. Upserts locked credit pack prices (2,000 / 5,400 / 16,000 / 42,000 FCFA),
--      updates award_tier_badge() thresholds (promote-only), seeds the 4 new
--      models (inactive until licence verification), and updates credit_cost
--      for all models from `npm run pricing:audit`.
--   F. Adds credit_wallets, generation_jobs, and generation_job_variants to
--      supabase_realtime publication idempotently.
--
-- Safe to run twice (fully idempotent).
-- ============================================================================


-- ============================================================================
-- A. SECURITY FIX — Revoke money-moving SECURITY DEFINER RPCs from browser roles
-- ============================================================================
-- Do NOT revoke verify_admin_pin or admin_set_platform_stat (called by browser).

revoke execute on function public.refund_credits(uuid, integer, text, text)  from public, anon, authenticated;
revoke execute on function public.debit_credits(uuid, integer, text, text)   from public, anon, authenticated;
revoke execute on function public.grant_purchase(text, text)                 from public, anon, authenticated;
revoke execute on function public.ensure_wallet(uuid)                        from public, anon, authenticated;
revoke execute on function public.reserve_credits(uuid, integer, integer)    from public, anon, authenticated;
revoke execute on function public.sweep_expired_reservations()               from public, anon, authenticated;

grant execute on function
  public.refund_credits(uuid, integer, text, text),
  public.debit_credits(uuid, integer, text, text),
  public.grant_purchase(text, text),
  public.ensure_wallet(uuid),
  public.reserve_credits(uuid, integer, integer),
  public.sweep_expired_reservations()
to service_role;


-- ============================================================================
-- B. WALLET WITH TWO BUCKETS (paid `balance` + image-only `promo_balance`)
-- ============================================================================

alter table public.credit_wallets
  add column if not exists promo_balance integer not null default 0 check (promo_balance >= 0);

alter table public.credit_reservations
  add column if not exists promo_amount integer not null default 0 check (promo_amount >= 0);

-- Confirm "read own wallet" SELECT policy exists on credit_wallets
alter table public.credit_wallets enable row level security;
drop policy if exists "read own wallet" on public.credit_wallets;
create policy "read own wallet" on public.credit_wallets
  for select using (auth.uid() = user_id);

-- B.1 — handle_new_user(): new signups get 0 paid balance + 500 promo_balance
--       plus a welcome bonus ledger entry.
create or replace function public.handle_new_user() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted_user uuid;
begin
  insert into public.profiles (id, email, name, affiliate_code)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name', ''),
    public.generate_affiliate_code()
  )
  on conflict (id) do nothing;

  insert into public.credit_wallets (user_id, balance, promo_balance)
  values (new.id, 0, 500)
  on conflict (user_id) do nothing
  returning user_id into v_inserted_user;

  if v_inserted_user is not null then
    insert into public.credit_transactions (user_id, type, amount, balance_after, reference_id, description)
    values (new.id, 'bonus', 500, 500, 'welcome_' || new.id::text, 'Welcome credits (image models only)');
  end if;

  return new;
end; $$;

-- B.2 — ensure_wallet(uuid): idempotent wallet bootstrap with promo_balance = 500
create or replace function public.ensure_wallet(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet public.credit_wallets%rowtype;
  v_inserted_user uuid;
begin
  select * into v_wallet from public.credit_wallets where user_id = p_user;
  if not found then
    insert into public.credit_wallets (user_id, balance, promo_balance, updated_at)
      values (p_user, 0, 500, now())
      on conflict (user_id) do nothing
      returning user_id into v_inserted_user;

    select * into v_wallet from public.credit_wallets where user_id = p_user;

    if v_inserted_user is not null and not exists (
      select 1 from public.credit_transactions
      where user_id = p_user and reference_id = 'welcome_' || p_user::text
    ) then
      insert into public.credit_transactions (user_id, type, amount, balance_after, reference_id, description)
        values (p_user, 'bonus', 500, 500, 'welcome_' || p_user::text, 'Welcome credits (image models only)');
    end if;
  end if;
  return jsonb_build_object(
    'balance', v_wallet.balance,
    'promo_balance', v_wallet.promo_balance,
    'updated_at', v_wallet.updated_at
  );
end;
$$;

revoke execute on function public.ensure_wallet(uuid) from public, anon, authenticated;
grant  execute on function public.ensure_wallet(uuid) to service_role;

-- B.3 — reserve_credits_for: drop old 4-arg overload and create 5-arg version
drop function if exists public.reserve_credits_for(uuid, uuid, integer, integer);

create or replace function public.reserve_credits_for(
  p_user uuid,
  p_job_id uuid,
  p_amount integer,
  p_timeout_seconds integer default 900,
  p_promo_eligible boolean default false
) returns text as $$
declare
  v_paid integer;
  v_promo integer;
  v_use_promo integer := 0;
  v_use_paid integer;
  v_res_id text := 'res_' || gen_random_uuid()::text;
begin
  if p_user is null then raise exception 'INVALID_USER'; end if;
  if p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  select balance, promo_balance into v_paid, v_promo from public.credit_wallets where user_id = p_user for update;
  if v_paid is null then raise exception 'NO_WALLET'; end if;
  if p_promo_eligible then v_use_promo := least(v_promo, p_amount); end if;
  v_use_paid := p_amount - v_use_promo;
  if v_paid < v_use_paid then
    raise exception 'INSUFFICIENT_CREDITS: required % available %', p_amount,
      v_paid + case when p_promo_eligible then v_promo else 0 end;
  end if;
  update public.credit_wallets
     set balance = balance - v_use_paid,
         promo_balance = promo_balance - v_use_promo,
         updated_at = now()
   where user_id = p_user;
  insert into public.credit_transactions (user_id, type, amount, balance_after, reference_id, description)
   values (p_user, 'generation_reservation', -p_amount, (v_paid - v_use_paid) + (v_promo - v_use_promo), p_job_id::text, 'Hold for generation job');
  insert into public.credit_reservations (id, user_id, job_id, amount, promo_amount, expires_at)
   values (v_res_id, p_user, p_job_id, p_amount, v_use_promo, now() + make_interval(secs => p_timeout_seconds));
  return v_res_id;
end; $$ language plpgsql security definer set search_path = public;

revoke execute on function public.reserve_credits_for(uuid, uuid, integer, integer, boolean) from public, anon, authenticated;
grant  execute on function public.reserve_credits_for(uuid, uuid, integer, integer, boolean) to service_role;

-- B.4 — settle_reservation: consume promo part first; refund each bucket to where it came from
create or replace function public.settle_reservation(
  p_reservation_id text,
  p_consumed_amount integer,
  p_reason text default null
) returns void as $$
declare
  r public.credit_reservations%rowtype;
  v_consumed_promo integer;
  v_refund_promo integer;
  v_refund_paid integer;
  v_refund_total integer;
  v_paid integer;
  v_promo integer;
begin
  select * into r from public.credit_reservations where id = p_reservation_id for update;
  if not found or r.settled then return; end if; -- idempotent
  if p_consumed_amount < 0 or p_consumed_amount > r.amount then
    raise exception 'INVALID_SETTLEMENT';
  end if;

  v_consumed_promo := least(p_consumed_amount, r.promo_amount);
  v_refund_promo   := r.promo_amount - v_consumed_promo;
  v_refund_paid    := (r.amount - r.promo_amount) - (p_consumed_amount - v_consumed_promo);
  v_refund_total   := v_refund_paid + v_refund_promo;

  -- Lock wallet row
  select balance, promo_balance into v_paid, v_promo
  from public.credit_wallets
  where user_id = r.user_id
  for update;

  -- Consumed ledger entry (amount 0, balance_after = current balance + promo_balance)
  insert into public.credit_transactions (user_id, type, amount, balance_after, reference_id, description)
  values (
    r.user_id,
    'generation_consumed',
    0,
    coalesce(v_paid, 0) + coalesce(v_promo, 0),
    r.job_id::text,
    coalesce(p_reason, 'Generation settled: ' || p_consumed_amount || ' credits consumed')
  );

  if v_refund_total > 0 then
    update public.credit_wallets
       set balance = balance + v_refund_paid,
           promo_balance = promo_balance + v_refund_promo,
           updated_at = now()
     where user_id = r.user_id
     returning balance, promo_balance into v_paid, v_promo;

    insert into public.credit_transactions (user_id, type, amount, balance_after, reference_id, description)
    values (
      r.user_id,
      'generation_refund',
      v_refund_total,
      coalesce(v_paid, 0) + coalesce(v_promo, 0),
      r.job_id::text,
      'Auto-refund for ' || v_refund_total || ' credits (failed or unrendered variants)'
    );
  end if;

  update public.credit_reservations set settled = true where id = r.id;
  update public.generation_jobs
     set credits_consumed = p_consumed_amount,
         credits_refunded = v_refund_total
   where id = r.job_id;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function public.settle_reservation(text, integer, text) from public, anon, authenticated;
grant  execute on function public.settle_reservation(text, integer, text) to service_role;

-- B.5 — debit_credits and refund_credits: operate on PAID bucket only,
--       write balance_after = balance + promo_balance
create or replace function public.debit_credits(
  p_user uuid,
  p_amount integer,
  p_reference_id text,
  p_description text default 'Credit deduction'
) returns integer as $$
declare
  v_paid integer;
  v_promo integer;
begin
  if p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  select balance, promo_balance into v_paid, v_promo
  from public.credit_wallets
  where user_id = p_user
  for update;

  if v_paid is null then raise exception 'NO_WALLET'; end if;
  if v_paid < p_amount then
    raise exception 'INSUFFICIENT_CREDITS: required % available %', p_amount, v_paid;
  end if;

  update public.credit_wallets
     set balance = balance - p_amount,
         updated_at = now()
   where user_id = p_user
   returning balance, promo_balance into v_paid, v_promo;

  insert into public.credit_transactions (user_id, type, amount, balance_after, reference_id, description)
    values (p_user, 'admin_adjustment', -p_amount, v_paid + v_promo, p_reference_id, p_description);

  return v_paid;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function public.debit_credits(uuid, integer, text, text) from public, anon, authenticated;
grant  execute on function public.debit_credits(uuid, integer, text, text) to service_role;

create or replace function public.refund_credits(
  p_user uuid,
  p_amount integer,
  p_reference_id text,
  p_description text default 'Credit refund'
) returns integer as $$
declare
  v_paid integer;
  v_promo integer;
begin
  if p_amount <= 0 then return 0; end if;
  perform public.ensure_wallet(p_user);

  update public.credit_wallets
     set balance = balance + p_amount,
         updated_at = now()
   where user_id = p_user
   returning balance, promo_balance into v_paid, v_promo;

  insert into public.credit_transactions (user_id, type, amount, balance_after, reference_id, description)
    values (p_user, 'generation_refund', p_amount, v_paid + v_promo, p_reference_id, p_description);

  return v_paid;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function public.refund_credits(uuid, integer, text, text) from public, anon, authenticated;
grant  execute on function public.refund_credits(uuid, integer, text, text) to service_role;


-- ============================================================================
-- C. NEW COLUMNS ON EXISTING TABLES
-- ============================================================================

alter table public.ai_models
  add column if not exists pricing_kind text check (pricing_kind in ('per_image','per_clip','per_second','per_song')),
  add column if not exists promo_eligible boolean not null default false,
  add column if not exists is_premium boolean not null default false,
  add column if not exists video_options jsonb,
  add column if not exists licence_note text,
  add column if not exists licence_verified_at timestamptz,
  add column if not exists licence_verified_by text;

alter table public.generation_job_variants
  add column if not exists supplier text,
  add column if not exists upstream_model text,
  add column if not exists simulated boolean not null default false;

alter table public.generation_jobs
  add column if not exists model_id text;


-- ============================================================================
-- D. NEW TABLES, VIEW & SPEND FUNCTION (RLS enabled, service-role access)
-- ============================================================================

-- D.1 — model_suppliers
create table if not exists public.model_suppliers (
  id             uuid primary key default gen_random_uuid(),
  model_id       text not null references public.ai_models(id) on delete cascade,
  supplier       text not null check (supplier in ('google','kie','alibaba','cloudflare','musicapi')),
  upstream_model text not null,
  priority       smallint not null default 1,
  env            text not null default 'both' check (env in ('dev','prod','both')),
  enabled        boolean not null default true,
  note           text,
  updated_at     timestamptz not null default now(),
  unique (model_id, supplier)
);

alter table public.model_suppliers enable row level security;

-- D.2 — supplier_status
create table if not exists public.supplier_status (
  supplier              text primary key check (supplier in ('google','kie','alibaba','cloudflare','musicapi')),
  enabled               boolean not null default true,
  tripped_until         timestamptz,
  trip_reason           text,
  daily_spend_limit_usd numeric,
  updated_at            timestamptz not null default now()
);

alter table public.supplier_status enable row level security;

-- D.3 — plan_limits
create table if not exists public.plan_limits (
  plan_tier           public.plan_tier primary key,
  max_video_seconds   integer not null,
  premium_monthly_cap integer not null,
  updated_at          timestamptz not null default now()
);

alter table public.plan_limits enable row level security;

-- D.4 — provider_cost_ledger
create table if not exists public.provider_cost_ledger (
  id                uuid primary key default gen_random_uuid(),
  job_id            uuid references public.generation_jobs(id) on delete set null,
  variant_index     smallint,
  user_id           uuid,
  model_id          text not null,
  supplier          text not null,
  upstream_model    text,
  env               text not null check (env in ('dev','prod')),
  units             numeric not null default 1,
  unit_label        text,
  est_cost_usd      numeric not null default 0,
  actual_cost_usd   numeric,
  fx_xaf_per_usd    numeric not null,
  credits_charged   integer not null default 0,
  revenue_floor_xaf numeric generated always as (credits_charged * 0.79 * 0.975) stored,
  status            text not null default 'dispatched' check (status in ('dispatched','succeeded','failed')),
  error_code        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (job_id, variant_index, supplier)
);

create index if not exists pcl_created_at_idx          on public.provider_cost_ledger (created_at);
create index if not exists pcl_supplier_created_at_idx on public.provider_cost_ledger (supplier, created_at);
create index if not exists pcl_model_created_at_idx    on public.provider_cost_ledger (model_id, created_at);

alter table public.provider_cost_ledger enable row level security;

-- D.5 — View v_profit_daily
-- Per day (UTC) x model_id x supplier x env:
--   successful count, total cost XAF, revenue floor XAF, margin %.
--   Failed rows count cost only if actual_cost_usd > 0.
create or replace view public.v_profit_daily as
select
  (created_at at time zone 'UTC')::date as day_utc,
  model_id,
  supplier,
  env,
  count(*) filter (where status = 'succeeded') as succeeded_count,
  count(*) filter (where status = 'failed') as failed_count,
  round(sum(
    case
      when status = 'succeeded' then coalesce(actual_cost_usd, est_cost_usd) * fx_xaf_per_usd
      when status = 'failed' and coalesce(actual_cost_usd, 0) > 0 then actual_cost_usd * fx_xaf_per_usd
      else 0
    end
  ), 2) as total_cost_xaf,
  round(sum(
    case when status = 'succeeded' then revenue_floor_xaf else 0 end
  ), 2) as revenue_floor_xaf,
  case
    when sum(case when status = 'succeeded' then revenue_floor_xaf else 0 end) > 0 then
      round(
        (
          (
            sum(case when status = 'succeeded' then revenue_floor_xaf else 0 end)
            - sum(
                case
                  when status = 'succeeded' then coalesce(actual_cost_usd, est_cost_usd) * fx_xaf_per_usd
                  when status = 'failed' and coalesce(actual_cost_usd, 0) > 0 then actual_cost_usd * fx_xaf_per_usd
                  else 0
                end
              )
          )
          / sum(case when status = 'succeeded' then revenue_floor_xaf else 0 end)
        ) * 100.0,
        2
      )
    else null
  end as margin_pct
from public.provider_cost_ledger
group by (created_at at time zone 'UTC')::date, model_id, supplier, env;

-- D.6 — Function supplier_spend_today_usd(p_supplier text, p_env text)
create or replace function public.supplier_spend_today_usd(
  p_supplier text,
  p_env text
) returns numeric
language sql
security definer
set search_path = public
as $$
  select coalesce(sum(coalesce(actual_cost_usd, est_cost_usd)), 0)::numeric
  from public.provider_cost_ledger
  where supplier = p_supplier
    and env = p_env
    and status in ('dispatched', 'succeeded')
    and (created_at at time zone 'UTC')::date = (now() at time zone 'UTC')::date;
$$;

revoke execute on function public.supplier_spend_today_usd(text, text) from public, anon, authenticated;
grant  execute on function public.supplier_spend_today_usd(text, text) to service_role;


-- ============================================================================
-- E. DATA UPDATES & SEEDING
-- ============================================================================

-- E.1 — credit_packages upsert (locked new prices & no-bonus feature text)
insert into public.credit_packages (
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
  (
    'pkg_starter',
    null,
    'starter',
    'Starter',
    2000,
    1500,
    false,
    null,
    '["1,500 Universal Credits", "High-resolution downloads", "Full access to Image, Video & Music studios", "Local Mobile Money instant checkout"]'::jsonb,
    true
  ),
  (
    'pkg_creator',
    null,
    'creator',
    'Creator',
    5400,
    5500,
    true,
    null,
    '["5,500 Universal Credits", "Priority GPU cluster queue", "Cinematic 2K upscales & HD video", "Commercial creator rights"]'::jsonb,
    true
  ),
  (
    'pkg_pro',
    null,
    'pro',
    'Pro',
    16000,
    18000,
    false,
    null,
    '["18,000 Universal Credits", "Up to 30s HD/1080p video synthesis", "Full studio tracks & lyrics AI", "Direct WhatsApp & social media exports"]'::jsonb,
    true
  ),
  (
    'pkg_studio',
    null,
    'studio',
    'Studio',
    42000,
    53000,
    false,
    null,
    '["53,000 Universal Credits", "Highest GPU cluster priority", "Multi-project team collaboration", "Dedicated account manager support"]'::jsonb,
    true
  )
on conflict (id) do update set
  tier       = excluded.tier,
  name       = excluded.name,
  price_fcfa = excluded.price_fcfa,
  credits    = excluded.credits,
  popular    = excluded.popular,
  features   = excluded.features,
  active     = excluded.active;

-- E.2 — award_tier_badge() with locked lifetime spend thresholds
--       (Studio >= 42,000 · Pro >= 16,000 · Creator >= 5,400 · Starter >= 2,000)
--       Promote-only: never demotes any existing user.
create or replace function public.award_tier_badge() returns trigger as $$
declare
  v_new_spend bigint;
  v_computed_tier public.plan_tier;
  v_current_tier public.plan_tier;
  v_current_rank smallint;
  v_computed_rank smallint;
begin
  -- Update lifetime spend on profile and fetch current values
  update public.profiles
  set lifetime_spend_fcfa = coalesce(lifetime_spend_fcfa, 0) + new.amount_fcfa
  where id = new.user_id
  returning lifetime_spend_fcfa, plan_tier into v_new_spend, v_current_tier;

  -- Recompute plan_tier from the new total via thresholds:
  -- Studio (>= 42,000), Pro (>= 16,000), Creator (>= 5,400), Starter (>= 2,000), Free (>= 0)
  if v_new_spend >= 42000 then
    v_computed_tier := 'studio';
  elsif v_new_spend >= 16000 then
    v_computed_tier := 'pro';
  elsif v_new_spend >= 5400 then
    v_computed_tier := 'creator';
  elsif v_new_spend >= 2000 then
    v_computed_tier := 'starter';
  else
    v_computed_tier := 'free';
  end if;

  select rank into v_current_rank from public.plan_tiers where tier = coalesce(v_current_tier, 'free');
  select rank into v_computed_rank from public.plan_tiers where tier = v_computed_tier;

  -- Apply ONLY if the new rank is higher (never demote)
  if coalesce(v_computed_rank, 0) > coalesce(v_current_rank, 0) then
    update public.profiles
    set plan_tier = v_computed_tier
    where id = new.user_id;

    -- Keep historical record in user_tier_badges
    insert into public.user_tier_badges (user_id, tier)
    values (new.user_id, v_computed_tier)
    on conflict (user_id, tier)
      do update set times_purchased = public.user_tier_badges.times_purchased + 1;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- E.3 & E.4 — Insert the 4 new models (active=false, licensing_verified=false)
--             and update credit_cost, pricing_kind, promo_eligible, is_premium,
--             video_options for all models using exact output from `npm run pricing:audit`:
--
-- Audit values (`npm run pricing:audit`):
--   img_cf_flux1_schnell    : 1024px image -> 10 credits  (promo_eligible=true,  is_premium=false, active=false, licensing_verified=false)
--   img_cf_flux2_klein_4b   : 1024px image -> 10 credits  (promo_eligible=true,  is_premium=false, active=false, licensing_verified=false)
--   img_nano_banana_2_lite  : 1K image     -> 100 credits (promo_eligible=true,  is_premium=false, active=true,  licensing_verified=true)
--   img_nano_banana_2       : 1K image     -> 190 credits (promo_eligible=false, is_premium=false, active=true,  licensing_verified=true)
--   img_nano_banana_pro     : 2K image     -> 370 credits (promo_eligible=false, is_premium=true,  active=true,  licensing_verified=true)
--   vid_veo_3_1_lite        : 720p · 8s    -> 620 credits (promo_eligible=false, is_premium=false, active=true,  licensing_verified=true)
--   vid_veo_3_1_fast        : 720p · 8s    -> 1230 credits(promo_eligible=false, is_premium=false, active=true,  licensing_verified=true)
--   vid_veo_3_1_standard    : 720p · 8s    -> 4900 credits(promo_eligible=false, is_premium=true,  active=true,  licensing_verified=true)
--   vid_wan_3_0_standard    : 720p · 5s    -> 770 credits (promo_eligible=false, is_premium=false, active=false, licensing_verified=false)
--   vid_wan_3_0_prime       : 720p · 5s    -> 1080 credits(promo_eligible=false, is_premium=true,  active=false, licensing_verified=false)
--   mus_lyria_3_pro         : 2-take song  -> 300 credits (promo_eligible=false, is_premium=false, active=true,  licensing_verified=true)
--   mus_suno_sonic_v5       : 2-take song  -> 330 credits (promo_eligible=false, is_premium=false, active=true,  licensing_verified=true)
--   vid_kuaishou_kling      : 720p · 8s    -> 860 credits (promo_eligible=false, is_premium=false, active=false, licensing_verified=false)
--   vid_bytedance_seedance  : 720p · 8s    -> 740 credits (promo_eligible=false, is_premium=false, active=false, licensing_verified=false)
--   voi_elevenlabs_tales    : per_gen      -> 120 credits (promo_eligible=false, is_premium=false, active=false, licensing_verified=false)

insert into public.ai_models (
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
) values
  (
    'img_cf_flux1_schnell',
    'cloudflare',
    'cf_flux1_schnell',
    'FLUX.1 Schnell (Draft 1K)',
    'image',
    'per_generation',
    0.000633,
    10,
    false,
    'lite',
    false,
    4,
    '1k',
    20,
    'per_image',
    true,
    false,
    null
  ),
  (
    'img_cf_flux2_klein_4b',
    'cloudflare',
    'cf_flux2_klein_4b',
    'FLUX.2 Klein 4B (Fast 1K)',
    'image',
    'per_generation',
    0.00115,
    10,
    false,
    'fast',
    false,
    4,
    '1k',
    20,
    'per_image',
    true,
    false,
    null
  ),
  (
    'vid_wan_3_0_standard',
    'alibaba',
    'wan_3_0_standard',
    'Wan 3.0 Standard (2–30s Multi-Res)',
    'video',
    'per_second',
    0.10,
    770,
    false,
    'standard',
    false,
    2,
    '1080p',
    260,
    'per_second',
    false,
    false,
    '{"resolutions":["480p","720p","1080p"],"durations":{"min":2,"max":30,"step":1},"maxDurationByTier":{"free":8,"starter":8,"creator":15,"pro":30,"studio":30}}'::jsonb
  ),
  (
    'vid_wan_3_0_prime',
    'alibaba',
    'wan_3_0_prime',
    'Wan 3.0 Prime (Fast 2–30s)',
    'video',
    'per_second',
    0.14,
    1080,
    false,
    'pro',
    false,
    2,
    '1080p',
    320,
    'per_second',
    false,
    true,
    '{"resolutions":["480p","720p","1080p"],"durations":{"min":2,"max":30,"step":1},"maxDurationByTier":{"free":8,"starter":8,"creator":15,"pro":30,"studio":30}}'::jsonb
  )
on conflict (id) do update set
  provider                = excluded.provider,
  model_name              = excluded.model_name,
  display_name            = excluded.display_name,
  generation_type         = excluded.generation_type,
  unit                    = excluded.unit,
  provider_cost           = excluded.provider_cost,
  credit_cost             = excluded.credit_cost,
  quality_tier            = excluded.quality_tier,
  max_concurrent_variants = excluded.max_concurrent_variants,
  max_upscale             = excluded.max_upscale,
  upscale_credit_cost     = excluded.upscale_credit_cost,
  pricing_kind            = excluded.pricing_kind,
  promo_eligible          = excluded.promo_eligible,
  is_premium              = excluded.is_premium,
  video_options           = excluded.video_options,
  updated_at              = now();

-- Update existing models with new credit_cost, pricing_kind, promo_eligible, is_premium, video_options
update public.ai_models set
  credit_cost    = 100,
  pricing_kind   = 'per_image',
  promo_eligible = true,
  is_premium     = false,
  video_options  = null,
  updated_at     = now()
where id = 'img_nano_banana_2_lite';

update public.ai_models set
  credit_cost    = 190,
  pricing_kind   = 'per_image',
  promo_eligible = false,
  is_premium     = false,
  video_options  = null,
  updated_at     = now()
where id = 'img_nano_banana_2';

update public.ai_models set
  credit_cost    = 370,
  pricing_kind   = 'per_image',
  promo_eligible = false,
  is_premium     = true,
  video_options  = null,
  updated_at     = now()
where id = 'img_nano_banana_pro';

update public.ai_models set
  credit_cost    = 620,
  pricing_kind   = 'per_clip',
  promo_eligible = false,
  is_premium     = false,
  video_options  = '{"resolutions":["720p","1080p"],"durations":[4,6,8],"maxDurationByTier":{"free":8,"starter":8,"creator":8,"pro":8,"studio":8}}'::jsonb,
  updated_at     = now()
where id = 'vid_veo_3_1_lite';

update public.ai_models set
  credit_cost    = 1230,
  pricing_kind   = 'per_clip',
  promo_eligible = false,
  is_premium     = false,
  video_options  = '{"resolutions":["720p","1080p"],"durations":[4,6,8],"maxDurationByTier":{"free":8,"starter":8,"creator":8,"pro":8,"studio":8}}'::jsonb,
  updated_at     = now()
where id = 'vid_veo_3_1_fast';

update public.ai_models set
  credit_cost    = 4900,
  pricing_kind   = 'per_clip',
  promo_eligible = false,
  is_premium     = true,
  video_options  = '{"resolutions":["720p","1080p"],"durations":[4,6,8],"maxDurationByTier":{"free":8,"starter":8,"creator":8,"pro":8,"studio":8}}'::jsonb,
  updated_at     = now()
where id = 'vid_veo_3_1_standard';

update public.ai_models set
  credit_cost    = 300,
  pricing_kind   = 'per_song',
  promo_eligible = false,
  is_premium     = false,
  video_options  = null,
  updated_at     = now()
where id = 'mus_lyria_3_pro';

update public.ai_models set
  credit_cost    = 330,
  pricing_kind   = 'per_song',
  promo_eligible = false,
  is_premium     = false,
  video_options  = null,
  updated_at     = now()
where id = 'mus_suno_sonic_v5';

update public.ai_models set
  credit_cost    = 860,
  pricing_kind   = 'per_second',
  promo_eligible = false,
  is_premium     = false,
  updated_at     = now()
where id = 'vid_kuaishou_kling';

update public.ai_models set
  credit_cost    = 740,
  pricing_kind   = 'per_second',
  promo_eligible = false,
  is_premium     = false,
  updated_at     = now()
where id = 'vid_bytedance_seedance';

update public.ai_models set
  credit_cost    = 120,
  pricing_kind   = 'per_image',
  promo_eligible = false,
  is_premium     = false,
  updated_at     = now()
where id = 'voi_elevenlabs_tales';

-- E.5 — model_suppliers rows matching Phase 1 catalog (`suppliers` arrays)
insert into public.model_suppliers (model_id, supplier, upstream_model, priority, env, enabled, note)
values
  ('img_cf_flux1_schnell',   'cloudflare', '@cf/black-forest-labs/flux-1-schnell', 1, 'both', true, 'Cloudflare Workers AI FLUX.1 schnell (4 steps)'),
  ('img_cf_flux2_klein_4b',  'cloudflare', '@cf/black-forest-labs/flux-2-klein-4b', 1, 'both', true, 'Cloudflare Workers AI FLUX.2 klein 4B'),
  ('img_nano_banana_2_lite', 'google',     'gemini-3.1-flash-image-preview', 1, 'both', true, 'Google Gemini Flash Image 1K'),
  ('img_nano_banana_2',      'google',     'gemini-3-pro-image-preview', 1, 'both', true, 'Google Gemini Pro Image 1K'),
  ('img_nano_banana_pro',    'google',     'gemini-3-pro-image-preview', 1, 'both', true, 'Google Gemini Pro Image 2K'),
  ('vid_veo_3_1_lite',       'kie',        'veo3_lite', 1, 'both', true, 'Kie.ai primary route for Veo 3.1 Lite'),
  ('vid_veo_3_1_lite',       'google',     'veo-3.1-lite-generate-preview', 2, 'both', true, 'Google direct backup for Veo 3.1 Lite'),
  ('vid_veo_3_1_fast',       'kie',        'veo3_fast', 1, 'both', true, 'Kie.ai primary route for Veo 3.1 Fast'),
  ('vid_veo_3_1_fast',       'google',     'veo-3.1-fast-generate-preview', 2, 'both', true, 'Google direct backup for Veo 3.1 Fast'),
  ('vid_veo_3_1_standard',   'kie',        'veo3', 1, 'both', true, 'Kie.ai primary route for Veo 3.1 Quality'),
  ('vid_veo_3_1_standard',   'google',     'veo-3.1-generate-preview', 2, 'both', true, 'Google direct backup for Veo 3.1 Quality'),
  ('vid_wan_3_0_standard',   'alibaba',    'wan3.0-t2v', 1, 'both', true, 'Alibaba DashScope Wan 3.0 Standard'),
  ('vid_wan_3_0_prime',      'alibaba',    'wan3.0-t2v-prime', 1, 'both', true, 'Alibaba DashScope Wan 3.0 Prime'),
  ('mus_lyria_3_pro',        'musicapi',   'sonic-v4-5', 1, 'both', true, 'MusicAPI sonic-v4-5'),
  ('mus_suno_sonic_v5',      'musicapi',   'sonic-v5', 1, 'both', true, 'MusicAPI sonic-v5')
on conflict (model_id, supplier) do update set
  upstream_model = excluded.upstream_model,
  priority       = excluded.priority,
  env            = excluded.env,
  enabled        = excluded.enabled,
  note           = excluded.note,
  updated_at     = now();

-- E.6 — supplier_status rows for all 5 suppliers
insert into public.supplier_status (supplier, enabled, daily_spend_limit_usd, updated_at)
values
  ('cloudflare', true, 5,    now()),
  ('kie',        true, 25,   now()),
  ('alibaba',    true, 25,   now()),
  ('google',     true, 25,   now()),
  ('musicapi',   true, null, now())
on conflict (supplier) do update set
  enabled               = excluded.enabled,
  daily_spend_limit_usd = coalesce(public.supplier_status.daily_spend_limit_usd, excluded.daily_spend_limit_usd),
  updated_at            = now();

-- E.7 — plan_limits defaults
insert into public.plan_limits (plan_tier, max_video_seconds, premium_monthly_cap, updated_at)
values
  ('free',    8,  0,   now()),
  ('starter', 8,  5,   now()),
  ('creator', 15, 20,  now()),
  ('pro',     30, 60,  now()),
  ('studio',  30, 200, now())
on conflict (plan_tier) do update set
  max_video_seconds   = excluded.max_video_seconds,
  premium_monthly_cap = excluded.premium_monthly_cap,
  updated_at          = now();


-- ============================================================================
-- F. REALTIME PUBLICATION (idempotent)
-- ============================================================================

do $$
begin
  alter publication supabase_realtime add table public.credit_wallets;
exception when duplicate_object then null; when others then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.generation_jobs;
exception when duplicate_object then null; when others then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.generation_job_variants;
exception when duplicate_object then null; when others then null;
end $$;


-- ============================================================================
-- G. OPTIONAL ONE-OFF MIGRATION FOR EXISTING FREE USERS (COMMENTED OUT — DO NOT RUN AUTOMATICALLY)
-- ============================================================================
-- Moves leftover welcome credits (<= 500) of users who have never purchased a
-- pack from the paid `balance` bucket into `promo_balance`.
/*
update public.credit_wallets w
   set promo_balance = promo_balance + w.balance,
       balance       = 0,
       updated_at    = now()
 where w.balance > 0
   and w.balance <= 500
   and not exists (
     select 1 from public.tier_purchases tp where tp.user_id = w.user_id
   );
*/


-- ============================================================================
-- VERIFICATION QUERY: List all SECURITY DEFINER functions in `public` and
-- whether `anon` or `authenticated` can still execute them.
-- Expected: only triggers and intended public/PIN RPCs (`verify_admin_pin`,
-- `admin_set_platform_stat`) remain executable by `anon`/`authenticated`;
-- all money-moving RPCs (`refund_credits`, `debit_credits`, `grant_purchase`,
-- `ensure_wallet`, `reserve_credits`, `reserve_credits_for`,
-- `settle_reservation`, `sweep_expired_reservations`, `supplier_spend_today_usd`)
-- must show anon_can_exec = false AND auth_can_exec = false.
-- ============================================================================
/*
select
  p.oid::regprocedure as function_signature,
  has_function_privilege('anon', p.oid, 'EXECUTE')          as anon_can_exec,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_can_exec,
  has_function_privilege('service_role', p.oid, 'EXECUTE')  as service_role_can_exec
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef = true
order by p.proname;
*/
