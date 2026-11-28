import type { AppState } from './types'

const near = (a: number, b: number) => Math.abs(a - b) <= 0.02

export function checkInvariants(state: AppState): void {
  const purchaseDetails = new Map(state.detalle_compra.map(row => [row.id_detalle_compra, row]))
  const productionDetails = new Map(state.detalle_produccion.map(row => [row.id_detalle_produccion, row]))
  const consumedByLot = new Map<number, number>()
  const validPairs = new Set<string>()
  const rolePairs = new Set<string>()
  const productVariants = new Set<string>()

  for (const municipality of state.municipios) {
    if (!state.departamentos.some(row => row.id_departamento === municipality.id_departamento)) {
      throw new Error(`Municipio ${municipality.id_municipio} sin departamento.`)
    }
  }
  for (const entity of [...state.clientes, ...state.proveedores]) {
    if (entity.id_municipio !== null && !state.municipios.some(row => row.id_municipio === entity.id_municipio)) {
      throw new Error('Un cliente o proveedor tiene un municipio inválido.')
    }
  }

  for (const product of state.productos) {
    const validFresh = product.tipo_producto === 'Fresca' && product.unidad_medida === 'kg' && product.peso_unidad_kg === null
    const validFrozen = product.tipo_producto === 'Congelada' && product.unidad_medida === 'bolsa'
      && product.peso_unidad_kg !== null && product.peso_unidad_kg > 0
    if (!validFresh && !validFrozen) throw new Error(`Unidad o peso inválido para producto ${product.id_producto}`)
    if (!state.categorias.some(category => category.id_categoria === product.id_categoria)) {
      throw new Error(`Producto ${product.id_producto} sin categoría.`)
    }
    const variant = [
      product.id_categoria,
      product.tipo_producto,
      product.presentacion.trim().toLowerCase(),
      product.unidad_medida,
      product.peso_unidad_kg ?? 'sin-peso',
    ].join(':')
    if (productVariants.has(variant)) throw new Error(`Variante de producto duplicada: ${product.presentacion}.`)
    productVariants.add(variant)
  }
  for (const row of state.permisos_privilegios) {
    if (!state.permisos.some(permission => permission.id_permiso === row.id_permiso)
      || !state.privilegios.some(privilege => privilege.id_privilegio === row.id_privilegio)) {
      throw new Error('La matriz de permisos contiene referencias inválidas.')
    }
    const key = `${row.id_permiso}:${row.id_privilegio}`
    if (validPairs.has(key)) throw new Error('La matriz de permisos contiene pares duplicados.')
    validPairs.add(key)
  }
  for (const row of state.roles_x_permisos) {
    const pair = `${row.id_permiso}:${row.id_privilegio}`
    const key = `${row.id_rol}:${pair}`
    if (!state.roles.some(role => role.id_rol === row.id_rol) || !validPairs.has(pair)) {
      throw new Error('Un rol contiene un par módulo/acción no permitido.')
    }
    if (rolePairs.has(key)) throw new Error('Un rol contiene asignaciones de permisos duplicadas.')
    rolePairs.add(key)
  }
  for (const detail of state.detalle_compra) {
    const product = state.productos.find(row => row.id_producto === detail.id_producto)
    if (!state.compras.some(row => row.id_compra === detail.id_compra) || !product || product.tipo_producto !== 'Fresca'
      || detail.unidad_medida !== 'kg' || detail.cantidad <= 0 || detail.precio_unitario < 0) {
      throw new Error('Detalle de compra inválido.')
    }
  }
  for (const detail of state.detalle_produccion) {
    const product = state.productos.find(row => row.id_producto === detail.id_producto)
    if (!state.produccion.some(row => row.id_produccion === detail.id_produccion) || !product
      || product.tipo_producto !== 'Congelada' || detail.unidad_medida !== 'bolsa'
      || !Number.isInteger(detail.cantidad_obtenida) || detail.cantidad_obtenida <= 0) {
      throw new Error(`Detalle de producción ${detail.id_detalle_produccion} inválido.`)
    }
  }
  for (const detail of state.detalle_venta) {
    const product = state.productos.find(row => row.id_producto === detail.id_producto)
    if (!product || !state.lotes.some(row => row.id_lote === detail.id_lote)
      || !state.ventas.some(row => row.id_venta === detail.id_venta)
      || detail.unidad_medida !== product.unidad_medida || detail.cantidad <= 0) {
      throw new Error(`Detalle de venta ${detail.id_detalle_venta} inválido.`)
    }
    if (state.ventas.some(sale => sale.id_venta === detail.id_venta && sale.estado)) {
      consumedByLot.set(detail.id_lote, (consumedByLot.get(detail.id_lote) ?? 0) + detail.cantidad)
    }
  }
  for (const lot of state.lotes) {
    const fromPurchase = lot.id_detalle_compra !== null
    const fromProduction = lot.id_detalle_produccion !== null
    if (fromPurchase === fromProduction) throw new Error(`Lote ${lot.numero_lote} debe tener exactamente un origen.`)
    const sourcePurchase = fromPurchase ? purchaseDetails.get(lot.id_detalle_compra!) : undefined
    const sourceProduction = fromProduction ? productionDetails.get(lot.id_detalle_produccion!) : undefined
    if (!sourcePurchase && !sourceProduction) throw new Error(`Lote ${lot.numero_lote} sin detalle de origen.`)
    if (!state.ubicaciones.some(row => row.id_ubicacion === lot.id_ubicacion)) throw new Error(`Lote ${lot.numero_lote} sin ubicación válida.`)
    if (lot.fecha_vencimiento < lot.fecha_ingreso) throw new Error(`Fechas inválidas para el lote ${lot.numero_lote}.`)
    const sourceQuantity = sourcePurchase?.cantidad ?? sourceProduction?.cantidad_obtenida ?? 0
    if (lot.cantidad_disponible < 0 || lot.cantidad_disponible > sourceQuantity) throw new Error(`Cantidad inválida para el lote ${lot.numero_lote}`)
    if (sourcePurchase && state.productos.find(row => row.id_producto === sourcePurchase.id_producto)?.unidad_medida !== 'kg') {
      throw new Error(`El lote ${lot.numero_lote} no tiene origen fresco.`)
    }
    if (sourceProduction && state.productos.find(row => row.id_producto === sourceProduction.id_producto)?.unidad_medida !== 'bolsa') {
      throw new Error(`El lote ${lot.numero_lote} no tiene origen congelado.`)
    }
  }
  for (const production of state.produccion) {
    const source = state.lotes.find(lot => lot.id_lote === production.id_lote_origen)
    const sourceDetail = source && source.id_detalle_compra !== null ? purchaseDetails.get(source.id_detalle_compra) : undefined
    const sourceProduct = sourceDetail && state.productos.find(row => row.id_producto === sourceDetail.id_producto)
    if (!source || !sourceProduct || sourceProduct.tipo_producto !== 'Fresca' || production.cantidad_a_procesar <= 0
      || !['En proceso', 'Finalizada', 'Anulada'].includes(production.estado)) {
      throw new Error(`Orden de producción ${production.id_produccion} tiene un origen inválido.`)
    }
    if (production.estado !== 'Anulada') {
      consumedByLot.set(source.id_lote, (consumedByLot.get(source.id_lote) ?? 0) + production.cantidad_a_procesar)
    }
    const details = state.detalle_produccion.filter(row => row.id_produccion === production.id_produccion)
    if (production.estado === 'Finalizada' || (production.estado === 'Anulada' && production.fecha_finalizacion)) {
      if (details.length !== 1 || production.merma === null || production.fecha_finalizacion === null) throw new Error(`Orden finalizada ${production.id_produccion} incompleta.`)
      const outputProduct = state.productos.find(row => row.id_producto === details[0].id_producto)
      if (!outputProduct || outputProduct.tipo_producto !== 'Congelada' || outputProduct.id_categoria !== sourceProduct.id_categoria
        || details[0].unidad_medida !== 'bolsa' || outputProduct.peso_unidad_kg === null) {
        throw new Error(`Producto de salida inválido en orden ${production.id_produccion}.`)
      }
      const kgProduced = details[0].cantidad_obtenida * outputProduct.peso_unidad_kg!
      if (kgProduced > production.cantidad_a_procesar || production.merma < 0
        || !near(production.merma, production.cantidad_a_procesar - kgProduced)) {
        throw new Error(`Merma inconsistente en orden ${production.id_produccion}.`)
      }
    } else if (production.estado === 'En proceso' && (production.merma !== null || details.length || production.fecha_finalizacion !== null)) {
      throw new Error(`La orden en proceso ${production.id_produccion} no debe tener resultado final.`)
    } else if (production.estado === 'Anulada' && !production.fecha_finalizacion && (production.merma !== null || details.length)) {
      throw new Error(`La orden anulada ${production.id_produccion} tiene un resultado inválido.`)
    }
  }
  for (const payment of state.pagos_venta) {
    if (!state.ventas.some(sale => sale.id_venta === payment.id_venta) || !(payment.monto_recibido > 0)) {
      throw new Error(`Pago ${payment.id_pago_venta} inválido.`)
    }
  }
  for (const [lotId, consumed] of consumedByLot) {
    const lot = state.lotes.find(row => row.id_lote === lotId)!
    const origin = lot.id_detalle_compra !== null
      ? purchaseDetails.get(lot.id_detalle_compra)!.cantidad
      : productionDetails.get(lot.id_detalle_produccion!)!.cantidad_obtenida
    if (consumed + lot.cantidad_disponible > origin + 0.02) {
      throw new Error(`Consumo superior al origen para el lote ${lotId}: ${consumed} + ${lot.cantidad_disponible} > ${origin}`)
    }
  }
  for (const purchase of state.compras) {
    const details = state.detalle_compra.filter(row => row.id_compra === purchase.id_compra)
    const subtotal = details.reduce((sum, row) => sum + row.cantidad * row.precio_unitario, 0)
    if (purchase.total_compra < 0 || !near(purchase.total_compra, subtotal + purchase.iva - purchase.descuento)) {
      throw new Error(`Total inconsistente en compra ${purchase.id_compra}`)
    }
  }
  for (const sale of state.ventas) {
    const lines = state.detalle_venta.filter(row => row.id_venta === sale.id_venta)
    const subtotal = lines.reduce((sum, row) => sum + row.cantidad * row.precio_unitario, 0)
    if (sale.total_pagar < 0 || !near(sale.total_pagar, subtotal + sale.iva - sale.descuento_total)) {
      throw new Error(`Total inconsistente en venta ${sale.id_venta}`)
    }
  }
}
