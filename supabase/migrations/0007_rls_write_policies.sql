-- generation_jobs
create policy "own generation jobs insertable" on generation_jobs
  for insert with check (auth.uid() = user_id);
create policy "own generation jobs updatable" on generation_jobs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- credit_wallets
create policy "own wallet insertable" on credit_wallets
  for insert with check (auth.uid() = user_id);
create policy "own wallet updatable" on credit_wallets
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- tier_purchases
create policy "own purchases insertable" on tier_purchases
  for insert with check (auth.uid() = user_id);

-- user_tier_badges
create policy "own tier badges insertable" on user_tier_badges
  for insert with check (auth.uid() = user_id);
create policy "own tier badges updatable" on user_tier_badges
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- user_media_badges (written by the trigger, but keep the client path open)
create policy "own media badges insertable" on user_media_badges
  for insert with check (auth.uid() = user_id);
create policy "own media badges updatable" on user_media_badges
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- referrals
create policy "referrals insertable" on referrals
  for insert with check (true);

create or replace function handle_generation_job_completed() returns trigger as $$
begin
  if new.status = 'completed'
     and (tg_op = 'INSERT' or old.status is distinct from 'completed') then
    insert into user_media_badges (user_id, media, generations_count, earned_at)
    values (new.user_id, new.media_type, 1, null)
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
  after insert or update on generation_jobs
  for each row execute function handle_generation_job_completed();
