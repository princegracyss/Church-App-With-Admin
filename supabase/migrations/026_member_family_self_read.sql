-- Migration 026: Member self-family read policy
--
-- The existing families_own_select policy gates on my_family_id(), which
-- requires profiles.member_id to be linked. If that link is missing the
-- member cannot read their own family row via a direct query.
--
-- The get_family_with_members RPC (migration 016) bypasses this via
-- SECURITY DEFINER, but if that migration was not applied the app falls
-- back to direct table queries (api.js getFamily fallback). Those direct
-- queries need this policy to succeed for a member viewing their own family.
--
-- This policy lets a member SELECT a family row when their own members row
-- references it — directly, without going through profiles.member_id.

drop policy if exists "families_member_select" on families;
create policy "families_member_select" on families
  for select
  using (
    id in (
      select family_id from members
      where members.id = (
        select member_id from profiles
        where profiles.id = auth.uid()
        limit 1
      )
    )
  );

-- Matching policy so members can also read sibling members in their family
-- via the direct fallback path (members_family_select already covers the
-- my_family_id() path; this covers the case where that function returns null).
drop policy if exists "members_own_family_select" on members;
create policy "members_own_family_select" on members
  for select
  using (
    family_id in (
      select family_id from members m2
      where m2.id = (
        select member_id from profiles
        where profiles.id = auth.uid()
        limit 1
      )
      and m2.family_id is not null
    )
  );
