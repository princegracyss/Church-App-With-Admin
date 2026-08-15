-- Parish Connect — Supabase schema
-- Run this in Supabase Dashboard → SQL Editor → New query → Run.
-- Safe to re-run any time, on a fresh project OR one that already has these
-- tables (e.g. upgrading to the admin module): every table uses
-- "if not exists", every function uses "or replace", every policy is
-- dropped-then-recreated, and the profiles role constraint is dropped and
-- reapplied. Nothing here ever drops a table or deletes data.

create extension if not exists "uuid-ossp";

-- =========================================================================
-- CORE TABLES  (mirrors Church_Management_System_Architecture_and_Database_Design.md)
-- =========================================================================

-- Family creation flow: family_code is auto-generated server-side (FAM-0001,
-- FAM-0002, ...) via a sequence, so the app never has to invent one itself.
-- nextval() is atomic under concurrent transactions, so two staff members
-- adding a family at the same moment can never collide on a code — this is
-- the piece that would otherwise be racy if generated client-side.
create sequence if not exists family_code_seq;

create or replace function generate_family_code() returns text as $$
  select 'FAM-' || lpad(nextval('family_code_seq')::text, 4, '0');
$$ language sql;

create table if not exists families (
  id uuid primary key default uuid_generate_v4(),
  family_code text unique not null default generate_family_code(),
  house_name text,
  address_line1 text,
  address_line2 text,
  place text,
  district text,
  state text,
  pincode text,
  phone text,
  email text,
  ward text,
  basic_christian_community text,
  head_member_id uuid,
  status text default 'active'
);

-- Upgrading an existing database: "create table if not exists" above is a
-- no-op on a project that already has `families`, so it won't pick up the
-- new default. This applies it either way — safe to run whether the column
-- already has a default or not.
alter table families alter column family_code set default generate_family_code();

create table if not exists members (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid references families(id) on delete cascade,
  member_number text unique not null,
  first_name text not null,
  middle_name text,
  last_name text not null,
  gender text,
  date_of_birth date,
  blood_group text,
  mobile text,
  email text,
  occupation text,
  education text,
  marital_status text,
  relationship_to_head text,
  baptism_name text,
  photo text,
  basic_christian_community text,
  status text default 'active',
  is_family_head boolean default false,
  created_at timestamptz default now()
);

-- profiles links a Supabase Auth user (auth.users) to a role + member record.
-- This is the equivalent of the doc's `users` table, minus password_hash
-- (Supabase Auth already stores that securely).
-- Roles (see src/theme/roles.js for the matching JS constants + permission map):
--   super_admin      — can create Admins, Priests, Secretaries, Members; can reassign anyone's role.
--   admin            — can create Priests, Secretaries, Members.
--   parish_priest    — can create Members; can approve/reject/issue certificate requests.
--   church_secretary — can create Members.
--   member           — no admin capabilities.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  role text not null default 'member'
    constraint profiles_role_check
    check (role in ('super_admin','admin','parish_priest','church_secretary','member')),
  member_id uuid references members(id),
  is_active boolean default true,
  last_login timestamptz
);

-- Upgrading an existing database (created before the admin module): the
-- table above already exists, so "create table if not exists" is a no-op
-- and won't update its role constraint. This re-applies it either way —
-- safe to run whether the constraint already has this name or not.
-- First, remap any rows still using the retired 'coordinator' / 'family_head'
-- roles so the new constraint (added right after) doesn't fail on them.
update profiles set role = 'admin' where role = 'coordinator';
update profiles set role = 'member' where role = 'family_head';
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('super_admin','admin','parish_priest','church_secretary','member'));

create table if not exists sacraments (
  id uuid primary key default uuid_generate_v4(),
  member_id uuid references members(id) on delete cascade,
  type text not null,
  church_name text,
  date date,
  minister_name text,
  certificate_number text,
  remarks text
);

create table if not exists organizations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  icon text,
  status text default 'active'
);

create table if not exists organization_members (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid references organizations(id) on delete cascade,
  member_id uuid references members(id) on delete cascade,
  designation text,
  joined_date date default current_date
);

create table if not exists events (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  description text,
  venue text,
  start_date date not null,
  end_date date,
  banner text,
  created_by uuid references profiles(id)
);

create table if not exists event_participants (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid references events(id) on delete cascade,
  member_id uuid references members(id) on delete cascade,
  attendance_status text default 'registered',
  checked_in_time timestamptz
);

create table if not exists notifications (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  message text not null,
  type text default 'GENERAL',
  target text default 'ALL' check (target in ('ALL','FAMILY','MEMBER','ORGANIZATION')),
  target_id uuid,
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  metadata jsonb,
  expires_at timestamptz   -- null = never expires; set for BIRTHDAY notifications
);

-- The type column has no check constraint so all values are valid by default;
-- canonical set used by the app:
-- 'GENERAL' | 'FEAST' | 'FUNERAL' | 'EMERGENCY' | 'BIRTHDAY' | 'WISH'
-- metadata (jsonb) is used by WISH notifications to store:
--   { song_url, sender_name, sender_member_id, wish_message, birthday_member_id }
alter table notifications add column if not exists metadata jsonb;
-- migration 020: expiry support
alter table notifications add column if not exists expires_at timestamptz;

