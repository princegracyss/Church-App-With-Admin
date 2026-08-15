# Parish Connect — Church Management App

A cross-platform (Android + iOS, same codebase) mobile app built for the
architecture in `Church_Management_System_Architecture_and_Database_Design.md`,
using **React Native + Expo** for the app and **Supabase** as the backend.

## Why Supabase

- **Postgres underneath** — your DB design (`families → members → sacraments →
  donations`, all foreign keys) drops in almost unchanged as real tables, not
  reshaped into documents.
- **No server to run** — the app talks to Supabase directly; there's no NestJS/
  Express API to host, patch, or scale yourself.
- **Row Level Security replaces the backend's role checks** — `supabase/schema.sql`
  encodes the same rules a hand-written `RolesGuard` would (admins get full CRUD,
  members/family heads can only read their own family) directly on the database.
- Built-in Auth (email/password), Storage (for photos/documents/certificates),
  and a generous free tier for a single-parish app.

## What's included

- Screens: Login, Dashboard, Member List, Member/My Profile, Family, Notifications,
  Events, Organizations, Sacraments, Donations, QR Membership Card, Advanced Search,
  Certificate requests, and placeholders for Reports / News.
- **Add / remove members** (this turn's focus): an admin-only "+" button on the
  Member List opens a form to add a member to a family; long-press a row (or the
  trash icon) to remove one. Removal is a *soft delete* — the member's `status`
  flips to `inactive` so their sacrament/donation/event history stays intact.
  Pass `{ hardDelete: true }` to `api.deleteMember()` if you ever need to actually
  erase a row created by mistake.
- `src/services/supabase.js` — the Supabase client, with session persistence via
  AsyncStorage so logins survive an app restart.
- `src/services/api.js` — one function per module (`getMembers`, `createMember`,
  `deleteMember`, `getFamily`, `getSacraments`, `requestCertificate`, …), each a
  thin wrapper over a Supabase table query. This is the only file that talks to
  the network — screens never call Supabase directly.
- `supabase/schema.sql` — every table from the architecture doc, plus Row Level
  Security policies enforcing the User Roles table.
- Role-aware `AuthContext`, synced live with Supabase's auth session.
- **Admin module**: `Manage Users` + `Add User` screens for creating and
  role-managing logins (Super Admin, Admin, Parish Priest, Church Secretary,
  Member), backed by the `create-parish-user` Supabase Edge Function and
  role-hierarchy RLS policies. A `Certificates → Approvals` tab lets the
  Parish Priest (or Super Admin) approve/reject certificate requests. See
  "Admin module & roles" below.
- **Mobile number + OTP sign-in**: a second tab on the Login screen for
  parishioners already in the Member List to sign themselves in with just
  their phone number — no admin has to create an account for them first. See
  "Mobile OTP sign-in" below for the one-time Supabase setup this needs.

## Set up Supabase

1. Create a free project at [supabase.com](https://supabase.com).
2. In the Supabase Dashboard, go to **SQL Editor → New query**, paste the entire
   contents of `supabase/schema.sql`, and run it. This creates every table and
   security policy in one shot. **Already have this project from before the
   admin module was added?** Just paste in the *new* `supabase/schema.sql` and
   run it again — it's written to be safe to re-run: it won't drop any table
   or touch your existing data, it only (re)creates the security rules/roles
   needed for the admin module. See "Upgrading an existing project" below for
   the two extra manual steps that come after this.
3. Go to **Project Settings → API** and copy your **Project URL** and **anon public
   key**. Paste them into `src/services/supabase.js`:
   ```js
   const SUPABASE_URL = 'https://xxxxxxxx.supabase.co';
   const SUPABASE_ANON_KEY = 'eyJ...';
   ```
4. **Deploy the `create-parish-user` Edge Function** (needed for the admin
   module's "Add User" screen — see below). Two ways to do this:

   **Option A — no install needed, from the Dashboard:**
   Go to **Edge Functions → Deploy a new function → Via editor**, name it
   `create-parish-user`, and paste in the contents of
   `supabase/functions/create-parish-user/index.ts`. Click **Deploy**. Done —
   skip Option B.

   **Option B — command line:**
   ```bash
   npm install -g supabase
   supabase login
   supabase link --project-ref your-project-ref
   supabase functions deploy create-parish-user
   ```
   `your-project-ref` is the short ID in your project's URL — e.g. if your
   dashboard/API URL is `https://mxfvodcxgakicjhgljcp.supabase.co`, the ref is
   `mxfvodcxgakicjhgljcp`. You can also find it under **Project Settings →
   General → Reference ID**. `supabase link` just tells the CLI on your
   computer which of your Supabase projects to deploy to.

   Either way, no extra secrets to set — Supabase injects `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` into every Edge Function automatically.
5. Create your first **Super Admin** login: **Authentication → Users → Add user**,
   enter an email + password, and note the generated User UID.
6. Back in **SQL Editor**, link that user to the Super Admin role:
   ```sql
   insert into profiles (id, username, role)
   values ('paste-the-user-uid-here', 'admin@yourparish.org', 'super_admin');
   ```
7. (Optional) Seed a family and yourself as a member so "My Profile"/"My Family"
   have something to show:
   ```sql
   insert into families (family_code, house_name, place, district, ward)
   values ('SFA-0001', 'Parish House', 'Kalamassery', 'Ernakulam', 'Ward 1')
   returning id;  -- copy the returned id for the next statement

   insert into members (family_id, member_number, first_name, last_name, is_family_head)
   values ('paste-family-id-here', 'MEM-0001', 'Parish', 'Admin', true)
   returning id;  -- copy this id too

   update profiles set member_id = 'paste-member-id-here' where username = 'admin@yourparish.org';
   ```
8. Sign in to the app with that email/password. As Super Admin you'll see a
   **Manage Users** card on the Dashboard — from there, use **+** to add your
   Admin, Parish Priest, Church Secretary, and Member accounts straight from
   the app instead of SQL. See "Admin module & roles" below for who can do
   what.

## Upgrading an existing project (already ran the old `schema.sql`)

If your Supabase project was set up before the admin module existed, do this
— nothing here deletes any of your existing families, members, or other data:

1. Paste the new `supabase/schema.sql` into **SQL Editor** and run it, same
   as a fresh install (step 2 above). It's written to be idempotent: it only
   updates the `profiles` role rule, functions, and security policies —
   your tables and rows are untouched.
2. Deploy the `create-parish-user` Edge Function (step 4 above) — this is new
   and won't exist yet on an older project.
3. Promote your existing admin login to Super Admin (or add a new one) in
   **SQL Editor**:
   ```sql
   update profiles set role = 'super_admin' where username = 'your-existing-admin-email';
   ```
   Note: any old accounts using the retired `coordinator` role are
   automatically remapped to `admin`, and `family_head` to `member`, by the
   schema script itself — you don't need to do this by hand, and re-running
   `schema.sql` won't fail because of them.

## Admin module & roles

| Role | Can add | Can reassign roles / deactivate accounts | Other permissions |
|---|---|---|---|
| **Super Admin** | Admin, Parish Priest, Church Secretary, Member | ✅ any account **except their own** (see below) | Full member/family management |
| **Admin** | Parish Priest, Church Secretary, Member | ❌ view only | Full member/family management |
| **Parish Priest** | Member | ❌ view only | **Approve / reject / issue certificate requests**; full member/family management |
| **Church Secretary** | Member | ❌ view only | Full member/family management |
| **Member** | — | — | View own profile/family, request certificates |

- **Manage Users** (Dashboard → Manage Users) is visible to Admin, Super
  Admin, Parish Priest and Church Secretary. Everyone in that group can view
  the full list and add new accounts (scoped to the roles in the table
  above); only a **Super Admin** sees the reassign-role and deactivate
  controls. Admin/Priest/Secretary get a "view only" notice instead.
- **A Super Admin can never edit their own row** from this screen — not
  their role, not their active status. This is deliberate: it's what
  prevents the exact lockout scenario where someone accidentally changes
  their own role away from `super_admin` and then can't undo it, because
  the database would (correctly) refuse a non-super-admin's request to fix
  it. It's enforced twice — the UI hides the controls on your own row, and
  the database policies (`profiles_super_admin_update` /
  `profiles_super_admin_delete` in `supabase/schema.sql`) reject the write
  even if the app is bypassed. If you ever do need to change a Super Admin's
  *own* role or status, do it from another Super Admin's account, or via
  **SQL Editor** (see "If you get locked out" below).
- **Add User** creates a real Supabase Auth login (email + temporary password)
  plus a `profiles` row with the chosen role, optionally linked to an existing
  family member record. The role picker only ever offers roles the signed-in
  user is allowed to grant (enforced both in the app and — again, so it can't
  be bypassed — inside the `create-parish-user` Edge Function and the
  `profiles` table's Row Level Security policies in `supabase/schema.sql`).
- **Certificates → Approvals** tab (visible to Parish Priest/Super Admin only)
  lists submitted certificate requests with Approve/Reject actions. A database
  trigger (`enforce_certificate_approval` in `supabase/schema.sql`) blocks
  anyone else from changing a request's status, even via direct API calls.
- Adding a plain **member** to the family register (no login) is unchanged —
  that's still the "+" on Member List → Add Member, available to any staff
  role (Admin, Super Admin, Parish Priest, Church Secretary).

## If you get locked out (e.g. your own Super Admin role got changed)

If a Super Admin account ends up without the `super_admin` role — most
commonly from an accidental self role-change before this version — the app
itself can no longer fix it (correctly: RLS won't let a non-super-admin
touch role assignments, including their own). Fix it directly in the
database, which runs as `postgres` and bypasses RLS entirely:

1. Supabase Dashboard → **SQL Editor**, find the affected account:
   ```sql
   select id, username, role from profiles order by role;
   ```
2. Restore it:
   ```sql
   update profiles set role = 'super_admin' where id = 'paste-that-row-id-here';
   ```
3. Sign out and back in on the device so the app picks up the corrected role.

This version prevents that from happening again going forward — see "A Super
Admin can never edit their own row" above.

## Mobile OTP sign-in

To let parishioners sign in with just their phone number (no admin has to
create their account first):

1. Supabase Dashboard → **Authentication → Providers → Phone**, enable it,
   and connect an SMS provider (Twilio, MessageBird, Vonage, or Textlocal are
   supported) with your own account/credentials there. Supabase doesn't send
   SMS on its own — this step is required or "Send code" will fail.
2. Make sure `supabase/schema.sql` has been run (it includes the
   `handle_new_phone_user` trigger that does the auto-linking below).
3. Store member mobile numbers in **E.164 format** (e.g. `+919876543210`, no
   spaces) via Add/Edit Member — this is what the auto-linking below matches
   against.

How it works: the first time someone verifies an OTP for a phone number, a
database trigger looks for a `members` row whose `mobile` matches exactly. If
found, it creates a `profiles` login for them with role `member`, linked to
that family member record — they land straight on their existing profile,
sacraments, family, etc. If no match is found, they still get a `member`
login (so they're never locked out), just unlinked — a Super Admin can link
it to a member record afterward from **Manage Users**, or by SQL:
```sql
update profiles set member_id = 'the-members-row-id' where username = '+919876543210';
```
Staff accounts (Admin, Parish Priest, Church Secretary, Super Admin) are
unaffected — those are always created deliberately via **Add User**, never
through this auto-provisioning path.

## Run it locally

Built for **Expo SDK 54** (React Native 0.81 / React 19, new architecture enabled).

```bash
npm install
npx expo install --fix   # aligns any dependency to the exact version SDK 54 expects
npx expo start
```

Scan the QR code with the **Expo Go** app (Android) or the Camera app (iOS) — make
sure Expo Go itself is updated, since it only runs projects matching its own SDK
version. Press `w` in the terminal to preview in a browser.

## Ship to Android & iOS

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform android   # produces an .aab for the Play Store
eas build --platform ios       # produces an .ipa for the App Store (needs an Apple Developer account)
eas submit --platform android
eas submit --platform ios
```

## Next steps worth prioritizing

- Edit-member form (Add Member's form reused with pre-filled values + an update call).
- Family creation flow (currently families are seeded via SQL or a future admin screen).
- Push notifications via Firebase Cloud Messaging or Expo Push (`expo-notifications`).
- PDF certificate generation + storage, wired to the `certificate_requests` table's
  `approve → issued_file_path` flow, using a Supabase Edge Function.
- Photo upload for member profiles via Supabase Storage (`documents`/`photo` columns
  already expect a storage path).
