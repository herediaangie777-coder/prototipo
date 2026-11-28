import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Cell, CartesianGrid, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { ConfirmModal, EditBtn, Field, FilterPopover, Ic, LoteBtn, Modal, P, Pagination, PermBtn, SearchBar, Toggle, TrashBtn, ViewBtn, fmt } from '../components/shared'
import { useToast } from '../components/toast'
import { clientHistory, dashboardStats, expiringLots, freezeSuggestions, periodRows, productName, sellableStock, stockBajo, stockByLot, stockVendible, stockVencido } from '../data/selectors'
import { canModuleAction, moduleActions } from '../data/moduleActions'
import { getState, updateStore, useStore } from '../data/store'
import { associateLot, cancelProduction, cancelPurchase, cancelSale, createProductionOrder, createPurchase, createSale, editPurchase, finishProduction, updateProductionOrder } from '../data/services/business'
import { saveMaster, toggleMasterState } from '../data/services/masters'
import { expiryStatus, localDateFromTimestamp, localDateString } from '../data/dates'
import { formatId } from '../data/format'
import { toKg, type Unidad } from '../data/units'
import { calibreImagenes, fresaImagenes, FresaImage, type Calibre } from '../config/fresaImagenes'
import type { AppState, MetodoPago, TipoEmpaque, TipoProducto, TipoVenta } from '../data/types'

type ModuleKey = 'roles' | 'usuarios' | 'categorias' | 'productos' | 'proveedores' | 'clientes'
type Row = Record<string, unknown>
type FieldDef = { key: string; label: string; type?: string; max?: number; required?: boolean; options?: Array<{ value: string; label: string }> }
const documentOptions = ['CC', 'CE', 'NIT', 'PAS'].map(value => ({ value, label: value }))
const quantityLabel = (value: number) => value.toLocaleString('es-CO', { maximumFractionDigits: 2 })
const quantityUnit = (value: number, unit: string) => unit === 'bolsa' ? value === 1 ? 'bolsa' : 'bolsas' : unit
const roundMoney = (value: number) => Number(value.toFixed(2))
const completedPaymentAmount = (value: number) => {
  const cents = roundMoney(value)
  const wholePesos = Math.round(cents)
  return String(Math.abs(cents - wholePesos) <= 0.01 ? wholePesos : cents)
}
const paymentDeltaLabel = (value: number) => new Intl.NumberFormat('es-CO', {
  style: 'currency', currency: 'COP', minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2,
}).format(value)
type PurchaseLineDraft = {
  key: string
  id_producto: string
  cantidad: string
  unidad: 'kg' | 'g'
  precio: string
  conLote: boolean
  numero_lote: string
  fecha_ingreso: string
  fecha_vencimiento: string
  tipo_empaque: TipoEmpaque
  id_ubicacion: string
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

function monthsAfter(date: string, months: number) {
  const [year, month, day] = date.split('-').map(Number)
  const first = new Date(year, month - 1 + months, 1, 12)
  const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  first.setDate(Math.min(day, lastDay))
  return localDateString(first)
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
    fecha_ingreso: localDateString(), fecha_vencimiento: '', tipo_empaque: 'Bulto',
    id_ubicacion: localStorage.getItem('fresas-last-purchase-location') ?? '315',
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

function chargeAmount(value: string) {
  if (!value.trim() || !Number.isFinite(Number(value))) return 0
  return roundMoney(Number(value))
}

function purchaseHasMovements(state: AppState, purchaseId: number) {
  const detailIds = new Set(state.detalle_compra.filter(row => row.id_compra === purchaseId).map(row => row.id_detalle_compra))
  const lotIds = new Set(state.lotes.filter(row => row.id_detalle_compra !== null && detailIds.has(row.id_detalle_compra)).map(row => row.id_lote))
  return state.detalle_venta.some(row => lotIds.has(row.id_lote))
    || state.produccion.some(row => lotIds.has(row.id_lote_origen))
}

function dateInRange(value: string, from: string, to: string) {
  const date = localDateFromTimestamp(value)
  return (!from || date >= from) && (!to || date <= to)
}

function dateDistance(date: string, today: string) {
  const [year, month, day] = date.split('-').map(Number)
  const [todayYear, todayMonth, todayDay] = today.split('-').map(Number)
  return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(todayYear, todayMonth - 1, todayDay)) / 86400000)
}

type MasterFilters = { role: string; status: string; category: string; productType: string; lowStock: boolean; municipality: string; documentType: string }

const configs: Record<Exclude<ModuleKey, 'roles'>, { title: string; kind: Exclude<ModuleKey, 'roles'> extends infer T ? T : never; table: keyof AppState; id: string; fields: FieldDef[]; columns: Array<[string, string]>; search: string[] }> = {
  usuarios: { title: 'Usuarios', kind: 'usuarios', table: 'usuarios', id: 'id_usuario', search: ['nombre', 'apellido', 'correo'], columns: [['Nombre completo', 'nombre_completo'], ['Correo', 'correo'], ['Teléfono', 'telefono'], ['Rol', 'rol']], fields: [
    { key: 'nombre', label: 'Nombre', max: 25, required: true }, { key: 'apellido', label: 'Apellido', max: 25, required: true },
    { key: 'correo', label: 'Correo', type: 'email', max: 40, required: true }, { key: 'telefono', label: 'Teléfono', max: 15 },
    { key: 'id_rol', label: 'Rol', type: 'select', required: true }, { key: 'contrasenia', label: 'Contraseña temporal', type: 'password', required: true },
  ] },
  categorias: { title: 'Categorías', kind: 'categorias', table: 'categorias', id: 'id_categoria', search: ['nombre_categoria'], columns: [['Categoría', 'nombre_categoria'], ['Productos (calculado)', 'productos_count']], fields: [
    { key: 'nombre_categoria', label: 'Nombre', max: 20, required: true },
  ] },
  productos: { title: 'Productos', kind: 'productos', table: 'productos', id: 'id_producto', search: ['nombre', 'categoria'], columns: [['Producto', 'nombre'], ['Categoría', 'categoria'], ['Tipo', 'tipo_producto'], ['Presentación', 'presentacion'], ['Unidad', 'unidad_medida'], ['Peso por bolsa (kg)', 'peso_unidad_kg'], ['P. Compra', 'precio_compra'], ['P. Detal', 'precio_venta_detal'], ['P. Mayorista', 'precio_venta_mayorista'], ['Stock (calculado)', 'stock'], ['Stock mínimo', 'stock_minimo']], fields: [
    { key: 'id_categoria', label: 'Categoría', type: 'select', required: true },
    { key: 'tipo_producto', label: 'Tipo de producto', type: 'select', options: [{ value: 'Fresca', label: 'Fresca' }, { value: 'Congelada', label: 'Congelada' }], required: true },
    { key: 'presentacion', label: 'Presentación', max: 40, required: true },
    { key: 'precio_compra', label: 'Precio de compra', type: 'number', required: true },
    { key: 'precio_venta_detal', label: 'Precio venta detal', type: 'number', required: true },
    { key: 'precio_venta_mayorista', label: 'Precio venta mayorista', type: 'number', required: true },
    { key: 'peso_unidad_kg', label: 'Peso por bolsa (kg)', type: 'number' },
    { key: 'stock_minimo', label: 'Stock mínimo', type: 'number', required: true },
  ] },
  proveedores: { title: 'Proveedores', kind: 'proveedores', table: 'proveedores', id: 'id_proveedor', search: ['nombre_proveedor', 'municipio'], columns: [['Nombre', 'nombre_proveedor'], ['Teléfono', 'telefono'], ['Correo', 'correo'], ['Dirección', 'direccion'], ['Departamento', 'departamento'], ['Municipio', 'municipio']], fields: [
    { key: 'nombre_proveedor', label: 'Nombre', max: 50, required: true }, { key: 'telefono', label: 'Teléfono', max: 15 },
    { key: 'correo', label: 'Correo', type: 'email', max: 30 }, { key: 'direccion', label: 'Dirección', max: 40 },
    { key: 'id_departamento', label: 'Departamento', type: 'select' }, { key: 'id_municipio', label: 'Municipio', type: 'select' },
  ] },
  clientes: { title: 'Clientes', kind: 'clientes', table: 'clientes', id: 'numero_documento', search: ['nombre_cliente', 'numero_documento', 'correo'], columns: [['Tipo documento', 'tipo_documento'], ['Número documento', 'numero_documento'], ['Nombre', 'nombre_cliente'], ['Teléfono', 'telefono'], ['Correo', 'correo'], ['Dirección', 'direccion'], ['Departamento', 'departamento'], ['Municipio', 'municipio'], ['Total histórico (calculado)', 'total']], fields: [
    { key: 'tipo_documento', label: 'Tipo de documento', type: 'select', options: documentOptions, required: true },
    { key: 'numero_documento', label: 'Número de documento', max: 15, required: true },
    { key: 'nombre_cliente', label: 'Nombre / razón social', max: 100, required: true },
    { key: 'telefono', label: 'Teléfono', max: 15 }, { key: 'correo', label: 'Correo', type: 'email', max: 100 },
    { key: 'direccion', label: 'Dirección', max: 120 },
    { key: 'id_departamento', label: 'Departamento', type: 'select' }, { key: 'id_municipio', label: 'Municipio', type: 'select' },
  ] },
}

function idOf(kind: ModuleKey, row: Row): string | number {
  return row[kind === 'usuarios' ? 'id_usuario' : kind === 'categorias' ? 'id_categoria' : kind === 'productos' ? 'id_producto' : kind === 'proveedores' ? 'id_proveedor' : kind === 'clientes' ? 'numero_documento' : 'id_rol'] as string | number
}
function rowsFor(state: AppState, kind: Exclude<ModuleKey, 'roles'>): Row[] {
  if (kind === 'usuarios') return state.usuarios.map(row => ({ ...row, nombre_completo: `${row.nombre} ${row.apellido}`, rol: state.roles.find(r => r.id_rol === row.id_rol)?.nombre_rol ?? '—' }))
  if (kind === 'categorias') return state.categorias.map(row => ({ ...row, productos_count: state.productos.filter(p => p.id_categoria === row.id_categoria).length }))
  if (kind === 'productos') return state.productos.map(row => ({
    ...row, nombre: productName(state, row.id_producto),
    categoria: state.categorias.find(c => c.id_categoria === row.id_categoria)?.nombre_categoria ?? '',
    stock: `${quantityLabel(sellableStock(state, row.id_producto))} ${quantityUnit(sellableStock(state, row.id_producto), row.unidad_medida)}`,
    sellable_stock: sellableStock(state, row.id_producto),
    expired_stock: stockVencido(state, row.id_producto),
    expired_kg: stockVencido(state, row.id_producto) * (row.peso_unidad_kg ?? 1),
  }))
  if (kind === 'clientes') return state.clientes.map(row => ({
    ...row,
    municipio: state.municipios.find(item => item.id_municipio === row.id_municipio)?.nombre_municipio ?? '—',
    departamento: state.departamentos.find(department => department.id_departamento === state.municipios.find(item => item.id_municipio === row.id_municipio)?.id_departamento)?.nombre_departamento ?? '—',
    total: fmt(clientHistory(state, row.numero_documento).reduce((sum, item) => sum + item.venta.total_pagar, 0)),
  }))
  return kind === 'proveedores' ? state.proveedores.map(row => ({
    ...row, municipio: state.municipios.find(item => item.id_municipio === row.id_municipio)?.nombre_municipio ?? '—',
    departamento: state.departamentos.find(department => department.id_departamento === state.municipios.find(item => item.id_municipio === row.id_municipio)?.id_departamento)?.nombre_departamento ?? '—',
  })) : []
}
function messageOf(error: unknown) { return error instanceof Error ? error.message : 'No fue posible completar la operación.' }
function formInitial(kind: Exclude<ModuleKey, 'roles'>, state: AppState, row?: Row): Record<string, string> {
  if (!row) return { estado: 'true' }
  const config = configs[kind]
  const values = Object.fromEntries(config.fields.map(field => [field.key, row[field.key] == null ? '' : String(row[field.key])]))
  values.estado = String(row.estado)
  if (kind === 'proveedores' || kind === 'clientes') {
    const municipality = state.municipios.find(item => item.id_municipio === Number(row.id_municipio))
    values.id_departamento = municipality ? String(municipality.id_departamento) : ''
  }
  return values
}
function inputError(field: FieldDef, value: string) {
  if (field.required && !value.trim()) return 'Este campo es obligatorio'
  if (field.key === 'correo' && value && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) return 'El correo electrónico no posee un formato válido.'
  if (['nombre', 'apellido', 'nombre_categoria', 'nombre_rol', 'nombre_proveedor', 'nombre_cliente'].includes(field.key) && value && !/^[\p{L}\p{N}\s.'-]+$/u.test(value)) return 'No se permiten caracteres especiales'
  if (field.key === 'contrasenia' && value && (value.length < 8 || !/[A-Za-z]/.test(value) || !/\d/.test(value))) return 'La contraseña debe tener al menos 8 caracteres e incluir letras y números.'
  if (field.key === 'peso_unidad_kg' && (!Number.isFinite(Number(value)) || Number(value) <= 0)) return 'El peso por bolsa debe ser mayor a cero.'
  if (['precio_compra', 'precio_venta_detal', 'precio_venta_mayorista', 'stock_minimo'].includes(field.key) && (!Number.isFinite(Number(value)) || Number(value) < 0)) return 'Ingrese un valor mayor o igual a cero.'
  return ''
}

function exportProductStock(state: AppState, format: 'excel' | 'pdf') {
  const rows = stockByLot(state).map(lot => {
    const product = state.productos.find(item => item.id_producto === lot.detail?.id_producto)
    return {
      producto: product ? productName(state, product.id_producto) : 'Producto desconocido',
      numero_lote: lot.numero_lote,
      ubicacion: state.ubicaciones.find(item => item.id_ubicacion === lot.id_ubicacion)?.nombre_ubicacion ?? '—',
      vencimiento: lot.fecha_vencimiento,
      estado: expiryStatus(lot.fecha_vencimiento),
      cantidad_disponible: `${quantityLabel(lot.cantidad_disponible)} ${product ? quantityUnit(lot.cantidad_disponible, product.unidad_medida) : ''}`,
      activo: lot.estado ? 'Activo' : 'Inactivo',
    }
  })
  if (format === 'excel') {
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), 'Existencias por lote')
    XLSX.writeFile(book, 'existencias-fresas-oriente.xlsx')
    return
  }
  const doc = new jsPDF({ orientation: 'landscape' })
  doc.text('Existencias por lote · Fresas del Oriente', 14, 14)
  autoTable(doc, {
    head: [['Producto', 'N° lote', 'Ubicación', 'Vencimiento', 'Estado', 'Disponible', 'Activo']],
    body: rows.map(row => [row.producto, row.numero_lote, row.ubicacion, row.vencimiento, row.estado, row.cantidad_disponible, row.activo]),
  })
  doc.save('existencias-fresas-oriente.pdf')
}

