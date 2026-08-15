-- Migration 010: Parish Settings table
-- Stores a single row of parish-wide configuration that all app instances
-- read on boot and subscribe to via Supabase Realtime.  When an admin
-- updates settings, every running app instance receives the change
-- immediately through the realtime channel — no restart needed.
--
-- Design: a single fixed row (id = 1) avoids needing to decide which row
-- is "current".  UPSERT on id=1 is the only write pattern used.

create table if not exists parish_settings (
  id              int primary key default 1,   -- always 1, single-row table
  name            text,
  description     text,
  logo_uri        text,
  primary_color   text default '#6B1E3C',
  secondary_color text default '#C9A24B',
  accent_color    text default '#2E7A4F',
  member_otp_enabled boolean default false,
  updated_at      timestamptz default now(),
  -- Constraint keeps this a single-row table.
  constraint parish_settings_singleton check (id = 1)
);

-- Seed the row so it always exists (safe if already present).
insert into parish_settings (id) values (1) on conflict (id) do nothing;

-- RLS
alter table parish_settings enable row level security;

-- Everyone (including anon / guest) can read the settings so the login
-- screen can show the parish name and colors before authentication.
drop policy if exists "parish_settings_read" on parish_settings;
create policy "parish_settings_read" on parish_settings
  for select using (true);

-- Only admins (super_admin, admin, parish_priest, church_secretary) can
-- update parish settings.
drop policy if exists "parish_settings_admin_write" on parish_settings;
create policy "parish_settings_admin_write" on parish_settings
  for all using (is_admin()) with check (is_admin());

-- Enable realtime for this table so all clients get pushed updates.
-- (Run once; safe to re-run.)
alter publication supabase_realtime add table parish_settings;
