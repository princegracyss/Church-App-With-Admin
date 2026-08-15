-- Migration 033: get_members_by_bcc RPC
--
-- WHY
-- ───
-- The MemberList screen in admin view, when opened from a BCC unit, calls
-- getMembers({ bccUnit }) which previously filtered on members.basic_christian_community
-- alone. But the authoritative BCC assignment lives on the FAMILY row
-- (families.basic_christian_community), not on individual member rows.
-- Members created via the normal Add Member flow only set the BCC on the member
-- row optionally, so most members would never appear in the unit list.
--
-- PostgREST's .or() filter cannot reliably span a joined table column, so
-- the fix is a security-definer RPC that does the correct SQL JOIN + OR:
--   member.basic_christian_community = p_bcc_unit
--   OR their linked family's basic_christian_community = p_bcc_unit
--
-- Returns all columns from the members table, ordered by first_name.
-- Optional p_search does a case-insensitive partial match across
-- first_name, last_name, member_number, and mobile.

create or replace function get_members_by_bcc(
  p_bcc_unit text,
  p_search   text default ''
)
returns setof members
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select m.*
  from   members m
  left   join families f on f.id = m.family_id
  where  (
           m.basic_christian_community = p_bcc_unit
           or f.basic_christian_community = p_bcc_unit
         )
  and (
    p_search = ''
    or m.first_name    ilike '%' || p_search || '%'
    or m.last_name     ilike '%' || p_search || '%'
    or m.member_number ilike '%' || p_search || '%'
    or m.mobile        ilike '%' || p_search || '%'
  )
  order by m.first_name;
$$;

grant execute on function get_members_by_bcc(text, text) to authenticated;
