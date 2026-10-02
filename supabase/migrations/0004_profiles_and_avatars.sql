-- ============================================================
-- Bidou AI — profiles, avatars storage bucket, and policies
-- ============================================================

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true) on conflict (id) do update set public = true;

create policy "avatar upload own folder" on storage.objects
  for insert with check (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatar update own folder" on storage.objects
  for update using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatar public read" on storage.objects
  for select using (bucket_id = 'avatars');
