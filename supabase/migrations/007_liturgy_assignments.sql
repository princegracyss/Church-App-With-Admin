-- Migration 007: Liturgy Assignments
-- Allows a Parish Priest (or admin) to assign a BCC unit to host the
-- liturgy (Mass / prayer service) on a specific date.
--
-- Each row records:
--   bcc_unit_id   – which unit is responsible
--   bcc_unit_name – denormalised name (snapshot at assignment time; survives unit renames)
--   liturgy_date  – the date of the liturgy (DATE, not timestamptz)
--   notes         – optional description / theme
--   assigned_by   – profiles.id of the priest who made the assignment
--   created_at    – when the assignment was created
--
-- Notification strategy (handled in-app, see LiturgyContext.js):
--   On CREATE  → a 'LITURGY' broadcast notification is sent to ALL
--                (all unit members will see it in Notifications screen).
--   On LOAD    → if liturgy_date = today, a 'LITURGY_REMINDER' notification
--                is inserted (idempotent, deduped by title) so members get
--                an in-app reminder when they open the app that day.
-- Apply on an existing database (safe to re-run).

-- 1. Table
create table if not exists liturgy_assignments (
  id            uuid primary key default uuid_generate_v4(),
  bcc_unit_id   uuid references bcc_units(id) on delete set null,
  bcc_unit_name text not null,
  liturgy_date  date not null,
  notes         text,
  assigned_by   uuid references profiles(id) on delete set null,
  created_at    timestamptz default now()
);

-- 2. Row Level Security
alter table liturgy_assignments enable row level security;

-- Any signed-in user can read all assignments (needed for member view).
drop policy if exists "liturgy_read" on liturgy_assignments;
create policy "liturgy_read" on liturgy_assignments
  for select using (auth.uid() is not null);

-- Only staff (parish_priest, admin, super_admin, church_secretary) can
-- create / update / delete assignments.
drop policy if exists "liturgy_staff_write" on liturgy_assignments;
create policy "liturgy_staff_write" on liturgy_assignments
  for all using (is_admin()) with check (is_admin());

-- 3. Extend the notifications type documentation comment (schema already
--    has an open-ended type column with no check constraint).
-- Canonical types added by this migration:
--   'LITURGY'          – broadcast when an assignment is created
--   'LITURGY_REMINDER' – inserted on the day of the liturgy (idempotent)
-- No ALTER needed — the type column is already text with no constraint.

-- 4. Allow any authenticated user to insert LITURGY / LITURGY_REMINDER
--    notifications (mirrors the pattern for BIRTHDAY notifications).
drop policy if exists "notifications_liturgy_insert" on notifications;
create policy "notifications_liturgy_insert" on notifications for insert
  with check (auth.uid() is not null and type in ('LITURGY', 'LITURGY_REMINDER'));
