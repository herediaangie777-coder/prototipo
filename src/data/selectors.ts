import type { AppState, TipoVenta } from './types'
import { expiryStatus, localDateFromTimestamp, localDateString } from './dates'

export const productName = (state: AppState, id: number) => {
  const product = state.productos.find(row => row.id_producto === id)
  if (!product) return 'Producto desconocido'
  const category = state.categorias.find(row => row.id_categoria === product.id_categoria)?.nombre_categoria ?? ''
  return `Fresa ${product.tipo_producto === 'Fresca' ? 'Fresca' : 'Congelada'} · ${category} · ${product.presentacion}`
}

export function stockByLot(state: AppState, productId?: number) {
  return state.lotes.map(lot => {
    const purchaseDetail = lot.id_detalle_compra === null ? undefined : state.detalle_compra.find(row => row.id_detalle_compra === lot.id_detalle_compra)
    const productionDetail = lot.id_detalle_produccion === null ? undefined : state.detalle_produccion.find(row => row.id_detalle_produccion === lot.id_detalle_produccion)
    const detail = purchaseDetail ?? productionDetail
    const supplier = purchaseDetail && state.compras.find(row => row.id_compra === purchaseDetail.id_compra)
    return { ...lot, detail, supplier: supplier && state.proveedores.find(row => row.id_proveedor === supplier.id_proveedor) }
  }).filter(lot => productId === undefined || lot.detail?.id_producto === productId)
}

export function stockVendible(state: AppState, productId: number, now = new Date()): number {
  const today = localDateString(now)
  return stockByLot(state, productId)
    .filter(lot => lot.estado && lot.fecha_vencimiento >= today && expiryStatus(lot.fecha_vencimiento, now) !== 'vencido')
    .reduce((sum, lot) => sum + lot.cantidad_disponible, 0)
}
export const sellableStock = stockVendible
export function stockVencido(state: AppState, productId: number, now = new Date()): number {
  return stockByLot(state, productId).filter(lot => lot.estado && expiryStatus(lot.fecha_vencimiento, now) === 'vencido')
    .reduce((sum, lot) => sum + lot.cantidad_disponible, 0)
}
export function stockBajo(state: AppState, productId: number): boolean {
  const product = state.productos.find(row => row.id_producto === productId)
  return !!product && stockVendible(state, productId) <= product.stock_minimo
}
export function stockEnKg(state: AppState, productId: number): number {
  const product = state.productos.find(row => row.id_producto === productId)
  return product ? stockVendible(state, productId) * (product.peso_unidad_kg ?? 1) : 0
}

