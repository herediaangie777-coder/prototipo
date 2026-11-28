import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/data/services/authContext'
import { api, isApiMode } from '@/data/services/api'
import { Ic, P } from '@/components/shared'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

type Row = Record<string, unknown>
type Periodo = 'dia' | 'semana' | 'mes' | 'año'

const cop = (v: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v)
const monthLabels = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function addDays(date: Date, days: number): string {
  const d = new Date(date); d.setDate(d.getDate() + days); return d.toISOString().split('T')[0]
}
function dlExcel(data: Record<string, unknown>[], fn: string, sn: string) {
  if (!data.length) return
  const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sn); XLSX.writeFile(wb, fn)
}
function dlPDF(title: string, head: string[][], body: string[][], fn: string) {
  const doc = new jsPDF(); doc.setFontSize(14); doc.text(title, 14, 16)
  autoTable(doc, { startY: 22, head, body }); doc.save(fn)
}

export function DashboardPage() {
  const { user, rol, hasModuleAccess } = useAuth()
  const navigate = useNavigate()
  const [health, setHealth] = useState<{ status: string; database: string } | null>(null)
  const [healthLoading, setHealthLoading] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [periodo, setPeriodo] = useState<Periodo>('semana')

  const [ventas, setVentas] = useState<Row[]>([])
  const [compras, setCompras] = useState<Row[]>([])
  const [productos, setProductos] = useState<Row[]>([])
  const [stockData, setStockData] = useState<Row[]>([])
  const [lotes, setLotes] = useState<Row[]>([])
  const [pagos, setPagos] = useState<Row[]>([])
  const [produccion, setProduccion] = useState<Row[]>([])

  useEffect(() => {
    if (!isApiMode) { setHealthLoading(false); setLoading(false); return }
    api.health()
      .then(setHealth)
      .catch(() => setHealth({ status: 'error', database: 'unavailable' }))
      .finally(() => setHealthLoading(false))
    Promise.all([
      api.list<Row>('ventas').catch(() => []),
      api.list<Row>('compras').catch(() => []),
      api.list<Row>('productos').catch(() => []),
      api.getVStockProducto().catch(() => [] as Row[]),
      api.getVLotes().catch(() => [] as Row[]),
      api.list<Row>('pagos_venta').catch(() => []),
      api.list<Row>('produccion').catch(() => []),
    ]).then(([v, c, p, s, l, pa, pr]) => {
      setVentas(v); setCompras(c); setProductos(p)
      setStockData(s); setLotes(l); setPagos(pa); setProduccion(pr)
    }).catch(() => setError('No se pudieron cargar las estadísticas.'))
      .finally(() => setLoading(false))
  }, [])

  if (!hasModuleAccess('Dashboard')) return null
  const roleName = rol || (user?.id_rol === 1 ? 'Super Administrador' : user?.id_rol === 2 ? 'Vendedor' : 'Operario')

  // ── Dates ─────────────────────────────────────────────────────────────────
  const todayStr = new Date().toISOString().split('T')[0]
  const yestStr = addDays(new Date(), -1)
  const monthStr = todayStr.substring(0, 7)
  const yearStr = todayStr.substring(0, 4)
  const twoDaysAhead = addDays(new Date(), 2)

  // ── Ventas KPI by period ──────────────────────────────────────────────────
  const ventasKpi = useMemo(() => {
    const av = ventas.filter(v => v.estado !== false)
    let monto = 0, prev = 0, label = '', sub = ''
    if (periodo === 'dia') {
      monto = av.filter(v => String(v.fecha_venta).startsWith(todayStr)).reduce((s, v) => s + Number(v.total_pagar || 0), 0)
      prev = av.filter(v => String(v.fecha_venta).startsWith(yestStr)).reduce((s, v) => s + Number(v.total_pagar || 0), 0)
      label = 'Ventas del Día'
      sub = prev > 0 ? `${Math.round(((monto - prev) / prev) * 100)}% vs. ayer` : 'Sin ventas ayer'
    } else if (periodo === 'semana') {
      const wa = addDays(new Date(), -7), twa = addDays(new Date(), -14)
      monto = av.filter(v => { const f = String(v.fecha_venta).split('T')[0]; return f > wa && f <= todayStr }).reduce((s, v) => s + Number(v.total_pagar || 0), 0)
      prev = av.filter(v => { const f = String(v.fecha_venta).split('T')[0]; return f > twa && f <= wa }).reduce((s, v) => s + Number(v.total_pagar || 0), 0)
      label = 'Ventas · Semana'
      sub = prev > 0 ? `${Math.round(((monto - prev) / prev) * 100)}% vs. sem. anterior` : 'Sin ventas sem. anterior'
    } else if (periodo === 'mes') {
      monto = av.filter(v => String(v.fecha_venta).startsWith(monthStr)).reduce((s, v) => s + Number(v.total_pagar || 0), 0)
      const pd = new Date(); pd.setMonth(pd.getMonth() - 1)
      const pms = pd.toISOString().split('T')[0].substring(0, 7)
      prev = av.filter(v => String(v.fecha_venta).startsWith(pms)).reduce((s, v) => s + Number(v.total_pagar || 0), 0)
      label = 'Ventas · Mes'
      sub = prev > 0 ? `${Math.round(((monto - prev) / prev) * 100)}% vs. mes anterior` : 'Sin ventas mes anterior'
    } else {
      monto = av.filter(v => String(v.fecha_venta).startsWith(yearStr)).reduce((s, v) => s + Number(v.total_pagar || 0), 0)
      prev = av.filter(v => String(v.fecha_venta).startsWith(String(Number(yearStr) - 1))).reduce((s, v) => s + Number(v.total_pagar || 0), 0)
      label = 'Ventas · Año'
      sub = prev > 0 ? `${Math.round(((monto - prev) / prev) * 100)}% vs. año anterior` : 'Sin ventas año anterior'
    }
    return { monto, label, sub }
  }, [ventas, periodo, todayStr, yestStr, monthStr, yearStr])

  // ── Other KPIs ────────────────────────────────────────────────────────────
  const comprasMes = compras.filter(c => String(c.fecha_compra).startsWith(monthStr) && c.estado !== false)
  const comprasMesMonto = comprasMes.reduce((s, c) => s + Number(c.total_compra || 0), 0)
  const lotesCriticos = lotes.filter(l => {
    if (!l.estado || l.estado === false) return false
    const prod = productos.find(p => p.id_producto === l.id_producto && String(p.tipo_producto) === 'Fresca')
    return prod && String(l.fecha_vencimiento) <= twoDaysAhead
  })
  const lastProd = [...produccion].sort((a, b) => Number(b.id_produccion) - Number(a.id_produccion)).slice(0, 10)
  const rendTransformacion = lastProd.length > 0
    ? Math.round((lastProd.filter(p => String(p.estado) === 'Finalizada').length / lastProd.length) * 1000) / 10
    : 0

  // ── Chart data ────────────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    const av = ventas.filter(v => v.estado !== false)
    const ac = compras.filter(c => c.estado !== false)
    if (periodo === 'año') {
      return Array.from({ length: 12 }, (_, i) => {
        const d = new Date(new Date().getFullYear(), new Date().getMonth() - (11 - i), 1)
        const prefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        return {
          label: monthLabels[d.getMonth()] ?? '',
          Ventas: av.filter(v => String(v.fecha_venta).startsWith(prefix)).reduce((s, v) => s + Number(v.total_pagar || 0), 0),
          Compras: ac.filter(c => String(c.fecha_compra).startsWith(prefix)).reduce((s, c) => s + Number(c.total_compra || 0), 0),
        }
      })
    }
    const days = periodo === 'mes' ? 30 : 7
    return Array.from({ length: days }, (_, i) => {
      const d = new Date(Date.now() - (days - 1 - i) * 86400000)
      const ds = d.toISOString().split('T')[0]
      return {
        label: `${d.getDate()}/${d.getMonth() + 1}`,
        Ventas: av.filter(v => String(v.fecha_venta).startsWith(ds)).reduce((s, v) => s + Number(v.total_pagar || 0), 0),
        Compras: ac.filter(c => String(c.fecha_compra).startsWith(ds)).reduce((s, c) => s + Number(c.total_compra || 0), 0),
      }
    })
  }, [ventas, compras, periodo])

  const chartSubtitle = periodo === 'dia' ? 'Hoy' : periodo === 'semana' ? 'Últimos 7 días' : periodo === 'mes' ? 'Últimos 30 días' : 'Últimos 12 meses'

  // ── Stock ─────────────────────────────────────────────────────────────────
  const stockFresca = stockData
    .filter(s => productos.find(p => p.id_producto === s.id_producto && String(p.tipo_producto) === 'Fresca'))
    .reduce((s, x) => s + Number(x.stock_vendible || 0), 0)
  const stockCongelada = stockData
    .filter(s => productos.find(p => p.id_producto === s.id_producto && String(p.tipo_producto) === 'Congelada'))
    .reduce((s, x) => s + Number(x.stock_vendible || 0), 0)
  const stockChart = [{ name: 'Fresca', value: stockFresca }, { name: 'Congelada', value: stockCongelada }]
  const chartColors = ['#D9777F', '#81B69D']

  // ── Cierre de caja ────────────────────────────────────────────────────────
  const ventasHoy = ventas.filter(v => String(v.fecha_venta).startsWith(todayStr) && v.estado !== false)
  const hoyIds = new Set(ventasHoy.map(v => v.id_venta))
  const pagosHoy = pagos.filter(p => hoyIds.has(p.id_venta))
  const cierreEfectivo = pagosHoy.filter(p => String(p.metodo_pago) === 'Efectivo').reduce((s, p) => s + Number(p.monto_recibido || 0), 0)
  const cierreTransf = pagosHoy.filter(p => String(p.metodo_pago) === 'Transferencia').reduce((s, p) => s + Number(p.monto_recibido || 0), 0)
  const cierreCompras = compras.filter(c => String(c.fecha_compra).startsWith(todayStr) && c.estado !== false).reduce((s, c) => s + Number(c.total_compra || 0), 0)
  const cierreSaldo = cierreEfectivo + cierreTransf - cierreCompras

  // ── Lotes / fresas ────────────────────────────────────────────────────────
  const lotesVencer = lotes
    .filter(l => l.estado !== false && String(l.fecha_vencimiento) <= twoDaysAhead)
    .sort((a, b) => String(a.fecha_vencimiento).localeCompare(String(b.fecha_vencimiento)))
  const twoDayFresh = lotes.filter(l =>
    l.estado !== false && Number(l.cantidad_disponible) > 0 &&
    productos.find(p => p.id_producto === l.id_producto && String(p.tipo_producto) === 'Fresca') &&
    String(l.fecha_vencimiento) <= twoDaysAhead
  )
  const fresasCongelar = lotes
    .filter(l => l.estado !== false && l.es_transformable === true && Number(l.cantidad_disponible) > 0 &&
      productos.find(p => p.id_producto === l.id_producto && String(p.tipo_producto) === 'Fresca'))
    .sort((a, b) => String(a.fecha_vencimiento).localeCompare(String(b.fecha_vencimiento)))

  function venceTexto(fecha: string): { txt: string; color: string } {
    const diff = Math.floor((new Date(fecha + 'T00:00:00').getTime() - new Date(todayStr + 'T00:00:00').getTime()) / 86400000)
    if (diff < 0) return { txt: `venció hace ${Math.abs(diff)}d`, color: 'var(--danger-text)' }
    if (diff === 0) return { txt: 'vence hoy', color: 'var(--danger-text)' }
    return { txt: 'vence mañana', color: 'var(--amber-text)' }
  }
  function prodName(id: unknown) { const p = productos.find(x => x.id_producto === id); return p ? String(p.presentacion) : 'Producto' }

  const periodoTabs: { key: Periodo; label: string }[] = [
    { key: 'dia', label: 'Día' }, { key: 'semana', label: 'Semana' },
    { key: 'mes', label: 'Mes' }, { key: 'año', label: 'Año' },
  ]

  // ── Shared export button ──────────────────────────────────────────────────
  const ExportBtns = ({ onXlsx, onPdf }: { onXlsx: () => void; onPdf: () => void }) => (
    <div style={{ display: 'flex', gap: 5 }}>
      <button className="btn-secondary widget-export-button" onClick={onXlsx}><Ic d={P.download} size={12} /> xls</button>
      <button className="btn-secondary widget-export-button" onClick={onPdf}><Ic d={P.download} size={12} /> pdf</button>
    </div>
  )

  return (
    <section>
      {/* ── Top bar ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-head)' }}>{user?.nombre} · <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>{roleName}</span></span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className="period-tabs">
            {periodoTabs.map(t => (
              <button key={t.key} className={periodo === t.key ? 'selected' : ''} onClick={() => setPeriodo(t.key)}>{t.label}</button>
            ))}
          </div>
          {isApiMode && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: healthLoading ? 'var(--text-muted)' : health?.database === 'connected' ? 'var(--active-text)' : 'var(--danger-text)' }}>
              <Ic d={health?.database === 'connected' ? P.check : P.alert} size={12} />
              {healthLoading ? '…' : health?.database === 'connected' ? 'En línea' : 'Sin conexión'}
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="loading-state"><Ic d={P.sync} size={28} style={{ animation: 'spin .9s linear infinite' }} /><p>Cargando…</p></div>
      ) : error ? (
        <div className="card" style={{ padding: 20, textAlign: 'center' }}>
          <Ic d={P.alert} size={28} style={{ color: 'var(--danger)', marginBottom: 10 }} />
          <p className="muted" style={{ fontSize: 13 }}>{error}</p>
        </div>
      ) : (
        <>
          {/* ── 4 KPI cards (compact 4-col grid) ─────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 16 }}>
            {/* Ventas */}
            <div className="kpi-card dashboard-kpi sales">
              <div className="dashboard-kpi-head">
                <span>{ventasKpi.label}</span>
                <span className="dashboard-kpi-icon"><Ic d={P.sales} size={16} /></span>
              </div>
              <strong>{cop(ventasKpi.monto)}</strong>
              <small className="neutral">{ventasKpi.sub}</small>
            </div>
            {/* Compras */}
            <div className="kpi-card dashboard-kpi purchases">
              <div className="dashboard-kpi-head">
                <span>Compras · Mes</span>
                <span className="dashboard-kpi-icon"><Ic d={P.boxes} size={16} /></span>
              </div>
              <strong>{cop(comprasMesMonto)}</strong>
              <small className="neutral">{comprasMes.length} {comprasMes.length === 1 ? 'orden' : 'órdenes'}</small>
            </div>
            {/* Stock Fresco Crítico */}
            <div className="kpi-card dashboard-kpi critical" role="button" tabIndex={0} onClick={() => navigate('/produccion')}>
              <div className="dashboard-kpi-head">
                <span>Stock Fresco Crítico</span>
                <span className="dashboard-kpi-icon"><Ic d={P.alert} size={16} /></span>
              </div>
              <strong>{lotesCriticos.length} lotes</strong>
              <small>Vencidos o &lt; 48 h</small>
            </div>
            {/* Rend. Transformación */}
            <div className="kpi-card dashboard-kpi yield">
              <div className="dashboard-kpi-head">
                <span>Rend. Transformación</span>
                <span className="dashboard-kpi-icon"><Ic d={P.sparkle} size={16} /></span>
              </div>
              <strong>{rendTransformacion}%</strong>
              <small>Últimas 10 órdenes</small>
            </div>
          </div>

          {/* ── Stock Fresca / Congelada ──────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            {[
              { tipo: 'Fresca', kg: stockFresca, icon: '🍓', cls: 'fresh' },
              { tipo: 'Congelada', kg: stockCongelada, icon: '🧊', cls: 'frozen' },
            ].map(s => (
              <div key={s.tipo} className={`card stock-summary ${s.cls}`} style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
                <i>{s.icon}</i>
                <div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>Fresa {s.tipo} · Stock vendible</span>
                  <strong style={{ fontSize: 20, fontWeight: 800, fontFamily: 'Outfit', color: 'var(--text-head)', display: 'block', marginTop: 2 }}>
                    {s.kg.toLocaleString('es-CO')} kg
                  </strong>
                </div>
              </div>
            ))}
          </div>

          {/* ── 2-day alert ───────────────────────────────────────────────── */}
          {twoDayFresh.length > 0 && (
            <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 9, background: 'var(--amber-light)', border: '1px solid var(--amber)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <Ic d={P.alert} size={16} style={{ color: 'var(--amber-text)', flexShrink: 0, marginTop: 1 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ color: 'var(--amber-text)', fontSize: 12 }}>
                  {twoDayFresh.length} lote{twoDayFresh.length !== 1 ? 's' : ''} de fresa fresca {twoDayFresh.length === 1 ? 'cumple' : 'cumplen'} 2 días de vida útil
                </strong>
                <p style={{ margin: '3px 0 0', fontSize: 11, color: 'var(--amber-text)', overflowWrap: 'break-word' }}>
                  {twoDayFresh.map(l => `${String(l.numero_lote)} (${Number(l.cantidad_disponible)} kg, vence ${String(l.fecha_vencimiento)})`).join(' · ')}
                </p>
              </div>
              <button className="btn-secondary" style={{ fontSize: 11, padding: '5px 10px', flexShrink: 0 }} onClick={() => navigate('/produccion')}>
                Pasar a congelado
              </button>
            </div>
          )}

          {/* ── Charts row ────────────────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            {/* Ventas vs Compras */}
            <div className="card chart-card">
              <div className="chart-card-heading">
                <div>
                  <h2>Ventas vs. Compras</h2>
                  <p>{chartSubtitle}</p>
                </div>
                <ExportBtns
                  onXlsx={() => dlExcel(chartData, 'ventas-vs-compras.xlsx', 'Datos')}
                  onPdf={() => dlPDF(`Ventas vs Compras — ${chartSubtitle}`, [['Período', 'Ventas', 'Compras']], chartData.map(d => [d.label, cop(d.Ventas), cop(d.Compras)]), 'ventas-vs-compras.pdf')}
                />
              </div>
              {chartData.some(d => d.Ventas > 0 || d.Compras > 0) ? (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={chartData}>
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(Number(v) / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={v => cop(Number(v ?? 0))} />
                    <Legend />
                    <Line type="monotone" dataKey="Ventas" stroke={chartColors[0]} strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="Compras" stroke={chartColors[1]} strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p className="muted">Sin datos para mostrar.</p></div>}
            </div>

            {/* Stock donut */}
            <div className="card chart-card">
              <div className="chart-card-heading">
                <div>
                  <h2>Distribución de stock</h2>
                  <p>{(stockFresca + stockCongelada).toLocaleString('es-CO')} kg · Por tipo</p>
                </div>
                <ExportBtns
                  onXlsx={() => dlExcel(stockChart, 'stock.xlsx', 'Stock')}
                  onPdf={() => dlPDF('Distribución de Stock', [['Tipo', 'kg']], stockChart.map(s => [s.name, String(s.value)]), 'stock.pdf')}
                />
              </div>
              {stockFresca > 0 || stockCongelada > 0 ? (
                <div className="donut-chart" style={{ position: 'relative' }}>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={stockChart} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90}>
                        {stockChart.map((_, i) => <Cell key={i} fill={chartColors[i % 2]} />)}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                  <span className="donut-unit">{(stockFresca + stockCongelada).toLocaleString('es-CO')} kg</span>
                </div>
              ) : <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p className="muted">Sin stock registrado.</p></div>}
            </div>
          </div>

          {/* ── Cierre de caja + Lotes por vencer ─────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            {/* Cierre */}
            <div className="card chart-card">
              <div className="chart-card-heading">
                <div><h2>Cierre de caja</h2><p>Hoy</p></div>
                <ExportBtns
                  onXlsx={() => dlExcel([{ Efectivo: cierreEfectivo, Transferencia: cierreTransf, 'Compras día': cierreCompras, Saldo: cierreSaldo }], 'cierre.xlsx', 'Cierre')}
                  onPdf={() => dlPDF('Cierre de Caja', [['Concepto', 'Monto']], [['Efectivo', cop(cierreEfectivo)], ['Transferencia', cop(cierreTransf)], ['Compras (egreso)', cop(cierreCompras)], ['Saldo', cop(cierreSaldo)]], 'cierre.pdf')}
                />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                {[
                  { label: 'Efectivo', value: cop(cierreEfectivo), danger: false },
                  { label: 'Transferencia', value: cop(cierreTransf), danger: false },
                  { label: 'Compras del día (egreso)', value: `-${cop(cierreCompras)}`, danger: true },
                ].map(r => (
                  <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border-soft)', fontSize: 13 }}>
                    <span className="muted">{r.label}</span>
                    <strong style={r.danger ? { color: 'var(--danger-text)' } : {}}>{r.value}</strong>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8 }}>
                  <strong>Saldo</strong>
                  <strong style={{ fontSize: 17, color: cierreSaldo >= 0 ? 'var(--active-text)' : 'var(--danger-text)' }}>{cop(cierreSaldo)}</strong>
                </div>
              </div>
            </div>

            {/* Lotes por vencer */}
            <div className="card chart-card">
              <div className="chart-card-heading">
                <div><h2>Lotes por vencer</h2><p>Vencidos o &lt; 48 h</p></div>
                <ExportBtns
                  onXlsx={() => dlExcel(lotesVencer.map(l => ({ Lote: l.numero_lote, Producto: prodName(l.id_producto), Cantidad: l.cantidad_disponible, Vencimiento: l.fecha_vencimiento })), 'lotes-vencer.xlsx', 'Lotes')}
                  onPdf={() => dlPDF('Lotes por Vencer', [['Lote', 'Producto', 'Cantidad', 'Vence']], lotesVencer.map(l => [String(l.numero_lote), prodName(l.id_producto), String(l.cantidad_disponible), String(l.fecha_vencimiento)]), 'lotes-vencer.pdf')}
                />
              </div>
              {lotesVencer.length > 0 ? (
                <div style={{ display: 'grid', gap: 7, maxHeight: 220, overflowY: 'auto' }}>
                  {lotesVencer.slice(0, 8).map(l => {
                    const v = venceTexto(String(l.fecha_vencimiento))
                    return (
                      <div key={String(l.id_lote)} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 7, background: v.color === 'var(--danger-text)' ? 'var(--danger-bg)' : 'var(--amber-light)', border: `1px solid ${v.color}` }}>
                        <Ic d={P.alert} size={14} style={{ color: v.color, flexShrink: 0 }} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <strong style={{ fontSize: 11, display: 'block' }}>{prodName(l.id_producto)} · {String(l.numero_lote)}</strong>
                          <small style={{ color: 'var(--text-muted)', fontSize: 10 }}>{Number(l.cantidad_disponible)} kg · {v.txt}</small>
                        </div>
                      </div>
                    )
                  })}
                  {lotesVencer.length > 8 && <p className="muted" style={{ fontSize: 11, textAlign: 'center' }}>+{lotesVencer.length - 8} más…</p>}
                </div>
              ) : <div style={{ padding: '30px 0', textAlign: 'center' }}><p className="muted">Sin lotes por vencer.</p></div>}
            </div>
          </div>

          {/* ── Fresas por congelar ─────────────────────────────────────────── */}
          {fresasCongelar.length > 0 && (
            <div className="card chart-card" style={{ marginBottom: 14 }}>
              <div className="chart-card-heading" style={{ marginBottom: 12 }}>
                <div><h2>Fresas por pasar a congelado</h2><p>Prioriza las próximas a vencer.</p></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                {fresasCongelar.map(l => (
                  <div key={String(l.id_lote)} style={{ padding: 12, border: '1px solid var(--primary-border)', borderRadius: 9, background: 'var(--primary-light)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span className="badge badge-pink" style={{ fontSize: 10 }}>Crítico</span>
                      <strong style={{ fontSize: 12 }}>{String(l.numero_lote)}</strong>
                    </div>
                    <p style={{ margin: '0 0 3px', fontSize: 12, fontWeight: 600 }}>{prodName(l.id_producto)}</p>
                    <small className="muted" style={{ fontSize: 11 }}>{Number(l.cantidad_disponible)} kg · Vence: {String(l.fecha_vencimiento)}</small>
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <button className="btn-secondary" style={{ fontSize: 10, padding: '4px 8px', flex: 1, justifyContent: 'center' }} onClick={() => navigate('/productos')}>Productos</button>
                      <button className="btn-primary" style={{ fontSize: 10, padding: '4px 8px', flex: 1, justifyContent: 'center' }} onClick={() => navigate('/produccion')}>Congelar</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}
