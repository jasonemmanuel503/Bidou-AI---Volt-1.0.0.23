-- ============================================================
-- Bidou AI — Migration 0006: Unified Tiers, Lifetime Spend & Media Badges
-- Implements Task 8 / Part B
-- ============================================================

-- 1. Table for tracking media-specific generation milestones
create table if not exists user_media_badges (
  user_id         uuid not null references auth.users(id) on delete cascade,
  media           media_tab not null,
  generations_count integer not null default 0,
  earned_at       timestamptz,              -- null until the threshold is crossed
  primary key (user_id, media)
);

alter table user_media_badges enable row level security;

create policy "own media badges readable" on user_media_badges
  for select using (auth.uid() = user_id);

-- Ensure profiles.lifetime_spend_fcfa exists
alter table profiles
  add column if not exists lifetime_spend_fcfa bigint not null default 0;

-- 2. Rewrite award_tier_badge() on tier_purchases:
-- adds new.amount_fcfa to profiles.lifetime_spend_fcfa,
-- recomputes plan_tier from the new total via the thresholds,
-- applies it only if the new rank is higher (never demote).
-- It no longer touches media badges at all.
create or replace function award_tier_badge() returns trigger as $$
declare
  v_new_spend bigint;
  v_computed_tier plan_tier;
  v_current_tier plan_tier;
  v_current_rank smallint;
  v_computed_rank smallint;
begin
  -- Update lifetime spend on profile and fetch current values
  update profiles
  set lifetime_spend_fcfa = coalesce(lifetime_spend_fcfa, 0) + new.amount_fcfa
  where id = new.user_id
  returning lifetime_spend_fcfa, plan_tier into v_new_spend, v_current_tier;

  -- Recompute plan_tier from the new total via thresholds:
  -- Studio (>= 40,000), Pro (>= 15,000), Creator (>= 5,000), Starter (>= 1,500), Free (>= 0)
  if v_new_spend >= 40000 then
    v_computed_tier := 'studio';
  elsif v_new_spend >= 15000 then
    v_computed_tier := 'pro';
  elsif v_new_spend >= 5000 then
    v_computed_tier := 'creator';
  elsif v_new_spend >= 1500 then
    v_computed_tier := 'starter';
  else
    v_computed_tier := 'free';
  end if;

  select rank into v_current_rank from plan_tiers where tier = coalesce(v_current_tier, 'free');
  select rank into v_computed_rank from plan_tiers where tier = v_computed_tier;

  -- Apply ONLY if the new rank is higher (never demote)
  if coalesce(v_computed_rank, 0) > coalesce(v_current_rank, 0) then
    update profiles
    set plan_tier = v_computed_tier
    where id = new.user_id;

    -- Keep historical record in user_tier_badges
    insert into user_tier_badges (user_id, tier)
    values (new.user_id, v_computed_tier)
    on conflict (user_id, tier)
      do update set times_purchased = user_tier_badges.times_purchased + 1;
  end if;

  return new;
end;
$$ language plpgsql security definer;

-- 3. Generation jobs table & milestone trigger
create table if not exists generation_jobs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  media_type      media_tab not null,
  status          text not null default 'pending', -- 'pending' | 'processing' | 'completed' | 'failed'
  model_id        text,
  prompt          text,
  output_url      text,
  credits_charged integer default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table generation_jobs enable row level security;

create policy "own generation jobs readable" on generation_jobs
  for select using (auth.uid() = user_id);

-- Separate AFTER UPDATE trigger on generation_jobs firing when status becomes 'completed':
-- upsert user_media_badges for that job's media type,
-- increment generations_count,
-- and set earned_at = now() the first time the count reaches 5.
create or replace function handle_generation_job_completed() returns trigger as $$
begin
  if new.status = 'completed' and (old.status is distinct from 'completed') then
    insert into user_media_badges (user_id, media, generations_count, earned_at)
    values (
      new.user_id,
      new.media_type,
      1,
      null
    )
    on conflict (user_id, media) do update
    set generations_count = user_media_badges.generations_count + 1,
        earned_at = case
          when user_media_badges.earned_at is not null then user_media_badges.earned_at
          when user_media_badges.generations_count + 1 >= 5 then now()
          else null
        end;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_generation_job_completed on generation_jobs;
create trigger trg_generation_job_completed
  after update on generation_jobs
  for each row execute function handle_generation_job_completed();

-- ============================================================
-- 4. Data Migration (Historical Backfill)
-- ============================================================

-- Sum historical tier_purchases.amount_fcfa per user into lifetime_spend_fcfa
with spend_summary as (
  select user_id, sum(amount_fcfa) as total_fcfa
  from tier_purchases
  group by user_id
)
update profiles p
set lifetime_spend_fcfa = coalesce(s.total_fcfa, 0)
from spend_summary s
where p.id = s.user_id;

-- Recompute plan_tier with the promote-only rule
update profiles p
set plan_tier = case
  when p.lifetime_spend_fcfa >= 40000 then 'studio'::plan_tier
  when p.lifetime_spend_fcfa >= 15000 and (p.plan_tier not in ('studio')) then 'pro'::plan_tier
  when p.lifetime_spend_fcfa >= 5000 and (p.plan_tier not in ('studio', 'pro')) then 'creator'::plan_tier
  when p.lifetime_spend_fcfa >= 1500 and (p.plan_tier not in ('studio', 'pro', 'creator')) then 'starter'::plan_tier
  else p.plan_tier
end;

-- Backfill user_media_badges.generations_count from completed generation_jobs grouped by media type,
-- setting earned_at where the count is already >= 5. Keep user_tier_badges in place.
with job_counts as (
  select user_id, media_type, count(*) as cnt
  from generation_jobs
  where status = 'completed'
  group by user_id, media_type
)
insert into user_media_badges (user_id, media, generations_count, earned_at)
select
  user_id,
  media_type,
  cnt,
  case when cnt >= 5 then now() else null end
from job_counts
on conflict (user_id, media) do update
set generations_count = excluded.generations_count,
    earned_at = case
      when user_media_badges.earned_at is not null then user_media_badges.earned_at
      when excluded.generations_count >= 5 then now()
      else null
    end;
