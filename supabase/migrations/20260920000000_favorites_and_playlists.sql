-- ============================================================================
-- Migration: Favorites and Music Playlists
-- Timestamp: 20260920000000_favorites_and_playlists.sql
-- ============================================================================

-- 1. Favorites (any media type, variant-level)
create table if not exists favorites (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  variant_id uuid not null references generation_job_variants(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, variant_id)
);
create index if not exists favorites_user_created_idx on favorites (user_id, created_at desc);
create index if not exists favorites_variant_idx on favorites (variant_id);

alter table favorites enable row level security;
drop policy if exists "own favorites readable" on favorites;
drop policy if exists "own favorites insertable" on favorites;
drop policy if exists "own favorites updatable" on favorites;
drop policy if exists "own favorites deletable" on favorites;

create policy "own favorites readable"  on favorites for select using (auth.uid() = user_id);
create policy "own favorites insertable" on favorites for insert with check (auth.uid() = user_id);
create policy "own favorites updatable"  on favorites for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own favorites deletable"  on favorites for delete using (auth.uid() = user_id);

-- 2. Playlists (music only)
create table if not exists playlists (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null check (length(trim(name)) between 1 and 60),
  tags       text[] not null default '{}' check (cardinality(tags) <= 3),
  position   integer not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists playlists_user_name_idx
  on playlists (user_id, lower(trim(name))) where deleted_at is null;
create index if not exists playlists_user_pos_idx
  on playlists (user_id, position) where deleted_at is null;

alter table playlists enable row level security;
drop policy if exists "own playlists readable" on playlists;
drop policy if exists "own playlists insertable" on playlists;
drop policy if exists "own playlists updatable" on playlists;
drop policy if exists "own playlists deletable" on playlists;

create policy "own playlists readable"  on playlists for select using (auth.uid() = user_id);
create policy "own playlists insertable" on playlists for insert with check (auth.uid() = user_id);
create policy "own playlists updatable"  on playlists for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own playlists deletable"  on playlists for delete using (auth.uid() = user_id);

-- 3. Playlist Items (join table, variant-level)
create table if not exists playlist_items (
  id          uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references playlists(id) on delete cascade,
  variant_id  uuid not null references generation_job_variants(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  position    integer not null default 0,
  added_at    timestamptz not null default now(),
  unique (playlist_id, variant_id)
);
create index if not exists playlist_items_playlist_pos_idx on playlist_items (playlist_id, position);
create index if not exists playlist_items_variant_idx on playlist_items (variant_id);

alter table playlist_items enable row level security;
drop policy if exists "own playlist items readable" on playlist_items;
drop policy if exists "own playlist items insertable" on playlist_items;
drop policy if exists "own playlist items updatable" on playlist_items;
drop policy if exists "own playlist items deletable" on playlist_items;

create policy "own playlist items readable"  on playlist_items for select using (auth.uid() = user_id);
create policy "own playlist items insertable" on playlist_items for insert with check (auth.uid() = user_id);
create policy "own playlist items updatable"  on playlist_items for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own playlist items deletable"  on playlist_items for delete using (auth.uid() = user_id);

-- 4. Trigger: playlist_items can only accept music variants
create or replace function check_playlist_item_music_only() returns trigger
language plpgsql as $$
declare
  v_media_type text;
begin
  select gj.media_type into v_media_type
  from generation_job_variants gjv
  join generation_jobs gj on gj.id = gjv.job_id
  where gjv.id = new.variant_id;

  if v_media_type is distinct from 'music' then
    raise exception 'PLAYLIST_MUSIC_ONLY';
  end if;

  return new;
end; $$;

drop trigger if exists trg_playlist_items_music_only on playlist_items;
create trigger trg_playlist_items_music_only
  before insert or update on playlist_items
  for each row execute function check_playlist_item_music_only();

-- 5. Trigger: touch updated_at on playlist modifications
create or replace function touch_playlist_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

drop trigger if exists trg_playlist_updated_at on playlists;
create trigger trg_playlist_updated_at
  before update on playlists
  for each row execute function touch_playlist_updated_at();

-- Touch playlist.updated_at on item insert/delete/update
create or replace function touch_playlist_on_item_change() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' or tg_op = 'UPDATE' then
    update playlists set updated_at = now() where id = new.playlist_id;
  elsif tg_op = 'DELETE' then
    update playlists set updated_at = now() where id = old.playlist_id;
  end if;
  return null;
end; $$;

drop trigger if exists trg_playlist_touch_items on playlist_items;
create trigger trg_playlist_touch_items
  after insert or update or delete on playlist_items
  for each row execute function touch_playlist_on_item_change();

-- 6. Add to supabase_realtime publication
do $$
begin
  alter publication supabase_realtime add table favorites, playlists, playlist_items;
exception when others then
  null; -- safely ignore if table is already in publication or publication doesn't exist
end; $$;
