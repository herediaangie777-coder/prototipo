import { useEffect, useRef, useState, ReactNode } from 'react'

// ── SVG Icon helper ──────────────────────────────────────────────────────────
export const Ic = ({ d, size = 16, className = '', style = {} }: {
  d: string; size?: number; className?: string; style?: React.CSSProperties
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    className={className} style={{ flexShrink: 0, ...style }}>
    <path d={d} />
  </svg>
)

// ── Icon paths ───────────────────────────────────────────────────────────────
export const P = {
  plus:       'M12 5v14M5 12h14',
  search:     'M21 21l-4.35-4.35M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z',
  eye:        'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  edit:       'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z',
  close:      'M18 6L6 18M6 6l12 12',
  ban:         'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM4.93 4.93l14.14 14.14',
  check:      'M20 6L9 17l-5-5',
  alert:      'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01',
  download:   'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  filter:     'M22 3H2l8 9.46V19l4 2v-8.54L22 3z',
  trash:      'M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m5 0V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2',
  // Clipboard/list icon for history (distinct document shape)
  clipboard:  'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 0 2-2h2a2 2 0 0 0 2 2M9 12h6M9 16h4',
  layers:     'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  link:       'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  boxes:      'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM3.27 6.96L12 12.01l8.73-5.05M12 22.08V12',
  // Sync/refresh with dual circular arrows (more explicit)
  sync:       'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM4 12a8 8 0 0 1 8-8V2.5M20 12a8 8 0 0 1-8 8v1.5M1 4v6h6M23 20v-6h-6',
  refresh:    'M1 4v6h6M23 20v-6h-6M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15',
  logout:     'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  dashboard:  'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  users:      'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm8 2a3 3 0 0 1 0 6M23 21v-2a3 3 0 0 0-2.08-2.87',
  shield:     'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  tag:        'M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82zM7 7h.01',
  package:    'M16.5 9.4l-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM3.27 6.96L12 12.01l8.73-5.05M12 22.08V12',
  truck:      'M1 3h15v13H1zM16 8h4l3 3v5h-7V8zM5.5 21a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm13 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  production: 'M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83',
  sparkle:    'm12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zm7 11 .9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14z',
  sales:      'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13l-1.5 6h13M10 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm7 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  cash:       'M12 1v22M17 5H9.5a3.5 3.5 0 1 0 0 7h5a3.5 3.5 0 1 1 0 7H6',
  chart:      'M18 20V10M12 20V4M6 20v-6',
  settings:   'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  arrowR:     'M5 12h14M12 5l7 7-7 7',
  stock:      'M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zM12 17v-6M8 17v-2M16 17v-4',
  // Arrow down / minus for stock deduction
  arrowDown:  'M12 5v14M19 12l-7 7-7-7',
  bell:       'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0',
  user:       'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  key:        'M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4',
  lock:       'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4M12 15v2',
}

// ── Modal ────────────────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, wide, narrow }: {
  open: boolean; onClose: () => void; title: string;
  children: ReactNode; wide?: boolean; narrow?: boolean
}) {
  if (!open) return null
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal-box${wide ? ' wide' : narrow ? ' narrow' : ''}`}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontFamily: 'Outfit', fontWeight: 700, fontSize: 19, color: 'var(--text-head)' }}>{title}</h2>
          <button className="btn-ghost" onClick={onClose} style={{ padding: 6 }}>
            <Ic d={P.close} size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function ConfirmModal({ open, title, message, actionLabel, onCancel, onConfirm }: {
  open: boolean; title: string; message: string; actionLabel: string
  onCancel: () => void; onConfirm: () => void
}) {
  return <Modal open={open} onClose={onCancel} title={title} narrow>
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 24 }}>
      <span style={{ color: 'var(--amber)', background: 'var(--warning-bg)', borderRadius: '50%', padding: 10, display: 'inline-flex' }}><Ic d={P.alert} size={20} /></span>
      <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.6 }}>{message}</p>
    </div>
    <div style={{ display: 'flex', gap: 10 }}>
      <button className="btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={onCancel}>Cancelar</button>
      <button className="btn-danger" style={{ flex: 1, justifyContent: 'center' }} onClick={onConfirm}>{actionLabel}</button>
    </div>
  </Modal>
}

export function Pagination({ page, total, pageSize = 10, onPageChange }: {
  page: number; total: number; pageSize?: number; onPageChange: (page: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  return <div className="pagination">
    <button className="page-button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Página anterior">←</button>
    <span>Página {page} de {pages}</span>
    <button className="page-button" disabled={page >= pages} onClick={() => onPageChange(page + 1)} aria-label="Página siguiente">→</button>
    <button className="page-last" onClick={() => onPageChange(pages)}>Ver la última</button>
  </div>
}

// ── Toggle Switch ────────────────────────────────────────────────────────────
export function Toggle({ active, onChange }: { active: boolean; onChange: () => void }) {
  return (
    <div className="toggle-wrap">
      <span className="toggle-label" style={{ color: active ? 'var(--active-text)' : 'var(--inactive-text)' }}>
        {active ? 'Activo' : 'Inactivo'}
      </span>
      <div className="toggle-track" style={{ background: active ? 'var(--active)' : 'var(--inactive)' }}
        onClick={onChange}>
        <div className="toggle-thumb" style={{ left: active ? 25 : 3 }} />
      </div>
    </div>
  )
}

// ── Colorful action icon buttons (no box containers) ─────────────────────────
// Standard usage: render these directly inside <ActionsCell>

// Eye — blue
export function ViewBtn({ onClick, title = 'Ver detalle' }: { onClick: () => void; title?: string }) {
  return (
    <button type="button" className="semantic-action" title={title} aria-label={title} onClick={onClick} style={iconBtnStyle('var(--action-view)')}>
      <Ic d={P.eye} size={15} />
    </button>
  )
}

// Pencil — amber/orange
export function EditBtn({ onClick, title = 'Editar' }: { onClick: () => void; title?: string }) {
  return (
    <button type="button" className="semantic-action" title={title} aria-label={title} onClick={onClick} style={iconBtnStyle('var(--action-edit)')}>
      <Ic d={P.edit} size={15} />
    </button>
  )
}

// Clipboard — slate blue (history)
export function HistoryBtn({ onClick, title = 'Historial de compras' }: { onClick: () => void; title?: string }) {
  return (
    <button type="button" className="semantic-action" title={title} aria-label={title} onClick={onClick} style={iconBtnStyle('var(--action-history)')}>
      <Ic d={P.clipboard} size={15} />
    </button>
  )
}

// Trash — red (anular/delete)
export function TrashBtn({ onClick, title = 'Anular' }: { onClick: () => void; title?: string }) {
  return (
    <button type="button" className="semantic-action" title={title} aria-label={title} onClick={onClick} style={iconBtnStyle('var(--action-trash)')}>
      <Ic d={P.trash} size={15} />
    </button>
  )
}

// Tag — emerald (associate lot number to purchase)
export function LoteBtn({ onClick, title = 'Asociar lote' }: { onClick: () => void; title?: string }) {
  return (
    <button type="button" className="semantic-action" title={title} aria-label={title} onClick={onClick} style={iconBtnStyle('var(--action-lote)')}>
      <Ic d={P.tag} size={15} />
    </button>
  )
}

// Key — teal (permissions shortcut)
export function PermBtn({ onClick, title = 'Ver permisos' }: { onClick: () => void; title?: string }) {
  return (
    <button type="button" className="semantic-action" title={title} aria-label={title} onClick={onClick} style={iconBtnStyle('var(--action-perm)')}>
      <Ic d={P.key} size={15} />
    </button>
  )
}

export function FilterPopover({ activeCount, onClear, children }: {
  activeCount: number
  onClear: () => void
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick)
  }, [open])
  return <div className="filter-popover" ref={root}>
    <button type="button" className="btn-secondary filter-trigger" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(value => !value)}>
      <Ic d={P.filter} size={15} /> Filtrar{activeCount > 0 && <span className="filter-count">{activeCount}</span>}
    </button>
    {open && <div className="filter-panel" role="dialog" aria-label="Filtros">
      <div className="filter-panel-heading"><strong>Filtros</strong><button type="button" className="link-button" disabled={!activeCount} onClick={onClear}>Limpiar</button></div>
      <div className="filter-panel-fields">{children}</div>
    </div>}
  </div>
}

// Generic legacy ABtn kept for compatibility
export function ABtn({ icon, title, onClick, danger }: {
  icon: string; title: string; onClick: () => void; danger?: boolean
}) {
  return (
    <button title={title} onClick={onClick}
      style={iconBtnStyle(danger ? 'var(--action-trash)' : 'var(--action-history)')}>
      <Ic d={icon} size={15} />
    </button>
  )
}

function iconBtnStyle(color: string): React.CSSProperties {
  return {
    background: 'transparent',
    border: 'none',
    padding: '4px 5px',
    borderRadius: 6,
    cursor: 'pointer',
    color,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'opacity 0.15s, background 0.15s',
    flexShrink: 0,
  }
}

export function TopHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return <header className="top-header"><div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div></header>
}

// ── Form field ───────────────────────────────────────────────────────────────
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)',
        marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

// ── Search bar ───────────────────────────────────────────────────────────────
export function SearchBar({ placeholder, value, onChange }: {
  placeholder?: string; value: string; onChange: (v: string) => void
}) {
  return (
    <div className="search-wrap" style={{ position: 'relative' }}>
      <Ic d={P.search} size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)' }} />
      <input className="input" placeholder={placeholder ?? 'Buscar...'} value={value}
        onChange={e => onChange(e.target.value)} style={{ paddingLeft: 36, maxWidth: 340 }} />
    </div>
  )
}

// ── Formatters ───────────────────────────────────────────────────────────────
export const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)

// ── Row actions cell wrapper ─────────────────────────────────────────────────
export function ActionsCell({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      {children}
    </div>
  )
}

// ── useToggleMap ─────────────────────────────────────────────────────────────
export function useToggleMap(ids: number[], initial = true) {
  const [map, setMap] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(ids.map(id => [id, initial]))
  )
  const toggle = (id: number) => setMap(m => ({ ...m, [id]: !m[id] }))
  return { map, toggle }
}

export function Divider() { return <div className="divider" /> }
