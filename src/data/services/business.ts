import { checkInvariants } from '../invariants'
import { localDateFromTimestamp, localDateString, localTimestampString } from '../dates'
import { sellableStock } from '../selectors'
import type { AppState, MetodoPago, TipoEmpaque, TipoVenta } from '../types'

const roundMoney = (value: number) => Number(value.toFixed(2))
const assertKgPrecision = (value: number) => {
  if (!Number.isFinite(value) || value < 0.01 || Math.abs(value - Number(value.toFixed(2))) > 1e-8) {
    throw new Error('La cantidad mínima es 10 g (0.01 kg).')
  }
}

export function commit(state: AppState, edit: (draft: AppState) => void): AppState {
  const draft = structuredClone(state)
  edit(draft)
  checkInvariants(draft)
  return draft
}

type PurchaseLine = {
  id_producto: number
  cantidad_kg: number
  precio_unitario: number
  lote?: {
    numero_lote: string
    fecha_vencimiento: string
    tipo_empaque: TipoEmpaque
    zona_ubicacion: string
    es_transformable: boolean
  }
}

export function createPurchase(state: AppState, input: {
  id_proveedor: number
  id_usuario: number
  fecha: string
  observaciones?: string
  iva: number
  descuento: number
  lines: PurchaseLine[]
}): AppState {
  return commit(state, draft => {
    if (!input.lines.length) throw new Error('Debe agregar al menos un producto a la orden de compra.')
    if (!Number.isFinite(input.iva) || input.iva < 0 || !Number.isFinite(input.descuento) || input.descuento < 0) {
      throw new Error('El IVA y el descuento deben ser mayores o iguales a cero.')
    }
    const preparedLines = input.lines.map(line => {
      if (!Number.isFinite(line.cantidad_kg) || !(line.cantidad_kg > 0) || !Number.isFinite(line.precio_unitario) || line.precio_unitario < 0) {
        throw new Error('La cantidad debe ser mayor a cero y el precio no puede ser negativo.')
      }
      assertKgPrecision(line.cantidad_kg)
      const product = draft.productos.find(item => item.id_producto === line.id_producto && item.estado)
      if (!product) throw new Error('El producto seleccionado no existe.')
      const subtotal = line.cantidad_kg * line.precio_unitario
      return { line, product, subtotal }
    })
    const subtotal = preparedLines.reduce((sum, item) => sum + item.subtotal, 0)
    if (input.descuento > subtotal) throw new Error('El descuento no puede superar el subtotal.')
    const total = roundMoney(subtotal - input.descuento + input.iva)
    if (total < 0) throw new Error('El total de la compra no puede ser negativo.')

    const id_compra = draft.nextIds.compras++
    const fecha = localDateFromTimestamp(input.fecha)
    draft.compras.push({
      id_compra, id_proveedor: input.id_proveedor, id_usuario: input.id_usuario,
      fecha_compra: localTimestampString(new Date(`${fecha}T12:00:00`)),
      iva: input.iva, descuento: input.descuento, total_compra: total,
      observaciones: input.observaciones || null, estado: true,
    })
    for (const { line, product } of preparedLines) {
      const id_detalle_compra = draft.nextIds.detalle_compra++
      draft.detalle_compra.push({
        id_detalle_compra, id_compra, id_producto: product.id_producto,
        cantidad: line.cantidad_kg, unidad_medida: 'kg', precio_unitario: line.precio_unitario,
      })
      if (line.lote) {
        if (!line.lote.numero_lote.trim()) throw new Error('Este campo es obligatorio')
        if (!line.lote.fecha_vencimiento) throw new Error('Este campo es obligatorio')
        if (line.lote.fecha_vencimiento < fecha) throw new Error('La fecha de vencimiento debe ser posterior o igual a la fecha de ingreso.')
        if (draft.lotes.some(lot => lot.numero_lote === line.lote!.numero_lote)) throw new Error('El número de lote ingresado ya se encuentra registrado.')
        draft.lotes.push({
          id_lote: draft.nextIds.lotes++, id_detalle_compra, numero_lote: line.lote.numero_lote,
          fecha_ingreso: fecha, fecha_vencimiento: line.lote.fecha_vencimiento,
          tipo_empaque: line.lote.tipo_empaque, cantidad_disponible: line.cantidad_kg,
          zona_ubicacion: line.lote.zona_ubicacion || null,
          es_transformable: product.tipo_producto === 'Fresca' && line.lote.es_transformable,
          estado: true,
        })
      }
      product.stock_disponible += line.cantidad_kg
    }
  })
}

