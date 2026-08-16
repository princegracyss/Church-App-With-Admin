export function StatCard({ title, value, icon, color = 'primary', loading = false }) {
  const colors = {
    primary: 'bg-primary-900 text-white',
    gold:    'bg-gold-500 text-white',
    green:   'bg-green-600 text-white',
    blue:    'bg-blue-600 text-white',
    orange:  'bg-orange-500 text-white',
    purple:  'bg-purple-600 text-white',
  }
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4 shadow-sm">
      <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-xl flex-shrink-0 ${colors[color] ?? colors.primary}`}>
        {icon}
      </div>
      <div>
        <p className="text-sm text-gray-500">{title}</p>
        {loading
          ? <div className="h-7 w-16 bg-gray-200 rounded animate-pulse mt-1" />
          : <p className="text-2xl font-bold text-gray-900">{value ?? '—'}</p>
        }
      </div>
    </div>
  )
}
