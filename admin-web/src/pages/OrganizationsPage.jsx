import { useEffect, useState, useCallback } from 'react'
import { Layout } from '../components/Layout'
import { Table } from '../components/Table'
import { Badge } from '../components/Badge'
import { Modal } from '../components/Modal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Spinner } from '../components/Spinner'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { fmtDate, fullName } from '../lib/utils'

export default function OrganizationsPage() {
  const { isAdmin } = useAuth()
  const [orgs, setOrgs] = useState([])
  const [memberCounts, setMemberCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ name: '', description: '', icon: '', status: 'active' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteSaving, setDeleteSaving] = useState(false)
  const [detailOrg, setDetailOrg] = useState(null)
  const [orgMembers, setOrgMembers] = useState([])
  const [allMembers, setAllMembers] = useState([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [addMemberOpen, setAddMemberOpen] = useState(false)
  const [addMemberForm, setAddMemberForm] = useState({ member_id: '', designation: '', joined_date: '' })
  const [addMemberSaving, setAddMemberSaving] = useState(false)

  const fetchOrgs = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('organizations').select('*').order('name')
    const rows = data ?? []
    setOrgs(rows)
    if (rows.length) {
      const ids = rows.map(r => r.id)
      const { data: counts } = await supabase.from('organization_members').select('organization_id').in('organization_id', ids)
      const map = {}
      for (const c of (counts ?? [])) map[c.organization_id] = (map[c.organization_id] ?? 0) + 1
      setMemberCounts(map)
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchOrgs() }, [fetchOrgs])

  useEffect(() => {
    supabase.from('members').select('id, first_name, middle_name, last_name, member_number').order('first_name')
      .then(({ data }) => setAllMembers(data ?? []))
  }, [])

  const filtered = orgs.filter(o => !search || o.name.toLowerCase().includes(search.toLowerCase()))

  function openAdd() {
    setEditing(null)
    setForm({ name: '', description: '', icon: '', status: 'active' })
    setFormError('')
    setEditOpen(true)
  }

  function openEdit(row) {
    setEditing(row)
    setForm({ name: row.name, description: row.description ?? '', icon: row.icon ?? '', status: row.status ?? 'active' })
    setFormError('')
    setEditOpen(true)
  }

  async function handleSave() {
    if (!form.name) { setFormError('Name is required.'); return }
    setSaving(true)
    setFormError('')
    try {
      if (editing) {
        const { error } = await supabase.from('organizations').update(form).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('organizations').insert(form)
        if (error) throw error
      }
      setEditOpen(false)
      fetchOrgs()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleteSaving(true)
    try {
      await supabase.from('organizations').delete().eq('id', deleteTarget.id)
      setDeleteTarget(null)
      fetchOrgs()
    } finally {
      setDeleteSaving(false)
    }
  }

  async function openDetail(row) {
    setDetailOrg(row)
    setDetailLoading(true)
    const { data } = await supabase.from('organization_members')
      .select('id, member_id, designation, joined_date')
      .eq('organization_id', row.id)
    setOrgMembers(data ?? [])
    setDetailLoading(false)
  }

  async function removeMember(orgMemberId) {
    await supabase.from('organization_members').delete().eq('id', orgMemberId)
    if (detailOrg) openDetail(detailOrg)
    fetchOrgs()
  }

  async function handleAddMember() {
    if (!addMemberForm.member_id) return
    setAddMemberSaving(true)
    try {
      const { error } = await supabase.from('organization_members').insert({
        organization_id: detailOrg.id,
        member_id: addMemberForm.member_id,
        designation: addMemberForm.designation || null,
        joined_date: addMemberForm.joined_date || null,
      })
      if (error) throw error
      setAddMemberOpen(false)
      setAddMemberForm({ member_id: '', designation: '', joined_date: '' })
      openDetail(detailOrg)
      fetchOrgs()
    } finally {
      setAddMemberSaving(false)
    }
  }

  const memberMap = Object.fromEntries(allMembers.map(m => [m.id, m]))

  const columns = [
    { key: 'icon', label: '', render: v => v ? <span className="text-xl">{v}</span> : <span className="text-gray-300 text-xl">🏢</span> },
    { key: 'name', label: 'Name', sortable: true },
    { key: 'description', label: 'Description', render: v => v ? (v.length > 60 ? v.slice(0, 60) + '…' : v) : '—' },
    { key: 'id', label: 'Members', render: v => memberCounts[v] ?? 0 },
    { key: 'status', label: 'Status', render: v => <Badge variant={v === 'active' ? 'success' : 'default'}>{v}</Badge> },
    {
      key: '_actions', label: '',
      render: (_, row) => isAdmin && (
        <div className="flex gap-2" onClick={e => e.stopPropagation()}>
          <button onClick={() => openEdit(row)} className="text-xs text-blue-600 hover:underline">Edit</button>
          <button onClick={() => setDeleteTarget(row)} className="text-xs text-red-600 hover:underline">Delete</button>
        </div>
      )
    },
  ]

  return (
    <Layout title="Organizations">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-5">
          <input type="search" placeholder="Search organizations…" value={search} onChange={e => setSearch(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-900" />
          {isAdmin && (
            <button onClick={openAdd} className="px-4 py-2 bg-primary-900 text-white text-sm font-medium rounded-lg hover:bg-primary-800">
              + Add Organization
            </button>
          )}
        </div>
        <Table columns={columns} data={filtered} loading={loading} emptyTitle="No organizations found" onRowClick={openDetail} />
      </div>

      {/* Edit modal */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={editing ? 'Edit Organization' : 'Add Organization'}>
        <div className="space-y-4">
          {formError && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{formError}</div>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-900" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-900" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Icon (emoji)</label>
            <input value={form.icon} onChange={e => setForm(f => ({ ...f, icon: e.target.value }))} placeholder="e.g. ⛪" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-900" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={handleSave} disabled={saving} className="flex-1 bg-primary-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-primary-800 disabled:opacity-50">
              {saving ? 'Saving…' : (editing ? 'Save Changes' : 'Add Organization')}
            </button>
            <button onClick={() => setEditOpen(false)} className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* Detail panel */}
      {detailOrg && (
        <Modal open={!!detailOrg} onClose={() => setDetailOrg(null)} title={`${detailOrg.icon || '🏢'} ${detailOrg.name}`} size="lg">
          {detailLoading ? <Spinner className="py-12" /> : (
            <div className="space-y-4">
              {detailOrg.description && <p className="text-sm text-gray-600">{detailOrg.description}</p>}
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-500 uppercase">Members ({orgMembers.length})</h3>
                {isAdmin && (
                  <button onClick={() => { setAddMemberForm({ member_id: '', designation: '', joined_date: '' }); setAddMemberOpen(true) }}
                    className="text-xs text-primary-900 font-medium hover:underline">
                    + Add Member
                  </button>
                )}
              </div>
              {orgMembers.length === 0
                ? <p className="text-sm text-gray-400">No members in this organization.</p>
                : orgMembers.map(om => (
                  <div key={om.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm">
                    <div>
                      <span className="font-medium">{fullName(memberMap[om.member_id]) || '—'}</span>
                      {om.designation && <span className="text-gray-500 ml-2">{om.designation}</span>}
                      {om.joined_date && <div className="text-xs text-gray-400">Joined {fmtDate(om.joined_date)}</div>}
                    </div>
                    {isAdmin && (
                      <button onClick={() => removeMember(om.id)} className="text-xs text-red-500 hover:underline">Remove</button>
                    )}
                  </div>
                ))
              }
            </div>
          )}
        </Modal>
      )}

      {/* Add org member modal */}
      <Modal open={addMemberOpen} onClose={() => setAddMemberOpen(false)} title="Add Member to Organization" size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Member *</label>
            <select value={addMemberForm.member_id} onChange={e => setAddMemberForm(f => ({ ...f, member_id: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none">
              <option value="">— Select member —</option>
              {allMembers.filter(m => !orgMembers.find(om => om.member_id === m.id)).map(m => (
                <option key={m.id} value={m.id}>{fullName(m)} ({m.member_number})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Designation</label>
            <input value={addMemberForm.designation} onChange={e => setAddMemberForm(f => ({ ...f, designation: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-900" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Joined Date</label>
            <input type="date" value={addMemberForm.joined_date} onChange={e => setAddMemberForm(f => ({ ...f, joined_date: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={handleAddMember} disabled={addMemberSaving} className="flex-1 bg-primary-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-primary-800 disabled:opacity-50">
              {addMemberSaving ? 'Adding…' : 'Add Member'}
            </button>
            <button onClick={() => setAddMemberOpen(false)} className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete}
        title="Delete Organization" message={`Delete "${deleteTarget?.name}"? This will also remove all member associations.`}
        confirmLabel="Delete" danger loading={deleteSaving} />
    </Layout>
  )
}