create table if not exists notification_reads (
  id uuid primary key default uuid_generate_v4(),
  notification_id uuid references notifications(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  read_at timestamptz default now(),
  dismissed boolean not null default false
);
-- Idempotent: add dismissed column if the table already exists.
alter table notification_reads add column if not exists dismissed boolean not null default false;

-- migration 018: dedicated dismissal table (more reliable than a column on notification_reads)
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
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function dismiss_notifications(p_ids uuid[])
returns void
language plpgsql security definer
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

create table if not exists news (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  description text,
  image text,
  publish_date date default current_date
);

create table if not exists prayer_requests (
  id uuid primary key default uuid_generate_v4(),
  member_id uuid references members(id) on delete cascade,
  title text not null,
  description text,
  status text default 'open',
  created_at timestamptz default now()
);

create table if not exists donations (
  id uuid primary key default uuid_generate_v4(),
  member_id uuid references members(id),
  family_id uuid references families(id),
  amount numeric not null,
  purpose text,
  payment_mode text,
  reference_no text,
  paid_on date not null,
  created_at timestamptz default now()
);

create table if not exists documents (
  id uuid primary key default uuid_generate_v4(),
  member_id uuid references members(id) on delete cascade,
  document_type text not null,
  file_name text not null,
  file_path text not null,   -- Supabase Storage object path
  uploaded_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table if not exists member_qr (
  id uuid primary key default uuid_generate_v4(),
  member_id uuid unique references members(id) on delete cascade,
  qr_code text not null,
  generated_on timestamptz default now()
);

create table if not exists marriages (
  id uuid primary key default uuid_generate_v4(),
  husband_member_id uuid references members(id),
  wife_member_id uuid references members(id),
  marriage_date date not null,
  church text,
  certificate_number text
);

create table if not exists certificate_requests (
  id uuid primary key default uuid_generate_v4(),
  member_id uuid references members(id) on delete cascade,
  type text not null,
  status text default 'submitted' check (status in ('submitted','approved','rejected','issued')),
  certificate_number text,
  issued_file_path text,
  created_at timestamptz default now()
);

create table if not exists audit_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references profiles(id),
  action text not null,
  table_name text not null,
  record_id text,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz default now()
);

-- =========================================================================
-- HELPERS: role checks used throughout the RLS policies below.
-- =========================================================================

-- "Staff" = any elevated role (super_admin / admin / parish_priest /
-- church_secretary). Grants the broad member/family/sacraments/etc. CRUD
-- that predates the admin module — unchanged behaviour.
-- RLS helper functions — all are security definer + row_security off.
-- `security definer` alone does NOT disable RLS inside a function; Postgres
-- still evaluates policies on every table queried. Adding `set row_security = off`
-- is what actually breaks the recursion when these functions are called from
-- within RLS policies on `members` or `families`.

create or replace function is_admin()
returns boolean language sql stable security definer
set search_path = public set row_security = off as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('super_admin','admin','parish_priest','church_secretary')
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

-- my_member_id: resolves profiles.member_id for the current session.
-- Called by my_family_id, my_bcc_unit, and directly from several RLS policies.
create or replace function my_member_id()
returns uuid language sql stable security definer
set search_path = public set row_security = off as $$
  select member_id from profiles where id = auth.uid() limit 1;
$$;

-- my_family_id: resolves the current member's family_id.
-- Called from members_family_select and families_own_select policies.
create or replace function my_family_id()
returns uuid language sql stable security definer
set search_path = public set row_security = off as $$
  select family_id from members where id = my_member_id() limit 1;
$$;

-- =========================================================================
-- ROW LEVEL SECURITY
-- =========================================================================
alter table families enable row level security;
alter table members enable row level security;
alter table profiles enable row level security;
alter table sacraments enable row level security;
alter table organizations enable row level security;
alter table organization_members enable row level security;
alter table events enable row level security;
alter table event_participants enable row level security;
alter table notifications enable row level security;
alter table notification_reads enable row level security;
alter table news enable row level security;
alter table prayer_requests enable row level security;
alter table donations enable row level security;
alter table documents enable row level security;
alter table member_qr enable row level security;
alter table marriages enable row level security;
alter table certificate_requests enable row level security;
alter table audit_logs enable row level security;

-- profiles (user accounts + roles): everyone can read their own; any staff
-- member can read the full list (Manage Users screen); who can *write* is
-- scoped by the admin-module role hierarchy:
--   super_admin → full control of every profile, any role.
--   admin       → may only create/update/deactivate rows whose role is
--                 parish_priest, church_secretary or member (never admin or
--                 super_admin) — i.e. it can't touch its own tier or above.
--   parish_priest / church_secretary → may only create/update rows whose
--                 role is 'member' (adding a member login).
-- This mirrors CREATABLE_ROLES in src/theme/roles.js and is re-checked
-- server-side by the create-parish-user Edge Function, which is the only
-- path that can actually create the underlying auth.users login.
-- Retired policy from before the admin module — it granted every staff
-- role (not just Super Admin) full write access to `profiles`, which would
-- silently defeat the new role-hierarchy policies below if left in place.
drop policy if exists "profiles_admin_write" on profiles;

drop policy if exists "profiles_self_select" on profiles;
create policy "profiles_self_select" on profiles for select using (id = auth.uid() or is_admin());

drop policy if exists "profiles_super_admin_all" on profiles;

-- Split into insert/update/delete (rather than one FOR ALL policy) so that
-- update/delete can add one extra guard: a Super Admin can manage every
-- OTHER row, but never their own, via the app. Self-editing this way is
-- exactly what causes an accidental self-lockout (change your own role away
-- from super_admin, or deactivate yourself, and nothing in the app can undo
-- it since RLS then correctly denies you). Forcing self-changes through the
-- SQL Editor (which runs as `postgres` and bypasses RLS) is deliberate
-- friction against that failure mode.
drop policy if exists "profiles_super_admin_insert" on profiles;
create policy "profiles_super_admin_insert" on profiles for insert
  with check (is_super_admin());

drop policy if exists "profiles_super_admin_update" on profiles;
create policy "profiles_super_admin_update" on profiles for update
  using (is_super_admin() and id <> auth.uid())
  with check (is_super_admin() and id <> auth.uid());

drop policy if exists "profiles_super_admin_delete" on profiles;
create policy "profiles_super_admin_delete" on profiles for delete
  using (is_super_admin() and id <> auth.uid());

drop policy if exists "profiles_admin_manage_staff" on profiles;
create policy "profiles_admin_manage_staff" on profiles for all
  using (get_my_role() = 'admin' and role in ('parish_priest','church_secretary','member'))
  with check (get_my_role() = 'admin' and role in ('parish_priest','church_secretary','member'));

drop policy if exists "profiles_priest_secretary_manage_members" on profiles;
create policy "profiles_priest_secretary_manage_members" on profiles for all
  using (get_my_role() in ('parish_priest','church_secretary') and role = 'member')
  with check (get_my_role() in ('parish_priest','church_secretary') and role = 'member');

-- families: admins see/manage all; everyone else sees only their own family
drop policy if exists "families_admin_all" on families;
create policy "families_admin_all" on families for all using (is_admin()) with check (is_admin());
drop policy if exists "families_own_select" on families;
create policy "families_own_select" on families for select using (id = my_family_id());
-- migration 026+028+029: member reads their own family; uses my_family_id()
-- (row_security=off) so no members table scan is needed from a families policy.
drop policy if exists "families_member_select" on families;
create policy "families_member_select" on families
  for select using (id = my_family_id());

-- members: admins full CRUD (this is the "add / remove members" flow);
-- everyone else can only read members in their own family, or their own single row
drop policy if exists "members_admin_all" on members;
create policy "members_admin_all" on members for all using (is_admin()) with check (is_admin());
drop policy if exists "members_family_select" on members;
create policy "members_family_select" on members for select using (family_id = my_family_id());
-- migration 018+028: member can always read their own row
drop policy if exists "members_self_select" on members;
create policy "members_self_select" on members
  for select using (id = my_member_id());
-- migration 026+028+029: member can read all members in their own family.
-- Uses my_family_id() scalar (row_security=off) — no self-join on members,
-- which was the source of the infinite recursion.
drop policy if exists "members_own_family_select" on members;
create policy "members_own_family_select" on members
  for select using (
    family_id is not null
    and family_id = my_family_id()
  );

-- sacraments / donations / documents / prayer_requests: admins all,
-- self can read/manage their own
drop policy if exists "sacraments_admin_all" on sacraments;
create policy "sacraments_admin_all" on sacraments for all using (is_admin()) with check (is_admin());
drop policy if exists "sacraments_own_select" on sacraments;
create policy "sacraments_own_select" on sacraments for select
  using (member_id in (select member_id from profiles where id = auth.uid()));

drop policy if exists "donations_admin_all" on donations;
create policy "donations_admin_all" on donations for all using (is_admin()) with check (is_admin());
drop policy if exists "donations_own_select" on donations;
create policy "donations_own_select" on donations for select
  using (member_id in (select member_id from profiles where id = auth.uid()));

drop policy if exists "documents_admin_all" on documents;
create policy "documents_admin_all" on documents for all using (is_admin()) with check (is_admin());
drop policy if exists "documents_own_select" on documents;
create policy "documents_own_select" on documents for select
  using (member_id in (select member_id from profiles where id = auth.uid()));

drop policy if exists "prayer_admin_all" on prayer_requests;
create policy "prayer_admin_all" on prayer_requests for all using (is_admin()) with check (is_admin());
drop policy if exists "prayer_own_select" on prayer_requests;
create policy "prayer_own_select" on prayer_requests for select
  using (member_id in (select member_id from profiles where id = auth.uid()));
drop policy if exists "prayer_own_insert" on prayer_requests;
create policy "prayer_own_insert" on prayer_requests for insert
  with check (member_id in (select member_id from profiles where id = auth.uid()));

-- organizations / events / news: readable by any signed-in user, writable by admins
drop policy if exists "orgs_read" on organizations;
create policy "orgs_read" on organizations for select using (auth.uid() is not null);
drop policy if exists "orgs_admin_write" on organizations;
create policy "orgs_admin_write" on organizations for all using (is_admin()) with check (is_admin());
drop policy if exists "org_members_read" on organization_members;
create policy "org_members_read" on organization_members for select using (auth.uid() is not null);
drop policy if exists "org_members_admin_write" on organization_members;
create policy "org_members_admin_write" on organization_members for all using (is_admin()) with check (is_admin());

drop policy if exists "events_read" on events;
create policy "events_read" on events for select using (auth.uid() is not null);
drop policy if exists "events_admin_write" on events;
create policy "events_admin_write" on events for all using (is_admin()) with check (is_admin());
drop policy if exists "event_participants_read" on event_participants;
create policy "event_participants_read" on event_participants for select using (auth.uid() is not null);
drop policy if exists "event_participants_self_insert" on event_participants;
create policy "event_participants_self_insert" on event_participants for insert
  with check (member_id in (select member_id from profiles where id = auth.uid()));

drop policy if exists "news_read" on news;
create policy "news_read" on news for select using (auth.uid() is not null);
drop policy if exists "news_admin_write" on news;
create policy "news_admin_write" on news for all using (is_admin()) with check (is_admin());

-- notifications: everyone can read (app filters by target); only admins create
-- general notifications. Any authenticated user may insert a BIRTHDAY type
-- notification so the birthday check works for plain member logins too.
drop policy if exists "notifications_read" on notifications;
create policy "notifications_read" on notifications for select using (auth.uid() is not null);
drop policy if exists "notifications_wish_read_anon" on notifications;
create policy "notifications_wish_read_anon" on notifications for select using (type = 'WISH');
drop policy if exists "notifications_admin_write" on notifications;
create policy "notifications_admin_write" on notifications for all using (is_admin()) with check (is_admin());
drop policy if exists "notifications_birthday_insert" on notifications;
create policy "notifications_birthday_insert" on notifications for insert
  with check (auth.uid() is not null and type = 'BIRTHDAY');
drop policy if exists "notifications_wish_insert" on notifications;
create policy "notifications_wish_insert" on notifications for insert
  with check (auth.uid() is not null and type = 'WISH');
drop policy if exists "notifications_wish_insert_anon" on notifications;
create policy "notifications_wish_insert_anon" on notifications for insert
  with check (type = 'WISH');
drop policy if exists "notification_reads_own" on notification_reads;
create policy "notification_reads_own" on notification_reads for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- member_qr / marriages: admins manage; self can read own QR
drop policy if exists "member_qr_admin_all" on member_qr;
create policy "member_qr_admin_all" on member_qr for all using (is_admin()) with check (is_admin());
drop policy if exists "member_qr_own_select" on member_qr;
create policy "member_qr_own_select" on member_qr for select
  using (member_id in (select member_id from profiles where id = auth.uid()));
drop policy if exists "marriages_admin_all" on marriages;
create policy "marriages_admin_all" on marriages for all using (is_admin()) with check (is_admin());

-- certificate_requests: staff can manage all (view, set certificate number,
-- etc.); self can create + read their own. Actually *deciding* a request
-- (approve / reject / issue) is further restricted below to the Parish
-- Priest and Super Admin only, via a trigger — see enforce_certificate_approval.
drop policy if exists "certs_admin_all" on certificate_requests;
create policy "certs_admin_all" on certificate_requests for all using (is_admin()) with check (is_admin());
drop policy if exists "certs_own_select" on certificate_requests;
create policy "certs_own_select" on certificate_requests for select
  using (member_id in (select member_id from profiles where id = auth.uid()));
drop policy if exists "certs_own_insert" on certificate_requests;
create policy "certs_own_insert" on certificate_requests for insert
  with check (member_id in (select member_id from profiles where id = auth.uid()));

-- Only the Parish Priest (or a Super Admin) may move a request out of
-- 'submitted' — i.e. approve, reject, or mark issued. Church Secretary and
-- Admin can still see/administer requests (e.g. attach a certificate
-- number) but cannot make the approval decision itself. This is enforced
-- at the database level so it holds even if a client bypasses the UI.
create or replace function enforce_certificate_approval() returns trigger as $$
begin
  if (new.status is distinct from old.status) and new.status in ('approved', 'rejected', 'issued') then
    if get_my_role() not in ('parish_priest', 'super_admin') then
      raise exception 'Only the parish priest or a super admin can approve, reject, or issue certificate requests.';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_certificate_approval on certificate_requests;
create trigger trg_certificate_approval
  before update on certificate_requests
  for each row execute function enforce_certificate_approval();

-- audit_logs: admins only
drop policy if exists "audit_admin_only" on audit_logs;
create policy "audit_admin_only" on audit_logs for all using (is_admin()) with check (is_admin());

-- =========================================================================
-- MOBILE NUMBER + OTP SIGN-IN — auto-provisioning
-- =========================================================================
-- Email/password logins only exist for accounts an Admin/Priest/Secretary/
-- Super Admin explicitly created via "Add User". Mobile+OTP sign-in works
-- differently: it's meant for parishioners who are *already* in the Member
-- List (the family register) but have never had a login created for them.
--
-- When someone verifies an OTP for the first time, Supabase Auth inserts a
-- new row into auth.users with that phone number. This trigger fires right
-- after and:
--   1. looks for a `members` row whose `mobile` matches the phone number
--      exactly (so members.mobile must be stored in E.164 format, e.g.
--      '+919876543210', for auto-linking to work — see the app's Add/Edit
--      Member screens),
--   2. creates a `profiles` row with role 'member', linked to that member
--      if found (or unlinked, if not — they can still sign in, just without
--      a family record attached until staff link one via Manage Users).
-- This never runs for staff-created accounts (email/password via the
-- create-parish-user Edge Function), since those don't have `new.phone` set.
create or replace function handle_new_phone_user() returns trigger as $$
declare
  matched_member_id uuid;
begin
  if new.phone is not null then
    select id into matched_member_id from members where mobile = new.phone limit 1;
    insert into profiles (id, username, role, member_id, is_active)
    values (new.id, new.phone, 'member', matched_member_id, true)
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created_phone on auth.users;
create trigger on_auth_user_created_phone
  after insert on auth.users
  for each row execute function handle_new_phone_user();

-- Email-OTP auto-provisioning (migration 017): mirrors handle_new_phone_user
-- but matches on auth.users.email → members.email when no phone is present.
create or replace function handle_new_email_user() returns trigger as $$
declare
  matched_member_id uuid;
begin
  if new.email is not null and (new.phone is null or new.phone = '') then
    select id into matched_member_id
    from members
    where lower(email) = lower(new.email)
      and status = 'active'
    limit 1;
    insert into profiles (id, username, role, member_id, is_active)
    values (new.id, new.email, 'member', matched_member_id, true)
    on conflict (id) do update
      set member_id = coalesce(profiles.member_id, excluded.member_id);
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created_email on auth.users;
create trigger on_auth_user_created_email
  after insert on auth.users
  for each row execute function handle_new_email_user();

-- RPC to link a profile to a member after email OTP verification (migration 017).
-- Only updates when member_id is still null — prevents overwriting a legitimate link.
create or replace function link_profile_to_member(p_user_id uuid, p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update profiles
  set member_id = p_member_id
  where id = p_user_id
    and member_id is null;
end;
$$;
grant execute on function link_profile_to_member(uuid, uuid) to authenticated;

-- ── Migration 021: back-fill existing unlinked profiles ───────────────────────
-- Match by phone first, then by email for any still-unlinked profiles.
-- Both are idempotent — only set member_id where it is currently NULL.
update profiles p
set member_id = m.id
from auth.users u
join members m on m.mobile = u.phone
where p.id = u.id
  and p.member_id is null
  and u.phone is not null
  and u.phone <> '';

update profiles p
set member_id = m.id
from auth.users u
join members m on lower(m.email) = lower(u.email)
where p.id = u.id
  and p.member_id is null
  and u.email is not null
  and u.email <> '';

-- Admin RPC to manually link a profile to a member (migration 021).
create or replace function link_member_to_profile(
  p_profile_id uuid,
  p_member_id  uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from profiles
    where id = auth.uid()
      and role in ('super_admin','admin','parish_priest','church_secretary')
  ) then
    raise exception 'Permission denied: staff role required.';
  end if;
  -- Clear any stale link: another profile already points to this member.
  update profiles
  set member_id = null
  where member_id = p_member_id
    and id <> p_profile_id;
  -- Set the new link.
  update profiles set member_id = p_member_id where id = p_profile_id;
end;
$$;
grant execute on function link_member_to_profile(uuid, uuid) to authenticated;

-- Returns the login profile (id, username, role, is_active) currently linked
-- to a given member row. Used by MemberProfileScreen (admin view).
create or replace function get_profile_by_member_id(p_member_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result json;
begin
  if not exists (
    select 1 from profiles
    where id = auth.uid()
      and role in ('super_admin','admin','parish_priest','church_secretary')
  ) then
    raise exception 'Permission denied: staff role required.';
  end if;

  select row_to_json(p) into v_result
  from (
    select id, username, role, is_active
    from profiles
    where member_id = p_member_id
    limit 1
  ) p;

  return v_result;
end;
$$;
grant execute on function get_profile_by_member_id(uuid) to authenticated;

-- =========================================================================
-- BCC UNITS  (Basic Christian Communities)
-- Run this block on an existing database to add the bcc_units table and
-- the member_number auto-generation function. Safe to re-run.
-- =========================================================================

create table if not exists bcc_units (
  id   uuid primary key default uuid_generate_v4(),
  name text not null,
  ward text not null default 'Ward 1',
  description text,
  is_active boolean default true,
  created_at timestamptz default now()
);

alter table bcc_units enable row level security;

-- Any signed-in user can read BCC units (needed for dropdowns everywhere).
drop policy if exists "bcc_read" on bcc_units;
create policy "bcc_read" on bcc_units for select using (auth.uid() is not null);

-- Priest, Admin, Church Secretary (and Super Admin via is_admin()) can manage.
drop policy if exists "bcc_staff_write" on bcc_units;
create policy "bcc_staff_write" on bcc_units for all
  using (is_admin()) with check (is_admin());

-- =========================================================================
-- MEMBER NUMBER AUTO-GENERATION
-- Generates the next member number in the format MEM-0001, MEM-0002, …
-- Called server-side so two concurrent inserts can never get the same number.
-- =========================================================================
create sequence if not exists member_number_seq;

-- Consumes the next sequence value — call only at INSERT time.
create or replace function next_member_number() returns text as $$
  select 'MEM-' || lpad(nextval('member_number_seq')::text, 4, '0');
$$ language sql;

-- Peeks at what the next number WOULD be without consuming it.
-- Used by the UI to show a preview on screen open; cancelling never wastes a number.
-- Falls back to the highest existing MEM-XXXX + 1 if the sequence hasn't been used yet.
create or replace function peek_next_member_number() returns text as $$
declare
  seq_val bigint;
  max_val bigint;
begin
  -- last_value is the last value nextval returned (or the start value if never called).
  -- is_called = false means the sequence hasn't fired yet, so last_value is the start.
  select case when is_called then last_value + 1 else last_value end
    into seq_val
    from member_number_seq;

  -- Also check the actual max already in the table (covers manual entries and
  -- rows added before the sequence existed).
  select coalesce(
    max(cast(regexp_replace(member_number, '[^0-9]', '', 'g') as bigint)), 0
  ) + 1 into max_val
  from members
  where member_number ~ '^MEM-[0-9]+$';

  return 'MEM-' || lpad(greatest(seq_val, max_val)::text, 4, '0');
end;
$$ language plpgsql stable security definer;


-- =========================================================================
-- MEMBER LOGIN LOOKUP  (anon-safe RPC)
-- Called before the user is authenticated, so it runs with the anon key.
-- security definer + explicit search_path means it bypasses RLS and can
-- read the members table, but only returns the minimum fields needed for
-- the login flow — no sensitive data is exposed.
--
-- Behaviour:
--   p_identifier = phone (E.164)   → exact match on members.mobile
--   p_identifier = email            → case-insensitive match on members.email
--   p_identifier = member number    → case-insensitive match on members.member_number
--   p_member_id  (optional)         → when provided alongside a phone/email,
--                                     narrow the result to that one member_number
--                                     (used when duplicate phone/email hits are found
--                                      and the user supplies their member ID to
--                                      disambiguate).
-- Returns: id, first_name, last_name, member_number, mobile, email
--          only for active members.
-- =========================================================================
drop function if exists lookup_member_for_login(text, text);

create or replace function lookup_member_for_login(
  p_identifier text,
  p_member_id  text default null
)
returns table (
  id                        uuid,
  first_name                text,
  last_name                 text,
  member_number             text,
  mobile                    text,
  email                     text,
  basic_christian_community text
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
      m.email,
      m.basic_christian_community
    from members m
    where
      m.status = 'active'
      and (
        m.mobile          =  v_trimmed          -- exact phone match
        or lower(m.email) =  lower(v_trimmed)   -- case-insensitive email
        or lower(m.member_number) = lower(v_trimmed)  -- case-insensitive member ID
      )
      -- when a member_id disambiguator is supplied, restrict to that one row
      and (v_mid = '' or lower(m.member_number) = lower(v_mid));
end;
$$;

-- Grant execute to the anon role so unauthenticated clients can call it.
grant execute on function lookup_member_for_login(text, text) to anon;

-- =========================================================================
-- GUEST CERTIFICATE RPCS  (anon-safe, security definer)
-- Used when OTP is disabled and the member has no Supabase session.
-- Both RPCs accept the member's UUID directly and bypass RLS.
-- =========================================================================

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

-- Fetch the family record (with members) for a guest member.
-- Returns the family row; members are fetched client-side via getMembers.
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

-- Fetch members of the same family as a guest member (for FamilyScreen list).
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

-- Fetch the member profile for the currently authenticated user (migration 020).
-- SECURITY DEFINER — bypasses RLS completely; reads profiles.member_id
-- server-side so it works even if members_self_select hasn't been applied yet.
create or replace function get_my_member_profile()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
  v_member    json;
begin
  select member_id into v_member_id
  from profiles
  where id = auth.uid()
  limit 1;

  if v_member_id is null then
    return null;
  end if;

  select row_to_json(m) into v_member
  from members m
  where m.id = v_member_id;

  return v_member;
end;
$$;
grant execute on function get_my_member_profile() to authenticated;

-- Fetch a family + its active members for authenticated users (migration 016).
-- Runs with SECURITY DEFINER to bypass RLS — works even when the caller's
-- profiles.member_id is not yet linked (my_family_id() would return null).
create or replace function get_family_with_members(p_family_id uuid)
returns json
language plpgsql
security definer
stable
as $$
declare
  v_family  json;
  v_members json;
begin
  select row_to_json(f) into v_family
  from families f
  where f.id = p_family_id;

  select json_agg(m order by m.first_name) into v_members
  from members m
  where m.family_id = p_family_id
    and m.status = 'active';

  return json_build_object(
    'family',  v_family,
    'members', coalesce(v_members, '[]'::json)
  );
end;
$$;
grant execute on function get_family_with_members(uuid) to authenticated;

-- =========================================================================
-- LITURGY ASSIGNMENTS  (migration 007)
-- Priest assigns a BCC unit to a liturgy date. Notifications are sent
-- in-app on creation and as a same-day reminder (see LiturgyContext.js).
-- =========================================================================
create table if not exists liturgy_assignments (
  id            uuid primary key default uuid_generate_v4(),
  bcc_unit_id   uuid references bcc_units(id) on delete set null,
  bcc_unit_name text,
  org_id        uuid references organizations(id) on delete set null,
  org_name      text,
  liturgy_date  date not null,
  notes         text,
  assigned_by   uuid references profiles(id) on delete set null,
  created_at    timestamptz default now()
);

-- Migration 008 columns (idempotent).
alter table liturgy_assignments add column if not exists org_id   uuid references organizations(id) on delete set null;
alter table liturgy_assignments add column if not exists org_name text;
-- bcc_unit_name was NOT NULL; relax to allow org-only rows on existing DBs.
alter table liturgy_assignments alter column bcc_unit_name drop not null;

alter table liturgy_assignments enable row level security;

-- Liturgy schedule is public information — allow anon (guest) reads too.
drop policy if exists "liturgy_read" on liturgy_assignments;
drop policy if exists "liturgy_read_anon" on liturgy_assignments;
create policy "liturgy_read_anon" on liturgy_assignments
  for select using (true);

drop policy if exists "liturgy_staff_write" on liturgy_assignments;
create policy "liturgy_staff_write" on liturgy_assignments
  for all using (is_admin()) with check (is_admin());

drop policy if exists "notifications_liturgy_insert" on notifications;
create policy "notifications_liturgy_insert" on notifications for insert
  with check (auth.uid() is not null and type in ('LITURGY', 'LITURGY_REMINDER'));

-- =========================================================================
-- CALENDAR BIRTHDAYS RPC  (migration 008 + 030)
-- Returns all active member DOBs to any authenticated or anon caller.
-- row_security=off ensures members RLS is never evaluated inside this
-- function, preventing the circular recursion error on member sessions.
-- =========================================================================
create or replace function get_calendar_birthdays()
returns table (
  id             uuid,
  first_name     text,
  last_name      text,
  date_of_birth  date
)
language sql
security definer
stable
set search_path = public
set row_security = off
as $$
  select id, first_name, last_name, date_of_birth
  from members
  where status = 'active'
    and date_of_birth is not null;
$$;

grant execute on function get_calendar_birthdays() to authenticated;
grant execute on function get_calendar_birthdays() to anon;

-- =========================================================================
-- PARISH SETTINGS  (migration 010)
-- Single-row table — id is always 1. All app instances read on boot and
-- subscribe via Supabase Realtime so admin changes propagate instantly.
-- =========================================================================
create table if not exists parish_settings (
  id              int primary key default 1,
  name            text,
  description     text,
  logo_uri        text,
  primary_color   text default '#6B1E3C',
  secondary_color text default '#C9A24B',
  accent_color    text default '#2E7A4F',
  member_otp_enabled boolean default false,
  updated_at      timestamptz default now(),
  constraint parish_settings_singleton check (id = 1)
);

insert into parish_settings (id) values (1) on conflict (id) do nothing;

alter table parish_settings enable row level security;

drop policy if exists "parish_settings_read" on parish_settings;
create policy "parish_settings_read" on parish_settings
  for select using (true);

drop policy if exists "parish_settings_admin_write" on parish_settings;
create policy "parish_settings_admin_write" on parish_settings
  for all using (is_admin()) with check (is_admin());

alter publication supabase_realtime add table parish_settings;

-- =========================================================================
-- MIGRATION 011: Push notification tokens + member self-edit RLS
-- =========================================================================

-- push_tokens — Expo push tokens per device/user
create table if not exists push_tokens (
  token       text        primary key,
  user_id     uuid        references auth.users(id) on delete cascade,
  updated_at  timestamptz not null default now()
);

create index if not exists push_tokens_user_id_idx on push_tokens(user_id);

alter table push_tokens enable row level security;

drop policy if exists "push_tokens_upsert_own" on push_tokens;
create policy "push_tokens_upsert_own" on push_tokens
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "push_tokens_staff_read" on push_tokens;
create policy "push_tokens_staff_read" on push_tokens
  for select
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super_admin','parish_priest','admin','church_secretary')
    )
  );

-- Migration 013 (superseded by 014): broad push_tokens read policy removed.
drop policy if exists "push_tokens_member_read" on push_tokens;

-- =========================================================================
-- MIGRATION 014: Security-definer RPC for targeted member push tokens
--                + notification delete policy + notification_reads unique key
-- =========================================================================

-- Security-definer RPC so any authenticated user can get tokens for a member.
create or replace function get_push_tokens_for_member(p_member_id uuid)
returns table (token text)
language sql
security definer
stable
as $$
  select pt.token
  from push_tokens pt
  inner join profiles p on p.id = pt.user_id
  where p.member_id = p_member_id
    and pt.token is not null;
$$;
grant execute on function get_push_tokens_for_member(uuid) to authenticated;

-- Allow staff to delete notifications ("Clear All" feature).
drop policy if exists "notifications_admin_delete" on notifications;
create policy "notifications_admin_delete" on notifications
  for delete
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super_admin','parish_priest','admin','church_secretary')
    )
  );

