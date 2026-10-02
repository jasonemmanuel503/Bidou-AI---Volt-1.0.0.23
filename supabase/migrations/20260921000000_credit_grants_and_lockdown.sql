-- ============================================================
-- Bidou AI — Migration 20260921000000: Credit Grants & Lockdown
-- Implements Phase 0.9 & Phase 1.1
-- ============================================================

-- 1. Make credit_packages.media_tab nullable and upsert unified 4-tier packages
alter table credit_packages alter column media_tab drop not null;

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
  (
    'pkg_starter',
    null,
    'starter',
    'Starter',
    1500,
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
    5000,
    5500,
    true,
    null,
    '["5,500 Universal Credits (+500 bonus credits)", "Priority GPU cluster queue", "Cinematic 2K upscales & HD video", "Commercial creator rights"]'::jsonb,
    true
  ),
  (
    'pkg_pro',
    null,
    'pro',
    'Pro',
    15000,
    18000,
    false,
    null,
    '["18,000 Universal Credits (+3,000 bonus credits)", "Full 4K Ultra-HD & 60fps video synthesis", "Full studio tracks & lyrics AI", "Direct WhatsApp & social media exports"]'::jsonb,
    true
  ),
  (
    'pkg_studio',
    null,
    'studio',
    'Studio',
    40000,
    53000,
    false,
    null,
    '["53,000 Universal Credits (+13,000 bulk bonus)", "Highest GPU cluster priority", "Multi-project team collaboration", "Dedicated account manager support"]'::jsonb,
    true
  )
on conflict (id) do update set
  tier = excluded.tier,
  name = excluded.name,
  price_fcfa = excluded.price_fcfa,
  credits = excluded.credits,
  popular = excluded.popular,
  features = excluded.features,
  active = excluded.active;

