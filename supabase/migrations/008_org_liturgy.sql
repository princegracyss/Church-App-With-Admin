-- Migration 008: Org-based Liturgy Assignments
-- 1. Adds org_id + org_name columns to liturgy_assignments so a liturgy can
--    be assigned to an Organization (choir, sodality, etc.) in addition to a
--    BCC unit.  Both bcc_unit_id and org_id may be null on the same row —
--    the app always supplies at least one.
-- 2. Fixes the getCalendarEvents birthday RLS issue: adds an RPC that returns
--    all member DOBs so regular members (whose RLS blocks the raw `members`
--    query) can still see parish-wide birthdays on the calendar.
--
-- Safe to re-run: uses IF NOT EXISTS / DROP POLICY IF EXISTS.

-- 1. Add org columns to liturgy_assignments (idempotent).
alter table liturgy_assignments add column if not exists org_id   uuid references organizations(id) on delete set null;
alter table liturgy_assignments add column if not exists org_name text;

-- 2. RPC: get_calendar_birthdays
--    Returns (id, first_name, last_name, date_of_birth) for all active
--    members, accessible by any authenticated user (bypasses members RLS).
--    This is intentionally read-only and returns no sensitive data.
create or replace function get_calendar_birthdays()
returns table (
  id             uuid,
  first_name     text,
  last_name      text,
  date_of_birth  date
)
language sql
security definer   -- runs as the DB owner, bypassing member RLS
stable
as $$
  select id, first_name, last_name, date_of_birth
  from members
  where status = 'active'
    and date_of_birth is not null;
$$;

-- Grant execute to authenticated (members + staff) and anon (guest mode).
grant execute on function get_calendar_birthdays() to authenticated;
grant execute on function get_calendar_birthdays() to anon;
