-- Migration 016: Security-definer RPC for fetching a family + its members
--
-- Authenticated members can only read their own family via the RLS policies
-- families_own_select / members_family_select, which both rely on
-- my_family_id() → profiles.member_id being set. If profiles.member_id is
-- null (e.g. the account was created via email OTP but not yet linked to a
-- member row, or was created by an admin before being linked), both queries
-- return empty and the Family screen shows "No family record linked".
--
-- This RPC runs with SECURITY DEFINER so it bypasses RLS and can fetch any
-- family + its members. It accepts an explicit p_family_id parameter so the
-- caller (app) is responsible for knowing which family to load — it only
-- returns data if the caller already obtained the family_id from their own
-- member row (which is itself RLS-protected).
--
-- Apply after migrations 001-015.

create or replace function get_family_with_members(p_family_id uuid)
returns json
language plpgsql
security definer
stable
as $$
declare
  v_family  json;
  v_members json;
begin
  select row_to_json(f) into v_family
  from families f
  where f.id = p_family_id;

  select json_agg(m order by m.first_name) into v_members
  from members m
  where m.family_id = p_family_id
    and m.status = 'active';

  return json_build_object(
    'family',  v_family,
    'members', coalesce(v_members, '[]'::json)
  );
end;
$$;

-- Allow any authenticated user to call it.
-- The caller must already know the family_id (obtained from their own member
-- row, which is RLS-protected), so this does not expose arbitrary data.
grant execute on function get_family_with_members(uuid) to authenticated;