function MasterDetail({ state, kind, row }: { state: AppState; kind: Exclude<ModuleKey, 'roles'>; row: Row }) {
  const details = configs[kind].fields
    .filter(field => field.key !== 'contrasenia' && field.key !== 'id_departamento')
    .map(field => {
      let value = row[field.key]
      if (field.key === 'id_rol') value = state.roles.find(item => item.id_rol === Number(value))?.nombre_rol ?? '—'
      if (field.key === 'id_categoria') value = state.categorias.find(item => item.id_categoria === Number(value))?.nombre_categoria ?? '—'
      if (field.key === 'id_municipio') value = state.municipios.find(item => item.id_municipio === Number(value))?.nombre_municipio ?? '—'
      if (field.key.startsWith('precio_')) value = value == null ? '—' : fmt(Number(value))
      return [field.label, value == null || value === '' ? '—' : String(value)] as const
    })
  const municipality = state.municipios.find(item => item.id_municipio === Number(row.id_municipio))
  const department = municipality && state.departamentos.find(item => item.id_departamento === municipality.id_departamento)
  if (kind === 'proveedores' || kind === 'clientes') details.splice(details.length - 1, 0, ['Departamento', department?.nombre_departamento ?? '—'])
  if (kind === 'productos') {
    details.push(['Unidad (automática)', String(row.unidad_medida)])
    details.push(['Stock vendible', `${quantityLabel(stockVendible(state, Number(row.id_producto)))} ${quantityUnit(stockVendible(state, Number(row.id_producto)), String(row.unidad_medida))}`])
    details.push(['Stock vencido', `${quantityLabel(stockVencido(state, Number(row.id_producto)))} ${quantityUnit(stockVencido(state, Number(row.id_producto)), String(row.unidad_medida))}`])
  }
  if (kind === 'categorias') details.push(['Productos (calculado)', String(state.productos.filter(item => item.id_categoria === Number(row.id_categoria)).length)])
  if (kind === 'clientes') {
    const history = clientHistory(state, String(row.numero_documento))
    details.push(['Total histórico (calculado)', fmt(history.reduce((sum, item) => sum + item.venta.total_pagar, 0))])
  }
  details.push(['Estado', row.estado ? 'Activo' : 'Inactivo'])
  const lots = kind === 'productos' ? stockByLot(state, Number(row.id_producto)) : []
  return <>
    {details.map(([label, value]) => <div className="detail-row" key={label}><span>{label}</span><strong>{value}</strong></div>)}
    {kind === 'productos' && <section className="product-lot-detail">
      <h3>Existencias por lote</h3>
      <div className="card table-scroll"><table className="data-table"><thead><tr><th>N° lote</th><th>Ubicación</th><th>Vencimiento</th><th>Cantidad disponible</th></tr></thead><tbody>
        {lots.map(lot => {
          const status = expiryStatus(lot.fecha_vencimiento)
          return <tr key={lot.id_lote}>
            <td data-label="N° lote">{lot.numero_lote}</td>
            <td data-label="Ubicación">{state.ubicaciones.find(item => item.id_ubicacion === lot.id_ubicacion)?.nombre_ubicacion ?? '—'}</td>
            <td data-label="Vencimiento">{lot.fecha_vencimiento} <span className={`badge ${status === 'vencido' ? 'badge-red' : status === 'activo' ? 'badge-green' : 'badge-amber'}`}>{status === 'vencido' ? 'Vencido' : status === 'activo' ? 'Vigente' : status === 'critico' ? 'Vence pronto' : 'Por vencer'}</span></td>
            <td data-label="Cantidad disponible">{quantityLabel(lot.cantidad_disponible)} {quantityUnit(lot.cantidad_disponible, String(row.unidad_medida))}</td>
          </tr>
        })}
        {!lots.length && <tr><td colSpan={4} className="table-empty">No hay lotes registrados para este producto.</td></tr>}
      </tbody></table></div>
    </section>}
    {kind === 'clientes' && <section className="product-lot-detail">
      <h3>Historial de ventas</h3>
      {clientHistory(state, String(row.numero_documento)).map(({ venta, details: lines }) => <div className="detail-row" key={venta.id_venta}>
        <span>{formatId('V', venta.id_venta)} · {localDateFromTimestamp(venta.fecha_venta)} · {lines.map(line => productName(state, line.id_producto)).join(', ')}</span><strong>{fmt(venta.total_pagar)}</strong>
      </div>)}
      {!clientHistory(state, String(row.numero_documento)).length && <div className="table-empty">No hay ventas activas registradas.</div>}
    </section>}
  </>
}

