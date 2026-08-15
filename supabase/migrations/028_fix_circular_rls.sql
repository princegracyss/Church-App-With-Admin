-- Migration 028: Fix circular RLS caused by migration 026
--
-- The policies added in migration 026 (families_member_select,
-- members_self_select, members_own_family_select) all contain:
--
--   (select member_id from profiles where profiles.id = auth.uid() limit 1)
--
-- When currentProfile() runs "select *, members(...) from profiles", Postgres
-- must evaluate the members RLS policies. Those policies subquery profiles,
-- which is still mid-evaluation → circular RLS dependency → error →
-- currentProfile() returns null → user.role is undefined → isAdmin is false
-- → admin sees only member tiles.
--
-- Fix: introduce a security-definer helper my_member_id() (analogous to the
-- existing my_family_id()) and rewrite every affected policy to call it
-- instead of inlining the profiles subquery. Security-definer functions bypass
-- RLS when they run, so the circular dependency is broken.

-- ── Helper function ───────────────────────────────────────────────────────────
create or replace function my_member_id() returns uuid as $$
  select member_id from profiles where id = auth.uid() limit 1;
$$ language sql stable security definer set search_path = public;

-- ── Rewrite families_member_select ───────────────────────────────────────────
drop policy if exists "families_member_select" on families;
create policy "families_member_select" on families
  for select using (
    id in (select family_id from members where members.id = my_member_id())
  );

-- ── Rewrite members_self_select ───────────────────────────────────────────────
drop policy if exists "members_self_select" on members;
create policy "members_self_select" on members
  for select using (id = my_member_id());

-- ── Rewrite members_own_family_select ────────────────────────────────────────
drop policy if exists "members_own_family_select" on members;
create policy "members_own_family_select" on members
  for select using (
    family_id is not null
    and family_id in (
      select family_id from members m2
      where m2.id = my_member_id() and m2.family_id is not null
    )
  );

-- ── Rewrite members_self_update (same pattern, from migration 011) ────────────
drop policy if exists "members_self_update" on members;
create policy "members_self_update" on members
  for update
  using (id = my_member_id())
  with check (id = my_member_id());
