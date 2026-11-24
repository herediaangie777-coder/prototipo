import { useState, useEffect, useCallback } from 'react'
import { Ic, P, Field, Modal, ConfirmModal, Pagination, SearchBar } from '@/components/shared'
import { useToast } from '@/components/toast'
import { api, isApiMode } from '@/data/services/api'
import { useAuth } from '@/data/services/authContext'
import type { Row } from '@/modules/resources'

const cop = (v: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v)
const cop2 = (v: unknown) => v != null && v !== '' ? cop(Number(v)) : '—'

function addDays(date: Date, days: number): string {
  const d = new Date(date); d.setDate(d.getDate() + days); return d.toISOString().split('T')[0]
}
const todayStr = new Date().toISOString().split('T')[0]

interface PurchaseLine {
  id_producto: number
  producto_nombre: string
  cantidad: string
  unidad_medida: string
  precio_unitario: string
  subtotal: number
  lote_numero: string
  lote_ubicacion: string
  lote_empaque: string
  lote_fecha_ingreso: string
  lote_fecha_vencimiento: string
}

export function ComprasPage() {
  const { user, hasModuleAccess, hasPermission } = useAuth()
  const toast = useToast()

  const [compras, setCompras] = useState<Row[]>([])
  const [proveedores, setProveedores] = useState<Row[]>([])
  const [productos, setProductos] = useState<Row[]>([])
  const [ubicaciones, setUbicaciones] = useState<Row[]>([])
  const [lotesCount, setLotesCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 10

  const [modal, setModal] = useState(false)
  const [selProveedor, setSelProveedor] = useState('')
  const [selUsuario, setSelUsuario] = useState('')
  const [ivaVal, setIvaVal] = useState('0')
  const [descVal, setDescVal] = useState('0')
  const [lines, setLines] = useState<PurchaseLine[]>([])
  const [saving, setSaving] = useState(false)

  const [detailRow, setDetailRow] = useState<Row | null>(null)
  const [detailLines, setDetailLines] = useState<Row[]>([])
  const [detailLotes, setDetailLotes] = useState<Record<number, Row[]>>({})
  const [detailLoading, setDetailLoading] = useState(false)
  const [confirmDel, setConfirmDel] = useState<Row | null>(null)

  const canCreate = hasPermission('Compras', 'Registrar')
  const canDelete = hasPermission('Compras', 'Editar')
  const canView = hasPermission('Compras', 'Ver detalle') || hasPermission('Compras', 'Consultar')

  const loadData = useCallback(async () => {
    if (!isApiMode) { setLoading(false); return }
    setLoading(true); setError(null)
    try {
      const [c, pv, pr, ub, lo] = await Promise.all([
        api.list<Row>('compras').catch(() => []),
        api.list<Row>('proveedores').catch(() => []),
        api.list<Row>('productos').catch(() => []),
        api.list<Row>('ubicaciones').catch(() => []),
        api.list<Row>('lotes').catch(() => []),
      ])
      setCompras(c); setProveedores(pv); setProductos(pr); setUbicaciones(ub); setLotesCount(lo.length)
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo conectar con el servidor') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const provName = (id: unknown) => { const p = proveedores.find(x => x.id_proveedor === id); return p ? String(p.nombre_proveedor) : String(id ?? '—') }

  const linesSubtotal = lines.reduce((s, l) => s + l.subtotal, 0)
  const totalCompra = Math.max(0, linesSubtotal + (Number(ivaVal) || 0) - (Number(descVal) || 0))

  const addLine = () => {
    const nextNum = lotesCount + lines.length + 1
    setLines(prev => [...prev, {
      id_producto: 0, producto_nombre: '', cantidad: '', unidad_medida: 'kg', precio_unitario: '', subtotal: 0,
      lote_numero: `L-${String(nextNum).padStart(3, '0')}`,
      lote_ubicacion: ubicaciones.length > 0 ? String(ubicaciones[0].id_ubicacion) : '',
      lote_empaque: 'Bulto', lote_fecha_ingreso: todayStr, lote_fecha_vencimiento: addDays(new Date(), 7),
    }])
  }
  const removeLine = (idx: number) => setLines(prev => prev.filter((_, i) => i !== idx))

  const updateLine = (idx: number, field: keyof PurchaseLine, val: string | number) => {
    setLines(prev => prev.map((l, i) => {
      if (i !== idx) return l
      const updated: PurchaseLine = { ...l, [field]: val }
      if (field === 'id_producto') {
        const p = productos.find(x => x.id_producto === val)
        updated.producto_nombre = p ? String(p.presentacion) : ''
        updated.unidad_medida = p ? String(p.unidad_medida) : 'kg'
        updated.precio_unitario = p ? String(p.precio_compra ?? '') : ''
        const esFresca = p && String(p.tipo_producto) === 'Fresca'
        updated.lote_empaque = esFresca ? 'Bulto' : 'Bolsa'
        updated.lote_fecha_vencimiento = addDays(new Date(), esFresca ? 7 : 90)
      }
      updated.subtotal = (Number(updated.cantidad) || 0) * (Number(updated.precio_unitario) || 0)
      return updated
    }))
  }

  const openModal = () => {
    setSelProveedor(''); setSelUsuario(user ? String(user.id_usuario) : '')
    setIvaVal('0'); setDescVal('0'); setLines([])
    setModal(true)
  }

  const save = async () => {
    if (!selProveedor || !selUsuario || lines.length === 0 || !user) {
      toast('error', 'Faltan datos', 'Seleccione proveedor, usuario y al menos un producto.'); return
    }
    setSaving(true)
    try {
      const compra = await api.create<Row>('compras', {
        id_proveedor: Number(selProveedor), id_usuario: Number(selUsuario),
        iva: Number(ivaVal) || 0, descuento: Number(descVal) || 0, total_compra: totalCompra, estado: true,
      })
      const compraId = compra.id_compra as number
      const lotesCreados: string[] = []

      for (const line of lines) {
        if (!line.id_producto || Number(line.cantidad) <= 0) continue
        const detalle = await api.create<Row>('detalle_compra', {
          id_compra: compraId, id_producto: line.id_producto, cantidad: Number(line.cantidad),
          unidad_medida: line.unidad_medida, precio_unitario: Number(line.precio_unitario) || 0,
        })
        const detalleId = detalle.id_detalle_compra as number
        const prod = productos.find(p => p.id_producto === line.id_producto)

        await api.create('lotes', {
          numero_lote: line.lote_numero, id_detalle_compra: detalleId,
          fecha_ingreso: line.lote_fecha_ingreso, fecha_vencimiento: line.lote_fecha_vencimiento,
          tipo_empaque: line.lote_empaque, cantidad_disponible: Number(line.cantidad),
          id_ubicacion: Number(line.lote_ubicacion) || 1,
          es_transformable: prod && String(prod.tipo_producto) === 'Fresca' ? true : false, estado: true,
        })
        lotesCreados.push(line.lote_numero)
      }

      toast('success', 'Compra registrada', `Lotes generados: ${lotesCreados.join(', ')}`)
      setModal(false); loadData()
    } catch (err) {
      toast('error', 'No se pudo registrar la compra', err instanceof Error ? err.message : 'Error')
    } finally { setSaving(false) }
  }

  const openDetail = async (row: Row) => {
    setDetailRow(row); setDetailLoading(true)
    const id = row.id_compra as number
    try {
      const dl = await api.list<Row>('detalle_compra', { id_compra: String(id) })
      setDetailLines(dl)
      const lotesMap: Record<number, Row[]> = {}
      for (const line of dl) {
        try { lotesMap[line.id_detalle_compra as number] = await api.list<Row>('lotes', { id_detalle_compra: String(line.id_detalle_compra) }) }
        catch { lotesMap[line.id_detalle_compra as number] = [] }
      }
      setDetailLotes(lotesMap)
    } catch { setDetailLines([]) } finally { setDetailLoading(false) }
  }

  const doDelete = async () => {
    if (!confirmDel) return
    try { await api.remove('compras', confirmDel.id_compra as number); toast('success', 'Compra eliminada', 'El registro fue eliminado.'); loadData() }
    catch (err) { toast('error', 'No se pudo eliminar', err instanceof Error ? err.message : 'Error') }
    setConfirmDel(null)
  }

  if (!hasModuleAccess('Compras')) return null

  const filtered = compras.filter(c => !query || provName(c.id_proveedor).toLowerCase().includes(query.toLowerCase()))
  const shown = filtered.slice((page - 1) * pageSize, page * pageSize)

  return (
    <section>
      <div className="page-toolbar">
        {canView && <SearchBar placeholder="Buscar por proveedor..." value={query} onChange={v => { setQuery(v); setPage(1) }} />}
        {canCreate && <button className="btn-primary" onClick={openModal}><Ic d={P.plus} size={15} /> Registrar compra</button>}
        {error && <div className="error-banner"><span><Ic d={P.alert} size={14} /> {error}</span><button className="btn-secondary" onClick={loadData}>Reintentar</button></div>}
      </div>

      {loading ? (
        <div className="loading-state"><Ic d={P.sync} size={32} style={{ animation: 'spin 1s linear infinite' }} /><p>Cargando…</p></div>
      ) : (
        <>
          <div className="card table-scroll">
            <table className="data-table">
              <thead><tr><th>N°</th><th>Proveedor</th><th>Fecha</th><th>Total</th><th>Estado</th><th>Acciones</th></tr></thead>
              <tbody>
                {shown.map(c => (
                  <tr key={String(c.id_compra)}>
                    <td><strong>C-{String(c.id_compra).padStart(4, '0')}</strong></td>
                    <td>{provName(c.id_proveedor)}</td>
                    <td>{String(c.fecha_compra ?? '').replace('T', ' ').split('.')[0] || '—'}</td>
                    <td>{cop2(c.total_compra)}</td>
                    <td><span className={`badge ${c.estado ? 'badge-green' : 'badge-red'}`}>{c.estado ? 'Recibida' : 'Anulada'}</span></td>
                    <td><div className="actions">
                      {canView && <button className="btn-ghost" title="Ver detalle" onClick={() => openDetail(c)}><Ic d={P.eye} size={15} /></button>}
                      {canDelete && <button className="btn-ghost" title="Eliminar" onClick={() => setConfirmDel(c)}><Ic d={P.trash} size={15} /></button>}
                    </div></td>
                  </tr>
                ))}
                {!shown.length && <tr><td colSpan={6} className="table-empty">No se encontraron compras.</td></tr>}
              </tbody>
            </table>
          </div>
          <Pagination page={page} total={filtered.length} pageSize={pageSize} onPageChange={setPage} />
        </>
      )}

      {/* ── Registrar compra modal ──────────────────────────────────────────── */}
      <Modal open={modal} title="Registrar compra" onClose={() => setModal(false)} wide>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <Field label="Proveedor">
            <select className="select" value={selProveedor} onChange={e => setSelProveedor(e.target.value)}>
              <option value="">Seleccione...</option>
              {proveedores.map(p => <option key={String(p.id_proveedor)} value={String(p.id_proveedor)}>{String(p.nombre_proveedor)}</option>)}
            </select>
          </Field>
          <Field label="Usuario">
            <select className="select" value={selUsuario} onChange={e => setSelUsuario(e.target.value)}>
              <option value="">Seleccione...</option>
              <option value={String(user?.id_usuario)}>{user?.correo}</option>
            </select>
          </Field>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 16, alignItems: 'start' }}>
          {/* ── Left: product lines with lote fields ─────────────────────────── */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <strong style={{ fontSize: 13 }}>Productos</strong>
              <button className="btn-secondary" style={{ fontSize: 12, padding: '5px 10px' }} onClick={addLine}><Ic d={P.plus} size={12} /> Agregar línea</button>
            </div>

            {lines.length === 0 ? (
              <p className="muted" style={{ textAlign: 'center', padding: '16px 0' }}>No hay productos agregados. Use "Agregar línea".</p>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {lines.map((line, idx) => (
                  <div key={idx} style={{ padding: 14, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface-subtle)' }}>
                    {/* Product row */}
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 0.8fr 0.8fr 0.8fr auto', gap: 8, alignItems: 'end' }}>
                      <Field label="Producto">
                        <select className="select" value={String(line.id_producto)} onChange={e => updateLine(idx, 'id_producto', Number(e.target.value))}>
                          <option value="">Seleccione...</option>
                          {productos.filter(p => p.estado !== false).map(p => <option key={String(p.id_producto)} value={String(p.id_producto)}>{String(p.presentacion)}</option>)}
                        </select>
                      </Field>
                      <Field label="Cantidad">
                        <input className="input" type="number" min={0.01} step={0.01} value={line.cantidad} onChange={e => updateLine(idx, 'cantidad', e.target.value)} />
                      </Field>
                      <Field label="Unidad">
                        <select className="select" value={line.unidad_medida} onChange={e => updateLine(idx, 'unidad_medida', e.target.value)}>
                          <option value="kg">kg</option>
                          <option value="bolsa">bolsa</option>
                        </select>
                      </Field>
                      <Field label="P. unit/kg">
                        <input className="input" type="number" min={0} step={0.01} value={line.precio_unitario} onChange={e => updateLine(idx, 'precio_unitario', e.target.value)} />
                      </Field>
                      <button style={{ background: 'none', border: 'none', color: 'var(--action-trash)', cursor: 'pointer', padding: '8px' }} onClick={() => removeLine(idx)}><Ic d={P.trash} size={15} /></button>
                    </div>

                    {/* Lote sub-section */}
                    <div style={{ marginTop: 10, padding: 10, border: '1px solid var(--border-soft)', borderRadius: 8, background: 'var(--card)' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Lote — Registrado con la compra</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: 8, alignItems: 'end' }}>
                        <Field label="N° lote">
                          <input className="input" value={line.lote_numero} onChange={e => updateLine(idx, 'lote_numero', e.target.value)} />
                        </Field>
                        <Field label="Ubicación">
                          <select className="select" value={line.lote_ubicacion} onChange={e => updateLine(idx, 'lote_ubicacion', e.target.value)}>
                            {ubicaciones.map(u => <option key={String(u.id_ubicacion)} value={String(u.id_ubicacion)}>{String(u.nombre_ubicacion)}</option>)}
                          </select>
                        </Field>
                        <Field label="Empaque">
                          <select className="select" value={line.lote_empaque} onChange={e => updateLine(idx, 'lote_empaque', e.target.value)}>
                            <option value="Bulto">Bulto</option>
                            <option value="Bolsa">Bolsa</option>
                            <option value="Caja">Caja</option>
                          </select>
                        </Field>
                        <Field label="F. ingreso">
                          <input className="input" type="date" value={line.lote_fecha_ingreso} onChange={e => updateLine(idx, 'lote_fecha_ingreso', e.target.value)} />
                        </Field>
                        <Field label="F. vencimiento">
                          <input className="input" type="date" value={line.lote_fecha_vencimiento} onChange={e => updateLine(idx, 'lote_fecha_vencimiento', e.target.value)} />
                        </Field>
                      </div>
                    </div>

                    {/* Subtotal */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Subtotal: </span>
                      <strong style={{ fontSize: 14, marginLeft: 6 }}>{cop(line.subtotal)}</strong>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Right: Resumen panel (sticky) ────────────────────────────────── */}
          <div style={{ position: 'sticky', top: 0 }}>
            <div style={{ padding: 16, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--card)' }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>Resumen</h3>
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted" style={{ fontSize: 13 }}>Subtotal:</span><strong>{cop(linesSubtotal)}</strong></div>
                <Field label="Descuento ($)">
                  <input className="input" type="number" min={0} step={0.01} value={descVal} onChange={e => setDescVal(e.target.value)} />
                </Field>
                <Field label="IVA ($)">
                  <input className="input" type="number" min={0} step={0.01} value={ivaVal} onChange={e => setIvaVal(e.target.value)} />
                </Field>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 4 }}>
                  <strong>Total:</strong>
                  <strong style={{ fontSize: 18, color: 'var(--primary)' }}>{cop(totalCompra)}</strong>
                </div>
              </div>
              <button className="btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }} disabled={saving || !selProveedor || lines.length === 0} onClick={save}>
                {saving ? <><Ic d={P.sync} size={14} style={{ animation: 'spin 1s linear infinite' }} /> Guardando…</> : 'Guardar'}
              </button>
              <button className="btn-secondary" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} onClick={() => setModal(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      </Modal>

      {/* ── Detail modal ─────────────────────────────────────────────────────── */}
      <Modal open={!!detailRow} title={`Detalle de compra C-${String(detailRow?.id_compra ?? '').padStart(4, '0')}`} onClose={() => setDetailRow(null)} wide>
        {detailRow && (
          <>
            <div className="detail-grid">
              <div className="detail-row"><span>Proveedor</span><strong>{provName(detailRow.id_proveedor)}</strong></div>
              <div className="detail-row"><span>Fecha</span><strong>{String(detailRow.fecha_compra ?? '').replace('T', ' ').split('.')[0] || '—'}</strong></div>
              <div className="detail-row"><span>IVA</span><strong>{cop2(detailRow.iva)}</strong></div>
              <div className="detail-row"><span>Descuento</span><strong>{cop2(detailRow.descuento)}</strong></div>
              <div className="detail-row"><span>Total</span><strong>{cop2(detailRow.total_compra)}</strong></div>
              <div className="detail-row"><span>Estado</span><strong>{detailRow.estado ? 'Recibida' : 'Anulada'}</strong></div>
            </div>

            <h3 style={{ margin: '20px 0 10px', fontSize: 14, fontWeight: 700 }}>Productos y lotes generados</h3>
            {detailLoading ? (
              <div className="loading-state" style={{ padding: '16px 0' }}><Ic d={P.sync} size={20} style={{ animation: 'spin 1s linear infinite' }} /> <span style={{ marginLeft: 8 }}>Cargando…</span></div>
            ) : detailLines.length > 0 ? (
              <div style={{ display: 'grid', gap: 10 }}>
                {detailLines.map(line => {
                  const lotesForLine = detailLotes[line.id_detalle_compra as number] || []
                  return (
                    <div key={String(line.id_detalle_compra)} style={{ padding: 14, border: '1px solid var(--border-soft)', borderRadius: 10, background: 'var(--surface-subtle)' }}>
                      <div>
                        <strong style={{ fontSize: 13 }}>{(() => { const p = productos.find(x => x.id_producto === line.id_producto); return p ? String(p.presentacion) : 'Producto' })()}</strong>
                        <small style={{ display: 'block', color: 'var(--text-muted)' }}>{Number(line.cantidad)} {String(line.unidad_medida)} × {cop2(line.precio_unitario)} = {cop((Number(line.cantidad) || 0) * (Number(line.precio_unitario) || 0))}</small>
                      </div>
                      {lotesForLine.length > 0 && lotesForLine.map(lote => (
                        <div key={String(lote.id_lote)} style={{ marginTop: 8, padding: '8px 12px', borderRadius: 6, background: 'var(--active-light)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <Ic d={P.tag} size={14} style={{ color: 'var(--active-text)' }} />
                          <span style={{ fontSize: 12 }}>
                            <strong>Lote {String(lote.numero_lote)}</strong> · {String(lote.tipo_empaque)} · {Number(lote.cantidad_disponible)} {String(line.unidad_medida)} · Ingreso: {String(lote.fecha_ingreso)} · Vence: {String(lote.fecha_vencimiento)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            ) : <p className="muted" style={{ textAlign: 'center', padding: '16px 0' }}>No hay productos registrados.</p>}
          </>
        )}
      </Modal>

      <ConfirmModal open={!!confirmDel} title="¿Eliminar compra?" message="Esta acción no se puede deshacer." actionLabel="Eliminar" onCancel={() => setConfirmDel(null)} onConfirm={doDelete} />
    </section>
  )
}
