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

const cop = (v: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v)
const monthLabels = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const dayLabels = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

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
    api.health().then(setHealth).catch(() => setHealth({ status: 'error', database: 'unavailable' })).finally(() => setHealthLoading(false))
    Promise.all([
      api.list<Row>('ventas').catch(() => []), api.list<Row>('compras').catch(() => []),
      api.list<Row>('productos').catch(() => []), api.getVStockProducto().catch(() => [] as Row[]),
      api.getVLotes().catch(() => [] as Row[]), api.list<Row>('pagos_venta').catch(() => []),
      api.list<Row>('produccion').catch(() => []),
    ]).then(([v, c, p, s, l, pa, pr]) => {
      setVentas(v); setCompras(c); setProductos(p); setStockData(s); setLotes(l); setPagos(pa); setProduccion(pr)
    }).catch(() => setError('No se pudieron cargar las estadísticas.')).finally(() => setLoading(false))
  }, [])

  if (!hasModuleAccess('Dashboard')) return null
  const roleName = rol || (user?.id_rol === 1 ? 'Administrador' : user?.id_rol === 2 ? 'Vendedor' : 'Operario')

  const todayStr = new Date().toISOString().split('T')[0]
  const yestStr = addDays(new Date(), -1)
  const monthStr = todayStr.substring(0, 7)
  const yearStr = todayStr.substring(0, 4)
  const twoDaysAhead = addDays(new Date(), 2)

  // ── Ventas KPI based on selected period ──────────────────────────────────────
  const ventasKpi = useMemo(() => {
    const activeVentas = ventas.filter(v => v.estado !== false)
    let monto = 0, prevMonto = 0, label = '', subLabel = ''

    if (periodo === 'dia') {
      monto = activeVentas.filter(v => String(v.fecha_venta).startsWith(todayStr)).reduce((s, v) => s + Number(v.total_pagar || 0), 0)
      prevMonto = activeVentas.filter(v => String(v.fecha_venta).startsWith(yestStr)).reduce((s, v) => s + Number(v.total_pagar || 0), 0)
      label = 'Ventas del Día'; subLabel = prevMonto > 0 ? `${Math.round(((monto - prevMonto) / prevMonto) * 100)}% vs. ayer` : 'Sin ventas ayer'
    } else if (periodo === 'semana') {
      const weekAgo = addDays(new Date(), -7), twoWeeksAgo = addDays(new Date(), -14)
      monto = activeVentas.filter(v => { const f = String(v.fecha_venta).split('T')[0]; return f > weekAgo && f <= todayStr }).reduce((s, v) => s + Number(v.total_pagar || 0), 0)
      prevMonto = activeVentas.filter(v => { const f = String(v.fecha_venta).split('T')[0]; return f > twoWeeksAgo && f <= weekAgo }).reduce((s, v) => s + Number(v.total_pagar || 0), 0)
      label = 'Ventas de la Semana'; subLabel = prevMonto > 0 ? `${Math.round(((monto - prevMonto) / prevMonto) * 100)}% vs. semana anterior` : 'Sin ventas semana anterior'
    } else if (periodo === 'mes') {
      monto = activeVentas.filter(v => String(v.fecha_venta).startsWith(monthStr)).reduce((s, v) => s + Number(v.total_pagar || 0), 0)
      const prevMonthDate = new Date(); prevMonthDate.setMonth(prevMonthDate.getMonth() - 1)
      const prevMonthStr2 = prevMonthDate.toISOString().split('T')[0].substring(0, 7)
      prevMonto = activeVentas.filter(v => String(v.fecha_venta).startsWith(prevMonthStr2)).reduce((s, v) => s + Number(v.total_pagar || 0), 0)
      label = 'Ventas del Mes'; subLabel = prevMonto > 0 ? `${Math.round(((monto - prevMonto) / prevMonto) * 100)}% vs. mes anterior` : 'Sin ventas mes anterior'
    } else {
      monto = activeVentas.filter(v => String(v.fecha_venta).startsWith(yearStr)).reduce((s, v) => s + Number(v.total_pagar || 0), 0)
      const prevYearStr = String(Number(yearStr) - 1)
      prevMonto = activeVentas.filter(v => String(v.fecha_venta).startsWith(prevYearStr)).reduce((s, v) => s + Number(v.total_pagar || 0), 0)
      label = 'Ventas del Año'; subLabel = prevMonto > 0 ? `${Math.round(((monto - prevMonto) / prevMonto) * 100)}% vs. año anterior` : 'Sin ventas año anterior'
    }

    return { monto, label, subLabel }
  }, [ventas, periodo, todayStr, yestStr, monthStr, yearStr])

  // ── Other KPIs (fixed) ────────────────────────────────────────────────────────
  const comprasMesArr = compras.filter(c => String(c.fecha_compra).startsWith(monthStr) && c.estado !== false)
  const comprasMesMonto = comprasMesArr.reduce((s, c) => s + Number(c.total_compra || 0), 0)
  const lotesCriticos = lotes.filter(l => { if (!l.estado || l.estado === false) return false; const prod = productos.find(p => p.id_producto === l.id_producto && String(p.tipo_producto) === 'Fresca'); return prod && String(l.fecha_vencimiento) <= twoDaysAhead })
  const lastProd = [...produccion].sort((a, b) => Number(b.id_produccion) - Number(a.id_produccion)).slice(0, 10)
  const rendTransformacion = lastProd.length > 0 ? Math.round((lastProd.filter(p => String(p.estado) === 'Finalizada').length / lastProd.length) * 1000) / 10 : 0

  const kpis = [
    { label: ventasKpi.label, value: cop(ventasKpi.monto), sub: ventasKpi.subLabel, icon: P.sales, bg: 'var(--kpi-sales-bg)', accent: 'var(--kpi-sales-accent)' },
    { label: 'Compras del Mes', value: cop(comprasMesMonto), sub: `${comprasMesArr.length} órdenes`, icon: P.boxes, bg: 'var(--kpi-purchases-bg)', accent: 'var(--kpi-purchases-accent)' },
    { label: 'Stock Fresco Crítico', value: `${lotesCriticos.length} lotes`, sub: 'Vencidos o vencen en menos de 48 horas', icon: P.alert, bg: 'var(--kpi-critical-bg)', accent: 'var(--kpi-critical-accent)' },
    { label: 'Rend. Transformación', value: `${rendTransformacion}%`, sub: 'Promedio de las últimas 10 órdenes', icon: P.sparkle, bg: 'var(--kpi-yield-bg)', accent: 'var(--kpi-yield-accent)' },
  ]

  // ── Chart data based on period ─────────────────────────────────────────────────
  const chartData = useMemo(() => {
    const activeV = ventas.filter(v => v.estado !== false)
    const activeC = compras.filter(c => c.estado !== false)

    if (periodo === 'año') {
      const data: { label: string; Ventas: number; Compras: number }[] = []
      for (let i = 11; i >= 0; i--) {
        const d = new Date(new Date().getFullYear(), new Date().getMonth() - i, 1)
        const prefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        data.push({ label: monthLabels[d.getMonth()] ?? '', Ventas: activeV.filter(v => String(v.fecha_venta).startsWith(prefix)).reduce((s, v) => s + Number(v.total_pagar || 0), 0), Compras: activeC.filter(c => String(c.fecha_compra).startsWith(prefix)).reduce((s, c) => s + Number(c.total_compra || 0), 0) })
      }
      return data
    }
    const days = periodo === 'mes' ? 30 : 7
    const data: { label: string; Ventas: number; Compras: number }[] = []
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000)
      const ds = d.toISOString().split('T')[0]
      data.push({ label: `${d.getDate()}/${d.getMonth() + 1}`, Ventas: activeV.filter(v => String(v.fecha_venta).startsWith(ds)).reduce((s, v) => s + Number(v.total_pagar || 0), 0), Compras: activeC.filter(c => String(c.fecha_compra).startsWith(ds)).reduce((s, c) => s + Number(c.total_compra || 0), 0) })
    }
    return data
  }, [ventas, compras, periodo])

  const chartSubtitle = periodo === 'dia' ? 'Hoy' : periodo === 'semana' ? 'Últimos 7 días' : periodo === 'mes' ? 'Últimos 30 días' : 'Últimos 12 meses'

  // ── Stock chart ──────────────────────────────────────────────────────────────
  const stockFresca = stockData.filter(s => productos.find(p => p.id_producto === s.id_producto && String(p.tipo_producto) === 'Fresca')).reduce((s, x) => s + Number(x.stock_vendible || 0), 0)
  const stockCongelada = stockData.filter(s => productos.find(p => p.id_producto === s.id_producto && String(p.tipo_producto) === 'Congelada')).reduce((s, x) => s + Number(x.stock_vendible || 0), 0)
  const stockChart = [{ name: 'Fresca', value: stockFresca }, { name: 'Congelada', value: stockCongelada }]
  const chartColors = ['#D9777F', '#81B69D']

  // ── Cierre de caja ──────────────────────────────────────────────────────────
  const ventasHoy = ventas.filter(v => String(v.fecha_venta).startsWith(todayStr) && v.estado !== false)
  const hoyVentaIds = new Set(ventasHoy.map(v => v.id_venta))
  const pagosHoy = pagos.filter(p => hoyVentaIds.has(p.id_venta))
  const cierreEfectivo = pagosHoy.filter(p => String(p.metodo_pago) === 'Efectivo').reduce((s, p) => s + Number(p.monto_recibido || 0), 0)
  const cierreTransf = pagosHoy.filter(p => String(p.metodo_pago) === 'Transferencia').reduce((s, p) => s + Number(p.monto_recibido || 0), 0)
  const cierreCompras = compras.filter(c => String(c.fecha_compra).startsWith(todayStr) && c.estado !== false).reduce((s, c) => s + Number(c.total_compra || 0), 0)
  const cierreSaldo = cierreEfectivo + cierreTransf - cierreCompras

  // ── Lotes por vencer ──────────────────────────────────────────────────────────
  const lotesVencer = lotes.filter(l => l.estado !== false && String(l.fecha_vencimiento) <= twoDaysAhead).sort((a, b) => String(a.fecha_vencimiento).localeCompare(String(b.fecha_vencimiento)))
  function venceTexto(fecha: string): { txt: string; color: string } {
    const diff = Math.floor((new Date(fecha + 'T00:00:00').getTime() - new Date(todayStr + 'T00:00:00').getTime()) / 86400000)
    if (diff < 0) return { txt: `venció hace ${Math.abs(diff)} día${Math.abs(diff) !== 1 ? 's' : ''}`, color: 'var(--danger-text)' }
    if (diff === 0) return { txt: 'vence hoy', color: 'var(--danger-text)' }
    return { txt: 'vence mañana', color: 'var(--amber-text)' }
  }
  const fresasCongelar = lotes.filter(l => l.estado !== false && l.es_transformable === true && Number(l.cantidad_disponible) > 0 && productos.find(p => p.id_producto === l.id_producto && String(p.tipo_producto) === 'Fresca')).sort((a, b) => String(a.fecha_vencimiento).localeCompare(String(b.fecha_vencimiento)))
  function prodName(idProd: unknown): string { const p = productos.find(x => x.id_producto === idProd); return p ? String(p.presentacion) : 'Producto' }

  const periodoTabs: { key: Periodo; label: string }[] = [
    { key: 'dia', label: 'Día' }, { key: 'semana', label: 'Semana' }, { key: 'mes', label: 'Mes' }, { key: 'año', label: 'Año' },
  ]

  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, fontFamily: 'Outfit', color: 'var(--text-head)' }}>Panel de control</h1>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {/* Period selector */}
          <div style={{ display: 'flex', gap: 2, padding: 3, borderRadius: 8, background: 'var(--surface-subtle)', border: '1px solid var(--border)' }}>
            {periodoTabs.map(t => (
              <button key={t.key} style={{ padding: '6px 14px', borderRadius: 6, border: 0, cursor: 'pointer', background: periodo === t.key ? 'var(--card)' : 'transparent', color: periodo === t.key ? 'var(--primary)' : 'var(--text-muted)', fontWeight: periodo === t.key ? 600 : 500, fontSize: 12, boxShadow: periodo === t.key ? 'var(--shadow-sm)' : 'none', transition: 'all 0.15s' }} onClick={() => setPeriodo(t.key)}>{t.label}</button>
            ))}
          </div>
          {isApiMode && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: healthLoading ? 'var(--text-muted)' : health?.database === 'connected' ? 'var(--active-text)' : 'var(--danger-text)' }}>
              <Ic d={health?.database === 'connected' ? P.check : P.alert} size={14} />
              {healthLoading ? 'Verificando…' : health?.database === 'connected' ? 'Conectado' : 'Sin conexión'}
            </span>
          )}
          <strong className="muted" style={{ fontSize: 12 }}>{roleName}</strong>
        </div>
      </div>

      {loading ? (
        <div className="loading-state"><Ic d={P.sync} size={32} style={{ animation: 'spin 1s linear infinite' }} /><p>Cargando estadísticas…</p></div>
      ) : error ? (
        <div className="card" style={{ padding: 24, textAlign: 'center' }}><Ic d={P.alert} size={32} style={{ color: 'var(--danger)', marginBottom: 12 }} /><p className="muted">{error}</p></div>
      ) : (
        <>
          <div className="dashboard-grid">
            {kpis.map(kpi => (
              <div className="kpi-card" key={kpi.label} style={{ background: kpi.bg, borderColor: kpi.accent }}>
                <div className="stat-card">
                  <Ic d={kpi.icon} size={24} style={{ color: kpi.accent }} />
                  <div>
                    <strong style={{ fontSize: 22, color: kpi.accent }}>{kpi.value}</strong>
                    <p style={{ margin: '2px 0 0', fontSize: 12, fontWeight: 600, color: 'var(--text-head)' }}>{kpi.label}</p>
                    <small className="muted" style={{ fontSize: 11 }}>{kpi.sub}</small>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 20 }}>
            <div className="card" style={{ padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div><h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Ventas vs. Compras</h3><p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>{chartSubtitle}</p></div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn-secondary" style={{ fontSize: 11, padding: '5px 10px' }} onClick={() => dlExcel(chartData, 'ventas-vs-compras.xlsx', 'Ventas vs Compras')}><Ic d={P.download} size={12} /> Excel</button>
                  <button className="btn-secondary" style={{ fontSize: 11, padding: '5px 10px' }} onClick={() => dlPDF(`Ventas vs Compras - ${chartSubtitle}`, [['Período', 'Ventas', 'Compras']], chartData.map(d => [d.label, cop(d.Ventas), cop(d.Compras)]), 'ventas-vs-compras.pdf')}><Ic d={P.download} size={12} /> PDF</button>
                </div>
              </div>
              {chartData.some(d => d.Ventas > 0 || d.Compras > 0) ? (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={chartData}>
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} /><YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${(Number(v) / 1000).toFixed(0)}k`} /><Tooltip formatter={(v) => cop(Number(v ?? 0))} /><Legend />
                    <Line type="monotone" dataKey="Ventas" stroke={chartColors[0]} strokeWidth={2} dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="Compras" stroke={chartColors[1]} strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : <div style={{ padding: '40px 0', textAlign: 'center' }}><p className="muted">No hay datos para mostrar.</p></div>}
            </div>

            <div className="card" style={{ padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div><h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Distribución de stock</h3><p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>{(stockFresca + stockCongelada).toLocaleString('es-CO')} kg · Por tipo</p></div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn-secondary" style={{ fontSize: 11, padding: '5px 10px' }} onClick={() => dlExcel(stockChart, 'distribucion-stock.xlsx', 'Stock')}><Ic d={P.download} size={12} /> Excel</button>
                  <button className="btn-secondary" style={{ fontSize: 11, padding: '5px 10px' }} onClick={() => dlPDF('Distribución de Stock', [['Tipo', 'Stock (kg)']], stockChart.map(s => [s.name, String(s.value)]), 'distribucion-stock.pdf')}><Ic d={P.download} size={12} /> PDF</button>
                </div>
              </div>
              {stockFresca > 0 || stockCongelada > 0 ? (
                <div className="donut-chart" style={{ position: 'relative' }}>
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart><Pie data={stockChart} dataKey="value" nameKey="name" innerRadius={70} outerRadius={110}>{stockChart.map((_, i) => <Cell key={i} fill={chartColors[i % chartColors.length]} />)}</Pie><Tooltip /><Legend /></PieChart>
                  </ResponsiveContainer>
                  <span className="donut-unit">{(stockFresca + stockCongelada).toLocaleString('es-CO')} kg</span>
                </div>
              ) : <div style={{ padding: '40px 0', textAlign: 'center' }}><p className="muted">No hay stock registrado.</p></div>}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 20 }}>
            <div className="card" style={{ padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Cierre de caja — Hoy</h3>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn-secondary" style={{ fontSize: 11, padding: '5px 10px' }} onClick={() => dlExcel([{ Efectivo: cierreEfectivo, Transferencia: cierreTransf, 'Compras día': cierreCompras, Saldo: cierreSaldo }], 'cierre-caja.xlsx', 'Cierre')}><Ic d={P.download} size={12} /> Excel</button>
                  <button className="btn-secondary" style={{ fontSize: 11, padding: '5px 10px' }} onClick={() => dlPDF('Cierre de Caja - Hoy', [['Concepto', 'Monto']], [['Efectivo', cop(cierreEfectivo)], ['Transferencia', cop(cierreTransf)], ['Compras del día (egreso)', cop(cierreCompras)], ['Saldo', cop(cierreSaldo)]], 'cierre-caja.pdf')}><Ic d={P.download} size={12} /> PDF</button>
                </div>
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border-soft)' }}><span className="muted">Efectivo</span><strong>{cop(cierreEfectivo)}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border-soft)' }}><span className="muted">Transferencia</span><strong>{cop(cierreTransf)}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border-soft)' }}><span className="muted">Compras del día (egreso)</span><strong style={{ color: 'var(--danger-text)' }}>-{cop(cierreCompras)}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0' }}><strong>Saldo</strong><strong style={{ fontSize: 18, color: cierreSaldo >= 0 ? 'var(--active-text)' : 'var(--danger-text)' }}>{cop(cierreSaldo)}</strong></div>
              </div>
            </div>

            <div className="card" style={{ padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Lotes por vencer</h3>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn-secondary" style={{ fontSize: 11, padding: '5px 10px' }} onClick={() => dlExcel(lotesVencer.map(l => ({ Lote: l.numero_lote, Producto: prodName(l.id_producto), Cantidad: l.cantidad_disponible, Vencimiento: l.fecha_vencimiento })), 'lotes-por-vencer.xlsx', 'Lotes')}><Ic d={P.download} size={12} /> Excel</button>
                  <button className="btn-secondary" style={{ fontSize: 11, padding: '5px 10px' }} onClick={() => dlPDF('Lotes por Vencer', [['Lote', 'Producto', 'Cantidad', 'Vence']], lotesVencer.map(l => [String(l.numero_lote), prodName(l.id_producto), String(l.cantidad_disponible), String(l.fecha_vencimiento)]), 'lotes-por-vencer.pdf')}><Ic d={P.download} size={12} /> PDF</button>
                </div>
              </div>
              {lotesVencer.length > 0 ? (
                <div style={{ display: 'grid', gap: 8, maxHeight: 260, overflowY: 'auto' }}>
                  {lotesVencer.slice(0, 10).map(l => {
                    const v = venceTexto(String(l.fecha_vencimiento))
                    return (<div key={String(l.id_lote)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, background: v.color === 'var(--danger-text)' ? 'var(--danger-bg)' : 'var(--amber-light)', border: `1px solid ${v.color}` }}><Ic d={P.alert} size={16} style={{ color: v.color, flexShrink: 0 }} /><div style={{ minWidth: 0, flex: 1 }}><strong style={{ fontSize: 12 }}>{prodName(l.id_producto)} del lote {String(l.numero_lote)}</strong><small style={{ display: 'block', color: 'var(--text-muted)' }}>{Number(l.cantidad_disponible)} kg · {v.txt}</small></div></div>)
                  })}
                  {lotesVencer.length > 10 && <p className="muted" style={{ textAlign: 'center', fontSize: 11 }}>+{lotesVencer.length - 10} lotes más…</p>}
                </div>
              ) : <div style={{ padding: '30px 0', textAlign: 'center' }}><p className="muted">No hay lotes por vencer.</p></div>}
            </div>
          </div>

          <div className="card" style={{ padding: 24, marginTop: 20 }}>
            <div style={{ marginBottom: 16 }}><h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Fresas por pasar a congelado</h3><p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>Prioriza las fresas próximas a vencer.</p></div>
            {fresasCongelar.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
                {fresasCongelar.map(l => (
                  <div key={String(l.id_lote)} style={{ padding: 14, border: '1px solid var(--primary-border)', borderRadius: 10, background: 'var(--primary-light)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}><span className="badge badge-pink" style={{ fontSize: 10 }}>Crítico</span><strong style={{ fontSize: 13 }}>{String(l.numero_lote)}</strong></div>
                    <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600 }}>{prodName(l.id_producto)}</p>
                    <small className="muted" style={{ fontSize: 12 }}>{Number(l.cantidad_disponible)} kg · Vence: {String(l.fecha_vencimiento)}</small>
                    <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                      <button className="btn-secondary" style={{ fontSize: 11, padding: '5px 10px', flex: 1, justifyContent: 'center' }} onClick={() => navigate('/productos')}>Ver productos</button>
                      <button className="btn-primary" style={{ fontSize: 11, padding: '5px 10px', flex: 1, justifyContent: 'center' }} onClick={() => navigate('/produccion')}>Pasar a congelado</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : <div style={{ padding: '30px 0', textAlign: 'center' }}><p className="muted">No hay fresas frescas transformables disponibles.</p></div>}
          </div>
        </>
      )}
    </section>
  )
}
