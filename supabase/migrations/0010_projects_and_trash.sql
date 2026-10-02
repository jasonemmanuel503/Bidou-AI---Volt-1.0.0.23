-- ============================================================================
-- Migration 0010: Projects, project membership, trash & retention
-- ============================================================================

-- B.1.1 — Projects (formerly the in-memory "folders")
create table if not exists projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null check (length(trim(name)) between 1 and 60),
  description text check (length(description) <= 280),
  color       text not null default '#F86A00',
  icon        text not null default 'folder',
  position    integer not null default 0,
  item_count  integer not null default 0,     -- denormalised, trigger-maintained
  cover_url   text,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Layer 3 of the ID fix: a double-submit cannot create a twin.
create unique index if not exists projects_user_name_idx
  on projects (user_id, lower(trim(name)))
  where deleted_at is null;

create index if not exists projects_user_pos_idx
  on projects (user_id, position) where deleted_at is null;

alter table projects enable row level security;
drop policy if exists "own projects readable" on projects;
create policy "own projects readable"  on projects for select using (auth.uid() = user_id);
drop policy if exists "own projects insertable" on projects;
create policy "own projects insertable" on projects for insert with check (auth.uid() = user_id);
drop policy if exists "own projects updatable" on projects;
create policy "own projects updatable"  on projects for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
drop policy if exists "own projects deletable" on projects;
create policy "own projects deletable"  on projects for delete using (auth.uid() = user_id);

