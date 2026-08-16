import { useEffect, useState, useCallback } from 'react'
import { Layout } from '../components/Layout'
import { Table } from '../components/Table'
import { Badge, statusBadge } from '../components/Badge'
import { Modal } from '../components/Modal'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { fmtDate, fullName } from '../lib/utils'

const CERT_TYPES = ['baptism', 'confirmation', 'marriage', 'membership', 'birth', 'death', 'first_communion', 'other']
const STATUS_OPTIONS = ['submitted', 'approved', 'rejected', 'issued']

export default function CertificatesPage() {
  const { isPriest, isSuperAdmin } = useAuth()
  const [requests, setRequests] = useState([])
  const [members, setMembers] = useState({})
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterType, setFilterType] = useState('')
  const [forwardTarget, setForwardTarget] = useState(null)
  const [forwardTo, setForwardTo] = useState('')
  const [forwardSaving, setForwardSaving] = useState(false)
  const [actionLoading, setActionLoading] = useState({})

  const canAct = isPriest || isSuperAdmin

  const fetchRequests = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('certificate_requests').select('*').order('created_at', { ascending: false })
    if (filterStatus) q = q.eq('status', filterStatus)
    if (filterType) q = q.eq('type', filterType)
    const { data } = await q
    const rows = data ?? []
    setRequests(rows)

    // Fetch member names
    const memberIds = [...new Set(rows.map(r => r.member_id).filter(Boolean))]
    if (memberIds.length) {
      const { data: mems } = await supabase
        .from('members')
        .select('id, first_name, middle_name, last_name')
        .in('id', memberIds)
      const map = {}
      for (const m of (mems ?? [])) map[m.id] = m
      setMembers(map)
    }
    setLoading(false)
  }, [filterStatus, filterType])

  useEffect(() => { fetchRequests() }, [fetchRequests])

  async function updateStatus(id, status, extra = {}) {
    setActionLoading(l => ({ ...l, [id]: true }))
    try {
      const { error } = await supabase.from('certificate_requests').update({ status, ...extra }).eq('id', id)
      if (!error) fetchRequests()
    } finally {
      setActionLoading(l => ({ ...l, [id]: false }))
    }
  }

  async function handleForward() {
    if (!forwardTo.trim()) return
    setForwardSaving(true)
    try {
      await supabase.from('certificate_requests').update({ forwarded_to: forwardTo.trim() }).eq('id', forwardTarget.id)
      setForwardTarget(null)
      setForwardTo('')
      fetchRequests()
    } finally {
      setForwardSaving(false)
    }
  }

  const columns = [
    { key: 'member_id', label: 'Member', render: v => fullName(members[v]) || '—' },
    { key: 'type', label: 'Type', sortable: true, render: v => <Badge variant="info">{v}</Badge> },
    { key: 'status', label: 'Status', sortable: true, render: v => statusBadge(v) },
    { key: 'certificate_number', label: 'Cert #', render: v => v || '—' },
    { key: 'forwarded_to', label: 'Forwarded To', render: v => v || '—' },
    { key: 'created_at', label: 'Requested', sortable: true, render: v => fmtDate(v) },
    {
      key: '_actions', label: 'Actions',
      render: (_, row) => {
        if (!canAct) return null
        const loading = actionLoading[row.id]
        return (
          <div className="flex items-center gap-2">
            {row.status === 'submitted' && (
              <>
                <button
                  onClick={e => { e.stopPropagation(); updateStatus(row.id, 'approved') }}
                  disabled={loading}
                  className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded hover:bg-green-200 disabled:opacity-50"
                >
                  ✓ Approve
                </button>
                <button
                  onClick={e => { e.stopPropagation(); updateStatus(row.id, 'rejected') }}
                  disabled={loading}
                  className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded hover:bg-red-200 disabled:opacity-50"
                >
                  ✗ Reject
                </button>
              </>
            )}
            {row.status === 'approved' && (
              <button
                onClick={e => { e.stopPropagation(); updateStatus(row.id, 'issued') }}
                disabled={loading}
                className="px-2 py-1 text-xs bg-gold-100 text-gold-900 rounded hover:bg-gold-200 disabled:opacity-50"
              >
                🖨 Issue
              </button>
            )}
            <button
              onClick={e => { e.stopPropagation(); setForwardTarget(row); setForwardTo(row.forwarded_to ?? '') }}
              className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
            >
              ↗ Forward
            </button>
          </div>
        )
      }
    },
  ]

  return (
    <Layout title="Certificate Requests">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none">
            <option value="">All Status</option>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filterType} onChange={e => setFilterType(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none">
            <option value="">All Types</option>
            {CERT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <Table columns={columns} data={requests} loading={loading} emptyTitle="No certificate requests" />
      </div>

      {/* Forward modal */}
      <Modal open={!!forwardTarget} onClose={() => setForwardTarget(null)} title="Forward Certificate Request" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Forward request for <strong>{fullName(members[forwardTarget?.member_id])}</strong> ({forwardTarget?.type}) to:
          </p>
          <input
            value={forwardTo}
            onChange={e => setForwardTo(e.target.value)}
            placeholder="Name or email of recipient…"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-900"
          />
          <div className="flex gap-3">
            <button onClick={handleForward} disabled={forwardSaving} className="flex-1 bg-primary-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-primary-800 disabled:opacity-50">
              {forwardSaving ? 'Forwarding…' : 'Forward'}
            </button>
            <button onClick={() => setForwardTarget(null)} className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      </Modal>
    </Layout>
  )
}
