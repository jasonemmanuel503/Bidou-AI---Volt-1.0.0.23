-- 0009_payment_methods.sql
-- Bidou AI persistent payment methods schema and RLS policies

create table if not exists user_payment_methods (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  rail                text not null check (rail in ('mtn_momo', 'orange_money')),
  account_holder_name text not null,
  country_iso2        text not null,        -- e.g. 'CM', 'NG', 'SN' (ISO 3166-1 alpha-2)
  country_dial_code   text not null,        -- e.g. '+237' — stored separately from the raw number
  national_number     text not null,        -- digits only, WITHOUT the dial code, e.g. '677123456'
  logo_key            text,                 -- one of 'mtn' | 'orange' | 'custom' | null
  custom_logo_url     text,                 -- set only when logo_key = 'custom'
  is_primary          boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- one phone number cannot be saved twice under the same rail for the same user
  unique (user_id, rail, country_dial_code, national_number)
);

create index if not exists upm_user_idx on user_payment_methods (user_id);

-- Enforce "exactly one primary per user" at the database level, not just in the UI
create unique index if not exists upm_one_primary_per_user
  on user_payment_methods (user_id)
  where is_primary = true;

alter table user_payment_methods enable row level security;

drop policy if exists "own payment methods readable" on user_payment_methods;
create policy "own payment methods readable" on user_payment_methods
  for select using (auth.uid() = user_id);
drop policy if exists "own payment methods insertable" on user_payment_methods;
create policy "own payment methods insertable" on user_payment_methods
  for insert with check (auth.uid() = user_id);
drop policy if exists "own payment methods updatable" on user_payment_methods;
create policy "own payment methods updatable" on user_payment_methods
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own payment methods deletable" on user_payment_methods;
create policy "own payment methods deletable" on user_payment_methods
  for delete using (auth.uid() = user_id);

-- Keep updated_at honest
create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_upm_touch on user_payment_methods;
create trigger trg_upm_touch before update on user_payment_methods
  for each row execute function touch_updated_at();

-- Storage bucket for custom logos
insert into storage.buckets (id, name, public) values ('payment-method-logos', 'payment-method-logos', true)
  on conflict (id) do nothing;

drop policy if exists "payment logo upload own folder" on storage.objects;
create policy "payment logo upload own folder" on storage.objects
  for insert with check (bucket_id = 'payment-method-logos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "payment logo update own folder" on storage.objects;
create policy "payment logo update own folder" on storage.objects
  for update using (bucket_id = 'payment-method-logos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "payment logo public read" on storage.objects;
create policy "payment logo public read" on storage.objects
  for select using (bucket_id = 'payment-method-logos');