-- Unique constraint on notification_reads so upsert works correctly.
alter table notification_reads
  drop constraint if exists notification_reads_notification_id_user_id_key;
alter table notification_reads
  add constraint notification_reads_notification_id_user_id_key
  unique (notification_id, user_id);

-- Member self-update RLS: allows a member to update their own safe fields.
-- migration 028: use my_member_id() to avoid circular RLS with profiles join.
drop policy if exists "members_self_update" on members;
create policy "members_self_update" on members
  for update
  using    (id = my_member_id())
  with check (id = my_member_id());

-- =========================================================================
-- MIGRATION 012: Supabase Storage — parish-assets bucket for logo
-- =========================================================================

do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'parish-assets', 'parish-assets', true, 2097152,
    array['image/jpeg','image/png','image/webp','image/gif']
  )
  on conflict (id) do nothing;
end $$;

drop policy if exists "parish_assets_public_read"   on storage.objects;
drop policy if exists "parish_assets_admin_insert"  on storage.objects;
drop policy if exists "parish_assets_admin_update"  on storage.objects;
drop policy if exists "parish_assets_admin_delete"  on storage.objects;

create policy "parish_assets_public_read" on storage.objects
  for select using (bucket_id = 'parish-assets');

create policy "parish_assets_admin_insert" on storage.objects
  for insert with check (
    bucket_id = 'parish-assets' and exists (
      select 1 from public.profiles where profiles.id = auth.uid()
        and profiles.role in ('super_admin','parish_priest','admin','church_secretary')
    )
  );