-- B.1.2 — Membership join table. Replaces ProjectFolder.item_ids entirely.
-- Variant-level: a single take can be filed, not only a whole 4-take job.
create table if not exists project_items (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  variant_id  uuid not null references generation_job_variants(id) on delete cascade,
  job_id      uuid not null references generation_jobs(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  position    integer not null default 0,     -- kanban ordering within the project
  added_at    timestamptz not null default now(),
  unique (project_id, variant_id)             -- idempotent "Add to project"
);

create index if not exists project_items_project_pos_idx
  on project_items (project_id, position);
create index if not exists project_items_variant_idx on project_items (variant_id);

alter table project_items enable row level security;
drop policy if exists "own project items readable" on project_items;
create policy "own project items readable"  on project_items for select using (auth.uid() = user_id);
drop policy if exists "own project items insertable" on project_items;
create policy "own project items insertable" on project_items for insert with check (auth.uid() = user_id);
drop policy if exists "own project items updatable" on project_items;
create policy "own project items updatable"  on project_items for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
drop policy if exists "own project items deletable" on project_items;
create policy "own project items deletable"  on project_items for delete using (auth.uid() = user_id);

-- B.1.3 — Keep projects.item_count honest without a count(*) per render.
create or replace function sync_project_item_count() returns trigger
language plpgsql security definer as $$
begin
  if tg_op = 'INSERT' then
    update projects set item_count = item_count + 1, updated_at = now()
      where id = new.project_id;
  elsif tg_op = 'DELETE' then
    update projects set item_count = greatest(0, item_count - 1), updated_at = now()
      where id = old.project_id;
  elsif tg_op = 'UPDATE' and new.project_id is distinct from old.project_id then
    update projects set item_count = greatest(0, item_count - 1), updated_at = now()
      where id = old.project_id;
    update projects set item_count = item_count + 1, updated_at = now()
      where id = new.project_id;
  end if;
  return null;
end; $$;

drop trigger if exists trg_project_item_count on project_items;
create trigger trg_project_item_count
  after insert or update or delete on project_items
  for each row execute function sync_project_item_count();

-- B.1.4 — Atomic reorder for kanban drag-and-drop.
-- One call per drop; avoids N round-trips and a half-applied order.
create or replace function reorder_project_items(
  p_project_id uuid,
  p_variant_ids uuid[]
) returns void language plpgsql security definer as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not exists (select 1 from projects where id = p_project_id and user_id = v_user)
    then raise exception 'FORBIDDEN'; end if;

  update project_items pi
     set position = idx.ord
    from unnest(p_variant_ids) with ordinality as idx(vid, ord)
   where pi.project_id = p_project_id
     and pi.variant_id = idx.vid
     and pi.user_id = v_user;
end; $$;

-- B.1.5 — Move a variant between projects atomically (kanban cross-column drop).
create or replace function move_project_item(
  p_variant_id uuid, p_from_project uuid, p_to_project uuid, p_position integer
) returns void language plpgsql security definer as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not exists (select 1 from projects where id = p_to_project and user_id = v_user)
    then raise exception 'FORBIDDEN'; end if;

  -- Moving onto a project that already holds it is a no-op, not an error.
  if exists (select 1 from project_items
             where project_id = p_to_project and variant_id = p_variant_id) then
    delete from project_items
      where project_id = p_from_project and variant_id = p_variant_id and user_id = v_user;
    return;
  end if;

  update project_items
     set project_id = p_to_project, position = p_position
   where variant_id = p_variant_id
     and project_id = p_from_project
     and user_id = v_user;
end; $$;

-- Enable the supabase_realtime publication for projects and project_items (Section B.5)
do $pub$
begin
  alter publication supabase_realtime add table projects, project_items;
exception when duplicate_object then null;
end $pub$;

-- ============================================================================
-- SECTION D — Trash, restore & tiered retention
-- ============================================================================

-- D.2.1 — Trash metadata on variants.
-- generation_job_variants.deleted_at already exists (migration 0009 §4).
alter table generation_job_variants
  add column if not exists purge_after      timestamptz,
  add column if not exists deleted_by_tier   plan_tier,
  add column if not exists storage_path      text,     -- bucket key, for byte purge
  add column if not exists purged_at         timestamptz;

create index if not exists gjv_purge_idx
  on generation_job_variants (purge_after)
  where deleted_at is not null and purged_at is null;

create index if not exists gjv_trash_idx
  on generation_job_variants (user_id, deleted_at desc)
  where deleted_at is not null and purged_at is null;

-- D.2.2 — Retention window by tier. Single source of truth.
create or replace function trash_retention_interval(p_tier plan_tier)
returns interval language sql immutable as $$
  select case when p_tier = 'free' then interval '2 hours'
              else interval '30 days' end;
$$;

-- D.2.3 — Soft delete: stamp the purge deadline from the CURRENT tier.
create or replace function trash_variants(p_variant_ids uuid[])
returns table (variant_id uuid, purge_after timestamptz)
language plpgsql security definer as $$
declare
  v_user uuid := auth.uid();
  v_tier plan_tier;
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select plan_tier into v_tier from profiles where id = v_user;
  v_tier := coalesce(v_tier, 'free');

  return query
  update generation_job_variants v
     set deleted_at      = now(),
         deleted_by_tier = v_tier,
         purge_after     = now() + trash_retention_interval(v_tier)
   where v.id = any(p_variant_ids)
     and v.user_id = v_user
     and v.deleted_at is null
  returning v.id, v.purge_after;

  -- Trashed assets leave every project they belonged to.
  delete from project_items
   where variant_id = any(p_variant_ids) and user_id = v_user;
end; $$;

-- D.2.4 — Restore. Refuses anything already purged.
create or replace function restore_variants(p_variant_ids uuid[])
returns setof uuid language plpgsql security definer as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED'; end if;
  return query
  update generation_job_variants v
     set deleted_at = null, purge_after = null, deleted_by_tier = null
   where v.id = any(p_variant_ids)
     and v.user_id = v_user
     and v.deleted_at is not null
     and v.purged_at is null           -- bytes are gone; nothing to restore
  returning v.id;
end; $$;

-- D.2.5 — Manual permanent delete: mark for immediate byte purge.
create or replace function purge_variants_now(p_variant_ids uuid[])
returns setof uuid language plpgsql security definer as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED'; end if;
  return query
  update generation_job_variants v
     set purge_after = now() - interval '1 second'
   where v.id = any(p_variant_ids)
     and v.user_id = v_user
     and v.deleted_at is not null
     and v.purged_at is null
  returning v.id;
end; $$;

-- D.2.6 — Sweep expired reservations via pg_cron if enabled
do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('sweep-reservations', '*/10 * * * *',
                         $job$select sweep_expired_reservations()$job$);
  end if;
end; $cron$;
