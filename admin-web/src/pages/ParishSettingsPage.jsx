import { useEffect, useState } from 'react'
import { Layout } from '../components/Layout'
import { Spinner } from '../components/Spinner'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const DEFAULT_SETTINGS = {
  name: '',
  description: '',
  logo_uri: '',
  primary_color: '#6B1E3C',
  secondary_color: '#C9A24B',
  accent_color: '#C9A24B',
  member_otp_enabled: false,
}

export default function ParishSettingsPage() {
  const { isSuperAdmin } = useAuth()
  const [form, setForm] = useState(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('parish_settings').select('*').eq('id', 1).single()
      .then(({ data }) => {
        if (data) setForm({ ...DEFAULT_SETTINGS, ...data })
        setLoading(false)
      })
  }, [])

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    setError('')
    try {
      const { error: err } = await supabase.from('parish_settings').upsert({ ...form, id: 1 })
      if (err) throw err
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Layout title="Parish Settings"><Spinner className="py-24" /></Layout>

  return (
    <Layout title="Parish Settings">
      <div className="max-w-2xl">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          {!isSuperAdmin && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
              You need super admin privileges to edit parish settings.
            </div>
          )}
          {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
          {saved && <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">Settings saved successfully.</div>}

          <form onSubmit={handleSave} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Parish Name</label>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                disabled={!isSuperAdmin}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-900 disabled:bg-gray-50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                rows={3}
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                disabled={!isSuperAdmin}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-900 disabled:bg-gray-50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Logo URL</label>
              <input
                value={form.logo_uri}
                onChange={e => setForm(f => ({ ...f, logo_uri: e.target.value }))}
                disabled={!isSuperAdmin}
                placeholder="https://…"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-900 disabled:bg-gray-50"
              />
              {form.logo_uri && (
                <img src={form.logo_uri} alt="Logo preview" className="mt-2 h-16 w-16 object-contain rounded border" />
              )}
            </div>

            <div className="grid grid-cols-3 gap-4">
              <ColorField label="Primary Color" value={form.primary_color} disabled={!isSuperAdmin}
                onChange={v => setForm(f => ({ ...f, primary_color: v }))} />
              <ColorField label="Secondary Color" value={form.secondary_color} disabled={!isSuperAdmin}
                onChange={v => setForm(f => ({ ...f, secondary_color: v }))} />
              <ColorField label="Accent Color" value={form.accent_color} disabled={!isSuperAdmin}
                onChange={v => setForm(f => ({ ...f, accent_color: v }))} />
            </div>

            <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
              <input
                type="checkbox"
                id="otp_toggle"
                checked={form.member_otp_enabled}
                onChange={e => setForm(f => ({ ...f, member_otp_enabled: e.target.checked }))}
                disabled={!isSuperAdmin}
                className="rounded"
              />
              <div>
                <label htmlFor="otp_toggle" className="text-sm font-medium text-gray-700">Member OTP Login</label>
                <p className="text-xs text-gray-500 mt-0.5">Allow members to log in via OTP sent to their mobile number.</p>
              </div>
            </div>

            {isSuperAdmin && (
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2.5 bg-primary-900 text-white text-sm font-medium rounded-lg hover:bg-primary-800 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save Settings'}
              </button>
            )}
          </form>
        </div>
      </div>
    </Layout>
  )
}

function ColorField({ label, value, onChange, disabled }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value || '#000000'}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          className="w-10 h-9 rounded border border-gray-300 cursor-pointer disabled:opacity-50"
        />
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          className="flex-1 px-2 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary-900 disabled:bg-gray-50"
        />
      </div>
    </div>
  )
}