export function MasterPage({ kind }: { kind: Exclude<ModuleKey, 'roles'> }) {
  const state = useStore()
  const toast = useToast()
  const config = configs[kind]
  const singular = kind === 'categorias' ? 'categoría' : kind === 'productos' ? 'producto' : kind === 'proveedores' ? 'proveedor' : kind === 'clientes' ? 'cliente' : 'usuario'
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [highlightedId, setHighlightedId] = useState<string | number | null>(null)
  const [filters, setFilters] = useState<MasterFilters>({ role: '', status: '', category: '', productType: '', lowStock: false, municipality: '', documentType: '' })
  const [modal, setModal] = useState<'new' | 'edit' | 'detail' | 'history' | ''>('')
  const [selected, setSelected] = useState<Row | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [confirm, setConfirm] = useState<Row | null>(null)
  useEffect(() => {
    if (highlightedId === null) return
    const timer = window.setTimeout(() => setHighlightedId(null), 3000)
    return () => window.clearTimeout(timer)
  }, [highlightedId])
  const user = state.usuarios.find(item => item.id_usuario === Number(sessionStorage.getItem('fresas-user-id')))
  const moduleName = kind === 'categorias' ? 'Categorías' : kind === 'productos' ? 'Productos'
    : kind === 'proveedores' ? 'Proveedores' : kind === 'clientes' ? 'Clientes' : 'Usuarios'
  const canFilter = user?.id_rol === 1 || canModuleAction(state, user?.id_rol ?? -1, moduleName, 'Filtrar')
  const canView = user?.id_rol === 1 || canModuleAction(state, user?.id_rol ?? -1, moduleName, 'Ver detalle')
  const canCreate = user?.id_rol === 1 || canModuleAction(state, user?.id_rol ?? -1, moduleName, 'Registrar')
  const canUpdate = user?.id_rol === 1 || canModuleAction(state, user?.id_rol ?? -1, moduleName, 'Editar')
  const canChangeState = user?.id_rol === 1 || canModuleAction(state, user?.id_rol ?? -1, moduleName, 'Cambiar estado')
  const canExport = kind === 'productos' && (user?.id_rol === 1 || canModuleAction(state, user?.id_rol ?? -1, moduleName, 'Exportar'))
  const exportStock = (format: 'excel' | 'pdf') => {
    try {
      exportProductStock(state, format)
      toast('success', `${format === 'excel' ? 'Excel' : 'PDF'} exportado`, 'Las existencias por lote se descargaron correctamente.')
    } catch (error) {
      toast('error', 'No se pudieron exportar las existencias', messageOf(error))
    }
  }
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
    if (kind === 'productos' && filters.lowStock && !stockBajo(state, Number(row.id_producto))) return false
    if (kind === 'proveedores' && filters.municipality && String(row.id_municipio ?? '') !== filters.municipality) return false
    if (kind === 'clientes' && filters.documentType && String(row.tipo_documento) !== filters.documentType) return false
    return true
  })
  const shown = filtered.slice((page - 1) * 10, page * 10)
  const openNew = () => { setSelected(null); setValues({ estado: 'true' }); setErrors({}); setModal('new') }
  const openEdit = (row: Row) => { setSelected(row); setValues(formInitial(kind, state, row)); setErrors({}); setModal('edit') }
  const save = () => {
    const formFields = config.fields.filter(field => !(kind === 'productos' && field.key === 'peso_unidad_kg' && values.tipo_producto !== 'Congelada') && !(kind === 'usuarios' && modal === 'edit' && field.key === 'contrasenia'))
    const nextErrors = Object.fromEntries(formFields.map(field => [field.key, inputError(field, values[field.key] ?? '')]).filter(([, error]) => error))
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); return }
    try {
      const payload = { ...values }
      delete payload.id_departamento
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
  return <section>
    <div className="page-toolbar">
      {canFilter && <SearchBar placeholder={`Buscar ${config.title.toLowerCase()}...`} value={query} onChange={value => { setQuery(value); setPage(1) }} />}
      {canFilter && <FilterPopover activeCount={activeFilterCount} onClear={clearFilters}>
        {kind === 'usuarios' && <Field label="Rol"><select className="select" value={filters.role} onChange={event => setFilter('role', event.target.value)}><option value="">Todos los roles</option>{state.roles.map(role => <option key={role.id_rol} value={role.id_rol}>{role.nombre_rol}</option>)}</select></Field>}
        {kind === 'productos' && <>
          <Field label="Categoría"><select className="select" value={filters.category} onChange={event => setFilter('category', event.target.value)}><option value="">Todas las categorías</option>{state.categorias.map(category => <option key={category.id_categoria} value={category.id_categoria}>{category.nombre_categoria}</option>)}</select></Field>
          <Field label="Tipo"><select className="select" value={filters.productType} onChange={event => setFilter('productType', event.target.value)}><option value="">Todos los tipos</option><option>Fresca</option><option>Congelada</option></select></Field>
          <label className="filter-check"><input type="checkbox" checked={filters.lowStock} onChange={event => setFilter('lowStock', event.target.checked)} /> Solo stock bajo</label>
        </>}
        {kind === 'proveedores' && <Field label="Municipio"><select className="select" value={filters.municipality} onChange={event => setFilter('municipality', event.target.value)}><option value="">Todos los municipios</option>{state.municipios.map(municipality => <option key={municipality.id_municipio} value={municipality.id_municipio}>{municipality.nombre_municipio}</option>)}</select></Field>}
        {kind === 'clientes' && <Field label="Tipo de documento"><select className="select" value={filters.documentType} onChange={event => setFilter('documentType', event.target.value)}><option value="">Todos los documentos</option>{documentOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>}
        {(kind === 'usuarios' || kind === 'categorias' || kind === 'productos' || kind === 'proveedores' || kind === 'clientes') && <Field label="Estado"><select className="select" value={filters.status} onChange={event => setFilter('status', event.target.value)}><option value="">Todos los estados</option><option value="true">Activo</option><option value="false">Inactivo</option></select></Field>}
      </FilterPopover>}
      {canExport && <><button className="btn-secondary" onClick={() => exportStock('excel')}><Ic d={P.download} size={14} /> Exportar existencias · Excel</button><button className="btn-secondary" onClick={() => exportStock('pdf')}><Ic d={P.download} size={14} /> Exportar existencias · PDF</button></>}
      {canCreate && <button className="btn-primary" onClick={openNew}><Ic d={P.plus} size={15} /> Registrar {singular}</button>}
    </div>
    <div className="card table-scroll">
      <table className="data-table"><thead><tr>{config.columns.map(([label]) => <th key={label}>{label}</th>)}<th>Estado</th><th>Acciones</th></tr></thead>
        <tbody>{shown.map(row => <tr key={String(idOf(kind, row))} className={highlightedId === idOf(kind, row) ? 'row-highlight' : undefined}>
          {config.columns.map(([label, key]) => <td data-label={label} key={label}>
            {kind === 'productos' && key === 'stock' ? <><strong>{String(row.stock)}</strong>{stockBajo(state, Number(row.id_producto)) && <span className="badge badge-amber">Bajo</span>}{Number(row.expired_kg) > 0 && <small className="cell-sub">{quantityLabel(Number(row.expired_kg))} kg vencidos</small>}</> :
              key === 'peso_unidad_kg' ? row[key] == null ? '—' : `${quantityLabel(Number(row[key]))} kg` :
                key === 'stock_minimo' ? `${quantityLabel(Number(row[key]))} ${quantityUnit(Number(row[key]), String(row.unidad_medida))}` :
                ['precio_compra', 'precio_venta_detal', 'precio_venta_mayorista'].includes(key) ? fmt(Number(row[key])) :
                  key === 'total' ? String(row[key]) :
                    String(row[key] ?? '—')}
          </td>)}
          <td data-label="Estado"><span className={`badge ${row.estado ? 'badge-green' : 'badge-red'}`}>{row.estado ? 'Activo' : 'Inactivo'}</span></td>
          <td data-label="Acciones"><div className="actions">
            {canView && <ViewBtn onClick={() => { setSelected(row); setModal('detail') }} />}
            {canUpdate && !(kind === 'clientes' && row.numero_documento === '222222222222') && <EditBtn onClick={() => openEdit(row)} />}
            {canChangeState && !(kind === 'clientes' && row.numero_documento === '222222222222') && <Toggle active={Boolean(row.estado)} onChange={() => setConfirm(row)} />}
          </div></td>
        </tr>)}
        {!shown.length && <tr><td colSpan={config.columns.length + 2} className="table-empty">No se encontraron {config.title.toLowerCase()} que coincidan con la búsqueda.</td></tr>}
        </tbody>
      </table>
    </div>
    <Pagination page={page} total={filtered.length} onPageChange={setPage} />
    <Modal open={modal === 'new' || modal === 'edit'} title={`${modal === 'new' ? 'Registrar' : 'Editar'} ${singular}`} onClose={() => setModal('')} wide>
      <div className="form-grid">{config.fields.filter(field => !(kind === 'usuarios' && modal === 'edit' && field.key === 'contrasenia') && !(kind === 'productos' && field.key === 'peso_unidad_kg' && values.tipo_producto !== 'Congelada')).map(field => <Field key={field.key} label={field.label}>
        {field.type === 'select' ? <select className={`select ${errors[field.key] ? 'input-error' : ''}`} disabled={field.key === 'id_municipio' && !values.id_departamento} value={values[field.key] ?? ''} onChange={event => {
          setValues(prev => ({ ...prev, [field.key]: event.target.value, ...(field.key === 'id_departamento' ? { id_municipio: '' } : {}) }))
          setErrors(prev => ({ ...prev, [field.key]: '', ...(field.key === 'id_departamento' ? { id_municipio: '' } : {}) }))
        }}>
          <option value="">Seleccione...</option>
          {(field.options ?? (field.key === 'id_rol' ? state.roles.filter(role => role.estado).map(role => ({ value: String(role.id_rol), label: role.nombre_rol }))
            : field.key === 'id_municipio' ? state.municipios.filter(municipality => !values.id_departamento || String(municipality.id_departamento) === values.id_departamento).map(municipality => ({ value: String(municipality.id_municipio), label: municipality.nombre_municipio }))
              : field.key === 'id_departamento' ? state.departamentos.map(department => ({ value: String(department.id_departamento), label: department.nombre_departamento }))
                : state.categorias.filter(category => category.estado).map(category => ({ value: String(category.id_categoria), label: category.nombre_categoria })))).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select> : <input className={`input ${errors[field.key] ? 'input-error' : ''}`} type={field.type ?? 'text'} maxLength={field.max} value={values[field.key] ?? ''} onChange={event => setValues(prev => ({ ...prev, [field.key]: event.target.value }))} />}
        {errors[field.key] && <small className="field-error">{errors[field.key]}</small>}
      </Field>)}</div>
      {kind === 'productos' && <div className="detail-row"><span>Unidad (automática)</span><strong>{values.tipo_producto === 'Congelada' ? 'bolsa' : 'kg'}</strong></div>}
      <Field label="Estado">{canChangeState && !(kind === 'usuarios' && Number(selected?.id_usuario) === Number(sessionStorage.getItem('fresas-user-id'))) ? <Toggle active={values.estado === 'true'} onChange={() => setValues(previous => ({ ...previous, estado: previous.estado === 'true' ? 'false' : 'true' }))} /> : <span className={`badge ${values.estado === 'true' ? 'badge-green' : 'badge-red'}`}>{values.estado === 'true' ? 'Activo' : 'Inactivo'}</span>}</Field>
      <div className="modal-actions"><button className="btn-secondary" onClick={() => setModal('')}>Cancelar</button>{(modal === 'new' ? canCreate : canUpdate) && <button className="btn-primary" onClick={save}>{modal === 'new' ? 'Registrar' : 'Guardar'}</button>}</div>
    </Modal>
    <Modal open={modal === 'detail'} title={`Detalle de ${config.title.slice(0, -1).toLowerCase()}`} onClose={() => setModal('')}>
      {selected && <MasterDetail state={state} kind={kind} row={selected} />}
    </Modal>
    <ConfirmModal open={!!confirm} title={kind === 'productos' ? '¿Cambiar estado del producto?' : kind === 'categorias' ? '¿Cambiar estado de la categoría?' : '¿Cambiar estado?'} message={kind === 'categorias' && confirm && rowsFor(state, 'categorias').some(row => row.id_categoria === confirm.id_categoria && state.productos.some(product => product.id_categoria === confirm.id_categoria && sellableStock(state, product.id_producto) > 0)) ? 'Existen productos con inventario asociados a esta categoría.' : 'Esta acción cambiará la disponibilidad del registro.'} actionLabel="Cambiar estado" onCancel={() => setConfirm(null)} onConfirm={() => confirm && toggle(confirm)} />
  </section>
}

export function RolesPage() {
  const state = useStore()
  const toast = useToast()
  const user = state.usuarios.find(item => item.id_usuario === Number(sessionStorage.getItem('fresas-user-id')))
  const canFilter = user?.id_rol === 1 || canModuleAction(state, user?.id_rol ?? -1, 'Roles y permisos', 'Filtrar')
  const canView = user?.id_rol === 1 || canModuleAction(state, user?.id_rol ?? -1, 'Roles y permisos', 'Ver detalle')
  const canCreate = user?.id_rol === 1 || canModuleAction(state, user?.id_rol ?? -1, 'Roles y permisos', 'Registrar')
  const canUpdate = user?.id_rol === 1 || canModuleAction(state, user?.id_rol ?? -1, 'Roles y permisos', 'Editar')
  const canChangeState = user?.id_rol === 1 || canModuleAction(state, user?.id_rol ?? -1, 'Roles y permisos', 'Cambiar estado')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [highlightedId, setHighlightedId] = useState<number | null>(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [modal, setModal] = useState(false)
  const [editable, setEditable] = useState(true)
  const [role, setRole] = useState<AppState['roles'][number] | null>(null)
  const [name, setName] = useState('')
  const [roleState, setRoleState] = useState(true)
  const [selectedPerms, setSelectedPerms] = useState<Array<{ id_permiso: number; id_privilegio: number }>>([])
  const [confirm, setConfirm] = useState<number | null>(null)
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  useEffect(() => {
    if (highlightedId === null) return
    const timer = window.setTimeout(() => setHighlightedId(null), 3000)
    return () => window.clearTimeout(timer)
  }, [highlightedId])
  const open = (item?: AppState['roles'][number], allowEdit = true) => {
    setRole(item ?? null); setName(item?.nombre_rol ?? '')
    setEditable(allowEdit)
    setRoleState(item?.estado ?? true)
    setSelectedPerms(item ? state.roles_x_permisos.filter(p => p.id_rol === item.id_rol).map(({ id_permiso, id_privilegio }) => ({ id_permiso, id_privilegio })) : [])
    setFormErrors({})
    setModal(true)
  }
  const toggle = (id_permiso: number, id_privilegio: number) => {
    const exists = selectedPerms.some(row => row.id_permiso === id_permiso && row.id_privilegio === id_privilegio)
    const consultId = state.privilegios.find(item => item.nombre_privilegio === 'Consultar')?.id_privilegio
    let next = exists
      ? selectedPerms.filter(row => row.id_permiso !== id_permiso || row.id_privilegio !== id_privilegio)
      : [...selectedPerms, { id_permiso, id_privilegio }]
    if (id_privilegio === consultId && exists) next = next.filter(row => row.id_permiso !== id_permiso)
    if (id_privilegio !== consultId && !exists && consultId !== undefined
      && state.permisos_privilegios.some(pair => pair.id_permiso === id_permiso && pair.id_privilegio === consultId)
      && !next.some(row => row.id_permiso === id_permiso && row.id_privilegio === consultId)) {
      next.push({ id_permiso, id_privilegio: consultId })
    }
    if (id_privilegio !== consultId && exists
      && !next.some(row => row.id_permiso === id_permiso && row.id_privilegio !== consultId)) {
      next = next.filter(row => row.id_permiso !== id_permiso)
    }
    setSelectedPerms(next)
    if (next.length) setFormErrors(errors => ({ ...errors, permissions: '' }))
  }
  const toggleRow = (permissionId: number) => {
    const valid = state.permisos_privilegios.filter(pair => pair.id_permiso === permissionId)
    const selected = valid.filter(pair => selectedPerms.some(item => item.id_permiso === pair.id_permiso && item.id_privilegio === pair.id_privilegio)).length
    const add = selected < valid.length
    const next = selectedPerms.filter(item => item.id_permiso !== permissionId)
    if (add) next.push(...valid)
    setSelectedPerms(next)
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
      const savedState = saveMaster(getState(), 'rol', { nombre_rol: name, estado: role?.id_rol === 1 ? 'true' : String(roleState) }, role?.id_rol, selectedPerms)
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
  const moduleCards = state.permisos.map(permission => {
    const validPairs = state.permisos_privilegios.filter(pair => pair.id_permiso === permission.id_permiso)
      .map(pair => ({ pair, privilege: state.privilegios.find(item => item.id_privilegio === pair.id_privilegio)! }))
      .sort((a, b) => (moduleActions[permission.nombre_permiso as keyof typeof moduleActions] as readonly string[]).indexOf(a.privilege.nombre_privilegio)
        - (moduleActions[permission.nombre_permiso as keyof typeof moduleActions] as readonly string[]).indexOf(b.privilege.nombre_privilegio))
    const selectedCount = validPairs.filter(({ pair }) => selectedPerms.some(item => item.id_permiso === pair.id_permiso && item.id_privilegio === pair.id_privilegio)).length
    return { permission, validPairs, selectedCount }
  })
  return <section>
    <div className="page-toolbar">{canFilter && <SearchBar placeholder="Buscar por nombre de rol..." value={search} onChange={value => { setSearch(value); setPage(1) }} />}
      {canFilter && <FilterPopover activeCount={statusFilter ? 1 : 0} onClear={() => { setStatusFilter(''); setPage(1) }}>
        <Field label="Estado"><select className="select" value={statusFilter} onChange={event => { setStatusFilter(event.target.value); setPage(1) }}><option value="">Todos los estados</option><option value="true">Activo</option><option value="false">Inactivo</option></select></Field>
      </FilterPopover>}
      {canCreate && <button className="btn-primary" onClick={() => open()}><Ic d={P.plus} size={15} /> Registrar rol</button>}</div>
    <div className="card table-scroll"><table className="data-table"><thead><tr>{['Nombre', 'Usuarios (calculado)', 'Permisos activos (calculado)', 'Estado', 'Acciones'].map(item => <th key={item}>{item}</th>)}</tr></thead><tbody>
      {shown.map(item => { const count = state.roles_x_permisos.filter(pair => pair.id_rol === item.id_rol && state.permisos_privilegios.some(valid => valid.id_permiso === pair.id_permiso && valid.id_privilegio === pair.id_privilegio)).length; const totalValid = state.permisos_privilegios.length; return <tr key={item.id_rol} className={highlightedId === item.id_rol ? 'row-highlight' : undefined}><td data-label="Nombre"><strong>{item.nombre_rol}</strong></td><td data-label="Usuarios">{state.usuarios.filter(member => member.id_rol === item.id_rol).length}</td><td data-label="Permisos activos"><div className="progress"><span style={{ width: `${totalValid ? count / totalValid * 100 : 0}%` }} /></div>{count}/{totalValid}</td><td data-label="Estado"><span className={`badge ${item.estado ? 'badge-green' : 'badge-red'}`}>{item.estado ? 'Activo' : 'Inactivo'}</span></td><td data-label="Acciones"><div className="actions">{canView && <ViewBtn onClick={() => open(item, false)} />}{canUpdate && <PermBtn title="Editar permisos" onClick={() => open(item, true)} />}{canChangeState && item.id_rol !== 1 && <Toggle active={item.estado} onChange={() => setConfirm(item.id_rol)} />}</div></td></tr> })}
      {!shown.length && <tr><td colSpan={5} className="table-empty">No se encontraron roles que coincidan con la búsqueda.</td></tr>}
    </tbody></table></div><Pagination page={page} total={rows.length} onPageChange={setPage} />
    <Modal open={modal} title={role ? `${editable ? 'Editar' : 'Detalle de'} rol: ${role.nombre_rol}` : 'Registrar rol'} onClose={() => setModal(false)} wide>
      <Field label="Nombre del rol"><input className={`input ${formErrors.name ? 'input-error' : ''}`} maxLength={30} value={name} disabled={!editable} onChange={e => { setName(e.target.value); setFormErrors(prev => ({ ...prev, name: '' })) }} />{formErrors.name && <small className="field-error">{formErrors.name}</small>}</Field>
      <Field label="Estado">{canChangeState && editable && role?.id_rol !== 1 ? <Toggle active={roleState} onChange={() => setRoleState(value => !value)} /> : <span className={`badge ${(role?.id_rol === 1 || roleState) ? 'badge-green' : 'badge-red'}`}>{(role?.id_rol === 1 || roleState) ? 'Activo' : 'Inactivo'}</span>}</Field>
      <div className={`permission-cards ${formErrors.permissions ? 'matrix-error' : ''}`}>
        {moduleCards.map(({ permission, validPairs, selectedCount }) => <article className="permission-card" key={permission.id_permiso}>
          <header className="permission-card-header">
            <h3>{permission.nombre_permiso}</h3>
            <span className="permission-count">{selectedCount}/{validPairs.length}</span>
            <button type="button" className="link-button" disabled={!editable || !validPairs.length} onClick={() => toggleRow(permission.id_permiso)}>
              {selectedCount === validPairs.length && validPairs.length > 0 ? 'Quitar todo' : 'Marcar todo'}
            </button>
          </header>
          <div className="permission-card-actions">{validPairs.map(({ pair, privilege }) => <label className="permission-check" key={pair.id_privilegio}>
            <input type="checkbox" disabled={!editable} checked={selectedPerms.some(item => item.id_permiso === pair.id_permiso && item.id_privilegio === pair.id_privilegio)} onChange={() => toggle(pair.id_permiso, pair.id_privilegio)} />
            <span>{privilege.nombre_privilegio === 'Consultar' ? 'Consultar (acceso al módulo)' : privilege.nombre_privilegio}</span>
          </label>)}</div>
        </article>)}
      </div>{formErrors.permissions && <small className="field-error">{formErrors.permissions}</small>}
      <div className="modal-actions"><button className="btn-secondary" onClick={() => setModal(false)}>Cerrar</button>{editable && (role ? canUpdate : canCreate) && <button className="btn-primary" onClick={save}>Guardar</button>}</div>
    </Modal>
    {canChangeState && <ConfirmModal open={confirm !== null} title="¿Cambiar estado del rol?" message="El rol dejará de estar disponible para asignación." actionLabel="Cambiar estado" onCancel={() => setConfirm(null)} onConfirm={() => {
      try { updateStore(toggleMasterState(getState(), 'rol', confirm!)); toast('success', 'Estado actualizado', 'El estado del rol fue actualizado.') } catch (error) { toast('error', 'Error al cambiar estado', messageOf(error)) }
      setConfirm(null)
    }} />}
  </section>
}

export function PurchasePage() {
  const state = useStore(); const toast = useToast()
  const user = state.usuarios.find(item => item.id_usuario === Number(sessionStorage.getItem('fresas-user-id')))
  const canFilter = user?.id_rol === 1 || canModuleAction(state, user?.id_rol ?? -1, 'Compras', 'Filtrar')
  const canView = user?.id_rol === 1 || canModuleAction(state, user?.id_rol ?? -1, 'Compras', 'Ver detalle')
  const canCreate = user?.id_rol === 1 || canModuleAction(state, user?.id_rol ?? -1, 'Compras', 'Registrar')
  const canEdit = user?.id_rol === 1 || canModuleAction(state, user?.id_rol ?? -1, 'Compras', 'Editar')
  const canDelete = user?.id_rol === 1 || canModuleAction(state, user?.id_rol ?? -1, 'Compras', 'Anular')
  const canAssociateLot = user?.id_rol === 1 || canModuleAction(state, user?.id_rol ?? -1, 'Compras', 'Asociar lote')
  const canExport = user?.id_rol === 1 || canModuleAction(state, user?.id_rol ?? -1, 'Compras', 'Exportar')
  const [open, setOpen] = useState(false); const [query, setQuery] = useState(''); const [page, setPage] = useState(1); const [cancelId, setCancelId] = useState<number | null>(null)
  const [purchaseFilters, setPurchaseFilters] = useState({ supplier: '', status: '', from: '', to: '' })
  const [editingPurchaseId, setEditingPurchaseId] = useState<number | null>(null)
  const [supplier, setSupplier] = useState(''); const [date, setDate] = useState(localDateString()); const [observations, setObservations] = useState('')
  const [lines, setLines] = useState<PurchaseLineDraft[]>([])
  const [discountValue, setDiscountValue] = useState(''); const [ivaValue, setIvaValue] = useState('')
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [detailPurchaseId, setDetailPurchaseId] = useState<number | null>(null)
  const [associatePurchaseId, setAssociatePurchaseId] = useState<number | null>(null)
  const [associateDetailId, setAssociateDetailId] = useState(''); const [associateLotNumber, setAssociateLotNumber] = useState('')
  const [associateExpiry, setAssociateExpiry] = useState(''); const [associatePack, setAssociatePack] = useState<TipoEmpaque>('Bulto')
  const [associateLocation, setAssociateLocation] = useState(() => localStorage.getItem('fresas-last-purchase-location') ?? '315'); const [associateErrors, setAssociateErrors] = useState<Record<string, string>>({})
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
  const discount = chargeAmount(discountValue)
  const iva = chargeAmount(ivaValue)
  const total = roundMoney(subtotal - discount + iva)
  const editingLocked = editingPurchaseId !== null && purchaseHasMovements(state, editingPurchaseId)
  const clearError = (key: string) => setFormErrors(previous => ({ ...previous, [key]: '' }))
  const openNewPurchase = () => {
    setEditingPurchaseId(null)
    setSupplier('')
    setDate(localDateString())
    setObservations('')
    setLines([newPurchaseLine(state)])
    setDiscountValue('')
    setIvaValue('')
    setFormErrors({})
    setOpen(true)
  }
  const openEditPurchase = (purchaseId: number) => {
    const purchase = state.compras.find(row => row.id_compra === purchaseId)
    if (!purchase) return
    const purchaseDate = localDateFromTimestamp(purchase.fecha_compra)
    const details = state.detalle_compra.filter(row => row.id_compra === purchaseId)
    setEditingPurchaseId(purchaseId)
    setSupplier(String(purchase.id_proveedor))
    setDate(purchaseDate)
    setObservations(purchase.observaciones ?? '')
    setDiscountValue(String(purchase.descuento))
    setIvaValue(String(purchase.iva))
    setLines(details.map((detail, index) => {
      const lot = state.lotes.find(row => row.id_detalle_compra === detail.id_detalle_compra)
      const draft = newPurchaseLine(state, details.slice(0, index).map(item =>
        state.lotes.find(row => row.id_detalle_compra === item.id_detalle_compra)?.numero_lote ?? '',
      ))
      return {
        ...draft, id_producto: String(detail.id_producto), cantidad: String(detail.cantidad), unidad: 'kg',
        precio: String(detail.precio_unitario), conLote: !!lot,
        numero_lote: lot?.numero_lote ?? draft.numero_lote,
        fecha_ingreso: lot?.fecha_ingreso ?? purchaseDate,
        fecha_vencimiento: lot?.fecha_vencimiento ?? '',
        tipo_empaque: lot?.tipo_empaque ?? 'Bulto',
        id_ubicacion: String(lot?.id_ubicacion ?? localStorage.getItem('fresas-last-purchase-location') ?? '315'),
      }
    }))
    setFormErrors({})
    setOpen(true)
  }
  const patchLine = (key: string, patch: Partial<PurchaseLineDraft>) => {
    setLines(current => current.map(line => line.key === key ? { ...line, ...patch } : line))
  }
  const save = () => {
    if (editingLocked && editingPurchaseId !== null) {
      try {
        updateStore(editPurchase(getState(), editingPurchaseId, { observaciones: observations.trim() || undefined }))
        toast('success', 'Observaciones actualizadas', 'La compra ya tiene movimientos; sus datos comerciales se conservaron.')
        setOpen(false)
        setEditingPurchaseId(null)
      } catch (error) { toast('error', 'No se pudo actualizar la compra', messageOf(error)) }
      return
    }
    const errors: Record<string, string> = {}
    if (!supplier) errors.supplier = 'Seleccione un proveedor.'
    if (!date) errors.date = 'Este campo es obligatorio'
    if (!lines.length) errors.lines = 'Debe agregar al menos un producto a la orden de compra.'
    const lotNames = new Set<string>()
    const currentDetailIds = new Set(state.detalle_compra.filter(row => row.id_compra === editingPurchaseId).map(row => row.id_detalle_compra))
    for (const line of lines) {
      const product = state.productos.find(row => row.id_producto === Number(line.id_producto) && row.estado)
      if (!product) errors[`${line.key}:product`] = 'Seleccione un producto activo.'
      const quantityError = convertedKgError(line.cantidad, line.unidad)
      if (quantityError) errors[`${line.key}:quantity`] = quantityError
      if (!line.precio.trim() || !Number.isFinite(Number(line.precio)) || Number(line.precio) < 0) errors[`${line.key}:price`] = 'Ingrese un precio válido.'
      if (line.conLote) {
        const lotNumber = line.numero_lote.trim()
        const duplicateExistingLot = state.lotes.some(row => row.numero_lote === lotNumber
          && !(editingPurchaseId !== null && row.id_detalle_compra !== null && currentDetailIds.has(row.id_detalle_compra)))
        if (!lotNumber) errors[`${line.key}:lot`] = 'Este campo es obligatorio'
        else if (lotNames.has(lotNumber) || duplicateExistingLot) errors[`${line.key}:lot`] = 'El número de lote ingresado ya se encuentra registrado.'
        lotNames.add(lotNumber)
        if (!line.fecha_vencimiento) errors[`${line.key}:expiry`] = 'Este campo es obligatorio'
        else if (line.fecha_vencimiento < line.fecha_ingreso || line.fecha_ingreso < date) errors[`${line.key}:expiry`] = 'Las fechas del lote deben ser posteriores o iguales a la fecha de compra.'
      }
    }
    if (discountValue && (!Number.isFinite(Number(discountValue)) || Number(discountValue) < 0)) errors.discount = 'Ingrese un descuento válido.'
    else if (discount > subtotal) errors.discount = 'El descuento no puede superar el subtotal.'
    if (ivaValue && (!Number.isFinite(Number(ivaValue)) || Number(ivaValue) < 0)) errors.iva = 'Ingrese un IVA válido.'
    if (Object.keys(errors).length) { setFormErrors(errors); return }
    try {
      const input = {
        id_proveedor: Number(supplier), id_usuario: Number(sessionStorage.getItem('fresas-user-id')), fecha: date,
        observaciones: observations.trim() || undefined, iva, descuento: discount,
        lines: lines.map(line => {
          const product = state.productos.find(row => row.id_producto === Number(line.id_producto))!
          return {
            id_producto: product.id_producto,
            cantidad_kg: lineQuantityKg(line)!,
            precio_unitario: Number(line.precio),
            ...(line.conLote ? { lote: {
              numero_lote: line.numero_lote.trim(), fecha_ingreso: line.fecha_ingreso,
              fecha_vencimiento: line.fecha_vencimiento, tipo_empaque: line.tipo_empaque,
              id_ubicacion: Number(line.id_ubicacion),
            } } : {}),
          }
        }),
      }
      const savedState = editingPurchaseId === null
        ? createPurchase(getState(), input)
        : editPurchase(getState(), editingPurchaseId, input)
      updateStore(savedState)
      const purchase = savedState.compras.find(row => row.id_compra === editingPurchaseId)
        ?? savedState.compras[savedState.compras.length - 1]
      const lotNames = lines.filter(line => line.conLote).map(line => line.numero_lote.trim())
      toast('success', `Compra ${formatId('C', purchase.id_compra)} ${editingPurchaseId === null ? 'registrada' : 'actualizada'}`, `Lotes: ${lotNames.length ? lotNames.join(', ') : 'Sin lote'}`)
      setPage(1)
      setOpen(false)
      setEditingPurchaseId(null)
      setFormErrors({})
    } catch (error) {
      const message = messageOf(error)
      if (message.includes('descuento')) setFormErrors(previous => ({ ...previous, discount: message }))
      else if (message.includes('IVA')) setFormErrors(previous => ({ ...previous, iva: message }))
      else toast('error', editingPurchaseId === null ? 'No se pudo registrar la compra' : 'No se pudo actualizar la compra', message)
    }
  }
  const beginAssociateLot = (purchaseId: number) => {
    const missing = state.detalle_compra.filter(detail => detail.id_compra === purchaseId && !state.lotes.some(lot => lot.id_detalle_compra === detail.id_detalle_compra))
    setAssociatePurchaseId(purchaseId)
    setAssociateDetailId(String(missing[0]?.id_detalle_compra ?? ''))
    setAssociateLotNumber(suggestedLotNumber(state))
    setAssociateExpiry('')
    setAssociatePack('Bulto')
    setAssociateLocation(localStorage.getItem('fresas-last-purchase-location') ?? '315')
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
      updateStore(associateLot(getState(), detail!.id_detalle_compra, {
        numero_lote: associateLotNumber.trim(), fecha_ingreso: localDateFromTimestamp(state.compras.find(row => row.id_compra === associatePurchaseId)!.fecha_compra),
        fecha_vencimiento: associateExpiry, tipo_empaque: associatePack, id_ubicacion: Number(associateLocation),
      }))
      toast('success', 'Lote asociado', 'El inventario ya cuenta con un lote registrado.')
      setPage(1)
      setAssociatePurchaseId(null)
    } catch (error) { toast('error', 'No se pudo asociar el lote', messageOf(error)) }
  }
  const purchaseReportRows = state.compras.filter(row => dateInRange(row.fecha_compra, purchaseFilters.from, purchaseFilters.to)).map(row => {
    const details = state.detalle_compra.filter(detail => detail.id_compra === row.id_compra)
    const lots = details.flatMap(detail => state.lotes.filter(lot => lot.id_detalle_compra === detail.id_detalle_compra))
    return {
      compra: formatId('C', row.id_compra),
      fecha: localDateFromTimestamp(row.fecha_compra),
      proveedor: state.proveedores.find(provider => provider.id_proveedor === row.id_proveedor)?.nombre_proveedor ?? '—',
      lotes: lots.map(lot => lot.numero_lote).join(', ') || 'Sin lote',
      productos: details.map(detail => `${productName(state, detail.id_producto)} (${quantityLabel(detail.cantidad)} kg)`).join(', '),
      total: row.total_compra,
      estado: row.estado ? 'Activa' : 'Anulada',
    }
  }).sort((a, b) => a.compra.localeCompare(b.compra))
  const exportPurchases = (format: 'excel' | 'pdf') => {
    const range = purchaseFilters.from || purchaseFilters.to
      ? `${purchaseFilters.from || 'inicio'}-${purchaseFilters.to || 'hoy'}`
      : 'todas-las-fechas'
    if (format === 'excel') {
      const book = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(purchaseReportRows.map(row => ({
        'N° de compra': row.compra, Fecha: row.fecha, Proveedor: row.proveedor, 'Lote(s)': row.lotes,
        Productos: row.productos, Total: row.total, Estado: row.estado,
      }))), 'Compras')
      XLSX.writeFile(book, `reporte-compras-${range}.xlsx`)
    } else {
      const doc = new jsPDF({ orientation: 'landscape' })
      doc.text(`Reporte de compras · ${purchaseFilters.from || 'Todas'} a ${purchaseFilters.to || 'Hoy'}`, 14, 16)
      autoTable(doc, {
        head: [['N° de compra', 'Fecha', 'Proveedor', 'Lote(s)', 'Productos', 'Total', 'Estado']],
        body: purchaseReportRows.map(row => [row.compra, row.fecha, row.proveedor, row.lotes, row.productos, fmt(row.total), row.estado]),
      })
      doc.save(`reporte-compras-${range}.pdf`)
    }
    toast('success', `${format === 'excel' ? 'Excel' : 'PDF'} exportado`, 'El reporte de compras se descargó correctamente.')
  }
  return <section>
    <div className="page-toolbar">{canFilter && <SearchBar placeholder="Buscar por compra o proveedor..." value={query} onChange={value => { setQuery(value); setPage(1) }} />}
      {canFilter && <FilterPopover activeCount={purchaseFilterCount} onClear={clearPurchaseFilters}>
        <Field label="Proveedor"><select className="select" value={purchaseFilters.supplier} onChange={event => setPurchaseFilter('supplier', event.target.value)}><option value="">Todos los proveedores</option>{state.proveedores.map(provider => <option key={provider.id_proveedor} value={provider.id_proveedor}>{provider.nombre_proveedor}</option>)}</select></Field>
        <Field label="Estado"><select className="select" value={purchaseFilters.status} onChange={event => setPurchaseFilter('status', event.target.value)}><option value="">Todos los estados</option><option value="true">Activas</option><option value="false">Anuladas</option></select></Field>
        <div className="filter-date-range"><Field label="Desde"><input className="input" type="date" value={purchaseFilters.from} onChange={event => setPurchaseFilter('from', event.target.value)} /></Field><Field label="Hasta"><input className="input" type="date" value={purchaseFilters.to} onChange={event => setPurchaseFilter('to', event.target.value)} /></Field></div>
      </FilterPopover>}
      {canExport && <div className="purchase-report-actions"><span>Exportar reporte de compras</span><button className="btn-secondary widget-export-button" onClick={() => exportPurchases('excel')}>Excel</button><button className="btn-secondary widget-export-button" onClick={() => exportPurchases('pdf')}>PDF</button><small>{purchaseFilters.from || 'Todas'} – {purchaseFilters.to || 'las fechas'}</small></div>}
      {canCreate && <button className="btn-primary" onClick={openNewPurchase}><Ic d={P.plus} size={15} /> Registrar compra</button>}</div>
    <div className="card table-scroll"><table className="data-table"><thead><tr><th>N° de compra</th><th>Fecha</th><th>Proveedor</th><th>Lote(s)</th><th>Productos</th><th>Total</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
      {purchases.slice((page - 1) * 10, page * 10).map(row => {
        const details = state.detalle_compra.filter(detail => detail.id_compra === row.id_compra)
        const hasMissingLot = details.some(detail => !state.lotes.some(lot => lot.id_detalle_compra === detail.id_detalle_compra))
        const purchaseLots = details.flatMap(detail => state.lotes.filter(lot => lot.id_detalle_compra === detail.id_detalle_compra))
        return (
          <tr key={row.id_compra}>
            <td data-label="N° de compra">{formatId('C', row.id_compra)}</td>
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
              {canView && <ViewBtn title="Ver detalle de compra" onClick={() => setDetailPurchaseId(row.id_compra)} />}
              {canEdit && row.estado && <EditBtn title="Editar compra" onClick={() => openEditPurchase(row.id_compra)} />}
              {canAssociateLot && hasMissingLot && row.estado && <LoteBtn title="Asociar lote" onClick={() => beginAssociateLot(row.id_compra)} />}
              {canDelete && row.estado && <TrashBtn title="Anular compra" onClick={() => setCancelId(row.id_compra)} />}
            </div></td>
          </tr>
        )
      })}
      {!purchases.length && <tr><td colSpan={8} className="table-empty">No se encontraron compras que coincidan con la búsqueda.</td></tr>}
    </tbody></table></div><Pagination page={page} total={purchases.length} onPageChange={setPage} />
    <Modal open={open} title={editingPurchaseId === null ? 'Registrar compra' : `Editar compra ${formatId('C', editingPurchaseId)}`} onClose={() => setOpen(false)} wide>
      <div className="purchase-modal-layout">
        <div className="purchase-form-column">
          <section className="purchase-form-card">
            <h3>Datos de la compra</h3>
            <div className="form-grid">
              <Field label="Proveedor"><select disabled={editingLocked} className={`select ${formErrors.supplier ? 'input-error' : ''}`} value={supplier} onChange={event => { setSupplier(event.target.value); clearError('supplier') }}><option value="">Seleccione...</option>{state.proveedores.filter(row => row.estado).map(row => <option key={row.id_proveedor} value={row.id_proveedor}>{row.nombre_proveedor}</option>)}</select>{formErrors.supplier && <small className="field-error">{formErrors.supplier}</small>}</Field>
              <Field label="Fecha"><input disabled={editingLocked} className={`input ${formErrors.date ? 'input-error' : ''}`} type="date" value={date} onChange={event => { setDate(event.target.value); clearError('date') }} />{formErrors.date && <small className="field-error">{formErrors.date}</small>}</Field>
            </div>
            <Field label="Observaciones"><textarea className="input" maxLength={200} value={observations} onChange={event => setObservations(event.target.value)} /></Field>
            {editingLocked && <p className="purchase-edit-notice">Esta compra ya tiene movimientos. Solo se pueden editar las observaciones.</p>}
          </section>
          <section className="purchase-form-card purchase-products-card">
            <div className="purchase-section-heading"><h3>Productos</h3><span>{lines.length} {lines.length === 1 ? 'línea' : 'líneas'}</span></div>
      <div className="purchase-lines">
        {lines.map((line, index) => {
          const productOptions = state.productos.filter(product => product.estado && product.tipo_producto === 'Fresca')
          return <article className="purchase-line-card" key={line.key}>
            <div className="purchase-line-heading"><strong>Producto {index + 1}</strong><button className="btn-ghost" type="button" disabled={editingLocked} onClick={() => setLines(current => current.filter(item => item.key !== line.key))}>Quitar</button></div>
            <div className="form-grid">
              <Field label="Producto"><select disabled={editingLocked} className={`select ${formErrors[`${line.key}:product`] ? 'input-error' : ''}`} value={line.id_producto} onChange={event => {
                const product = state.productos.find(item => item.id_producto === Number(event.target.value))
                patchLine(line.key, {
                  id_producto: event.target.value,
                  precio: product ? String(product.precio_compra) : '',
                  fecha_ingreso: date,
                  fecha_vencimiento: product?.tipo_producto === 'Fresca' ? daysAfter(date, 7) : '',
                })
                setFormErrors(previous => ({ ...previous, [`${line.key}:product`]: '' }))
              }}><option value="">Seleccione...</option>{productOptions.map(product => <option key={product.id_producto} value={product.id_producto}>{productName(state, product.id_producto)}</option>)}</select>{formErrors[`${line.key}:product`] && <small className="field-error">{formErrors[`${line.key}:product`]}</small>}</Field>
              <Field label="Cantidad"><div className="quantity-input"><input disabled={editingLocked} className={`input ${formErrors[`${line.key}:quantity`] ? 'input-error' : ''}`} type="number" min="0.01" step="any" value={line.cantidad} onChange={event => { patchLine(line.key, { cantidad: event.target.value }); setFormErrors(previous => ({ ...previous, [`${line.key}:quantity`]: '' })) }} /><select disabled={editingLocked} className="select" value={line.unidad} onChange={event => patchLine(line.key, { unidad: event.target.value as 'kg' | 'g' })}><option>kg</option><option>g</option></select></div>{formErrors[`${line.key}:quantity`] && <small className="field-error">{formErrors[`${line.key}:quantity`]}</small>}{lineQuantityKg(line) !== null && <small className="muted">= {quantityLabel(lineQuantityKg(line)!)} kg</small>}</Field>
              <Field label="Precio unitario por kg"><input disabled={editingLocked} className={`input ${formErrors[`${line.key}:price`] ? 'input-error' : ''}`} type="number" min="0" step="0.01" value={line.precio} onChange={event => { patchLine(line.key, { precio: event.target.value }); setFormErrors(previous => ({ ...previous, [`${line.key}:price`]: '' })) }} />{formErrors[`${line.key}:price`] && <small className="field-error">{formErrors[`${line.key}:price`]}</small>}</Field>
              <div className="purchase-line-subtotal"><span>Subtotal de línea</span><strong>{fmt(lineSubtotal(line))}</strong></div>
            </div>
            <details className="purchase-lot-section" open={line.conLote} onToggle={event => {
              const hasLot = (event.currentTarget as HTMLDetailsElement).open
              if (hasLot !== line.conLote) patchLine(line.key, { conLote: hasLot })
            }}>
              <summary><strong>Lote</strong><span>{line.conLote ? 'Registrado con la compra' : 'Sin lote · asociar después'}</span></summary>
              {line.conLote && <div className="form-grid purchase-lot-fields">
                <Field label="Número de lote"><input disabled={editingLocked} className={`input ${formErrors[`${line.key}:lot`] ? 'input-error' : ''}`} value={line.numero_lote} onChange={event => { patchLine(line.key, { numero_lote: event.target.value }); setFormErrors(previous => ({ ...previous, [`${line.key}:lot`]: '' })) }} />{formErrors[`${line.key}:lot`] && <small className="field-error">{formErrors[`${line.key}:lot`]}</small>}</Field>
                <Field label="Ubicación"><select disabled={editingLocked} className="select" value={line.id_ubicacion} onChange={event => {
                  setAssociateLocation(event.target.value)
                  localStorage.setItem('fresas-last-purchase-location', event.target.value)
                  patchLine(line.key, { id_ubicacion: event.target.value })
                }}>{state.ubicaciones.filter(row => row.estado).map(location => <option key={location.id_ubicacion} value={location.id_ubicacion}>{location.nombre_ubicacion}</option>)}</select></Field>
                <Field label="Empaque"><select disabled={editingLocked} className="select" value={line.tipo_empaque} onChange={event => patchLine(line.key, { tipo_empaque: event.target.value as TipoEmpaque })}><option>Bulto</option><option>Caja</option><option>Bolsa</option></select></Field>
                <Field label="Fecha de ingreso"><input disabled={editingLocked} className="input" type="date" min={date} value={line.fecha_ingreso} onChange={event => patchLine(line.key, { fecha_ingreso: event.target.value })} /></Field>
                <Field label="Fecha de vencimiento"><input disabled={editingLocked} className={`input ${formErrors[`${line.key}:expiry`] ? 'input-error' : ''}`} type="date" min={date} value={line.fecha_vencimiento} onChange={event => { patchLine(line.key, { fecha_vencimiento: event.target.value }); setFormErrors(previous => ({ ...previous, [`${line.key}:expiry`]: '' })) }} />{formErrors[`${line.key}:expiry`] && <small className="field-error">{formErrors[`${line.key}:expiry`]}</small>}</Field>
              </div>}
            </details>
          </article>
        })}
        <button className="btn-secondary" type="button" disabled={editingLocked} onClick={() => setLines(current => [...current, newPurchaseLine(state, current.map(line => line.numero_lote))])}><Ic d={P.plus} size={15} /> Agregar producto</button>
        {formErrors.lines && <small className="field-error">{formErrors.lines}</small>}
      </div>
          </section>
        </div>
        <aside className="purchase-summary-card">
          <h3>Resumen</h3>
        <div className="detail-row"><span>Subtotal</span><strong>{fmt(subtotal)}</strong></div>
        <div className="purchase-summary-charge"><Field label="Descuento ($)"><input disabled={editingLocked} className={`input ${formErrors.discount ? 'input-error' : ''}`} type="number" min="0" step="0.01" value={discountValue} onChange={event => { setDiscountValue(event.target.value); clearError('discount') }} />{formErrors.discount && <small className="field-error">{formErrors.discount}</small>}</Field><strong>{fmt(discount)}</strong></div>
        <div className="purchase-summary-charge"><Field label="IVA ($)"><input disabled={editingLocked} className={`input ${formErrors.iva ? 'input-error' : ''}`} type="number" min="0" step="0.01" value={ivaValue} onChange={event => { setIvaValue(event.target.value); clearError('iva') }} />{formErrors.iva && <small className="field-error">{formErrors.iva}</small>}</Field><strong>{fmt(iva)}</strong></div>
        <div className="detail-row total-row"><span>TOTAL</span><strong>{fmt(total)}</strong></div>
        </aside>
      </div>
      <div className="modal-actions"><button className="btn-secondary" onClick={() => setOpen(false)}>Cancelar</button>{(editingPurchaseId === null ? canCreate : canEdit) && <button className="btn-primary" onClick={save}>{editingPurchaseId === null ? 'Registrar compra' : 'Guardar cambios'}</button>}</div>
    </Modal>
    {detailPurchaseId !== null && (() => {
      const purchase = state.compras.find(row => row.id_compra === detailPurchaseId)
      const details = state.detalle_compra.filter(row => row.id_compra === detailPurchaseId)
      const purchaseSubtotal = details.reduce((sum, detail) => sum + detail.cantidad * detail.precio_unitario, 0)
      const purchaseSupplier = state.proveedores.find(row => row.id_proveedor === purchase?.id_proveedor)
      const purchaseUser = state.usuarios.find(row => row.id_usuario === purchase?.id_usuario)
      return <Modal open={!!purchase} title={`Detalle de compra ${formatId('C', detailPurchaseId)}`} onClose={() => setDetailPurchaseId(null)} wide>
        <div className="detail-row"><span>Proveedor · fecha</span><strong>{purchaseSupplier?.nombre_proveedor ?? '—'} · {purchase ? localDateFromTimestamp(purchase.fecha_compra) : ''}</strong></div>
        <div className="detail-row"><span>Usuario · estado</span><strong>{purchaseUser ? `${purchaseUser.nombre} ${purchaseUser.apellido}` : '—'} · {purchase?.estado ? 'Activa' : 'Anulada'}</strong></div>
        <div className="detail-row"><span>Observaciones</span><strong>{purchase?.observaciones || '—'}</strong></div>
        {details.map(detail => {
          const lot = state.lotes.find(item => item.id_detalle_compra === detail.id_detalle_compra)
          const expiry = lot ? expiryStatus(lot.fecha_vencimiento) : null
          return <div className="detail-row purchase-detail-line" key={detail.id_detalle_compra}>
            <span>{productName(state, detail.id_producto)} · {quantityLabel(detail.cantidad)} kg
              <small className="cell-sub">Lote: {lot?.numero_lote ?? 'Sin lote'}{lot ? ` · ${state.ubicaciones.find(item => item.id_ubicacion === lot.id_ubicacion)?.nombre_ubicacion ?? '—'} · Ingreso ${lot.fecha_ingreso} · Disponible ${quantityLabel(lot.cantidad_disponible)} kg · Vence ${lot.fecha_vencimiento}` : ''}</small>
              {lot && expiry && <span className={`badge ${expiry === 'vencido' ? 'badge-red' : expiry === 'activo' ? 'badge-green' : 'badge-amber'}`}>{expiry === 'vencido' ? 'Vencido' : expiry === 'activo' ? 'Vigente' : expiry === 'critico' ? 'Vence pronto' : 'Por vencer'}</span>}
            </span><strong>{fmt(detail.cantidad * detail.precio_unitario)}</strong>
          </div>
        })}
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
        <Field label="Ubicación"><select className="select" value={associateLocation} onChange={event => { setAssociateLocation(event.target.value); localStorage.setItem('fresas-last-purchase-location', event.target.value) }}>{state.ubicaciones.filter(row => row.estado).map(location => <option key={location.id_ubicacion} value={location.id_ubicacion}>{location.nombre_ubicacion}</option>)}</select></Field>
        <div className="modal-actions"><button className="btn-secondary" onClick={() => setAssociatePurchaseId(null)}>Cancelar</button>{canAssociateLot && <button className="btn-primary" onClick={saveAssociatedLot}>Asociar lote</button>}</div></>}
    </Modal>
    <ConfirmModal open={cancelId !== null} title="¿Anular compra?" message="La compra solo se anula si su lote no tiene movimientos." actionLabel="Anular compra" onCancel={() => setCancelId(null)} onConfirm={() => { try { updateStore(cancelPurchase(getState(), cancelId!)); toast('success', 'Compra anulada', 'La compra fue anulada correctamente.') } catch (error) { toast('error', 'Error al anular la compra', messageOf(error)) } setCancelId(null) }} />
  </section>
}

export function ProductionPage() {
  const state = useStore(); const toast = useToast()
  const user = state.usuarios.find(item => item.id_usuario === Number(sessionStorage.getItem('fresas-user-id')))
  const canFilter = user?.id_rol === 1 || canModuleAction(state, user?.id_rol ?? -1, 'Producción', 'Filtrar')
  const canView = user?.id_rol === 1 || canModuleAction(state, user?.id_rol ?? -1, 'Producción', 'Ver detalle')
  const canCreate = user?.id_rol === 1 || canModuleAction(state, user?.id_rol ?? -1, 'Producción', 'Registrar')
  const canEdit = user?.id_rol === 1 || canModuleAction(state, user?.id_rol ?? -1, 'Producción', 'Editar')
  const canFinish = user?.id_rol === 1 || canModuleAction(state, user?.id_rol ?? -1, 'Producción', 'Congelar')
  const canCancel = user?.id_rol === 1 || canModuleAction(state, user?.id_rol ?? -1, 'Producción', 'Anular')
  const [open, setOpen] = useState(false); const [lotId, setLotId] = useState(() => sessionStorage.getItem('fresas-production-lot') ?? '')
  const [quantity, setQuantity] = useState(''); const [quantityUnit, setQuantityUnit] = useState<'kg' | 'g'>('kg')
  const [observations, setObservations] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [editId, setEditId] = useState<number | null>(null)
  const [editQuantity, setEditQuantity] = useState(''); const [editQuantityUnit, setEditQuantityUnit] = useState<'kg' | 'g'>('kg')
  const [editObservations, setEditObservations] = useState(''); const [editErrors, setEditErrors] = useState<Record<string, string>>({})
  const [finishId, setFinishId] = useState<number | null>(null)
  const [finishUnits, setFinishUnits] = useState(''); const [finishLocation, setFinishLocation] = useState('315')
  const [finishExpiry, setFinishExpiry] = useState(''); const [finishErrors, setFinishErrors] = useState<Record<string, string>>({})
  const [detailId, setDetailId] = useState<number | null>(null)
  const [cancelId, setCancelId] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState({ from: '', to: '', operator: '' })
  const setProductionFilter = (key: keyof typeof filters, value: string) => { setFilters(current => ({ ...current, [key]: value })); setPage(1) }
  const clearProductionFilters = () => { setFilters({ from: '', to: '', operator: '' }); setPage(1) }
  const recommendedLotIds = new Set(freezeSuggestions(state).map(lot => lot.id_lote))
  const lots = stockByLot(state).filter(lot => lot.estado && lot.es_transformable && lot.fecha_vencimiento >= localDateString() && lot.cantidad_disponible > 0 && lot.detail && state.productos.find(p => p.id_producto === lot.detail?.id_producto)?.tipo_producto === 'Fresca')
    .sort((a, b) => Number(recommendedLotIds.has(b.id_lote)) - Number(recommendedLotIds.has(a.id_lote))
      || a.fecha_vencimiento.localeCompare(b.fecha_vencimiento) || a.id_lote - b.id_lote)
  const selectedLot = lots.find(lot => lot.id_lote === Number(lotId))
  const sourceProduct = selectedLot?.detail && state.productos.find(product => product.id_producto === selectedLot.detail?.id_producto)
  const outputProduct = sourceProduct && state.productos.find(product => product.estado && product.tipo_producto === 'Congelada' && product.id_categoria === sourceProduct.id_categoria)
  const productionRows = state.produccion.filter(row => {
    const lotName = state.lotes.find(lot => lot.id_lote === row.id_lote_origen)?.numero_lote ?? ''
    const operator = state.usuarios.find(item => item.id_usuario === row.id_usuario)
    const text = `${formatId('OP', row.id_produccion)} ${lotName} ${operator?.nombre ?? ''} ${operator?.apellido ?? ''}`.toLowerCase()
    return text.includes(query.toLowerCase())
      && (!filters.operator || String(row.id_usuario) === filters.operator)
      && dateInRange(row.fecha_produccion, filters.from, filters.to)
  }).sort((a, b) => b.id_produccion - a.id_produccion)
  const quantityKg = convertedKg(quantity, quantityUnit)
  const editQuantityKg = editQuantity.trim() ? convertedKg(editQuantity, editQuantityUnit) : null
  const selectedOrder = state.produccion.find(row => row.id_produccion === detailId)
  const editingOrder = state.produccion.find(row => row.id_produccion === editId)
  const finishingOrder = state.produccion.find(row => row.id_produccion === finishId)
  const finishingSourceLot = state.lotes.find(row => row.id_lote === finishingOrder?.id_lote_origen)
  const finishingSourceDetail = finishingSourceLot?.id_detalle_compra === null
    ? undefined
    : state.detalle_compra.find(row => row.id_detalle_compra === finishingSourceLot?.id_detalle_compra)
  const finishingSourceProduct = state.productos.find(row => row.id_producto === finishingSourceDetail?.id_producto)
  const finishingProduct = finishingSourceProduct && state.productos.find(row =>
    row.estado && row.tipo_producto === 'Congelada' && row.id_categoria === finishingSourceProduct.id_categoria,
  )
  const outputWeight = finishingProduct?.peso_unidad_kg ?? 0
  const obtainedKg = Number(finishUnits) > 0 && outputWeight ? Number(finishUnits) * outputWeight : 0
  const wasteKg = finishingOrder ? Math.max(0, finishingOrder.cantidad_a_procesar - obtainedKg) : 0
  const yieldPercent = finishingOrder?.cantidad_a_procesar
    ? (obtainedKg / finishingOrder.cantidad_a_procesar) * 100
    : 0
  useEffect(() => {
    const preselected = sessionStorage.getItem('fresas-production-lot')
    if (preselected && canCreate) {
      setLotId(preselected)
      setOpen(true)
      sessionStorage.removeItem('fresas-production-lot')
    }
  }, [canCreate])
  const run = () => {
    const nextErrors: Record<string, string> = {}
    if (!selectedLot) nextErrors.lot = 'Seleccione un lote activo y no vencido.'
    const processedError = convertedKgError(quantity, quantityUnit)
    if (processedError) nextErrors.quantity = processedError
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); return }
    try {
      updateStore(createProductionOrder(getState(), {
        id_usuario: Number(sessionStorage.getItem('fresas-user-id')), id_lote_origen: Number(lotId),
        cantidad_a_procesar: quantityKg!, observaciones: observations.trim() || undefined,
      }))
      toast('success', 'Orden de producción creada', 'La orden quedó En proceso; registra su resultado para finalizarla.')
      setPage(1)
      setOpen(false)
      setQuantity(''); setObservations(''); setErrors({})
    } catch (error) { toast('error', 'No se pudo registrar la producción', messageOf(error)) }
  }
  const beginEdit = (id: number) => {
    const order = state.produccion.find(row => row.id_produccion === id)
    if (!order) return
    setEditId(id)
    setEditQuantity(String(order.cantidad_a_procesar))
    setEditQuantityUnit('kg')
    setEditObservations(order.observaciones ?? '')
    setEditErrors({})
  }
  const saveEdit = () => {
    if (editId === null) return
    const nextErrors: Record<string, string> = {}
    if (editQuantity.trim() && (convertedKgError(editQuantity, editQuantityUnit) || editQuantityKg === null)) {
      nextErrors.quantity = convertedKgError(editQuantity, editQuantityUnit) || 'Ingrese una cantidad válida.'
    }
    if (Object.keys(nextErrors).length) { setEditErrors(nextErrors); return }
    try {
      updateStore(updateProductionOrder(getState(), editId, {
        observaciones: editObservations,
        ...(editQuantity.trim() ? { cantidad_a_procesar: editQuantityKg! } : {}),
      }))
      toast('success', 'Orden actualizada', 'Se guardaron los cambios de la orden en proceso.')
      setEditId(null)
    } catch (error) { toast('error', 'No se pudo actualizar la orden', messageOf(error)) }
  }
  const beginFinish = (id: number) => {
    const order = state.produccion.find(row => row.id_produccion === id)
    if (!order || order.estado !== 'En proceso') return
    const sourceLot = state.lotes.find(row => row.id_lote === order.id_lote_origen)
    const sourceDetail = sourceLot?.id_detalle_compra === null
      ? undefined
      : state.detalle_compra.find(row => row.id_detalle_compra === sourceLot?.id_detalle_compra)
    const source = state.productos.find(row => row.id_producto === sourceDetail?.id_producto)
    const product = source && state.productos.find(row =>
      row.estado && row.tipo_producto === 'Congelada' && row.id_categoria === source.id_categoria,
    )
    setFinishId(id)
    setFinishUnits(product?.peso_unidad_kg ? String(Math.floor(order.cantidad_a_procesar / product.peso_unidad_kg)) : '')
    setFinishLocation(localStorage.getItem('fresas-last-production-location') ?? '315')
    setFinishExpiry(monthsAfter(localDateString(), 6))
    setFinishErrors({})
  }
  const finish = () => {
    if (finishId === null) return
    const nextErrors: Record<string, string> = {}
    if (!finishingOrder || finishingOrder.estado !== 'En proceso') nextErrors.order = 'La orden ya no está en proceso.'
    if (!Number.isInteger(Number(finishUnits)) || Number(finishUnits) <= 0) nextErrors.units = 'Ingrese un número entero de bolsas mayor a cero.'
    if (!finishingProduct) nextErrors.product = 'No hay producto congelado activo para este calibre.'
    if (finishingOrder && obtainedKg > finishingOrder.cantidad_a_procesar) nextErrors.units = 'Los kilos obtenidos no pueden superar la cantidad a procesar.'
    if (!finishLocation) nextErrors.location = 'Seleccione una ubicación.'
    if (!finishExpiry) nextErrors.expiry = 'Seleccione el vencimiento del lote.'
    if (Object.keys(nextErrors).length) { setFinishErrors(nextErrors); return }
    try {
      updateStore(finishProduction(getState(), finishId, {
        unidades_obtenidas: Number(finishUnits), id_ubicacion: Number(finishLocation), fecha_vencimiento: finishExpiry,
      }))
      toast('success', 'Producción finalizada', 'Se registró el lote de fresa congelada.')
      localStorage.setItem('fresas-last-production-location', finishLocation)
      setFinishId(null)
    } catch (error) { toast('error', 'No se pudo finalizar la producción', messageOf(error)) }
  }
  const cancel = (id: number) => {
    try {
      updateStore(cancelProduction(getState(), id))
      toast('success', 'Producción anulada', 'La cantidad fue devuelta al lote de origen.')
    } catch (error) { toast('error', 'No se pudo anular la producción', messageOf(error)) }
    setCancelId(null)
  }
  return <section><div className="page-toolbar">{canFilter && <SearchBar placeholder="Buscar orden, lote u operario..." value={query} onChange={value => { setQuery(value); setPage(1) }} />}
      {canFilter && <FilterPopover activeCount={Object.values(filters).filter(Boolean).length} onClear={clearProductionFilters}>
        <div className="filter-date-range"><Field label="Desde"><input className="input" type="date" value={filters.from} onChange={event => setProductionFilter('from', event.target.value)} /></Field><Field label="Hasta"><input className="input" type="date" value={filters.to} onChange={event => setProductionFilter('to', event.target.value)} /></Field></div>
        <Field label="Operario"><select className="select" value={filters.operator} onChange={event => setProductionFilter('operator', event.target.value)}><option value="">Todos los operarios</option>{state.usuarios.map(operator => <option key={operator.id_usuario} value={operator.id_usuario}>{operator.nombre} {operator.apellido}</option>)}</select></Field>
      </FilterPopover>}
      <span className="muted">Órdenes de transformación de fresco a congelado.</span>{canCreate && <button className="btn-primary" onClick={() => { setLotId(String(lots[0]?.id_lote ?? '')); setQuantity(''); setObservations(''); setErrors({}); setOpen(true) }}><Ic d={P.plus} size={15} /> Nueva orden de producción</button>}</div>
    <div className="card table-scroll"><table className="data-table"><thead><tr><th>N° orden</th><th>Fecha</th><th>Lote origen</th><th>A procesar</th><th>Obtenido</th><th>Merma</th><th>Rendimiento</th><th>Operario</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{productionRows.slice((page - 1) * 10, page * 10).map(row => {
      const details = state.detalle_produccion.filter(detail => detail.id_produccion === row.id_produccion)
      const lotName = state.lotes.find(lot => lot.id_lote === row.id_lote_origen)?.numero_lote ?? '—'
      const bags = details.reduce((sum, detail) => sum + detail.cantidad_obtenida, 0)
      const kg = details.reduce((sum, detail) => {
        const product = state.productos.find(item => item.id_producto === detail.id_producto)
        return sum + detail.cantidad_obtenida * (product?.peso_unidad_kg ?? 1)
      }, 0)
      const yieldValue = row.estado === 'Finalizada' && row.cantidad_a_procesar > 0 ? (kg / row.cantidad_a_procesar) * 100 : null
      const operator = state.usuarios.find(item => item.id_usuario === row.id_usuario)
      return <tr key={row.id_produccion}>
        <td data-label="N° orden">{formatId('OP', row.id_produccion)}</td><td data-label="Fecha">{localDateFromTimestamp(row.fecha_produccion)}</td>
        <td data-label="Lote origen">{lotName}</td><td data-label="A procesar">{quantityLabel(row.cantidad_a_procesar)} kg</td>
        <td data-label="Obtenido">{bags ? `${quantityLabel(bags)} ${bags === 1 ? 'bolsa' : 'bolsas'}` : '—'}</td>
        <td data-label="Merma">{row.merma === null ? '—' : `${quantityLabel(row.merma)} kg`}</td>
        <td data-label="Rendimiento">{yieldValue === null ? '—' : `${yieldValue.toFixed(1)}%`}</td>
        <td data-label="Operario">{operator ? `${operator.nombre} ${operator.apellido}` : '—'}</td>
        <td data-label="Estado"><span className={`badge ${row.estado === 'Finalizada' ? 'badge-green' : row.estado === 'Anulada' ? 'badge-red' : 'badge-amber'}`}>{row.estado}</span></td>
        <td data-label="Acciones"><div className="actions">
          {canView && <ViewBtn onClick={() => setDetailId(row.id_produccion)} />}
          {canEdit && row.estado === 'En proceso' && <EditBtn title="Editar orden" onClick={() => beginEdit(row.id_produccion)} />}
          {canFinish && row.estado === 'En proceso' && <button type="button" className="action-finish" title="Finalizar orden" aria-label="Finalizar orden" onClick={() => beginFinish(row.id_produccion)}><Ic d={P.check} size={16} /></button>}
          {canCancel && row.estado !== 'Anulada' && <TrashBtn title="Anular producción" onClick={() => setCancelId(row.id_produccion)} />}
        </div></td>
      </tr>
    })}{!productionRows.length && <tr><td colSpan={10} className="table-empty">No se encontraron órdenes de producción que coincidan con la búsqueda.</td></tr>}</tbody></table></div><Pagination page={page} total={productionRows.length} onPageChange={setPage} />
    <Modal open={open} title="Nueva orden de producción" onClose={() => setOpen(false)} wide>
      <section className="production-form-card"><h3>1. Seleccionar lote de fresa fresca</h3>
      <Field label="Lote de origen"><select className={`select ${errors.lot ? 'input-error' : ''}`} value={lotId} onChange={event => { setLotId(event.target.value); setErrors(previous => ({ ...previous, lot: '' })) }}><option value="">Seleccione...</option>{lots.map(row => <option key={row.id_lote} value={row.id_lote}>{row.numero_lote}{recommendedLotIds.has(row.id_lote) ? ' · Recomendado' : ''} · {quantityLabel(row.cantidad_disponible)} kg disponibles</option>)}</select>{errors.lot && <small className="field-error">{errors.lot}</small>}</Field>
      <div className="form-grid">
        <Field label="Cantidad a procesar"><div className="quantity-input"><input className={`input ${errors.quantity ? 'input-error' : ''}`} type="number" min="0" step="any" value={quantity} onChange={event => { setQuantity(event.target.value); setErrors(previous => ({ ...previous, quantity: '' })) }} /><select className="select" value={quantityUnit} onChange={event => setQuantityUnit(event.target.value as 'kg' | 'g')}><option>kg</option><option>g</option></select></div>{errors.quantity && <small className="field-error">{errors.quantity}</small>}{quantityKg !== null && <small className="muted">= {quantityLabel(quantityKg)} kg</small>}</Field>
      </div>
      <Field label="Observaciones"><textarea className="input" maxLength={200} value={observations} onChange={event => setObservations(event.target.value)} /></Field>
      </section>
      <div className="production-preview card">
        <div><span>Producto resultante</span><strong>{outputProduct ? productName(state, outputProduct.id_producto) : 'No hay producto congelado activo para este calibre.'}</strong></div>
        <div><span>Estado inicial</span><strong>En proceso · registra el resultado al finalizar.</strong></div>
      </div>
      <div className="modal-actions"><button className="btn-secondary" onClick={() => setOpen(false)}>Cancelar</button>{canCreate && <button className="btn-primary" onClick={run}>Confirmar orden</button>}</div>
    </Modal>
    <Modal open={editingOrder !== undefined} title={editingOrder ? `Editar orden ${formatId('OP', editingOrder.id_produccion)}` : 'Editar orden'} onClose={() => setEditId(null)} wide>
      {editingOrder && <><p className="muted">En una orden en proceso puedes ajustar la cantidad o las observaciones.</p>
        <Field label="Cantidad a procesar (dejar vacío para conservarla)"><div className="quantity-input"><input className={`input ${editErrors.quantity ? 'input-error' : ''}`} type="number" min="0" step="any" value={editQuantity} onChange={event => { setEditQuantity(event.target.value); setEditErrors(previous => ({ ...previous, quantity: '' })) }} /><select className="select" value={editQuantityUnit} onChange={event => setEditQuantityUnit(event.target.value as 'kg' | 'g')}><option>kg</option><option>g</option></select></div>{editErrors.quantity && <small className="field-error">{editErrors.quantity}</small>}{editQuantityKg !== null && <small className="muted">= {quantityLabel(editQuantityKg)} kg</small>}</Field>
        <Field label="Observaciones"><textarea className="input" maxLength={200} value={editObservations} onChange={event => setEditObservations(event.target.value)} /></Field>
        <div className="modal-actions"><button className="btn-secondary" onClick={() => setEditId(null)}>Cancelar</button>{canEdit && <button className="btn-primary" onClick={saveEdit}>Guardar cambios</button>}</div>
      </>}
    </Modal>
    <Modal open={finishId !== null} title={finishingOrder ? `Finalizar orden ${formatId('OP', finishingOrder.id_produccion)}` : 'Finalizar orden'} onClose={() => setFinishId(null)} wide>
      {finishingOrder && <><div className="detail-row"><span>Cantidad a procesar</span><strong>{quantityLabel(finishingOrder.cantidad_a_procesar)} kg</strong></div>
        <section className="production-form-card"><h3>2. Registrar resultado</h3>
          <div className="form-grid">
            <Field label={`Unidades obtenidas (bolsas de ${outputWeight || '—'} kg)`}><input className={`input ${finishErrors.units ? 'input-error' : ''}`} type="number" min="1" step="1" value={finishUnits} onChange={event => { setFinishUnits(event.target.value); setFinishErrors(previous => ({ ...previous, units: '' })) }} />{finishErrors.units && <small className="field-error">{finishErrors.units}</small>}</Field>
            <Field label="Producto resultante"><input className="input" readOnly value={finishingProduct ? productName(state, finishingProduct.id_producto) : 'No hay producto congelado activo para este calibre.'} />{finishErrors.product && <small className="field-error">{finishErrors.product}</small>}</Field>
          </div>
          <div className="production-result-grid">
            <div><span>Kg obtenidos</span><strong>{quantityLabel(obtainedKg)} kg</strong></div>
            <div><span>Merma</span><strong>{quantityLabel(wasteKg)} kg</strong></div>
            <div><span>Rendimiento</span><strong>{yieldPercent.toFixed(1)}%</strong></div>
          </div>
          <div className="form-grid">
            <Field label="Ubicación"><select className={`select ${finishErrors.location ? 'input-error' : ''}`} value={finishLocation} onChange={event => setFinishLocation(event.target.value)}>{state.ubicaciones.filter(item => item.estado).map(item => <option key={item.id_ubicacion} value={item.id_ubicacion}>{item.nombre_ubicacion}</option>)}</select>{finishErrors.location && <small className="field-error">{finishErrors.location}</small>}</Field>
            <Field label="Vencimiento del lote congelado"><input className={`input ${finishErrors.expiry ? 'input-error' : ''}`} type="date" min={localDateString()} value={finishExpiry} onChange={event => setFinishExpiry(event.target.value)} />{finishErrors.expiry && <small className="field-error">{finishErrors.expiry}</small>}</Field>
          </div>
          {finishErrors.order && <small className="field-error">{finishErrors.order}</small>}
        </section>
        <div className="modal-actions"><button className="btn-secondary" onClick={() => setFinishId(null)}>Cancelar</button>{canFinish && <button className="btn-primary" onClick={finish}>Finalizar producción</button>}</div>
      </>}
    </Modal>
    <Modal open={selectedOrder !== undefined} title={selectedOrder ? `Detalle de orden ${formatId('OP', selectedOrder.id_produccion)}` : 'Detalle de producción'} onClose={() => setDetailId(null)} wide>
      {selectedOrder && <>
        <div className="detail-row"><span>Operario · fecha</span><strong>{state.usuarios.find(row => row.id_usuario === selectedOrder.id_usuario)?.nombre ?? '—'} · {localDateFromTimestamp(selectedOrder.fecha_produccion)}</strong></div>
        <div className="detail-row"><span>Lote origen</span><strong>{state.lotes.find(row => row.id_lote === selectedOrder.id_lote_origen)?.numero_lote ?? '—'}</strong></div>
        <div className="detail-row"><span>Cantidad a procesar · merma</span><strong>{quantityLabel(selectedOrder.cantidad_a_procesar)} kg · {selectedOrder.merma === null ? '—' : `${quantityLabel(selectedOrder.merma)} kg`}</strong></div>
        <div className="detail-row"><span>Estado · finalización</span><strong>{selectedOrder.estado} · {selectedOrder.fecha_finalizacion ? localDateFromTimestamp(selectedOrder.fecha_finalizacion) : '—'}</strong></div>
        <div className="detail-row"><span>Observaciones</span><strong>{selectedOrder.observaciones || '—'}</strong></div>
        {state.detalle_produccion.filter(row => row.id_produccion === selectedOrder.id_produccion).map(line => {
          const outputLot = state.lotes.find(lot => lot.id_detalle_produccion === line.id_detalle_produccion)
          const outputLocation = outputLot && state.ubicaciones.find(item => item.id_ubicacion === outputLot.id_ubicacion)
          return <div className="detail-row" key={line.id_detalle_produccion}><span>Producto congelado · lote · ubicación · vence</span><strong>{productName(state, line.id_producto)} · {outputLot?.numero_lote ?? '—'} · {outputLocation?.nombre_ubicacion ?? '—'} · {outputLot?.fecha_vencimiento ?? '—'} · {quantityLabel(line.cantidad_obtenida)} bolsas</strong></div>
        })}
      </>}
    </Modal>
    {canCancel && <ConfirmModal open={cancelId !== null} title="¿Anular orden de producción?" message="La producción se anulará y se devolverá la cantidad al lote de origen cuando corresponda." actionLabel="Anular producción" onCancel={() => setCancelId(null)} onConfirm={() => cancelId !== null && cancel(cancelId)} />}
  </section>
}

export function SalePage() {
  const state = useStore(); const toast = useToast()
  const user = state.usuarios.find(item => item.id_usuario === Number(sessionStorage.getItem('fresas-user-id')))
  const canFilter = user?.id_rol === 1 || canModuleAction(state, user?.id_rol ?? -1, 'Ventas', 'Filtrar')
  const canView = user?.id_rol === 1 || canModuleAction(state, user?.id_rol ?? -1, 'Ventas', 'Ver detalle')
  const canCreate = user?.id_rol === 1 || canModuleAction(state, user?.id_rol ?? -1, 'Ventas', 'Registrar')
  const canDelete = user?.id_rol === 1 || canModuleAction(state, user?.id_rol ?? -1, 'Ventas', 'Anular')
  const canExport = user?.id_rol === 1 || canModuleAction(state, user?.id_rol ?? -1, 'Ventas', 'Exportar')
  const [tab, setTab] = useState<'pos' | 'history'>('pos')
  const [selectedType, setSelectedType] = useState<TipoProducto | ''>('')
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null)
  const [quantity, setQuantity] = useState(''); const [unit, setUnit] = useState<Unidad>('kg'); const [kgPerUnit, setKgPerUnit] = useState('')
  const [cart, setCart] = useState<SaleCartLine[]>([])
  const [customer, setCustomer] = useState('222222222222'); const [type, setType] = useState<TipoVenta>('Detal')
  const [discountValue, setDiscountValue] = useState('')
  const [ivaValue, setIvaValue] = useState('')
  const [paymentMode, setPaymentMode] = useState<'Efectivo' | 'Transferencia' | 'Mixto'>('Efectivo')
  const [cashAmount, setCashAmount] = useState(''); const [transferAmount, setTransferAmount] = useState(''); const [transferReference, setTransferReference] = useState('')
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
  const saleUnit: Unidad = selectedProduct?.tipo_producto === 'Congelada' ? 'Bolsa' : unit
  const saleKgPerUnit = selectedProduct?.tipo_producto === 'Congelada' ? String(selectedProduct.peso_unidad_kg) : kgPerUnit
  const enteredKg = convertedKg(quantity, saleUnit, saleKgPerUnit)
  const unitError = selectedProduct?.tipo_producto === 'Congelada'
    ? (!quantity.trim() || !Number.isInteger(Number(quantity)) || Number(quantity) <= 0 ? 'La cantidad de producto congelado debe ser un número entero de bolsas.' : '')
    : convertedKgError(quantity, saleUnit, saleKgPerUnit)
  const selectedQuantity = selectedProduct?.tipo_producto === 'Congelada' ? Number(quantity) : enteredKg
  const priceOf = (product: AppState['productos'][number]) => type === 'Detal' ? product.precio_venta_detal : product.precio_venta_mayorista
  const selectedPrice = selectedProduct ? priceOf(selectedProduct) : 0
  const selectedSubtotal = selectedQuantity === null || !Number.isFinite(selectedQuantity) ? 0 : roundMoney(selectedQuantity * selectedPrice)
  const subtotal = roundMoney(cart.reduce((sum, line) => {
    const product = state.productos.find(row => row.id_producto === line.id_producto)
    return sum + (product ? (product.tipo_producto === 'Congelada' ? line.cantidad : line.cantidad_kg) * priceOf(product) : 0)
  }, 0))
  const discount = chargeAmount(discountValue)
  const iva = chargeAmount(ivaValue)
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
  const alreadyInCart = selectedProduct ? cart.filter(line => line.id_producto === selectedProduct.id_producto)
    .reduce((sum, line) => sum + (selectedProduct.tipo_producto === 'Congelada' ? line.cantidad : line.cantidad_kg), 0) : 0
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
    if (unitError || enteredKg === null || selectedQuantity === null) {
      setSaleErrors(previous => ({ ...previous, quantity: unitError || 'Este campo es obligatorio' }))
      return
    }
    if (selectedQuantity > availableToAdd) {
      const availableUnit = selectedProduct.tipo_producto === 'Congelada'
        ? quantityUnit(availableToAdd, 'bolsa')
        : selectedProduct.unidad_medida
      toast('warning', 'Stock insuficiente', `Disponible: ${quantityLabel(availableToAdd)} ${availableUnit} de Fresa ${selectedType} ${selectedCategory.nombre_categoria}`)
      return
    }
    setCart(current => [...current, {
      key: `${Date.now()}-${Math.random()}`, id_producto: selectedProduct.id_producto,
      cantidad: Number(quantity), unidad: saleUnit, kgPorUnidad: saleKgPerUnit ? Number(saleKgPerUnit) : undefined,
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
    const payments: Array<{ metodo_pago: MetodoPago; monto: number; referencia?: string }> = paymentMode === 'Mixto'
      ? [{ metodo_pago: 'Efectivo', monto: Number(cashAmount) }, { metodo_pago: 'Transferencia', monto: Number(transferAmount), referencia: transferReference.trim() || undefined }]
      : [{ metodo_pago: paymentMode, monto: total, ...(paymentMode === 'Transferencia' && transferReference.trim() ? { referencia: transferReference.trim() } : {}) }]
    try {
      updateStore(createSale(getState(), {
        numero_documento: customer, id_usuario: Number(sessionStorage.getItem('fresas-user-id')),
        tipo_venta: type, iva, descuento_total: discount, pagos: payments,
        lines: cart.map(line => {
          const product = getState().productos.find(row => row.id_producto === line.id_producto)!
          return { id_producto: line.id_producto, cantidad: product.tipo_producto === 'Congelada' ? line.cantidad : line.cantidad_kg }
        }),
      }))
      toast('success', 'Venta registrada con éxito', 'Pago y existencias actualizados correctamente.')
      setCart([])
      setSelectedType('')
      setSelectedCategoryId(null)
      setDiscountValue('')
      setIvaValue('')
      setCashAmount('')
      setTransferAmount('')
      setTransferReference('')
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
  const exportSales = (format: 'excel' | 'pdf') => {
    const rows = filteredSales.map(sale => {
      const client = state.clientes.find(row => row.numero_documento === sale.numero_documento)
      const details = state.detalle_venta.filter(row => row.id_venta === sale.id_venta)
      const payments = state.pagos_venta.filter(row => row.id_venta === sale.id_venta)
      return [
        formatId('V', sale.id_venta), localDateFromTimestamp(sale.fecha_venta), client?.nombre_cliente ?? '—', sale.tipo_venta,
        details.map(line => `${productName(state, line.id_producto)} (${quantityLabel(line.cantidad)} ${line.unidad_medida})`).join(', '),
        sale.descuento_total, sale.iva, sale.total_pagar,
        payments.map(payment => `${payment.metodo_pago}: ${fmt(payment.monto_recibido)}${payment.referencia ? ` · Ref. ${payment.referencia}` : ''}`).join(' · '),
        sale.estado ? 'Activa' : 'Anulada',
      ]
    })
    const headers = ['N° de venta', 'Fecha', 'Cliente', 'Tipo', 'Productos / unidades', 'Descuento', 'IVA', 'Total', 'Pagos', 'Estado']
    const range = `${historyFilters.from || 'inicio'}-${historyFilters.to || 'hoy'}`
    if (format === 'excel') {
      const book = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([headers, ...rows]), 'Ventas')
      XLSX.writeFile(book, `reporte-ventas-${range}.xlsx`)
    } else {
      const doc = new jsPDF({ orientation: 'landscape' })
      doc.text(`Reporte de ventas · ${historyFilters.from || 'Todas'} a ${historyFilters.to || 'Hoy'}`, 14, 16)
      autoTable(doc, { head: [headers], body: rows.map(row => row.map(String)), startY: 22 })
      doc.save(`reporte-ventas-${range}.pdf`)
    }
    toast('success', `${format === 'excel' ? 'Excel' : 'PDF'} exportado`, 'El reporte de ventas se descargó correctamente.')
  }
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
            {product && <><span>{fmt(priceOf(product))} / {product.unidad_medida}</span><small>Disponible: {quantityLabel(sellableStock(state, product.id_producto))} {quantityUnit(sellableStock(state, product.id_producto), product.unidad_medida)}</small></>}
            {!product && <small>Sin producto activo</small>}
          </button>
        })}</div></section>}
        {selectedProduct && selectedCategory && <section className="sale-step"><h2>3. Cantidad</h2>
          <div className="form-grid">
            <Field label={`Cantidad (${selectedProduct.tipo_producto === 'Congelada' ? 'bolsas' : unit})`}><div className="quantity-input"><input className={`input ${saleErrors.quantity ? 'input-error' : ''}`} type="number" min={selectedProduct.tipo_producto === 'Congelada' ? '1' : '0.01'} step={selectedProduct.tipo_producto === 'Congelada' ? '1' : 'any'} value={quantity} onChange={event => { setQuantity(event.target.value); clearSaleError('quantity') }} />{selectedProduct.tipo_producto === 'Congelada' ? <span className="input-unit">bolsas</span> : <select className="select" value={unit} onChange={event => { setUnit(event.target.value as Unidad); clearSaleError('quantity') }}><option>kg</option><option>g</option><option>Caja</option><option>Bulto</option><option>Bolsa</option></select>}</div>{saleErrors.quantity && <small className="field-error">{saleErrors.quantity}</small>}{selectedProduct.tipo_producto === 'Fresca' && enteredKg !== null && <small className="muted">= {quantityLabel(enteredKg)} kg</small>}</Field>
            {selectedProduct.tipo_producto === 'Fresca' && !(['kg', 'g'] as Unidad[]).includes(unit) && <Field label="Kg por unidad"><input className={`input ${saleErrors.quantity ? 'input-error' : ''}`} type="number" min="0.01" step="any" value={kgPerUnit} onChange={event => { setKgPerUnit(event.target.value); clearSaleError('quantity') }} /></Field>}
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
              <div><strong>{productName(state, product.id_producto)}</strong><small>{product.tipo_producto === 'Congelada' ? `${quantityLabel(line.cantidad)} ${quantityUnit(line.cantidad, 'bolsa')}` : `${quantityLabel(line.cantidad)} ${line.unidad} = ${quantityLabel(line.cantidad_kg)} kg`}</small><small>{fmt(linePrice)} / {product.unidad_medida} · Subtotal {fmt(roundMoney((product.tipo_producto === 'Congelada' ? line.cantidad : line.cantidad_kg) * linePrice))}</small></div>
              <button className="sale-cart-remove" type="button" aria-label="Quitar producto" onClick={() => setCart(current => current.filter(item => item.key !== line.key))}><Ic d={P.close} size={14} /></button>
            </div>
          })}
        </div>
        {saleErrors.cart && <small className="field-error">{saleErrors.cart}</small>}
        <div className="cart-totals">
          <div className="detail-row"><span>Subtotal</span><strong>{fmt(subtotal)}</strong></div>
          <div className="charge-row"><Field label="Descuento ($)"><input className={`input ${discountError || saleErrors.discount ? 'input-error' : ''}`} type="number" min="0" step="0.01" value={discountValue} onChange={event => { setDiscountValue(event.target.value); clearSaleError('discount') }} />{(discountError || saleErrors.discount) && <small className="field-error">{discountError || saleErrors.discount}</small>}</Field><strong>{fmt(discount)}</strong></div>
          <div className="charge-row"><Field label="IVA ($)"><input className={`input ${ivaError || saleErrors.iva ? 'input-error' : ''}`} type="number" min="0" step="0.01" value={ivaValue} onChange={event => { setIvaValue(event.target.value); clearSaleError('iva') }} />{(ivaError || saleErrors.iva) && <small className="field-error">{ivaError || saleErrors.iva}</small>}</Field><strong>{fmt(iva)}</strong></div>
          <div className="detail-row total-row"><span>Total</span><strong>{fmt(total)}</strong></div>
        </div>
        <Field label="Pago"><select className="select" value={paymentMode} onChange={event => { setPaymentMode(event.target.value as 'Efectivo' | 'Transferencia' | 'Mixto'); setCashAmount(''); setTransferAmount(''); setCashTouched(false); setTransferTouched(false); setSaleErrors(previous => ({ ...previous, payment: '' })) }}><option>Efectivo</option><option>Transferencia</option><option>Mixto</option></select></Field>
        {paymentMode === 'Mixto' && <div className="mixed-payment">
          <Field label="Efectivo"><input className="input" type="number" min="0" step="0.01" value={cashAmount} onChange={event => updateCashAmount(event.target.value)} /></Field>
          <Field label="Transferencia"><input className="input" type="number" min="0" step="0.01" value={transferAmount} onChange={event => updateTransferAmount(event.target.value)} /></Field>
          <div className="mixed-payment-actions"><button type="button" className="link-button" onClick={completeWithTransfer}>Completar con transferencia</button><button type="button" className="link-button" onClick={completeWithCash}>Completar con efectivo</button></div>
          <p className={Math.abs(paymentDifference) <= 0.01 ? 'payment-balanced' : 'payment-unbalanced'}>{paymentDifference > 0.01 ? `Falta ${paymentDeltaLabel(paymentDifference)}` : paymentDifference < -0.01 ? `Excede ${paymentDeltaLabel(Math.abs(paymentDifference))}` : 'Pago completo'}</p>
        </div>}
        {(paymentMode === 'Transferencia' || paymentMode === 'Mixto') && <Field label="Referencia de transferencia (opcional)"><input className="input" maxLength={100} value={transferReference} onChange={event => setTransferReference(event.target.value)} /></Field>}
        {saleErrors.payment && <small className="field-error">{saleErrors.payment}</small>}
        {canCreate && <><button className="btn-primary full-width" disabled={registerDisabled} onClick={registerSale}>Registrar venta</button>{registerDisabled && <small className="muted">{registerReason}</small>}</>}
      </aside>
    </div> : <><div className="page-toolbar">{canFilter && <SearchBar placeholder="Buscar venta, cliente o documento..." value={historyQuery} onChange={value => { setHistoryQuery(value); setPage(1) }} />}
      {canFilter && <FilterPopover activeCount={Object.values(historyFilters).filter(Boolean).length} onClear={clearHistoryFilters}>
        <Field label="Tipo de venta"><select className="select" value={historyFilters.saleType} onChange={event => setHistoryFilter('saleType', event.target.value)}><option value="">Todos los tipos</option><option>Detal</option><option>Mayorista</option></select></Field>
        <Field label="Medio de pago"><select className="select" value={historyFilters.method} onChange={event => setHistoryFilter('method', event.target.value)}><option value="">Todos los medios</option><option>Efectivo</option><option>Transferencia</option></select></Field>
        <Field label="Estado"><select className="select" value={historyFilters.status} onChange={event => setHistoryFilter('status', event.target.value)}><option value="">Todos los estados</option><option value="true">Activas</option><option value="false">Anuladas</option></select></Field>
        <div className="filter-date-range"><Field label="Desde"><input className="input" type="date" value={historyFilters.from} onChange={event => setHistoryFilter('from', event.target.value)} /></Field><Field label="Hasta"><input className="input" type="date" value={historyFilters.to} onChange={event => setHistoryFilter('to', event.target.value)} /></Field></div>
      </FilterPopover>}
      {canExport && <div className="purchase-report-actions"><span>Exportar reporte de ventas</span><button className="btn-secondary widget-export-button" onClick={() => exportSales('excel')}>Excel</button><button className="btn-secondary widget-export-button" onClick={() => exportSales('pdf')}>PDF</button><small>{historyFilters.from || 'Todas'} – {historyFilters.to || 'las fechas'}</small></div>}
    </div><div className="card table-scroll"><table className="data-table"><thead><tr><th>Venta</th><th>Fecha</th><th>Cliente</th><th>Tipo</th><th>Descuento</th><th>IVA</th><th>Total</th><th>Pago</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{filteredSales.slice((page - 1) * 10, page * 10).map(row => {
      const methods = state.pagos_venta.filter(payment => payment.id_venta === row.id_venta).map(payment => `${payment.metodo_pago}: ${fmt(payment.monto_recibido)}${payment.referencia ? ` · Ref. ${payment.referencia}` : ''}`).join(' · ')
      return <tr key={row.id_venta}><td data-label="Venta">{formatId('V', row.id_venta)}</td><td data-label="Fecha">{row.fecha_venta.slice(0, 16).replace('T', ' ')}</td><td data-label="Cliente">{state.clientes.find(client => client.numero_documento === row.numero_documento)?.nombre_cliente}</td><td data-label="Tipo">{row.tipo_venta}</td><td data-label="Descuento">{fmt(row.descuento_total)}</td><td data-label="IVA">{fmt(row.iva)}</td><td data-label="Total">{fmt(row.total_pagar)}</td><td data-label="Pago">{methods}</td><td data-label="Estado"><span className={`badge ${row.estado ? 'badge-green' : 'badge-red'}`}>{row.estado ? 'Activa' : 'Anulada'}</span></td><td data-label="Acciones"><div className="actions">{canView && <ViewBtn title="Ver detalle y ticket" onClick={() => setSelectedSaleId(row.id_venta)} />}{canDelete && row.estado && <TrashBtn title="Anular venta" onClick={() => { setCancelReason(''); setCancelReasonError(''); setCancelId(row.id_venta) }} />}</div></td></tr>
    })}</tbody></table></div><Pagination page={page} total={filteredSales.length} onPageChange={setPage} /></>}
    <Modal open={selectedSale !== undefined} title={selectedSale ? `Detalle y ticket ${formatId('V', selectedSale.id_venta)}` : 'Detalle de venta'} onClose={() => setSelectedSaleId(null)} wide>
      {selectedSale && <><div className="ticket-print">
        <header className="ticket-header"><strong>Fresas del Oriente</strong><span>Ticket de venta {formatId('V', selectedSale.id_venta)}</span><span>{localDateFromTimestamp(selectedSale.fecha_venta)} · {selectedSale.fecha_venta.slice(11, 16)}</span></header>
        <div className="detail-row"><span>Cliente</span><strong>{state.clientes.find(client => client.numero_documento === selectedSale.numero_documento)?.nombre_cliente}</strong></div>
        <div className="detail-row"><span>Tipo de venta</span><strong>{selectedSale.tipo_venta}</strong></div>
        <div className="ticket-items"><div className="ticket-item ticket-item-head"><span>Producto / lote</span><span>Cant. · Precio</span><strong>Subtotal</strong></div>
          {selectedSaleLines.map(line => <div className="ticket-item" key={line.id_detalle_venta}><span>{productName(state, line.id_producto)}<small>Lote: {state.lotes.find(lot => lot.id_lote === line.id_lote)?.numero_lote ?? '—'}</small></span><span>{quantityLabel(line.cantidad)} {line.unidad_medida} · {fmt(line.precio_unitario)}/{line.unidad_medida}</span><strong>{fmt(line.cantidad * line.precio_unitario)}</strong></div>)}
        </div>
        <div className="detail-row"><span>Subtotal</span><strong>{fmt(selectedSaleSubtotal)}</strong></div>
        <div className="detail-row"><span>Descuento</span><strong>{fmt(selectedSale.descuento_total)}</strong></div>
        <div className="detail-row"><span>IVA</span><strong>{fmt(selectedSale.iva)}</strong></div>
        <div className="detail-row total-row"><span>Total</span><strong>{fmt(selectedSale.total_pagar)}</strong></div>
        <div className="ticket-payments"><strong>Pagos</strong>{selectedSalePayments.map(payment => <div className="detail-row" key={payment.id_pago_venta}><span>{payment.metodo_pago}{payment.referencia && <small className="cell-sub">Referencia: {payment.referencia}</small>}</span><strong>{fmt(payment.monto_recibido)}</strong></div>)}</div>
        {!selectedSale.estado && <div className="detail-row"><span>Motivo de anulación</span><strong>{selectedSale.motivo_anulacion}</strong></div>}
      </div><div className="modal-actions"><button className="btn-secondary" onClick={() => window.print()}>Imprimir ticket</button><button className="btn-primary" onClick={() => setSelectedSaleId(null)}>Cerrar</button></div></>}
    </Modal>
    <Modal open={cancelId !== null} title="¿Anular venta?" onClose={() => setCancelId(null)} narrow>
      <p className="muted">Se devolverán las existencias a sus lotes de origen.</p>
      <Field label="Motivo de anulación"><textarea className={`input ${cancelReasonError ? 'input-error' : ''}`} maxLength={200} value={cancelReason} onChange={event => { setCancelReason(event.target.value); setCancelReasonError('') }} /></Field>
      {cancelReasonError && <small className="field-error">{cancelReasonError}</small>}
      <div className="modal-actions"><button className="btn-secondary" onClick={() => setCancelId(null)}>Cancelar</button>{canDelete && <button className="btn-danger" onClick={saveCancellation}>Anular venta</button>}</div>
    </Modal>
  </section>
}

