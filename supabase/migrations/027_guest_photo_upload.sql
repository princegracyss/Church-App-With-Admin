-- Migration 027: Allow guest (anon) members to upload their own profile photo
--
-- Members who log in via the guest/lookup path have no Supabase auth session,
-- so auth.uid() is NULL and the existing member_photos_self_insert / update
-- policies (which key on profiles.member_id = auth.uid()) always block them.
--
-- Fix: add two extra storage policies that allow the anon role to
-- insert/update inside member-photos/<member_uuid>/ as long as:
--   1. The first path segment is a valid UUID that exists in the members table
--      with status = 'active'  (prevents writing to arbitrary paths)
--   2. auth.uid() IS NULL  (so authenticated sessions still use the stricter
--      self-insert policy from migration 025)
--
-- Also add a guest_update_member_photo() security-definer RPC so the app can
-- persist the new photo URL back to the members row without an auth session.

-- ── Storage: anon insert into a valid member folder ───────────────────────────
drop policy if exists "member_photos_anon_insert" on storage.objects;
create policy "member_photos_anon_insert" on storage.objects
  for insert
  with check (
    bucket_id = 'member-photos'
    and auth.uid() is null
    and exists (
      select 1 from public.members
      where members.id = ((storage.foldername(name))[1])::uuid
        and members.status = 'active'
    )
  );

-- ── Storage: anon update (overwrite) inside a valid member folder ─────────────
drop policy if exists "member_photos_anon_update" on storage.objects;
create policy "member_photos_anon_update" on storage.objects
  for update
  using (
    bucket_id = 'member-photos'
    and auth.uid() is null
    and exists (
      select 1 from public.members
      where members.id = ((storage.foldername(name))[1])::uuid
        and members.status = 'active'
    )
  );

-- ── RPC: persist photo URL for a guest member ─────────────────────────────────
create or replace function guest_update_member_photo(
  p_member_id uuid,
  p_photo_url text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update members
  set photo = p_photo_url
  where id = p_member_id
    and status = 'active';
end;
$$;

grant execute on function guest_update_member_photo(uuid, text) to anon;
