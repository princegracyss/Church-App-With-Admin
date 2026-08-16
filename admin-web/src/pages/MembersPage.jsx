import { useEffect, useState, useCallback } from 'react'
import { Layout } from '../components/Layout'
import { Table } from '../components/Table'
import { Badge, statusBadge } from '../components/Badge'
import { SlideOver } from '../components/Modal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { EmptyState } from '../components/EmptyState'
import { Spinner } from '../components/Spinner'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { fmtDate, fullName } from '../lib/utils'

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
const GENDERS = ['male', 'female', 'other']
const MARITAL_STATUSES = ['single', 'married', 'widowed', 'divorced']
const RELATIONSHIPS = ['head', 'spouse', 'son', 'daughter', 'father', 'mother', 'sibling', 'other']
const EDUCATIONS = ['none', 'primary', 'secondary', 'higher_secondary', 'graduate', 'post_graduate', 'doctorate', 'other']
const STATUSES = ['active', 'inactive']

const EMPTY_FORM = {
  first_name: '', middle_name: '', last_name: '', gender: 'male',
  date_of_birth: '', blood_group: '', mobile: '', email: '',
  occupation: '', education: '', marital_status: 'single',
  relationship_to_head: 'head', baptism_name: '', photo: '',
  basic_christian_community: '', family_id: '', status: 'active',
  is_family_head: false,
}

