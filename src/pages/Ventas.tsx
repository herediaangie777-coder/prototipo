import { useState, useEffect, useCallback } from 'react'
import { Ic, P, Field } from '@/components/shared'
import { useToast } from '@/components/toast'
import { api, isApiMode } from '@/data/services/api'
import { useAuth } from '@/data/services/authContext'
import { ResourceCrudPage } from '@/modules/ResourceCrudPage'
import { ventaResource, type Row } from '@/modules/resources'

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
    // If mayorista is empty, equal, or >= detal, apply 12% discount to detal
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

  // Data
  const [productos, setProductos] = useState<Row[]>([])
  const [categorias, setCategorias] = useState<Row[]>([])
  const [clientes, setClientes] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Selection
  const [selectedTipo, setSelectedTipo] = useState('')
  const [selectedProducto, setSelectedProducto] = useState<Row | null>(null)
  const [cantidad, setCantidad] = useState('')
  const [lotesForProduct, setLotesForProduct] = useState<Row[]>([])
  const [selectedLote, setSelectedLote] = useState('')

  // Order
  const [orderItems, setOrderItems] = useState<OrderItem[]>([])
  const [selectedCliente, setSelectedCliente] = useState('')
  const [tipoVenta, setTipoVenta] = useState('Detal')
  const [descuento, setDescuento] = useState('')
  const [iva, setIva] = useState('')
  const [pagoMetodo, setPagoMetodo] = useState('Efectivo')
  const [pagoMonto, setPagoMonto] = useState('')
  const [pagoReferencia, setPagoReferencia] = useState('')
  const [saving, setSaving] = useState(false)

  const canRegister = hasPermission('Ventas', 'Registrar')

  const loadData = useCallback(async () => {
    if (!isApiMode) { setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const [pRes, cRes, clRes, stockRes] = await Promise.all([
        api.list<Row>('productos'),
        api.list<Row>('categorias'),
        api.list<Row>('clientes'),
        api.getVStockProducto().catch(() => [] as Row[]),
      ])
      const merged = pRes.map(p => {
        const s = stockRes.find(x => x.id_producto === p.id_producto)
        return { ...p, stock_vendible: s?.stock_vendible ?? 0 }
      })
      setProductos(merged)
      setCategorias(cRes)
      setClientes(clRes.filter(c => c.estado !== false))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo conectar con el servidor')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const loadLotes = useCallback(async (productId: number) => {
    try {
      const lotes = await api.getVLotes({ id_producto: String(productId) })
      setLotesForProduct(lotes.filter(l => l.estado === true && Number(l.cantidad_disponible) > 0))
    } catch { setLotesForProduct([]) }
    setSelectedLote('')
  }, [])

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
      id_producto: Number(p.id_producto),
      producto_nombre: `${getCatName(Number(p.id_categoria), categorias)} ${p.presentacion}`,
      cantidad: cant,
      unidad_medida: unit,
      precio_unitario: precio,
      id_lote: loteId,
      lote_numero: lote ? String(lote.numero_lote) : '',
      subtotal: cant * precio,
    }])
    setCantidad('')
    setSelectedLote('')
    setSelectedProducto(null)
  }

  const removeFromOrder = (idx: number) => setOrderItems(prev => prev.filter((_, i) => i !== idx))

  const registrarVenta = async () => {
    if (!user || !selectedCliente || orderItems.length === 0) return

    // Validate: all items must have a lote selected
    const sinLote = orderItems.filter(item => !item.id_lote)
    if (sinLote.length > 0) {
      toast('error', 'Lote requerido', `Selecciona un lote para: ${sinLote.map(i => i.producto_nombre).join(', ')}.`)
      return
    }

    // Validate: total must be > 0 for the pago
    const montoRecibido = Number(pagoMonto) || total
    if (montoRecibido <= 0) {
      toast('error', 'Monto inválido', 'El monto recibido debe ser mayor a cero.')
      return
    }
    setSaving(true)
    try {
      const venta = await api.create<Row>('ventas', {
        numero_documento: selectedCliente,
        id_usuario: user.id_usuario,
        tipo_venta: tipoVenta,
        iva: Number(iva) || 0,
        descuento_total: Number(descuento) || 0,
        total_pagar: total,
        estado: true,
      })
      const ventaId = venta.id_venta as number

      for (const item of orderItems) {
        await api.create('detalle_venta', {
          id_venta: ventaId,
          id_producto: item.id_producto,
          id_lote: item.id_lote,
          cantidad: item.cantidad,
          unidad_medida: item.unidad_medida,
          precio_unitario: item.precio_unitario,
        })
      }

      const pagoPayload: Record<string, unknown> = {
        id_venta: ventaId,
        metodo_pago: pagoMetodo,
        monto_recibido: montoRecibido,
      }
      if (pagoReferencia.trim()) pagoPayload.referencia = pagoReferencia.trim()
      await api.create('pagos_venta', pagoPayload)

      toast('success', 'Venta registrada', 'La venta se guardó correctamente.')
      setOrderItems([])
      setSelectedCliente('')
      setDescuento('')
      setIva('')
      setPagoMonto('')
      setPagoReferencia('')
    } catch (err) {
      toast('error', 'No se pudo registrar la venta', err instanceof Error ? err.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  // ── Historial view ──────────────────────────────────────────────────────────
  if (view === 'historial') {
    return (
      <section>
        <div style={{ marginBottom: 16 }}>
          <button className="btn-secondary" onClick={() => setView('pos')}>
            <Ic d={P.arrowR} size={14} style={{ transform: 'rotate(180deg)' }} /> Volver al POS
          </button>
        </div>
        <ResourceCrudPage config={ventaResource} moduleName="Ventas" />
      </section>
    )
  }

  if (!hasModuleAccess('Ventas')) return null

  // ── POS view ────────────────────────────────────────────────────────────────
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
          {/* ── Left: product selection ───────────────────────────────────────── */}
          <div>
            {/* Section 1: Tipo de fresa */}
            <div className="card" style={{ padding: 20, marginBottom: 16 }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>1. Tipo de fresa</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {['Fresca', 'Congelada'].map(tipo => (
                  <div
                    key={tipo}
                    className="pos-card"
                    style={{
                      border: selectedTipo === tipo ? '2px solid var(--primary)' : undefined,
                      background: selectedTipo === tipo ? 'var(--primary-light)' : undefined,
                    }}
                    onClick={() => { setSelectedTipo(tipo); setSelectedProducto(null); setCantidad(''); setSelectedLote('') }}
                  >
                    <div style={{ fontSize: 28, marginBottom: 4 }}>{tipo === 'Fresca' ? '🍓' : '🧊'}</div>
                    <strong>{tipo === 'Fresca' ? 'Fresa Fresca' : 'Fresa Congelada'}</strong>
                  </div>
                ))}
              </div>
            </div>

            {/* Section 2: Calibre */}
            {selectedTipo && (
              <div className="card" style={{ padding: 20, marginBottom: 16 }}>
                <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>2. Calibre</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
                  {availableProducts.map(p => (
                    <div
                      key={String(p.id_producto)}
                      className="pos-card"
                      style={{
                        border: selectedProducto?.id_producto === p.id_producto ? '2px solid var(--primary)' : undefined,
                        background: selectedProducto?.id_producto === p.id_producto ? 'var(--primary-light)' : undefined,
                      }}
                      onClick={() => { setSelectedProducto(p); setCantidad(''); setSelectedLote(''); loadLotes(Number(p.id_producto)) }}
                    >
                      <strong>{getCatName(Number(p.id_categoria), categorias)}</strong>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                        {cop(getPrice(p, tipoVenta))} / {String(p.unidad_medida)}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 2 }}>
                        Stock: {Number(p.stock_vendible) || 0} {String(p.unidad_medida)}
                      </div>
                    </div>
                  ))}
                  {!availableProducts.length && <p className="muted">No hay productos disponibles.</p>}
                </div>
              </div>
            )}

            {/* Section 3: Cantidad */}
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

          {/* ── Right: order panel ────────────────────────────────────────────── */}
          <div className="card" style={{ padding: 20, position: 'sticky', top: 20 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700 }}>Orden activa</h3>

            <Field label="Cliente">
              <select className="select" value={selectedCliente} onChange={e => setSelectedCliente(e.target.value)}>
                <option value="">Seleccione un cliente…</option>
                {clientes.map(c => (
                  <option key={String(c.numero_documento)} value={String(c.numero_documento)}>{String(c.nombre_cliente)}</option>
                ))}
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
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', border: '1px solid var(--border-soft)', borderRadius: 8, background: 'var(--surface-subtle)' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <strong style={{ fontSize: 12, display: 'block' }}>{item.producto_nombre}</strong>
                      <small style={{ color: 'var(--text-muted)' }}>
                        {item.cantidad} {item.unidad_medida} × {cop(item.precio_unitario)}
                        {item.lote_numero && ` · Lote: ${item.lote_numero}`}
                      </small>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <strong style={{ fontSize: 12 }}>{cop(item.subtotal)}</strong>
                      <button style={{ background: 'none', border: 'none', color: 'var(--action-trash)', cursor: 'pointer', padding: 4 }} onClick={() => removeFromOrder(i)}>
                        <Ic d={P.trash} size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ borderTop: '1px solid var(--border)', margin: '12px 0' }} />

            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span className="muted">Subtotal:</span>
                <strong>{cop(subtotal)}</strong>
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
