-- ============================================================
-- Migration 005 — Birthday lookup RPC
-- Fixes: "operator does not exist: date ~~* unknown"
-- The date_of_birth column is a Postgres DATE type. The JS
-- client's .ilike() filter emits the ~~* operator which only
-- works on text/varchar — not on date. This RPC casts
-- date_of_birth to text server-side and does the MM-DD match
-- there, avoiding the type error entirely.
-- Safe to re-run (create or replace).
-- ============================================================

create or replace function get_todays_birthdays(
  p_month     int,
  p_day       int,
  p_family_id uuid default null   -- null = all parish (staff); non-null = family only
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
      -- cast to text so we can match the -MM-DD suffix safely
      and to_char(m.date_of_birth, 'MM-DD') = lpad(p_month::text, 2, '0') || '-' || lpad(p_day::text, 2, '0')
      and (p_family_id is null or m.family_id = p_family_id);
end;
$$;

-- Authenticated users (members + staff) can call this.
grant execute on function get_todays_birthdays(int, int, uuid) to authenticated;