export function expiringLots(state: AppState, now = new Date()) {
  return stockByLot(state).filter(lot => lot.estado && lot.cantidad_disponible > 0 && expiryStatus(lot.fecha_vencimiento, now) !== 'activo')
}
export function freezeCandidates(state: AppState, now = new Date()) {
  return stockByLot(state).filter(lot => {
    const product = state.productos.find(row => row.id_producto === lot.detail?.id_producto)
    return lot.estado && lot.es_transformable && lot.cantidad_disponible > 0
      && expiryStatus(lot.fecha_vencimiento, now) !== 'vencido'
      && product?.tipo_producto === 'Fresca'
  })
}
export function freezeSuggestions(state: AppState, now = new Date()) {
  return freezeCandidates(state, now)
    .filter(lot => ['critico', 'advertencia'].includes(expiryStatus(lot.fecha_vencimiento, now)))
    .sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento))
}
export function supplierHistory(state: AppState, id: number) {
  return state.compras.filter(row => row.id_proveedor === id).map(row => ({
    compra: row, details: state.detalle_compra.filter(detail => detail.id_compra === row.id_compra),
  }))
}
export function clientHistory(state: AppState, document: string) {
  return state.ventas.filter(row => row.numero_documento === document && row.estado).map(row => ({
    venta: row, details: state.detalle_venta.filter(detail => detail.id_venta === row.id_venta),
    pagos: state.pagos_venta.filter(payment => payment.id_venta === row.id_venta),
  }))
}
export function hasPermission(state: AppState, roleId: number, module: string, privilege: string) {
  const permissionId = state.permisos.find(row => row.nombre_permiso === module)?.id_permiso
  const privilegeId = state.privilegios.find(row => row.nombre_privilegio === privilege)?.id_privilegio
  if (permissionId === undefined || privilegeId === undefined) return false
  if (!state.permisos_privilegios.some(row => row.id_permiso === permissionId && row.id_privilegio === privilegeId)) return false
  if (roleId === 1) return true
  return state.roles_x_permisos.some(row => row.id_rol === roleId && row.id_permiso === permissionId && row.id_privilegio === privilegeId)
}
export function saleTypePrice(product: AppState['productos'][number], type: TipoVenta) {
  return type === 'Detal' ? product.precio_venta_detal : product.precio_venta_mayorista
}
export function dashboardStats(state: AppState, now = new Date()) {
  const today = localDateString(now)
  const yesterdayDate = new Date(now); yesterdayDate.setDate(now.getDate() - 1)
  const yesterday = localDateString(yesterdayDate)
  const month = today.slice(0, 7)
  const salesToday = state.ventas.filter(sale => sale.estado && localDateFromTimestamp(sale.fecha_venta) === today).reduce((sum, sale) => sum + sale.total_pagar, 0)
  const salesYesterday = state.ventas.filter(sale => sale.estado && localDateFromTimestamp(sale.fecha_venta) === yesterday).reduce((sum, sale) => sum + sale.total_pagar, 0)
  const purchases = state.compras.filter(purchase => purchase.estado && localDateFromTimestamp(purchase.fecha_compra).slice(0, 7) === month)
  const production = [...state.produccion].sort((a, b) => b.fecha_produccion.localeCompare(a.fecha_produccion)).slice(0, 10)
  const yields = production.filter(row => row.estado === 'Finalizada').map(row => {
    const kg = state.detalle_produccion.filter(detail => detail.id_produccion === row.id_produccion).reduce((sum, detail) => {
      const product = state.productos.find(item => item.id_producto === detail.id_producto)
      return sum + detail.cantidad_obtenida * (product?.peso_unidad_kg ?? 1)
    }, 0)
    return kg / row.cantidad_a_procesar
  })
  const freshCritical = stockByLot(state).filter(lot => lot.estado
    && state.productos.find(p => p.id_producto === lot.detail?.id_producto)?.tipo_producto === 'Fresca'
    && lot.cantidad_disponible > 0
    && ['vencido', 'critico'].includes(expiryStatus(lot.fecha_vencimiento, now)))
  const todayPayments = state.pagos_venta.filter(payment => state.ventas.some(sale => sale.id_venta === payment.id_venta && sale.estado && localDateFromTimestamp(sale.fecha_venta) === today))
  const todaysPurchases = state.compras.filter(row => row.estado && localDateFromTimestamp(row.fecha_compra) === today)
  return {
    salesToday, salesYesterday,
    salesChange: salesYesterday ? ((salesToday - salesYesterday) / salesYesterday) * 100 : null,
    purchasesMonth: purchases.reduce((sum, row) => sum + row.total_compra, 0), purchaseCount: purchases.length,
    freshCriticalCount: freshCritical.length,
    yieldAverage: yields.length ? yields.reduce((sum, value) => sum + value, 0) / yields.length : 0,
    paymentTotals: Object.fromEntries(['Efectivo', 'Transferencia'].map(method => [method, todayPayments.filter(row => row.metodo_pago === method).reduce((sum, row) => sum + row.monto_recibido, 0)])),
    purchasesToday: todaysPurchases.reduce((sum, row) => sum + row.total_compra, 0),
    stockByType: ['Fresca', 'Congelada'].map(type => ({ name: `Fresa ${type}`, value: state.productos.filter(p => p.tipo_producto === type).reduce((sum, p) => sum + stockEnKg(state, p.id_producto), 0) })),
    stockByCategory: state.categorias.map(category => ({ name: category.nombre_categoria, value: state.productos.filter(p => p.id_categoria === category.id_categoria).reduce((sum, p) => sum + stockEnKg(state, p.id_producto), 0) })),
  }
}

export function periodRows(state: AppState, period: 'Diario' | 'Semanal' | 'Mensual' | 'Anual', now = new Date()) {
  if (period === 'Anual') {
    return Array.from({ length: 12 }, (_, index) => {
      const month = new Date(now.getFullYear(), now.getMonth() - 11 + index, 1)
      const key = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`
      return {
        date: `${key}-01`,
        label: month.toLocaleDateString('es-CO', { month: 'short', year: '2-digit' }),
        ventas: state.ventas.filter(row => row.estado && localDateFromTimestamp(row.fecha_venta).slice(0, 7) === key).reduce((sum, row) => sum + row.total_pagar, 0),
        compras: state.compras.filter(row => row.estado && localDateFromTimestamp(row.fecha_compra).slice(0, 7) === key).reduce((sum, row) => sum + row.total_compra, 0),
      }
    })
  }
  const days = period === 'Diario' ? 1 : period === 'Semanal' ? 7 : 30
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(now)
    date.setDate(now.getDate() - (days - index - 1))
    const key = localDateString(date)
    return {
      date: key,
      label: date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }),
      ventas: state.ventas.filter(row => row.estado && localDateFromTimestamp(row.fecha_venta) === key).reduce((sum, row) => sum + row.total_pagar, 0),
      compras: state.compras.filter(row => row.estado && localDateFromTimestamp(row.fecha_compra) === key).reduce((sum, row) => sum + row.total_compra, 0),
    }
  })
}