export function DashboardPage({ openLots }: { openLots: () => void }) {
  const navigate = useNavigate()
  const state = useStore(); const toast = useToast()
  const user = state.usuarios.find(item => item.id_usuario === Number(sessionStorage.getItem('fresas-user-id')))
  const canExport = user?.id_rol === 1 || canModuleAction(state, user?.id_rol ?? -1, 'Dashboard', 'Exportar')
  const canCreateProduction = user?.id_rol === 1 || canModuleAction(state, user?.id_rol ?? -1, 'Producción', 'Registrar')
  const canViewProducts = user?.id_rol === 1 || canModuleAction(state, user?.id_rol ?? -1, 'Productos', 'Consultar')
  const period = 'Semanal' as const
  const stats = dashboardStats(state); const rows = periodRows(state, period); const lotWarnings = expiringLots(state); const lotsToFreeze = freezeSuggestions(state).slice(0, 5)
  const pieData = stats.stockByType
  const label = 'Últimos 7 días'
  const exportWidget = (title: string, fileName: string, headers: string[], data: Array<Array<string | number>>, format: 'excel' | 'pdf') => {
    if (format === 'excel') {
      const book = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([headers, ...data]), 'Datos')
      XLSX.writeFile(book, `${fileName}.xlsx`)
    } else {
      const doc = new jsPDF({ orientation: 'landscape' })
      doc.text(title, 14, 16)
      autoTable(doc, { head: [headers], body: data.map(row => row.map(String)), startY: 22 })
      doc.save(`${fileName}.pdf`)
    }
    toast('success', `${format === 'excel' ? 'Excel' : 'PDF'} exportado`, `Se exportaron los datos de ${title}.`)
  }
  const widgetExport = (title: string, fileName: string, headers: string[], data: Array<Array<string | number>>) => canExport
    ? <div className="widget-export-actions" aria-label={`Exportar ${title}`}>
      <button className="btn-secondary widget-export-button" onClick={() => exportWidget(title, fileName, headers, data, 'excel')}>Excel</button>
      <button className="btn-secondary widget-export-button" onClick={() => exportWidget(title, fileName, headers, data, 'pdf')}>PDF</button>
    </div>
    : null
  const salesChartRows = rows.map(row => [row.label, row.ventas, row.compras])
  const stockChartRows = pieData.map(row => [row.name, Number(row.value.toFixed(2)), 'kg'])
  const cashBalance = Object.values(stats.paymentTotals).reduce((sum, amount) => sum + Number(amount), 0) - stats.purchasesToday
  const cashRows = [
    ['Efectivo', fmt(Number(stats.paymentTotals.Efectivo))],
    ['Transferencia', fmt(Number(stats.paymentTotals.Transferencia))],
    ['Compras del día (egreso)', fmt(stats.purchasesToday)],
    ['Saldo', fmt(cashBalance)],
  ]
  const critical = lotWarnings.filter(lot => ['vencido', 'critico'].includes(expiryStatus(lot.fecha_vencimiento)))
  const warnings = lotWarnings.filter(lot => expiryStatus(lot.fecha_vencimiento) === 'advertencia')
  const lowProducts = state.productos.filter(product => product.estado && stockBajo(state, product.id_producto))
  const alertRows = [...lotWarnings.map(lot => {
    const product = state.productos.find(row => row.id_producto === lot.detail?.id_producto)
    const category = state.categorias.find(row => row.id_categoria === product?.id_categoria)?.nombre_categoria ?? ''
    return [
      'Vencimiento', `${product?.tipo_producto === 'Congelada' ? 'Fresa Congelada' : 'Fresa Fresca'} · ${category} · ${lot.numero_lote}`,
      `${quantityLabel(lot.cantidad_disponible)} ${quantityUnit(lot.cantidad_disponible, product?.unidad_medida ?? 'kg')}`,
      lot.fecha_vencimiento, expiryStatus(lot.fecha_vencimiento),
    ]
  }), ...lowProducts.map(product => {
    const category = state.categorias.find(row => row.id_categoria === product.id_categoria)?.nombre_categoria ?? ''
    return [
      'Stock bajo', `Fresa ${product.tipo_producto} · ${category}`,
      `${quantityLabel(stockVendible(state, product.id_producto))} ${quantityUnit(stockVendible(state, product.id_producto), product.unidad_medida)}`,
      `Mínimo ${quantityLabel(product.stock_minimo)} ${quantityUnit(product.stock_minimo, product.unidad_medida)}`, 'Bajo',
    ]
  })]
  const kpis = [
    { title: 'Ventas del Día', value: fmt(stats.salesToday), note: stats.salesChange === null ? 'Sin ventas ayer' : `${stats.salesChange > 0 ? '+' : ''}${stats.salesChange.toFixed(1)}% vs. ayer`, icon: P.cash, tone: 'sales', noteTone: stats.salesChange === null ? 'neutral' : stats.salesChange < 0 ? 'negative' : '' },
    { title: 'Compras del Mes', value: fmt(stats.purchasesMonth), note: `${stats.purchaseCount} órdenes`, icon: P.truck, tone: 'purchases', noteTone: '' },
    { title: 'Stock Fresco Crítico', value: `${stats.freshCriticalCount} lotes`, note: 'Vencidos o vencen en menos de 48 horas', icon: P.alert, tone: 'critical', noteTone: 'warning' },
    { title: 'Rend. Transformación', value: `${(stats.yieldAverage * 100).toFixed(1)}%`, note: 'Promedio de las últimas 10 órdenes', icon: P.sparkle, tone: 'yield', noteTone: 'neutral' },
  ]
  return <section>
    <div className="page-toolbar"><span className="muted">{label}</span></div>
    <div className="summary-grid four">{kpis.map(item => <article key={item.title} className={`card dashboard-kpi ${item.tone}`} onClick={item.tone === 'critical' && canViewProducts ? openLots : undefined} onKeyDown={event => {
      if (item.tone === 'critical' && canViewProducts && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); openLots() }
    }} role={item.tone === 'critical' && canViewProducts ? 'button' : undefined} tabIndex={item.tone === 'critical' && canViewProducts ? 0 : undefined}>
      <div className="dashboard-kpi-head"><span>{item.title}</span><span className="dashboard-kpi-icon"><Ic d={item.icon} size={19} /></span></div>
      <strong>{item.value}</strong><small className={item.noteTone}>{item.note}</small>
    </article>)}</div>
    <div className="dashboard-grid"><div className="card chart-card">
      <div className="chart-card-heading"><div><h2>Ventas vs. Compras</h2><p>{label}</p></div>{widgetExport('Ventas vs. Compras', 'dashboard-ventas-compras', ['Periodo', 'Ventas', 'Compras'], salesChartRows)}</div>
      {!rows.some(row => row.ventas || row.compras) ? <div className="table-empty">No se registran datos para la temporalidad seleccionada.</div> : <ResponsiveContainer width="100%" height={240}><LineChart data={rows}><CartesianGrid stroke="var(--border-soft)" strokeDasharray="3 3" /><XAxis dataKey="label" /><YAxis /><Tooltip formatter={value => fmt(Number(value ?? 0))} /><Line dataKey="ventas" stroke="var(--chart-sales)" name="Ventas" /><Line dataKey="compras" stroke="var(--chart-purchases)" name="Compras" /></LineChart></ResponsiveContainer>}</div>
      <div className="card chart-card">
        <div className="chart-card-heading"><div><h2>Distribución de stock</h2>
        <p>{quantityLabel(pieData.reduce((sum, row) => sum + row.value, 0))} kg · Por tipo</p></div>{widgetExport('Distribución de stock', 'dashboard-distribucion-stock', ['Grupo', 'Stock', 'Unidad'], stockChartRows)}</div>
        <div className="donut-chart"><ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={78}>
              {pieData.map((_, i) => <Cell key={i} fill={`var(--chart-${i % 5 + 1})`} />)}
            </Pie>
            <Tooltip formatter={value => `${quantityLabel(Number(value ?? 0))} kg`} />
          </PieChart>
        </ResponsiveContainer><span className="donut-unit">kg</span></div>
      </div>
    </div>
    <div className="dashboard-grid"><div className="card chart-card">
      <div className="chart-card-heading"><h2>Cierre de caja — Hoy</h2>{widgetExport('Cierre de caja', 'dashboard-cierre-caja', ['Concepto', 'Valor'], cashRows)}</div>
      {Object.entries(stats.paymentTotals).map(([method, total]) => <div className="detail-row" key={method}><span>{method}</span><strong>{fmt(Number(total))}</strong></div>)}<div className="detail-row"><span>Compras del día (egreso)</span><strong>{fmt(stats.purchasesToday)}</strong></div><div className="detail-row"><span>Saldo</span><strong>{fmt(cashBalance)}</strong></div></div>
      <div className="card chart-card"><div className="chart-card-heading"><h2>Lotes por vencer</h2>{widgetExport('Lotes por vencer', 'dashboard-lotes-por-vencer', ['Alerta', 'Producto / lote', 'Cantidad', 'Fecha / mínimo', 'Estado'], alertRows)}</div>{[...critical, ...warnings].map(lot => {
        const product = state.productos.find(row => row.id_producto === lot.detail?.id_producto)
        const category = state.categorias.find(row => row.id_categoria === product?.id_categoria)?.nombre_categoria ?? 'sin categoría'
        const difference = dateDistance(lot.fecha_vencimiento, localDateString())
        const expiry = difference < 0 ? `venció hace ${Math.abs(difference)} día${Math.abs(difference) === 1 ? '' : 's'}` : difference === 0 ? 'vence hoy' : difference === 1 ? 'vence mañana' : `vence en ${difference} días`
        return { text: `${product?.tipo_producto === 'Congelada' ? 'Fresa congelada' : 'Fresa fresca'} del lote ${lot.numero_lote} (${category}, ${quantityLabel(lot.cantidad_disponible)} ${product?.unidad_medida ?? 'kg'}) ${expiry}`, severity: difference < 0 || difference === 0 ? 'danger' : 'warning', key: `expiry-${lot.id_lote}` }
      }).map(item => <div className={`alert-row ${item.severity}`} key={item.key}>{item.text}</div>)}{lowProducts.map(product => {
        const category = state.categorias.find(row => row.id_categoria === product.id_categoria)?.nombre_categoria ?? ''
        return { text: `Stock bajo: Fresa ${product.tipo_producto} · ${category} (${quantityLabel(sellableStock(state, product.id_producto))} ${quantityUnit(sellableStock(state, product.id_producto), product.unidad_medida)}, mínimo ${quantityLabel(product.stock_minimo)} ${quantityUnit(product.stock_minimo, product.unidad_medida)})`, severity: 'warning', key: `stock-${product.id_producto}` }
      }).map(item => <div className={`alert-row ${item.severity}`} key={item.key}>{item.text}</div>)}{!lotWarnings.length && !lowProducts.length && <div className="table-empty">No hay alertas de inventario pendientes en este momento.</div>}</div></div>
    <div className="card chart-card"><div className="page-toolbar"><div><h2>Fresas por pasar a congelado</h2><p>Prioriza las fresas próximas a vencer.</p></div>{canViewProducts && <button className="btn-secondary" onClick={openLots}>Ver productos</button>}</div>{lotsToFreeze.length ? lotsToFreeze.map(lot => {
      const status = expiryStatus(lot.fecha_vencimiento)
      const product = state.productos.find(row => row.id_producto === lot.detail?.id_producto)
      return <div key={lot.id_lote} className="detail-row freeze-suggestion">
        <div className="freeze-suggestion-info"><strong>{product ? productName(state, product.id_producto) : 'Fresa fresca'} · Lote {lot.numero_lote} · {quantityLabel(lot.cantidad_disponible)} {quantityUnit(lot.cantidad_disponible, product?.unidad_medida ?? 'kg')}</strong><small>Vencimiento: {lot.fecha_vencimiento}</small></div>
        <span className={`badge ${status === 'critico' ? 'badge-red' : 'badge-amber'}`}>{status === 'critico' ? 'Crítico' : 'Advertencia'}</span>
        {canCreateProduction && <button className="btn-primary" onClick={() => { sessionStorage.setItem('fresas-production-lot', String(lot.id_lote)); navigate('/produccion') }}>Pasar a congelado</button>}
      </div>
    }) : <div className="dashboard-empty-success"><Ic d={P.check} size={17} /><span>Todo en orden: ningún lote por vencer.</span></div>}</div>
  </section>
}
