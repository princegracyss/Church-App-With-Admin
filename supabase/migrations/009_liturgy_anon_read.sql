-- Migration 009: Allow anon/guest access to liturgy schedule
-- Guest members (no Supabase session, OTP disabled) need to read
-- liturgy assignments to see their schedule in LiturgyScheduleScreen.
-- Liturgy assignment data (unit name, date, notes) is not sensitive —
-- it is effectively a public parish schedule.

drop policy if exists "liturgy_read_anon" on liturgy_assignments;
create policy "liturgy_read_anon" on liturgy_assignments
  for select using (true);

-- Drop the authenticated-only read policy and replace with the open one above.
-- (The anon policy covers all cases; we keep the write policy unchanged.)
drop policy if exists "liturgy_read" on liturgy_assignments;
