-- ============================================================
-- Bidou AI — Migration 20260924000000: Fix signup trigger
-- Fixes "Database error saving new user" (email, phone, Google)
--
-- Two problems are fixed here:
--  1. The signup triggers ran with search_path = auth and referenced public
--     objects without a schema, so they could not find them.
--  2. On some databases generate_affiliate_code() and platform_stats were
--     never created (earlier migrations failed part-way). This file creates
--     them if they are missing.
--
-- PREREQUISITE: public.profiles and public.credit_wallets must exist
-- (they come from migration 0000). Run the diagnostic at the bottom first
-- if you are not sure.
-- Safe to run more than once. Run the WHOLE file at once in the SQL Editor.
-- ============================================================

-- 1. Affiliate code generator (creates it if missing, pins search_path)
create or replace function public.generate_affiliate_code() returns text
language plpgsql
set search_path = public
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text; i int;
begin
  loop
    code := '';
    for i in 1..8 loop
      code := code || substr(alphabet, floor(random() * length(alphabet) + 1)::int, 1);
    end loop;
    exit when not exists (select 1 from public.profiles where affiliate_code = code);
  end loop;
  return code;
end; $$;

-- 2. platform_stats table (creates it if missing)
create table if not exists public.platform_stats (
  id              uuid primary key default gen_random_uuid(),
  metric_key      text unique not null,
  metric_value    bigint not null default 0,
  manual_override boolean not null default false,
  updated_at      timestamptz not null default now()
);

alter table public.platform_stats enable row level security;

drop policy if exists "public read platform stats" on public.platform_stats;
create policy "public read platform stats" on public.platform_stats
  for select using (true);

insert into public.platform_stats (metric_key, metric_value)
values ('total_users', 0), ('paid_users', 0)
on conflict (metric_key) do nothing;

-- Backfill counters from real data (paid_users only if profiles.plan_tier exists)
update public.platform_stats
   set metric_value = (select count(*) from public.profiles)
 where metric_key = 'total_users' and manual_override = false;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'plan_tier'
  ) then
    update public.platform_stats
       set metric_value = (select count(*) from public.profiles where plan_tier::text <> 'free')
     where metric_key = 'paid_users' and manual_override = false;
  end if;
end $$;

-- Realtime for the landing-page counter (ignore if already added / unavailable)
do $$
begin
  alter publication supabase_realtime add table public.platform_stats;
exception when others then null;
end $$;

-- 3. New-user trigger function
create or replace function public.handle_new_user() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, affiliate_code)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name', ''),
    public.generate_affiliate_code()
  )
  on conflict (id) do nothing;

  insert into public.credit_wallets (user_id, balance)
  values (new.id, 500)
  on conflict (user_id) do nothing;

  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4. Counter triggers on profiles
create or replace function public.bump_total_users() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.platform_stats
     set metric_value = metric_value + 1, updated_at = now()
   where metric_key = 'total_users';
  return new;
end; $$;

drop trigger if exists trg_bump_total_users on public.profiles;
create trigger trg_bump_total_users
  after insert on public.profiles
  for each row execute function public.bump_total_users();

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'plan_tier'
  ) then
    create or replace function public.bump_paid_users() returns trigger
    language plpgsql
    security definer
    set search_path = public
    as $f$
    begin
      if old.plan_tier::text = 'free' and new.plan_tier::text <> 'free' then
        update public.platform_stats
           set metric_value = metric_value + 1, updated_at = now()
         where metric_key = 'paid_users';
      end if;
      return new;
    end; $f$;

    drop trigger if exists trg_bump_paid_users on public.profiles;
    create trigger trg_bump_paid_users
      after update of plan_tier on public.profiles
      for each row execute function public.bump_paid_users();
  end if;
end $$;

-- ------------------------------------------------------------
-- DIAGNOSTIC (run separately, before or after). Every column should be non-null / >0:
--
--   select
--     to_regclass('public.profiles')                    as profiles,
--     to_regclass('public.credit_wallets')              as credit_wallets,
--     to_regclass('public.platform_stats')              as platform_stats,
--     to_regprocedure('public.generate_affiliate_code()') as gen_code,
--     to_regprocedure('public.handle_new_user()')       as handle_new_user,
--     (select count(*) from pg_trigger where tgname = 'on_auth_user_created') as auth_trigger;
--
-- If profiles or credit_wallets is null, run migration 0000_profiles.sql first.
-- If signup still fails, the real error is in Dashboard → Logs → Postgres.
-- ------------------------------------------------------------
