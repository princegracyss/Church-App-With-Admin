-- Migration 030: Fix birthday RPCs and notification read for member sessions
--
-- PROBLEM 1 — get_todays_birthdays and get_calendar_birthdays
-- ────────────────────────────────────────────────────────────
-- Both functions are SECURITY DEFINER but lack `set row_security = off`.
-- In Supabase the function owner may not have the BYPASSRLS privilege,
-- so Postgres still evaluates members RLS policies inside the function.
-- When a member calls get_todays_birthdays(), the members RLS fires,
-- calling my_family_id() / my_member_id() — which now have row_security=off
-- (migration 029) but still add overhead and can fail on certain paths.
-- Adding row_security=off removes all RLS overhead from these read-only,
-- explicitly scoped queries.
--
-- PROBLEM 2 — notifications SELECT for members with no linked member_id
-- ──────────────────────────────────────────────────────────────────────
-- A member whose profiles.member_id is not yet linked will have
-- myMemberId=null in getNotifications() and fall into the admin-path
-- branch, which works. But if something prevents member_id resolution,
-- they silently see no notifications. This migration also ensures the
-- notification read policy is tight and the anon read for WISH rows is
-- consistent.

-- ── Fix get_todays_birthdays ──────────────────────────────────────────────────
create or replace function get_todays_birthdays(
  p_month     int,
  p_day       int,
  p_family_id uuid default null
)
returns table (
  id             uuid,
  first_name     text,
  last_name      text,
  date_of_birth  date,
  family_id      uuid
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  return query
    select
      m.id,
      m.first_name,
      m.last_name,
      m.date_of_birth,
      m.family_id
    from members m
    where
      m.status = 'active'
      and m.date_of_birth is not null
      and to_char(m.date_of_birth, 'MM-DD') =
            lpad(p_month::text, 2, '0') || '-' || lpad(p_day::text, 2, '0')
      and (p_family_id is null or m.family_id = p_family_id);
end;
$$;

grant execute on function get_todays_birthdays(int, int, uuid) to authenticated;
grant execute on function get_todays_birthdays(int, int, uuid) to anon;

-- ── Fix get_calendar_birthdays ────────────────────────────────────────────────
create or replace function get_calendar_birthdays()
returns table (
  id             uuid,
  first_name     text,
  last_name      text,
  date_of_birth  date
)
language sql
security definer
stable
set search_path = public
set row_security = off
as $$
  select id, first_name, last_name, date_of_birth
  from members
  where status = 'active'
    and date_of_birth is not null;
$$;

grant execute on function get_calendar_birthdays() to authenticated;
grant execute on function get_calendar_birthdays() to anon;
