-- Migration 006: Birthday wish notifications
-- Adds a metadata JSONB column to `notifications` so WISH notifications
-- can carry song_url, sender_name, wish_message, and birthday_member_id.
-- Also adds a WISH insert policy so any authenticated (or anon via guest RPC)
-- user can insert a WISH notification targeted to a specific member.
--
-- Apply on an existing DB that already has migrations 001-005.
-- schema.sql is kept in sync separately.

-- 1. Add metadata column (idempotent).
alter table notifications add column if not exists metadata jsonb;

-- 2. Allow any authenticated user to insert a WISH notification.
--    (The existing `notifications_birthday_insert` policy covers type='BIRTHDAY'.
--     We add a peer policy for type='WISH'.)
drop policy if exists "notifications_wish_insert" on notifications;
create policy "notifications_wish_insert" on notifications for insert
  with check (auth.uid() is not null and type = 'WISH');

-- 3. Allow anon role to insert WISH notifications (supports guest mode).
drop policy if exists "notifications_wish_insert_anon" on notifications;
create policy "notifications_wish_insert_anon" on notifications for insert
  with check (type = 'WISH');

-- 4. Allow everyone (incl. anon) to read notifications so guest members
--    can see wishes sent to them.  The existing read policy already requires
--    auth.uid() is not null — we extend to cover anon reads of WISH rows.
drop policy if exists "notifications_wish_read_anon" on notifications;
create policy "notifications_wish_read_anon" on notifications for select
  using (type = 'WISH');
