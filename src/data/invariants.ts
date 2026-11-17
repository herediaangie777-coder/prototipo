import type { AppState } from './types'

export function checkInvariants(state: AppState): void {
  const unitRows = [
    ...state.detalle_compra,
    ...state.detalle_venta,
    ...state.detalle_produccion,
    ...state.produccion,
  ]
  if (unitRows.some(row => row.unidad_medida !== 'kg')) {
    throw new Error('Las cantidades de inventario deben estar almacenadas en kg.')
  }
  const purchaseByDetail = new Map(state.detalle_compra.map(d => [d.id_detalle_compra, d]))
  const purchasedByLot = new Map<number, number>()
  for (const lot of state.lotes) {
    const detail = purchaseByDetail.get(lot.id_detalle_compra)
    if (!detail) throw new Error(`Lote ${lot.numero_lote} sin detalle de compra`)
    if (lot.cantidad_disponible < 0 || lot.cantidad_disponible > detail.cantidad) {
      throw new Error(`Cantidad inválida para el lote ${lot.numero_lote}`)
    }
    purchasedByLot.set(lot.id_lote, detail.cantidad)
  }
  const consumedByLot = new Map<number, number>()
  for (const detail of state.detalle_venta) {
    if (detail.id_lote !== null && state.ventas.some(sale => sale.id_venta === detail.id_venta && sale.estado)) {
      consumedByLot.set(detail.id_lote, (consumedByLot.get(detail.id_lote) ?? 0) + detail.cantidad)
    }
  }
  for (const production of state.produccion) {
    consumedByLot.set(production.id_lote, (consumedByLot.get(production.id_lote) ?? 0) + production.cantidad_procesada)
  }
  for (const [id, consumed] of consumedByLot) {
    if (consumed > (purchasedByLot.get(id) ?? 0)) throw new Error(`Consumo superior a compra para el lote ${id}`)
  }
  for (const product of state.productos) {
    if (product.stock_disponible < 0) throw new Error(`Stock negativo para el producto ${product.id_producto}`)
  }
  for (const purchase of state.compras) {
    const lines = state.detalle_compra.filter(d => d.id_compra === purchase.id_compra)
    const lineTotal = lines.reduce((sum, line) => sum + line.cantidad * line.precio_unitario, 0)
    if (Math.abs(purchase.total_compra - (lineTotal + purchase.iva - purchase.descuento)) > 0.02) {
      throw new Error(`Total inconsistente en compra ${purchase.id_compra}`)
    }
  }
  for (const sale of state.ventas) {
    const lines = state.detalle_venta.filter(d => d.id_venta === sale.id_venta)
    const lineTotal = lines.reduce((sum, line) => sum + line.cantidad * line.precio_unitario, 0)
    if (Math.abs(sale.total_pagar - (lineTotal + sale.iva - sale.descuento_total)) > 0.02) {
      throw new Error(`Total inconsistente en venta ${sale.id_venta}`)
    }
  }
}
