import { useEffect, useState, useCallback } from 'react'
import { Layout } from '../components/Layout'
import { Table } from '../components/Table'
import { statusBadge } from '../components/Badge'
import { SlideOver } from '../components/Modal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Spinner } from '../components/Spinner'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { fullName } from '../lib/utils'

const WARDS = ['Ward 1', 'Ward 2', 'Ward 3', 'Ward 4', 'Ward 5', 'Ward 6', 'Ward 7', 'Ward 8']

const EMPTY_FORM = {
  family_code: '', house_name: '', address_line1: '', address_line2: '',
  place: '', district: '', state: 'Kerala', pincode: '', phone: '', email: '',
  ward: '', basic_christian_community: '', status: 'active',
}

export default function FamiliesPage() {
  const { isSecretary } = useAuth()
  const [families, setFamilies] = useState([])
  const [memberCounts, setMemberCounts] = useState({})
  const [bccUnits, setBccUnits] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterWard, setFilterWard] = useState('')
  const [filterBcc, setFilterBcc] = useState('')
  const [slideOpen, setSlideOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteSaving, setDeleteSaving] = useState(false)
  const [detailFamily, setDetailFamily] = useState(null)
  const [familyMembers, setFamilyMembers] = useState([])
  const [detailLoading, setDetailLoading] = useState(false)

  const fetchFamilies = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('families').select('*').order('family_code')
    if (filterWard) q = q.eq('ward', filterWard)
    if (filterBcc) q = q.eq('basic_christian_community', filterBcc)
    const { data } = await q
    const rows = data ?? []
    setFamilies(rows)

    // fetch member counts
    if (rows.length) {
      const ids = rows.map(r => r.id)
      const { data: counts } = await supabase
        .from('members')
        .select('family_id')
        .in('family_id', ids)
        .eq('status', 'active')
      const map = {}
      for (const c of (counts ?? [])) {
        map[c.family_id] = (map[c.family_id] ?? 0) + 1
      }
      setMemberCounts(map)
    }
    setLoading(false)
  }, [filterWard, filterBcc])

  useEffect(() => { fetchFamilies() }, [fetchFamilies])

  useEffect(() => {
    supabase.from('bcc_units').select('id, name').eq('is_active', true).order('name')
      .then(({ data }) => setBccUnits(data ?? []))
  }, [])

  const filtered = families.filter(f => {
    if (!search) return true
    const q = search.toLowerCase()
    return (f.family_code ?? '').toLowerCase().includes(q) ||
      (f.house_name ?? '').toLowerCase().includes(q) ||
      (f.place ?? '').toLowerCase().includes(q)
  })

  function openAdd() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormError('')
    setSlideOpen(true)
  }

  function openEdit(row) {
    setEditing(row)
    setForm({
      family_code: row.family_code ?? '',
      house_name: row.house_name ?? '',
      address_line1: row.address_line1 ?? '',
      address_line2: row.address_line2 ?? '',
      place: row.place ?? '',
      district: row.district ?? '',
      state: row.state ?? 'Kerala',
      pincode: row.pincode ?? '',
      phone: row.phone ?? '',
      email: row.email ?? '',
      ward: row.ward ?? '',
      basic_christian_community: row.basic_christian_community ?? '',
      status: row.status ?? 'active',
    })
    setFormError('')
    setSlideOpen(true)
  }

  async function handleSave() {
    if (!form.house_name) { setFormError('House name is required.'); return }
    setSaving(true)
    setFormError('')
    try {
      if (editing) {
        const { error } = await supabase.from('families').update(form).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('families').insert(form)
        if (error) throw error
      }
      setSlideOpen(false)
      fetchFamilies()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleteSaving(true)
    try {
      await supabase.from('families').delete().eq('id', deleteTarget.id)
      setDeleteTarget(null)
      fetchFamilies()
    } finally {
      setDeleteSaving(false)
    }
  }

  async function openDetail(row) {
    setDetailFamily(row)
    setDetailLoading(true)
    const { data } = await supabase.from('members')
      .select('id, member_number, first_name, middle_name, last_name, gender, mobile, status, is_family_head')
      .eq('family_id', row.id)
    setFamilyMembers(data ?? [])
    setDetailLoading(false)
  }

  const columns = [
    { key: 'family_code', label: 'Code', sortable: true },
    { key: 'house_name', label: 'House Name', sortable: true },
    { key: 'ward', label: 'Ward', render: v => v || '—' },
    { key: 'basic_christian_community', label: 'BCC', render: v => v || '—' },
    { key: 'place', label: 'Place', render: v => v || '—' },
    { key: 'id', label: 'Members', render: (v) => memberCounts[v] ?? 0 },
    { key: 'status', label: 'Status', render: v => statusBadge(v) },
    {
      key: '_actions', label: '', render: (_, row) => (
        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
          {isSecretary && (
            <button onClick={() => openEdit(row)} className="text-xs text-blue-600 hover:underline">Edit</button>
          )}
          {isSecretary && (memberCounts[row.id] ?? 0) === 0 && (
            <button onClick={() => setDeleteTarget(row)} className="text-xs text-red-600 hover:underline">Delete</button>
          )}
        </div>
      )
    },
  ]

  return (
    <Layout title="Families">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <input
            type="search"
            placeholder="Search code, house name, place…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-48 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-900"
          />
          <select value={filterWard} onChange={e => setFilterWard(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none">
            <option value="">All Wards</option>
            {WARDS.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
          <select value={filterBcc} onChange={e => setFilterBcc(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none">
            <option value="">All BCC</option>
            {bccUnits.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
          </select>
          {isSecretary && (
            <button
              onClick={openAdd}
              className="px-4 py-2 bg-primary-900 text-white text-sm font-medium rounded-lg hover:bg-primary-800"
            >
              + Add Family
            </button>
          )}
        </div>

        <Table
          columns={columns}
          data={filtered}
          loading={loading}
          emptyTitle="No families found"
          onRowClick={openDetail}
        />
      </div>

      {/* Family detail */}
      {detailFamily && (
        <SlideOver open={!!detailFamily} onClose={() => setDetailFamily(null)} title={detailFamily.house_name}>
          {detailLoading ? <Spinner className="py-12" /> : (
            <div className="space-y-4">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div><dt className="text-gray-500">Code</dt><dd className="font-medium">{detailFamily.family_code}</dd></div>
                <div><dt className="text-gray-500">Ward</dt><dd className="font-medium">{detailFamily.ward || '—'}</dd></div>
                <div><dt className="text-gray-500">BCC</dt><dd className="font-medium">{detailFamily.basic_christian_community || '—'}</dd></div>
                <div><dt className="text-gray-500">Phone</dt><dd className="font-medium">{detailFamily.phone || '—'}</dd></div>
                <div className="col-span-2"><dt className="text-gray-500">Address</dt><dd className="font-medium">{[detailFamily.address_line1, detailFamily.address_line2, detailFamily.place, detailFamily.district, detailFamily.state, detailFamily.pincode].filter(Boolean).join(', ') || '—'}</dd></div>
              </dl>
              <h3 className="text-sm font-semibold text-gray-500 uppercase pt-2">Members ({familyMembers.length})</h3>
              {familyMembers.length === 0
                ? <p className="text-sm text-gray-400">No members in this family.</p>
                : familyMembers.map(m => (
                  <div key={m.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm">
                    <div>
                      <span className="font-medium">{fullName(m)}</span>
                      {m.is_family_head && <span className="ml-2 text-xs text-gold-700 font-medium">Head</span>}
                      <div className="text-gray-500">{m.member_number} · {m.gender}</div>
                    </div>
                    {statusBadge(m.status)}
                  </div>
                ))
              }
            </div>
          )}
        </SlideOver>
      )}

      {/* Add/Edit Slide-over */}
      <SlideOver open={slideOpen} onClose={() => setSlideOpen(false)} title={editing ? 'Edit Family' : 'Add Family'}>
        <div className="space-y-4">
          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{formError}</div>
          )}
          <FF label="Family Code" value={form.family_code} onChange={v => setForm(f => ({ ...f, family_code: v }))} />
          <FF label="House Name *" value={form.house_name} onChange={v => setForm(f => ({ ...f, house_name: v }))} />
          <FF label="Address Line 1" value={form.address_line1} onChange={v => setForm(f => ({ ...f, address_line1: v }))} />
          <FF label="Address Line 2" value={form.address_line2} onChange={v => setForm(f => ({ ...f, address_line2: v }))} />
          <div className="grid grid-cols-2 gap-3">
            <FF label="Place" value={form.place} onChange={v => setForm(f => ({ ...f, place: v }))} />
            <FF label="District" value={form.district} onChange={v => setForm(f => ({ ...f, district: v }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FF label="State" value={form.state} onChange={v => setForm(f => ({ ...f, state: v }))} />
            <FF label="Pincode" value={form.pincode} onChange={v => setForm(f => ({ ...f, pincode: v }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FF label="Phone" value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} />
            <FF label="Email" type="email" value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ward</label>
            <select value={form.ward} onChange={e => setForm(f => ({ ...f, ward: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none">
              <option value="">— Select Ward —</option>
              {WARDS.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">BCC Unit</label>
            <select value={form.basic_christian_community} onChange={e => setForm(f => ({ ...f, basic_christian_community: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none">
              <option value="">— None —</option>
              {bccUnits.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={handleSave} disabled={saving} className="flex-1 bg-primary-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-primary-800 disabled:opacity-50">
              {saving ? 'Saving…' : (editing ? 'Save Changes' : 'Add Family')}
            </button>
            <button onClick={() => setSlideOpen(false)} className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      </SlideOver>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Family"
        message={`Delete family "${deleteTarget?.house_name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        danger
        loading={deleteSaving}
      />
    </Layout>
  )
}

function FF({ label, value, onChange, type = 'text' }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-900" />
    </div>
  )
}
