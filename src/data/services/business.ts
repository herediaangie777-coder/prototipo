import { checkInvariants } from '../invariants'
import { localDateFromTimestamp, localDateString, localTimestampString } from '../dates'
import { stockByLot, stockVendible } from '../selectors'
import type { AppState, MetodoPago, TipoEmpaque, TipoVenta } from '../types'

const roundMoney = (value: number) => Number(value.toFixed(2))
const assertPositiveQuantity = (value: number, message: string) => {
  if (!Number.isFinite(value) || value <= 0) throw new Error(message)
}
const assertKgPrecision = (value: number) => {
  if (!Number.isFinite(value) || value < 0.01 || Math.abs(value - Number(value.toFixed(2))) > 1e-8) {
    throw new Error('La cantidad mínima es 10 g (0.01 kg).')
  }
}
function assertLocation(state: AppState, id: number) {
  if (!state.ubicaciones.some(location => location.id_ubicacion === id && location.estado)) {
    throw new Error('Seleccione una ubicación activa.')
  }
}

export function commit(state: AppState, edit: (draft: AppState) => void): AppState {
  const draft = structuredClone(state)
  edit(draft)
  checkInvariants(draft)
  return draft
}

export type PurchaseLine = {
  id_producto: number
  cantidad_kg: number
  precio_unitario: number
  lote?: {
    numero_lote: string
    id_ubicacion: number
    tipo_empaque: TipoEmpaque
    fecha_ingreso: string
    fecha_vencimiento: string
  }
}
export type PurchaseInput = {
  id_proveedor: number
  id_usuario: number
  fecha: string
  observaciones?: string
  iva: number
  descuento: number
  lines: PurchaseLine[]
}

