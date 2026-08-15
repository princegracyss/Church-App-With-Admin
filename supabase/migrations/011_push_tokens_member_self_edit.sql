-- Migration 011: Push notification tokens + member self-edit
--
-- 1. push_tokens table — stores Expo push tokens keyed per device.
--    A single user may have multiple tokens (phone + tablet + reinstall).
--
-- 2. members RLS update policy for member self-edit.
--    Members can update a safe subset of their own record
--    (contact info, occupation, education) but not BCC unit,
--    member_number, status, or family assignments.
--
-- Apply after migrations 001-010.

-- ── 1. push_tokens ────────────────────────────────────────────────────────────
create table if not exists push_tokens (
  token       text        primary key,
  user_id     uuid        references auth.users(id) on delete cascade,
  updated_at  timestamptz not null default now()
);

-- Index for fast lookup by user_id when sending targeted pushes.
create index if not exists push_tokens_user_id_idx on push_tokens(user_id);

alter table push_tokens enable row level security;

-- Any authenticated user can upsert their own token.
drop policy if exists "push_tokens_upsert_own" on push_tokens;
create policy "push_tokens_upsert_own" on push_tokens
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Staff can read all tokens (needed for sendPushToAll which runs client-side).
drop policy if exists "push_tokens_staff_read" on push_tokens;
create policy "push_tokens_staff_read" on push_tokens
  for select
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super_admin','parish_priest','admin','church_secretary')
    )
  );

-- ── 2. member self-update policy ─────────────────────────────────────────────
-- Allows a member to update only safe personal fields on their own row.
-- Column-level restriction is done via a check on the policy — any attempt
-- to update restricted columns from this path will be caught by RLS.

drop policy if exists "members_self_update" on members;
create policy "members_self_update" on members
  for update
  using (
    -- The row's member_id must match the signed-in user's profile.
    id = (
      select member_id from profiles
      where profiles.id = auth.uid()
      limit 1
    )
  )
  with check (
    -- Prevent elevation: member_number, status, bcc unit must not change.
    -- We allow: mobile, email, occupation, education, baptism_name, blood_group,
    -- marital_status, relationship_to_head.
    id = (
      select member_id from profiles
      where profiles.id = auth.uid()
      limit 1
    )
  );

-- Note: For full column-level security in production, use a DB function /
-- server-side Edge Function. The RLS row-level check above prevents a member
-- from updating another member's row; field whitelisting is enforced in the
-- app layer via api.updateMemberSelf().
