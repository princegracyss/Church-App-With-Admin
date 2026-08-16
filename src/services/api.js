import { supabase } from './supabase';
import { sendPushToAll, sendPushToAllExcept, sendPushToMember, sendPushToBccUnit } from './pushNotifications';

// Every function maps to a table in supabase/schema.sql, named to match the
// architecture doc (members, families, sacraments, ...). Row Level Security
// policies on those tables are what actually enforce who can read/write what —
// this file just shapes the queries the screens call.

function unwrap({ data, error }) {
  if (error) {
    // PGRST116 = "Cannot coerce the result to a single JSON object" — this
    // is what Supabase returns when a .single() query matches zero rows.
    // For writes (update/insert/delete) that almost always means Row Level
    // Security silently blocked the change rather than the row not
    // existing — the write actually reached the database and either
    // matched nothing you're allowed to touch, or (for an UPDATE) matched
    // a row but the *result* of the update wasn't something you're allowed
    // to see back. Surface something actionable instead of the raw
    // Postgres message.
    if (error.code === 'PGRST116') {
      throw new Error("That change wasn't allowed — you may not have permission to modify this record.");
    }
    throw new Error(error.message);
  }
  return data;
}

// ── Guest member store ────────────────────────────────────────────────────────
// When OTP is disabled, the user logs in as a guest (no Supabase session).
// AuthContext calls api.setGuestMember(memberRow) after lookup so that every
// api method that would normally call currentProfile() can fall back to this
// member row instead of returning null / throwing "no profile" errors.
let _guestMember = null;
export function setGuestMember(member) { _guestMember = member; }
export function clearGuestMember()     { _guestMember = null; _guestDismissed.clear(); }

// In-memory dismissed set for guest sessions (no Supabase session → no DB write).
// Cleared automatically when the guest logs out via clearGuestMember().
const _guestDismissed = new Set();

async function currentProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  // Select profiles only — no members join. Joining members here triggers
  // members RLS which calls my_member_id() which re-queries profiles while
  // profiles is still being evaluated → circular RLS → error → null profile.
  // bcc_unit is resolved separately below via a plain members query.
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();
  if (error) return null;
  // Resolve BCC unit separately (only needed for unit_admin scope checks).
  let bcc_unit = null;
  if (data?.member_id) {
    const { data: m } = await supabase
      .from('members')
      .select('basic_christian_community')
      .eq('id', data.member_id)
      .single();
    bcc_unit = m?.basic_christian_community ?? null;
  }
  return { ...data, bcc_unit };
}

