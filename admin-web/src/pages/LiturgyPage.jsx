import { useEffect, useState, useCallback } from 'react'
import { Layout } from '../components/Layout'
import { Table } from '../components/Table'
import { Badge } from '../components/Badge'
import { Modal } from '../components/Modal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { fmtDate } from '../lib/utils'

export default function LiturgyPage() {
  const { isAdmin, user } = useAuth()
  const [assignments, setAssignments] = useState([])
  const [bccUnits, setBccUnits] = useState([])
  const [organizations, setOrganizations] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterPeriod, setFilterPeriod] = useState('upcoming')
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState({ host_type: 'bcc', bcc_unit_id: '', org_id: '', liturgy_date: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteSaving, setDeleteSaving] = useState(false)

  const fetchAssignments = useCallback(async () => {
    setLoading(true)
    const today = new Date().toISOString().slice(0, 10)
    let q = supabase.from('liturgy_assignments').select('*').order('liturgy_date', { ascending: filterPeriod === 'upcoming' })
    if (filterPeriod === 'upcoming') q = q.gte('liturgy_date', today)
    else if (filterPeriod === 'past') q = q.lt('liturgy_date', today)
    const { data } = await q
    setAssignments(data ?? [])
    setLoading(false)
  }, [filterPeriod])

  useEffect(() => { fetchAssignments() }, [fetchAssignments])

  useEffect(() => {
    supabase.from('bcc_units').select('id, name').eq('is_active', true).order('name')
      .then(({ data }) => setBccUnits(data ?? []))
    supabase.from('organizations').select('id, name').eq('status', 'active').order('name')
      .then(({ data }) => setOrganizations(data ?? []))
  }, [])

  async function handleCreate() {
    if (!form.liturgy_date) { setFormError('Date is required.'); return }
    if (form.host_type === 'bcc' && !form.bcc_unit_id) { setFormError('Select a BCC unit.'); return }
    if (form.host_type === 'org' && !form.org_id) { setFormError('Select an organization.'); return }
    setSaving(true)
    setFormError('')
    try {
      let payload = { liturgy_date: form.liturgy_date, notes: form.notes || null, assigned_by: user?.id }
      if (form.host_type === 'bcc') {
        const unit = bccUnits.find(b => b.id === form.bcc_unit_id)
        payload.bcc_unit_id = form.bcc_unit_id
        payload.bcc_unit_name = unit?.name ?? null
      } else {
        const org = organizations.find(o => o.id === form.org_id)
        payload.org_id = form.org_id
        payload.org_name = org?.name ?? null
      }
      const { error } = await supabase.from('liturgy_assignments').insert(payload)
      if (error) throw error
      setCreateOpen(false)
      fetchAssignments()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleteSaving(true)
    try {
      await supabase.from('liturgy_assignments').delete().eq('id', deleteTarget.id)
      setDeleteTarget(null)
      fetchAssignments()
    } finally {
      setDeleteSaving(false)
    }
  }

  const columns = [
    {
      key: 'bcc_unit_name', label: 'Host', render: (v, row) => (
        <span className="font-medium">{v || row.org_name || '—'}</span>
      )
    },
    {
      key: '_type', label: 'Type', render: (_, row) => (
        <Badge variant={row.bcc_unit_id ? 'primary' : 'gold'}>
          {row.bcc_unit_id ? 'BCC' : 'Org'}
        </Badge>
      )
    },
    { key: 'liturgy_date', label: 'Date', sortable: true, render: v => fmtDate(v) },
    { key: 'notes', label: 'Notes', render: v => v ? (v.length > 60 ? v.slice(0, 60) + '…' : v) : '—' },
    {
      key: '_actions', label: '',
      render: (_, row) => isAdmin && (
        <button onClick={e => { e.stopPropagation(); setDeleteTarget(row) }} className="text-xs text-red-600 hover:underline">Delete</button>
      )
    },
  ]

  return (
    <Layout title="Liturgy Assignments">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
            {['upcoming', 'past', 'all'].map(p => (
              <button key={p} onClick={() => setFilterPeriod(p)}
                className={`px-4 py-2 text-sm capitalize ${filterPeriod === p ? 'bg-primary-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
                {p}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          {isAdmin && (
            <button
              onClick={() => { setForm({ host_type: 'bcc', bcc_unit_id: '', org_id: '', liturgy_date: '', notes: '' }); setFormError(''); setCreateOpen(true) }}
              className="px-4 py-2 bg-primary-900 text-white text-sm font-medium rounded-lg hover:bg-primary-800"
            >
              + Add Assignment
            </button>
          )}
        </div>
        <Table columns={columns} data={assignments} loading={loading} emptyTitle="No liturgy assignments found" />
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Add Liturgy Assignment">
        <div className="space-y-4">
          {formError && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{formError}</div>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Host Type</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" value="bcc" checked={form.host_type === 'bcc'} onChange={() => setForm(f => ({ ...f, host_type: 'bcc' }))} />
                BCC Unit
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" value="org" checked={form.host_type === 'org'} onChange={() => setForm(f => ({ ...f, host_type: 'org' }))} />
                Organization
              </label>
            </div>
          </div>
          {form.host_type === 'bcc' ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">BCC Unit *</label>
              <select value={form.bcc_unit_id} onChange={e => setForm(f => ({ ...f, bcc_unit_id: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none">
                <option value="">— Select BCC unit —</option>
                {bccUnits.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Organization *</label>
              <select value={form.org_id} onChange={e => setForm(f => ({ ...f, org_id: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none">
                <option value="">— Select organization —</option>
                {organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
            <input type="date" value={form.liturgy_date} onChange={e => setForm(f => ({ ...f, liturgy_date: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-900" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-900" />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={handleCreate} disabled={saving} className="flex-1 bg-primary-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-primary-800 disabled:opacity-50">
              {saving ? 'Saving…' : 'Add Assignment'}
            </button>
            <button onClick={() => setCreateOpen(false)} className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete}
        title="Delete Assignment"
        message="Delete this liturgy assignment?"
        confirmLabel="Delete" danger loading={deleteSaving} />
    </Layout>
  )
}
