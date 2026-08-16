import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getProfile, isAllowedRole } from '../lib/auth'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        try {
          const p = await getProfile(session.user.id)
          if (isAllowedRole(p.role) && p.is_active) {
            setUser(session.user)
            setProfile(p)
          } else {
            await supabase.auth.signOut()
          }
        } catch {
          await supabase.auth.signOut()
        }
      }
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        setUser(null)
        setProfile(null)
      } else if (session?.user) {
        try {
          const p = await getProfile(session.user.id)
          if (isAllowedRole(p.role) && p.is_active) {
            setUser(session.user)
            setProfile(p)
          } else {
            await supabase.auth.signOut()
          }
        } catch {
          setUser(null)
          setProfile(null)
        }
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const value = {
    user,
    profile,
    loading,
    role: profile?.role ?? null,
    isSuperAdmin: profile?.role === 'super_admin',
    isAdmin: ['super_admin', 'admin'].includes(profile?.role),
    isPriest: ['super_admin', 'parish_priest'].includes(profile?.role),
    isSecretary: ['super_admin', 'admin', 'church_secretary'].includes(profile?.role),
    setProfile,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