function preparePurchase(state: AppState, input: PurchaseInput) {
  if (!state.proveedores.some(row => row.id_proveedor === input.id_proveedor && row.estado)) throw new Error('Seleccione un proveedor activo.')
  if (!state.usuarios.some(row => row.id_usuario === input.id_usuario && row.estado)) throw new Error('Seleccione un usuario activo.')
  if (!input.lines.length) throw new Error('Debe agregar al menos un producto a la orden de compra.')
  if (!Number.isFinite(input.iva) || input.iva < 0 || !Number.isFinite(input.descuento) || input.descuento < 0) {
    throw new Error('El IVA y el descuento deben ser mayores o iguales a cero.')
  }
  const date = localDateFromTimestamp(input.fecha)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00`))) {
    throw new Error('La fecha de compra no es válida.')
  }
  if ((input.observaciones?.length ?? 0) > 200) throw new Error('Las observaciones no pueden superar 200 caracteres.')
  const lines = input.lines.map(line => {
    assertPositiveQuantity(line.cantidad_kg, 'La cantidad debe ser mayor a cero y el precio no puede ser negativo.')
    assertKgPrecision(line.cantidad_kg)
    if (!Number.isFinite(line.precio_unitario) || line.precio_unitario < 0) throw new Error('La cantidad debe ser mayor a cero y el precio no puede ser negativo.')
    const product = state.productos.find(row => row.id_producto === line.id_producto && row.estado)
    if (!product || product.tipo_producto !== 'Fresca' || product.unidad_medida !== 'kg') throw new Error('Solo se pueden comprar productos Fresca activos.')
    if (line.lote) {
      if (!line.lote.numero_lote.trim()) throw new Error('Este campo es obligatorio')
      if (!line.lote.fecha_ingreso || !line.lote.fecha_vencimiento) throw new Error('Este campo es obligatorio')
      if (line.lote.fecha_ingreso < date || line.lote.fecha_vencimiento < line.lote.fecha_ingreso) {
        throw new Error('Las fechas del lote deben ser iguales o posteriores a la fecha de compra y el vencimiento no puede preceder al ingreso.')
      }
      assertLocation(state, line.lote.id_ubicacion)
    }
    return { line, product }
  })
  const subtotal = lines.reduce((sum, item) => sum + item.line.cantidad_kg * item.line.precio_unitario, 0)
  const total = roundMoney(subtotal - input.descuento + input.iva)
  if (total < 0) throw new Error('El total de la compra no puede ser negativo.')
  return { date, lines, total }
}

function addPurchaseRows(draft: AppState, idCompra: number, input: PurchaseInput, replaceDetails = false) {
  const prepared = preparePurchase(draft, input)
  if (replaceDetails) {
    const oldDetails = draft.detalle_compra.filter(row => row.id_compra === idCompra)
    const ids = new Set(oldDetails.map(row => row.id_detalle_compra))
    draft.lotes = draft.lotes.filter(row => row.id_detalle_compra === null || !ids.has(row.id_detalle_compra))
    draft.detalle_compra = draft.detalle_compra.filter(row => row.id_compra !== idCompra)
  }
  const purchase = draft.compras.find(row => row.id_compra === idCompra)!
  Object.assign(purchase, {
    id_proveedor: input.id_proveedor,
    id_usuario: input.id_usuario,
    fecha_compra: localTimestampString(new Date(`${prepared.date}T12:00:00`)),
    iva: input.iva,
    descuento: input.descuento,
    total_compra: prepared.total,
    observaciones: input.observaciones?.trim() || null,
    estado: true,
  })
  for (const { line, product } of prepared.lines) {
    const detailId = draft.nextIds.detalle_compra++
    draft.detalle_compra.push({
      id_detalle_compra: detailId, id_compra: idCompra, id_producto: product.id_producto,
      cantidad: line.cantidad_kg, unidad_medida: 'kg', precio_unitario: line.precio_unitario,
    })
    if (line.lote) {
      if (draft.lotes.some(lot => lot.numero_lote === line.lote!.numero_lote)) throw new Error('El número de lote ingresado ya se encuentra registrado.')
      draft.lotes.push({
        id_lote: draft.nextIds.lotes++, id_detalle_compra: detailId, id_detalle_produccion: null,
        numero_lote: line.lote.numero_lote.trim(), fecha_ingreso: line.lote.fecha_ingreso,
        fecha_vencimiento: line.lote.fecha_vencimiento, tipo_empaque: line.lote.tipo_empaque,
        cantidad_disponible: line.cantidad_kg, id_ubicacion: line.lote.id_ubicacion,
        es_transformable: true, estado: true,
      })
    }
  }
}

export function createPurchase(state: AppState, input: PurchaseInput): AppState {
  return commit(state, draft => {
    const id = draft.nextIds.compras++
    draft.compras.push({
      id_compra: id, id_proveedor: input.id_proveedor, id_usuario: input.id_usuario,
      fecha_compra: localTimestampString(), iva: input.iva, descuento: input.descuento,
      total_compra: 0, observaciones: null, estado: true,
    })
    addPurchaseRows(draft, id, input)
  })
}

function purchaseHasMovements(state: AppState, id: number) {
  const detailIds = new Set(state.detalle_compra.filter(row => row.id_compra === id).map(row => row.id_detalle_compra))
  const lotIds = new Set(state.lotes.filter(row => row.id_detalle_compra !== null && detailIds.has(row.id_detalle_compra)).map(row => row.id_lote))
  return state.detalle_venta.some(row => lotIds.has(row.id_lote))
    || state.produccion.some(row => lotIds.has(row.id_lote_origen))
}

export function editPurchase(state: AppState, id: number, input: PurchaseInput | Pick<PurchaseInput, 'observaciones'>): AppState {
  return commit(state, draft => {
    const purchase = draft.compras.find(row => row.id_compra === id)
    if (!purchase || !purchase.estado) throw new Error('No se encontró la compra activa.')
    if (purchaseHasMovements(draft, id)) {
      if ('lines' in input) throw new Error('La compra tiene movimientos; solo se pueden editar las observaciones.')
      purchase.observaciones = input.observaciones?.trim() || null
      return
    }
    if (!('lines' in input)) throw new Error('Para editar la compra debe enviar su encabezado y sus líneas.')
    addPurchaseRows(draft, id, input, true)
  })
}

export function associateLot(state: AppState, detailId: number, input: {
  numero_lote: string
  id_ubicacion: number
  tipo_empaque: TipoEmpaque
  fecha_ingreso: string
  fecha_vencimiento: string
}): AppState {
  return commit(state, draft => {
    const detail = draft.detalle_compra.find(row => row.id_detalle_compra === detailId)
    if (!detail) throw new Error('No se encontró la línea de compra seleccionada.')
    if (!input.numero_lote.trim() || !input.fecha_ingreso || !input.fecha_vencimiento) throw new Error('Este campo es obligatorio')
    if (draft.lotes.some(lot => lot.id_detalle_compra === detailId)) throw new Error('La línea de compra ya tiene un lote asociado.')
    if (draft.lotes.some(lot => lot.numero_lote === input.numero_lote.trim())) throw new Error('El número de lote ingresado ya se encuentra registrado.')
    const purchase = draft.compras.find(row => row.id_compra === detail.id_compra)!
    if (!purchase.estado) throw new Error('No se puede asociar un lote a una compra anulada.')
    const purchaseDate = localDateFromTimestamp(purchase.fecha_compra)
    if (input.fecha_ingreso < purchaseDate || input.fecha_vencimiento < input.fecha_ingreso) throw new Error('Las fechas del lote no son válidas.')
    assertLocation(draft, input.id_ubicacion)
    draft.lotes.push({
      id_lote: draft.nextIds.lotes++, id_detalle_compra: detailId, id_detalle_produccion: null,
      numero_lote: input.numero_lote.trim(), fecha_ingreso: input.fecha_ingreso,
      fecha_vencimiento: input.fecha_vencimiento, tipo_empaque: input.tipo_empaque,
      cantidad_disponible: detail.cantidad, id_ubicacion: input.id_ubicacion,
      es_transformable: true, estado: true,
    })
  })
}

export function cancelPurchase(state: AppState, id: number): AppState {
  return commit(state, draft => {
    const purchase = draft.compras.find(row => row.id_compra === id)
    if (!purchase) throw new Error('No se encontró la compra seleccionada.')
    if (!purchase.estado) throw new Error('La compra seleccionada ya se encuentra anulada.')
    if (purchaseHasMovements(draft, id)) throw new Error('No es posible anular la compra debido a que parte del inventario ingresado ya fue consumido o vendido.')
    purchase.estado = false
    const ids = new Set(draft.detalle_compra.filter(row => row.id_compra === id).map(row => row.id_detalle_compra))
    for (const lot of draft.lotes) {
      if (lot.id_detalle_compra !== null && ids.has(lot.id_detalle_compra)) {
        lot.estado = false
        lot.cantidad_disponible = 0
      }
    }
  })
}

export function createProductionOrder(state: AppState, input: {
  id_usuario: number
  id_lote_origen: number
  cantidad_a_procesar: number
  observaciones?: string
}): AppState {
  return commit(state, draft => {
    const lot = draft.lotes.find(row => row.id_lote === input.id_lote_origen)
    if (!lot || !lot.estado || !lot.es_transformable) throw new Error('El lote seleccionado no está disponible para producción.')
    if (lot.fecha_vencimiento < localDateString()) throw new Error('No es posible procesar un lote vencido.')
    const sourceDetail = lot.id_detalle_compra === null ? undefined : draft.detalle_compra.find(row => row.id_detalle_compra === lot.id_detalle_compra)
    const sourceProduct = sourceDetail && draft.productos.find(row => row.id_producto === sourceDetail.id_producto)
    if (!sourceProduct || sourceProduct.tipo_producto !== 'Fresca') throw new Error('El lote seleccionado no corresponde a un producto de fresa fresca.')
    if (!draft.usuarios.some(user => user.id_usuario === input.id_usuario && user.estado)) throw new Error('Seleccione un usuario activo.')
    if ((input.observaciones?.length ?? 0) > 200) throw new Error('Las observaciones no pueden superar 200 caracteres.')
    assertPositiveQuantity(input.cantidad_a_procesar, 'La cantidad a procesar debe ser mayor a cero.')
    assertKgPrecision(input.cantidad_a_procesar)
    if (input.cantidad_a_procesar > lot.cantidad_disponible) throw new Error('El lote seleccionado no posee suficiente stock de fresa fresca para la cantidad solicitada.')
    lot.cantidad_disponible -= input.cantidad_a_procesar
    if (lot.cantidad_disponible === 0) lot.estado = false
    draft.produccion.push({
      id_produccion: draft.nextIds.produccion++, id_usuario: input.id_usuario,
      id_lote_origen: lot.id_lote, fecha_produccion: localTimestampString(),
      cantidad_a_procesar: input.cantidad_a_procesar, merma: null,
      estado: 'En proceso', fecha_finalizacion: null, observaciones: input.observaciones?.trim() || null,
    })
  })
}

export function updateProductionOrder(state: AppState, id: number, input: { observaciones?: string; cantidad_a_procesar?: number }): AppState {
  return commit(state, draft => {
    const order = draft.produccion.find(row => row.id_produccion === id)
    if (!order) throw new Error('No se encontró la orden de producción.')
    if (input.cantidad_a_procesar !== undefined) {
      if (order.estado !== 'En proceso') throw new Error('Solo se puede cambiar la cantidad de una orden en proceso.')
      assertPositiveQuantity(input.cantidad_a_procesar, 'La cantidad a procesar debe ser mayor a cero.')
      assertKgPrecision(input.cantidad_a_procesar)
      const source = draft.lotes.find(row => row.id_lote === order.id_lote_origen)!
      const difference = input.cantidad_a_procesar - order.cantidad_a_procesar
      if (difference > source.cantidad_disponible) throw new Error('El lote seleccionado no posee suficiente stock de fresa fresca para la cantidad solicitada.')
      source.cantidad_disponible -= difference
      if (source.cantidad_disponible > 0) source.estado = true
      else source.estado = false
      order.cantidad_a_procesar = input.cantidad_a_procesar
    }
    if (input.observaciones !== undefined) {
      if (input.observaciones.length > 200) throw new Error('Las observaciones no pueden superar 200 caracteres.')
      order.observaciones = input.observaciones.trim() || null
    }
  })
}

export function finishProduction(state: AppState, id: number, input: {
  unidades_obtenidas: number
  id_ubicacion: number
  fecha_vencimiento: string
}): AppState {
  return commit(state, draft => {
    const order = draft.produccion.find(row => row.id_produccion === id)
    if (!order || order.estado !== 'En proceso') throw new Error('Solo se pueden finalizar órdenes en proceso.')
    if (!Number.isInteger(input.unidades_obtenidas) || input.unidades_obtenidas <= 0) throw new Error('Las unidades obtenidas deben ser un entero mayor a cero.')
    if (!input.fecha_vencimiento || input.fecha_vencimiento < localDateString()) throw new Error('La fecha de vencimiento debe ser hoy o posterior.')
    assertLocation(draft, input.id_ubicacion)
    const sourceLot = draft.lotes.find(row => row.id_lote === order.id_lote_origen)!
    const sourceDetail = draft.detalle_compra.find(row => row.id_detalle_compra === sourceLot.id_detalle_compra)
    const sourceProduct = draft.productos.find(row => row.id_producto === sourceDetail?.id_producto)!
    const product = draft.productos.find(row => row.tipo_producto === 'Congelada' && row.id_categoria === sourceProduct.id_categoria && row.estado)
    if (!product || product.peso_unidad_kg === null) throw new Error('Producto Fresa Congelada activo no encontrado para este calibre.')
    const kgObtained = input.unidades_obtenidas * product.peso_unidad_kg
    if (kgObtained > order.cantidad_a_procesar) throw new Error('Los kilos resultantes de fresa congelada no pueden superar los kilos ingresados de fresa fresca.')
    const detailId = draft.nextIds.detalle_produccion++
    const detail = {
      id_detalle_produccion: detailId, id_produccion: id, id_producto: product.id_producto,
      cantidad_obtenida: input.unidades_obtenidas, unidad_medida: 'bolsa' as const,
    }
    const lotNumber = `P-${String(id).padStart(4, '0')}`
    if (draft.lotes.some(row => row.numero_lote === lotNumber)) throw new Error('El número de lote ingresado ya se encuentra registrado.')
    draft.detalle_produccion.push(detail)
    draft.lotes.push({
      id_lote: draft.nextIds.lotes++, id_detalle_compra: null, id_detalle_produccion: detailId,
      numero_lote: lotNumber, fecha_ingreso: localDateString(),
      fecha_vencimiento: input.fecha_vencimiento, tipo_empaque: 'Bolsa',
      cantidad_disponible: input.unidades_obtenidas, id_ubicacion: input.id_ubicacion,
      es_transformable: false, estado: true,
    })
    order.merma = Number((order.cantidad_a_procesar - kgObtained).toFixed(2))
    order.estado = 'Finalizada'
    order.fecha_finalizacion = localTimestampString()
  })
}

export function cancelProduction(state: AppState, id: number): AppState {
  return commit(state, draft => {
    const order = draft.produccion.find(row => row.id_produccion === id)
    if (!order || order.estado === 'Anulada') throw new Error('La orden de producción seleccionada ya se encuentra anulada.')
    const source = draft.lotes.find(row => row.id_lote === order.id_lote_origen)!
    if (order.estado === 'Finalizada') {
      const detail = draft.detalle_produccion.find(row => row.id_produccion === id)!
      const outputLot = draft.lotes.find(row => row.id_detalle_produccion === detail.id_detalle_produccion)!
      if (draft.detalle_venta.some(row => row.id_lote === outputLot.id_lote)) throw new Error('No es posible anular la producción porque el lote congelado ya fue vendido.')
      outputLot.estado = false
      outputLot.cantidad_disponible = 0
      source.cantidad_disponible += order.cantidad_a_procesar
      source.estado = source.cantidad_disponible > 0
    } else {
      source.cantidad_disponible += order.cantidad_a_procesar
      source.estado = source.cantidad_disponible > 0
    }
    order.estado = 'Anulada'
  })
}

export function createSale(state: AppState, input: {
  numero_documento: string
  id_usuario: number
  tipo_venta: TipoVenta
  iva: number
  descuento_total: number
  pagos: Array<{ metodo_pago: MetodoPago; monto: number; referencia?: string | null }>
  lines: Array<{ id_producto: number; cantidad: number }>
}): AppState {
  return commit(state, draft => {
    if (!input.lines.length) throw new Error('Agregue al menos un producto a la venta.')
    const customer = draft.clientes.find(row => row.numero_documento === input.numero_documento && row.estado)
    if (!customer) throw new Error('Seleccione un cliente activo.')
    if (!draft.usuarios.some(user => user.id_usuario === input.id_usuario && user.estado)) throw new Error('Seleccione un usuario activo.')
    if (!Number.isFinite(input.iva) || input.iva < 0 || !Number.isFinite(input.descuento_total) || input.descuento_total < 0) throw new Error('El IVA y el descuento deben ser mayores o iguales a cero.')
    const saleId = draft.nextIds.ventas
    const saleLines: AppState['detalle_venta'] = []
    let subtotal = 0
    const today = localDateString()
    for (const line of input.lines) {
      assertPositiveQuantity(line.cantidad, 'La cantidad debe ser mayor a cero.')
      const product = draft.productos.find(row => row.id_producto === line.id_producto && row.estado)
      const available = product ? stockVendible(draft, product.id_producto) : 0
      if (!product || available < line.cantidad) throw new Error(`Stock insuficiente para el producto seleccionado. Cantidad disponible: ${available}`)
      if (product.tipo_producto === 'Fresca') assertKgPrecision(line.cantidad)
      else if (!Number.isInteger(line.cantidad)) throw new Error('La cantidad de producto congelado debe ser un número entero de bolsas.')
      let remaining = line.cantidad
      const lots = stockByLot(draft, product.id_producto)
        .filter(lot => lot.estado && lot.fecha_vencimiento >= today && lot.cantidad_disponible > 0)
        .sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento) || a.id_lote - b.id_lote)
      const unitPrice = input.tipo_venta === 'Detal' ? product.precio_venta_detal : product.precio_venta_mayorista
      for (const candidate of lots) {
        const lot = draft.lotes.find(row => row.id_lote === candidate.id_lote)!
        const quantity = Math.min(remaining, lot.cantidad_disponible)
        if (quantity <= 0) continue
        lot.cantidad_disponible -= quantity
        if (lot.cantidad_disponible === 0) lot.estado = false
        saleLines.push({
          id_detalle_venta: draft.nextIds.detalle_venta++, id_venta: saleId,
          id_producto: product.id_producto, id_lote: lot.id_lote, cantidad: quantity,
          unidad_medida: product.unidad_medida, precio_unitario: unitPrice,
        })
        remaining -= quantity
        if (remaining <= 1e-8) break
      }
      if (remaining > 1e-8) throw new Error(`Stock insuficiente para el producto seleccionado. Cantidad disponible: ${available}`)
      subtotal += line.cantidad * unitPrice
    }
    if (input.descuento_total > subtotal) throw new Error('El descuento no puede superar el subtotal.')
    const total = roundMoney(subtotal - input.descuento_total + input.iva)
    if (total < 0) throw new Error('El total de la venta no puede ser negativo.')
    if (input.pagos.length === 1) {
      const payment = input.pagos[0]
      if (!(payment.metodo_pago === 'Efectivo' || payment.metodo_pago === 'Transferencia')) throw new Error('El método de pago no es válido.')
      if (!(payment.monto > 0) || Math.abs(payment.monto - total) > 0.01) throw new Error('El monto del pago debe ser igual al total de la venta.')
    } else if (input.pagos.length === 2) {
      const methods = new Set(input.pagos.map(payment => payment.metodo_pago))
      if (methods.size !== 2 || !methods.has('Efectivo') || !methods.has('Transferencia')
        || input.pagos.some(payment => !(payment.monto > 0))
        || Math.abs(input.pagos.reduce((sum, payment) => sum + payment.monto, 0) - total) > 0.01) {
        throw new Error('El pago en efectivo y transferencia debe sumar exactamente el total.')
      }
    } else throw new Error('La venta debe tener un pago único o un pago mixto de efectivo y transferencia.')

    draft.nextIds.ventas++
    draft.ventas.push({
      id_venta: saleId, numero_documento: customer.numero_documento, id_usuario: input.id_usuario,
      tipo_venta: input.tipo_venta, fecha_venta: localTimestampString(), iva: input.iva,
      descuento_total: input.descuento_total, total_pagar: total, estado: true, motivo_anulacion: null,
    })
    draft.detalle_venta.push(...saleLines)
    for (const payment of input.pagos) {
      draft.pagos_venta.push({
        id_pago_venta: draft.nextIds.pagos_venta++, id_venta: saleId,
        metodo_pago: payment.metodo_pago, monto_recibido: payment.monto,
        referencia: payment.referencia?.trim() || null,
      })
    }
  })
}

export function cancelSale(state: AppState, id: number, reason: string): AppState {
  return commit(state, draft => {
    const sale = draft.ventas.find(row => row.id_venta === id)
    if (!sale || !sale.estado) throw new Error('La venta seleccionada ya se encuentra anulada.')
    if (!reason.trim()) throw new Error('Es obligatorio ingresar un motivo para proceder con la anulación.')
    for (const detail of draft.detalle_venta.filter(row => row.id_venta === id)) {
      const lot = draft.lotes.find(row => row.id_lote === detail.id_lote)
      if (!lot) throw new Error('No se encontró el lote de origen para devolver existencias.')
      lot.cantidad_disponible += detail.cantidad
      lot.estado = lot.cantidad_disponible > 0
    }
    sale.estado = false
    sale.motivo_anulacion = reason.trim()
  })
}

export function saveRolePermissions(state: AppState, roleId: number, permissionIds: Array<{ id_permiso: number; id_privilegio: number }>): AppState {
  return commit(state, draft => {
    if (!draft.roles.some(role => role.id_rol === roleId)) throw new Error('No se encontró el rol seleccionado.')
    if (!permissionIds.length) throw new Error('Debe asignar al menos un permiso al rol.')
    const keys = new Set<string>()
    for (const item of permissionIds) {
      const key = `${item.id_permiso}:${item.id_privilegio}`
      if (keys.has(key) || !draft.permisos_privilegios.some(valid => valid.id_permiso === item.id_permiso && valid.id_privilegio === item.id_privilegio)) {
        throw new Error('La matriz contiene permisos no válidos.')
      }
      keys.add(key)
    }
    draft.roles_x_permisos = draft.roles_x_permisos.filter(item => item.id_rol !== roleId)
    for (const item of permissionIds) draft.roles_x_permisos.push({ id_rol: roleId, ...item })
  })
}
