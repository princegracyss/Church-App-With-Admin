-- ============================================================
-- Migration 003 — Anon-safe member login lookup RPC
-- Called before the user is authenticated (no Supabase session).
-- Bypasses RLS via security definer; returns only login-safe fields.
-- Safe to re-run (create or replace).
-- ============================================================

create or replace function lookup_member_for_login(
  p_identifier text,
  p_member_id  text default null
)
returns table (
  id            uuid,
  first_name    text,
  last_name     text,
  member_number text,
  mobile        text,
  email         text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trimmed text := trim(p_identifier);
  v_mid     text := trim(coalesce(p_member_id, ''));
begin
  return query
    select
      m.id,
      m.first_name,
      m.last_name,
      m.member_number,
      m.mobile,
      m.email
    from members m
    where
      m.status = 'active'
      and (
        m.mobile          =  v_trimmed
        or lower(m.email) =  lower(v_trimmed)
        or lower(m.member_number) = lower(v_trimmed)
      )
      and (v_mid = '' or lower(m.member_number) = lower(v_mid));
end;
$$;

grant execute on function lookup_member_for_login(text, text) to anon;
