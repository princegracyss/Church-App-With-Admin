import { useEffect, useState, useCallback } from 'react'
import { Layout } from '../components/Layout'
import { Table } from '../components/Table'
import { Badge } from '../components/Badge'
import { Modal } from '../components/Modal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { fmtDate } from '../lib/utils'

const EMPTY_FORM = { name: '', ward: '', description: '', is_active: true }

export default function BccPage() {
  const { isAdmin } = useAuth()
  const [units, setUnits] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteSaving, setDeleteSaving] = useState(false)

  const fetchUnits = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('bcc_units').select('*').order('name')
    setUnits(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchUnits() }, [fetchUnits])

  const filtered = units.filter(u => !search || u.name.toLowerCase().includes(search.toLowerCase()))

  function openAdd() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormError('')
    setModalOpen(true)
  }

  function openEdit(row) {
    setEditing(row)
    setForm({ name: row.name, ward: row.ward ?? '', description: row.description ?? '', is_active: row.is_active })
    setFormError('')
    setModalOpen(true)
  }

  async function handleSave() {
    if (!form.name) { setFormError('Name is required.'); return }
    setSaving(true)
    setFormError('')
    try {
      if (editing) {
        const { error } = await supabase.from('bcc_units').update(form).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('bcc_units').insert(form)
        if (error) throw error
      }
      setModalOpen(false)
      fetchUnits()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleteSaving(true)
    try {
      await supabase.from('bcc_units').update({ is_active: false }).eq('id', deleteTarget.id)
      setDeleteTarget(null)
      fetchUnits()
    } finally {
      setDeleteSaving(false)
    }
  }

  const columns = [
    { key: 'name', label: 'Name', sortable: true },
    { key: 'ward', label: 'Ward', render: v => v || '—' },
    { key: 'description', label: 'Description', render: v => v ? (v.length > 60 ? v.slice(0, 60) + '…' : v) : '—' },
    { key: 'created_at', label: 'Created', render: v => fmtDate(v) },
    {
      key: 'is_active', label: 'Status',
      render: v => <Badge variant={v ? 'success' : 'default'}>{v ? 'Active' : 'Inactive'}</Badge>
    },
    {
      key: '_actions', label: '',
      render: (_, row) => (
        <div className="flex gap-2" onClick={e => e.stopPropagation()}>
          {isAdmin && <button onClick={() => openEdit(row)} className="text-xs text-blue-600 hover:underline">Edit</button>}
          {isAdmin && row.is_active && <button onClick={() => setDeleteTarget(row)} className="text-xs text-orange-600 hover:underline">Deactivate</button>}
        </div>
      )
    },
  ]

  return (
    <Layout title="BCC Units">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-5">
          <input
            type="search"
            placeholder="Search BCC units…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-900"
          />
          {isAdmin && (
            <button onClick={openAdd} className="px-4 py-2 bg-primary-900 text-white text-sm font-medium rounded-lg hover:bg-primary-800">
              + Add BCC Unit
            </button>
          )}
        </div>
        <Table columns={columns} data={filtered} loading={loading} emptyTitle="No BCC units found" />
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit BCC Unit' : 'Add BCC Unit'}>
        <div className="space-y-4">
          {formError && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{formError}</div>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-900" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ward</label>
            <input value={form.ward} onChange={e => setForm(f => ({ ...f, ward: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-900" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-900" />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="bcc_active" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="rounded" />
            <label htmlFor="bcc_active" className="text-sm text-gray-700">Active</label>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={handleSave} disabled={saving} className="flex-1 bg-primary-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-primary-800 disabled:opacity-50">
              {saving ? 'Saving…' : (editing ? 'Save Changes' : 'Add Unit')}
            </button>
            <button onClick={() => setModalOpen(false)} className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Deactivate BCC Unit"
        message={`Deactivate "${deleteTarget?.name}"? Members in this BCC will not be removed.`}
        confirmLabel="Deactivate"
        loading={deleteSaving}
      />
    </Layout>
  )
}
