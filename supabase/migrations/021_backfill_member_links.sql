-- Migration 021: Back-fill profiles.member_id for existing unlinked accounts
--
-- WHY THIS IS NEEDED
-- ──────────────────
-- profiles.member_id is NULL for many existing accounts because:
--
--   1. Email/password accounts created via create-parish-user Edge Function
--      only link a member_id if the admin explicitly provided one at creation
--      time — many were created without it.
--
--   2. Phone OTP accounts auto-link via the handle_new_phone_user trigger, but
--      only if members.mobile exactly matches in E.164 format. Any format
--      mismatch (e.g. local format vs E.164) leaves member_id = NULL.
--
--   3. Email OTP accounts: migration 017 added a trigger for new signups, but
--      it does not back-fill profiles that already exist.
--
-- WHAT THIS DOES
-- ──────────────
-- Step 1 — match by phone:
--   For each profile whose member_id is NULL, look for a members row whose
--   mobile matches auth.users.phone. Updates profiles.member_id.
--
-- Step 2 — match by email:
--   For remaining unlinked profiles, look for a members row whose email
--   matches auth.users.email (case-insensitive). Updates profiles.member_id.
--
-- Both steps are idempotent — they only set member_id where it is currently
-- NULL, never overwriting an existing link.
--
-- Step 3 — link_member_to_profile(p_profile_id, p_member_id) RPC:
--   Admins can call this from the app to manually link any profile that
--   still has no member_id after the auto-matching above (e.g. the phone/
--   email in members doesn't match what was used for login).
--
-- Apply after migrations 001-020.

-- ── Step 1: back-fill by phone ────────────────────────────────────────────────
update profiles p
set member_id = m.id
from auth.users u
join members m on m.mobile = u.phone
where p.id = u.id
  and p.member_id is null
  and u.phone is not null
  and u.phone <> '';

-- ── Step 2: back-fill by email ────────────────────────────────────────────────
update profiles p
set member_id = m.id
from auth.users u
join members m on lower(m.email) = lower(u.email)
where p.id = u.id
  and p.member_id is null
  and u.email is not null
  and u.email <> '';

-- ── Step 3: admin RPC to manually link a profile to a member ─────────────────
-- Admins call this from the Manage Users screen when auto-matching failed.
-- Uses SECURITY DEFINER + caller role check so only staff can run it.
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

  update profiles
  set member_id = p_member_id
  where id = p_profile_id;
end;
$$;

grant execute on function link_member_to_profile(uuid, uuid) to authenticated;