export function associateLot(state: AppState, detailId: number, lotNumber: string, expiry: string, pack: TipoEmpaque, zone?: string, transformable = true): AppState {
  return commit(state, draft => {
    const detail = draft.detalle_compra.find(row => row.id_detalle_compra === detailId)
    if (!detail) throw new Error('No se encontró la línea de compra seleccionada.')
    if (!lotNumber.trim() || !expiry) throw new Error('Este campo es obligatorio')
    if (draft.lotes.some(lot => lot.id_detalle_compra === detailId)) throw new Error('La línea de compra ya tiene un lote asociado.')
    if (draft.lotes.some(lot => lot.numero_lote === lotNumber)) throw new Error('El número de lote ingresado ya se encuentra registrado.')
    const purchase = draft.compras.find(row => row.id_compra === detail.id_compra)!
    const ingreso = localDateFromTimestamp(purchase.fecha_compra)
    if (expiry < ingreso) throw new Error('La fecha de vencimiento debe ser posterior o igual a la fecha de ingreso.')
    const product = draft.productos.find(row => row.id_producto === detail.id_producto)!
    draft.lotes.push({
      id_lote: draft.nextIds.lotes++, id_detalle_compra: detailId, numero_lote: lotNumber,
      fecha_ingreso: ingreso, fecha_vencimiento: expiry, tipo_empaque: pack,
      cantidad_disponible: detail.cantidad, zona_ubicacion: zone ?? null,
      es_transformable: product.tipo_producto === 'Fresca' && transformable, estado: true,
    })
  })
}

export function cancelPurchase(state: AppState, id: number): AppState {
  return commit(state, draft => {
    const purchase = draft.compras.find(row => row.id_compra === id)
    if (!purchase) throw new Error('No se encontró la compra seleccionada.')
    if (!purchase.estado) throw new Error('La compra seleccionada ya se encuentra anulada.')
    const details = draft.detalle_compra.filter(row => row.id_compra === id)
    const detailIds = new Set(details.map(row => row.id_detalle_compra))
    const lots = draft.lotes.filter(lot => detailIds.has(lot.id_detalle_compra))
    const consumed = lots.some(lot => {
      const detail = details.find(row => row.id_detalle_compra === lot.id_detalle_compra)!
      const sold = draft.detalle_venta.some(row => row.id_lote === lot.id_lote && draft.ventas.some(sale => sale.id_venta === row.id_venta && sale.estado))
      const produced = draft.produccion.some(row => row.id_lote === lot.id_lote)
      return sold || produced || lot.cantidad_disponible !== detail.cantidad
    }) || details.some(detail => !lots.some(lot => lot.id_detalle_compra === detail.id_detalle_compra)
      && (draft.productos.find(row => row.id_producto === detail.id_producto)?.stock_disponible ?? 0) < detail.cantidad)
    if (consumed) throw new Error('No es posible anular la compra debido a que parte del inventario ingresado ya fue consumido o vendido.')

    for (const detail of details) {
      const product = draft.productos.find(row => row.id_producto === detail.id_producto)!
      if (product.stock_disponible < detail.cantidad) {
        throw new Error('No es posible anular la compra debido a que parte del inventario ingresado ya fue consumido o vendido.')
      }
      product.stock_disponible -= detail.cantidad
    }
    purchase.estado = false
    for (const lot of lots) {
      lot.estado = false
      lot.cantidad_disponible = 0
    }
  })
}

