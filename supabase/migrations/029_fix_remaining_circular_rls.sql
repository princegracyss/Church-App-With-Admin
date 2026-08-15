-- Migration 029: Fix infinite recursion in RLS policies for `members`
--
-- ROOT CAUSE (full diagnosis)
-- ───────────────────────────
-- `security definer` alone does NOT disable Row Level Security inside a
-- function. Postgres still evaluates RLS policies on every table the function
-- touches. Adding `set row_security = off` to the helper functions breaks one
-- layer of recursion, but there is a second, deeper loop in the policy bodies
-- themselves:
--
--   Policy "members_own_family_select" on members:
--     USING (family_id in (SELECT family_id FROM members m2 WHERE ...))
--                                              ↑
--                          This re-queries `members` from within a
--                          `members` policy → Postgres evaluates members
--                          RLS again → same policy fires → infinite loop.
--
--   Policy "families_member_select" on families:
--     USING (id in (SELECT family_id FROM members WHERE members.id = ...))
--                                         ↑
--                   Querying `members` from a `families` policy is safe in
--                   isolation, BUT it still triggers members RLS evaluation,
--                   which fires members_own_family_select, which subqueries
--                   members m2 → loop.
--
-- TWO-PART FIX
-- ────────────
-- Part 1: Add `set row_security = off` to all six helper functions so they
--         can query profiles/members without re-entering RLS evaluation.
--
-- Part 2: Rewrite "members_own_family_select" so it does NOT subquery
--         `members` at all. Instead, call my_family_id() (which now has
--         row_security=off) and compare family_id directly — a single
--         scalar lookup with no recursive table scan.
--         While here, also simplify "families_member_select" the same way
--         to avoid touching members from a families policy altogether.

-- ═══════════════════════════════════════════════════════════════════════
-- PART 1: Rebuild all six RLS helper functions with row_security = off
-- ═══════════════════════════════════════════════════════════════════════

create or replace function my_member_id()
returns uuid language sql stable security definer
set search_path = public set row_security = off as $$
  select member_id from profiles where id = auth.uid() limit 1;
$$;

create or replace function my_family_id()
returns uuid language sql stable security definer
set search_path = public set row_security = off as $$
  select family_id from members where id = my_member_id() limit 1;
$$;

create or replace function my_bcc_unit()
returns text language sql stable security definer
set search_path = public set row_security = off as $$
  select basic_christian_community from members where id = my_member_id() limit 1;
$$;

create or replace function is_admin()
returns boolean language sql stable security definer
set search_path = public set row_security = off as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and role in ('super_admin','admin','parish_priest','church_secretary')
  );
$$;

create or replace function get_my_role()
returns text language sql stable security definer
set search_path = public set row_security = off as $$
  select role from profiles where id = auth.uid() limit 1;
$$;

create or replace function is_super_admin()
returns boolean language sql stable security definer
set search_path = public set row_security = off as $$
  select get_my_role() = 'super_admin';
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- PART 2: Rewrite the two policies whose bodies self-reference `members`
-- ═══════════════════════════════════════════════════════════════════════

-- members_own_family_select
-- OLD: family_id IN (SELECT family_id FROM members m2 WHERE m2.id = my_member_id())
--      ↑ queries `members` from within a `members` policy → recursion
-- NEW: family_id = my_family_id()
--      ↑ my_family_id() has row_security=off, returns a scalar UUID, no table scan
drop policy if exists "members_own_family_select" on members;
create policy "members_own_family_select" on members
  for select using (
    family_id is not null
    and family_id = my_family_id()
  );

-- families_member_select
-- OLD: id IN (SELECT family_id FROM members WHERE members.id = my_member_id())
--      ↑ queries `members` from a `families` policy; that members scan
--        triggers members RLS which includes members_own_family_select → loop
-- NEW: id = my_family_id()
--      ↑ same scalar lookup, no members table scan at all
drop policy if exists "families_member_select" on families;
create policy "families_member_select" on families
  for select using (
    id = my_family_id()
  );
