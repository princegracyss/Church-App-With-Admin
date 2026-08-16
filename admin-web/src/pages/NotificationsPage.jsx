import { useEffect, useState, useCallback } from 'react'
import { Layout } from '../components/Layout'
import { Table } from '../components/Table'
import { Badge } from '../components/Badge'
import { Modal } from '../components/Modal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { fmtDateTime } from '../lib/utils'

const TYPES = ['GENERAL', 'FEAST', 'FUNERAL', 'EMERGENCY', 'BIRTHDAY', 'LITURGY', 'WISH']
const TYPE_COLORS = { GENERAL: 'info', FEAST: 'gold', FUNERAL: 'default', EMERGENCY: 'danger', BIRTHDAY: 'success', LITURGY: 'primary', WISH: 'purple' }

const EMPTY_FORM = { title: '', message: '', type: 'GENERAL', target: 'ALL', target_id: null, expires_at: '' }

export default function NotificationsPage() {
  const { user, isAdmin } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteSaving, setDeleteSaving] = useState(false)
  const [clearAllOpen, setClearAllOpen] = useState(false)
  const [clearSaving, setClearSaving] = useState(false)

  const fetchNotifications = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('notifications').select('*').order('created_at', { ascending: false })
    if (filterType) q = q.eq('type', filterType)
    const { data } = await q
    setNotifications(data ?? [])
    setLoading(false)
  }, [filterType])

  useEffect(() => { fetchNotifications() }, [fetchNotifications])

  async function handleCreate() {
    if (!form.title || !form.message) { setFormError('Title and message are required.'); return }
    setSaving(true)
    setFormError('')
    try {
      const payload = { ...form, created_by: user?.id }
      if (!payload.expires_at) delete payload.expires_at
      if (!payload.target_id) delete payload.target_id
      const { error } = await supabase.from('notifications').insert(payload)
      if (error) throw error
      setCreateOpen(false)
      setForm(EMPTY_FORM)
      fetchNotifications()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleteSaving(true)
    try {
      await supabase.from('notifications').delete().eq('id', deleteTarget.id)
      setDeleteTarget(null)
      fetchNotifications()
    } finally {
      setDeleteSaving(false)
    }
  }

  async function handleClearAll() {
    setClearSaving(true)
    try {
      await supabase.from('notifications').delete().not('type', 'in', '("BIRTHDAY","WISH")')
      setClearAllOpen(false)
      fetchNotifications()
    } finally {
      setClearSaving(false)
    }
  }

  const columns = [
    { key: 'type', label: 'Type', render: v => <Badge variant={TYPE_COLORS[v] ?? 'default'}>{v}</Badge> },
    { key: 'title', label: 'Title', sortable: true },
    { key: 'message', label: 'Message', render: v => v?.length > 70 ? v.slice(0, 70) + '…' : v },
    { key: 'target', label: 'Target', render: v => v || '—' },
    { key: 'created_at', label: 'Sent', sortable: true, render: v => fmtDateTime(v) },
    {
      key: '_actions', label: '',
      render: (_, row) => isAdmin && (
        <button onClick={e => { e.stopPropagation(); setDeleteTarget(row) }} className="text-xs text-red-600 hover:underline">Delete</button>
      )
    },
  ]

  return (
    <Layout title="Notifications">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <select value={filterType} onChange={e => setFilterType(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none">
            <option value="">All Types</option>
            {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <div className="flex-1" />
          {isAdmin && (
            <button onClick={() => setClearAllOpen(true)} className="px-4 py-2 border border-red-300 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50">
              Clear All
            </button>
          )}
          {isAdmin && (
            <button onClick={() => { setForm(EMPTY_FORM); setFormError(''); setCreateOpen(true) }} className="px-4 py-2 bg-primary-900 text-white text-sm font-medium rounded-lg hover:bg-primary-800">
              + Send Notification
            </button>
          )}
        </div>
        <Table columns={columns} data={notifications} loading={loading} emptyTitle="No notifications" />
      </div>

      {/* Create modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Send Notification">
        <div className="space-y-4">
          {formError && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{formError}</div>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none">
              {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-900" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Message *</label>
            <textarea rows={4} value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-900" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Target</label>
            <select value={form.target} onChange={e => setForm(f => ({ ...f, target: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none">
              {['ALL', 'BCC', 'MEMBER', 'FAMILY'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Expires At (optional)</label>
            <input type="datetime-local" value={form.expires_at} onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={handleCreate} disabled={saving} className="flex-1 bg-primary-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-primary-800 disabled:opacity-50">
              {saving ? 'Sending…' : 'Send Notification'}
            </button>
            <button onClick={() => setCreateOpen(false)} className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete}
        title="Delete Notification" message={`Delete notification "${deleteTarget?.title}"?`} confirmLabel="Delete" danger loading={deleteSaving} />

      <ConfirmDialog open={clearAllOpen} onClose={() => setClearAllOpen(false)} onConfirm={handleClearAll}
        title="Clear All Notifications"
        message="This will delete all non-automated notifications (not Birthday/Wish). This cannot be undone."
        confirmLabel="Clear All" danger loading={clearSaving} />
    </Layout>
  )
}
