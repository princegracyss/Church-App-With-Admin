-- Migration 014: Security-definer RPC for targeted push tokens + notification delete policies
--
-- 1. get_push_tokens_for_member(p_member_id)
--    Returns the Expo push tokens for all user accounts linked to a given
--    member_id.  Runs with SECURITY DEFINER so any authenticated caller
--    (including plain members sending birthday wishes) can resolve tokens
--    without the push_tokens table being fully world-readable.
--    Supersedes the broad push_tokens_member_read policy from migration 013.
--
-- 2. notifications_admin_delete
--    Allows staff (admin / super_admin / parish_priest / church_secretary)
--    to delete notification rows so the "Clear All" feature in the
--    Notifications screen works.
--
-- Apply after migrations 001-013.

-- ── 1. Drop the overly-broad read policy added in migration 013 ───────────────
-- That policy allowed ALL authenticated users to read ALL push tokens which is
-- unnecessary now that we use a security-definer RPC.
drop policy if exists "push_tokens_member_read" on push_tokens;

-- ── 2. Security-definer RPC: tokens for a specific member ─────────────────────
create or replace function get_push_tokens_for_member(p_member_id uuid)
returns table (token text)
language sql
security definer
stable
as $$
  select pt.token
  from push_tokens pt
  inner join profiles p on p.id = pt.user_id
  where p.member_id = p_member_id
    and pt.token is not null;
$$;

-- Grant execute to authenticated users so members can send birthday-wish pushes.
grant execute on function get_push_tokens_for_member(uuid) to authenticated;

-- ── 3. Allow staff to delete notifications (for "Clear All") ──────────────────
drop policy if exists "notifications_admin_delete" on notifications;
create policy "notifications_admin_delete" on notifications
  for delete
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super_admin', 'parish_priest', 'admin', 'church_secretary')
    )
  );

-- ── 4. notification_reads: unique constraint so upsert works reliably ──────────
-- The upsert in markAllNotificationsRead / markNotificationRead uses
-- onConflict: 'notification_id,user_id' — a unique constraint is required.
alter table notification_reads
  drop constraint if exists notification_reads_notification_id_user_id_key;
alter table notification_reads
  add constraint notification_reads_notification_id_user_id_key
  unique (notification_id, user_id);
