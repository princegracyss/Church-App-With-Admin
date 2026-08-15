-- ============================================================
-- Migration 002 — Allow any authenticated user to insert BIRTHDAY notifications
-- Required so the birthday check works for plain member logins (not just admins).
-- Safe to re-run.
-- ============================================================

drop policy if exists "notifications_birthday_insert" on notifications;
create policy "notifications_birthday_insert" on notifications for insert
  with check (auth.uid() is not null and type = 'BIRTHDAY');
