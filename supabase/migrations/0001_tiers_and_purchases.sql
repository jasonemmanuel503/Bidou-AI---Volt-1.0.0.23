-- ============================================================
-- Bidou AI — plan tiers, tier badges, and purchase ledger
-- ============================================================

do $$ begin
  create type plan_tier as enum ('free', 'starter', 'creator', 'pro', 'studio');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type media_tab as enum ('image', 'video', 'music');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type payment_rail as enum ('mtn_momo', 'orange_money');
exception when duplicate_object then null;
end $$;

-- 1. Reference table: one row per tier (the "table for each purchased tier")
create table if not exists plan_tiers (
  tier            plan_tier primary key,
  rank            smallint not null unique,
  display_name    text not null,
  badge_gradient  text not null,
  perks           jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now()
);

insert into plan_tiers (tier, rank, display_name, badge_gradient, perks) values
  ('free',    0, 'Free',    'from-[#6B6B75] to-[#A0A0AA]',            '["500 welcome credits"]'),
  ('starter', 1, 'Starter', 'from-[#FFB020] to-[#FF8800]',            '["HD downloads","Commercial usage"]'),
  ('creator', 2, 'Creator', 'from-[#FF8800] to-[#F86A00]',            '["Priority queue","Project folders"]'),
  ('pro',     3, 'Pro',     'from-[#F86A00] to-[#C2410C]',            '["4K exports","Private mode"]'),
  ('studio',  4, 'Studio',  'from-[#F86A00] via-[#FFB020] to-[#F86A00]', '["Agency seats","Bulk export kit"]')
on conflict (tier) do nothing;

-- 2. Profile carries the current (highest) tier
alter table if exists profiles
  add column if not exists plan_tier plan_tier not null default 'free';

-- 3. Package catalogue, mirroring INITIAL_PACKAGES in configData.ts
create table if not exists credit_packages (
  id              text primary key,
  media_tab       media_tab not null,
  tier            plan_tier not null references plan_tiers(tier),
  name            text not null,
  price_fcfa      integer not null check (price_fcfa > 0),
  credits         integer not null check (credits > 0),
  popular         boolean not null default false,
  discount_percent integer,
  features        jsonb not null default '[]'::jsonb,
  active          boolean not null default true
);

-- 4. Purchase ledger — one immutable row per successful payment
create table if not exists tier_purchases (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  package_id      text not null references credit_packages(id),
  tier            plan_tier not null references plan_tiers(tier),
  amount_fcfa     integer not null,
  credits_granted integer not null,
  payment_rail    payment_rail,
  reference_id    text not null unique,   -- FuturaPay idempotency key
  purchased_at    timestamptz not null default now()
);

-- 5. Badge collection — a user keeps every tier they have ever bought
create table if not exists user_tier_badges (
  user_id       uuid not null references auth.users(id) on delete cascade,
  tier          plan_tier not null references plan_tiers(tier),
  first_earned_at timestamptz not null default now(),
  times_purchased integer not null default 1,
  primary key (user_id, tier)
);

create index if not exists idx_tier_purchases_user on tier_purchases(user_id, purchased_at desc);
create index if not exists idx_user_tier_badges_user on user_tier_badges(user_id);

-- 6. Award badge + promote profile whenever a purchase lands
create or replace function award_tier_badge() returns trigger as $$
begin
  insert into user_tier_badges (user_id, tier)
  values (new.user_id, new.tier)
  on conflict (user_id, tier)
    do update set times_purchased = user_tier_badges.times_purchased + 1;

  update profiles p
  set plan_tier = new.tier
  from plan_tiers pt_new, plan_tiers pt_cur
  where p.id = new.user_id
    and pt_new.tier = new.tier
    and pt_cur.tier = p.plan_tier
    and pt_new.rank > pt_cur.rank;   -- never demote

  return new;
end;
$$ language plpgsql security definer;

create trigger trg_award_tier_badge
  after insert on tier_purchases
  for each row execute function award_tier_badge();

-- 7. RLS
alter table tier_purchases   enable row level security;
alter table user_tier_badges enable row level security;
alter table plan_tiers       enable row level security;
alter table credit_packages  enable row level security;

create policy "own purchases readable" on tier_purchases
  for select using (auth.uid() = user_id);
create policy "own badges readable" on user_tier_badges
  for select using (auth.uid() = user_id);
create policy "tiers public read" on plan_tiers for select using (true);
create policy "packages public read" on credit_packages for select using (true);
