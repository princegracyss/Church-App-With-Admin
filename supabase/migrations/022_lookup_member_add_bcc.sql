-- ============================================================
-- Migration 022 — Add basic_christian_community to lookup_member_for_login
--
-- The guest-mode member row stored in _guestMember was missing
-- basic_christian_community because the RPC didn't return it.
-- This caused birthday wishes sent by guests (and any member
-- whose profile is not yet linked) to show "A parish member"
-- as the sender unit in the WishModal.
--
-- Must DROP first because the return type (OUT columns) changed.
-- ============================================================

drop function if exists lookup_member_for_login(text, text);

create or replace function lookup_member_for_login(
  p_identifier text,
  p_member_id  text default null
)
returns table (
  id                       uuid,
  first_name               text,
  last_name                text,
  member_number            text,
  mobile                   text,
  email                    text,
  basic_christian_community text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trimmed text := trim(p_identifier);
  v_mid     text := trim(coalesce(p_member_id, ''));
begin
  return query
    select
      m.id,
      m.first_name,
      m.last_name,
      m.member_number,
      m.mobile,
      m.email,
      m.basic_christian_community
    from members m
    where
      m.status = 'active'
      and (
        m.mobile          =  v_trimmed
        or lower(m.email) =  lower(v_trimmed)
        or lower(m.member_number) = lower(v_trimmed)
      )
      and (v_mid = '' or lower(m.member_number) = lower(v_mid));
end;
$$;

grant execute on function lookup_member_for_login(text, text) to anon;
