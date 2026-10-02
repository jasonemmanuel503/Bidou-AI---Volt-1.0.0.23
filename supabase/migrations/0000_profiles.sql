-- ============================================================
-- Bidou AI — Migration 0000: Base profiles & new user trigger
-- ============================================================

-- Short, unambiguous affiliate code generator (8 chars, no O/0/I/1)
create or replace function generate_affiliate_code() returns text
language plpgsql as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text; i int;
begin
  loop
    code := '';
    for i in 1..8 loop
      code := code || substr(alphabet, floor(random() * length(alphabet) + 1)::int, 1);
    end loop;
    exit when not exists (select 1 from profiles where affiliate_code = code);
  end loop;
  return code;
end; $$;

create table if not exists profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  email               text not null,
  name                text not null default '',
  phone               text,
  avatar_url          text,
  affiliate_code      text unique,
  referred_by         uuid references auth.users(id),
  language_preference text not null default 'fr',
  theme_preference    text not null default 'system',
  is_admin            boolean not null default false,
  lifetime_spend_fcfa integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table profiles enable row level security;
create policy "read own profile"   on profiles for select using (auth.uid() = id);
create policy "update own profile" on profiles for update using (auth.uid() = id)
  with check (auth.uid() = id and is_admin = (select is_admin from profiles where id = auth.uid()));
-- ^ a user may edit their own row but can NEVER set is_admin on themselves.

create table if not exists credit_wallets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null unique references auth.users(id) on delete cascade,
  balance    integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

alter table credit_wallets enable row level security;
create policy "read own wallet" on credit_wallets for select using (auth.uid() = user_id);

create or replace function handle_new_user() returns trigger
language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, name, affiliate_code)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', ''), generate_affiliate_code())
  on conflict (id) do nothing;
  
  insert into public.credit_wallets (user_id, balance)
  values (new.id, 500)
  on conflict (user_id) do nothing;
  
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();
