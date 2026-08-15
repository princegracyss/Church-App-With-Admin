-- Migration 018: Member self-read policy + notification_dismissals table
--
-- FIX 1 — Members can read their own member row
-- ─────────────────────────────────────────────
-- The existing members_family_select policy allows reading members where
-- family_id = my_family_id(). my_family_id() itself needs profiles.member_id
-- to be set. If it is null (profile not yet linked), the function returns null
-- and the member cannot read even their own row — getMyProfile() returns null
-- and the Family screen shows "No family record linked".
--
-- Adding members_self_select lets a member ALWAYS read the single row whose
-- id matches their own profiles.member_id, regardless of family linkage.
--
-- FIX 2 — Reliable per-user notification dismissal
-- ─────────────────────────────────────────────────
-- Migration 015 added a `dismissed` column to notification_reads. If that
-- migration was not applied in time, the upsert in deleteNotifications()
-- fails silently (.catch(()=>{}) swallows the error) and the notifications
-- keep reappearing on reload.
--
-- This migration introduces a dedicated notification_dismissals table so
-- dismissal never depends on the notification_reads schema. It also adds
-- a security-definer RPC dismiss_notifications(ids) so the operation is
-- atomic and always succeeds for authenticated users.
--
-- Apply after migrations 001-017.

-- ── FIX 1: members self-select ────────────────────────────────────────────────
drop policy if exists "members_self_select" on members;
create policy "members_self_select" on members
  for select
  using (
    id = (
      select member_id from profiles
      where profiles.id = auth.uid()
      limit 1
    )
  );

-- ── FIX 2: notification_dismissals table ─────────────────────────────────────
create table if not exists notification_dismissals (
  id              uuid primary key default uuid_generate_v4(),
  notification_id uuid not null references notifications(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  dismissed_at    timestamptz not null default now(),
  unique (notification_id, user_id)
);

alter table notification_dismissals enable row level security;

-- Users can only see and manage their own dismissals.
drop policy if exists "dismissals_own" on notification_dismissals;
create policy "dismissals_own" on notification_dismissals
  for all
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Security-definer RPC so the insert succeeds even if the client's RLS
-- session has edge-cases (e.g. right after session restore).
create or replace function dismiss_notifications(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into notification_dismissals (notification_id, user_id)
  select unnest(p_ids), auth.uid()
  on conflict (notification_id, user_id) do nothing;
end;
$$;

grant execute on function dismiss_notifications(uuid[]) to authenticated;
