-- Migration 017: Auto-link profiles for email-OTP members
--
-- The existing handle_new_phone_user() trigger only runs when new.phone is
-- not null (phone OTP logins). Members who sign in via email OTP get a new
-- auth.users row with only an email — no trigger fires, so no profiles row
-- is created and profiles.member_id stays null. This causes the app to show
-- "No family record linked" for those members.
--
-- This migration adds:
--   1. handle_new_email_user() trigger — fires on auth.users INSERT when
--      the new row has an email but no phone. Matches against members.email,
--      creates a profiles row with role='member' and member_id linked.
--
--   2. link_profile_to_member(p_user_id, p_member_id) RPC — called by the
--      app immediately after email OTP verification to upsert the profiles
--      row with the correct member_id. Handles the case where the trigger
--      already ran but member_id is still null (e.g. email not on file), as
--      well as re-running the link for previously unlinked accounts.
--
-- Apply after migrations 001-016.

-- ── 1. Email-based auto-provisioning trigger ──────────────────────────────────
create or replace function handle_new_email_user() returns trigger as $$
declare
  matched_member_id uuid;
begin
  -- Only handle pure email signups (phone OTP is handled by handle_new_phone_user).
  if new.email is not null and (new.phone is null or new.phone = '') then
    select id into matched_member_id
    from members
    where lower(email) = lower(new.email)
      and status = 'active'
    limit 1;

    insert into profiles (id, username, role, member_id, is_active)
    values (new.id, new.email, 'member', matched_member_id, true)
    on conflict (id) do update
      set member_id = coalesce(profiles.member_id, excluded.member_id);
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created_email on auth.users;
create trigger on_auth_user_created_email
  after insert on auth.users
  for each row execute function handle_new_email_user();

-- ── 2. RPC to link a profile to a member after OTP verification ───────────────
-- The app calls this after email OTP verify, passing the member_id that was
-- resolved during the lookup step. Uses SECURITY DEFINER so it can write to
-- profiles even though the normal member RLS doesn't allow self-update of
-- member_id (to prevent privilege escalation — only this trusted path can set it).
create or replace function link_profile_to_member(p_user_id uuid, p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only update if member_id is not already set (prevents a malicious caller
  -- from overwriting a legitimately linked account with a different member_id).
  update profiles
  set member_id = p_member_id
  where id = p_user_id
    and member_id is null;
end;
$$;

-- Only authenticated users can call this (they must already be signed in).
grant execute on function link_profile_to_member(uuid, uuid) to authenticated;
