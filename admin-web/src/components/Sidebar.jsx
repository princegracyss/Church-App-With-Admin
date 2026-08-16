import { useState, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { logout } from '../lib/auth'
import { supabase } from '../lib/supabase'

const navItems = [
  { to: '/',                 label: 'Dashboard',      icon: '🏠' },
  { to: '/members',          label: 'Members',         icon: '👥' },
  { to: '/families',         label: 'Families',        icon: '🏡' },
  { to: '/bcc',              label: 'BCC Units',       icon: '⛪' },
  { to: '/organizations',    label: 'Organizations',   icon: '🏢' },
  { to: '/marriages',        label: 'Marriages',       icon: '💒' },
  { to: '/liturgy',          label: 'Liturgy',         icon: '📅' },
  { to: '/certificates',     label: 'Certificates',    icon: '📜' },
  { to: '/notifications',    label: 'Notifications',   icon: '🔔' },
  { to: '/users',            label: 'Users',           icon: '🔑' },
  { to: '/parish-settings',  label: 'Parish Settings', icon: '⚙️'  },
  { to: '/audit-logs',       label: 'Audit Logs',      icon: '📋' },
]

export function Sidebar({ open, onClose }) {
  const { profile, isSuperAdmin } = useAuth()
  const navigate = useNavigate()
  const [parishName, setParishName] = useState('Parish Connect')

  useEffect(() => {
    supabase.from('parish_settings').select('name').eq('id', 1).single()
      .then(({ data }) => { if (data?.name) setParishName(data.name) })
  }, [])

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  const visibleItems = navItems.filter(item => {
    if (item.to === '/users') return isSuperAdmin || profile?.role === 'admin'
    if (item.to === '/audit-logs') return isSuperAdmin
    if (item.to === '/parish-settings') return isSuperAdmin
    return true
  })

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside className={`
        fixed top-0 left-0 z-40 h-screen w-64 bg-primary-900 flex flex-col
        transform transition-transform duration-200
        ${open ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:static lg:z-auto
      `}>
        {/* Logo / Parish name */}
        <div className="px-6 py-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gold-500 flex items-center justify-center text-primary-900 font-bold text-sm flex-shrink-0">
              ✝
            </div>
            <div>
              <p className="text-white font-semibold text-sm leading-tight line-clamp-2">{parishName}</p>
              <p className="text-white/50 text-xs mt-0.5">Admin Portal</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {visibleItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-white/10 text-white'
                    : 'text-white/70 hover:bg-white/5 hover:text-white'
                }`
              }
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* User + logout */}
        <div className="px-4 py-4 border-t border-white/10">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-gold-500 flex items-center justify-center text-primary-900 font-bold text-xs flex-shrink-0">
              {(profile?.username ?? 'A')[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-white text-sm font-medium truncate">{profile?.username ?? 'Admin'}</p>
              <p className="text-white/50 text-xs truncate">{profile?.role?.replace(/_/g, ' ')}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full text-left text-sm text-white/60 hover:text-white px-2 py-1.5 rounded hover:bg-white/5 transition-colors"
          >
            ← Sign out
          </button>
        </div>
      </aside>
    </>
  )
}