export function createProduction(state: AppState, input: {
  id_usuario: number
  id_lote: number
  cantidad_procesada: number
  merma: number
  fecha_produccion: string
  observaciones?: string
}): AppState {
  return commit(state, draft => {
    const lot = draft.lotes.find(row => row.id_lote === input.id_lote)
    if (!lot || !lot.estado || !lot.es_transformable) throw new Error('El lote seleccionado no está disponible para producción.')
    if (lot.fecha_vencimiento < localDateString()) throw new Error('No es posible procesar un lote vencido.')
    const sourceDetail = draft.detalle_compra.find(row => row.id_detalle_compra === lot.id_detalle_compra)
    const productIn = sourceDetail && draft.productos.find(row => row.id_producto === sourceDetail.id_producto)
    if (!productIn || productIn.tipo_producto !== 'Fresca') throw new Error('El lote seleccionado no corresponde a un producto de fresa fresca.')
    if (!(input.cantidad_procesada > 0) || input.cantidad_procesada > lot.cantidad_disponible) {
      throw new Error('El lote seleccionado no posee suficiente stock de fresa fresca para la cantidad solicitada.')
    }
    assertKgPrecision(input.cantidad_procesada)
    if (!Number.isFinite(input.merma) || input.merma < 0 || input.merma >= input.cantidad_procesada) throw new Error('La merma debe ser menor a la cantidad procesada.')
    if (Math.abs(input.merma - Number(input.merma.toFixed(2))) > 1e-8) throw new Error('La cantidad mínima es 10 g (0.01 kg).')
    const output = draft.productos.find(row => row.tipo_producto === 'Congelada' && row.id_categoria === productIn.id_categoria && row.estado)
    if (!output) throw new Error('Producto Fresa Congelada activo no encontrado para este calibre.')

    const id_produccion = draft.nextIds.produccion++
    const quantity = input.cantidad_procesada - input.merma
    draft.produccion.push({
      id_produccion, id_usuario: input.id_usuario, id_lote: lot.id_lote,
      fecha_produccion: localTimestampString(new Date(`${localDateFromTimestamp(input.fecha_produccion)}T12:00:00`)),
      cantidad_procesada: input.cantidad_procesada, merma: input.merma,
      observaciones: input.observaciones || null, unidad_medida: 'kg',
    })
    draft.detalle_produccion.push({
      id_detalle_produccion: draft.nextIds.detalle_produccion++, id_produccion,
      id_producto: output.id_producto, cantidad_obtenida: quantity, unidad_medida: 'kg',
    })
    lot.cantidad_disponible -= input.cantidad_procesada
    if (lot.cantidad_disponible === 0) lot.estado = false
    productIn.stock_disponible -= input.cantidad_procesada
    output.stock_disponible += quantity
  })
}

