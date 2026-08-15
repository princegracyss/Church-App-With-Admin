-- ============================================================
-- Migration 023 — Improved link_member_to_profile RPC +
--                 get_profile_by_member_id RPC
--
-- CHANGE 1: link_member_to_profile now clears any stale link
-- ─────────────────────────────────────────────────────────────
-- Previously, if member X was already linked to profile A and
-- an admin linked member X to profile B instead, profile A kept
-- member_id = X. This left two profiles pointing at the same
-- member row, which could corrupt family lookups and self-edit.
-- The updated RPC now:
--   1. Clears member_id on any OTHER profile that already points
--      to p_member_id (so there is always at most one profile per
--      member).
--   2. Then sets member_id = p_member_id on p_profile_id.
--
-- CHANGE 2: get_profile_by_member_id RPC
-- ─────────────────────────────────────────────────────────────
-- MemberProfileScreen (admin view) calls this to display which
-- login account is linked to a member. Running as SECURITY
-- DEFINER avoids depending on the profiles_self_select RLS
-- policy, which could behave differently across role variants.
-- Returns id, username, role, is_active — or NULL if no profile
-- is linked to that member yet.
--
-- Apply after migrations 001-022.
-- ============================================================

-- ── CHANGE 1: updated link_member_to_profile ─────────────────────────────
create or replace function link_member_to_profile(
  p_profile_id uuid,
  p_member_id  uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only staff may call this.
  if not exists (
    select 1 from profiles
    where id = auth.uid()
      and role in ('super_admin','admin','parish_priest','church_secretary')
  ) then
    raise exception 'Permission denied: staff role required.';
  end if;

  -- Clear any stale link: another profile already points to this member.
  update profiles
  set member_id = null
  where member_id = p_member_id
    and id <> p_profile_id;

  -- Set the new link.
  update profiles
  set member_id = p_member_id
  where id = p_profile_id;
end;
$$;

grant execute on function link_member_to_profile(uuid, uuid) to authenticated;

-- ── CHANGE 2: get_profile_by_member_id RPC ───────────────────────────────
create or replace function get_profile_by_member_id(p_member_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result json;
begin
  -- Only staff may call this.
  if not exists (
    select 1 from profiles
    where id = auth.uid()
      and role in ('super_admin','admin','parish_priest','church_secretary')
  ) then
    raise exception 'Permission denied: staff role required.';
  end if;

  select row_to_json(p) into v_result
  from (
    select id, username, role, is_active
    from profiles
    where member_id = p_member_id
    limit 1
  ) p;

  return v_result;
end;
$$;

grant execute on function get_profile_by_member_id(uuid) to authenticated;
