import { useState, useEffect, useCallback } from 'react'
import { Ic, P, Field, Modal, ConfirmModal, Pagination, SearchBar, ViewBtn, TrashBtn } from '@/components/shared'
import { useToast } from '@/components/toast'
import { api, isApiMode } from '@/data/services/api'
import { useAuth } from '@/data/services/authContext'
import type { Row } from '@/modules/resources'

interface OrderItem {
  id_producto: number
  producto_nombre: string
  cantidad: number
  unidad_medida: string
  precio_unitario: number
  id_lote: number
  lote_numero: string
  subtotal: number
}

const cop = (v: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v)

function getPrice(product: Row, tipoVenta: string): number {
  const detal = Number(product.precio_venta_detal) || 0
  const mayorista = Number(product.precio_venta_mayorista) || 0
  if (tipoVenta === 'Mayorista') {
    if (mayorista > 0 && mayorista < detal) return mayorista
    return Math.round(detal * 0.88)
  }
  return detal
}

function getCatName(id: number, categorias: Row[]): string {
  const cat = categorias.find(c => Number(c.id_categoria) === id)
  return cat ? String(cat.nombre_categoria) : `Cat. ${id}`
}

export function VentasPage() {
  const { user, hasModuleAccess, hasPermission } = useAuth()
  const toast = useToast()
  const [view, setView] = useState<'pos' | 'historial'>('pos')

  // ── POS data ───────────────────────────────────────────────────────────────
  const [productos, setProductos] = useState<Row[]>([])
  const [categorias, setCategorias] = useState<Row[]>([])
  const [clientes, setClientes] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // POS selection
  const [selectedTipo, setSelectedTipo] = useState('')
  const [selectedProducto, setSelectedProducto] = useState<Row | null>(null)
  const [cantidad, setCantidad] = useState('')
  const [lotesForProduct, setLotesForProduct] = useState<Row[]>([])
  const [selectedLote, setSelectedLote] = useState('')

  // Order state
  const [orderItems, setOrderItems] = useState<OrderItem[]>([])
  const [selectedCliente, setSelectedCliente] = useState('')
  const [tipoVenta, setTipoVenta] = useState('Detal')
  const [descuento, setDescuento] = useState('')
  const [iva, setIva] = useState('')
  const [pagoMetodo, setPagoMetodo] = useState('Efectivo')
  const [pagoMonto, setPagoMonto] = useState('')
  const [pagoReferencia, setPagoReferencia] = useState('')
  const [saving, setSaving] = useState(false)

  // ── Historial state ────────────────────────────────────────────────────────
  const [ventas, setVentas] = useState<Row[]>([])
  const [histLoading, setHistLoading] = useState(false)
  const [histError, setHistError] = useState<string | null>(null)
  const [histQuery, setHistQuery] = useState('')
  const [histPage, setHistPage] = useState(1)
  const histPageSize = 10

  const [detailRow, setDetailRow] = useState<Row | null>(null)
  const [detailLines, setDetailLines] = useState<Row[]>([])
  const [detailPagos, setDetailPagos] = useState<Row[]>([])
  const [detailLoading, setDetailLoading] = useState(false)

  // Anular venta
  const [anularRow, setAnularRow] = useState<Row | null>(null)
  const [motivo, setMotivo] = useState('')
  const [anulando, setAnulando] = useState(false)

  const canRegister = hasPermission('Ventas', 'Registrar')
  const canAnular = hasPermission('Ventas', 'Anular')

  // ── Load POS data ──────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!isApiMode) { setLoading(false); return }
    setLoading(true); setError(null)
    try {
      const [pRes, cRes, clRes, stockRes] = await Promise.all([
        api.list<Row>('productos'), api.list<Row>('categorias'),
        api.list<Row>('clientes'), api.getVStockProducto().catch(() => [] as Row[]),
      ])
      const merged = pRes.map(p => {
        const s = stockRes.find(x => x.id_producto === p.id_producto)
        return { ...p, stock_vendible: s?.stock_vendible ?? 0 }
      })
      setProductos(merged); setCategorias(cRes)
      setClientes(clRes.filter(c => c.estado !== false))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo conectar con el servidor')
    } finally { setLoading(false) }
  }, [])

  // ── Load historial ─────────────────────────────────────────────────────────
  const loadVentas = useCallback(async () => {
    if (!isApiMode) return
    setHistLoading(true); setHistError(null)
    try {
      const rows = await api.list<Row>('ventas')
      setVentas(rows)
    } catch (err) {
      setHistError(err instanceof Error ? err.message : 'Error al cargar')
    } finally { setHistLoading(false) }
  }, [])

  useEffect(() => { loadData() }, [loadData])
  useEffect(() => { if (view === 'historial') loadVentas() }, [view, loadVentas])

  const loadLotes = useCallback(async (productId: number) => {
    try {
      const lotes = await api.getVLotes({ id_producto: String(productId) })
      setLotesForProduct(lotes.filter(l => l.estado === true && Number(l.cantidad_disponible) > 0))
    } catch { setLotesForProduct([]) }
    setSelectedLote('')
  }, [])

  // ── Open detail ────────────────────────────────────────────────────────────
  const openDetail = async (row: Row) => {
    setDetailRow(row); setDetailLoading(true)
    try {
      const [lines, pagos] = await Promise.all([
        api.list<Row>('detalle_venta', { id_venta: String(row.id_venta) }),
        api.list<Row>('pagos_venta', { id_venta: String(row.id_venta) }),
      ])
      setDetailLines(lines); setDetailPagos(pagos)
    } catch { setDetailLines([]); setDetailPagos([]) }
    finally { setDetailLoading(false) }
  }

  // ── Anular venta ───────────────────────────────────────────────────────────
  const doAnular = async () => {
    if (!anularRow || !motivo.trim()) return
    setAnulando(true)
    try {
      // Restore lote stock before marking as anulada
      try {
        const lineas = await api.list<Row>('detalle_venta', { id_venta: String(anularRow.id_venta) })
        for (const linea of lineas) {
          const loteData = await api.getById<Row>('lotes', linea.id_lote as number)
          const restored = Number(loteData.cantidad_disponible) + Number(linea.cantidad)
          await api.update('lotes', linea.id_lote as number, { cantidad_disponible: restored })
        }
      } catch { /* non-fatal: annulment still proceeds */ }

      await api.update('ventas', anularRow.id_venta as number, {
        estado: false,
        motivo_anulacion: motivo.trim(),
      })
      toast('success', 'Venta anulada', 'La venta fue anulada correctamente.')
      setAnularRow(null); setMotivo('')
      loadVentas()
    } catch (err) {
      toast('error', 'No se pudo anular', err instanceof Error ? err.message : 'Error')
    } finally { setAnulando(false) }
  }

  // ── POS computed values ────────────────────────────────────────────────────
  const availableProducts = productos.filter(p =>
    selectedTipo && String(p.tipo_producto) === selectedTipo && p.estado !== false
  )
  const subtotal = orderItems.reduce((sum, item) => sum + item.subtotal, 0)
  const total = Math.max(0, subtotal - (Number(descuento) || 0) + (Number(iva) || 0))
  const priceForSelected = selectedProducto ? getPrice(selectedProducto, tipoVenta) : 0
  const itemSubtotal = (Number(cantidad) || 0) * priceForSelected

  const addToOrder = () => {
    if (!selectedProducto || !cantidad || Number(cantidad) <= 0) return
    const p = selectedProducto
    const precio = getPrice(p, tipoVenta)
    const cant = Number(cantidad)
    const unit = String(p.unidad_medida) || 'kg'
    const loteId = selectedLote ? Number(selectedLote) : 0
    const lote = lotesForProduct.find(l => Number(l.id_lote) === loteId)
    setOrderItems(prev => [...prev, {
      id_producto: Number(p.id_producto), producto_nombre: `${getCatName(Number(p.id_categoria), categorias)} ${p.presentacion}`,
      cantidad: cant, unidad_medida: unit, precio_unitario: precio,
      id_lote: loteId, lote_numero: lote ? String(lote.numero_lote) : '', subtotal: cant * precio,
    }])
    setCantidad(''); setSelectedLote(''); setSelectedProducto(null)
  }

  const removeFromOrder = (idx: number) => setOrderItems(prev => prev.filter((_, i) => i !== idx))

  // ── Inline quantity edit ───────────────────────────────────────────────────
  const updateItemCantidad = (idx: number, newCant: string) => {
    const c = Number(newCant)
    if (newCant !== '' && (isNaN(c) || c < 0)) return
    setOrderItems(prev => prev.map((item, i) => {
      if (i !== idx) return item
      const cant = c > 0 ? c : item.cantidad
      return { ...item, cantidad: newCant === '' ? item.cantidad : cant, subtotal: (newCant === '' ? item.cantidad : cant) * item.precio_unitario }
    }))
  }

  // ── Registrar venta ────────────────────────────────────────────────────────
  const registrarVenta = async () => {
    if (!user || !selectedCliente || orderItems.length === 0) return
    const sinLote = orderItems.filter(item => !item.id_lote)
    if (sinLote.length > 0) {
      toast('error', 'Lote requerido', `Selecciona un lote para: ${sinLote.map(i => i.producto_nombre).join(', ')}.`)
      return
    }
    const montoRecibido = Number(pagoMonto) || total
    if (montoRecibido <= 0) {
      toast('error', 'Monto inválido', 'El monto recibido debe ser mayor a cero.')
      return
    }
    setSaving(true)
    try {
      const venta = await api.create<Row>('ventas', {
        numero_documento: selectedCliente, id_usuario: user.id_usuario, tipo_venta: tipoVenta,
        iva: Number(iva) || 0, descuento_total: Number(descuento) || 0, total_pagar: total, estado: true,
      })
      const ventaId = venta.id_venta as number
      for (const item of orderItems) {
        await api.create('detalle_venta', {
          id_venta: ventaId, id_producto: item.id_producto, id_lote: item.id_lote,
          cantidad: item.cantidad, unidad_medida: item.unidad_medida, precio_unitario: item.precio_unitario,
        })
        // Deduct stock from lote
        try {
          const loteData = await api.getById<Row>('lotes', item.id_lote)
          const nuevo = Math.max(0, Number(loteData.cantidad_disponible) - item.cantidad)
          await api.update('lotes', item.id_lote, { cantidad_disponible: nuevo })
        } catch { /* non-fatal: stock update failure does not roll back the sale */ }
      }
      const pagoPayload: Record<string, unknown> = { id_venta: ventaId, metodo_pago: pagoMetodo, monto_recibido: montoRecibido }
      if (pagoReferencia.trim()) pagoPayload.referencia = pagoReferencia.trim()
      await api.create('pagos_venta', pagoPayload)
      toast('success', 'Venta registrada', 'La venta se guardó correctamente.')
      setOrderItems([]); setSelectedCliente(''); setDescuento(''); setIva(''); setPagoMonto(''); setPagoReferencia('')
    } catch (err) {
      toast('error', 'No se pudo registrar la venta', err instanceof Error ? err.message : 'Error')
    } finally { setSaving(false) }
  }

  if (!hasModuleAccess('Ventas')) return null

  // ── Historial view ─────────────────────────────────────────────────────────
  if (view === 'historial') {
    const filteredVentas = ventas.filter(v => !histQuery || String(v.numero_documento ?? '').toLowerCase().includes(histQuery.toLowerCase()))
    const shownVentas = filteredVentas.slice((histPage - 1) * histPageSize, histPage * histPageSize)
    return (
      <section>
        <div className="page-toolbar">
          <SearchBar placeholder="Buscar por cliente..." value={histQuery} onChange={v => { setHistQuery(v); setHistPage(1) }} />
          <button className="btn-secondary" onClick={() => setView('pos')}>
            <Ic d={P.arrowR} size={14} style={{ transform: 'rotate(180deg)' }} /> Volver al POS
          </button>
          {histError && <div className="error-banner"><span><Ic d={P.alert} size={14} /> {histError}</span><button className="btn-secondary" onClick={loadVentas}>Reintentar</button></div>}
        </div>

        {histLoading ? (
          <div className="loading-state"><Ic d={P.sync} size={32} style={{ animation: 'spin 1s linear infinite' }} /><p>Cargando…</p></div>
        ) : (
          <>
            <div className="card table-scroll">
              <table className="data-table">
                <thead><tr><th>N°</th><th>Cliente</th><th>Tipo</th><th>Fecha</th><th>Total</th><th>Estado</th><th>Acciones</th></tr></thead>
                <tbody>
                  {shownVentas.map(v => (
                    <tr key={String(v.id_venta)}>
                      <td><strong>V-{String(v.id_venta).padStart(4, '0')}</strong></td>
                      <td>{String(v.numero_documento)}</td>
                      <td>{String(v.tipo_venta)}</td>
                      <td>{String(v.fecha_venta ?? '').replace('T', ' ').split('.')[0] || '—'}</td>
                      <td>{v.total_pagar != null ? cop(Number(v.total_pagar)) : '—'}</td>
                      <td><span className={`badge ${v.estado ? 'badge-green' : 'badge-red'}`}>{v.estado ? 'Registrada' : 'Anulada'}</span></td>
                      <td>
                        <div className="actions">
                          <ViewBtn onClick={() => openDetail(v)} />
                          {canAnular && Boolean(v.estado) && (
                            <button className="btn-ghost" title="Anular venta" style={{ color: 'var(--action-trash)' }} onClick={() => { setAnularRow(v); setMotivo('') }}>
                              <Ic d={P.close} size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!shownVentas.length && <tr><td colSpan={7} className="table-empty">No se encontraron ventas.</td></tr>}
                </tbody>
              </table>
            </div>
            <Pagination page={histPage} total={filteredVentas.length} pageSize={histPageSize} onPageChange={setHistPage} />
          </>
        )}

        {/* ── Detail modal (read-only) ──────────────────────────────────────── */}
        <Modal open={!!detailRow} title={`Detalle — Venta V-${String(detailRow?.id_venta ?? '').padStart(4, '0')}`} onClose={() => setDetailRow(null)} wide>
          {detailRow && (
            <>
              <div className="detail-grid">
                <div className="detail-row"><span>Cliente</span><strong>{String(detailRow.numero_documento)}</strong></div>
                <div className="detail-row"><span>Tipo de venta</span><strong>{String(detailRow.tipo_venta)}</strong></div>
                <div className="detail-row"><span>Fecha</span><strong>{String(detailRow.fecha_venta ?? '').replace('T', ' ').split('.')[0] || '—'}</strong></div>
                <div className="detail-row"><span>IVA</span><strong>{detailRow.iva != null ? cop(Number(detailRow.iva)) : '—'}</strong></div>
                <div className="detail-row"><span>Descuento</span><strong>{detailRow.descuento_total != null ? cop(Number(detailRow.descuento_total)) : '—'}</strong></div>
                <div className="detail-row"><span>Total</span><strong>{detailRow.total_pagar != null ? cop(Number(detailRow.total_pagar)) : '—'}</strong></div>
                <div className="detail-row"><span>Estado</span><strong>{detailRow.estado ? 'Registrada' : 'Anulada'}</strong></div>
                {detailRow.motivo_anulacion != null && String(detailRow.motivo_anulacion) !== '' && <div className="detail-row"><span>Motivo anulación</span><strong style={{ color: 'var(--danger-text)' }}>{String(detailRow.motivo_anulacion)}</strong></div>}
              </div>

              <h3 style={{ margin: '20px 0 10px', fontSize: 14, fontWeight: 700 }}>Productos</h3>
              {detailLoading ? (
                <div className="loading-state" style={{ padding: '12px 0' }}><Ic d={P.sync} size={18} style={{ animation: 'spin 1s linear infinite' }} /></div>
              ) : detailLines.length > 0 ? (
                <div className="card table-scroll" style={{ marginBottom: 16 }}>
                  <table className="data-table">
                    <thead><tr><th>Producto</th><th>Lote</th><th>Cantidad</th><th>Unidad</th><th>P. Unitario</th><th>Subtotal</th></tr></thead>
                    <tbody>
                      {detailLines.map(line => (
                        <tr key={String(line.id_detalle_venta)}>
                          <td>{String(line.id_producto)}</td>
                          <td>{String(line.id_lote)}</td>
                          <td>{Number(line.cantidad)}</td>
                          <td>{String(line.unidad_medida)}</td>
                          <td>{line.precio_unitario != null ? cop(Number(line.precio_unitario)) : '—'}</td>
                          <td>{(line.cantidad != null && line.precio_unitario != null) ? cop(Number(line.cantidad) * Number(line.precio_unitario)) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="muted">No hay líneas registradas.</p>}

              <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700 }}>Pagos</h3>
              {detailPagos.length > 0 ? (
                <div className="card table-scroll">
                  <table className="data-table">
                    <thead><tr><th>Método</th><th>Monto recibido</th><th>Referencia</th></tr></thead>
                    <tbody>
                      {detailPagos.map(p => (
                        <tr key={String(p.id_pago_venta)}>
                          <td>{String(p.metodo_pago)}</td>
                          <td>{p.monto_recibido != null ? cop(Number(p.monto_recibido)) : '—'}</td>
                          <td>{String(p.referencia ?? '—')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="muted">No hay pagos registrados.</p>}
            </>
          )}
        </Modal>

        {/* ── Anular venta modal ────────────────────────────────────────────── */}
        <Modal open={!!anularRow} title={`Anular venta V-${String(anularRow?.id_venta ?? '').padStart(4, '0')}`} onClose={() => setAnularRow(null)} narrow>
          {anularRow && (
            <>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 20 }}>
                <span style={{ color: 'var(--amber)', background: 'var(--warning-bg)', borderRadius: '50%', padding: 10, display: 'inline-flex' }}>
                  <Ic d={P.alert} size={20} />
                </span>
                <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  Esta acción marcará la venta como <strong>Anulada</strong>. Debe indicar el motivo de anulación.
                </p>
              </div>
              <Field label="Motivo de anulación *">
                <input className="input" type="text" maxLength={200} placeholder="Ej. Error en el pedido, devolución del cliente…" value={motivo} onChange={e => setMotivo(e.target.value)} />
              </Field>
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setAnularRow(null)}>Cancelar</button>
                <button className="btn-danger" disabled={!motivo.trim() || anulando} onClick={doAnular}>
                  {anulando ? <><Ic d={P.sync} size={14} style={{ animation: 'spin 1s linear infinite' }} /> Anulando…</> : 'Confirmar anulación'}
                </button>
              </div>
            </>
          )}
        </Modal>
      </section>
    )
  }

  // ── POS view ───────────────────────────────────────────────────────────────
  return (
    <section>
      <div className="page-toolbar">
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, marginRight: 'auto' }}>Punto de venta</h2>
        <button className="btn-secondary" onClick={() => setView('historial')}>
          <Ic d={P.clipboard} size={14} /> Historial
        </button>
      </div>

      {loading ? (
        <div className="loading-state"><Ic d={P.sync} size={32} style={{ animation: 'spin 1s linear infinite' }} /><p>Cargando…</p></div>
      ) : error ? (
        <div className="card" style={{ padding: 24, textAlign: 'center' }}>
          <Ic d={P.alert} size={32} style={{ color: 'var(--danger)', marginBottom: 12 }} />
          <p className="muted" style={{ marginBottom: 12 }}>{error}</p>
          <button className="btn-secondary" onClick={loadData}>Reintentar</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20, alignItems: 'start' }}>
          <div>
            {/* Section 1 */}
            <div className="card" style={{ padding: 20, marginBottom: 16 }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>1. Tipo de fresa</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {['Fresca', 'Congelada'].map(tipo => (
                  <div key={tipo} className="pos-card" style={{ border: selectedTipo === tipo ? '2px solid var(--primary)' : undefined, background: selectedTipo === tipo ? 'var(--primary-light)' : undefined }}
                    onClick={() => { setSelectedTipo(tipo); setSelectedProducto(null); setCantidad(''); setSelectedLote('') }}>
                    <div style={{ fontSize: 28, marginBottom: 4 }}>{tipo === 'Fresca' ? '🍓' : '🧊'}</div>
                    <strong>{tipo === 'Fresca' ? 'Fresa Fresca' : 'Fresa Congelada'}</strong>
                  </div>
                ))}
              </div>
            </div>

            {/* Section 2 */}
            {selectedTipo && (
              <div className="card" style={{ padding: 20, marginBottom: 16 }}>
                <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>2. Calibre</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
                  {availableProducts.map(p => (
                    <div key={String(p.id_producto)} className="pos-card"
                      style={{ border: selectedProducto?.id_producto === p.id_producto ? '2px solid var(--primary)' : undefined, background: selectedProducto?.id_producto === p.id_producto ? 'var(--primary-light)' : undefined }}
                      onClick={() => { setSelectedProducto(p); setCantidad(''); setSelectedLote(''); loadLotes(Number(p.id_producto)) }}>
                      <strong>{getCatName(Number(p.id_categoria), categorias)}</strong>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{cop(getPrice(p, tipoVenta))} / {String(p.unidad_medida)}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 2 }}>Stock: {Number(p.stock_vendible) || 0} {String(p.unidad_medida)}</div>
                    </div>
                  ))}
                  {!availableProducts.length && <p className="muted">No hay productos disponibles.</p>}
                </div>
              </div>
            )}

            {/* Section 3 */}
            {selectedProducto && (
              <div className="card" style={{ padding: 20, marginBottom: 16 }}>
                <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>3. Cantidad</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <Field label="Cantidad">
                    <input className="input" type="number" min={0.01} step={0.01} value={cantidad} onChange={e => setCantidad(e.target.value)} />
                  </Field>
                  <Field label="Unidad">
                    <input className="input" value={String(selectedProducto.unidad_medida) || 'kg'} disabled />
                  </Field>
                </div>
                <Field label="Lote">
                  <select className="select" value={selectedLote} onChange={e => setSelectedLote(e.target.value)}>
                    <option value="">Seleccione un lote…</option>
                    {lotesForProduct.map(l => (
                      <option key={String(l.id_lote)} value={String(l.id_lote)}>
                        {String(l.numero_lote)} ({Number(l.cantidad_disponible)} {String(selectedProducto.unidad_medida)})
                      </option>
                    ))}
                  </select>
                  {!lotesForProduct.length && <small style={{ color: 'var(--amber)' }}>No hay lotes disponibles para este producto.</small>}
                </Field>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Subtotal: </span>
                    <strong style={{ fontSize: 16 }}>{cop(itemSubtotal)}</strong>
                  </div>
                  <button className="btn-primary" disabled={!cantidad || Number(cantidad) <= 0 || (lotesForProduct.length > 0 && !selectedLote)} onClick={addToOrder}>
                    <Ic d={P.plus} size={14} /> Agregar a la orden
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Order panel ───────────────────────────────────────────────────── */}
          <div className="card" style={{ padding: 20, position: 'sticky', top: 20 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700 }}>Orden activa</h3>
            <Field label="Cliente">
              <select className="select" value={selectedCliente} onChange={e => setSelectedCliente(e.target.value)}>
                <option value="">Seleccione un cliente…</option>
                {clientes.map(c => <option key={String(c.numero_documento)} value={String(c.numero_documento)}>{String(c.nombre_cliente)}</option>)}
              </select>
            </Field>
            <Field label="Tipo de venta">
              <select className="select" value={tipoVenta} onChange={e => setTipoVenta(e.target.value)}>
                <option value="Detal">Detal</option>
                <option value="Mayorista">Mayorista</option>
              </select>
            </Field>
            <div style={{ borderTop: '1px solid var(--border)', margin: '12px 0' }} />

            {orderItems.length === 0 ? (
              <p className="muted" style={{ textAlign: 'center', padding: '20px 0' }}>No hay productos en la orden.</p>
            ) : (
              <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
                {orderItems.map((item, i) => (
                  <div key={i} style={{ padding: '8px 10px', border: '1px solid var(--border-soft)', borderRadius: 8, background: 'var(--surface-subtle)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                      <strong style={{ fontSize: 12 }}>{item.producto_nombre}</strong>
                      <button style={{ background: 'none', border: 'none', color: 'var(--action-trash)', cursor: 'pointer', padding: 2 }} onClick={() => removeFromOrder(i)}>
                        <Ic d={P.trash} size={12} />
                      </button>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {/* Inline quantity edit */}
                      <input
                        type="number" min={0.01} step={0.01}
                        value={item.cantidad}
                        style={{ width: 72, padding: '3px 6px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)' }}
                        onChange={e => updateItemCantidad(i, e.target.value)}
                      />
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.unidad_medida} × {cop(item.precio_unitario)}</span>
                      <strong style={{ fontSize: 12, marginLeft: 'auto' }}>{cop(item.subtotal)}</strong>
                    </div>
                    {item.lote_numero && <small style={{ color: 'var(--text-light)', fontSize: 11 }}>Lote: {item.lote_numero}</small>}
                  </div>
                ))}
              </div>
            )}

            <div style={{ borderTop: '1px solid var(--border)', margin: '12px 0' }} />
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span className="muted">Subtotal:</span><strong>{cop(subtotal)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span className="muted" style={{ fontSize: 13 }}>Descuento ($):</span>
                <input className="input" type="number" min={0} step={0.01} value={descuento} onChange={e => setDescuento(e.target.value)} style={{ width: 120 }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span className="muted" style={{ fontSize: 13 }}>IVA ($):</span>
                <input className="input" type="number" min={0} step={0.01} value={iva} onChange={e => setIva(e.target.value)} style={{ width: 120 }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4 }}>
                <strong>Total:</strong>
                <strong style={{ fontSize: 18, color: 'var(--primary)' }}>{cop(total)}</strong>
              </div>
            </div>
            <div style={{ borderTop: '1px solid var(--border)', margin: '12px 0' }} />
            <Field label="Método de pago">
              <select className="select" value={pagoMetodo} onChange={e => setPagoMetodo(e.target.value)}>
                <option value="Efectivo">Efectivo</option>
                <option value="Transferencia">Transferencia</option>
              </select>
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Field label="Monto recibido">
                <input className="input" type="number" min={0} step={0.01} value={pagoMonto} onChange={e => setPagoMonto(e.target.value)} placeholder={String(total)} />
              </Field>
              <Field label="Referencia">
                <input className="input" type="text" maxLength={40} value={pagoReferencia} onChange={e => setPagoReferencia(e.target.value)} placeholder="N° transferencia" />
              </Field>
            </div>

            {canRegister ? (
              <button className="btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }} disabled={!selectedCliente || orderItems.length === 0 || saving} onClick={registrarVenta}>
                {saving ? <><Ic d={P.sync} size={14} style={{ animation: 'spin 1s linear infinite' }} /> Registrando…</> : 'Registrar venta'}
              </button>
            ) : (
              <p className="muted" style={{ textAlign: 'center', fontSize: 12, marginTop: 12 }}>No tiene permiso para registrar ventas.</p>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
