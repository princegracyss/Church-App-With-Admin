import { useEffect, useState } from 'react'
import { Layout } from '../components/Layout'
import { StatCard } from '../components/StatCard'
import { Table } from '../components/Table'
import { Badge } from '../components/Badge'
import { supabase } from '../lib/supabase'
import { fmtDate } from '../lib/utils'

export default function DashboardPage() {
  const [stats, setStats] = useState({})
  const [statsLoading, setStatsLoading] = useState(true)
  const [auditLogs, setAuditLogs] = useState([])
  const [logsLoading, setLogsLoading] = useState(true)

  useEffect(() => {
    fetchStats()
    fetchAuditLogs()
  }, [])

  async function fetchStats() {
    setStatsLoading(true)
    try {
      const [members, families, bcc, certs, notifs] = await Promise.all([
        supabase.from('members').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('families').select('id', { count: 'exact', head: true }),
        supabase.from('bcc_units').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('certificate_requests').select('id', { count: 'exact', head: true }).eq('status', 'submitted'),
        supabase.from('notifications').select('id', { count: 'exact', head: true }),
      ])
      setStats({
        members: members.count ?? 0,
        families: families.count ?? 0,
        bcc: bcc.count ?? 0,
        pendingCerts: certs.count ?? 0,
        notifications: notifs.count ?? 0,
      })
    } finally {
      setStatsLoading(false)
    }
  }

  async function fetchAuditLogs() {
    setLogsLoading(true)
    const { data } = await supabase
      .from('audit_logs')
      .select('id, action, table_name, record_id, created_at, user_id')
      .order('created_at', { ascending: false })
      .limit(10)
    setAuditLogs(data ?? [])
    setLogsLoading(false)
  }

  const auditCols = [
    { key: 'created_at', label: 'Time', sortable: true, render: v => fmtDate(v) },
    {
      key: 'action', label: 'Action', render: v => {
        const m = { INSERT: 'success', UPDATE: 'info', DELETE: 'danger' }
        return <Badge variant={m[v] ?? 'default'}>{v}</Badge>
      }
    },
    { key: 'table_name', label: 'Table', sortable: true },
    { key: 'record_id', label: 'Record', render: v => v ? String(v).slice(0, 8) + '…' : '—' },
    { key: 'user_id', label: 'User', render: v => v ? String(v).slice(0, 8) + '…' : 'System' },
  ]

  return (
    <Layout title="Dashboard">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
        <StatCard title="Active Members"         value={stats.members}      icon="👥" color="primary"  loading={statsLoading} />
        <StatCard title="Families"               value={stats.families}     icon="🏡" color="blue"     loading={statsLoading} />
        <StatCard title="BCC Units"              value={stats.bcc}          icon="⛪" color="green"    loading={statsLoading} />
        <StatCard title="Pending Certificates"   value={stats.pendingCerts} icon="📜" color="orange"   loading={statsLoading} />
        <StatCard title="Total Notifications"    value={stats.notifications}icon="🔔" color="purple"   loading={statsLoading} />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Recent Audit Activity</h2>
        <Table
          columns={auditCols}
          data={auditLogs}
          loading={logsLoading}
          emptyTitle="No audit logs yet"
          pageSize={10}
        />
      </div>
    </Layout>
  )
}
