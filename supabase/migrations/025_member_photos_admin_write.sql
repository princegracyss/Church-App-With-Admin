-- Migration 025: allow admin/staff to upload photos for any member
--
-- Migration 019 created storage policies that restrict INSERT/UPDATE on the
-- member-photos bucket to a member's own folder only. This blocks admins from
-- uploading a photo for a different member. This migration replaces those two
-- policies to additionally allow any staff role (super_admin, admin,
-- parish_priest, church_secretary) to write to any member folder.

-- ── INSERT ────────────────────────────────────────────────────────────────────
drop policy if exists "member_photos_self_insert" on storage.objects;
create policy "member_photos_self_insert" on storage.objects
  for insert
  with check (
    bucket_id = 'member-photos'
    and auth.uid() is not null
    and (
      -- Member uploads to their own folder
      (storage.foldername(name))[1] = (
        select member_id::text from public.profiles
        where profiles.id = auth.uid()
        limit 1
      )
      -- OR staff uploads to any member folder
      or exists (
        select 1 from public.profiles
        where profiles.id = auth.uid()
          and profiles.role in ('super_admin','admin','parish_priest','church_secretary')
      )
    )
  );

-- ── UPDATE (upsert / overwrite) ───────────────────────────────────────────────
drop policy if exists "member_photos_self_update" on storage.objects;
create policy "member_photos_self_update" on storage.objects
  for update
  using (
    bucket_id = 'member-photos'
    and auth.uid() is not null
    and (
      -- Member updates their own folder
      (storage.foldername(name))[1] = (
        select member_id::text from public.profiles
        where profiles.id = auth.uid()
        limit 1
      )
      -- OR staff updates any member folder
      or exists (
        select 1 from public.profiles
        where profiles.id = auth.uid()
          and profiles.role in ('super_admin','admin','parish_priest','church_secretary')
      )
    )
  );
