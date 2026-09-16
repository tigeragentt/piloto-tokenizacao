export default function StatusBadge({ progress }) {
  const map = {
    ACQUIRED_WITH_LOCK: { label: 'ACQUIRED_WITH_LOCK', cls: 'badge-green' },
    AWAITING_DELIVERY:  { label: 'AWAITING_DELIVERY',  cls: 'badge-blue'  },
    AWAITING_ORIGIN:    { label: 'AWAITING_ORIGIN',    cls: 'badge-yellow' },
    REFUNDED:           { label: 'REFUNDED',           cls: 'badge-red'   },
  }
  const { label, cls } = map[progress] || { label: progress || '—', cls: 'badge-dim' }
  return <span className={`status-badge ${cls}`}>{label}</span>
}

export function BoolBadge({ value, trueLabel = '✓', falseLabel = '✗' }) {
  return (
    <span className={value ? 'bool-badge-true' : 'bool-badge-false'}>
      {value ? trueLabel : falseLabel}
    </span>
  )
}
