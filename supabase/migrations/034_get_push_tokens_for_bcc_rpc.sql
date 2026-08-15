-- Migration 034: get_push_tokens_for_bcc RPC
--
-- WHY
-- ───
-- When a liturgy is assigned to a BCC unit, the push notification should
-- go ONLY to members of that unit — not to the entire parish.
--
-- BCC is stored on the family row (families.basic_christian_community) as the
-- primary source of truth, but may also be set directly on the member row
-- (members.basic_christian_community). This RPC mirrors the OR logic from
-- migration 033 (get_members_by_bcc) to collect push tokens for both cases:
--
--   member.basic_christian_community = p_bcc_unit
--   OR their linked family's basic_christian_community = p_bcc_unit
--
-- Token lookup chain:
--   push_tokens → profiles (user_id = profiles.id)
--              → members   (profiles.member_id = members.id)
--              → families  (members.family_id  = families.id)
--
-- An optional p_exclude_user_id skips tokens belonging to a specific
-- auth.users id (used to exclude the admin who just created the assignment).

create or replace function get_push_tokens_for_bcc(
  p_bcc_unit        text,
  p_exclude_user_id uuid default null
)
returns table (token text)
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select distinct pt.token
  from   push_tokens pt
  join   profiles    pr on pr.id         = pt.user_id
  join   members     m  on m.id          = pr.member_id
  left   join families f  on f.id        = m.family_id
  where  pt.token is not null
  and    (
           m.basic_christian_community = p_bcc_unit
           or f.basic_christian_community = p_bcc_unit
         )
  and    (p_exclude_user_id is null or pt.user_id <> p_exclude_user_id);
$$;

grant execute on function get_push_tokens_for_bcc(text, uuid) to authenticated;
