import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Cell, CartesianGrid, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { ConfirmModal, DeductBtn, EditBtn, Field, FilterPopover, HistoryBtn, Ic, LoteBtn, Modal, P, Pagination, PermBtn, SearchBar, SyncBtn, Toggle, TrashBtn, ViewBtn, fmt } from '../components/shared'
import { useToast } from '../components/toast'
import { clientHistory, dashboardStats, expiringLots, freezeCandidates, freezeSuggestions, hasPermission, periodRows, productName, sellableStock, stockByLot, supplierHistory } from '../data/selectors'
import { getState, updateStore, useStore } from '../data/store'
import { associateLot, cancelPurchase, cancelSale, createProduction, createPurchase, createSale, setProductStock } from '../data/services/business'
import { saveMaster, toggleMasterState } from '../data/services/masters'
import { expiryStatus, localDateFromTimestamp, localDateString, localTimestampString } from '../data/dates'
import { formatId } from '../data/format'
import { toKg, type Unidad } from '../data/units'
import { calibreImagenes, fresaImagenes, FresaImage, type Calibre } from '../config/fresaImagenes'
import type { AppState, MetodoPago, TipoEmpaque, TipoProducto, TipoVenta } from '../data/types'

type ModuleKey = 'roles' | 'usuarios' | 'categorias' | 'productos' | 'proveedores' | 'clientes'
type Row = Record<string, unknown>
type FieldDef = { key: string; label: string; type?: string; max?: number; required?: boolean; options?: Array<{ value: string; label: string }> }
const documentOptions = ['CC', 'CE', 'NIT', 'PAS'].map(value => ({ value, label: value }))
const quantityLabel = (value: number) => value.toLocaleString('es-CO', { maximumFractionDigits: 2 })
const roundMoney = (value: number) => Number(value.toFixed(2))
const completedPaymentAmount = (value: number) => {
  const cents = roundMoney(value)
  const wholePesos = Math.round(cents)
  return String(Math.abs(cents - wholePesos) <= 0.01 ? wholePesos : cents)
}
const paymentDeltaLabel = (value: number) => new Intl.NumberFormat('es-CO', {
  style: 'currency', currency: 'COP', minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2,
}).format(value)
type ChargeMode = '%' | '$'
type PurchaseLineDraft = {
  key: string
  id_producto: string
  cantidad: string
  unidad: 'kg' | 'g'
  precio: string
  conLote: boolean
  numero_lote: string
  fecha_vencimiento: string
  tipo_empaque: TipoEmpaque
  zona_ubicacion: string
}
type SaleCartLine = {
  key: string
  id_producto: number
  cantidad: number
  unidad: Unidad
  kgPorUnidad?: number
  cantidad_kg: number
}

function daysAfter(date: string, days: number) {
  const result = new Date(`${date}T12:00:00`)
  result.setDate(result.getDate() + days)
  return localDateString(result)
}

function suggestedLotNumber(state: AppState, reserved: string[] = []) {
  const highest = state.lotes.reduce((max, lot) => {
    const match = lot.numero_lote.match(/^L-(\d+)$/i)
    return match ? Math.max(max, Number(match[1])) : max
  }, 0)
  let next = highest + 1
  while (reserved.includes(`L-${String(next).padStart(3, '0')}`)) next += 1
  return `L-${String(next).padStart(3, '0')}`
}

function newPurchaseLine(state: AppState, reserved: string[] = []): PurchaseLineDraft {
  return {
    key: `${Date.now()}-${Math.random()}`, id_producto: '', cantidad: '', unidad: 'kg',
    precio: '', conLote: true, numero_lote: suggestedLotNumber(state, reserved),
    fecha_vencimiento: '', tipo_empaque: 'Bulto', zona_ubicacion: '',
  }
}

function convertedKg(value: string, unidad: Unidad, kgPorUnidad?: string, allowZero = false): number | null {
  if (!value.trim()) return null
  const amount = Number(value)
  if (allowZero && amount === 0) return 0
  try {
    return toKg(amount, unidad, kgPorUnidad ? Number(kgPorUnidad) : undefined)
  } catch {
    return null
  }
}

function convertedKgError(value: string, unidad: Unidad, kgPorUnidad?: string, allowZero = false) {
  if (!value.trim()) return 'Este campo es obligatorio'
  const amount = Number(value)
  if (allowZero && amount === 0) return ''
  try {
    toKg(amount, unidad, kgPorUnidad ? Number(kgPorUnidad) : undefined)
    return ''
  } catch (error) {
    return messageOf(error)
  }
}

function chargeAmount(base: number, value: string, mode: ChargeMode) {
  if (!value.trim() || !Number.isFinite(Number(value))) return 0
  const amount = Number(value)
  return roundMoney(mode === '%' ? base * amount / 100 : amount)
}

function dateInRange(value: string, from: string, to: string) {
  const date = localDateFromTimestamp(value)
  return (!from || date >= from) && (!to || date <= to)
}

type MasterFilters = { role: string; status: string; category: string; productType: string; lowStock: boolean; municipality: string; documentType: string }

const configs: Record<Exclude<ModuleKey, 'roles'>, { title: string; kind: Exclude<ModuleKey, 'roles'> extends infer T ? T : never; table: keyof AppState; id: string; fields: FieldDef[]; columns: Array<[string, string]>; search: string[] }> = {
  usuarios: { title: 'Usuarios', kind: 'usuarios', table: 'usuarios', id: 'id_usuario', search: ['nombre', 'apellido', 'correo'], columns: [['Nombre', 'nombre'], ['Correo', 'correo'], ['Teléfono', 'telefono'], ['Rol', 'rol']], fields: [
    { key: 'nombre', label: 'Nombre', max: 25, required: true }, { key: 'apellido', label: 'Apellido', max: 25, required: true },
    { key: 'correo', label: 'Correo', type: 'email', max: 40, required: true }, { key: 'telefono', label: 'Teléfono', max: 15 },
    { key: 'id_rol', label: 'Rol', type: 'select', required: true }, { key: 'contrasenia', label: 'Contraseña temporal', type: 'password', required: true },
  ] },
  categorias: { title: 'Categorías', kind: 'categorias', table: 'categorias', id: 'id_categoria', search: ['nombre_categoria'], columns: [['Categoría', 'nombre_categoria'], ['Productos', 'productos_count']], fields: [
    { key: 'nombre_categoria', label: 'Nombre', max: 20, required: true },
  ] },
  productos: { title: 'Productos', kind: 'productos', table: 'productos', id: 'id_producto', search: ['nombre', 'categoria'], columns: [['Producto', 'nombre'], ['Categoría', 'categoria'], ['P. Detal', 'precio_venta_detal'], ['P. Mayorista', 'precio_venta_mayorista'], ['Stock', 'stock']], fields: [
    { key: 'id_categoria', label: 'Categoría', type: 'select', required: true },
    { key: 'tipo_producto', label: 'Tipo de producto', type: 'select', options: [{ value: 'Fresca', label: 'Fresca' }, { value: 'Congelada', label: 'Congelada' }], required: true },
    { key: 'presentacion', label: 'Presentación', max: 40, required: true },
    { key: 'unidad_medida', label: 'Unidad de medida', max: 15, required: true },
    { key: 'precio_compra', label: 'Precio de compra', type: 'number', required: true },
    { key: 'precio_venta_detal', label: 'Precio venta detal', type: 'number', required: true },
    { key: 'precio_venta_mayorista', label: 'Precio venta mayorista', type: 'number', required: true },
    { key: 'stock_inicial', label: 'Stock inicial', type: 'number', required: true },
    { key: 'stock_minimo', label: 'Stock mínimo', type: 'number', required: true },
  ] },
  proveedores: { title: 'Proveedores', kind: 'proveedores', table: 'proveedores', id: 'id_proveedor', search: ['nombre_proveedor', 'municipio'], columns: [['Proveedor', 'nombre_proveedor'], ['Teléfono', 'telefono'], ['Correo', 'correo'], ['Dirección', 'direccion'], ['Municipio / Departamento', 'municipio']], fields: [
    { key: 'nombre_proveedor', label: 'Nombre', max: 50, required: true }, { key: 'telefono', label: 'Teléfono', max: 15 },
    { key: 'correo', label: 'Correo', type: 'email', max: 30 }, { key: 'direccion', label: 'Dirección', max: 40 },
    { key: 'municipio', label: 'Municipio', max: 25 }, { key: 'departamento', label: 'Departamento', max: 30 },
  ] },
  clientes: { title: 'Clientes', kind: 'clientes', table: 'clientes', id: 'numero_documento', search: ['nombre_cliente', 'numero_documento', 'correo'], columns: [['Cliente', 'nombre_cliente'], ['Documento', 'documento'], ['Teléfono', 'telefono'], ['Municipio', 'municipio'], ['Total histórico', 'total']], fields: [
    { key: 'tipo_documento', label: 'Tipo de documento', type: 'select', options: documentOptions, required: true },
    { key: 'numero_documento', label: 'Número de documento', max: 15, required: true },
    { key: 'nombre_cliente', label: 'Nombre / razón social', max: 100, required: true },
    { key: 'telefono', label: 'Teléfono', max: 15 }, { key: 'correo', label: 'Correo', type: 'email', max: 100 },
    { key: 'direccion', label: 'Dirección', max: 120 }, { key: 'departamento', label: 'Departamento', max: 15 },
    { key: 'municipio', label: 'Municipio', max: 25 },
  ] },
}

