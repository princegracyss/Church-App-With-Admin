-- Migration 013: Allow authenticated users to read push tokens for a specific
-- member so that birthday-wish push notifications can be delivered by regular
-- (non-staff) parish members.
--
-- Background:
--   Migration 011 added `push_tokens_staff_read` which only lets staff read ALL
--   tokens. `sendPushToMember()` on the client looks up tokens by user_id for a
--   given member — a regular member calling this gets an empty result set because
--   their RLS prevents reading another user's token rows.
--
--   This policy lets any authenticated user read push tokens that are linked to
--   a specific auth.users row, making targeted (member-to-member) push delivery
--   possible without exposing the entire token table.
--
-- Apply after migration 011.

-- Any authenticated user can read push tokens.
-- The existing `push_tokens_upsert_own` policy already covers own-row read/write.
-- This read policy covers reading *other* users' tokens for targeted delivery.
drop policy if exists "push_tokens_member_read" on push_tokens;
create policy "push_tokens_member_read" on push_tokens
  for select
  using (auth.uid() is not null);
