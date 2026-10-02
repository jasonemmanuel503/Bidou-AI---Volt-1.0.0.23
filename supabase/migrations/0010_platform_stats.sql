-- ============================================================
-- Bidou AI — Migration 0010: Platform stats (public user counter)
-- ============================================================

create table if not exists platform_stats (
  id uuid primary key default gen_random_uuid(),
  metric_key text unique not null,
  metric_value bigint not null default 0,
  manual_override boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table platform_stats enable row level security;

-- Anyone (including the unauthenticated landing page) can read the counters.
create policy "public read platform stats" on platform_stats
  for select using (true);
-- No insert/update/delete policy is granted to anon/authenticated roles:
-- writes only happen through the SECURITY DEFINER RPCs below.

-- Seed rows, backfilled from real current data.
insert into platform_stats (metric_key, metric_value)
values
  ('total_users', (select count(*) from profiles)),
  ('paid_users', (select count(*) from profiles where plan_tier <> 'free'))
on conflict (metric_key) do nothing;

-- Auto-increment total_users whenever a new profile (i.e. a new authenticated
-- signup, since profiles are created by the existing handle_new_user trigger)
-- is inserted — UNLESS the counter was last set manually by an admin, in which
-- case we still increment from that manual baseline (manual_override is just
-- informational/for the admin UI, not a "freeze" flag).
create or replace function bump_total_users() returns trigger as $$
begin
  update platform_stats set metric_value = metric_value + 1, updated_at = now()
  where metric_key = 'total_users';
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_bump_total_users on profiles;
create trigger trg_bump_total_users
  after insert on profiles
  for each row execute function bump_total_users();

-- Auto-increment paid_users the first time a profile's plan_tier moves off 'free'.
create or replace function bump_paid_users() returns trigger as $$
begin
  if old.plan_tier = 'free' and new.plan_tier <> 'free' then
    update platform_stats set metric_value = metric_value + 1, updated_at = now()
    where metric_key = 'paid_users';
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_bump_paid_users on profiles;
create trigger trg_bump_paid_users
  after update of plan_tier on profiles
  for each row execute function bump_paid_users();

-- Admin-only manual override RPC. Re-validates the PIN server-side exactly like
-- verify_admin_pin (migration 0002) so the weak client-side sessionStorage gate
-- can never be bypassed to write arbitrary numbers.
create or replace function admin_set_platform_stat(input_pin text, input_metric_key text, input_value bigint)
returns boolean
language plpgsql
security definer
as $$
declare
  is_valid boolean;
begin
  select verify_admin_pin(input_pin) into is_valid;
  if not is_valid then
    return false;
  end if;

  if input_metric_key not in ('total_users', 'paid_users') then
    return false;
  end if;

  update platform_stats
  set metric_value = input_value, manual_override = true, updated_at = now()
  where metric_key = input_metric_key;

  return true;
end;
$$;

-- Enable Supabase Realtime so the landing page updates live without polling.
alter publication supabase_realtime add table platform_stats;