create policy "parish_assets_admin_update" on storage.objects
  for update using (
    bucket_id = 'parish-assets' and exists (
      select 1 from public.profiles where profiles.id = auth.uid()
        and profiles.role in ('super_admin','parish_priest','admin','church_secretary')
    )
  );

create policy "parish_assets_admin_delete" on storage.objects
  for delete using (
    bucket_id = 'parish-assets' and exists (
      select 1 from public.profiles where profiles.id = auth.uid()
        and profiles.role in ('super_admin','parish_priest','admin','church_secretary')
    )
  );

-- =========================================================================
-- MIGRATION 019: member-photos storage bucket
-- =========================================================================

do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'member-photos', 'member-photos', true, 5242880,
    array['image/jpeg','image/png','image/webp']
  )
  on conflict (id) do nothing;
end $$;

drop policy if exists "member_photos_public_read"   on storage.objects;
drop policy if exists "member_photos_self_insert"   on storage.objects;
drop policy if exists "member_photos_self_update"   on storage.objects;
drop policy if exists "member_photos_self_delete"   on storage.objects;
drop policy if exists "member_photos_anon_insert"   on storage.objects;
drop policy if exists "member_photos_anon_update"   on storage.objects;

create policy "member_photos_public_read" on storage.objects
  for select using (bucket_id = 'member-photos');

