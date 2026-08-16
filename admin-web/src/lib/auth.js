import { supabase } from './supabase'

const ALLOWED_ROLES = ['super_admin', 'admin', 'parish_priest', 'church_secretary']

export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error

  const userId = data.user.id
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', userId)
    .single()

  if (profileError) throw new Error('Could not fetch user profile.')
  if (!ALLOWED_ROLES.includes(profile.role)) {
    await supabase.auth.signOut()
    throw new Error('Access denied. You do not have admin privileges.')
  }
  if (!profile.is_active) {
    await supabase.auth.signOut()
    throw new Error('Your account has been deactivated. Contact a super admin.')
  }

  return { user: data.user, profile }
}

export async function logout() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

export async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  if (error) throw error
  return data
}

export function isAllowedRole(role) {
  return ALLOWED_ROLES.includes(role)
}
