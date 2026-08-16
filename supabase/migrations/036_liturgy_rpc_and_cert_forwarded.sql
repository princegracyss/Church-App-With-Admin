-- Migration 036: server-side RPC for liturgy assignments scoped to a member
-- Replaces the client-side filter in api.getMyLiturgyAssignments() with a
-- single server call that ORs on bcc_unit_name and org_id — eliminates the
-- full table scan on the client.
-- Also adds forwarded_to column to certificate_requests (used by the
-- forwarding UI in CertificatesScreen).

-- ── certificate_requests: forwarded_to column ────────────────────────────────
-- Wrapped in a DO block so this is a no-op if certificate_requests was never
-- created (e.g. schema.sql was never fully applied on this project).
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public'
      and table_name   = 'certificate_requests'
  ) then
    alter table certificate_requests
      add column if not exists forwarded_to uuid references profiles(id) on delete set null;
  end if;
end;
$$;

-- ── get_my_liturgy_assignments RPC ───────────────────────────────────────────
-- Returns assignments relevant to the calling member:
--   • Where bcc_unit_name matches the member's BCC (members OR families column)
--   • OR where org_id is one the member belongs to
-- Staff (is_admin()) receive ALL assignments.
-- Wrapped in a DO block so it is a no-op if liturgy_assignments does not exist.
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'liturgy_assignments'
  ) then
    raise notice 'liturgy_assignments table not found — skipping get_my_liturgy_assignments RPC';
    return;
  end if;

  execute $f$
    create or replace function get_my_liturgy_assignments()
    returns table (
      id            uuid,
      bcc_unit_id   uuid,
      bcc_unit_name text,
      org_id        uuid,
      org_name      text,
      liturgy_date  date,
      notes         text,
      assigned_by   uuid,
      created_at    timestamptz
    )
    language plpgsql
    security definer
    set search_path = public
    set row_security = off
    as $fn$
    declare
      v_member_id  uuid;
      v_bcc        text;
      v_org_ids    uuid[];
    begin
      -- Staff see everything.
      if (select exists (
            select 1 from profiles
            where id = auth.uid()
              and role in ('super_admin','admin','parish_priest','church_secretary')
          ))
      then
        return query
          select la.id, la.bcc_unit_id, la.bcc_unit_name, la.org_id, la.org_name,
                 la.liturgy_date, la.notes, la.assigned_by, la.created_at
          from liturgy_assignments la
          order by la.liturgy_date asc;
        return;
      end if;

      -- Resolve member context.
      select member_id into v_member_id
      from profiles where id = auth.uid() limit 1;

      if v_member_id is null then return; end if;

      -- BCC: prefer member-level, fall back to family-level.
      select coalesce(
        m.basic_christian_community,
        f.basic_christian_community
      )
      into v_bcc
      from members m
      left join families f on f.id = m.family_id
      where m.id = v_member_id
      limit 1;

      -- Org IDs the member belongs to.
      select array_agg(organization_id)
      into v_org_ids
      from organization_members
      where member_id = v_member_id;

      if v_bcc is null and (v_org_ids is null or array_length(v_org_ids, 1) = 0) then
        return;
      end if;

      return query
        select la.id, la.bcc_unit_id, la.bcc_unit_name, la.org_id, la.org_name,
               la.liturgy_date, la.notes, la.assigned_by, la.created_at
        from liturgy_assignments la
        where
          (v_bcc     is not null and la.bcc_unit_name = v_bcc)
          or
          (v_org_ids is not null and la.org_id = any(v_org_ids))
        order by la.liturgy_date asc;
    end;
    $fn$
  $f$;

  execute 'grant execute on function get_my_liturgy_assignments() to authenticated';
  execute 'grant execute on function get_my_liturgy_assignments() to anon';
end;
$$;