-- Authenticated self-upload + admin upload (migration 025 combined)
create policy "member_photos_self_insert" on storage.objects
  for insert
  with check (
    bucket_id = 'member-photos'
    and auth.uid() is not null
    and (
      (storage.foldername(name))[1] = (
        select member_id::text from public.profiles
        where profiles.id = auth.uid() limit 1
      )
      or exists (
        select 1 from public.profiles
        where profiles.id = auth.uid()
          and profiles.role in ('super_admin','admin','parish_priest','church_secretary')
      )
    )
  );

create policy "member_photos_self_update" on storage.objects
  for update
  using (
    bucket_id = 'member-photos'
    and auth.uid() is not null
    and (
      (storage.foldername(name))[1] = (
        select member_id::text from public.profiles
        where profiles.id = auth.uid() limit 1
      )
      or exists (
        select 1 from public.profiles
        where profiles.id = auth.uid()
          and profiles.role in ('super_admin','admin','parish_priest','church_secretary')
      )
    )
  );

create policy "member_photos_self_delete" on storage.objects
  for delete
  using (
    bucket_id = 'member-photos'
    and (
      (storage.foldername(name))[1] = (
        select member_id::text from public.profiles
        where profiles.id = auth.uid() limit 1
      )
      or exists (
        select 1 from public.profiles
        where profiles.id = auth.uid()
          and profiles.role in ('super_admin','parish_priest','admin','church_secretary')
      )
    )
  );

