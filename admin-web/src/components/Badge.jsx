export function Badge({ children, variant = 'default' }) {
  const variants = {
    default:    'bg-gray-100 text-gray-700',
    success:    'bg-green-100 text-green-800',
    warning:    'bg-yellow-100 text-yellow-800',
    danger:     'bg-red-100 text-red-800',
    info:       'bg-blue-100 text-blue-800',
    primary:    'bg-primary-100 text-primary-900',
    gold:       'bg-gold-100 text-gold-900',
    purple:     'bg-purple-100 text-purple-800',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${variants[variant] ?? variants.default}`}>
      {children}
    </span>
  )
}

export function roleBadge(role) {
  const map = {
    super_admin:      'danger',
    admin:            'primary',
    parish_priest:    'gold',
    church_secretary: 'info',
    unit_admin:       'purple',
    member:           'default',
  }
  return <Badge variant={map[role] ?? 'default'}>{role?.replace(/_/g, ' ')}</Badge>
}

export function statusBadge(status) {
  const map = {
    active:    'success',
    inactive:  'default',
    submitted: 'info',
    approved:  'success',
    rejected:  'danger',
    issued:    'gold',
    pending:   'warning',
  }
  return <Badge variant={map[status] ?? 'default'}>{status}</Badge>
}
