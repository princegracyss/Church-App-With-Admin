-- Migration 020: Notification expiry + get_my_member_profile RPC
--
-- FIX 1 — Birthday notification expiry
-- ─────────────────────────────────────
-- BIRTHDAY notifications currently persist forever. They should automatically
-- disappear after the birthday day ends. We add an `expires_at` column to the
-- notifications table. BirthdayContext sets it to end-of-day (23:59:59 UTC of
-- the birthday date) when inserting. getNotifications() filters out expired rows.
--
-- FIX 2 — Member profile RPC (family details always available)
-- ─────────────────────────────────────────────────────────────
-- getMyProfile() queries the members table directly via Supabase client.
-- This hits the RLS policies (members_family_select, members_self_select).
-- If migration 018 (members_self_select) has not been applied yet, or
-- profiles.member_id is not linked, the query returns nothing and the Family
-- screen shows "No family record linked".
--
-- get_my_member_profile() is a SECURITY DEFINER RPC that resolves the member
-- row for the currently authenticated user by reading profiles.member_id
-- server-side — completely bypassing RLS — so it always works regardless of
-- which RLS policies are in effect.
--
-- Apply after migrations 001-019.

-- ── FIX 1: expires_at column on notifications ─────────────────────────────────
alter table notifications add column if not exists expires_at timestamptz;

-- ── FIX 2: get_my_member_profile RPC ─────────────────────────────────────────
create or replace function get_my_member_profile()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
  v_member    json;
begin
  -- Resolve member_id from the caller's profile row.
  select member_id into v_member_id
  from profiles
  where id = auth.uid()
  limit 1;

  if v_member_id is null then
    return null;
  end if;

  select row_to_json(m) into v_member
  from members m
  where m.id = v_member_id;

  return v_member;
end;
$$;

grant execute on function get_my_member_profile() to authenticated;
