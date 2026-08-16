import { useEffect, useState, useCallback } from 'react'
import { Layout } from '../components/Layout'
import { Table } from '../components/Table'
import { Badge } from '../components/Badge'
import { Modal } from '../components/Modal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { roleBadge } from '../components/Badge'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { fmtDate, fullName } from '../lib/utils'

const ALL_ROLES = ['super_admin', 'admin', 'parish_priest', 'church_secretary', 'unit_admin', 'member']
const ADMIN_ROLES = ['super_admin', 'admin', 'parish_priest', 'church_secretary', 'unit_admin']

const EMPTY_FORM = { email: '', password: '', role: 'church_secretary', fullName: '', memberId: '' }

export default function UsersPage() {
  const { isSuperAdmin, isAdmin, profile: myProfile } = useAuth()
  const [profiles, setProfiles] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [roleTarget, setRoleTarget] = useState(null)
  const [newRole, setNewRole] = useState('')
  const [roleLoading, setRoleLoading] = useState(false)
  const [linkTarget, setLinkTarget] = useState(null)
  const [linkMemberId, setLinkMemberId] = useState('')
  const [linkLoading, setLinkLoading] = useState(false)
  const [toggleLoading, setToggleLoading] = useState({})

  const fetchProfiles = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').order('username')
    setProfiles(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchProfiles() }, [fetchProfiles])

  useEffect(() => {
    supabase.from('members').select('id, first_name, middle_name, last_name, member_number').order('first_name')
      .then(({ data }) => setMembers(data ?? []))
  }, [])

  async function handleCreate() {
    if (!form.email || !form.password) { setFormError('Email and password are required.'); return }
    setSaving(true)
    setFormError('')
    try {
      const { error } = await supabase.functions.invoke('create-parish-user', {
        body: {
          email: form.email,
          password: form.password,
          role: form.role,
          fullName: form.fullName,
          memberId: form.memberId || null,
        }
      })
      if (error) throw error
      setCreateOpen(false)
      setForm(EMPTY_FORM)
      fetchProfiles()
    } catch (err) {
      setFormError(err.message ?? 'Failed to create user.')
    } finally {
      setSaving(false)
    }
  }

  async function handleRoleChange() {
    if (!newRole) return
    setRoleLoading(true)
    try {
      await supabase.from('profiles').update({ role: newRole }).eq('id', roleTarget.id)
      setRoleTarget(null)
      fetchProfiles()
    } finally {
      setRoleLoading(false)
    }
  }

  async function handleLinkMember() {
    if (!linkMemberId) return
    setLinkLoading(true)
    try {
      await supabase.rpc('link_member_to_profile', {
        p_profile_id: linkTarget.id,
        p_member_id: linkMemberId,
      })
      setLinkTarget(null)
      fetchProfiles()
    } finally {
      setLinkLoading(false)
    }
  }

  async function toggleActive(p) {
    setToggleLoading(l => ({ ...l, [p.id]: true }))
    try {
      await supabase.from('profiles').update({ is_active: !p.is_active }).eq('id', p.id)
      fetchProfiles()
    } finally {
      setToggleLoading(l => ({ ...l, [p.id]: false }))
    }
  }

  const memberMap = Object.fromEntries(members.map(m => [m.id, m]))

  const columns = [
    { key: 'username', label: 'Username', sortable: true },
    { key: 'role', label: 'Role', render: v => roleBadge(v) },
    { key: 'member_id', label: 'Linked Member', render: v => v ? fullName(memberMap[v]) || v.slice(0, 8) : '—' },
    { key: 'last_login', label: 'Last Login', render: v => fmtDate(v) },
    {
      key: 'is_active', label: 'Status',
      render: (v, row) => (
        <button
          onClick={e => { e.stopPropagation(); toggleActive(row) }}
          disabled={toggleLoading[row.id] || row.id === myProfile?.id}
          className={`px-2 py-0.5 text-xs rounded font-medium ${v ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'} disabled:opacity-50`}
        >
          {toggleLoading[row.id] ? '…' : (v ? 'Active' : 'Inactive')}
        </button>
      )
    },
    {
      key: '_actions', label: '',
      render: (_, row) => (
        <div className="flex gap-2" onClick={e => e.stopPropagation()}>
          {isSuperAdmin && row.id !== myProfile?.id && (
            <button onClick={() => { setRoleTarget(row); setNewRole(row.role) }} className="text-xs text-blue-600 hover:underline">Role</button>
          )}
          {isAdmin && (
            <button onClick={() => { setLinkTarget(row); setLinkMemberId(row.member_id ?? '') }} className="text-xs text-purple-600 hover:underline">Link</button>
          )}
        </div>
      )
    },
  ]

  return (
    <Layout title="Users">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-medium text-gray-500">{profiles.length} total users</h2>
          {isSuperAdmin && (
            <button onClick={() => { setForm(EMPTY_FORM); setFormError(''); setCreateOpen(true) }} className="px-4 py-2 bg-primary-900 text-white text-sm font-medium rounded-lg hover:bg-primary-800">
              + Add User
            </button>
          )}
        </div>
        <Table columns={columns} data={profiles} loading={loading} emptyTitle="No users found" />
      </div>

      {/* Create user modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Admin User">
        <div className="space-y-4">
          {formError && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{formError}</div>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <input value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-900" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-900" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
            <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-900" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none">
              {ADMIN_ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Link Member (optional)</label>
            <select value={form.memberId} onChange={e => setForm(f => ({ ...f, memberId: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none">
              <option value="">— None —</option>
              {members.map(m => <option key={m.id} value={m.id}>{fullName(m)} ({m.member_number})</option>)}
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={handleCreate} disabled={saving} className="flex-1 bg-primary-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-primary-800 disabled:opacity-50">
              {saving ? 'Creating…' : 'Create User'}
            </button>
            <button onClick={() => setCreateOpen(false)} className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* Change role modal */}
      <Modal open={!!roleTarget} onClose={() => setRoleTarget(null)} title="Change Role" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Change role for <strong>{roleTarget?.username}</strong>:</p>
          <select value={newRole} onChange={e => setNewRole(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none">
            {ALL_ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
          </select>
          <div className="flex gap-3">
            <button onClick={handleRoleChange} disabled={roleLoading} className="flex-1 bg-primary-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-primary-800 disabled:opacity-50">
              {roleLoading ? 'Saving…' : 'Change Role'}
            </button>
            <button onClick={() => setRoleTarget(null)} className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* Link member modal */}
      <Modal open={!!linkTarget} onClose={() => setLinkTarget(null)} title="Link Member to Profile" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Link a member profile to <strong>{linkTarget?.username}</strong>:</p>
          <select value={linkMemberId} onChange={e => setLinkMemberId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none">
            <option value="">— None —</option>
            {members.map(m => <option key={m.id} value={m.id}>{fullName(m)} ({m.member_number})</option>)}
          </select>
          <div className="flex gap-3">
            <button onClick={handleLinkMember} disabled={linkLoading} className="flex-1 bg-primary-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-primary-800 disabled:opacity-50">
              {linkLoading ? 'Linking…' : 'Link Member'}
            </button>
            <button onClick={() => setLinkTarget(null)} className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      </Modal>
    </Layout>
  )
}
