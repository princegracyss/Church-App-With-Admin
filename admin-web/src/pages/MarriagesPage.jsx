import { useEffect, useState, useCallback } from 'react'
import { Layout } from '../components/Layout'
import { Table } from '../components/Table'
import { Modal } from '../components/Modal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { fmtDate, fullName } from '../lib/utils'

export default function MarriagesPage() {
  const { isSecretary } = useAuth()
  const [marriages, setMarriages] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState({ husband_member_id: '', wife_member_id: '', marriage_date: '', church: '', certificate_number: '' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteSaving, setDeleteSaving] = useState(false)

  const fetchMarriages = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('marriages').select('*').order('marriage_date', { ascending: false })
    setMarriages(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchMarriages() }, [fetchMarriages])

  useEffect(() => {
    supabase.from('members').select('id, first_name, middle_name, last_name, member_number').order('first_name')
      .then(({ data }) => setMembers(data ?? []))
  }, [])

  const memberMap = Object.fromEntries(members.map(m => [m.id, m]))

  const filtered = marriages.filter(m => {
    if (!search) return true
    const q = search.toLowerCase()
    const h = fullName(memberMap[m.husband_member_id]).toLowerCase()
    const w = fullName(memberMap[m.wife_member_id]).toLowerCase()
    return h.includes(q) || w.includes(q) || (m.church ?? '').toLowerCase().includes(q) || (m.certificate_number ?? '').toLowerCase().includes(q)
  })

  async function handleCreate() {
    if (!form.husband_member_id || !form.wife_member_id || !form.marriage_date) {
      setFormError('Husband, wife, and marriage date are required.')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      const { error } = await supabase.from('marriages').insert(form)
      if (error) throw error
      setCreateOpen(false)
      setForm({ husband_member_id: '', wife_member_id: '', marriage_date: '', church: '', certificate_number: '' })
      fetchMarriages()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleteSaving(true)
    try {
      await supabase.from('marriages').delete().eq('id', deleteTarget.id)
      setDeleteTarget(null)
      fetchMarriages()
    } finally {
      setDeleteSaving(false)
    }
  }

  const columns = [
    { key: 'husband_member_id', label: 'Husband', render: v => fullName(memberMap[v]) || '—' },
    { key: 'wife_member_id', label: 'Wife', render: v => fullName(memberMap[v]) || '—' },
    { key: 'marriage_date', label: 'Date', sortable: true, render: v => fmtDate(v) },
    { key: 'church', label: 'Church', render: v => v || '—' },
    { key: 'certificate_number', label: 'Certificate #', render: v => v || '—' },
    {
      key: '_actions', label: '',
      render: (_, row) => isSecretary && (
        <button onClick={e => { e.stopPropagation(); setDeleteTarget(row) }} className="text-xs text-red-600 hover:underline">Delete</button>
      )
    },
  ]

  return (
    <Layout title="Marriages">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-5">
          <input type="search" placeholder="Search by name, church, certificate…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-900" />
          {isSecretary && (
            <button onClick={() => { setForm({ husband_member_id: '', wife_member_id: '', marriage_date: '', church: '', certificate_number: '' }); setFormError(''); setCreateOpen(true) }}
              className="px-4 py-2 bg-primary-900 text-white text-sm font-medium rounded-lg hover:bg-primary-800">
              + Add Marriage
            </button>
          )}
        </div>
        <Table columns={columns} data={filtered} loading={loading} emptyTitle="No marriage records" />
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Record Marriage">
        <div className="space-y-4">
          {formError && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{formError}</div>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Husband (Member) *</label>
            <select value={form.husband_member_id} onChange={e => setForm(f => ({ ...f, husband_member_id: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none">
              <option value="">— Select husband —</option>
              {members.filter(m => m.id !== form.wife_member_id).map(m => <option key={m.id} value={m.id}>{fullName(m)} ({m.member_number})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Wife (Member) *</label>
            <select value={form.wife_member_id} onChange={e => setForm(f => ({ ...f, wife_member_id: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none">
              <option value="">— Select wife —</option>
              {members.filter(m => m.id !== form.husband_member_id).map(m => <option key={m.id} value={m.id}>{fullName(m)} ({m.member_number})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Marriage Date *</label>
            <input type="date" value={form.marriage_date} onChange={e => setForm(f => ({ ...f, marriage_date: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-900" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Church</label>
            <input value={form.church} onChange={e => setForm(f => ({ ...f, church: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-900" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Certificate Number</label>
            <input value={form.certificate_number} onChange={e => setForm(f => ({ ...f, certificate_number: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-900" />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={handleCreate} disabled={saving} className="flex-1 bg-primary-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-primary-800 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save Record'}
            </button>
            <button onClick={() => setCreateOpen(false)} className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete}
        title="Delete Marriage Record"
        message="Are you sure you want to delete this marriage record? This cannot be undone."
        confirmLabel="Delete" danger loading={deleteSaving} />
    </Layout>
  )
}
