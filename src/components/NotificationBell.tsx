import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Ic, P } from './shared'
import { api, isApiMode } from '@/data/services/api'

type Row = Record<string, unknown>

interface Alert {
  tipo: 'lote' | 'stock'
  titulo: string
  detalle: string
  severity: 'danger' | 'warning'
  modulo: string
}

export function NotificationBell() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isApiMode) { setLoading(false); return }
    Promise.all([
      api.getVLotes().catch(() => [] as Row[]),
      api.getVStockProducto().catch(() => [] as Row[]),
      api.list<Row>('productos').catch(() => []),
    ]).then(([lotes, stock, productos]) => {
      const todayStr = new Date().toISOString().split('T')[0]
      const twoDaysAhead = new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0]

      const prodName = (id: unknown) => {
        const p = productos.find(x => x.id_producto === id)
        return p ? String(p.presentacion) : 'Producto'
      }

      const lotesAlerts: Alert[] = lotes
        .filter(l => l.estado !== false && String(l.fecha_vencimiento) <= twoDaysAhead)
        .map(l => {
          const diff = Math.floor((new Date(String(l.fecha_vencimiento) + 'T00:00:00').getTime() - new Date(todayStr + 'T00:00:00').getTime()) / 86400000)
          let estado = 'vence hoy'
          if (diff < 0) estado = `venció hace ${Math.abs(diff)} día${Math.abs(diff) !== 1 ? 's' : ''}`
          else if (diff === 1) estado = 'vence mañana'
          return {
            tipo: 'lote' as const,
            titulo: `${prodName(l.id_producto)} — Lote ${String(l.numero_lote)}`,
            detalle: `${Number(l.cantidad_disponible)} kg · ${estado}`,
            severity: diff < 0 ? 'danger' as const : 'warning' as const,
            modulo: '/produccion',
          }
        })

      const stockAlerts: Alert[] = stock
        .filter(s => s.stock_bajo === true)
        .map(s => ({
          tipo: 'stock' as const,
          titulo: `Stock bajo: ${prodName(s.id_producto)}`,
          detalle: `Stock actual: ${Number(s.stock_vendible) || 0} / Mínimo: ${Number(s.stock_minimo) || 0}`,
          severity: 'warning' as const,
          modulo: '/productos',
        }))

      setAlerts([...lotesAlerts, ...stockAlerts])
    }).catch(() => setAlerts([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!open) return
    const closeOnOutside = (e: PointerEvent) => {
      if (e.target instanceof Node && !rootRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutside)
    return () => document.removeEventListener('pointerdown', closeOnOutside)
  }, [open])

  const count = alerts.length

  return (
    <div className="notification-wrap" ref={rootRef}>
      <button
        className="icon-header"
        aria-label="Notificaciones"
        onClick={() => setOpen(v => !v)}
        style={{ position: 'relative' }}
      >
        <Ic d={P.bell} size={18} />
        {count > 0 && <span className="notification-count">{count}</span>}
      </button>

      {open && (
        <div className="notification-panel">
          <div className="notification-heading">
            <strong>Notificaciones</strong>
            {count > 0 && <span className="muted" style={{ fontSize: 12 }}>{count} alerta{count !== 1 ? 's' : ''}</span>}
          </div>

          {loading ? (
            <div className="notification-row">
              <span className="muted">Cargando…</span>
            </div>
          ) : count === 0 ? (
            <div className="notification-row" style={{ justifyContent: 'center', padding: '24px 14px' }}>
              <span className="muted">Sin notificaciones pendientes</span>
            </div>
          ) : (
            alerts.map((alert, i) => (
              <button
                key={i}
                className="notification-row"
                style={{ border: 0, background: 'transparent', cursor: 'pointer', width: '100%', textAlign: 'left' }}
                onClick={() => { setOpen(false); navigate(alert.modulo) }}
              >
                <span className="notification-dot" style={{ background: alert.severity === 'danger' ? 'var(--toast-error)' : 'var(--amber)' }} />
                <span className="notification-chip" style={{ color: alert.severity === 'danger' ? 'var(--toast-error)' : 'var(--amber-text)', background: alert.severity === 'danger' ? 'var(--danger-bg)' : 'var(--amber-light)' }}>
                  <Ic d={alert.tipo === 'lote' ? P.alert : P.stock} size={15} />
                </span>
                <span className="notification-copy">
                  <strong>{alert.titulo}</strong>
                  <small>{alert.detalle}</small>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
