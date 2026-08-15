-- Migration 032: get_my_notifications RPC
--
-- WHY
-- ───
-- The previous client-side approach fetched notifications, notification_reads,
-- and notification_dismissals in three separate round-trips and joined them in
-- JavaScript. If any of the three queries failed or returned unexpected data
-- (e.g. due to an RLS edge-case, a missing row, or a network hiccup), the
-- dismissed/read state was silently wrong — dismissed notifications reappeared.
--
-- This RPC does everything in one server-side query:
--   • Broadcasts (non-WISH, not expired, not dismissed by this user)
--   • WISH rows targeted to this user (not dismissed)
--   • read flag annotated from notification_reads
-- Returns rows sorted by created_at DESC. Security-definer + row_security=off
-- so it bypasses all RLS policies that could previously cause recursion.
--
-- Return shape matches the notifications table columns plus:
--   read  boolean  — true if a notification_reads row exists for this user

create or replace function get_my_notifications()
returns table (
  id           uuid,
  title        text,
  message      text,
  type         text,
  target       text,
  target_id    uuid,
  created_by   uuid,
  created_at   timestamptz,
  metadata     jsonb,
  expires_at   timestamptz,
  read         boolean
)
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  with
  -- The caller's auth.users id (works inside row_security=off).
  caller as (
    select auth.uid() as uid
  ),
  -- The caller's member_id (for WISH targeting).
  caller_member as (
    select member_id
    from   profiles
    where  id = (select uid from caller)
    limit  1
  ),
  -- IDs the caller has dismissed.
  dismissed as (
    select notification_id
    from   notification_dismissals
    where  user_id = (select uid from caller)
  ),
  -- IDs the caller has read.
  read_ids as (
    select notification_id
    from   notification_reads
    where  user_id = (select uid from caller)
  ),
  -- Broadcast notifications (all non-WISH, non-expired, non-dismissed).
  broadcasts as (
    select n.*
    from   notifications n
    where  n.type <> 'WISH'
    and    (n.expires_at is null or n.expires_at > now())
    and    n.id not in (select notification_id from dismissed)
  ),
  -- WISH notifications targeted to this user (non-dismissed).
  wishes as (
    select n.*
    from   notifications n
    join   caller_member cm on cm.member_id is not null
    where  n.type   = 'WISH'
    and    n.target = 'MEMBER'
    and    n.target_id = cm.member_id
    and    n.id not in (select notification_id from dismissed)
  )
  select
    n.id,
    n.title,
    n.message,
    n.type,
    n.target,
    n.target_id,
    n.created_by,
    n.created_at,
    n.metadata,
    n.expires_at,
    (n.id in (select notification_id from read_ids)) as read
  from (
    select * from broadcasts
    union all
    select * from wishes
  ) n
  order by n.created_at desc;
$$;

grant execute on function get_my_notifications() to authenticated;
