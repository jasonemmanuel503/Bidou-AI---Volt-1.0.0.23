-- ============================================================================
-- Migration: 20261003000000_lock_client_writes.sql
-- Purpose:
--   Lock down client-side write vectors across profiles, generation jobs,
--   job variants, and tier badges.
--
-- Details:
--   1. BEFORE UPDATE trigger on public.profiles:
--      Prevents anon and authenticated users from elevating their plan_tier,
--      modifying lifetime_spend_fcfa, forging affiliate_code, or setting is_admin.
--      Preserves service_role and background jobs (e.g. award_tier_badge via grant_purchase).
--   2. Drop policies allowing client updates on generation_jobs and variants:
--      - "own generation jobs updatable" (generation_jobs)
--      - "own variants insertable" (generation_job_variants)
--      - "own variants updatable" (generation_job_variants)
--   3. Restrict "own generation jobs insertable" on generation_jobs:
--      Only allows completed, 0-credit milestone marker inserts used for
--      earning media badges (persistence.ts recordGenerationJob).
--   4. Drop policies allowing client writes on user_tier_badges:
--      - "own tier badges insertable"
--      - "own tier badges updatable"
--
-- Idempotent: safe to run multiple times in Supabase SQL Editor.
-- ============================================================================

-- 1. Protect critical profile columns against client manipulation
create or replace function public.protect_profile_system_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- If invoked from client contexts (anon or authenticated user roles),
  -- lock plan_tier, lifetime_spend_fcfa, affiliate_code, and is_admin to existing OLD values.
  if coalesce(auth.role(), '') in ('anon', 'authenticated') then
    new.plan_tier := old.plan_tier;
    new.lifetime_spend_fcfa := old.lifetime_spend_fcfa;
    new.affiliate_code := old.affiliate_code;
    new.is_admin := old.is_admin;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_profile_system_columns on public.profiles;
create trigger trg_protect_profile_system_columns
  before update on public.profiles
  for each row
  execute function public.protect_profile_system_columns();

-- 2. Prevent client rewriting of active generation jobs and job variants
drop policy if exists "own generation jobs updatable" on public.generation_jobs;
drop policy if exists "own variants insertable" on public.generation_job_variants;
drop policy if exists "own variants updatable" on public.generation_job_variants;

-- 3. Replace generation_jobs client insert policy with a strict badge-milestone check
drop policy if exists "own generation jobs insertable" on public.generation_jobs;
create policy "own generation jobs insertable" on public.generation_jobs
  for insert
  with check (
    auth.uid() = user_id
    and status = 'completed'
    and coalesce(credits_reserved, 0) = 0
    and reservation_id is null
    and model_id is null
  );

-- 4. Drop client insert/update policies on user_tier_badges (badges are granted by server/triggers only)
drop policy if exists "own tier badges insertable" on public.user_tier_badges;
drop policy if exists "own tier badges updatable" on public.user_tier_badges;