export const api = {
  // ---- Auth ----------------------------------------------------------
  async login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    const profile = await currentProfile();
    if (!profile) throw new Error('No profile found for this account. Contact the parish office.');
    return { user: { id: data.user.id, ...profile } };
  },

  // ---- Mobile number + OTP sign-in ------------------------------------
  // Two-step flow: request a 6-digit SMS code, then verify it. Unlike
  // email/password logins (which only exist for accounts an Admin/Priest/
  // Secretary/Super Admin explicitly created via "Add User"), a *first-time*
  // OTP sign-in auto-provisions a `member` login for anyone whose phone
  // number matches an existing Member List entry — see the
  // `handle_new_phone_user` trigger in supabase/schema.sql. This is what
  // lets parishioners already in the family register log in themselves,
  // without staff having to create a login for every member by hand.
  //
  // `phone` must be in E.164 format, e.g. '+919876543210'.
  async requestOtp(phone) {
    const { error } = await supabase.auth.signInWithOtp({ phone });
    if (error) throw new Error(error.message);
  },

  async verifyOtp(phone, token) {
    const { data, error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
    if (error) throw new Error(error.message);
    // The auto-provisioning trigger runs synchronously as part of the
    // auth.users insert on first sign-in, so the profile should already
    // exist by the time we ask for it.
    const profile = await currentProfile();
    if (!profile) {
      throw new Error('Signed in, but no profile could be set up for this number. Contact the parish office.');
    }
    if (profile.is_active === false) {
      await supabase.auth.signOut();
      throw new Error('This account has been deactivated. Contact the parish office.');
    }
    return { user: { id: data.user.id, ...profile } };
  },

  async logout() {
    await supabase.auth.signOut();
  },

  // ---- Passwordless member login -----------------------------------------
  // Calls the lookup_member_for_login RPC (security definer, anon-safe) so
  // the query works before the user is authenticated — direct table queries
  // are blocked by RLS for unauthenticated sessions.
  //
  // p_member_id (optional): when the caller already knows the member number
  // (e.g. as a disambiguator after duplicate phone/email hits), pass it here
  // to narrow the result to exactly one row.
  async lookupMemberByIdentifier(identifier, memberIdDisambiguator = null) {
    const { data, error } = await supabase.rpc('lookup_member_for_login', {
      p_identifier: identifier.trim(),
      p_member_id:  memberIdDisambiguator ? memberIdDisambiguator.trim() : null,
    });
    if (error) throw new Error(error.message);
    return data || [];
  },

  // Step 2a: send an OTP to the member's registered mobile (E.164).
  async requestMemberOtpByPhone(phone) {
    const { error } = await supabase.auth.signInWithOtp({ phone });
    if (error) throw new Error(error.message);
  },

  // Step 2b: send a magic-link / OTP to the member's registered email.
  async requestMemberOtpByEmail(email) {
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) throw new Error(error.message);
  },

  // Step 3 (phone): verify the SMS OTP — same as the existing verifyOtp.
  // Re-exported here for clarity in the new member-login flow.
  async verifyMemberPhoneOtp(phone, token) {
    return api.verifyOtp(phone, token);
  },

  // Step 3 (email): verify a 6-digit email OTP (Supabase "OTP" type).
  // memberId: the UUID of the member resolved during the lookup step — used
  // to link profiles.member_id when the email trigger didn't fire (e.g. the
  // first time a member signs in via email OTP and the trigger already ran
  // but found no matching email in members table).
  async verifyMemberEmailOtp(email, token, memberId = null) {
    const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    if (error) throw new Error(error.message);

    // If the caller knows which member this is, make sure the profile is linked.
    // This is the safety net for when the DB trigger couldn't auto-link because
    // the member's email in the DB didn't exactly match the auth email, or the
    // trigger ran before the member row had an email set.
    if (memberId && data.user?.id) {
      await supabase
        .rpc('link_profile_to_member', { p_user_id: data.user.id, p_member_id: memberId })
        .catch(() => {});
    }

    const profile = await currentProfile();
    if (!profile) throw new Error('Signed in but no profile found. Contact the parish office.');
    if (profile.is_active === false) {
      await supabase.auth.signOut();
      throw new Error('This account has been deactivated. Contact the parish office.');
    }
    return { user: { id: data.user.id, ...profile } };
  },

  // Fires immediately with the current session, then on every login/logout.
  onAuthChange(callback) {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      callback(session ? { id: session.user.id, ...(await currentProfile()) } : null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      callback(session ? { id: session.user.id, ...(await currentProfile()) } : null);
    });
    return () => sub.subscription.unsubscribe();
  },

  // ---- Members ---------------------------------------------------------
  async getMyProfile() {
    // Guest mode — return the member row captured at lookup time directly.
    if (_guestMember) return _guestMember;
    // Use a security-definer RPC that bypasses RLS entirely.
    // This works even when migration 018 (members_self_select) hasn't been
    // applied yet, or when profiles.member_id is not linked.
    const { data, error } = await supabase.rpc('get_my_member_profile');
    if (error || !data) return null;
    return typeof data === 'string' ? JSON.parse(data) : data;
  },

  async getMember(memberId) {
    return unwrap(await supabase.from('members').select('*').eq('id', memberId).single());
  },

  async getMembers({ query: search, familyId, bccUnit } = {}) {
    // When filtering by BCC unit, BCC may be stored on the family row rather than
    // (or in addition to) the member row. The RPC get_members_by_bcc handles the
    // OR across both columns server-side. For other filters we use the table directly.
    if (bccUnit) {
      const { data, error } = await supabase.rpc('get_members_by_bcc', {
        p_bcc_unit: bccUnit,
        p_search:   search?.trim() ?? '',
      });
      if (error) throw new Error(error.message);
      return data ?? [];
    }
    let q = supabase.from('members').select('*').order('first_name');
    if (familyId) q = q.eq('family_id', familyId);
    if (search) {
      const s = search.trim();
      q = q.or(`first_name.ilike.%${s}%,last_name.ilike.%${s}%,member_number.ilike.%${s}%,mobile.ilike.%${s}%`);
    }
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data ?? [];
  },

  // Advanced search — any combination of criteria.
  // All params are optional; omitted params are not applied as filters.
  // `textField` + `text` do a free-text match on the chosen column.
  // Enum/fixed-value filters (gender, blood_group, etc.) do exact matches.
  // `ward` and `place` filter through the members' linked family.
  async searchMembers({
    textField = 'name',   // 'name'|'member_number'|'mobile'|'email'|'occupation'|'education'|'baptism_name'
    text = '',
    gender = '',
    bloodGroup = '',
    maritalStatus = '',
    status = '',
    bccUnit = '',
    ward = '',
    place = '',
    familyCode = '',
    houseName = '',
  } = {}) {
    // Base: join families so we can filter on ward / place / family_code / house_name
    let q = supabase
      .from('members')
      .select('*, families(family_code, house_name, ward, place)')
      .order('first_name');

    // --- free-text ---
    const t = text.trim();
    if (t) {
      switch (textField) {
        case 'member_number':
          q = q.ilike('member_number', `%${t}%`); break;
        case 'mobile':
          q = q.ilike('mobile', `%${t}%`); break;
        case 'email':
          q = q.ilike('email', `%${t}%`); break;
        case 'occupation':
          q = q.ilike('occupation', `%${t}%`); break;
        case 'education':
          q = q.ilike('education', `%${t}%`); break;
        case 'baptism_name':
          q = q.ilike('baptism_name', `%${t}%`); break;
        default: // 'name'
          q = q.or(`first_name.ilike.%${t}%,last_name.ilike.%${t}%`);
      }
    }

    // --- enum filters ---
    if (gender)        q = q.eq('gender', gender);
    if (bloodGroup)    q = q.eq('blood_group', bloodGroup);
    if (maritalStatus) q = q.eq('marital_status', maritalStatus);
    if (status)        q = q.eq('status', status);
    if (bccUnit)       q = q.eq('basic_christian_community', bccUnit);

    // --- family-level filters (family join columns) ---
    if (ward)       q = q.eq('families.ward', ward);
    if (place)      q = q.ilike('families.place', `%${place}%`);
    if (familyCode) q = q.ilike('families.family_code', `%${familyCode}%`);
    if (houseName)  q = q.ilike('families.house_name', `%${houseName}%`);

    const rows = unwrap(await q);
    // Flatten family fields onto each member for easy rendering
    return rows.map((m) => ({
      ...m,
      family_code:  m.families?.family_code  ?? null,
      house_name:   m.families?.house_name   ?? null,
      family_ward:  m.families?.ward         ?? null,
      family_place: m.families?.place        ?? null,
    }));
  },

  // Add a member — admin-only in the UI, and enforced again by the
  // "admins can insert members" RLS policy in supabase/schema.sql.
  async createMember(dto) {
    return unwrap(await supabase.from('members').insert({ ...dto, status: 'active' }).select().single());
  },

  async updateMember(memberId, dto) {
    return unwrap(await supabase.from('members').update(dto).eq('id', memberId).select().single());
  },

  // Self-update — called from MemberSelfEditScreen.
  // Only a whitelisted set of fields can be changed; the RLS policy on the
  // `members` table ensures the row belongs to the calling user.
  // Guest mode: photo-only updates use a security-definer RPC (no auth session).
  async updateMemberSelf(memberId, dto) {
    const ALLOWED = ['mobile','email','occupation','education','baptism_name','blood_group','marital_status','relationship_to_head','photo'];
    const safe = Object.fromEntries(Object.entries(dto).filter(([k]) => ALLOWED.includes(k)));
    if (_guestMember) {
      // No Supabase session — only photo can be updated via the anon-safe RPC.
      if (safe.photo) {
        const { error } = await supabase.rpc('guest_update_member_photo', {
          p_member_id: memberId,
          p_photo_url: safe.photo,
        });
        if (error) throw new Error(error.message);
      }
      return;
    }
    return unwrap(await supabase.from('members').update(safe).eq('id', memberId).select().single());
  },

  // Upload a member's own profile photo.
  //
  // Authenticated users  → Supabase Storage bucket (member-photos/<id>/photo.<ext>)
  // Guest users (no session) → base64 data URI saved directly to members.photo
  //   Storage RLS requires auth.uid() so guests can never write to the bucket.
  //   A data URI is ~33 % larger but avoids all storage permission issues and
  //   works on any Supabase project without extra bucket setup.
  async uploadMemberPhoto(memberId, localUri, mimeType) {
    const { readAsStringAsync, EncodingType } = require('expo-file-system/legacy');
    const base64 = await readAsStringAsync(localUri, { encoding: EncodingType.Base64 });

    // Resolve content-type: prefer the picker's mimeType, fall back to URI extension.
    const lower = localUri.toLowerCase();
    const contentType = mimeType
      || (lower.includes('.png')  ? 'image/png'
        : lower.includes('.webp') ? 'image/webp'
        : 'image/jpeg');

    // Guest path — no auth session, so Storage RLS would block the upload.
    // Store as a base64 data URI directly in the members.photo column instead.
    if (_guestMember) {
      return `data:${contentType};base64,${base64}`;
    }

    // Authenticated path — upload to Storage bucket.
    const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
    const objectPath = `${memberId}/photo.${ext}`;

    // Decode base64 → Uint8Array (pure JS, no atob needed)
    const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const lookup = new Uint8Array(256);
    for (let i = 0; i < CHARS.length; i++) lookup[CHARS.charCodeAt(i)] = i;
    const b64 = base64.replace(/[^A-Za-z0-9+/]/g, '');
    const len = b64.length;
    const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
    const bytes = new Uint8Array((len * 3) / 4 - pad);
    let p = 0;
    for (let i = 0; i < len; i += 4) {
      const a = lookup[b64.charCodeAt(i)];
      const b = lookup[b64.charCodeAt(i + 1)];
      const c = lookup[b64.charCodeAt(i + 2)];
      const d = lookup[b64.charCodeAt(i + 3)];
      bytes[p++] = (a << 2) | (b >> 4);
      if (p < bytes.length) bytes[p++] = ((b & 0xf) << 4) | (c >> 2);
      if (p < bytes.length) bytes[p++] = ((c & 0x3) << 6) | d;
    }

    const { error: uploadError } = await supabase.storage
      .from('member-photos')
      .upload(objectPath, bytes, { contentType, upsert: true, cacheControl: '3600' });
    if (uploadError) throw new Error(`Photo upload failed: ${uploadError.message}`);

    const { data } = supabase.storage.from('member-photos').getPublicUrl(objectPath);
    return `${data.publicUrl}?t=${Date.now()}`;
  },

  // Removing members — soft-delete by default (status: 'inactive') so
  // sacrament/donation/event history isn't orphaned. Pass hardDelete: true
  // to actually remove the row (e.g. a record created by mistake).
  async deleteMember(memberId, { hardDelete = false } = {}) {
    if (hardDelete) {
      unwrap(await supabase.from('members').delete().eq('id', memberId));
    } else {
      unwrap(await supabase.from('members').update({ status: 'inactive' }).eq('id', memberId));
    }
    return { deleted: true, hardDelete };
  },

  // ---- Families ----------------------------------------------------------
  async getFamilies() {
    return unwrap(await supabase.from('families').select('*').order('house_name'));
  },

  // Families that belong to a specific BCC unit, with member counts.
  async getFamiliesByBcc(bccName) {
    const families = unwrap(
      await supabase
        .from('families')
        .select('*, members(count)')
        .eq('basic_christian_community', bccName)
        .order('house_name'),
    );
    return families.map((f) => ({
      ...f,
      memberCount: Number(f.members?.[0]?.count ?? 0),
      needsHead: !f.head_member_id,
    }));
  },

  // Same as getFamilies but with a member count per family, and a flag for
  // families that don't have a head member yet — used by FamilyListScreen so
  // an interrupted "Add Family" flow (family created, head member never
  // added) is visible and resumable instead of silently orphaned.
  async getFamiliesWithStatus() {
    const families = unwrap(
      await supabase.from('families').select('*, members(count)').order('house_name'),
    );
    return families.map((f) => ({
      ...f,
      memberCount: Number(f.members?.[0]?.count ?? 0),
      needsHead: !f.head_member_id,
    }));
  },

  async getFamily(familyId) {
    if (_guestMember) {
      // Guest mode — no Supabase session; use anon-safe RPCs.
      const { data: familyRows, error: fErr } = await supabase.rpc('guest_get_my_family', {
        p_member_id: _guestMember.id,
      });
      if (fErr) throw new Error(fErr.message);
      const family = familyRows?.[0];
      if (!family) return null;
      const { data: members, error: mErr } = await supabase.rpc('guest_get_family_members', {
        p_member_id: _guestMember.id,
      });
      if (mErr) throw new Error(mErr.message);
      return { ...family, members: members || [] };
    }

    // Authenticated users: use the security-definer RPC (migration 016) so the
    // query works even when profiles.member_id is not yet linked. Fall back to
    // direct table queries if the RPC hasn't been deployed yet.
    const { data, error } = await supabase.rpc('get_family_with_members', {
      p_family_id: familyId,
    });
    if (!error && data) {
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      return { ...parsed.family, members: parsed.members || [] };
    }

    // Fallback: direct queries (works when migration 016 RPC is missing).
    const { data: fRow, error: fErr } = await supabase
      .from('families').select('*').eq('id', familyId).single();
    if (fErr) throw new Error(fErr.message);
    const { data: mRows } = await supabase
      .from('members').select('*').eq('family_id', familyId).eq('status', 'active').order('first_name');
    return { ...fRow, members: mRows || [] };
  },

  // Step 1 of the family-creation flow — family_code is generated by the
  // database (see generate_family_code() in schema.sql), so it's never sent
  // from the client. head_member_id is left null; the flow continues into
  // AddMemberScreen (isHeadMember: true) to add the head, then setFamilyHead
  // below links them. A family with no head yet is a valid, visible state
  // (see getFamiliesWithStatus), not an error condition.
  async updateFamily(familyId, dto) {
    return unwrap(
      await supabase.from('families').update(dto).eq('id', familyId).select().single(),
    );
  },

  async createFamily(dto) {
    return unwrap(await supabase.from('families').insert(dto).select().single());
  },

  // Step 3 — link the just-created head member back onto the family. A
  // plain idempotent UPDATE, safe to retry on its own if it fails right
  // after createMember succeeds (the realistic failure mode here is a
  // network blip between two calls made back-to-back, not a torn write).
  async setFamilyHead(familyId, memberId) {
    return unwrap(
      await supabase.from('families').update({ head_member_id: memberId }).eq('id', familyId).select().single(),
    );
  },

  // Only offered in the UI for families with zero members — deleting a
  // family that already has members would cascade-delete them too
  // (members.family_id is ON DELETE CASCADE), which is never what "clean up
  // a family I started by mistake" means.
  async deleteFamily(familyId) {
    unwrap(await supabase.from('families').delete().eq('id', familyId));
    return { deleted: true };
  },

  // ---- Notifications ----------------------------------------------------------

  // Fetch members whose birthday is today (same MM-DD regardless of year).
  // Uses the get_todays_birthdays RPC which casts date_of_birth to text
  // server-side — the JS .ilike() filter fails on Postgres DATE columns
  // ("operator does not exist: date ~~* unknown").
  async getTodaysBirthdays(allParish = false) {
    const today = new Date();
    const month = today.getMonth() + 1; // 1-based
    const day   = today.getDate();

    // Resolve family_id for member-scoped lookups.
    let familyId = null;
    if (!allParish) {
      if (_guestMember) {
        familyId = _guestMember.family_id ?? null;
      } else {
        // Direct profiles query — avoids the members join that caused circular RLS.
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: prof } = await supabase
            .from('profiles').select('member_id').eq('id', user.id).single();
          if (prof?.member_id) {
            const { data: mem } = await supabase
              .from('members').select('family_id').eq('id', prof.member_id).single();
            familyId = mem?.family_id ?? null;
          }
        }
      }
    }

    const { data, error } = await supabase.rpc('get_todays_birthdays', {
      p_month:     month,
      p_day:       day,
      p_family_id: familyId,
    });
    if (error) throw new Error(error.message);
    return data || [];
  },

  // Create a parish-wide notification row (admin/staff only in the UI).
  // type: 'GENERAL' | 'FEAST' | 'FUNERAL' | 'EMERGENCY' | 'BIRTHDAY'
  // After inserting, sends a push notification to all registered devices
  // except the creator's own device(s).
  async createNotification({ title, message, type = 'GENERAL', target = 'ALL', targetId = null } = {}) {
    const { data: { user } } = await supabase.auth.getUser();
    const row = unwrap(
      await supabase.from('notifications').insert({
        title,
        message,
        type,
        target,
        target_id: targetId,
        created_by: user?.id ?? null,
      }).select().single(),
    );

    // Send push to all devices except the admin who created it.
    sendPushToAllExcept(
      user?.id ?? null,
      title,
      message,
      { screen: 'Notifications', type },
    ).catch(() => {});

    return row;
  },

  // Mark one or more notifications as read for the current user.
  // Uses insert + ignoreDuplicates so it works even if the unique constraint
  // from migration 014 hasn't been applied yet.
  async markNotificationsRead(notificationIds) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !notificationIds?.length) return;
    const rows = notificationIds.map((id) => ({
      notification_id: id,
      user_id:         user.id,
    }));
    await supabase.from('notification_reads')
      .insert(rows, { ignoreDuplicates: true })
      .catch(() => {});
  },

  // Mark ALL notifications as read for the current user.
  // Skips notifications this user has dismissed.
  async markAllNotificationsRead() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [allResult, alreadyResult, dismissedResult] = await Promise.all([
      supabase.from('notifications').select('id'),
      supabase.from('notification_reads').select('notification_id').eq('user_id', user.id),
      supabase.from('notification_dismissals').select('notification_id').eq('user_id', user.id),
    ]);
    if (!allResult.data?.length) return;
    const readSet      = new Set((alreadyResult.data || []).map((r) => r.notification_id));
    const dismissedSet = new Set((dismissedResult.data || []).map((r) => r.notification_id));
    const unread = allResult.data.filter((n) => !readSet.has(n.id) && !dismissedSet.has(n.id));
    if (!unread.length) return;
    await supabase.from('notification_reads')
      .insert(unread.map((n) => ({ notification_id: n.id, user_id: user.id })),
              { ignoreDuplicates: true })
      .catch(() => {});
  },

  // Delete specific notifications by ID.
  // BIRTHDAY and WISH rows are always dismissed (per-user) rather than
  // hard-deleted — they are shared broadcast rows and hard-deleting them
  // causes BirthdayContext to re-insert them on the next login.
  // All other types are hard-deleted when the caller is an admin.
  // Guests: dismissed IDs stored in an in-memory Set for the session.
  async deleteNotifications(ids, isAdminUser = false) {
    if (!ids?.length) return;

    if (_guestMember) {
      ids.forEach((id) => _guestDismissed.add(id));
      return;
    }

    // Fetch types for the given ids so we can split hard-delete vs dismiss.
    const { data: rows } = await supabase
      .from('notifications').select('id, type').in('id', ids);

    const protectedTypes = new Set(['BIRTHDAY', 'WISH']);
    const toHardDelete = (rows || [])
      .filter((r) => isAdminUser && !protectedTypes.has(r.type))
      .map((r) => r.id);
    const toDismiss = ids.filter((id) => !toHardDelete.includes(id));

    if (toHardDelete.length) {
      const { error } = await supabase
        .from('notifications').delete().in('id', toHardDelete);
      if (error) throw new Error(error.message);
    }
    if (toDismiss.length) {
      const { error } = await supabase
        .rpc('dismiss_notifications', { p_ids: toDismiss });
      if (error) throw new Error(error.message);
    }
  },

  // Delete ALL general broadcast notifications (admin only).
  // Skips WISH (personal birthday wishes) and BIRTHDAY (auto-inserted daily,
  // auto-expire at UTC midnight — deleting them causes BirthdayContext to
  // re-insert on the next login since the dedup check finds no existing row).
  async clearAllNotifications() {
    const { error } = await supabase
      .from('notifications').delete()
      .not('type', 'in', '("WISH","BIRTHDAY")');
    if (error) throw new Error(error.message);
  },

  async getNotifications() {
    const { data: { user } } = await supabase.auth.getUser();

    // ── Guest path ───────────────────────────────────────────────────────────
    if (!user && !_guestMember) {
      const now = new Date().toISOString();
      const { data } = await supabase.from('notifications').select('*')
        .neq('type', 'WISH').or(`expires_at.is.null,expires_at.gt.${now}`)
        .order('created_at', { ascending: false });
      return (data || []).map((n) => ({ ...n, read: false }));
    }
    if (!user && _guestMember) {
      const now = new Date().toISOString();
      const { data } = await supabase.from('notifications').select('*')
        .neq('type', 'WISH').or(`expires_at.is.null,expires_at.gt.${now}`)
        .order('created_at', { ascending: false });
      return (data || [])
        .filter((n) => !_guestDismissed.has(n.id))
        .map((n) => ({ ...n, read: false }));
    }

    // ── Authenticated path ───────────────────────────────────────────────────
    // Use a single RPC that does all filtering server-side so the client
    // never has to reassemble results across multiple round-trips.
    const { data, error } = await supabase.rpc('get_my_notifications');
    if (error) throw new Error(error.message);
    return data || [];
  },

  // Send a birthday wish to a specific member.
  // Creates a WISH notification targeted to that member with metadata carrying
  // the chosen song URL, the sender's display name, and the wish message.
  async sendBirthdayWish(birthdayMemberId, { message, songUrl }) {
    // Resolve sender identity — works for authenticated users and guest mode.
    // NOTE: We intentionally ignore any `senderName` passed by the caller and
    // always look it up from the DB so wishes are never sent anonymously.
    let createdBy = null;
    let resolvedSenderName = null;
    let senderUnit = null;
    let senderMemberId = _guestMember?.id ?? null;
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      createdBy = user.id;
      // Always resolve from the member row (first_name + last_name) so the
      // wish is never sent anonymously regardless of what the caller passed.
      const profile = await currentProfile();
      if (profile?.member_id) {
        senderMemberId = profile.member_id;
        const { data: senderMember } = await supabase
          .from('members')
          .select('first_name, last_name, basic_christian_community')
          .eq('id', profile.member_id)
          .single();
        if (senderMember) {
          resolvedSenderName =
            `${senderMember.first_name ?? ''} ${senderMember.last_name ?? ''}`.trim() || null;
          senderUnit = senderMember.basic_christian_community ?? null;
        }
      }
      // Fall back: use username from profile (staff accounts may have no member row)
      if (!resolvedSenderName) {
        resolvedSenderName = profile?.username || 'A parish member';
      }
    } else if (_guestMember) {
      // Guest mode — name comes from the looked-up member row at login time.
      resolvedSenderName =
        `${_guestMember.first_name ?? ''} ${_guestMember.last_name ?? ''}`.trim() ||
        'A parish member';
      senderUnit = _guestMember.basic_christian_community ?? null;
    } else {
      resolvedSenderName = 'A parish member';
    }

    const { data: birthdayMember, error: bErr } = await supabase
      .from('members')
      .select('first_name, last_name')
      .eq('id', birthdayMemberId)
      .single();
    if (bErr) throw new Error(bErr.message);

    const title = `🎉 Birthday wish from ${resolvedSenderName}`;
    const body = message || `Wishing you a very happy birthday, ${birthdayMember.first_name}! 🎂`;

    const insertPayload = {
      title,
      message: body,
      type: 'WISH',
      target: 'MEMBER',
      target_id: birthdayMemberId,
      created_by: createdBy,
      metadata: {
        song_url: songUrl ?? null,
        sender_name: resolvedSenderName,
        sender_unit: senderUnit,
        sender_member_id: senderMemberId,
        wish_message: body,
        birthday_member_id: birthdayMemberId,
      },
    };

    const { data, error } = await supabase.from('notifications').insert(insertPayload).select().single();
    if (error) throw new Error(error.message);

    // Push notification — targeted to the birthday person's device(s).
    sendPushToMember(
      birthdayMemberId,
      insertPayload.title,
      `${resolvedSenderName} sent you a birthday wish 🎁`,
      { screen: 'Notifications', type: 'WISH' },
    ).catch(() => {});

    return data;
  },

  // ---- Events / Organizations / Sacraments / Donations ----------------------------
  async getEvents() {
    return unwrap(await supabase.from('events').select('*').order('start_date'));
  },

  // Merged calendar feed: DB events + all members' birthdays (month/day match for
  // the requested year) + liturgy assignments.
  // Returns an array of CalendarEvent objects:
  //   { id, iso, title, type, color, meta }
  //   type: 'event' | 'birthday' | 'liturgy'
  async getCalendarEvents(year) {
    // Fetch all three sources in parallel.
    // Birthdays use get_calendar_birthdays() RPC (security definer) so regular
    // members (blocked by members RLS) can still see parish-wide birthdays.
    const [eventsRes, birthdaysRes, liturgyRes] = await Promise.all([
      supabase.from('events').select('id, title, description, venue, start_date, end_date'),
      supabase.rpc('get_calendar_birthdays'),
      supabase.from('liturgy_assignments').select('id, bcc_unit_name, org_name, liturgy_date, notes'),
    ]);

    const result = [];
    const ys = String(year);

    // ── DB Events ──
    for (const e of (eventsRes.data || [])) {
      if (!e.start_date) continue;
      // Include multi-day events: one entry per day in range.
      const start = new Date(e.start_date + 'T00:00:00');
      const end   = e.end_date ? new Date(e.end_date + 'T00:00:00') : start;
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const iso = d.toISOString().slice(0, 10);
        if (!iso.startsWith(ys)) continue;
        result.push({ id: `ev-${e.id}-${iso}`, iso, title: e.title, type: 'event', color: '#1a5c8a', meta: { venue: e.venue, description: e.description } });
      }
    }

    // ── Birthdays — same month+day, project to requested year ──
    for (const m of (birthdaysRes.data || [])) {
      if (!m.date_of_birth) continue;
      const dob  = m.date_of_birth; // YYYY-MM-DD
      const mmdd = dob.slice(5);    // MM-DD
      const iso  = `${ys}-${mmdd}`;
      result.push({ id: `bd-${m.id}`, iso, title: `🎂 ${m.first_name} ${m.last_name}'s Birthday`, type: 'birthday', color: '#7c5cd8', meta: { memberId: m.id, dob: m.date_of_birth } });
    }

    // ── Liturgy Assignments ──
    for (const la of (liturgyRes.data || [])) {
      if (!la.liturgy_date || !la.liturgy_date.startsWith(ys)) continue;
      // Build a display name — prefer bcc_unit_name, fall back to org_name.
      const hostName = la.bcc_unit_name || la.org_name || 'Parish';
      result.push({ id: `lit-${la.id}`, iso: la.liturgy_date, title: `⛪ Liturgy — ${hostName}`, type: 'liturgy', color: '#2e7a4f', meta: { notes: la.notes } });
    }

    return result;
  },

  // ── Parish logo upload ───────────────────────────────────────────────────────
  // Uploads a local image URI to Supabase Storage (parish-assets bucket) and
  // returns the permanent public URL. The file is always stored at the fixed
  // path `logo.<ext>` inside the bucket.
  //
  // Why this approach:
  //  • React Native XHR/fetch cannot read file:// URIs as blobs.
  //  • expo-file-system v19 main entry throws for all legacy APIs.
  //    The legacy sub-path "expo-file-system/legacy" still works.
  //  • React Native has no global `atob`, so we decode base64 with a
  //    pure-JS lookup table — no native module, no polyfill needed.
  async uploadParishLogo(localUri) {
    // ── 1. Derive content type ───────────────────────────────────────────────
    const lower = localUri.toLowerCase();
    let contentType = 'image/jpeg';
    if (lower.includes('.png'))  contentType = 'image/png';
    if (lower.includes('.webp')) contentType = 'image/webp';
    if (lower.includes('.gif'))  contentType = 'image/gif';
    const ext = contentType.split('/')[1].replace('jpeg', 'jpg');
    const objectPath = `logo.${ext}`;

    // ── 2. Read file bytes via expo-file-system/legacy ───────────────────────
    // Import from the legacy sub-path so we get the real readAsStringAsync.
    const { readAsStringAsync, EncodingType } =
      require('expo-file-system/legacy');

    const base64 = await readAsStringAsync(localUri, {
      encoding: EncodingType.Base64,
    });

    // ── 3. Decode base64 → Uint8Array (pure JS, no atob) ────────────────────
    const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const lookup = new Uint8Array(256);
    for (let i = 0; i < CHARS.length; i++) lookup[CHARS.charCodeAt(i)] = i;

    const b64 = base64.replace(/[^A-Za-z0-9+/]/g, '');
    const len = b64.length;
    const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
    const bytes = new Uint8Array((len * 3) / 4 - pad);
    let p = 0;
    for (let i = 0; i < len; i += 4) {
      const a = lookup[b64.charCodeAt(i)];
      const b = lookup[b64.charCodeAt(i + 1)];
      const c = lookup[b64.charCodeAt(i + 2)];
      const d = lookup[b64.charCodeAt(i + 3)];
      bytes[p++] = (a << 2) | (b >> 4);
      if (p < bytes.length) bytes[p++] = ((b & 0xf) << 4) | (c >> 2);
      if (p < bytes.length) bytes[p++] = ((c & 0x3) << 6) | d;
    }

    // ── 4. Upload via Supabase Storage JS client ─────────────────────────────
    const { error: uploadError } = await supabase.storage
      .from('parish-assets')
      .upload(objectPath, bytes, {
        contentType,
        upsert:       true,
        cacheControl: '3600',
      });

    if (uploadError) throw new Error(`Logo upload failed: ${uploadError.message}`);

    // ── 5. Return stable public URL with cache-buster ────────────────────────
    const { data } = supabase.storage
      .from('parish-assets')
      .getPublicUrl(objectPath);
    return `${data.publicUrl}?t=${Date.now()}`;
  },

  // ── Organizations ────────────────────────────────────────────────────────────

  async getOrganizations() {
    const rows = unwrap(await supabase.from('organizations').select('*, organization_members(count)'));
    // Supabase returns the count as [{count: N}] — flatten to a plain number.
    return rows.map((o) => ({
      ...o,
      member_count: Array.isArray(o.organization_members)
        ? (o.organization_members[0]?.count ?? 0)
        : (o.organization_members ?? 0),
    }));
  },

  async createOrganization({ name, description, icon, status = 'active' }) {
    return unwrap(
      await supabase.from('organizations').insert({ name, description, icon, status }).select().single(),
    );
  },

  async updateOrganization(id, dto) {
    return unwrap(
      await supabase.from('organizations').update(dto).eq('id', id).select().single(),
    );
  },

  async deleteOrganization(id) {
    return unwrap(await supabase.from('organizations').delete().eq('id', id).select().single());
  },

  async getOrgMembers(orgId) {
    // Returns organization_members rows joined with member name fields.
    const rows = unwrap(
      await supabase
        .from('organization_members')
        .select('id, designation, joined_date, members(id, first_name, last_name, member_number)')
        .eq('organization_id', orgId)
        .order('joined_date', { ascending: false }),
    );
    return rows;
  },

  async addOrgMember(orgId, memberId, { designation, joinedDate } = {}) {
    return unwrap(
      await supabase.from('organization_members').insert({
        organization_id: orgId,
        member_id:       memberId,
        designation:     designation || null,
        joined_date:     joinedDate  || null,
      }).select().single(),
    );
  },

  async removeOrgMember(orgMemberId) {
    return unwrap(
      await supabase.from('organization_members').delete().eq('id', orgMemberId).select().single(),
    );
  },

  async getSacraments(memberId) {
    return unwrap(await supabase.from('sacraments').select('*').eq('member_id', memberId));
  },

  async getDonations(memberId) {
    return unwrap(await supabase.from('donations').select('*').eq('member_id', memberId).order('paid_on', { ascending: false }));
  },

  async requestCertificate(memberId, type) {
    if (_guestMember) {
      // Guest mode — no Supabase session, use the anon-safe RPC.
      const { data, error } = await supabase.rpc('guest_request_certificate', {
        p_member_id: memberId,
        p_type: type,
      });
      if (error) throw new Error(error.message);
      return data;
    }
    return unwrap(
      await supabase.from('certificate_requests').insert({ member_id: memberId, type, status: 'submitted' }).select().single(),
    );
  },

  // My own certificate requests — for the member "Requested" tab.
  async getMyCertificateRequests() {
    // Guest mode — use the anon-safe RPC (no Supabase session / profile row).
    if (_guestMember) {
      const { data, error } = await supabase.rpc('guest_get_certificate_requests', {
        p_member_id: _guestMember.id,
      });
      if (error) throw new Error(error.message);
      return data || [];
    }
    const memberId = (await currentProfile())?.member_id;
    if (!memberId) return [];
    return unwrap(
      await supabase
        .from('certificate_requests')
        .select('*')
        .eq('member_id', memberId)
        .order('created_at', { ascending: false }),
    );
  },

  // Certificate requests awaiting a decision — Parish Priest only screen.
  // The `forwarded_to` column (nullable uuid → profiles.id) records when the
  // Priest delegates review to another official; those officials then see only
  // the rows forwarded to them.
  async getCertificateRequests({ status } = {}) {
    let q = supabase
      .from('certificate_requests')
      .select('*, members(first_name, last_name, member_number)')
      .order('created_at', { ascending: false });
    if (status) q = q.eq('status', status);
    return unwrap(await q);
  },

  // Requests forwarded to the currently signed-in official by the Priest.
  async getForwardedCertificateRequests() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    return unwrap(
      await supabase
        .from('certificate_requests')
        .select('*, members(first_name, last_name, member_number)')
        .eq('forwarded_to', user.id)
        .eq('status', 'submitted')
        .order('created_at', { ascending: false }),
    );
  },

  // Forward a submitted request to another official for their approval.
  async forwardCertificateRequest(requestId, toProfileId) {
    return unwrap(
      await supabase
        .from('certificate_requests')
        .update({ forwarded_to: toProfileId, status: 'forwarded' })
        .eq('id', requestId)
        .select()
        .single(),
    );
  },

  // action: 'approved' | 'rejected' | 'issued'
  async decideCertificateRequest(requestId, action, extra = {}) {
    return unwrap(
      await supabase
        .from('certificate_requests')
        .update({ status: action, ...extra })
        .eq('id', requestId)
        .select()
        .single(),
    );
  },

  // ---- Admin module: user accounts (login + role) ------------------------
  // Creating a Supabase Auth user requires the service-role key, which must
  // never ship inside the app. This calls the `create-parish-user` Edge
  // Function (see supabase/functions/create-parish-user) which runs with
  // that privileged key server-side and re-checks the caller's role/role
  // hierarchy before doing anything — the same rules enforced client-side
  // in src/theme/roles.js.
  async createUserAccount({ email, password, role, fullName, memberId }) {
    const { data, error } = await supabase.functions.invoke('create-parish-user', {
      body: { email, password, role, fullName, memberId },
    });
    if (error) {
      // Supabase surfaces Edge Function errors on `error`, with the actual
      // message from our function usually in error.context or the body.
      const detail = error.context?.error || error.message || 'Could not create the account.';
      throw new Error(detail);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  },

  // All login accounts (profiles), for the Manage Users list. RLS scopes
  // what each caller actually gets back (see profiles policies).
  async getUsers() {
    return unwrap(
      await supabase
        .from('profiles')
        .select('id, username, role, is_active, last_login, member_id, members(first_name, last_name)')
        .order('role'),
    );
  },

  // Link a member row to a profile (admin only, enforced in the RPC).
  // Called when auto-matching (phone/email) failed and the admin must link manually.
  async linkMemberToProfile(profileId, memberId) {
    const { error } = await supabase.rpc('link_member_to_profile', {
      p_profile_id: profileId,
      p_member_id:  memberId,
    });
    if (error) throw new Error(error.message);
  },

  // Fetch the profile (login account) that is currently linked to a given member.
  // Uses a security-definer RPC (migration 023) so it bypasses RLS safely.
  // Returns null if no account is linked yet.
  async getProfileByMemberId(memberId) {
    const { data, error } = await supabase.rpc('get_profile_by_member_id', {
      p_member_id: memberId,
    });
    if (error) throw new Error(error.message);
    if (!data) return null;
    return typeof data === 'string' ? JSON.parse(data) : data;
  },

  // Super Admin only (also enforced by RLS) — change an existing user's role.
  async updateUserRole(profileId, role) {
    return unwrap(await supabase.from('profiles').update({ role }).eq('id', profileId).select().single());
  },

  // Deactivate/reactivate a login without deleting it.
  async setUserActive(profileId, isActive) {
    return unwrap(await supabase.from('profiles').update({ is_active: isActive }).eq('id', profileId).select().single());
  },

  // ---- BCC Units (Basic Christian Communities) ---------------------------
  // All active units, ordered by ward then name.
  async getBccUnits() {
    return unwrap(await supabase.from('bcc_units').select('*').eq('is_active', true).order('ward').order('name'));
  },

  // Distinct ward names, defaulting missing ward to 'Ward 1'.
  async getBccWards() {
    const units = await this.getBccUnits();
    const wards = [...new Set(units.map((u) => u.ward || 'Ward 1'))].sort();
    return wards;
  },

  // Units belonging to a specific ward.
  async getBccUnitsByWard(ward) {
    return unwrap(
      await supabase
        .from('bcc_units')
        .select('*')
        .eq('is_active', true)
        .eq('ward', ward)
        .order('name'),
    );
  },

  async createBccUnit(dto) {
    // Ensure ward defaults to 'Ward 1' if not supplied.
    return unwrap(await supabase.from('bcc_units').insert({ ward: 'Ward 1', ...dto }).select().single());
  },

  async updateBccUnit(id, dto) {
    return unwrap(await supabase.from('bcc_units').update(dto).eq('id', id).select().single());
  },

  async deleteBccUnit(id) {
    // Soft-delete: mark inactive so existing family references remain readable.
    return unwrap(await supabase.from('bcc_units').update({ is_active: false }).eq('id', id).select().single());
  },

  // ---- Member number auto-generation -------------------------------------
  // peek: reads the CURRENT value of the sequence + 1 without advancing it.
  // Use this for the UI preview on screen open — safe to call on cancel.
  async peekNextMemberNumber() {
    const { data, error } = await supabase.rpc('peek_next_member_number');
    if (error) throw new Error(error.message);
    return data; // e.g. "MEM-0042"
  },

  // consume: advances the sequence and returns the new number.
  // Call this ONLY at save time, immediately before the INSERT.
  async nextMemberNumber() {
    const { data, error } = await supabase.rpc('next_member_number');
    if (error) throw new Error(error.message);
    return data; // e.g. "MEM-0042"
  },

  // ---- Liturgy Assignments -----------------------------------------------

  // All assignments ordered by liturgy_date ascending (upcoming first).
  async getLiturgyAssignments() {
    return unwrap(
      await supabase
        .from('liturgy_assignments')
        .select('*')
        .order('liturgy_date', { ascending: true }),
    );
  },

  // Assignments for a specific BCC unit.
  async getLiturgyAssignmentsByUnit(bccUnitId) {
    return unwrap(
      await supabase
        .from('liturgy_assignments')
        .select('*')
        .eq('bcc_unit_id', bccUnitId)
        .order('liturgy_date', { ascending: true }),
    );
  },

  // Assignments relevant to the signed-in member (migration 036).
  // Uses a security-definer RPC that ORs across bcc_unit_name / org_id
  // server-side — replaces the old client-side full-table-scan approach.
  // Guest fallback: the RPC requires auth; guests get a client-side filter.
  async getMyLiturgyAssignments() {
    // Guest mode — no Supabase session; fall back to simple BCC filter.
    if (_guestMember) {
      const myBcc = _guestMember.basic_christian_community || null;
      if (!myBcc) return [];
      const all = unwrap(
        await supabase
          .from('liturgy_assignments')
          .select('*')
          .order('liturgy_date', { ascending: true }),
      );
      return all.filter((a) => a.bcc_unit_name && a.bcc_unit_name === myBcc);
    }

    const { data, error } = await supabase.rpc('get_my_liturgy_assignments');
    if (error) throw new Error(error.message);
    return data ?? [];
  },

  // Create a new liturgy assignment and broadcast a LITURGY notification.
  // Accepts either a BCC unit ({ bccUnitId, bccUnitName }) or an org
  // ({ orgId, orgName }) — at least one must be supplied.
  async createLiturgyAssignment({ bccUnitId, bccUnitName, orgId, orgName, liturgyDate, notes }) {
    const { data: { user } } = await supabase.auth.getUser();
    const hostName = bccUnitName || orgName || 'Parish';
    const assignment = unwrap(
      await supabase.from('liturgy_assignments').insert({
        bcc_unit_id:   bccUnitId  || null,
        bcc_unit_name: bccUnitName || null,
        org_id:        orgId      || null,
        org_name:      orgName    || null,
        liturgy_date:  liturgyDate,
        notes:         notes || null,
        assigned_by:   user?.id ?? null,
      }).select().single(),
    );

    // Insert a LITURGY notification.
    // When assigned to a BCC unit the notification is targeted to that unit;
    // when assigned to an org (or unknown) it goes to ALL.
    const dateLabel = new Date(liturgyDate + 'T00:00:00').toLocaleDateString('en-IN', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
    const notifTitle   = `⛪ Liturgy Assigned — ${hostName}`;
    const notifMessage = `${hostName} has been assigned to host the liturgy on ${dateLabel}.${notes ? ' ' + notes : ''}`;
    try {
      await supabase.from('notifications').insert({
        title:      notifTitle,
        message:    notifMessage,
        type:       'LITURGY',
        // BCC-unit assignments are targeted; org or fallback broadcasts to ALL.
        target:     bccUnitName ? 'BCC_UNIT' : 'ALL',
        created_by: user?.id ?? null,
        metadata: {
          liturgy_assignment_id: assignment.id,
          host_name:             hostName,
          liturgy_date:          liturgyDate,
          bcc_unit_name:         bccUnitName || null,
        },
      });
    } catch (_) {
      // In-app notification failure should not block the assignment itself.
    }

    // Push notification:
    // • BCC unit assignment → send only to that unit's members.
    // • Org / no-unit assignment → send to the whole parish.
    if (bccUnitName) {
      sendPushToBccUnit(bccUnitName, user?.id ?? null, notifTitle, notifMessage, { screen: 'Notifications', type: 'LITURGY' }).catch(() => {});
    } else {
      sendPushToAllExcept(user?.id ?? null, notifTitle, notifMessage, { screen: 'Notifications', type: 'LITURGY' }).catch(() => {});
    }

    return assignment;
  },

  // Delete an assignment (staff only — RLS enforces).
  async deleteLiturgyAssignment(id) {
    return unwrap(
      await supabase.from('liturgy_assignments').delete().eq('id', id).select().single(),
    );
  },

  // ---- Marriages -------------------------------------------------------
  // Returns marriages joined with husband and wife member name fields.
  async getMarriages() {
    return unwrap(
      await supabase
        .from('marriages')
        .select(
          'id, marriage_date, church, certificate_number,' +
          'husband:husband_member_id(id, first_name, last_name, member_number),' +
          'wife:wife_member_id(id, first_name, last_name, member_number)',
        )
        .order('marriage_date', { ascending: false }),
    );
  },

  async createMarriage({ husbandMemberId, wifeMemberId, marriageDate, church, certNumber }) {
    return unwrap(
      await supabase.from('marriages').insert({
        husband_member_id:  husbandMemberId,
        wife_member_id:     wifeMemberId,
        marriage_date:      marriageDate,
        church:             church || null,
        certificate_number: certNumber || null,
      }).select().single(),
    );
  },

  async deleteMarriage(id) {
    return unwrap(await supabase.from('marriages').delete().eq('id', id).select().single());
  },
};

export default api;