export function createSale(state: AppState, input: {
  numero_documento: string
  id_usuario: number
  tipo_venta: TipoVenta
  iva: number
  descuento_total: number
  pagos: Array<{ metodo_pago: MetodoPago; monto: number }>
  lines: Array<{ id_producto: number; cantidad_kg: number }>
}): AppState {
  return commit(state, draft => {
    if (!input.lines.length) throw new Error('Agregue al menos un producto a la venta.')
    const customer = draft.clientes.find(row => row.numero_documento === input.numero_documento && row.estado)
    if (!customer) throw new Error('Seleccione un cliente activo.')
    if (!Number.isFinite(input.iva) || input.iva < 0 || !Number.isFinite(input.descuento_total) || input.descuento_total < 0) {
      throw new Error('El IVA y el descuento deben ser mayores o iguales a cero.')
    }
    const saleId = draft.nextIds.ventas
    let subtotal = 0
    const saleLines: AppState['detalle_venta'] = []
    for (const line of input.lines) {
      if (!(line.cantidad_kg > 0) || !Number.isFinite(line.cantidad_kg)) throw new Error('La cantidad debe ser mayor a cero.')
      assertKgPrecision(line.cantidad_kg)
      const product = draft.productos.find(row => row.id_producto === line.id_producto && row.estado)
      const available = product ? sellableStock(draft, product.id_producto) : 0
      if (!product || available < line.cantidad_kg) {
        throw new Error(`Stock insuficiente para el producto seleccionado. Cantidad disponible: ${available} kg`)
      }
      let remaining = line.cantidad_kg
      const unitPrice = input.tipo_venta === 'Detal' ? product.precio_venta_detal : product.precio_venta_mayorista
      if (product.tipo_producto === 'Fresca') {
        const source = new Map(draft.detalle_compra.map(detail => [detail.id_detalle_compra, detail.id_producto]))
        const today = localDateString()
        const lots = draft.lotes
          .filter(lot => lot.estado && lot.fecha_vencimiento >= today && source.get(lot.id_detalle_compra) === product.id_producto && lot.cantidad_disponible > 0)
          .sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento))
        for (const lot of lots) {
          const taken = Math.min(remaining, lot.cantidad_disponible)
          if (taken > 0) {
            lot.cantidad_disponible -= taken
            if (lot.cantidad_disponible === 0) lot.estado = false
            saleLines.push({
              id_detalle_venta: draft.nextIds.detalle_venta++, id_venta: saleId,
              id_producto: product.id_producto, id_lote: lot.id_lote, cantidad: taken,
              unidad_medida: 'kg', precio_unitario: unitPrice,
            })
            remaining -= taken
          }
          if (remaining <= 0) break
        }
        if (remaining > 0) throw new Error(`Stock insuficiente para el producto seleccionado. Cantidad disponible: ${available - remaining} kg`)
      } else {
        saleLines.push({
          id_detalle_venta: draft.nextIds.detalle_venta++, id_venta: saleId,
          id_producto: product.id_producto, id_lote: null, cantidad: line.cantidad_kg,
          unidad_medida: 'kg', precio_unitario: unitPrice,
        })
      }
      product.stock_disponible -= line.cantidad_kg
      subtotal += line.cantidad_kg * unitPrice
    }
    if (input.descuento_total > subtotal) throw new Error('El descuento no puede superar el subtotal.')
    const total = roundMoney(subtotal - input.descuento_total + input.iva)
    if (input.pagos.length === 1) {
      const payment = input.pagos[0]
      if (payment.metodo_pago !== 'Efectivo' && payment.metodo_pago !== 'Transferencia') throw new Error('El método de pago no es válido.')
      if (!(payment.monto > 0) || Math.abs(payment.monto - total) > 0.01) throw new Error('El monto del pago debe ser igual al total de la venta.')
    } else if (input.pagos.length === 2) {
      const methods = new Set(input.pagos.map(payment => payment.metodo_pago))
      if (methods.size !== 2 || !methods.has('Efectivo') || !methods.has('Transferencia')
        || input.pagos.some(payment => !(payment.monto > 0))
        || Math.abs(input.pagos.reduce((sum, payment) => sum + payment.monto, 0) - total) > 0.01) {
        throw new Error('El pago en efectivo y transferencia debe sumar exactamente el total.')
      }
    } else {
      throw new Error('La venta debe tener un pago único o un pago mixto de efectivo y transferencia.')
    }
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
      const product = draft.productos.find(row => row.id_producto === detail.id_producto)!
      product.stock_disponible += detail.cantidad
      if (detail.id_lote !== null) {
        const lot = draft.lotes.find(row => row.id_lote === detail.id_lote)
        if (!lot) throw new Error('No se encontró el lote de origen para devolver existencias.')
        lot.cantidad_disponible += detail.cantidad
        if (lot.cantidad_disponible > 0) lot.estado = true
      }
    }
    sale.estado = false
    sale.motivo_anulacion = reason.trim()
  })
}

export function setProductStock(state: AppState, id: number, operation: 'add' | 'subtract', quantity: number): AppState {
  return commit(state, draft => {
    if (!(quantity > 0)) throw new Error('La cantidad a añadir debe ser mayor a cero.')
    const product = draft.productos.find(row => row.id_producto === id)
    if (!product) throw new Error('No se encontró el producto seleccionado.')
    const result = product.stock_disponible + (operation === 'add' ? quantity : -quantity)
    if (result < 0) throw new Error('El stock resultante no puede ser menor a cero.')
    product.stock_disponible = result
  })
}

export function saveRolePermissions(state: AppState, roleId: number, permissionIds: Array<{ id_permiso: number; id_privilegio: number }>): AppState {
  return commit(state, draft => {
    if (!permissionIds.length) throw new Error('Debe asignar al menos un permiso al rol.')
    draft.roles_x_permisos = draft.roles_x_permisos.filter(item => item.id_rol !== roleId)
    for (const item of permissionIds) draft.roles_x_permisos.push({ id_rol: roleId, ...item })
  })
}
