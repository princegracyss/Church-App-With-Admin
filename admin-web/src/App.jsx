import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { Spinner } from './components/Spinner'

import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import MembersPage from './pages/MembersPage'
import FamiliesPage from './pages/FamiliesPage'
import BccPage from './pages/BccPage'
import NotificationsPage from './pages/NotificationsPage'
import CertificatesPage from './pages/CertificatesPage'
import UsersPage from './pages/UsersPage'
import ParishSettingsPage from './pages/ParishSettingsPage'
import MarriagesPage from './pages/MarriagesPage'
import LiturgyPage from './pages/LiturgyPage'
import OrganizationsPage from './pages/OrganizationsPage'
import AuditLogsPage from './pages/AuditLogsPage'

function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Spinner size="lg" />
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  return children
}

function RequireRole({ children, roles }) {
  const { profile } = useAuth()
  if (roles && profile && !roles.includes(profile.role)) {
    return <Navigate to="/" replace />
  }
  return children
}

function PublicOnly({ children }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (user) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />

          <Route path="/" element={<RequireAuth><DashboardPage /></RequireAuth>} />
          <Route path="/members" element={<RequireAuth><MembersPage /></RequireAuth>} />
          <Route path="/families" element={<RequireAuth><FamiliesPage /></RequireAuth>} />
          <Route path="/bcc" element={<RequireAuth><BccPage /></RequireAuth>} />
          <Route path="/notifications" element={<RequireAuth><NotificationsPage /></RequireAuth>} />
          <Route path="/certificates" element={<RequireAuth><CertificatesPage /></RequireAuth>} />
          <Route path="/marriages" element={<RequireAuth><MarriagesPage /></RequireAuth>} />
          <Route path="/liturgy" element={<RequireAuth><LiturgyPage /></RequireAuth>} />
          <Route path="/organizations" element={<RequireAuth><OrganizationsPage /></RequireAuth>} />

          <Route path="/users" element={
            <RequireAuth>
              <RequireRole roles={['super_admin', 'admin']}>
                <UsersPage />
              </RequireRole>
            </RequireAuth>
          } />

          <Route path="/parish-settings" element={
            <RequireAuth>
              <RequireRole roles={['super_admin']}>
                <ParishSettingsPage />
              </RequireRole>
            </RequireAuth>
          } />

          <Route path="/audit-logs" element={
            <RequireAuth>
              <RequireRole roles={['super_admin']}>
                <AuditLogsPage />
              </RequireRole>
            </RequireAuth>
          } />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