-- Migration 027: anon (guest) members can upload to their own folder
create policy "member_photos_anon_insert" on storage.objects
  for insert
  with check (
    bucket_id = 'member-photos'
    and auth.uid() is null
    and exists (
      select 1 from public.members
      where members.id = ((storage.foldername(name))[1])::uuid
        and members.status = 'active'
    )
  );

create policy "member_photos_anon_update" on storage.objects
  for update
  using (
    bucket_id = 'member-photos'
    and auth.uid() is null
    and exists (
      select 1 from public.members
      where members.id = ((storage.foldername(name))[1])::uuid
        and members.status = 'active'
    )
  );

-- Migration 027: guest RPC to persist photo URL without an auth session
create or replace function guest_update_member_photo(
  p_member_id uuid,
  p_photo_url text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update members set photo = p_photo_url
  where id = p_member_id and status = 'active';
end;
$$;
grant execute on function guest_update_member_photo(uuid, text) to anon;

-- =========================================================================
-- MIGRATION 032 + 035: get_my_notifications RPC
-- Single server-side query replacing the 3-round-trip client join.
-- Returns all non-expired, non-dismissed notifications for the caller,
-- plus a `read` boolean from notification_reads.
-- Migration 035 adds BCC_UNIT scoping: target='BCC_UNIT' rows are only
-- returned to members whose BCC unit matches metadata->>'bcc_unit_name'.
-- Staff (admin/priest/secretary) always see all BCC_UNIT notifications.
-- =========================================================================

create or replace function get_my_notifications()
returns table (
  id           uuid,
  title        text,
  message      text,
  type         text,
  target       text,
  target_id    uuid,
  created_by   uuid,
  created_at   timestamptz,
  metadata     jsonb,
  expires_at   timestamptz,
  read         boolean
)
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  with
  caller as (
    select auth.uid() as uid
  ),
  caller_profile as (
    select member_id, role
    from   profiles
    where  id = (select uid from caller)
    limit  1
  ),
  -- Resolve caller's BCC unit: member-level first, then family-level fallback.
  caller_bcc as (
    select coalesce(
      m.basic_christian_community,
      f.basic_christian_community
    ) as bcc_unit
    from   caller_profile cp
    left   join members  m on m.id  = cp.member_id
    left   join families f on f.id  = m.family_id
  ),
  -- True if the caller is a staff role who should see all notifications.
  caller_is_staff as (
    select (cp.role in ('super_admin','admin','parish_priest','church_secretary')) as is_staff
    from   caller_profile cp
  ),
  dismissed as (
    select notification_id
    from   notification_dismissals
    where  user_id = (select uid from caller)
  ),
  read_ids as (
    select notification_id
    from   notification_reads
    where  user_id = (select uid from caller)
  ),
  -- Broadcast and BCC-unit-targeted notifications (non-WISH).
  broadcasts as (
    select n.*
    from   notifications n
    cross  join caller_bcc  cb
    cross  join caller_is_staff cs
    where  n.type <> 'WISH'
    and    (n.expires_at is null or n.expires_at > now())
    and    n.id not in (select notification_id from dismissed)
    and    (
             -- Regular broadcasts go to everyone.
             n.target = 'ALL'
             -- BCC_UNIT notifications: staff see all; others only see their unit.
             or (
               n.target = 'BCC_UNIT'
               and (
                 cs.is_staff = true
                 or cb.bcc_unit is not null
                    and cb.bcc_unit = n.metadata->>'bcc_unit_name'
               )
             )
           )
  ),
  -- WISH notifications targeted to this user (non-dismissed).
  wishes as (
    select n.*
    from   notifications n
    join   caller_profile cp on cp.member_id is not null
    where  n.type   = 'WISH'
    and    n.target = 'MEMBER'
    and    n.target_id = cp.member_id
    and    n.id not in (select notification_id from dismissed)
  )
  select
    n.id,
    n.title,
    n.message,
    n.type,
    n.target,
    n.target_id,
    n.created_by,
    n.created_at,
    n.metadata,
    n.expires_at,
    (n.id in (select notification_id from read_ids)) as read
  from (
    select * from broadcasts
    union all
    select * from wishes
  ) n
  order by n.created_at desc;
$$;

grant execute on function get_my_notifications() to authenticated;

-- =========================================================================
-- MIGRATION 033: get_members_by_bcc RPC
-- BCC may be on the family row, not the member row.  This RPC does a LEFT
-- JOIN families and ORs both columns, so unit member lists are complete.
-- =========================================================================

create or replace function get_members_by_bcc(
  p_bcc_unit text,
  p_search   text default ''
)
returns setof members
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select m.*
  from   members m
  left   join families f on f.id = m.family_id
  where  (
           m.basic_christian_community = p_bcc_unit
           or f.basic_christian_community = p_bcc_unit
         )
  and (
    p_search = ''
    or m.first_name    ilike '%' || p_search || '%'
    or m.last_name     ilike '%' || p_search || '%'
    or m.member_number ilike '%' || p_search || '%'
    or m.mobile        ilike '%' || p_search || '%'
  )
  order by m.first_name;
$$;

grant execute on function get_members_by_bcc(text, text) to authenticated;

-- =========================================================================
-- MIGRATION 034: get_push_tokens_for_bcc RPC
-- Returns Expo push tokens for all members of a given BCC unit.
-- Mirrors the OR logic from migration 033: checks both member-level and
-- family-level basic_christian_community. Used by createLiturgyAssignment
-- to send targeted push notifications to the assigned unit only.
-- =========================================================================

create or replace function get_push_tokens_for_bcc(
  p_bcc_unit        text,
  p_exclude_user_id uuid default null
)
returns table (token text)
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select distinct pt.token
  from   push_tokens pt
  join   profiles    pr on pr.id         = pt.user_id
  join   members     m  on m.id          = pr.member_id
  left   join families f  on f.id        = m.family_id
  where  pt.token is not null
  and    (
           m.basic_christian_community = p_bcc_unit
           or f.basic_christian_community = p_bcc_unit
         )
  and    (p_exclude_user_id is null or pt.user_id <> p_exclude_user_id);
$$;

grant execute on function get_push_tokens_for_bcc(text, uuid) to authenticated;
