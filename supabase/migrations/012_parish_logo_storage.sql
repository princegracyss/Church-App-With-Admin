-- Migration 012: Supabase Storage bucket for parish assets
--
-- Creates a `parish-assets` bucket that holds the parish logo.
-- The logo is stored at the fixed path: parish/logo.jpg
-- (overwritten on every upload so there's always one canonical URL)
--
-- RLS:
--   • Anyone (anon) can read  — logo must be visible without login
--   • Only admins can upload / delete

-- Enable storage extension (no-op if already enabled).
-- Storage is enabled by default in hosted Supabase; this is a safety guard.
do $$
begin
  -- Create the bucket if it doesn't exist.
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'parish-assets',
    'parish-assets',
    true,                        -- public bucket so image URLs work without auth
    2097152,                     -- 2 MB file size limit
    array['image/jpeg','image/png','image/webp','image/gif']
  )
  on conflict (id) do nothing;
end $$;

-- ── Storage policies ──────────────────────────────────────────────────────────

-- 1. Public read — anyone can view the logo URL.
drop policy if exists "parish_assets_public_read" on storage.objects;
create policy "parish_assets_public_read" on storage.objects
  for select
  using (bucket_id = 'parish-assets');

-- 2. Admin upload — only admins can upload or replace files.
drop policy if exists "parish_assets_admin_insert" on storage.objects;
create policy "parish_assets_admin_insert" on storage.objects
  for insert
  with check (
    bucket_id = 'parish-assets'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super_admin','parish_priest','admin','church_secretary')
    )
  );

-- 3. Admin update (upsert / overwrite).
drop policy if exists "parish_assets_admin_update" on storage.objects;
create policy "parish_assets_admin_update" on storage.objects
  for update
  using (
    bucket_id = 'parish-assets'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super_admin','parish_priest','admin','church_secretary')
    )
  );

-- 4. Admin delete.
drop policy if exists "parish_assets_admin_delete" on storage.objects;
create policy "parish_assets_admin_delete" on storage.objects
  for delete
  using (
    bucket_id = 'parish-assets'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super_admin','parish_priest','admin','church_secretary')
    )
  );
