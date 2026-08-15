-- Migration 035: scope BCC_UNIT notifications in get_my_notifications
--
-- WHY
-- ───
-- Migration 034 introduced LITURGY notifications with target = 'BCC_UNIT'.
-- The previous get_my_notifications RPC showed ALL non-WISH notifications
-- to every user — a BCC_UNIT notification for "St. Antony Unit" would appear
-- in every member's notifications tab, not just that unit's members.
--
-- This migration replaces get_my_notifications with a version that:
--   • Shows target='ALL' notifications to everyone (existing behaviour).
--   • Shows target='BCC_UNIT' notifications only when the caller's BCC unit
--     (from members.basic_christian_community OR families.basic_christian_community)
--     matches metadata->>'bcc_unit_name'.
--   • Staff roles (admin, super_admin, parish_priest, church_secretary) always
--     see BCC_UNIT notifications regardless of their own unit (for oversight).
--   • WISH targeting is unchanged.

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
  caller as (
    select auth.uid() as uid
  ),
  caller_profile as (
    select member_id, role
    from   profiles
    where  id = (select uid from caller)
    limit  1
  ),
  -- Resolve caller's BCC unit: member-level first, then family-level fallback.
  caller_bcc as (
    select coalesce(
      m.basic_christian_community,
      f.basic_christian_community
    ) as bcc_unit
    from   caller_profile cp
    left   join members  m on m.id  = cp.member_id
    left   join families f on f.id  = m.family_id
  ),
  -- True if the caller is a staff role who should see all notifications.
  caller_is_staff as (
    select (cp.role in ('super_admin','admin','parish_priest','church_secretary')) as is_staff
    from   caller_profile cp
  ),
  dismissed as (
    select notification_id
    from   notification_dismissals
    where  user_id = (select uid from caller)
  ),
  read_ids as (
    select notification_id
    from   notification_reads
    where  user_id = (select uid from caller)
  ),
  -- Broadcast and BCC-unit-targeted notifications (non-WISH).
  broadcasts as (
    select n.*
    from   notifications n
    cross  join caller_bcc  cb
    cross  join caller_is_staff cs
    where  n.type <> 'WISH'
    and    (n.expires_at is null or n.expires_at > now())
    and    n.id not in (select notification_id from dismissed)
    and    (
             -- Regular broadcasts go to everyone.
             n.target = 'ALL'
             -- BCC_UNIT notifications: staff see all; others only see their unit.
             or (
               n.target = 'BCC_UNIT'
               and (
                 cs.is_staff = true
                 or cb.bcc_unit is not null
                    and cb.bcc_unit = n.metadata->>'bcc_unit_name'
               )
             )
           )
  ),
  -- WISH notifications targeted to this user (non-dismissed).
  wishes as (
    select n.*
    from   notifications n
    join   caller_profile cp on cp.member_id is not null
    where  n.type   = 'WISH'
    and    n.target = 'MEMBER'
    and    n.target_id = cp.member_id
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
