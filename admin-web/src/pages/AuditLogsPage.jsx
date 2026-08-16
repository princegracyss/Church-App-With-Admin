import { useEffect, useState, useCallback } from 'react'
import { Layout } from '../components/Layout'
import { Table } from '../components/Table'
import { Badge } from '../components/Badge'
import { supabase } from '../lib/supabase'
import { fmtDateTime } from '../lib/utils'

const TABLE_NAMES = ['members', 'families', 'profiles', 'bcc_units', 'organizations', 'certificate_requests', 'notifications', 'marriages', 'liturgy_assignments', 'parish_settings', 'sacraments']
const ACTIONS = ['INSERT', 'UPDATE', 'DELETE']

export default function AuditLogsPage() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterTable, setFilterTable] = useState('')
  const [filterAction, setFilterAction] = useState('')

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(500)
    if (filterTable) q = q.eq('table_name', filterTable)
    if (filterAction) q = q.eq('action', filterAction)
    const { data } = await q
    setLogs(data ?? [])
    setLoading(false)
  }, [filterTable, filterAction])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const ACTION_COLORS = { INSERT: 'success', UPDATE: 'info', DELETE: 'danger' }

  const columns = [
    { key: 'created_at', label: 'Timestamp', sortable: true, render: v => fmtDateTime(v) },
    {
      key: 'action', label: 'Action',
      render: v => <Badge variant={ACTION_COLORS[v] ?? 'default'}>{v}</Badge>
    },
    { key: 'table_name', label: 'Table', sortable: true },
    { key: 'record_id', label: 'Record ID', render: v => v ? String(v).slice(0, 12) + (String(v).length > 12 ? '…' : '') : '—' },
    { key: 'user_id', label: 'User ID', render: v => v ? String(v).slice(0, 12) + (String(v).length > 12 ? '…' : '') : 'System' },
    {
      key: 'old_value', label: 'Changes',
      render: (old, row) => {
        if (!old && !row.new_value) return '—'
        try {
          const oldObj = typeof old === 'string' ? JSON.parse(old) : old
          const newObj = typeof row.new_value === 'string' ? JSON.parse(row.new_value) : row.new_value
          if (row.action === 'INSERT') return <span className="text-green-600 text-xs">New record</span>
          if (row.action === 'DELETE') return <span className="text-red-600 text-xs">Deleted</span>
          const changed = Object.keys(newObj ?? {}).filter(k => JSON.stringify(oldObj?.[k]) !== JSON.stringify(newObj?.[k])).slice(0, 3)
          return changed.length ? <span className="text-xs text-gray-600">{changed.join(', ')}</span> : '—'
        } catch {
          return '—'
        }
      }
    },
  ]

  return (
    <Layout title="Audit Logs">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <select value={filterTable} onChange={e => setFilterTable(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none">
            <option value="">All Tables</option>
            {TABLE_NAMES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={filterAction} onChange={e => setFilterAction(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none">
            <option value="">All Actions</option>
            {ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <button onClick={fetchLogs} className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
            Refresh
          </button>
        </div>
        <Table
          columns={columns}
          data={logs}
          loading={loading}
          emptyTitle="No audit logs found"
          emptyDescription="Audit logs will appear here when data is modified."
          pageSize={25}
        />
      </div>
    </Layout>
  )
}
