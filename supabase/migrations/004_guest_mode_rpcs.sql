-- ============================================================
-- Migration 004 — Guest mode RPCs (OTP-disabled member login)
-- When OTP is off, members access the app without a Supabase
-- session. These security definer functions bypass RLS and
-- accept the member UUID directly, granted to the anon role.
-- Safe to re-run (create or replace).
-- ============================================================

-- Submit a certificate request on behalf of a guest member.
create or replace function guest_request_certificate(
  p_member_id uuid,
  p_type      text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into certificate_requests (member_id, type, status)
  values (p_member_id, p_type, 'submitted')
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function guest_request_certificate(uuid, text) to anon;

-- Fetch a guest member's own certificate requests.
create or replace function guest_get_certificate_requests(p_member_id uuid)
returns setof certificate_requests
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select * from certificate_requests
    where member_id = p_member_id
    order by created_at desc;
end;
$$;
grant execute on function guest_get_certificate_requests(uuid) to anon;

-- Fetch the family row for a guest member.
create or replace function guest_get_my_family(p_member_id uuid)
returns setof families
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select f.* from families f
    join members m on m.family_id = f.id
    where m.id = p_member_id
    limit 1;
end;
$$;
grant execute on function guest_get_my_family(uuid) to anon;

-- Fetch all active members of a guest member's family.
create or replace function guest_get_family_members(p_member_id uuid)
returns setof members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
begin
  select family_id into v_family_id from members where id = p_member_id;
  if v_family_id is null then return; end if;
  return query
    select * from members
    where family_id = v_family_id and status = 'active'
    order by first_name;
end;
$$;
grant execute on function guest_get_family_members(uuid) to anon;
