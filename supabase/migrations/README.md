# Database Migrations

Each file here represents a discrete, incremental change to the database schema.

## How to apply

**For a brand-new project:**
Run the full baseline: `supabase/schema.sql` in the Supabase SQL Editor.
You do NOT need to run the individual migration files — `schema.sql` already includes everything.

**For an existing project (already has tables and data):**
Run ONLY the migration files you haven't applied yet, in order.
Never re-run a migration that has already been applied.

## Migration log

| File | What it does | Run on existing DB? |
|------|-------------|-------------------|
| `001_initial_schema.sql` | Marker only — use full `schema.sql` for fresh setup | No |
| `002_birthday_notification_policy.sql` | Allows any authenticated user to insert BIRTHDAY notifications | ✅ Yes |
| `003_member_login_lookup_rpc.sql` | Adds `lookup_member_for_login` anon-safe RPC for pre-auth member lookup | ✅ Yes |
| `004_guest_mode_rpcs.sql` | Adds 4 anon-safe RPCs for guest mode (OTP-disabled member login) | ✅ Yes |
| `005_birthday_lookup_rpc.sql` | Fixes "operator does not exist: date ~~* unknown" — RPC with `to_char` cast | ✅ Yes |
| `006_wish_notifications.sql` | Adds `metadata jsonb` column to notifications; adds WISH insert/read RLS policies | ✅ Yes |
| `007_liturgy_assignments.sql` | Adds `liturgy_assignments` table + LITURGY/LITURGY_REMINDER notification policies | ✅ Yes |
| `008_org_liturgy.sql` | Extends liturgy_assignments to support Organizations as liturgy hosts | ✅ Yes |
| `009_liturgy_anon_read.sql` | Allows anon role to read liturgy_assignments (schedule visible before login) | ✅ Yes |
| `010_parish_settings.sql` | Adds `parish_settings` table for branding / OTP toggle | ✅ Yes |
| `011_push_tokens_member_self_edit.sql` | Adds `push_tokens` table + member self-update RLS policy | ✅ Yes |
| `012_parish_logo_storage.sql` | Creates `parish-assets` storage bucket + access policies for logo uploads | ✅ Yes |
| `013_push_tokens_member_read.sql` | (Superseded by 014) Intermediate broad push_tokens read policy — apply only if skipping to 014 | ✅ Yes |
| `014_push_rpc_and_notif_delete.sql` | `get_push_tokens_for_member` security-definer RPC + notifications delete policy + notification_reads unique key | ✅ Yes |
| `015_notification_dismissed.sql` | `dismissed` column on `notification_reads` (superseded by 018 but still needed) | ✅ Yes |
| `016_get_family_rpc.sql` | `get_family_with_members()` security-definer RPC for family screen | ✅ Yes |
| `017_email_otp_profile_link.sql` | Email OTP DB trigger + `link_profile_to_member()` RPC | ✅ Yes |
| `018_self_read_and_dismissals.sql` | `members_self_select` RLS policy + `notification_dismissals` table + `dismiss_notifications()` RPC | ✅ Yes |
| `019_member_photos_storage.sql` | `member-photos` storage bucket + per-member RLS policies | ✅ Yes |
| `020_notification_expiry_and_member_rpc.sql` | `expires_at` column on notifications + `get_my_member_profile()` security-definer RPC | ✅ Yes |
| `021_backfill_member_links.sql` | Back-fills `profiles.member_id` by matching phone/email + `link_member_to_profile()` admin RPC | ✅ Yes |
| `022_lookup_member_add_bcc.sql` | Adds `basic_christian_community` to `lookup_member_for_login` return columns — fixes guest wish sender unit | ✅ Yes |
| `023_link_member_rpc_and_profile_lookup.sql` | Updates `link_member_to_profile` to clear stale links on re-link + adds `get_profile_by_member_id` RPC for admin member-profile screen | ✅ Yes |
| `024_unit_admin_role.sql` | `unit_admin` role support — BCC-scoped edit access | ✅ Yes |
| `025_member_photos_admin_write.sql` | Admin write access to member-photos storage bucket | ✅ Yes |
| `026_member_family_self_read.sql` | `families_member_select` + `members_own_family_select` RLS policies — member can read their own family and its members even when `profiles.member_id` link is missing | ✅ Yes |
| `027_guest_photo_upload.sql` | Anon storage policies for `member-photos` bucket + `guest_update_member_photo()` RPC — allows guest (no Supabase session) members to upload their own profile photo | ✅ Yes |
| `028_fix_circular_rls.sql` | Adds `my_member_id()` security-definer function; rewrites `members_self_select`, `members_own_family_select`, `families_member_select`, `members_self_update` to use it — fixes circular RLS that broke `currentProfile()` for admin users | ✅ Yes |

## Adding a new migration

1. Create `005_your_change_description.sql`
2. Write only the SQL for the new change (not the full schema)
3. Add a row to the table above
4. Run it once in Supabase SQL Editor on the live project
5. The change is automatically reflected in `schema.sql` when you update that file too
