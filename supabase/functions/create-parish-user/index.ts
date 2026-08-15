// supabase/functions/create-parish-user/index.ts
//
// Creates a new Parish Connect login (a Supabase Auth user + a `profiles`
// row) with a chosen role. This has to be an Edge Function — not a client
// call — because creating an `auth.users` row requires the *service role*
// key, which must never be embedded in the mobile app.
//
// Deploy with:
//   supabase functions deploy create-parish-user
//
// The function needs two secrets, which Supabase sets automatically for
// every project's Edge Functions (no manual config needed):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Permission model (mirrors src/theme/roles.js CREATABLE_ROLES — kept in
// sync intentionally, and re-checked here so the rule holds even if the
// app itself is compromised or bypassed):
//   super_admin      -> can create: admin, parish_priest, church_secretary, member
//   admin            -> can create: parish_priest, church_secretary, member
//   parish_priest    -> can create: member
//   church_secretary -> can create: member
//   member           -> can create: (nothing)

import { createClient } from 'npm:@supabase/supabase-js@2';

const CREATABLE_ROLES: Record<string, string[]> = {
  super_admin: ['admin', 'parish_priest', 'church_secretary', 'member'],
  admin: ['parish_priest', 'church_secretary', 'member'],
  parish_priest: ['member'],
  church_secretary: ['member'],
  member: [],
};

const ALL_ROLES = ['super_admin', 'admin', 'parish_priest', 'church_secretary', 'member'];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Client scoped to the *caller* — used only to verify who is asking.
  const authHeader = req.headers.get('Authorization') ?? '';
  const callerClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user: caller },
    error: callerErr,
  } = await callerClient.auth.getUser();
  if (callerErr || !caller) return json({ error: 'Not signed in.' }, 401);

  // Admin client — used for privileged writes once we've verified permission.
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: callerProfile, error: profileErr } = await adminClient
    .from('profiles')
    .select('role, is_active')
    .eq('id', caller.id)
    .single();
  if (profileErr || !callerProfile) return json({ error: 'No profile found for the signed-in account.' }, 403);
  if (!callerProfile.is_active) return json({ error: 'Your account is deactivated.' }, 403);

  const allowedRoles = CREATABLE_ROLES[callerProfile.role] ?? [];
  if (allowedRoles.length === 0) {
    return json({ error: 'Your role does not have permission to create user accounts.' }, 403);
  }

  let body: { email?: string; password?: string; role?: string; fullName?: string; memberId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request body.' }, 400);
  }

  const { email, password, role, fullName, memberId } = body;

  if (!email || !password || !role) {
    return json({ error: 'email, password and role are required.' }, 400);
  }
  if (!ALL_ROLES.includes(role)) {
    return json({ error: `Unknown role "${role}".` }, 400);
  }
  if (!allowedRoles.includes(role)) {
    return json({ error: `A ${callerProfile.role.replace('_', ' ')} cannot create a ${role.replace('_', ' ')} account.` }, 403);
  }
  if (password.length < 8) {
    return json({ error: 'Password must be at least 8 characters.' }, 400);
  }

  // 1. Create the Auth user.
  const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: fullName ? { full_name: fullName } : undefined,
  });
  if (createErr || !created?.user) {
    return json({ error: createErr?.message || 'Could not create the login.' }, 400);
  }

  // 2. Create the matching profile row with the chosen role.
  const { data: profile, error: insertErr } = await adminClient
    .from('profiles')
    .insert({
      id: created.user.id,
      username: email,
      role,
      member_id: memberId || null,
      is_active: true,
    })
    .select()
    .single();

  if (insertErr) {
    // Roll back the auth user so we don't leave an orphaned login with no profile.
    await adminClient.auth.admin.deleteUser(created.user.id);
    return json({ error: insertErr.message }, 400);
  }

  return json({ user: { id: created.user.id, email }, profile });
});
