-- Migration 031: Fix dismiss_notifications RPC for member sessions
--
-- PROBLEM
-- ───────
-- Members clearing notifications call the dismiss_notifications(uuid[]) RPC,
-- which inserts rows into notification_dismissals. The function is
-- SECURITY DEFINER but lacks `set row_security = off`. While the
-- notification_dismissals policy (dismissals_own: user_id = auth.uid()) is
-- simple and does not recurse, the function owner in some Supabase projects
-- may not hold BYPASSRLS — meaning Postgres still evaluates RLS inside the
-- function body even in security-definer mode.
--
-- Additionally, getNotifications() reads notification_dismissals directly
-- via the Supabase client. If that SELECT fails (e.g. RLS prevents it),
-- dismissedIds is empty and every dismissed notification reappears.
--
-- FIX
-- ───
-- 1. Recreate dismiss_notifications with set row_security = off so the
--    INSERT always succeeds regardless of RLS configuration.
-- 2. Ensure notification_dismissals table and its policy exist (idempotent).
-- 3. Grant SELECT on notification_dismissals to authenticated so the direct
--    client query in getNotifications() always works.

-- ── Ensure table exists (idempotent) ─────────────────────────────────────────
create table if not exists notification_dismissals (
  id              uuid primary key default uuid_generate_v4(),
  notification_id uuid not null references notifications(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  dismissed_at    timestamptz not null default now(),
  unique (notification_id, user_id)
);

alter table notification_dismissals enable row level security;

drop policy if exists "dismissals_own" on notification_dismissals;
create policy "dismissals_own" on notification_dismissals
  for all
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ── Rebuild RPC with row_security = off ──────────────────────────────────────
create or replace function dismiss_notifications(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  insert into notification_dismissals (notification_id, user_id)
  select unnest(p_ids), auth.uid()
  on conflict (notification_id, user_id) do nothing;
end;
$$;

grant execute on function dismiss_notifications(uuid[]) to authenticated;
