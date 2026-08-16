-- Migration 038: marriages RLS policies
-- The marriages table was created in the initial schema but had no RLS
-- policies defined, so only the postgres role could access it.
-- This migration adds the necessary policies.
-- Wrapped in a DO block so it is a no-op if marriages table doesn't exist.

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'marriages'
  ) then
    raise notice 'marriages table not found — skipping migration 038';
    return;
  end if;

  -- Admins can manage all marriage records.
  execute 'drop policy if exists "marriages_admin_all" on marriages';
  execute $p$
    create policy "marriages_admin_all" on marriages
      for all using (is_admin()) with check (is_admin())
  $p$;

  -- Any authenticated user can read marriage records (public church register).
  execute 'drop policy if exists "marriages_read" on marriages';
  execute $p$
    create policy "marriages_read" on marriages
      for select using (auth.uid() is not null)
  $p$;
end;
$$;
