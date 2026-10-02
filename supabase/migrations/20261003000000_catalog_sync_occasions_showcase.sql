-- ============================================================================
-- Note for the owner: Run this in the Supabase SQL editor after the previous
-- migration 20261002000000.
--
-- Bidou AI (Volt) — Migration 20261003000000
-- A. catalog_version (realtime signal when admin changes the model catalog)
-- B. lock ai_models away from browser roles (costs / licence notes)
-- C. repair video_options key (maxDurationByTier -> max_duration_by_plan)
-- D. generation_jobs + profiles columns for title / occasion / visibility
-- E. showcase_items, showcase_likes, showcase_reports (+ RLS, indexes, realtime)
-- ============================================================================

-- A. ------------------------------------------------------------------------
create table if not exists public.catalog_version (
  id         smallint primary key default 1 check (id = 1),
  version    bigint   not null default 1,
  updated_at timestamptz not null default now()
);
insert into public.catalog_version (id, version) values (1, 1) on conflict (id) do nothing;

alter table public.catalog_version enable row level security;
drop policy if exists "catalog_version public read" on public.catalog_version;
create policy "catalog_version public read" on public.catalog_version for select using (true);

create or replace function public.bump_catalog_version() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.catalog_version set version = version + 1, updated_at = now() where id = 1;
  return null;
end; $$;

drop trigger if exists trg_ai_models_bump on public.ai_models;
create trigger trg_ai_models_bump
  after insert or update or delete on public.ai_models
  for each statement execute function public.bump_catalog_version();

do $$ begin alter publication supabase_realtime add table public.catalog_version;
exception when duplicate_object then null; when others then null; end $$;

-- B. ------------------------------------------------------------------------
-- Verified: no code under src/ queries ai_models; only server/ (service role) does.
drop policy if exists "models public read" on public.ai_models;
revoke select on public.ai_models from anon, authenticated;

-- C. ------------------------------------------------------------------------
update public.ai_models
   set video_options = (video_options - 'maxDurationByTier')
                       || jsonb_build_object('max_duration_by_plan', video_options->'maxDurationByTier')
 where video_options ? 'maxDurationByTier';

-- D. ------------------------------------------------------------------------
alter table public.generation_jobs
  add column if not exists title            text,
  add column if not exists occasion_id      text,
  add column if not exists occasion_sub_id  text,
  add column if not exists occasion_details jsonb,
  add column if not exists visibility       text not null default 'private'
        check (visibility in ('private','public')),
  add column if not exists share_prompt     boolean not null default false;

alter table public.profiles
  add column if not exists showcase_default      boolean not null default true,
  add column if not exists showcase_display_name text;

-- E. ------------------------------------------------------------------------
create table if not exists public.showcase_items (
  id               uuid primary key default gen_random_uuid(),
  job_id           uuid not null unique references public.generation_jobs(id) on delete cascade,
  variant_id       uuid not null references public.generation_job_variants(id) on delete cascade,
  user_id          uuid not null,
  media_type       text not null check (media_type in ('image','video','music')),
  title            text not null default '',
  author_name      text not null default 'Bidou creator',
  prompt           text,                       -- NULL unless the user opted in to share it
  model_label      text,                       -- display_name only, never supplier
  genre_or_style   text,
  occasion_id      text,
  aspect_ratio     text,
  duration_seconds integer,
  status           text not null default 'pending_review'
                   check (status in ('pending_review','approved','rejected')),
  featured_by      text not null default 'user_opt_in' check (featured_by in ('user_opt_in','admin')),
  display_order    integer not null default 0,
  likes_count      integer not null default 0 check (likes_count >= 0),
  created_at       timestamptz not null default now(),
  approved_at      timestamptz
);

create index if not exists showcase_status_created_idx   on public.showcase_items (status, created_at desc);
create index if not exists showcase_type_status_idx      on public.showcase_items (media_type, status, created_at desc);
create index if not exists showcase_featured_idx         on public.showcase_items (status, featured_by, display_order);
create index if not exists showcase_occasion_idx         on public.showcase_items (occasion_id) where occasion_id is not null;
create index if not exists showcase_variant_idx          on public.showcase_items (variant_id);

create table if not exists public.showcase_likes (
  item_id    uuid not null references public.showcase_items(id) on delete cascade,
  user_id    uuid not null,
  created_at timestamptz not null default now(),
  primary key (item_id, user_id)
);

create table if not exists public.showcase_reports (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references public.showcase_items(id) on delete cascade,
  reporter_id uuid not null,
  reason      text not null,
  resolved    boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (item_id, reporter_id)
);

create or replace function public.showcase_sync_likes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.showcase_items set likes_count = likes_count + 1 where id = new.item_id;
  elsif tg_op = 'DELETE' then
    update public.showcase_items set likes_count = greatest(0, likes_count - 1) where id = old.item_id;
  end if;
  return null;
end; $$;

drop trigger if exists trg_showcase_likes on public.showcase_likes;
create trigger trg_showcase_likes after insert or delete on public.showcase_likes
  for each row execute function public.showcase_sync_likes();

alter table public.showcase_items   enable row level security;
alter table public.showcase_likes   enable row level security;
alter table public.showcase_reports enable row level security;

-- Anyone (including logged-out visitors) may read APPROVED rows. Everything else: service role only.
drop policy if exists "showcase approved read" on public.showcase_items;
create policy "showcase approved read" on public.showcase_items for select using (status = 'approved');

drop policy if exists "showcase likes own read" on public.showcase_likes;
create policy "showcase likes own read" on public.showcase_likes for select using (auth.uid() = user_id);

revoke insert, update, delete on public.showcase_items   from anon, authenticated;
revoke insert, update, delete on public.showcase_likes   from anon, authenticated;
revoke all                    on public.showcase_reports from anon, authenticated;

do $$ begin alter publication supabase_realtime add table public.showcase_items;
exception when duplicate_object then null; when others then null; end $$;