-- 2. Add payments table
create table if not exists payments (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  package_id       text not null references credit_packages(id),
  amount_fcfa      integer not null check (amount_fcfa > 0),
  credits          integer not null check (credits > 0),
  payment_rail     payment_rail not null,
  phone            text,
  reference_id     text not null unique,
  provider_tx_id   text,
  status           text not null default 'pending' check (status in ('pending', 'successful', 'failed', 'cancelled')),
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists payments_user_idx on payments (user_id, created_at desc);
create index if not exists payments_ref_idx on payments (reference_id);

alter table payments enable row level security;
create policy "own payments readable" on payments for select using (auth.uid() = user_id);

-- 3. Idempotent ensure_wallet function
create or replace function ensure_wallet(p_user uuid)
returns jsonb as $$
declare
  v_wallet credit_wallets%rowtype;
begin
  select * into v_wallet from credit_wallets where user_id = p_user;
  if not found then
    insert into credit_wallets (user_id, balance, updated_at)
      values (p_user, 500, now())
      on conflict (user_id) do nothing;

    select * into v_wallet from credit_wallets where user_id = p_user;

    insert into credit_transactions (user_id, type, amount, balance_after, reference_id, description)
      values (p_user, 'bonus', 500, 500, 'welcome_' || p_user::text, 'Welcome creative credit grant (Free Tier)')
      on conflict do nothing;
  end if;
  return jsonb_build_object('balance', v_wallet.balance, 'updated_at', v_wallet.updated_at);
end;
$$ language plpgsql security definer;

-- 4. Atomic grant_purchase function
create or replace function grant_purchase(
  p_reference_id text,
  p_provider_tx_id text default null
) returns jsonb as $$
declare
  v_pay payments%rowtype;
  v_pkg credit_packages%rowtype;
  v_balance integer;
  v_plan_tier plan_tier;
begin
  select * into v_pay from payments where reference_id = p_reference_id for update;
  if not found then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;

  if v_pay.status = 'successful' then
    select balance into v_balance from credit_wallets where user_id = v_pay.user_id;
    select plan_tier into v_plan_tier from profiles where id = v_pay.user_id;
    return jsonb_build_object(
      'balance', coalesce(v_balance, 0),
      'plan_tier', coalesce(v_plan_tier, 'free'),
      'already_processed', true
    );
  end if;

  if v_pay.status <> 'pending' then
    raise exception 'PAYMENT_ALREADY_SETTLED';
  end if;

  select * into v_pkg from credit_packages where id = v_pay.package_id;
  if not found then
    raise exception 'PACKAGE_NOT_FOUND';
  end if;

  -- Mark payment as successful
  update payments
  set status = 'successful',
      provider_tx_id = coalesce(p_provider_tx_id, v_pay.provider_tx_id),
      updated_at = now()
  where id = v_pay.id;

  -- Ensure wallet row exists
  perform ensure_wallet(v_pay.user_id);

  -- Credit wallet balance
  update credit_wallets
  set balance = balance + v_pkg.credits,
      updated_at = now()
  where user_id = v_pay.user_id
  returning balance into v_balance;

  -- Record tier purchase (which triggers award_tier_badge to update lifetime_spend and plan_tier)
  insert into tier_purchases (
    user_id,
    package_id,
    tier,
    amount_fcfa,
    credits_granted,
    payment_rail,
    reference_id,
    purchased_at
  ) values (
    v_pay.user_id,
    v_pkg.id,
    v_pkg.tier,
    v_pay.amount_fcfa,
    v_pkg.credits,
    v_pay.payment_rail,
    v_pay.reference_id,
    now()
  ) on conflict (reference_id) do nothing;

  -- Record credit transaction in ledger
  insert into credit_transactions (
    user_id,
    type,
    amount,
    balance_after,
    reference_id,
    description
  ) values (
    v_pay.user_id,
    'purchase',
    v_pkg.credits,
    v_balance,
    v_pay.reference_id,
    'Credit package purchase: ' || v_pkg.name
  );

  select plan_tier into v_plan_tier from profiles where id = v_pay.user_id;

  return jsonb_build_object(
    'balance', v_balance,
    'plan_tier', coalesce(v_plan_tier, 'free'),
    'already_processed', false
  );
end;
$$ language plpgsql security definer;

-- 5. Service-role only debit, refund, and reserve functions
create or replace function debit_credits(
  p_user uuid,
  p_amount integer,
  p_reference_id text,
  p_description text default 'Credit deduction'
) returns integer as $$
declare
  v_balance integer;
begin
  if p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  select balance into v_balance from credit_wallets where user_id = p_user for update;
  if v_balance is null then raise exception 'NO_WALLET'; end if;
  if v_balance < p_amount then
    raise exception 'INSUFFICIENT_CREDITS: required % available %', p_amount, v_balance;
  end if;

  update credit_wallets set balance = balance - p_amount, updated_at = now()
    where user_id = p_user returning balance into v_balance;

  insert into credit_transactions (user_id, type, amount, balance_after, reference_id, description)
    values (p_user, 'admin_adjustment', -p_amount, v_balance, p_reference_id, p_description);

  return v_balance;
end;
$$ language plpgsql security definer;

create or replace function refund_credits(
  p_user uuid,
  p_amount integer,
  p_reference_id text,
  p_description text default 'Credit refund'
) returns integer as $$
declare
  v_balance integer;
begin
  if p_amount <= 0 then return 0; end if;
  perform ensure_wallet(p_user);

  update credit_wallets set balance = balance + p_amount, updated_at = now()
    where user_id = p_user returning balance into v_balance;

  insert into credit_transactions (user_id, type, amount, balance_after, reference_id, description)
    values (p_user, 'generation_refund', p_amount, v_balance, p_reference_id, p_description);

  return v_balance;
end;
$$ language plpgsql security definer;

-- reserve_credits_for: allows service-role admin client to reserve credits for any user
create or replace function reserve_credits_for(
  p_user uuid,
  p_job_id uuid,
  p_amount integer,
  p_timeout_seconds integer default 900
) returns text as $$
declare
  v_balance integer;
  v_res_id text := 'res_' || gen_random_uuid()::text;
begin
  if p_user is null then raise exception 'INVALID_USER'; end if;
  if p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;

  select balance into v_balance from credit_wallets
    where user_id = p_user for update;
  if v_balance is null then raise exception 'NO_WALLET'; end if;
  if v_balance < p_amount then
    raise exception 'INSUFFICIENT_CREDITS: required % available %', p_amount, v_balance;
  end if;

  update credit_wallets set balance = balance - p_amount, updated_at = now()
    where user_id = p_user;

  insert into credit_transactions (user_id, type, amount, balance_after, reference_id, description)
    values (p_user, 'generation_reservation', -p_amount, v_balance - p_amount,
            p_job_id::text, 'Hold for generation job');

  insert into credit_reservations (id, user_id, job_id, amount, expires_at)
    values (v_res_id, p_user, p_job_id, p_amount,
            now() + make_interval(secs => p_timeout_seconds));

  return v_res_id;
end;
$$ language plpgsql security definer;

-- 6. Drop client write policies on credit_wallets and tier_purchases (S2)
drop policy if exists "own wallet insertable" on credit_wallets;
drop policy if exists "own wallet updatable" on credit_wallets;
drop policy if exists "own purchases insertable" on tier_purchases;

-- 7. Revoke direct execute on reservation RPCs from anon and authenticated (S3, S9)
revoke execute on function reserve_credits(uuid, integer, integer) from anon, authenticated;
revoke execute on function settle_reservation(text, integer, text) from anon, authenticated;
revoke execute on function sweep_expired_reservations() from anon, authenticated;
