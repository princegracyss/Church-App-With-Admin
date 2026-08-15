-- Migration 019: member-photos storage bucket
--
-- Members can upload and replace their own profile photo.
-- Photos are stored at: member-photos/<member_uuid>/photo.<ext>
-- The bucket is public so photo URLs work without auth tokens.
--
-- RLS policies:
--   Read   — anyone (anon): photo URLs must render without login
--   Insert — authenticated member: only their own folder (<member_uuid>/*)
--   Update — authenticated member: only their own folder
--   Delete — authenticated member: only their own folder
--            Admins can also delete any photo.
--
-- Apply after migrations 001-018.

do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'member-photos',
    'member-photos',
    true,
    5242880,   -- 5 MB
    array['image/jpeg','image/png','image/webp']
  )
  on conflict (id) do nothing;
end $$;

-- ── Storage policies ──────────────────────────────────────────────────────────

-- 1. Public read — photo URLs work in <Image> without auth.
drop policy if exists "member_photos_public_read" on storage.objects;
create policy "member_photos_public_read" on storage.objects
  for select
  using (bucket_id = 'member-photos');

-- 2. Member self-insert — authenticated user can upload into their own member folder.
--    Path format: <member_uuid>/photo.<ext>
--    We verify the first path segment matches the member_id in the caller's profile.
drop policy if exists "member_photos_self_insert" on storage.objects;
create policy "member_photos_self_insert" on storage.objects
  for insert
  with check (
    bucket_id = 'member-photos'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = (
      select member_id::text from public.profiles
      where profiles.id = auth.uid()
      limit 1
    )
  );

-- 3. Member self-update (upsert / overwrite their existing photo).
drop policy if exists "member_photos_self_update" on storage.objects;
create policy "member_photos_self_update" on storage.objects
  for update
  using (
    bucket_id = 'member-photos'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = (
      select member_id::text from public.profiles
      where profiles.id = auth.uid()
      limit 1
    )
  );

-- 4. Member self-delete + admin delete.
drop policy if exists "member_photos_self_delete" on storage.objects;
create policy "member_photos_self_delete" on storage.objects
  for delete
  using (
    bucket_id = 'member-photos'
    and (
      -- Member deletes their own photo
      (storage.foldername(name))[1] = (
        select member_id::text from public.profiles
        where profiles.id = auth.uid()
        limit 1
      )
      -- OR admin deletes any photo
      or exists (
        select 1 from public.profiles
        where profiles.id = auth.uid()
          and profiles.role in ('super_admin','parish_priest','admin','church_secretary')
      )
    )
  );
