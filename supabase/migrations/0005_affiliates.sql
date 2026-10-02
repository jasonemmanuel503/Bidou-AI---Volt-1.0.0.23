-- ============================================================
-- Bidou AI — Migration 0005: Affiliate programme
-- ============================================================

alter table profiles
  add column if not exists affiliate_code text unique,
  add column if not exists referred_by uuid references auth.users(id);

-- Short, unambiguous code: no O/0/I/1, 8 chars, collision-retried.
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

do $$ begin
  create type referral_status as enum ('pending', 'qualified', 'rewarded', 'rejected');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type reward_kind as enum ('bonus_credits', 'cash_fcfa');
exception when duplicate_object then null;
end $$;

create table if not exists referrals (
  id                     uuid primary key default gen_random_uuid(),
  referrer_id            uuid not null references auth.users(id) on delete cascade,
  referred_user_id       uuid not null unique references auth.users(id) on delete cascade,
  affiliate_code         text not null,
  status                 referral_status not null default 'pending',
  signed_up_at           timestamptz not null default now(),
  qualified_at           timestamptz,
  qualifying_purchase_id uuid references tier_purchases(id),
  landing_page           text,
  constraint no_self_referral check (referrer_id <> referred_user_id)
);

create table if not exists referral_rewards (
  id               uuid primary key default gen_random_uuid(),
  referral_id      uuid not null unique references referrals(id) on delete cascade,
  referrer_id      uuid not null references auth.users(id),
  kind             reward_kind not null,
  amount           integer not null check (amount > 0),
  paid_out         boolean not null default false,
  paid_out_at      timestamptz,
  payout_reference text,
  created_at       timestamptz not null default now()
);

create index if not exists idx_referrals_referrer on referrals(referrer_id, status);
create index if not exists idx_rewards_unpaid on referral_rewards(paid_out) where paid_out = false;

alter table referrals enable row level security;
alter table referral_rewards enable row level security;

create policy "read own referrals" on referrals
  for select using (auth.uid() = referrer_id or auth.uid() = referred_user_id);

create policy "read own rewards" on referral_rewards
  for select using (auth.uid() = referrer_id);

-- Qualification trigger
-- A referral becomes qualified only on the referred user's first successful paid purchase.
create or replace function qualify_referral_on_first_purchase()
returns trigger language plpgsql security definer as $$
declare
  ref_rec record;
  purchase_count int;
  reward_type reward_kind := 'cash_fcfa';
  reward_val int := 500;
begin
  -- 1. Find a pending referral where referred_user_id = new.user_id
  select * into ref_rec
  from referrals
  where referred_user_id = new.user_id
    and status = 'pending'
  limit 1;

  if ref_rec.id is null then
    return new;
  end if;

  -- 2. Confirm this is that user's first row in tier_purchases
  select count(*) into purchase_count
  from tier_purchases
  where user_id = new.user_id;

  if purchase_count > 1 then
    return new;
  end if;

  -- 3. Set status = 'qualified', qualified_at = now(), qualifying_purchase_id = new.id
  update referrals
  set status = 'qualified',
      qualified_at = now(),
      qualifying_purchase_id = new.id
  where id = ref_rec.id;

  -- 4. Insert one referral_rewards row - ('cash_fcfa', 500) or ('bonus_credits', N)
  insert into referral_rewards (referral_id, referrer_id, kind, amount, paid_out)
  values (ref_rec.id, ref_rec.referrer_id, reward_type, reward_val, false);

  -- 5. For bonus_credits, write a credit_transactions row of type 'bonus'
  if reward_type = 'bonus_credits' then
    insert into credit_transactions (user_id, type, amount, balance_after, reference_id, description)
    values (
      ref_rec.referrer_id,
      'bonus',
      reward_val,
      coalesce((select balance from credit_wallets where user_id = ref_rec.referrer_id), 0) + reward_val,
      ref_rec.id::text,
      'Referral bonus credits for qualifying invite'
    );
    update credit_wallets
    set balance = balance + reward_val,
        updated_at = now()
    where user_id = ref_rec.referrer_id;
  end if;

  return new;
end; $$;

drop trigger if exists trg_qualify_referral on tier_purchases;
create trigger trg_qualify_referral
  after insert on tier_purchases
  for each row execute function qualify_referral_on_first_purchase();
