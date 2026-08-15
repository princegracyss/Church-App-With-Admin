-- Migration 024: unit_admin role
--
-- Adds a new `unit_admin` role scoped to a single BCC (Basic Christian
-- Community) unit. A unit_admin can UPDATE members whose
-- basic_christian_community matches their own, but has no other elevated access.
--
-- Changes:
--   1. Expand the profiles_role_check constraint to allow 'unit_admin'.
--   2. Add a helper function my_bcc_unit() — returns the viewer's own BCC.
--   3. Add RLS policy members_unit_admin_update — unit_admin may UPDATE members
--      in their own BCC unit.
--   4. Allow unit_admin to SELECT members in their BCC unit (needed to open
--      the member profile / edit screen).

-- ── 1. Expand role constraint ─────────────────────────────────────────────────
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('super_admin','admin','parish_priest','church_secretary','unit_admin','member'));

-- ── 2. Helper: the BCC unit of the currently signed-in user's member row ──────
create or replace function my_bcc_unit() returns text as $$
  select m.basic_christian_community
  from   profiles p
  join   members  m on m.id = p.member_id
  where  p.id = auth.uid()
  limit  1;
$$ language sql stable security definer;

-- ── 3. RLS — unit_admin UPDATE on members in their own BCC ───────────────────
drop policy if exists "members_unit_admin_update" on members;
create policy "members_unit_admin_update" on members
  for update
  using  (get_my_role() = 'unit_admin' and basic_christian_community = my_bcc_unit())
  with check (get_my_role() = 'unit_admin' and basic_christian_community = my_bcc_unit());

-- ── 4. RLS — unit_admin SELECT on members in their own BCC ───────────────────
drop policy if exists "members_unit_admin_select" on members;
create policy "members_unit_admin_select" on members
  for select
  using (get_my_role() = 'unit_admin' and basic_christian_community = my_bcc_unit());
