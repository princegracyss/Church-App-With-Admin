-- Migration 037: audit_logs triggers
-- Automatically records INSERT / UPDATE / DELETE on the three most sensitive
-- tables (members, families, profiles) so every data change is traceable.
-- The trigger function writes to audit_logs using SECURITY DEFINER so the
-- insert always succeeds regardless of the calling user's RLS policies.

-- All statements are wrapped in a DO block so this migration is a no-op if
-- audit_logs (or any of the watched tables) was never created.
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'audit_logs'
  ) then
    raise notice 'audit_logs table not found — skipping migration 037';
    return;
  end if;

  -- Create / replace the trigger function.
  -- Cannot use CREATE OR REPLACE FUNCTION inside a PL/pgSQL block directly,
  -- so we use EXECUTE to run DDL dynamically.
  execute $f$
    create or replace function _audit_log_trigger()
    returns trigger
    language plpgsql
    security definer
    set search_path = public
    as $fn$
    begin
      if TG_OP = 'INSERT' then
        insert into audit_logs (user_id, action, table_name, record_id, new_value)
        values (auth.uid(), 'INSERT', TG_TABLE_NAME, NEW.id::text, to_jsonb(NEW));
        return NEW;
      elsif TG_OP = 'UPDATE' then
        insert into audit_logs (user_id, action, table_name, record_id, old_value, new_value)
        values (auth.uid(), 'UPDATE', TG_TABLE_NAME, NEW.id::text, to_jsonb(OLD), to_jsonb(NEW));
        return NEW;
      elsif TG_OP = 'DELETE' then
        insert into audit_logs (user_id, action, table_name, record_id, old_value)
        values (auth.uid(), 'DELETE', TG_TABLE_NAME, OLD.id::text, to_jsonb(OLD));
        return OLD;
      end if;
      return null;
    end;
    $fn$
  $f$;

  -- Attach to members (if it exists)
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='members') then
    drop trigger if exists trg_audit_members on members;
    create trigger trg_audit_members
      after insert or update or delete on members
      for each row execute function _audit_log_trigger();
  end if;

  -- Attach to families (if it exists)
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='families') then
    drop trigger if exists trg_audit_families on families;
    create trigger trg_audit_families
      after insert or update or delete on families
      for each row execute function _audit_log_trigger();
  end if;

  -- Attach to profiles (if it exists)
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='profiles') then
    drop trigger if exists trg_audit_profiles on profiles;
    create trigger trg_audit_profiles
      after insert or update or delete on profiles
      for each row execute function _audit_log_trigger();
  end if;
end;
$$;