function idOf(kind: ModuleKey, row: Row): string | number {
  return row[kind === 'usuarios' ? 'id_usuario' : kind === 'categorias' ? 'id_categoria' : kind === 'productos' ? 'id_producto' : kind === 'proveedores' ? 'id_proveedor' : kind === 'clientes' ? 'numero_documento' : 'id_rol'] as string | number
}
function rowsFor(state: AppState, kind: Exclude<ModuleKey, 'roles'>): Row[] {
  if (kind === 'usuarios') return state.usuarios.map(row => ({ ...row, rol: state.roles.find(r => r.id_rol === row.id_rol)?.nombre_rol ?? '—' }))
  if (kind === 'categorias') return state.categorias.map(row => ({ ...row, productos_count: state.productos.filter(p => p.id_categoria === row.id_categoria).length }))
  if (kind === 'productos') return state.productos.map(row => ({
    ...row, nombre: productName(state, row.id_producto),
    categoria: state.categorias.find(c => c.id_categoria === row.id_categoria)?.nombre_categoria ?? '',
    stock: `${quantityLabel(sellableStock(state, row.id_producto))} ${row.unidad_medida}`,
    sellable_stock: sellableStock(state, row.id_producto),
  }))
  if (kind === 'clientes') return state.clientes.map(row => ({
    ...row, documento: `${row.tipo_documento} · ${row.numero_documento}`,
    total: fmt(clientHistory(state, row.numero_documento).reduce((sum, item) => sum + item.venta.total_pagar, 0)),
  }))
  return kind === 'proveedores' ? state.proveedores.map(row => ({ ...row })) : []
}
function messageOf(error: unknown) { return error instanceof Error ? error.message : 'No fue posible completar la operación.' }
function formInitial(kind: Exclude<ModuleKey, 'roles'>, row?: Row): Record<string, string> {
  if (!row) return {}
  const config = configs[kind]
  return Object.fromEntries(config.fields.map(field => [field.key, row[field.key] == null ? '' : String(row[field.key])]))
}
function inputError(field: FieldDef, value: string) {
  if (field.required && !value.trim()) return 'Este campo es obligatorio'
  if (field.key === 'correo' && value && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) return 'El correo electrónico no posee un formato válido.'
  if (['nombre', 'apellido', 'nombre_categoria', 'nombre_rol', 'nombre_proveedor', 'nombre_cliente'].includes(field.key) && value && !/^[\p{L}\p{N}\s.'-]+$/u.test(value)) return 'No se permiten caracteres especiales'
  if (field.key === 'contrasenia' && value && (value.length < 8 || !/[A-Za-z]/.test(value) || !/\d/.test(value))) return 'La contraseña debe tener al menos 8 caracteres e incluir letras y números.'
  return ''
}

export function MasterPage({ kind }: { kind: Exclude<ModuleKey, 'roles'> }) {
  const state = useStore()
  const toast = useToast()
  const config = configs[kind]
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [highlightedId, setHighlightedId] = useState<string | number | null>(null)
  const [filters, setFilters] = useState<MasterFilters>({ role: '', status: '', category: '', productType: '', lowStock: false, municipality: '', documentType: '' })
  const [modal, setModal] = useState<'new' | 'edit' | 'detail' | 'history' | ''>('')
  const [selected, setSelected] = useState<Row | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [confirm, setConfirm] = useState<Row | null>(null)
  const [stockTarget, setStockTarget] = useState<Row | null>(null)
  const [stockOperation, setStockOperation] = useState<'add' | 'subtract'>('add')
  const [stockQuantity, setStockQuantity] = useState('')
  useEffect(() => {
    if (highlightedId === null) return
    const timer = window.setTimeout(() => setHighlightedId(null), 3000)
    return () => window.clearTimeout(timer)
  }, [highlightedId])
  const user = state.usuarios.find(item => item.id_usuario === Number(sessionStorage.getItem('fresas-user-id')))
  const moduleName = kind === 'usuarios' ? '' : kind === 'categorias' || kind === 'productos' ? 'Inventario' : kind === 'proveedores' ? 'Compras' : 'Ventas'
  const canCreate = user?.id_rol === 1 || hasPermission(state, user?.id_rol ?? -1, moduleName, 'Crear')
  const canUpdate = user?.id_rol === 1 || hasPermission(state, user?.id_rol ?? -1, moduleName, 'Actualizar')
  const isAdmin = user?.id_rol === 1
  const data = rowsFor(state, kind)
  const setFilter = <K extends keyof MasterFilters>(key: K, value: MasterFilters[K]) => {
    setFilters(current => ({ ...current, [key]: value }))
    setPage(1)
  }
  const activeFilterCount = [
    kind === 'usuarios' ? filters.role : '',
    kind === 'productos' ? filters.category : '',
    kind === 'productos' ? filters.productType : '',
    kind === 'proveedores' ? filters.municipality : '',
    kind === 'clientes' ? filters.documentType : '',
    filters.status,
    kind === 'productos' && filters.lowStock ? 'low' : '',
  ].filter(Boolean).length
  const clearFilters = () => {
    setFilters({ role: '', status: '', category: '', productType: '', lowStock: false, municipality: '', documentType: '' })
    setPage(1)
  }
  const filtered = data.filter(row => {
    const text = config.search.map(key => String(row[key] ?? '')).join(' ').toLowerCase()
    if (!text.includes(query.toLowerCase())) return false
    if (filters.status && String(row.estado) !== filters.status) return false
    if (kind === 'usuarios' && filters.role && String(row.id_rol) !== filters.role) return false
    if (kind === 'productos' && filters.category && String(row.id_categoria) !== filters.category) return false
    if (kind === 'productos' && filters.productType && String(row.tipo_producto) !== filters.productType) return false
    if (kind === 'productos' && filters.lowStock && Number(row.sellable_stock) > Number(row.stock_minimo)) return false
    if (kind === 'proveedores' && filters.municipality && String(row.municipio ?? '') !== filters.municipality) return false
    if (kind === 'clientes' && filters.documentType && String(row.tipo_documento) !== filters.documentType) return false
    return true
  })
  const shown = filtered.slice((page - 1) * 10, page * 10)
  const openNew = () => { setSelected(null); setValues({}); setErrors({}); setModal('new') }
  const openEdit = (row: Row) => { setSelected(row); setValues(formInitial(kind, row)); setErrors({}); setModal('edit') }
  const save = () => {
    const nextErrors = Object.fromEntries(config.fields.map(field => [field.key, inputError(field, values[field.key] ?? '')]).filter(([, error]) => error))
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); return }
    try {
      const payload = { ...values }
      if (kind === 'usuarios') payload.id_rol = values.id_rol || String(state.roles.find(role => role.estado)?.id_rol ?? '')
      if (kind === 'productos') {
        const category = state.categorias.find(row => row.nombre_categoria === values.id_categoria)
        payload.id_categoria = category ? String(category.id_categoria) : values.id_categoria
      }
      const id = selected ? idOf(kind, selected) : undefined
      const savedState = saveMaster(getState(), kind === 'categorias' ? 'categoria' : kind === 'productos' ? 'producto' : kind === 'proveedores' ? 'proveedor' : kind === 'clientes' ? 'cliente' : 'usuario', payload, id)
      updateStore(savedState)
      if (!selected) {
        const savedRows = rowsFor(savedState, kind)
        const createdRow = savedRows[savedRows.length - 1]
        if (createdRow) {
          setQuery('')
          setFilters({ role: '', status: '', category: '', productType: '', lowStock: false, municipality: '', documentType: '' })
          setPage(Math.floor((savedRows.length - 1) / 10) + 1)
          setHighlightedId(idOf(kind, createdRow))
        }
      }
      toast('success', selected ? 'Cambios guardados' : `${config.title.slice(0, -1)} registrado con éxito`, 'La información se actualizó correctamente.')
      setModal('')
    } catch (error) { toast('error', 'No se pudo guardar', messageOf(error)) }
  }
  const toggle = (row: Row) => {
    try {
      updateStore(toggleMasterState(getState(), kind === 'categorias' ? 'categoria' : kind === 'productos' ? 'producto' : kind === 'proveedores' ? 'proveedor' : kind === 'clientes' ? 'cliente' : 'usuario', idOf(kind, row), Number(sessionStorage.getItem('fresas-user-id'))))
      toast('success', 'Estado actualizado', 'El estado del registro fue actualizado.')
    } catch (error) { toast('error', 'No se pudo cambiar el estado', messageOf(error)) }
    setConfirm(null)
  }
  const stockApply = () => {
    if (!stockTarget) return
    try {
      updateStore(setProductStock(getState(), Number(stockTarget.id_producto), stockOperation, Number(stockQuantity)))
      toast('warning', 'Existencias ajustadas', 'El ajuste manual no modifica los lotes.')
      setStockTarget(null)
    } catch (error) { toast('error', 'No se pudo ajustar el stock', messageOf(error)) }
  }
  return <section>
    <div className="page-toolbar">
      <SearchBar placeholder={`Buscar ${config.title.toLowerCase()}...`} value={query} onChange={value => { setQuery(value); setPage(1) }} />
      <FilterPopover activeCount={activeFilterCount} onClear={clearFilters}>
        {kind === 'usuarios' && <Field label="Rol"><select className="select" value={filters.role} onChange={event => setFilter('role', event.target.value)}><option value="">Todos los roles</option>{state.roles.map(role => <option key={role.id_rol} value={role.id_rol}>{role.nombre_rol}</option>)}</select></Field>}
        {kind === 'productos' && <>
          <Field label="Categoría"><select className="select" value={filters.category} onChange={event => setFilter('category', event.target.value)}><option value="">Todas las categorías</option>{state.categorias.map(category => <option key={category.id_categoria} value={category.id_categoria}>{category.nombre_categoria}</option>)}</select></Field>
          <Field label="Tipo"><select className="select" value={filters.productType} onChange={event => setFilter('productType', event.target.value)}><option value="">Todos los tipos</option><option>Fresca</option><option>Congelada</option></select></Field>
          <label className="filter-check"><input type="checkbox" checked={filters.lowStock} onChange={event => setFilter('lowStock', event.target.checked)} /> Solo stock bajo</label>
        </>}
        {kind === 'proveedores' && <Field label="Municipio"><select className="select" value={filters.municipality} onChange={event => setFilter('municipality', event.target.value)}><option value="">Todos los municipios</option>{[...new Set(state.proveedores.map(row => row.municipio).filter((value): value is string => Boolean(value)))].sort().map(municipality => <option key={municipality}>{municipality}</option>)}</select></Field>}
        {kind === 'clientes' && <Field label="Tipo de documento"><select className="select" value={filters.documentType} onChange={event => setFilter('documentType', event.target.value)}><option value="">Todos los documentos</option>{documentOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>}
        {(kind === 'usuarios' || kind === 'categorias' || kind === 'productos' || kind === 'proveedores' || kind === 'clientes') && <Field label="Estado"><select className="select" value={filters.status} onChange={event => setFilter('status', event.target.value)}><option value="">Todos los estados</option><option value="true">Activo</option><option value="false">Inactivo</option></select></Field>}
      </FilterPopover>
      {canCreate && <button className="btn-primary" onClick={openNew}><Ic d={P.plus} size={15} /> Registrar {config.title.slice(0, -1).toLowerCase()}</button>}
    </div>
    <div className="card table-scroll">
      <table className="data-table"><thead><tr>{config.columns.map(([label]) => <th key={label}>{label}</th>)}<th>Estado</th><th>Acciones</th></tr></thead>
        <tbody>{shown.map(row => <tr key={String(idOf(kind, row))} className={highlightedId === idOf(kind, row) ? 'row-highlight' : undefined}>
          {config.columns.map(([label, key]) => <td data-label={label} key={label}>
            {kind === 'clientes' && key === 'documento' ? <><span className="badge badge-blue">{String(row.tipo_documento)}</span> {String(row.numero_documento)}</> :
              kind === 'productos' && key === 'stock' ? <><strong>{String(row.stock)}</strong>{Number(row.sellable_stock) <= Number(row.stock_minimo) && <span className="badge badge-amber">Bajo</span>}</> :
                kind === 'usuarios' && key === 'nombre' ? <strong>{String(row.nombre)} {String(row.apellido)}</strong> :
                  kind === 'clientes' && key === 'nombre_cliente' ? <><strong>{String(row.nombre_cliente)}</strong><small className="cell-sub">{String(row.correo ?? '')}</small></> :
                    String(row[key] ?? '—')}
          </td>)}
          <td data-label="Estado"><span className={`badge ${row.estado ? 'badge-green' : 'badge-red'}`}>{row.estado ? 'Activo' : 'Inactivo'}</span></td>
          <td data-label="Acciones"><div className="actions">
            <ViewBtn onClick={() => { setSelected(row); setModal('detail') }} />
            {kind === 'proveedores' && <HistoryBtn title="Historial del proveedor" onClick={() => { setSelected(row); setModal('history') }} />}
            {kind === 'clientes' && <HistoryBtn title="Historial del cliente" onClick={() => { setSelected(row); setModal('history') }} />}
            {canUpdate && !(kind === 'clientes' && row.numero_documento === '222222222222') && <EditBtn onClick={() => openEdit(row)} />}
            {kind === 'productos' && isAdmin && <><SyncBtn title="Aumentar existencias" onClick={() => { setStockOperation('add'); setStockTarget(row) }} /><DeductBtn title="Descontar existencias" onClick={() => { setStockOperation('subtract'); setStockTarget(row) }} /></>}
            {canUpdate && !(kind === 'clientes' && row.numero_documento === '222222222222') && <Toggle active={Boolean(row.estado)} onChange={() => setConfirm(row)} />}
          </div></td>
        </tr>)}
        {!shown.length && <tr><td colSpan={config.columns.length + 2} className="table-empty">No se encontraron {config.title.toLowerCase()} que coincidan con la búsqueda.</td></tr>}
        </tbody>
      </table>
    </div>
    <Pagination page={page} total={filtered.length} onPageChange={setPage} />
    <Modal open={modal === 'new' || modal === 'edit'} title={`${modal === 'new' ? 'Registrar' : 'Editar'} ${config.title.slice(0, -1).toLowerCase()}`} onClose={() => setModal('')} wide>
      <div className="form-grid">{config.fields.filter(field => !(kind === 'usuarios' && modal === 'edit' && field.key === 'contrasenia')).map(field => <Field key={field.key} label={field.label}>
        {field.type === 'select' ? <select className={`select ${errors[field.key] ? 'input-error' : ''}`} value={values[field.key] ?? ''} onChange={event => { setValues(prev => ({ ...prev, [field.key]: event.target.value })); setErrors(prev => ({ ...prev, [field.key]: '' })) }}>
          <option value="">Seleccione...</option>
          {(field.options ?? (field.key === 'id_rol' ? state.roles.filter(role => role.estado).map(role => ({ value: String(role.id_rol), label: role.nombre_rol })) : state.categorias.filter(category => category.estado).map(category => ({ value: String(category.id_categoria), label: category.nombre_categoria })))).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select> : <input className={`input ${errors[field.key] ? 'input-error' : ''}`} type={field.type ?? 'text'} maxLength={field.max} value={values[field.key] ?? ''} onChange={event => setValues(prev => ({ ...prev, [field.key]: event.target.value }))} />}
        {errors[field.key] && <small className="field-error">{errors[field.key]}</small>}
      </Field>)}</div>
      <div className="modal-actions"><button className="btn-secondary" onClick={() => setModal('')}>Cancelar</button><button className="btn-primary" onClick={save}>{modal === 'new' ? 'Registrar' : 'Guardar'}</button></div>
    </Modal>
    <Modal open={modal === 'detail'} title={`Detalle de ${config.title.slice(0, -1).toLowerCase()}`} onClose={() => setModal('')}>
      {selected && config.columns.map(([label, key]) => <div className="detail-row" key={key}><span>{label}</span><strong>{String(selected[key] ?? '—')}</strong></div>)}
    </Modal>
    <Modal open={modal === 'history'} title={kind === 'proveedores' ? 'Historial de compras' : 'Historial de ventas'} onClose={() => setModal('')} wide>
      {selected && kind === 'proveedores' && supplierHistory(state, Number(selected.id_proveedor)).map(({ compra, details }) => <div className="detail-row" key={compra.id_compra}><span>{formatId('C', compra.id_compra)} · {localDateFromTimestamp(compra.fecha_compra)} · {details.map(detail => productName(state, detail.id_producto)).join(', ')}</span><strong>{fmt(compra.total_compra)}</strong></div>)}
      {selected && kind === 'clientes' && clientHistory(state, String(selected.numero_documento)).map(({ venta, details }) => <div className="detail-row" key={venta.id_venta}><span>{formatId('V', venta.id_venta)} · {localDateFromTimestamp(venta.fecha_venta)} · {details.map(detail => productName(state, detail.id_producto)).join(', ')}</span><strong>{fmt(venta.total_pagar)}</strong></div>)}
      {selected && (kind === 'proveedores' ? !supplierHistory(state, Number(selected.id_proveedor)).length : !clientHistory(state, String(selected.numero_documento)).length) && <div className="table-empty">No hay movimientos registrados para este contacto.</div>}
    </Modal>
    <ConfirmModal open={!!confirm} title={kind === 'productos' ? '¿Cambiar estado del producto?' : kind === 'categorias' ? '¿Cambiar estado de la categoría?' : '¿Cambiar estado?'} message={kind === 'categorias' && confirm && rowsFor(state, 'categorias').some(row => row.id_categoria === confirm.id_categoria && state.productos.some(product => product.id_categoria === confirm.id_categoria && product.stock_disponible > 0)) ? 'Existen productos con inventario asociados a esta categoría.' : 'Esta acción cambiará la disponibilidad del registro.'} actionLabel="Cambiar estado" onCancel={() => setConfirm(null)} onConfirm={() => confirm && toggle(confirm)} />
    <Modal open={!!stockTarget} title="Actualizar existencias" onClose={() => setStockTarget(null)}>
      {stockTarget && <><p className="muted">{String(stockTarget.nombre)}. Este ajuste manual no modifica lotes.</p><select className="select" value={stockOperation} onChange={event => setStockOperation(event.target.value as 'add' | 'subtract')}><option value="add">Ingreso</option><option value="subtract">Egreso</option></select><Field label="Cantidad"><input className="input" type="number" min="0.01" value={stockQuantity} onChange={event => setStockQuantity(event.target.value)} /></Field><button className="btn-primary" onClick={stockApply}>Aplicar ajuste</button></>}
    </Modal>
  </section>
}

export function RolesPage() {
  const state = useStore()
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [highlightedId, setHighlightedId] = useState<number | null>(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [modal, setModal] = useState(false)
  const [role, setRole] = useState<AppState['roles'][number] | null>(null)
  const [name, setName] = useState('')
  const [selectedPerms, setSelectedPerms] = useState<Array<{ id_permiso: number; id_privilegio: number }>>([])
  const [confirm, setConfirm] = useState<number | null>(null)
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  useEffect(() => {
    if (highlightedId === null) return
    const timer = window.setTimeout(() => setHighlightedId(null), 3000)
    return () => window.clearTimeout(timer)
  }, [highlightedId])
  const open = (item?: AppState['roles'][number]) => {
    setRole(item ?? null); setName(item?.nombre_rol ?? '')
    setSelectedPerms(item ? state.roles_x_permisos.filter(p => p.id_rol === item.id_rol).map(({ id_permiso, id_privilegio }) => ({ id_permiso, id_privilegio })) : [])
    setFormErrors({})
    setModal(true)
  }
  const toggle = (id_permiso: number, id_privilegio: number) => {
    const exists = selectedPerms.some(row => row.id_permiso === id_permiso && row.id_privilegio === id_privilegio)
    const next = exists
      ? selectedPerms.filter(row => row.id_permiso !== id_permiso || row.id_privilegio !== id_privilegio)
      : [...selectedPerms, { id_permiso, id_privilegio }]
    setSelectedPerms(next)
    if (next.length) setFormErrors(errors => ({ ...errors, permissions: '' }))
  }
  const save = () => {
    const errors: Record<string, string> = {}
    if (!name.trim()) errors.name = 'Este campo es obligatorio'
    else if (!/^[\p{L}\p{N}\s.'-]+$/u.test(name.trim())) errors.name = 'No se permiten caracteres especiales'
    if (!selectedPerms.length) errors.permissions = 'Debe asignar al menos un permiso al rol.'
    if (state.roles.some(item => item.nombre_rol.toLowerCase() === name.trim().toLowerCase() && item.id_rol !== role?.id_rol)) {
      errors.name = 'El nombre de rol ingresado ya existe en la plataforma.'
    }
    if (Object.keys(errors).length) { setFormErrors(errors); return }
    try {
      const savedState = saveMaster(getState(), 'rol', { nombre_rol: name }, role?.id_rol, selectedPerms)
      updateStore(savedState)
      if (!role) {
        const createdRole = savedState.roles[savedState.roles.length - 1]
        setSearch('')
        setStatusFilter('')
        setPage(Math.floor((savedState.roles.length - 1) / 10) + 1)
        setHighlightedId(createdRole.id_rol)
      }
      toast('success', 'Rol guardado con éxito', 'Los permisos quedaron actualizados.')
      setModal(false)
    } catch (error) {
      toast('error', 'No se pudo guardar el rol', messageOf(error))
      if (error instanceof Error && error.message === 'Debe asignar al menos un permiso al rol.') setFormErrors(prev => ({ ...prev, permissions: error.message }))
      else if (error instanceof Error && error.message === 'El nombre de rol ingresado ya existe en la plataforma.') setFormErrors(prev => ({ ...prev, name: error.message }))
    }
  }
  const rows = state.roles.filter(row => row.nombre_rol.toLowerCase().includes(search.toLowerCase()) && (!statusFilter || String(row.estado) === statusFilter))
  const shown = rows.slice((page - 1) * 10, page * 10)
  return <section>
    <div className="page-toolbar"><SearchBar placeholder="Buscar por nombre de rol..." value={search} onChange={value => { setSearch(value); setPage(1) }} />
      <FilterPopover activeCount={statusFilter ? 1 : 0} onClear={() => { setStatusFilter(''); setPage(1) }}>
        <Field label="Estado"><select className="select" value={statusFilter} onChange={event => { setStatusFilter(event.target.value); setPage(1) }}><option value="">Todos los estados</option><option value="true">Activo</option><option value="false">Inactivo</option></select></Field>
      </FilterPopover>
      <button className="btn-primary" onClick={() => open()}><Ic d={P.plus} size={15} /> Registrar rol</button></div>
    <div className="card table-scroll"><table className="data-table"><thead><tr>{['Nombre', 'Usuarios', 'Permisos activos', 'Estado', 'Acciones'].map(item => <th key={item}>{item}</th>)}</tr></thead><tbody>
      {shown.map(item => { const count = state.roles_x_permisos.filter(p => p.id_rol === item.id_rol).length; return <tr key={item.id_rol} className={highlightedId === item.id_rol ? 'row-highlight' : undefined}><td data-label="Nombre"><strong>{item.nombre_rol}</strong></td><td data-label="Usuarios">{state.usuarios.filter(user => user.id_rol === item.id_rol).length}</td><td data-label="Permisos activos"><div className="progress"><span style={{ width: `${count / 16 * 100}%` }} /></div>{count}/16</td><td data-label="Estado"><span className={`badge ${item.estado ? 'badge-green' : 'badge-red'}`}>{item.estado ? 'Activo' : 'Inactivo'}</span></td><td data-label="Acciones"><div className="actions"><PermBtn title="Ver o editar permisos" onClick={() => open(item)} /><Toggle active={item.estado} onChange={() => setConfirm(item.id_rol)} /></div></td></tr> })}
      {!shown.length && <tr><td colSpan={5} className="table-empty">No se encontraron roles que coincidan con la búsqueda.</td></tr>}
    </tbody></table></div><Pagination page={page} total={rows.length} onPageChange={setPage} />
    <Modal open={modal} title={role ? `Editar rol: ${role.nombre_rol}` : 'Registrar rol'} onClose={() => setModal(false)} wide>
      <Field label="Nombre del rol"><input className={`input ${formErrors.name ? 'input-error' : ''}`} maxLength={30} value={name} onChange={e => { setName(e.target.value); setFormErrors(prev => ({ ...prev, name: '' })) }} />{formErrors.name && <small className="field-error">{formErrors.name}</small>}</Field>
      <div className={`permission-matrix ${formErrors.permissions ? 'matrix-error' : ''}`}><div className="matrix-row"><b>Módulo</b>{state.privilegios.map(item => <b key={item.id_privilegio}>{item.nombre_privilegio}</b>)}</div>{state.permisos.map(permission => <div className="matrix-row" key={permission.id_permiso}><strong>{permission.nombre_permiso}</strong>{state.privilegios.map(privilege => <label key={privilege.id_privilegio}><input type="checkbox" checked={selectedPerms.some(p => p.id_permiso === permission.id_permiso && p.id_privilegio === privilege.id_privilegio)} onChange={() => toggle(permission.id_permiso, privilege.id_privilegio)} /></label>)}</div>)}</div>{formErrors.permissions && <small className="field-error">{formErrors.permissions}</small>}
      <div className="modal-actions"><button className="btn-secondary" onClick={() => setModal(false)}>Cancelar</button><button className="btn-primary" onClick={save}>Guardar</button></div>
    </Modal>
    <ConfirmModal open={confirm !== null} title="¿Cambiar estado del rol?" message="El rol dejará de estar disponible para asignación." actionLabel="Cambiar estado" onCancel={() => setConfirm(null)} onConfirm={() => {
      try { updateStore(toggleMasterState(getState(), 'rol', confirm!)); toast('success', 'Estado actualizado', 'El estado del rol fue actualizado.') } catch (error) { toast('error', 'Error al cambiar estado', messageOf(error)) }
      setConfirm(null)
    }} />
  </section>
}

export function PurchasePage() {
  const state = useStore(); const toast = useToast()
  const user = state.usuarios.find(item => item.id_usuario === Number(sessionStorage.getItem('fresas-user-id')))
  const canCreate = user?.id_rol === 1 || hasPermission(state, user?.id_rol ?? -1, 'Compras', 'Crear')
  const canDelete = user?.id_rol === 1 || hasPermission(state, user?.id_rol ?? -1, 'Compras', 'Eliminar')
  const [open, setOpen] = useState(false); const [query, setQuery] = useState(''); const [page, setPage] = useState(1); const [cancelId, setCancelId] = useState<number | null>(null)
  const [purchaseFilters, setPurchaseFilters] = useState({ supplier: '', status: '', from: '', to: '' })
  const [supplier, setSupplier] = useState(''); const [date, setDate] = useState(localDateString()); const [observations, setObservations] = useState('')
  const [lines, setLines] = useState<PurchaseLineDraft[]>([]); const [discountMode, setDiscountMode] = useState<ChargeMode>('$')
  const [discountValue, setDiscountValue] = useState(''); const [ivaMode, setIvaMode] = useState<ChargeMode>('%'); const [ivaValue, setIvaValue] = useState('')
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [detailPurchaseId, setDetailPurchaseId] = useState<number | null>(null)
  const [associatePurchaseId, setAssociatePurchaseId] = useState<number | null>(null)
  const [associateDetailId, setAssociateDetailId] = useState(''); const [associateLotNumber, setAssociateLotNumber] = useState('')
  const [associateExpiry, setAssociateExpiry] = useState(''); const [associatePack, setAssociatePack] = useState<TipoEmpaque>('Bulto')
  const [associateZone, setAssociateZone] = useState(''); const [associateErrors, setAssociateErrors] = useState<Record<string, string>>({})
  const setPurchaseFilter = (key: keyof typeof purchaseFilters, value: string) => {
    setPurchaseFilters(current => ({ ...current, [key]: value }))
    setPage(1)
  }
  const clearPurchaseFilters = () => {
    setPurchaseFilters({ supplier: '', status: '', from: '', to: '' })
    setPage(1)
  }
  const purchaseFilterCount = Object.values(purchaseFilters).filter(Boolean).length
  const purchases = state.compras.filter(row => {
    const text = `${row.id_compra} ${state.proveedores.find(provider => provider.id_proveedor === row.id_proveedor)?.nombre_proveedor ?? ''}`.toLowerCase()
    return text.includes(query.toLowerCase())
      && (!purchaseFilters.supplier || String(row.id_proveedor) === purchaseFilters.supplier)
      && (!purchaseFilters.status || String(row.estado) === purchaseFilters.status)
      && dateInRange(row.fecha_compra, purchaseFilters.from, purchaseFilters.to)
  }).sort((a, b) => b.id_compra - a.id_compra)
  const lineQuantityKg = (line: PurchaseLineDraft) => convertedKg(line.cantidad, line.unidad)
  const lineSubtotal = (line: PurchaseLineDraft) => (lineQuantityKg(line) ?? 0) * (Number(line.precio) || 0)
  const subtotal = lines.reduce((sum, line) => sum + lineSubtotal(line), 0)
  const discount = chargeAmount(subtotal, discountValue, discountMode)
  const iva = chargeAmount(Math.max(0, subtotal - discount), ivaValue, ivaMode)
  const total = roundMoney(subtotal - discount + iva)
  const clearError = (key: string) => setFormErrors(previous => ({ ...previous, [key]: '' }))
  const openNewPurchase = () => {
    setSupplier('')
    setDate(localDateString())
    setObservations('')
    setLines([newPurchaseLine(state)])
    setDiscountMode('$')
    setDiscountValue('')
    setIvaMode('%')
    setIvaValue('')
    setFormErrors({})
    setOpen(true)
  }
  const patchLine = (key: string, patch: Partial<PurchaseLineDraft>) => {
    setLines(current => current.map(line => line.key === key ? { ...line, ...patch } : line))
  }
  const save = () => {
    const errors: Record<string, string> = {}
    if (!supplier) errors.supplier = 'Seleccione un proveedor.'
    if (!date) errors.date = 'Este campo es obligatorio'
    if (!lines.length) errors.lines = 'Debe agregar al menos un producto a la orden de compra.'
    const lotNames = new Set<string>()
    for (const line of lines) {
      const product = state.productos.find(row => row.id_producto === Number(line.id_producto) && row.estado)
      if (!product) errors[`${line.key}:product`] = 'Seleccione un producto activo.'
      const quantityError = convertedKgError(line.cantidad, line.unidad)
      if (quantityError) errors[`${line.key}:quantity`] = quantityError
      if (!line.precio.trim() || !Number.isFinite(Number(line.precio)) || Number(line.precio) < 0) errors[`${line.key}:price`] = 'Ingrese un precio válido.'
      if (line.conLote) {
        const lotNumber = line.numero_lote.trim()
        if (!lotNumber) errors[`${line.key}:lot`] = 'Este campo es obligatorio'
        else if (lotNames.has(lotNumber) || state.lotes.some(row => row.numero_lote === lotNumber)) errors[`${line.key}:lot`] = 'El número de lote ingresado ya se encuentra registrado.'
        lotNames.add(lotNumber)
        if (!line.fecha_vencimiento) errors[`${line.key}:expiry`] = 'Este campo es obligatorio'
        else if (line.fecha_vencimiento < date) errors[`${line.key}:expiry`] = 'El vencimiento debe ser posterior o igual a la fecha de compra.'
      }
    }
    if (discountValue && (!Number.isFinite(Number(discountValue)) || Number(discountValue) < 0)) errors.discount = 'Ingrese un descuento válido.'
    else if (discount > subtotal) errors.discount = 'El descuento no puede superar el subtotal.'
    if (ivaValue && (!Number.isFinite(Number(ivaValue)) || Number(ivaValue) < 0)) errors.iva = 'Ingrese un IVA válido.'
    if (Object.keys(errors).length) { setFormErrors(errors); return }
    try {
      const savedState = createPurchase(getState(), {
        id_proveedor: Number(supplier), id_usuario: Number(sessionStorage.getItem('fresas-user-id')), fecha: date,
        observaciones: observations.trim() || undefined, iva, descuento: discount,
        lines: lines.map(line => {
          const product = state.productos.find(row => row.id_producto === Number(line.id_producto))!
          return {
            id_producto: product.id_producto,
            cantidad_kg: lineQuantityKg(line)!,
            precio_unitario: Number(line.precio),
            ...(line.conLote ? { lote: {
              numero_lote: line.numero_lote.trim(), fecha_vencimiento: line.fecha_vencimiento,
              tipo_empaque: line.tipo_empaque, zona_ubicacion: line.zona_ubicacion.trim(),
              es_transformable: product.tipo_producto === 'Fresca',
            } } : {}),
          }
        }),
      })
      updateStore(savedState)
      const purchase = savedState.compras[savedState.compras.length - 1]
      const lotNames = lines.filter(line => line.conLote).map(line => line.numero_lote.trim())
      toast('success', `Compra ${formatId('C', purchase.id_compra)} registrada`, `Lotes: ${lotNames.length ? lotNames.join(', ') : 'Sin lote'}`)
      setPage(1)
      setOpen(false)
      setFormErrors({})
    } catch (error) {
      const message = messageOf(error)
      if (message.includes('descuento')) setFormErrors(previous => ({ ...previous, discount: message }))
      else if (message.includes('IVA')) setFormErrors(previous => ({ ...previous, iva: message }))
      else toast('error', 'No se pudo registrar la compra', message)
    }
  }
  const beginAssociateLot = (purchaseId: number) => {
    const missing = state.detalle_compra.filter(detail => detail.id_compra === purchaseId && !state.lotes.some(lot => lot.id_detalle_compra === detail.id_detalle_compra))
    setAssociatePurchaseId(purchaseId)
    setAssociateDetailId(String(missing[0]?.id_detalle_compra ?? ''))
    setAssociateLotNumber(suggestedLotNumber(state))
    setAssociateExpiry('')
    setAssociatePack('Bulto')
    setAssociateZone('')
    setAssociateErrors({})
  }
  const saveAssociatedLot = () => {
    const errors: Record<string, string> = {}
    const detail = state.detalle_compra.find(row => row.id_detalle_compra === Number(associateDetailId))
    const purchase = state.compras.find(row => row.id_compra === associatePurchaseId)
    if (!detail) errors.detail = 'Seleccione una línea sin lote.'
    if (!associateLotNumber.trim()) errors.number = 'Este campo es obligatorio'
    else if (state.lotes.some(row => row.numero_lote === associateLotNumber.trim())) errors.number = 'El número de lote ingresado ya se encuentra registrado.'
    if (!associateExpiry) errors.expiry = 'Este campo es obligatorio'
    else if (purchase && associateExpiry < localDateFromTimestamp(purchase.fecha_compra)) errors.expiry = 'El vencimiento debe ser posterior o igual a la fecha de compra.'
    if (Object.keys(errors).length) { setAssociateErrors(errors); return }
    try {
      const product = state.productos.find(row => row.id_producto === detail!.id_producto)!
      updateStore(associateLot(getState(), detail!.id_detalle_compra, associateLotNumber.trim(), associateExpiry, associatePack, associateZone.trim(), product.tipo_producto === 'Fresca'))
      toast('success', 'Lote asociado', 'El inventario ya cuenta con un lote registrado.')
      setPage(1)
      setAssociatePurchaseId(null)
    } catch (error) { toast('error', 'No se pudo asociar el lote', messageOf(error)) }
  }
  return <section>
    <div className="page-toolbar"><SearchBar placeholder="Buscar por compra o proveedor..." value={query} onChange={value => { setQuery(value); setPage(1) }} />
      <FilterPopover activeCount={purchaseFilterCount} onClear={clearPurchaseFilters}>
        <Field label="Proveedor"><select className="select" value={purchaseFilters.supplier} onChange={event => setPurchaseFilter('supplier', event.target.value)}><option value="">Todos los proveedores</option>{state.proveedores.map(provider => <option key={provider.id_proveedor} value={provider.id_proveedor}>{provider.nombre_proveedor}</option>)}</select></Field>
        <Field label="Estado"><select className="select" value={purchaseFilters.status} onChange={event => setPurchaseFilter('status', event.target.value)}><option value="">Todos los estados</option><option value="true">Activas</option><option value="false">Anuladas</option></select></Field>
        <div className="filter-date-range"><Field label="Desde"><input className="input" type="date" value={purchaseFilters.from} onChange={event => setPurchaseFilter('from', event.target.value)} /></Field><Field label="Hasta"><input className="input" type="date" value={purchaseFilters.to} onChange={event => setPurchaseFilter('to', event.target.value)} /></Field></div>
      </FilterPopover>
      {canCreate && <button className="btn-primary" onClick={openNewPurchase}><Ic d={P.plus} size={15} /> Registrar compra</button>}</div>
    <div className="card table-scroll"><table className="data-table"><thead><tr><th>Compra</th><th>Fecha</th><th>Proveedor</th><th>Lote(s)</th><th>Productos</th><th>Total</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
      {purchases.slice((page - 1) * 10, page * 10).map(row => {
        const details = state.detalle_compra.filter(detail => detail.id_compra === row.id_compra)
        const hasMissingLot = details.some(detail => !state.lotes.some(lot => lot.id_detalle_compra === detail.id_detalle_compra))
        const purchaseLots = details.flatMap(detail => state.lotes.filter(lot => lot.id_detalle_compra === detail.id_detalle_compra))
        return (
          <tr key={row.id_compra}>
            <td data-label="Compra">{formatId('C', row.id_compra)}</td>
            <td data-label="Fecha">{localDateFromTimestamp(row.fecha_compra)}</td>
            <td data-label="Proveedor">{state.proveedores.find(provider => provider.id_proveedor === row.id_proveedor)?.nombre_proveedor}</td>
            <td data-label="Lote(s)">
              {purchaseLots.map(lot => <span className="badge badge-blue" key={lot.id_lote}>{lot.numero_lote}</span>)}
              {hasMissingLot && <span className="badge badge-amber">Sin lote</span>}
            </td>
            <td data-label="Productos">{details.map(detail => `${productName(state, detail.id_producto)} (${quantityLabel(detail.cantidad)} ${detail.unidad_medida})`).join(', ')}</td>
            <td data-label="Total">{fmt(row.total_compra)}</td>
            <td data-label="Estado"><span className={`badge ${row.estado ? 'badge-green' : 'badge-red'}`}>{row.estado ? 'Activa' : 'Anulada'}</span></td>
            <td data-label="Acciones"><div className="actions">
              <ViewBtn title="Ver detalle de compra" onClick={() => setDetailPurchaseId(row.id_compra)} />
              {hasMissingLot && row.estado && <LoteBtn title="Asociar lote" onClick={() => beginAssociateLot(row.id_compra)} />}
              {canDelete && row.estado && <TrashBtn title="Anular compra" onClick={() => setCancelId(row.id_compra)} />}
            </div></td>
          </tr>
        )
      })}
      {!purchases.length && <tr><td colSpan={8} className="table-empty">No se encontraron compras que coincidan con la búsqueda.</td></tr>}
    </tbody></table></div><Pagination page={page} total={purchases.length} onPageChange={setPage} />
    <Modal open={open} title="Registrar compra" onClose={() => setOpen(false)} wide>
      <div className="form-grid">
        <Field label="Proveedor"><select className={`select ${formErrors.supplier ? 'input-error' : ''}`} value={supplier} onChange={event => { setSupplier(event.target.value); clearError('supplier') }}><option value="">Seleccione...</option>{state.proveedores.filter(row => row.estado).map(row => <option key={row.id_proveedor} value={row.id_proveedor}>{row.nombre_proveedor}</option>)}</select>{formErrors.supplier && <small className="field-error">{formErrors.supplier}</small>}</Field>
        <Field label="Fecha"><input className={`input ${formErrors.date ? 'input-error' : ''}`} type="date" value={date} onChange={event => { setDate(event.target.value); clearError('date') }} />{formErrors.date && <small className="field-error">{formErrors.date}</small>}</Field>
      </div>
      <Field label="Observaciones"><textarea className="input" maxLength={200} value={observations} onChange={event => setObservations(event.target.value)} /></Field>
      <div className="purchase-lines">
        {lines.map((line, index) => {
          const productOptions = state.productos.filter(product => product.estado)
          return <div className="purchase-line-card" key={line.key}>
            <div className="purchase-line-heading"><strong>Producto {index + 1}</strong><button className="btn-ghost" type="button" onClick={() => setLines(current => current.filter(item => item.key !== line.key))}>Quitar</button></div>
            <div className="form-grid">
              <Field label="Producto"><select className={`select ${formErrors[`${line.key}:product`] ? 'input-error' : ''}`} value={line.id_producto} onChange={event => {
                const product = state.productos.find(item => item.id_producto === Number(event.target.value))
                patchLine(line.key, {
                  id_producto: event.target.value,
                  precio: product ? String(product.precio_compra) : '',
                  fecha_vencimiento: product?.tipo_producto === 'Fresca' ? daysAfter(date, 7) : '',
                })
                setFormErrors(previous => ({ ...previous, [`${line.key}:product`]: '' }))
              }}><option value="">Seleccione...</option>{productOptions.map(product => <option key={product.id_producto} value={product.id_producto}>{productName(state, product.id_producto)}</option>)}</select>{formErrors[`${line.key}:product`] && <small className="field-error">{formErrors[`${line.key}:product`]}</small>}</Field>
              <Field label="Cantidad"><div className="quantity-input"><input className={`input ${formErrors[`${line.key}:quantity`] ? 'input-error' : ''}`} type="number" min="0.01" step="any" value={line.cantidad} onChange={event => { patchLine(line.key, { cantidad: event.target.value }); setFormErrors(previous => ({ ...previous, [`${line.key}:quantity`]: '' })) }} /><select className="select" value={line.unidad} onChange={event => patchLine(line.key, { unidad: event.target.value as 'kg' | 'g' })}><option>kg</option><option>g</option></select></div>{formErrors[`${line.key}:quantity`] && <small className="field-error">{formErrors[`${line.key}:quantity`]}</small>}{lineQuantityKg(line) !== null && <small className="muted">= {quantityLabel(lineQuantityKg(line)!)} kg</small>}</Field>
              <Field label="Precio unitario por kg"><input className={`input ${formErrors[`${line.key}:price`] ? 'input-error' : ''}`} type="number" min="0" step="0.01" value={line.precio} onChange={event => { patchLine(line.key, { precio: event.target.value }); setFormErrors(previous => ({ ...previous, [`${line.key}:price`]: '' })) }} />{formErrors[`${line.key}:price`] && <small className="field-error">{formErrors[`${line.key}:price`]}</small>}</Field>
              <div className="purchase-line-subtotal"><span>Subtotal de línea</span><strong>{fmt(lineSubtotal(line))}</strong></div>
            </div>
            <div className="purchase-lot-section">
              <div className="purchase-lot-heading"><strong>Lote</strong><label className="check-label"><input type="checkbox" checked={line.conLote} onChange={event => patchLine(line.key, { conLote: event.target.checked })} /> Registrar lote</label></div>
              {line.conLote ? <div className="form-grid">
                <Field label="Número sugerido"><input className={`input ${formErrors[`${line.key}:lot`] ? 'input-error' : ''}`} value={line.numero_lote} onChange={event => { patchLine(line.key, { numero_lote: event.target.value }); setFormErrors(previous => ({ ...previous, [`${line.key}:lot`]: '' })) }} />{formErrors[`${line.key}:lot`] && <small className="field-error">{formErrors[`${line.key}:lot`]}</small>}</Field>
                <Field label="Vencimiento"><input className={`input ${formErrors[`${line.key}:expiry`] ? 'input-error' : ''}`} type="date" min={date} value={line.fecha_vencimiento} onChange={event => { patchLine(line.key, { fecha_vencimiento: event.target.value }); setFormErrors(previous => ({ ...previous, [`${line.key}:expiry`]: '' })) }} />{formErrors[`${line.key}:expiry`] && <small className="field-error">{formErrors[`${line.key}:expiry`]}</small>}</Field>
                <Field label="Empaque"><select className="select" value={line.tipo_empaque} onChange={event => patchLine(line.key, { tipo_empaque: event.target.value as TipoEmpaque })}><option>Bulto</option><option>Caja</option><option>Bolsa</option></select></Field>
                <Field label="Zona"><input className="input" maxLength={40} value={line.zona_ubicacion} onChange={event => patchLine(line.key, { zona_ubicacion: event.target.value })} /></Field>
              </div> : <p className="muted">Esta línea quedará Sin lote.</p>}
            </div>
          </div>
        })}
        <button className="btn-secondary" type="button" onClick={() => setLines(current => [...current, newPurchaseLine(state, current.map(line => line.numero_lote))])}><Ic d={P.plus} size={15} /> Agregar producto</button>
        {formErrors.lines && <small className="field-error">{formErrors.lines}</small>}
      </div>
      <div className="purchase-summary">
        <div className="detail-row"><span>Subtotal</span><strong>{fmt(subtotal)}</strong></div>
        <div className="charge-row"><Field label="Descuento"><div className="charge-controls"><select className="select" value={discountMode} onChange={event => setDiscountMode(event.target.value as ChargeMode)}><option>%</option><option>$</option></select><input className={`input ${formErrors.discount ? 'input-error' : ''}`} type="number" min="0" step="0.01" value={discountValue} onChange={event => { setDiscountValue(event.target.value); clearError('discount') }} /></div>{formErrors.discount && <small className="field-error">{formErrors.discount}</small>}</Field><strong>{fmt(discount)}</strong></div>
        <div className="charge-row"><Field label="IVA sobre el neto"><div className="charge-controls"><select className="select" value={ivaMode} onChange={event => setIvaMode(event.target.value as ChargeMode)}><option>%</option><option>$</option></select><input className={`input ${formErrors.iva ? 'input-error' : ''}`} type="number" min="0" step="0.01" value={ivaValue} onChange={event => { setIvaValue(event.target.value); clearError('iva') }} /></div>{formErrors.iva && <small className="field-error">{formErrors.iva}</small>}</Field><strong>{fmt(iva)}</strong></div>
        <div className="detail-row total-row"><span>Total</span><strong>{fmt(total)}</strong></div>
      </div>
      <div className="modal-actions"><button className="btn-secondary" onClick={() => setOpen(false)}>Cancelar</button><button className="btn-primary" onClick={save}>Registrar compra</button></div>
    </Modal>
    {detailPurchaseId !== null && (() => {
      const purchase = state.compras.find(row => row.id_compra === detailPurchaseId)
      const details = state.detalle_compra.filter(row => row.id_compra === detailPurchaseId)
      const purchaseSubtotal = details.reduce((sum, detail) => sum + detail.cantidad * detail.precio_unitario, 0)
      return <Modal open={!!purchase} title={`Detalle de compra ${formatId('C', detailPurchaseId)}`} onClose={() => setDetailPurchaseId(null)} wide>
        {details.map(detail => <div className="detail-row" key={detail.id_detalle_compra}><span>{productName(state, detail.id_producto)} · {quantityLabel(detail.cantidad)} kg · {state.lotes.find(lot => lot.id_detalle_compra === detail.id_detalle_compra)?.numero_lote ?? 'Sin lote'}</span><strong>{fmt(detail.cantidad * detail.precio_unitario)}</strong></div>)}
        <div className="detail-row"><span>Subtotal</span><strong>{fmt(purchaseSubtotal)}</strong></div>
        <div className="detail-row"><span>Descuento</span><strong>{fmt(purchase?.descuento ?? 0)}</strong></div>
        <div className="detail-row"><span>IVA</span><strong>{fmt(purchase?.iva ?? 0)}</strong></div>
        <div className="detail-row total-row"><span>Total</span><strong>{fmt(purchase?.total_compra ?? 0)}</strong></div>
      </Modal>
    })()}
    <Modal open={associatePurchaseId !== null} title="Asociar lote" onClose={() => setAssociatePurchaseId(null)}>
      {associatePurchaseId !== null && <><Field label="Producto de la compra"><select className={`select ${associateErrors.detail ? 'input-error' : ''}`} value={associateDetailId} onChange={event => { setAssociateDetailId(event.target.value); setAssociateErrors(previous => ({ ...previous, detail: '' })) }}>{state.detalle_compra.filter(detail => detail.id_compra === associatePurchaseId && !state.lotes.some(lot => lot.id_detalle_compra === detail.id_detalle_compra)).map(detail => <option key={detail.id_detalle_compra} value={detail.id_detalle_compra}>{productName(state, detail.id_producto)} · {quantityLabel(detail.cantidad)} kg</option>)}</select>{associateErrors.detail && <small className="field-error">{associateErrors.detail}</small>}</Field>
        <Field label="Número sugerido"><input className={`input ${associateErrors.number ? 'input-error' : ''}`} value={associateLotNumber} onChange={event => setAssociateLotNumber(event.target.value)} />{associateErrors.number && <small className="field-error">{associateErrors.number}</small>}</Field>
        <Field label="Vencimiento"><input className={`input ${associateErrors.expiry ? 'input-error' : ''}`} type="date" value={associateExpiry} onChange={event => setAssociateExpiry(event.target.value)} />{associateErrors.expiry && <small className="field-error">{associateErrors.expiry}</small>}</Field>
        <Field label="Empaque"><select className="select" value={associatePack} onChange={event => setAssociatePack(event.target.value as TipoEmpaque)}><option>Bulto</option><option>Caja</option><option>Bolsa</option></select></Field>
        <Field label="Zona"><input className="input" value={associateZone} onChange={event => setAssociateZone(event.target.value)} /></Field>
        <div className="modal-actions"><button className="btn-secondary" onClick={() => setAssociatePurchaseId(null)}>Cancelar</button><button className="btn-primary" onClick={saveAssociatedLot}>Asociar lote</button></div></>}
    </Modal>
    <ConfirmModal open={cancelId !== null} title="¿Anular compra?" message="La compra solo se anula si su lote no tiene movimientos." actionLabel="Anular compra" onCancel={() => setCancelId(null)} onConfirm={() => { try { updateStore(cancelPurchase(getState(), cancelId!)); toast('success', 'Compra anulada', 'La compra fue anulada correctamente.') } catch (error) { toast('error', 'Error al anular la compra', messageOf(error)) } setCancelId(null) }} />
  </section>
}

export function ProductionPage() {
  const state = useStore(); const toast = useToast()
  const user = state.usuarios.find(item => item.id_usuario === Number(sessionStorage.getItem('fresas-user-id')))
  const canCreate = user?.id_rol === 1 || hasPermission(state, user?.id_rol ?? -1, 'Produccion', 'Crear')
  const [open, setOpen] = useState(false); const [lotId, setLotId] = useState(() => sessionStorage.getItem('fresas-production-lot') ?? '')
  const [quantity, setQuantity] = useState(''); const [quantityUnit, setQuantityUnit] = useState<'kg' | 'g'>('kg')
  const [loss, setLoss] = useState(''); const [lossUnit, setLossUnit] = useState<'kg' | 'g'>('kg')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState({ from: '', to: '', operator: '' })
  const setProductionFilter = (key: keyof typeof filters, value: string) => { setFilters(current => ({ ...current, [key]: value })); setPage(1) }
  const clearProductionFilters = () => { setFilters({ from: '', to: '', operator: '' }); setPage(1) }
  const lots = stockByLot(state).filter(lot => lot.estado && lot.es_transformable && lot.fecha_vencimiento >= localDateString() && lot.cantidad_disponible > 0 && lot.detail && state.productos.find(p => p.id_producto === lot.detail?.id_producto)?.tipo_producto === 'Fresca')
  const selectedLot = lots.find(lot => lot.id_lote === Number(lotId))
  const sourceProduct = selectedLot?.detail && state.productos.find(product => product.id_producto === selectedLot.detail?.id_producto)
  const outputProduct = sourceProduct && state.productos.find(product => product.estado && product.tipo_producto === 'Congelada' && product.id_categoria === sourceProduct.id_categoria)
  const productionRows = state.produccion.filter(row => {
    const lotName = state.lotes.find(lot => lot.id_lote === row.id_lote)?.numero_lote ?? ''
    const operator = state.usuarios.find(item => item.id_usuario === row.id_usuario)
    const text = `${formatId('OP', row.id_produccion)} ${lotName} ${operator?.nombre ?? ''} ${operator?.apellido ?? ''}`.toLowerCase()
    return text.includes(query.toLowerCase())
      && (!filters.operator || String(row.id_usuario) === filters.operator)
      && dateInRange(row.fecha_produccion, filters.from, filters.to)
  }).sort((a, b) => b.id_produccion - a.id_produccion)
  const quantityKg = convertedKg(quantity, quantityUnit)
  const lossKg = convertedKg(loss, lossUnit, undefined, true)
  const obtainedKg = quantityKg !== null && lossKg !== null && lossKg < quantityKg ? roundMoney(quantityKg - lossKg) : null
  const yieldPercent = quantityKg && obtainedKg !== null ? obtainedKg / quantityKg * 100 : null
  useEffect(() => {
    const preselected = sessionStorage.getItem('fresas-production-lot')
    if (preselected) {
      setLotId(preselected)
      setOpen(true)
      sessionStorage.removeItem('fresas-production-lot')
    }
  }, [])
  const run = () => {
    const nextErrors: Record<string, string> = {}
    if (!selectedLot) nextErrors.lot = 'Seleccione un lote activo y no vencido.'
    const processedError = convertedKgError(quantity, quantityUnit)
    if (processedError) nextErrors.quantity = processedError
    const lossError = convertedKgError(loss, lossUnit, undefined, true)
    if (lossError) nextErrors.loss = lossError
    if (quantityKg !== null && lossKg !== null && lossKg >= quantityKg) nextErrors.loss = 'La merma debe ser menor a la cantidad procesada.'
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); return }
    try {
      updateStore(createProduction(getState(), {
        id_usuario: Number(sessionStorage.getItem('fresas-user-id')), id_lote: Number(lotId),
        cantidad_procesada: quantityKg!, merma: lossKg!, fecha_produccion: localTimestampString(),
      }))
      toast('success', 'Producción registrada con éxito', 'El stock fresco y congelado fue actualizado.')
      setPage(1)
      setOpen(false)
      setQuantity(''); setLoss(''); setErrors({})
    } catch (error) { toast('error', 'No se pudo registrar la producción', messageOf(error)) }
  }
  return <section><div className="page-toolbar"><SearchBar placeholder="Buscar orden, lote u operario..." value={query} onChange={value => { setQuery(value); setPage(1) }} />
      <FilterPopover activeCount={Object.values(filters).filter(Boolean).length} onClear={clearProductionFilters}>
        <div className="filter-date-range"><Field label="Desde"><input className="input" type="date" value={filters.from} onChange={event => setProductionFilter('from', event.target.value)} /></Field><Field label="Hasta"><input className="input" type="date" value={filters.to} onChange={event => setProductionFilter('to', event.target.value)} /></Field></div>
        <Field label="Operario"><select className="select" value={filters.operator} onChange={event => setProductionFilter('operator', event.target.value)}><option value="">Todos los operarios</option>{state.usuarios.map(operator => <option key={operator.id_usuario} value={operator.id_usuario}>{operator.nombre} {operator.apellido}</option>)}</select></Field>
      </FilterPopover>
      <span className="muted">Órdenes de transformación de fresco a congelado.</span>{canCreate && <button className="btn-primary" onClick={() => { setLotId(String(lots[0]?.id_lote ?? '')); setQuantity(''); setLoss(''); setErrors({}); setOpen(true) }}><Ic d={P.plus} size={15} /> Nueva orden de producción</button>}</div>
    <div className="card table-scroll"><table className="data-table"><thead><tr><th>Orden</th><th>Fecha</th><th>Lote origen</th><th>Procesado</th><th>Merma</th><th>Obtenido</th><th>Rendimiento</th></tr></thead><tbody>{productionRows.slice((page - 1) * 10, page * 10).map(row => <tr key={row.id_produccion}><td data-label="Orden">{formatId('OP', row.id_produccion)}</td><td data-label="Fecha">{localDateFromTimestamp(row.fecha_produccion)}</td><td data-label="Lote origen">{state.lotes.find(l => l.id_lote === row.id_lote)?.numero_lote}</td><td data-label="Procesado">{quantityLabel(row.cantidad_procesada)} {row.unidad_medida}</td><td data-label="Merma">{quantityLabel(row.merma)}</td><td data-label="Obtenido">{state.detalle_produccion.filter(d => d.id_produccion === row.id_produccion).map(d => `${quantityLabel(d.cantidad_obtenida)} kg`).join(', ')}</td><td data-label="Rendimiento">{((state.detalle_produccion.filter(d => d.id_produccion === row.id_produccion).reduce((s, d) => s + d.cantidad_obtenida, 0) / row.cantidad_procesada) * 100).toFixed(1)}%</td></tr>)}{!productionRows.length && <tr><td colSpan={7} className="table-empty">No se encontraron órdenes de producción que coincidan con la búsqueda.</td></tr>}</tbody></table></div><Pagination page={page} total={productionRows.length} onPageChange={setPage} />
    <Modal open={open} title="Nueva orden de producción" onClose={() => setOpen(false)} wide>
      <Field label="Lote de origen"><select className={`select ${errors.lot ? 'input-error' : ''}`} value={lotId} onChange={event => { setLotId(event.target.value); setErrors(previous => ({ ...previous, lot: '' })) }}><option value="">Seleccione...</option>{lots.map(row => <option key={row.id_lote} value={row.id_lote}>{row.numero_lote} · {quantityLabel(row.cantidad_disponible)} kg disponibles</option>)}</select>{errors.lot && <small className="field-error">{errors.lot}</small>}</Field>
      <div className="form-grid">
        <Field label="Cantidad procesada"><div className="quantity-input"><input className={`input ${errors.quantity ? 'input-error' : ''}`} type="number" min="0" step="any" value={quantity} onChange={event => { setQuantity(event.target.value); setErrors(previous => ({ ...previous, quantity: '' })) }} /><select className="select" value={quantityUnit} onChange={event => setQuantityUnit(event.target.value as 'kg' | 'g')}><option>kg</option><option>g</option></select></div>{errors.quantity && <small className="field-error">{errors.quantity}</small>}{quantityKg !== null && <small className="muted">= {quantityLabel(quantityKg)} kg</small>}</Field>
        <Field label="Merma"><div className="quantity-input"><input className={`input ${errors.loss ? 'input-error' : ''}`} type="number" min="0" step="any" value={loss} onChange={event => { setLoss(event.target.value); setErrors(previous => ({ ...previous, loss: '' })) }} /><select className="select" value={lossUnit} onChange={event => setLossUnit(event.target.value as 'kg' | 'g')}><option>kg</option><option>g</option></select></div>{errors.loss && <small className="field-error">{errors.loss}</small>}{lossKg !== null && <small className="muted">= {quantityLabel(lossKg)} kg</small>}</Field>
      </div>
      <div className="production-preview card">
        <div><span>Producto resultante</span><strong>{outputProduct ? productName(state, outputProduct.id_producto) : 'No hay producto congelado activo para este calibre.'}</strong></div>
        <div><span>Obtenido</span><strong>{obtainedKg === null ? '—' : `${quantityLabel(obtainedKg)} kg`}</strong></div>
        <div><span>Rendimiento</span><strong>{yieldPercent === null ? '—' : `${yieldPercent.toFixed(1)}%`}</strong></div>
      </div>
      <div className="modal-actions"><button className="btn-secondary" onClick={() => setOpen(false)}>Cancelar</button><button className="btn-primary" onClick={run}>Confirmar orden</button></div>
    </Modal>
  </section>
}

export function SalePage() {
  const state = useStore(); const toast = useToast()
  const user = state.usuarios.find(item => item.id_usuario === Number(sessionStorage.getItem('fresas-user-id')))
  const canCreate = user?.id_rol === 1 || hasPermission(state, user?.id_rol ?? -1, 'Ventas', 'Crear')
  const canDelete = user?.id_rol === 1 || hasPermission(state, user?.id_rol ?? -1, 'Ventas', 'Eliminar')
  const [tab, setTab] = useState<'pos' | 'history'>('pos')
  const [selectedType, setSelectedType] = useState<TipoProducto | ''>('')
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null)
  const [quantity, setQuantity] = useState(''); const [unit, setUnit] = useState<Unidad>('kg'); const [kgPerUnit, setKgPerUnit] = useState('')
  const [cart, setCart] = useState<SaleCartLine[]>([])
  const [customer, setCustomer] = useState('222222222222'); const [type, setType] = useState<TipoVenta>('Detal')
  const [discountMode, setDiscountMode] = useState<ChargeMode>('$'); const [discountValue, setDiscountValue] = useState('')
  const [ivaMode, setIvaMode] = useState<ChargeMode>('%'); const [ivaValue, setIvaValue] = useState('')
  const [paymentMode, setPaymentMode] = useState<'Efectivo' | 'Transferencia' | 'Mixto'>('Efectivo')
  const [cashAmount, setCashAmount] = useState(''); const [transferAmount, setTransferAmount] = useState('')
  const [cashTouched, setCashTouched] = useState(false); const [transferTouched, setTransferTouched] = useState(false)
  const [saleErrors, setSaleErrors] = useState<Record<string, string>>({})
  const [selectedSaleId, setSelectedSaleId] = useState<number | null>(null)
  const [cancelId, setCancelId] = useState<number | null>(null); const [cancelReason, setCancelReason] = useState('')
  const [cancelReasonError, setCancelReasonError] = useState('')
  const [page, setPage] = useState(1)
  const [historyQuery, setHistoryQuery] = useState('')
  const [historyFilters, setHistoryFilters] = useState({ saleType: '', method: '', status: '', from: '', to: '' })
  const setHistoryFilter = (key: keyof typeof historyFilters, value: string) => { setHistoryFilters(current => ({ ...current, [key]: value })); setPage(1) }
  const clearHistoryFilters = () => { setHistoryFilters({ saleType: '', method: '', status: '', from: '', to: '' }); setPage(1) }
  const categories = state.categorias.filter(category => category.estado)
  const selectedCategory = categories.find(category => category.id_categoria === selectedCategoryId)
  const selectedProduct = selectedType && selectedCategory
    ? state.productos.find(product => product.estado && product.tipo_producto === selectedType && product.id_categoria === selectedCategory.id_categoria)
    : undefined
  const enteredKg = convertedKg(quantity, unit, kgPerUnit)
  const unitError = convertedKgError(quantity, unit, kgPerUnit)
  const priceOf = (product: AppState['productos'][number]) => type === 'Detal' ? product.precio_venta_detal : product.precio_venta_mayorista
  const selectedPrice = selectedProduct ? priceOf(selectedProduct) : 0
  const selectedSubtotal = enteredKg === null ? 0 : roundMoney(enteredKg * selectedPrice)
  const subtotal = roundMoney(cart.reduce((sum, line) => {
    const product = state.productos.find(row => row.id_producto === line.id_producto)
    return sum + (product ? line.cantidad_kg * priceOf(product) : 0)
  }, 0))
  const discount = chargeAmount(subtotal, discountValue, discountMode)
  const iva = chargeAmount(Math.max(0, subtotal - discount), ivaValue, ivaMode)
  const total = roundMoney(subtotal - discount + iva)
  const mixedPaid = (Number(cashAmount) || 0) + (Number(transferAmount) || 0)
  const paymentDifference = roundMoney(total - mixedPaid)
  const mixedPaymentReady = Number(cashAmount) > 0 && Number(transferAmount) > 0 && Math.abs(paymentDifference) <= 0.01
  const paymentReady = paymentMode === 'Mixto' ? mixedPaymentReady : total > 0
  const discountError = discountValue && (!Number.isFinite(Number(discountValue)) || Number(discountValue) < 0)
    ? 'Ingrese un descuento válido.'
    : discount > subtotal ? 'El descuento no puede superar el subtotal.' : ''
  const ivaError = ivaValue && (!Number.isFinite(Number(ivaValue)) || Number(ivaValue) < 0) ? 'Ingrese un IVA válido.' : ''
  const registerDisabled = !cart.length || !paymentReady || !!discountError || !!ivaError
  const registerReason = !cart.length ? 'Agregue al menos un producto'
    : discountError ? 'Corrija el descuento'
      : ivaError ? 'Corrija el IVA'
        : paymentMode === 'Mixto' && paymentDifference > 0.01 ? `Complete el pago: faltan ${paymentDeltaLabel(paymentDifference)}`
          : paymentMode === 'Mixto' && paymentDifference < -0.01 ? `Corrija el pago: excede ${paymentDeltaLabel(Math.abs(paymentDifference))}`
            : paymentMode === 'Mixto' && (!Number(cashAmount) || !Number(transferAmount)) ? 'Complete ambos medios de pago'
              : !paymentReady ? 'Complete el pago: el total debe ser mayor a $0' : ''
  const productAvailable = selectedProduct ? sellableStock(state, selectedProduct.id_producto) : 0
  const alreadyInCart = selectedProduct ? cart.filter(line => line.id_producto === selectedProduct.id_producto).reduce((sum, line) => sum + line.cantidad_kg, 0) : 0
  const availableToAdd = Math.max(0, productAvailable - alreadyInCart)
  const clearSaleError = (key: string) => setSaleErrors(previous => ({ ...previous, [key]: '' }))
  const updateCashAmount = (value: string) => {
    setCashAmount(value)
    setCashTouched(true)
    if (!transferTouched) setTransferAmount(completedPaymentAmount(Math.max(0, total - (Number(value) || 0))))
  }
  const updateTransferAmount = (value: string) => {
    setTransferAmount(value)
    setTransferTouched(true)
    if (!cashTouched) setCashAmount(completedPaymentAmount(Math.max(0, total - (Number(value) || 0))))
  }
  const completeWithTransfer = () => {
    setTransferAmount(completedPaymentAmount(Math.max(0, total - (Number(cashAmount) || 0))))
    setCashTouched(true)
    setTransferTouched(true)
  }
  const completeWithCash = () => {
    setCashAmount(completedPaymentAmount(Math.max(0, total - (Number(transferAmount) || 0))))
    setCashTouched(true)
    setTransferTouched(true)
  }
  useEffect(() => {
    if (paymentMode !== 'Mixto') return
    if (cashTouched && !transferTouched) {
      const completion = completedPaymentAmount(Math.max(0, total - (Number(cashAmount) || 0)))
      setTransferAmount(current => current === completion ? current : completion)
    } else if (transferTouched && !cashTouched) {
      const completion = completedPaymentAmount(Math.max(0, total - (Number(transferAmount) || 0)))
      setCashAmount(current => current === completion ? current : completion)
    }
  }, [paymentMode, total, cashAmount, transferAmount, cashTouched, transferTouched])
  const addToOrder = () => {
    if (!selectedProduct || !selectedCategory || !selectedType) {
      toast('warning', 'Selecciona un producto', 'Elige tipo de fresa y calibre.')
      return
    }
    if (unitError || enteredKg === null) {
      setSaleErrors(previous => ({ ...previous, quantity: unitError || 'Este campo es obligatorio' }))
      return
    }
    if (enteredKg > availableToAdd) {
      toast('warning', 'Stock insuficiente', `Disponible: ${quantityLabel(availableToAdd)} kg de Fresa ${selectedType} ${selectedCategory.nombre_categoria}`)
      return
    }
    setCart(current => [...current, {
      key: `${Date.now()}-${Math.random()}`, id_producto: selectedProduct.id_producto,
      cantidad: Number(quantity), unidad: unit, kgPorUnidad: kgPerUnit ? Number(kgPerUnit) : undefined,
      cantidad_kg: enteredKg,
    }])
    setQuantity('')
    setKgPerUnit('')
    setSaleErrors({})
  }
  const registerSale = () => {
    const nextErrors: Record<string, string> = {}
    if (discountError) nextErrors.discount = discountError
    if (ivaError) nextErrors.iva = ivaError
    if (!cart.length) nextErrors.cart = 'Agregue al menos un producto a la venta.'
    if (!paymentReady) nextErrors.payment = 'El pago debe sumar exactamente el total.'
    if (Object.keys(nextErrors).length) { setSaleErrors(nextErrors); return }
    const payments: Array<{ metodo_pago: MetodoPago; monto: number }> = paymentMode === 'Mixto'
      ? [{ metodo_pago: 'Efectivo', monto: Number(cashAmount) }, { metodo_pago: 'Transferencia', monto: Number(transferAmount) }]
      : [{ metodo_pago: paymentMode, monto: total }]
    try {
      updateStore(createSale(getState(), {
        numero_documento: customer, id_usuario: Number(sessionStorage.getItem('fresas-user-id')),
        tipo_venta: type, iva, descuento_total: discount, pagos: payments,
        lines: cart.map(line => ({ id_producto: line.id_producto, cantidad_kg: line.cantidad_kg })),
      }))
      toast('success', 'Venta registrada con éxito', 'Pago y existencias actualizados correctamente.')
      setCart([])
      setSelectedType('')
      setSelectedCategoryId(null)
      setDiscountValue('')
      setIvaValue('')
      setCashAmount('')
      setTransferAmount('')
      setCashTouched(false)
      setTransferTouched(false)
      setPage(1)
      setSaleErrors({})
    } catch (error) {
      const message = messageOf(error)
      toast('error', 'No se pudo registrar la venta', message, true)
    }
  }
  const saveCancellation = () => {
    if (!cancelReason.trim()) {
      setCancelReasonError('Es obligatorio ingresar un motivo para proceder con la anulación.')
      return
    }
    try {
      updateStore(cancelSale(getState(), cancelId!, cancelReason))
      toast('success', 'Venta anulada', 'Las existencias fueron devueltas.')
      setCancelId(null)
      setCancelReason('')
      setCancelReasonError('')
    } catch (error) { toast('error', 'Error al anular la venta', messageOf(error)) }
  }
  const selectedSale = state.ventas.find(sale => sale.id_venta === selectedSaleId)
  const selectedSaleLines = selectedSale ? state.detalle_venta.filter(line => line.id_venta === selectedSale.id_venta) : []
  const selectedSaleSubtotal = selectedSaleLines.reduce((sum, line) => sum + line.cantidad * line.precio_unitario, 0)
  const selectedSalePayments = selectedSale ? state.pagos_venta.filter(payment => payment.id_venta === selectedSale.id_venta) : []
  const categoryImage = (name: string) => calibreImagenes[name as Calibre] ?? calibreImagenes['Calibre 1']
  const filteredSales = state.ventas.filter(row => {
    const client = state.clientes.find(item => item.numero_documento === row.numero_documento)
    const text = `${formatId('V', row.id_venta)} ${row.numero_documento} ${client?.nombre_cliente ?? ''}`.toLowerCase()
    const payments = state.pagos_venta.filter(payment => payment.id_venta === row.id_venta)
    return text.includes(historyQuery.toLowerCase())
      && (!historyFilters.saleType || row.tipo_venta === historyFilters.saleType)
      && (!historyFilters.method || payments.some(payment => payment.metodo_pago === historyFilters.method))
      && (!historyFilters.status || String(row.estado) === historyFilters.status)
      && dateInRange(row.fecha_venta, historyFilters.from, historyFilters.to)
  }).sort((a, b) => b.id_venta - a.id_venta)
  return <section>
    <div className="tab-bar"><button className={`tab-item ${tab === 'pos' ? 'active' : ''}`} onClick={() => setTab('pos')}>POS mostrador</button><button className={`tab-item ${tab === 'history' ? 'active' : ''}`} onClick={() => { setTab('history'); setPage(1) }}>Historial de ventas</button></div>
    {tab === 'pos' ? <div className="pos-layout">
      <div className="sale-flow">
        <section className="sale-step"><h2>1. Tipo de fresa</h2><div className="selection-grid">{(['Fresca', 'Congelada'] as const).map(productType => <button type="button" className={`selection-card ${selectedType === productType ? 'selected' : ''}`} key={productType} aria-pressed={selectedType === productType} onClick={() => { setSelectedType(productType); setSelectedCategoryId(null) }}><FresaImage src={fresaImagenes[productType]} alt={`Fresa ${productType}`} tipoProducto={productType} /><strong>Fresa {productType}</strong></button>)}</div></section>
        {selectedType && <section className="sale-step"><h2>2. Calibre</h2><div className="selection-grid caliber-grid">{categories.map(category => {
          const product = state.productos.find(row => row.estado && row.tipo_producto === selectedType && row.id_categoria === category.id_categoria)
          const isSelected = selectedCategoryId === category.id_categoria
          return <button type="button" className={`selection-card ${isSelected ? 'selected' : ''}`} key={category.id_categoria} disabled={!product} aria-pressed={isSelected} onClick={() => { setSelectedCategoryId(category.id_categoria); setQuantity(''); setKgPerUnit(''); setSaleErrors({}) }}>
            <FresaImage src={categoryImage(category.nombre_categoria)} alt={`${category.nombre_categoria} de fresa ${selectedType}`} tipoProducto={selectedType} calibre={category.nombre_categoria as Calibre} />
            <strong>{category.nombre_categoria}</strong>
            {product && <><span>{fmt(priceOf(product))} / kg</span><small>Disponible: {quantityLabel(sellableStock(state, product.id_producto))} kg</small></>}
            {!product && <small>Sin producto activo</small>}
          </button>
        })}</div></section>}
        {selectedProduct && selectedCategory && <section className="sale-step"><h2>3. Cantidad</h2>
          <div className="form-grid">
            <Field label="Cantidad"><div className="quantity-input"><input className={`input ${saleErrors.quantity ? 'input-error' : ''}`} type="number" min="0" step="any" value={quantity} onChange={event => { setQuantity(event.target.value); clearSaleError('quantity') }} /><select className="select" value={unit} onChange={event => { setUnit(event.target.value as Unidad); clearSaleError('quantity') }}><option>kg</option><option>g</option><option>Caja</option><option>Bulto</option><option>Bolsa</option></select></div>{saleErrors.quantity && <small className="field-error">{saleErrors.quantity}</small>}{enteredKg !== null && <small className="muted">= {quantityLabel(enteredKg)} kg</small>}</Field>
            {unit !== 'kg' && unit !== 'g' && <Field label={`kg por ${unit}`}><input className={`input ${saleErrors.quantity ? 'input-error' : ''}`} type="number" min="0.01" step="any" value={kgPerUnit} onChange={event => { setKgPerUnit(event.target.value); clearSaleError('quantity') }} />{saleErrors.quantity && <small className="field-error">{saleErrors.quantity}</small>}</Field>}
          </div>
          <div className="detail-row"><span>Subtotal de la selección</span><strong>{fmt(selectedSubtotal)}</strong></div>
          <button className="btn-primary" type="button" onClick={addToOrder}><Ic d={P.plus} size={15} /> Agregar a la orden</button>
        </section>}
      </div>
      <aside className="card cart-card">
        <h2>Orden activa</h2>
        <Field label="Cliente"><select className="select" value={customer} onChange={event => setCustomer(event.target.value)}>{state.clientes.filter(row => row.estado).map(row => <option key={row.numero_documento} value={row.numero_documento}>{row.nombre_cliente}</option>)}</select></Field>
        <Field label="Tipo de venta"><select className="select" value={type} onChange={event => setType(event.target.value as TipoVenta)}><option>Detal</option><option>Mayorista</option></select></Field>
        <div className="cart-lines">
          {!cart.length && <p className="muted">Aún no hay productos en la orden.</p>}
          {cart.map(line => {
            const product = state.productos.find(row => row.id_producto === line.id_producto)!
            const linePrice = priceOf(product)
            return <div className="sale-cart-line" key={line.key}>
              <div><strong>{productName(state, product.id_producto)}</strong><small>{quantityLabel(line.cantidad)} {line.unidad}{line.kgPorUnidad ? ` × ${quantityLabel(line.kgPorUnidad)} kg` : ''} = {quantityLabel(line.cantidad_kg)} kg</small><small>{fmt(linePrice)} / kg · Subtotal {fmt(roundMoney(line.cantidad_kg * linePrice))}</small></div>
              <button className="sale-cart-remove" type="button" aria-label="Quitar producto" onClick={() => setCart(current => current.filter(item => item.key !== line.key))}><Ic d={P.close} size={14} /></button>
            </div>
          })}
        </div>
        {saleErrors.cart && <small className="field-error">{saleErrors.cart}</small>}
        <div className="cart-totals">
          <div className="detail-row"><span>Subtotal</span><strong>{fmt(subtotal)}</strong></div>
          <div className="charge-row"><Field label="Descuento"><div className="charge-controls"><select className="select" value={discountMode} onChange={event => setDiscountMode(event.target.value as ChargeMode)}><option>%</option><option>$</option></select><input className={`input ${discountError || saleErrors.discount ? 'input-error' : ''}`} type="number" min="0" step="0.01" value={discountValue} onChange={event => { setDiscountValue(event.target.value); clearSaleError('discount') }} /></div>{(discountError || saleErrors.discount) && <small className="field-error">{discountError || saleErrors.discount}</small>}</Field><strong>{fmt(discount)}</strong></div>
          <div className="charge-row"><Field label="IVA"><div className="charge-controls"><select className="select" value={ivaMode} onChange={event => setIvaMode(event.target.value as ChargeMode)}><option>%</option><option>$</option></select><input className={`input ${ivaError || saleErrors.iva ? 'input-error' : ''}`} type="number" min="0" step="0.01" value={ivaValue} onChange={event => { setIvaValue(event.target.value); clearSaleError('iva') }} /></div>{(ivaError || saleErrors.iva) && <small className="field-error">{ivaError || saleErrors.iva}</small>}</Field><strong>{fmt(iva)}</strong></div>
          <div className="detail-row total-row"><span>Total</span><strong>{fmt(total)}</strong></div>
        </div>
        <Field label="Pago"><select className="select" value={paymentMode} onChange={event => { setPaymentMode(event.target.value as 'Efectivo' | 'Transferencia' | 'Mixto'); setCashAmount(''); setTransferAmount(''); setCashTouched(false); setTransferTouched(false); setSaleErrors(previous => ({ ...previous, payment: '' })) }}><option>Efectivo</option><option>Transferencia</option><option>Mixto</option></select></Field>
        {paymentMode === 'Mixto' && <div className="mixed-payment">
          <Field label="Efectivo"><input className="input" type="number" min="0" step="0.01" value={cashAmount} onChange={event => updateCashAmount(event.target.value)} /></Field>
          <Field label="Transferencia"><input className="input" type="number" min="0" step="0.01" value={transferAmount} onChange={event => updateTransferAmount(event.target.value)} /></Field>
          <div className="mixed-payment-actions"><button type="button" className="link-button" onClick={completeWithTransfer}>Completar con transferencia</button><button type="button" className="link-button" onClick={completeWithCash}>Completar con efectivo</button></div>
          <p className={Math.abs(paymentDifference) <= 0.01 ? 'payment-balanced' : 'payment-unbalanced'}>{paymentDifference > 0.01 ? `Falta ${paymentDeltaLabel(paymentDifference)}` : paymentDifference < -0.01 ? `Excede ${paymentDeltaLabel(Math.abs(paymentDifference))}` : 'Pago completo'}</p>
        </div>}
        {saleErrors.payment && <small className="field-error">{saleErrors.payment}</small>}
        {canCreate && <><button className="btn-primary full-width" disabled={registerDisabled} onClick={registerSale}>Registrar venta</button>{registerDisabled && <small className="muted">{registerReason}</small>}</>}
      </aside>
    </div> : <><div className="page-toolbar"><SearchBar placeholder="Buscar venta, cliente o documento..." value={historyQuery} onChange={value => { setHistoryQuery(value); setPage(1) }} />
      <FilterPopover activeCount={Object.values(historyFilters).filter(Boolean).length} onClear={clearHistoryFilters}>
        <Field label="Tipo de venta"><select className="select" value={historyFilters.saleType} onChange={event => setHistoryFilter('saleType', event.target.value)}><option value="">Todos los tipos</option><option>Detal</option><option>Mayorista</option></select></Field>
        <Field label="Medio de pago"><select className="select" value={historyFilters.method} onChange={event => setHistoryFilter('method', event.target.value)}><option value="">Todos los medios</option><option>Efectivo</option><option>Transferencia</option></select></Field>
        <Field label="Estado"><select className="select" value={historyFilters.status} onChange={event => setHistoryFilter('status', event.target.value)}><option value="">Todos los estados</option><option value="true">Activas</option><option value="false">Anuladas</option></select></Field>
        <div className="filter-date-range"><Field label="Desde"><input className="input" type="date" value={historyFilters.from} onChange={event => setHistoryFilter('from', event.target.value)} /></Field><Field label="Hasta"><input className="input" type="date" value={historyFilters.to} onChange={event => setHistoryFilter('to', event.target.value)} /></Field></div>
      </FilterPopover>
    </div><div className="card table-scroll"><table className="data-table"><thead><tr><th>Venta</th><th>Fecha</th><th>Cliente</th><th>Tipo</th><th>Descuento</th><th>IVA</th><th>Total</th><th>Pago</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{filteredSales.slice((page - 1) * 10, page * 10).map(row => {
      const methods = state.pagos_venta.filter(payment => payment.id_venta === row.id_venta).map(payment => `${payment.metodo_pago}: ${fmt(payment.monto_recibido)}`).join(' · ')
      return <tr key={row.id_venta}><td data-label="Venta">{formatId('V', row.id_venta)}</td><td data-label="Fecha">{row.fecha_venta.slice(0, 16).replace('T', ' ')}</td><td data-label="Cliente">{state.clientes.find(client => client.numero_documento === row.numero_documento)?.nombre_cliente}</td><td data-label="Tipo">{row.tipo_venta}</td><td data-label="Descuento">{fmt(row.descuento_total)}</td><td data-label="IVA">{fmt(row.iva)}</td><td data-label="Total">{fmt(row.total_pagar)}</td><td data-label="Pago">{methods}</td><td data-label="Estado"><span className={`badge ${row.estado ? 'badge-green' : 'badge-red'}`}>{row.estado ? 'Activa' : 'Anulada'}</span></td><td data-label="Acciones"><div className="actions"><ViewBtn title="Ver detalle y ticket" onClick={() => setSelectedSaleId(row.id_venta)} />{canDelete && row.estado && <TrashBtn title="Anular venta" onClick={() => { setCancelReason(''); setCancelReasonError(''); setCancelId(row.id_venta) }} />}</div></td></tr>
    })}</tbody></table></div><Pagination page={page} total={filteredSales.length} onPageChange={setPage} /></>}
    <Modal open={selectedSale !== undefined} title={selectedSale ? `Detalle y ticket ${formatId('V', selectedSale.id_venta)}` : 'Detalle de venta'} onClose={() => setSelectedSaleId(null)} wide>
      {selectedSale && <><div className="ticket-print">
        <header className="ticket-header"><strong>Fresas del Oriente</strong><span>Ticket de venta {formatId('V', selectedSale.id_venta)}</span><span>{localDateFromTimestamp(selectedSale.fecha_venta)} · {selectedSale.fecha_venta.slice(11, 16)}</span></header>
        <div className="detail-row"><span>Cliente</span><strong>{state.clientes.find(client => client.numero_documento === selectedSale.numero_documento)?.nombre_cliente}</strong></div>
        <div className="detail-row"><span>Tipo de venta</span><strong>{selectedSale.tipo_venta}</strong></div>
        <div className="ticket-items"><div className="ticket-item ticket-item-head"><span>Producto / lote</span><span>Cant. · Precio</span><strong>Subtotal</strong></div>
          {selectedSaleLines.map(line => <div className="ticket-item" key={line.id_detalle_venta}><span>{productName(state, line.id_producto)}<small>Lote: {line.id_lote === null ? 'Sin lote' : state.lotes.find(lot => lot.id_lote === line.id_lote)?.numero_lote ?? 'Sin lote'}</small></span><span>{quantityLabel(line.cantidad)} kg · {fmt(line.precio_unitario)}/kg</span><strong>{fmt(line.cantidad * line.precio_unitario)}</strong></div>)}
        </div>
        <div className="detail-row"><span>Subtotal</span><strong>{fmt(selectedSaleSubtotal)}</strong></div>
        <div className="detail-row"><span>Descuento</span><strong>{fmt(selectedSale.descuento_total)}</strong></div>
        <div className="detail-row"><span>IVA</span><strong>{fmt(selectedSale.iva)}</strong></div>
        <div className="detail-row total-row"><span>Total</span><strong>{fmt(selectedSale.total_pagar)}</strong></div>
        <div className="ticket-payments"><strong>Pagos</strong>{selectedSalePayments.map(payment => <div className="detail-row" key={payment.id_pago_venta}><span>{payment.metodo_pago}</span><strong>{fmt(payment.monto_recibido)}</strong></div>)}</div>
        {!selectedSale.estado && <div className="detail-row"><span>Motivo de anulación</span><strong>{selectedSale.motivo_anulacion}</strong></div>}
      </div><div className="modal-actions"><button className="btn-secondary" onClick={() => window.print()}>Imprimir ticket</button><button className="btn-primary" onClick={() => setSelectedSaleId(null)}>Cerrar</button></div></>}
    </Modal>
    <Modal open={cancelId !== null} title="¿Anular venta?" onClose={() => setCancelId(null)} narrow>
      <p className="muted">Se devolverán las existencias a sus lotes de origen.</p>
      <Field label="Motivo de anulación"><textarea className={`input ${cancelReasonError ? 'input-error' : ''}`} maxLength={200} value={cancelReason} onChange={event => { setCancelReason(event.target.value); setCancelReasonError('') }} /></Field>
      {cancelReasonError && <small className="field-error">{cancelReasonError}</small>}
      <div className="modal-actions"><button className="btn-secondary" onClick={() => setCancelId(null)}>Cancelar</button><button className="btn-danger" onClick={saveCancellation}>Anular venta</button></div>
    </Modal>
  </section>
}

export function LotsPage({ filter = 'Todos', onConvert }: { filter?: string; onConvert?: (id: number) => void }) {
  const state = useStore(); const [query, setQuery] = useState(''); const [page, setPage] = useState(1)
  const [filters, setFilters] = useState({ category: '', supplier: '', pack: '', status: '' })
  const freezeCandidateIds = new Set(freezeCandidates(state).map(lot => lot.id_lote))
  const setFilter = (key: keyof typeof filters, value: string) => { setFilters(current => ({ ...current, [key]: value })); setPage(1) }
  const clearFilters = () => { setFilters({ category: '', supplier: '', pack: '', status: '' }); setPage(1) }
  const activeFilterCount = Object.values(filters).filter(Boolean).length
  const lots = stockByLot(state).filter(lot => {
    const categoryId = lot.detail && state.productos.find(product => product.id_producto === lot.detail?.id_producto)?.id_categoria
    return lot.numero_lote.toLowerCase().includes(query.toLowerCase())
      && (filter !== 'Por vencer' || expiryStatus(lot.fecha_vencimiento) !== 'activo')
      && (!filters.category || String(categoryId ?? '') === filters.category)
      && (!filters.supplier || String(lot.supplier?.id_proveedor ?? '') === filters.supplier)
      && (!filters.pack || lot.tipo_empaque === filters.pack)
      && (!filters.status || String(lot.estado) === filters.status)
  }).sort((a, b) => b.id_lote - a.id_lote)
  return <section><div className="page-toolbar"><SearchBar placeholder="Buscar lote..." value={query} onChange={value => { setQuery(value); setPage(1) }} />
    <FilterPopover activeCount={activeFilterCount} onClear={clearFilters}>
      <Field label="Calibre"><select className="select" value={filters.category} onChange={event => setFilter('category', event.target.value)}><option value="">Todos los calibres</option>{state.categorias.map(category => <option key={category.id_categoria} value={category.id_categoria}>{category.nombre_categoria}</option>)}</select></Field>
      <Field label="Proveedor"><select className="select" value={filters.supplier} onChange={event => setFilter('supplier', event.target.value)}><option value="">Todos los proveedores</option>{state.proveedores.map(provider => <option key={provider.id_proveedor} value={provider.id_proveedor}>{provider.nombre_proveedor}</option>)}</select></Field>
      <Field label="Empaque"><select className="select" value={filters.pack} onChange={event => setFilter('pack', event.target.value)}><option value="">Todos los empaques</option><option>Bulto</option><option>Caja</option><option>Bolsa</option></select></Field>
      <Field label="Estado"><select className="select" value={filters.status} onChange={event => setFilter('status', event.target.value)}><option value="">Todos los estados</option><option value="true">Activo</option><option value="false">Inactivo</option></select></Field>
    </FilterPopover>
  </div>  <div className="card table-scroll"><table className="data-table"><thead><tr><th>Lote</th><th>Producto / calibre</th><th>Proveedor</th><th>Disponible</th><th>Vencimiento</th><th>Estado</th><th>Acción</th></tr></thead><tbody>{lots.slice((page - 1) * 10, page * 10).map(row => { const status = expiryStatus(row.fecha_vencimiento); return <tr key={row.id_lote}><td data-label="Lote">{row.numero_lote}</td><td data-label="Producto / calibre">{row.detail && productName(state, row.detail.id_producto)}</td><td data-label="Proveedor">{row.supplier?.nombre_proveedor}</td><td data-label="Disponible">{row.cantidad_disponible} kg</td><td data-label="Vencimiento">{row.fecha_vencimiento}</td><td data-label="Estado"><span className={`badge ${status === 'vencido' ? 'badge-red' : status !== 'activo' ? 'badge-amber' : 'badge-green'}`}>{status === 'vencido' ? 'Vencido' : status !== 'activo' ? 'Por vencer' : 'Activo'}</span></td><td data-label="Acción">{freezeCandidateIds.has(row.id_lote) && <button className="btn-secondary" onClick={() => onConvert?.(row.id_lote)}>Pasar a congelado</button>}</td></tr> })}{!lots.length && <tr><td colSpan={7} className="table-empty">No se encontraron lotes que coincidan con la búsqueda.</td></tr>}</tbody></table></div><Pagination page={page} total={lots.length} onPageChange={setPage} /></section>
}

export function InventoryPage() {
  const state = useStore()
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const fresh = state.productos.filter(row => row.tipo_producto === 'Fresca').reduce((sum, row) => sum + sellableStock(state, row.id_producto), 0)
  const frozen = state.productos.filter(row => row.tipo_producto === 'Congelada').reduce((sum, row) => sum + sellableStock(state, row.id_producto), 0)
  const expiredLots = stockByLot(state).filter(lot => lot.cantidad_disponible > 0 && expiryStatus(lot.fecha_vencimiento) === 'vencido')
  const expiredStock = expiredLots.reduce((sum, lot) => sum + lot.cantidad_disponible, 0)
  const products = state.productos
    .map(product => ({
      product,
      name: productName(state, product.id_producto),
      sellable: sellableStock(state, product.id_producto),
      hasExpiredStock: expiredLots.some(lot => lot.detail?.id_producto === product.id_producto),
    }))
    .filter(row => row.name.toLowerCase().includes(query.toLowerCase()))
  const shownProducts = products.slice((page - 1) * 10, page * 10)
  return <section><div className="summary-grid">
    <div className="card stock-summary fresh"><div><span>Fresa fresca</span><strong>{fresh.toFixed(1)} kg</strong></div><i aria-hidden="true">🍓</i></div>
    <div className="card stock-summary frozen"><div><span>Fresa congelada</span><strong>{frozen.toFixed(1)} kg</strong></div><i aria-hidden="true">❄️</i></div>
    <div className="card stock-summary total"><div><span>Existencias totales</span><strong>{(fresh + frozen).toFixed(1)} kg</strong></div><i aria-hidden="true"><Ic d={P.stock} size={20} /></i></div>
  </div>
    {expiredStock > 0 && <p className="inventory-expired-note"><span className="badge badge-danger">Vencido (no vendible): {quantityLabel(expiredStock)} kg</span></p>}
    <div className="page-toolbar"><h2>Existencias por producto</h2><SearchBar placeholder="Buscar producto..." value={query} onChange={value => { setQuery(value); setPage(1) }} /></div>
    <div className="card table-scroll"><table className="data-table"><thead><tr><th>Producto</th><th>Tipo</th><th>Stock vendible</th><th>Stock mínimo</th><th>Estado</th></tr></thead><tbody>
      {shownProducts.map(({ product, name, sellable, hasExpiredStock }) => {
        const status = sellable <= product.stock_minimo
          ? { label: 'Bajo', badge: 'badge-amber' }
          : hasExpiredStock
            ? { label: 'Parcialmente vencido', badge: 'badge-danger' }
            : { label: 'Disponible', badge: 'badge-green' }
        return <tr key={product.id_producto}>
          <td data-label="Producto">{name}</td>
          <td data-label="Tipo"><span className={`badge ${product.tipo_producto === 'Fresca' ? 'badge-pink' : 'badge-blue'}`}>{product.tipo_producto}</span></td>
          <td data-label="Stock vendible">{quantityLabel(sellable)} kg</td>
          <td data-label="Stock mínimo">{quantityLabel(product.stock_minimo)} kg</td>
          <td data-label="Estado"><span className={`badge ${status.badge}`}>{status.label}</span></td>
        </tr>
      })}
      {!shownProducts.length && <tr><td colSpan={5} className="table-empty">No se encontraron productos que coincidan con la búsqueda.</td></tr>}
    </tbody></table></div>
    <Pagination page={page} total={products.length} onPageChange={setPage} />
    <div className="page-toolbar"><h2>Lotes</h2></div>
    <LotsPage />
  </section>
}

export function DashboardPage({ openLots }: { openLots: () => void }) {
  const navigate = useNavigate()
  const state = useStore(); const toast = useToast()
  const [period, setPeriod] = useState<'Diario' | 'Semanal' | 'Mensual' | 'Anual'>('Semanal'); const [stockMode, setStockMode] = useState<'type' | 'category'>('type')
  const stats = dashboardStats(state); const rows = periodRows(state, period); const lotWarnings = expiringLots(state); const lotsToFreeze = freezeSuggestions(state).slice(0, 5)
  const byCategory = stats.stockByCategory
  const pieData = stockMode === 'type' ? stats.stockByType : byCategory
  const label = period === 'Diario' ? 'Hoy' : period === 'Semanal' ? 'Últimos 7 días' : period === 'Mensual' ? 'Últimos 30 días' : 'Últimos 12 meses'
  const includesPeriodDate = (timestamp: string) => rows.some(row => period === 'Anual' ? row.date.slice(0, 7) === localDateFromTimestamp(timestamp).slice(0, 7) : row.date === localDateFromTimestamp(timestamp))
  const exportRows = state.ventas.filter(sale => sale.estado && includesPeriodDate(sale.fecha_venta)).map(sale => ({ tipo: 'Venta', fecha: sale.fecha_venta, total: sale.total_pagar }))
  const purchaseRows = state.compras.filter(purchase => purchase.estado && includesPeriodDate(purchase.fecha_compra)).map(purchase => ({ tipo: 'Compra', fecha: purchase.fecha_compra, total: purchase.total_compra }))
  const periodSales = exportRows.reduce((sum, row) => sum + row.total, 0)
  const periodPurchases = purchaseRows.reduce((sum, row) => sum + row.total, 0)
  const exportExcel = () => {
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet([{ indicador: `Ventas del periodo (${label})`, valor: periodSales }, { indicador: `Compras del periodo (${label})`, valor: periodPurchases }, ...exportRows, ...purchaseRows]), 'Reporte')
    XLSX.writeFile(book, 'reporte-fresas-oriente.xlsx')
    toast('success', 'Excel exportado', 'El reporte se descargó correctamente.')
  }
  const exportPdf = () => {
    const doc = new jsPDF()
    doc.text(`Reporte comercial · ${label}`, 14, 16)
    autoTable(doc, { head: [['Indicador', 'Valor']], body: [[`Ventas del periodo (${label})`, fmt(periodSales)], [`Compras del periodo (${label})`, fmt(periodPurchases)], ['Órdenes de compra del periodo', String(purchaseRows.length)]] })
    autoTable(doc, { head: [['Tipo', 'Fecha', 'Total']], body: [...exportRows, ...purchaseRows].map(row => [row.tipo, localDateFromTimestamp(row.fecha), fmt(row.total)]), startY: 62 })
    doc.save('reporte-fresas-oriente.pdf')
    toast('success', 'PDF exportado', 'El reporte se descargó correctamente.')
  }
  const critical = lotWarnings.filter(lot => ['vencido', 'critico'].includes(expiryStatus(lot.fecha_vencimiento)))
  const warnings = lotWarnings.filter(lot => expiryStatus(lot.fecha_vencimiento) === 'advertencia')
  const lowProducts = state.productos.filter(product => product.estado && sellableStock(state, product.id_producto) <= product.stock_minimo)
  const kpis = [
    { title: 'Ventas del Día', value: fmt(stats.salesToday), note: stats.salesChange === null ? 'Sin ventas ayer' : `${stats.salesChange > 0 ? '+' : ''}${stats.salesChange.toFixed(1)}% vs. ayer`, icon: P.cash, tone: 'sales', noteTone: stats.salesChange === null ? 'neutral' : stats.salesChange < 0 ? 'negative' : '' },
    { title: 'Compras del Mes', value: fmt(stats.purchasesMonth), note: `${stats.purchaseCount} órdenes`, icon: P.truck, tone: 'purchases', noteTone: '' },
    { title: 'Stock Fresco Crítico', value: `${stats.freshCriticalCount} lotes`, note: 'Vencidos o vencen en menos de 48 horas', icon: P.alert, tone: 'critical', noteTone: 'warning' },
    { title: 'Rend. Transformación', value: `${(stats.yieldAverage * 100).toFixed(1)}%`, note: 'Promedio de las últimas 10 órdenes', icon: P.sparkle, tone: 'yield', noteTone: 'neutral' },
  ]
  return <section>
    <div className="page-toolbar"><div className="period-tabs">{(['Diario', 'Semanal', 'Mensual', 'Anual'] as const).map(item => <button className={period === item ? 'selected' : ''} key={item} onClick={() => setPeriod(item)}>{item}</button>)}</div><button className="btn-secondary" onClick={exportPdf}><Ic d={P.download} size={14} /> Exportar PDF</button><button className="btn-primary" onClick={exportExcel}><Ic d={P.download} size={14} /> Excel</button></div>
    <div className="summary-grid four">{kpis.map(item => <article key={item.title} className={`card dashboard-kpi ${item.tone}`} onClick={item.tone === 'critical' ? openLots : undefined} onKeyDown={event => {
      if (item.tone === 'critical' && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); openLots() }
    }} role={item.tone === 'critical' ? 'button' : undefined} tabIndex={item.tone === 'critical' ? 0 : undefined}>
      <div className="dashboard-kpi-head"><span>{item.title}</span><span className="dashboard-kpi-icon"><Ic d={item.icon} size={19} /></span></div>
      <strong>{item.value}</strong><small className={item.noteTone}>{item.note}</small>
    </article>)}</div>
    <div className="dashboard-grid"><div className="card chart-card"><h2>Ventas vs. Compras</h2><p>{label}</p>{!rows.some(row => row.ventas || row.compras) ? <div className="table-empty">No se registran datos para la temporalidad seleccionada.</div> : <ResponsiveContainer width="100%" height={240}><LineChart data={rows}><CartesianGrid stroke="var(--border-soft)" strokeDasharray="3 3" /><XAxis dataKey="label" /><YAxis /><Tooltip formatter={value => fmt(Number(value ?? 0))} /><Line dataKey="ventas" stroke="var(--chart-sales)" name="Ventas" /><Line dataKey="compras" stroke="var(--chart-purchases)" name="Compras" /></LineChart></ResponsiveContainer>}</div>
      <div className="card chart-card"><h2>Distribución de Stock</h2><p>{pieData.reduce((sum, row) => sum + row.value, 0)} unidades · <button className="link-button" onClick={() => setStockMode(stockMode === 'type' ? 'category' : 'type')}>Por {stockMode === 'type' ? 'tipo' : 'calibre'}</button></p><ResponsiveContainer width="100%" height={240}><PieChart><Pie data={pieData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={78}>{pieData.map((_, i) => <Cell key={i} fill={`var(--chart-${i % 5 + 1})`} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div></div>
    <div className="dashboard-grid"><div className="card chart-card"><h2>Cierre de caja — Hoy</h2>{Object.entries(stats.paymentTotals).map(([method, total]) => <div className="detail-row" key={method}><span>{method}</span><strong>{fmt(Number(total))}</strong></div>)}<div className="detail-row"><span>Compras del día (egreso)</span><strong>{fmt(stats.purchasesToday)}</strong></div><div className="detail-row"><span>Saldo</span><strong>{fmt(Object.values(stats.paymentTotals).reduce((sum, amount) => sum + Number(amount), 0) - stats.purchasesToday)}</strong></div></div>
      <div className="card chart-card"><h2>Alertas de inventario</h2>{[...critical.map(lot => ({ text: expiryStatus(lot.fecha_vencimiento) === 'vencido' ? `Lote ${lot.numero_lote} vencido` : lot.fecha_vencimiento === localDateString() ? `Lote ${lot.numero_lote} vence hoy` : `Lote ${lot.numero_lote} vence en menos de 24 h`, severity: 'danger' })), ...warnings.map(lot => ({ text: `Lote ${lot.numero_lote} vence en 24–48 h`, severity: 'warning' })), ...lowProducts.map(product => ({ text: `${productName(state, product.id_producto)} · stock bajo`, severity: 'warning' }))].map((item, i) => <div className={`alert-row ${item.severity}`} key={`${item.text}-${i}`}>{item.text}</div>)}{!lotWarnings.length && !lowProducts.length && <div className="table-empty">No hay alertas de inventario pendientes en este momento.</div>}</div></div>
    <div className="card chart-card"><div className="page-toolbar"><div><h2>Lotes por pasar a congelado</h2><p>Prioriza los lotes próximos a vencer.</p></div><button className="btn-secondary" onClick={openLots}>Ver todos</button></div>{lotsToFreeze.length ? lotsToFreeze.map(lot => {
      const status = expiryStatus(lot.fecha_vencimiento)
      return <div key={lot.id_lote} className="detail-row freeze-suggestion">
        <div className="freeze-suggestion-info"><strong>{lot.numero_lote} · {quantityLabel(lot.cantidad_disponible)} kg</strong><small>Vencimiento: {lot.fecha_vencimiento}</small></div>
        <span className={`badge ${status === 'critico' ? 'badge-red' : 'badge-amber'}`}>{status === 'critico' ? 'Crítico' : 'Advertencia'}</span>
        <button className="btn-primary" onClick={() => { sessionStorage.setItem('fresas-production-lot', String(lot.id_lote)); navigate('/produccion') }}>Pasar a congelado</button>
      </div>
    }) : <div className="dashboard-empty-success"><Ic d={P.check} size={17} /><span>Todo en orden: ningún lote por vencer.</span></div>}</div>
  </section>
}

export function HistoryPage({ kind }: { kind: 'proveedores' | 'clientes' }) {
  const state = useStore()
  const records = kind === 'proveedores' ? state.proveedores : state.clientes
  return <div>{records.map(record => {
    const history = kind === 'proveedores'
      ? supplierHistory(state, (record as AppState['proveedores'][number]).id_proveedor).map(({ compra }) => ({
          id: compra.id_compra, date: localDateFromTimestamp(compra.fecha_compra), total: compra.total_compra,
        }))
      : clientHistory(state, (record as AppState['clientes'][number]).numero_documento).map(({ venta }) => ({
          id: venta.id_venta, date: localDateFromTimestamp(venta.fecha_venta), total: venta.total_pagar,
        }))
    const name = kind === 'proveedores'
      ? (record as AppState['proveedores'][number]).nombre_proveedor
      : (record as AppState['clientes'][number]).nombre_cliente
    const id = kind === 'proveedores'
      ? (record as AppState['proveedores'][number]).id_proveedor
      : (record as AppState['clientes'][number]).numero_documento
    const total = history.reduce((sum, item) => sum + item.total, 0)
    return <details className="card history-card" key={id}>
      <summary><span>{name}</span><strong>Total histórico: {fmt(total)}</strong></summary>
      {history.length ? history.map(item => <div className="detail-row" key={item.id}>
        <span>{kind === 'proveedores' ? formatId('C', item.id) : formatId('V', item.id)} · {item.date}</span>
        <strong>{fmt(item.total)}</strong>
      </div>) : <div className="table-empty">{kind === 'clientes' ? 'El cliente no cuenta con histórico de ventas en la plataforma.' : 'No se registran compras del proveedor.'}</div>}
    </details>
  })}</div>
}