export default function MembersPage() {
  const { isSecretary } = useAuth()
  const [members, setMembers] = useState([])
  const [bccUnits, setBccUnits] = useState([])
  const [families, setFamilies] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterBcc, setFilterBcc] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [slideOpen, setSlideOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [hardDeleteTarget, setHardDeleteTarget] = useState(null)
  const [deleteSaving, setDeleteSaving] = useState(false)
  const [detailMember, setDetailMember] = useState(null)
  const [sacraments, setSacraments] = useState([])
  const [detailLoading, setDetailLoading] = useState(false)

  const fetchMembers = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('members').select(`
      id, member_number, first_name, middle_name, last_name,
      gender, date_of_birth, blood_group, mobile, email,
      occupation, education, marital_status, relationship_to_head,
      baptism_name, photo, basic_christian_community, family_id,
      status, is_family_head, created_at
    `).order('member_number')
    if (filterBcc) q = q.eq('basic_christian_community', filterBcc)
    if (filterStatus) q = q.eq('status', filterStatus)
    const { data } = await q
    setMembers(data ?? [])
    setLoading(false)
  }, [filterBcc, filterStatus])

  useEffect(() => { fetchMembers() }, [fetchMembers])

  useEffect(() => {
    supabase.from('bcc_units').select('id, name').eq('is_active', true).order('name')
      .then(({ data }) => setBccUnits(data ?? []))
    supabase.from('families').select('id, family_code, house_name').order('family_code')
      .then(({ data }) => setFamilies(data ?? []))
  }, [])

  const filtered = members.filter(m => {
    if (!search) return true
    const q = search.toLowerCase()
    return fullName(m).toLowerCase().includes(q) ||
      (m.member_number ?? '').toLowerCase().includes(q) ||
      (m.mobile ?? '').includes(q)
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
      first_name: row.first_name ?? '',
      middle_name: row.middle_name ?? '',
      last_name: row.last_name ?? '',
      gender: row.gender ?? 'male',
      date_of_birth: row.date_of_birth ?? '',
      blood_group: row.blood_group ?? '',
      mobile: row.mobile ?? '',
      email: row.email ?? '',
      occupation: row.occupation ?? '',
      education: row.education ?? '',
      marital_status: row.marital_status ?? 'single',
      relationship_to_head: row.relationship_to_head ?? 'head',
      baptism_name: row.baptism_name ?? '',
      photo: row.photo ?? '',
      basic_christian_community: row.basic_christian_community ?? '',
      family_id: row.family_id ?? '',
      status: row.status ?? 'active',
      is_family_head: row.is_family_head ?? false,
    })
    setFormError('')
    setSlideOpen(true)
  }

  async function handleSave() {
    if (!form.first_name || !form.last_name) {
      setFormError('First name and last name are required.')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      if (editing) {
        const { error } = await supabase.from('members').update(form).eq('id', editing.id)
        if (error) throw error
      } else {
        const { data: numData } = await supabase.rpc('next_member_number')
        const { error } = await supabase.from('members').insert({
          ...form,
          member_number: numData,
        })
        if (error) throw error
      }
      setSlideOpen(false)
      fetchMembers()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleSoftDelete() {
    setDeleteSaving(true)
    try {
      await supabase.from('members').update({ status: 'inactive' }).eq('id', deleteTarget.id)
      setDeleteTarget(null)
      fetchMembers()
    } finally {
      setDeleteSaving(false)
    }
  }

  async function handleHardDelete() {
    setDeleteSaving(true)
    try {
      await supabase.from('members').delete().eq('id', hardDeleteTarget.id)
      setHardDeleteTarget(null)
      fetchMembers()
    } finally {
      setDeleteSaving(false)
    }
  }

  async function openDetail(row) {
    setDetailMember(row)
    setDetailLoading(true)
    const { data } = await supabase.from('sacraments').select('*').eq('member_id', row.id)
    setSacraments(data ?? [])
    setDetailLoading(false)
  }

  const columns = [
    { key: 'member_number', label: 'Member #', sortable: true },
    { key: 'first_name', label: 'Name', render: (_, row) => fullName(row) },
    { key: 'basic_christian_community', label: 'BCC', render: v => v || '—' },
    { key: 'mobile', label: 'Mobile', render: v => v || '—' },
    { key: 'status', label: 'Status', render: v => statusBadge(v) },
    {
      key: '_actions', label: '', render: (_, row) => (
        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
          {isSecretary && (
            <button onClick={() => openEdit(row)} className="text-xs text-blue-600 hover:underline">Edit</button>
          )}
          {isSecretary && row.status === 'active' && (
            <button onClick={() => setDeleteTarget(row)} className="text-xs text-orange-600 hover:underline">Deactivate</button>
          )}
          {isSecretary && (
            <button onClick={() => setHardDeleteTarget(row)} className="text-xs text-red-600 hover:underline">Delete</button>
          )}
        </div>
      )
    },
  ]

  return (
    <Layout title="Members">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <input
            type="search"
            placeholder="Search name, number, mobile…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-48 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-900"
          />
          <select
            value={filterBcc}
            onChange={e => setFilterBcc(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none"
          >
            <option value="">All BCC</option>
            {bccUnits.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
          </select>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none"
          >
            <option value="">All Status</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {isSecretary && (
            <button
              onClick={openAdd}
              className="px-4 py-2 bg-primary-900 text-white text-sm font-medium rounded-lg hover:bg-primary-800 flex-shrink-0"
            >
              + Add Member
            </button>
          )}
        </div>

        <Table
          columns={columns}
          data={filtered}
          loading={loading}
          emptyTitle="No members found"
          emptyDescription="Add your first member or adjust the filters."
          onRowClick={openDetail}
        />
      </div>

      {/* Add/Edit Slide-over */}
      <SlideOver
        open={slideOpen}
        onClose={() => setSlideOpen(false)}
        title={editing ? 'Edit Member' : 'Add Member'}
      >
        <div className="space-y-4">
          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{formError}</div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="First Name *" value={form.first_name} onChange={v => setForm(f => ({ ...f, first_name: v }))} />
            <FormField label="Middle Name" value={form.middle_name} onChange={v => setForm(f => ({ ...f, middle_name: v }))} />
          </div>
          <FormField label="Last Name *" value={form.last_name} onChange={v => setForm(f => ({ ...f, last_name: v }))} />
          <FormField label="Baptism Name" value={form.baptism_name} onChange={v => setForm(f => ({ ...f, baptism_name: v }))} />
          <div className="grid grid-cols-2 gap-3">
            <FormSelect label="Gender" value={form.gender} onChange={v => setForm(f => ({ ...f, gender: v }))} options={GENDERS} />
            <FormField label="Date of Birth" type="date" value={form.date_of_birth} onChange={v => setForm(f => ({ ...f, date_of_birth: v }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormSelect label="Blood Group" value={form.blood_group} onChange={v => setForm(f => ({ ...f, blood_group: v }))} options={['', ...BLOOD_GROUPS]} />
            <FormSelect label="Marital Status" value={form.marital_status} onChange={v => setForm(f => ({ ...f, marital_status: v }))} options={MARITAL_STATUSES} />
          </div>
          <FormField label="Mobile" value={form.mobile} onChange={v => setForm(f => ({ ...f, mobile: v }))} />
          <FormField label="Email" type="email" value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} />
          <FormField label="Occupation" value={form.occupation} onChange={v => setForm(f => ({ ...f, occupation: v }))} />
          <div className="grid grid-cols-2 gap-3">
            <FormSelect label="Education" value={form.education} onChange={v => setForm(f => ({ ...f, education: v }))} options={['', ...EDUCATIONS]} />
            <FormSelect label="Relationship to Head" value={form.relationship_to_head} onChange={v => setForm(f => ({ ...f, relationship_to_head: v }))} options={RELATIONSHIPS} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">BCC Unit</label>
            <select
              value={form.basic_christian_community}
              onChange={e => setForm(f => ({ ...f, basic_christian_community: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none"
            >
              <option value="">— None —</option>
              {bccUnits.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Family</label>
            <select
              value={form.family_id}
              onChange={e => setForm(f => ({ ...f, family_id: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none"
            >
              <option value="">— None —</option>
              {families.map(fam => (
                <option key={fam.id} value={fam.id}>{fam.family_code} — {fam.house_name}</option>
              ))}
            </select>
          </div>
          <FormField label="Photo URL" value={form.photo} onChange={v => setForm(f => ({ ...f, photo: v }))} />
          <div className="grid grid-cols-2 gap-3">
            <FormSelect label="Status" value={form.status} onChange={v => setForm(f => ({ ...f, status: v }))} options={STATUSES} />
            <div className="flex items-center gap-2 pt-6">
              <input
                type="checkbox"
                id="is_family_head"
                checked={form.is_family_head}
                onChange={e => setForm(f => ({ ...f, is_family_head: e.target.checked }))}
                className="rounded"
              />
              <label htmlFor="is_family_head" className="text-sm text-gray-700">Family Head</label>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 bg-primary-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-primary-800 disabled:opacity-50"
            >
              {saving ? 'Saving…' : (editing ? 'Save Changes' : 'Add Member')}
            </button>
            <button
              onClick={() => setSlideOpen(false)}
              className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </SlideOver>

      {/* Detail panel */}
      {detailMember && (
        <SlideOver open={!!detailMember} onClose={() => setDetailMember(null)} title={fullName(detailMember)}>
          {detailLoading ? <Spinner className="py-16" /> : (
            <div className="space-y-6">
              <section>
                <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">Personal Info</h3>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <DetailItem label="Member #" value={detailMember.member_number} />
                  <DetailItem label="Gender" value={detailMember.gender} />
                  <DetailItem label="Date of Birth" value={fmtDate(detailMember.date_of_birth)} />
                  <DetailItem label="Blood Group" value={detailMember.blood_group} />
                  <DetailItem label="Mobile" value={detailMember.mobile} />
                  <DetailItem label="Email" value={detailMember.email} />
                  <DetailItem label="Occupation" value={detailMember.occupation} />
                  <DetailItem label="Education" value={detailMember.education} />
                  <DetailItem label="Marital Status" value={detailMember.marital_status} />
                  <DetailItem label="BCC" value={detailMember.basic_christian_community} />
                  <DetailItem label="Status" value={statusBadge(detailMember.status)} />
                  <DetailItem label="Family Head" value={detailMember.is_family_head ? 'Yes' : 'No'} />
                </dl>
              </section>

              <section>
                <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">Sacraments</h3>
                {sacraments.length === 0
                  ? <p className="text-sm text-gray-400">No sacrament records.</p>
                  : (
                    <div className="space-y-2">
                      {sacraments.map(s => (
                        <div key={s.id} className="p-3 bg-gray-50 rounded-lg text-sm">
                          <div className="font-medium">{s.type}</div>
                          <div className="text-gray-500">{fmtDate(s.date)} · {s.church_name}</div>
                          {s.minister_name && <div className="text-gray-500">Minister: {s.minister_name}</div>}
                        </div>
                      ))}
                    </div>
                  )
                }
              </section>

              {isSecretary && (
                <button
                  onClick={() => { setDetailMember(null); openEdit(detailMember) }}
                  className="w-full bg-primary-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-primary-800"
                >
                  Edit Member
                </button>
              )}
            </div>
          )}
        </SlideOver>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleSoftDelete}
        title="Deactivate Member"
        message={`Are you sure you want to deactivate ${fullName(deleteTarget)}? They will remain in the database but marked inactive.`}
        confirmLabel="Deactivate"
        loading={deleteSaving}
      />

      <ConfirmDialog
        open={!!hardDeleteTarget}
        onClose={() => setHardDeleteTarget(null)}
        onConfirm={handleHardDelete}
        title="Permanently Delete Member"
        message={`This will permanently delete ${fullName(hardDeleteTarget)} and cannot be undone. Are you absolutely sure?`}
        confirmLabel="Delete Forever"
        danger
        loading={deleteSaving}
      />
    </Layout>
  )
}

function FormField({ label, value, onChange, type = 'text' }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-900"
      />
    </div>
  )
}

function FormSelect({ label, value, onChange, options }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none"
      >
        {options.map(o => <option key={o} value={o}>{o || '— Select —'}</option>)}
      </select>
    </div>
  )
}

function DetailItem({ label, value }) {
  return (
    <div>
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium text-gray-900">{value ?? '—'}</dd>
    </div>
  )
}
