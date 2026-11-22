import { describe, expect, it } from 'vitest'
import { createDemoSeed } from '../seed'
import { checkInvariants } from '../invariants'
import { localDateString } from '../dates'
import { hasPermission, sellableStock, stockVendible, stockVencido, stockEnKg } from '../selectors'
import { login } from './auth'
import { saveMaster } from './masters'
import {
  associateLot, cancelProduction, cancelPurchase, cancelSale, createProductionOrder, createPurchase,
  createSale, editPurchase, finishProduction, updateProductionOrder,
} from './business'

const futureDate = (days: number) => {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}
const makePurchase = (state: ReturnType<typeof createDemoSeed>, extra: Partial<Parameters<typeof createPurchase>[1]> = {}) => createPurchase(state, {
  id_proveedor: 1, id_usuario: 1, fecha: new Date().toISOString(), iva: 500, descuento: 100,
  lines: [
    { id_producto: 1, cantidad_kg: 2, precio_unitario: 7000, lote: { numero_lote: 'TEST-A', id_ubicacion: 315, tipo_empaque: 'Caja', fecha_ingreso: new Date().toISOString().slice(0, 10), fecha_vencimiento: futureDate(20) } },
    { id_producto: 2, cantidad_kg: 3, precio_unitario: 6500 },
  ],
  ...extra,
})

describe('modelo de datos v2', () => {
  it('carga catálogos y transacciones demo completos con fechas relativas, lotes y estados coherentes', () => {
    const state = createDemoSeed()
    expect(state.categorias.map(row => row.nombre_categoria)).toEqual(['Calibre 1', 'Calibre 2', 'Calibre 3', 'Jumbo'])
    expect(state.ubicaciones.map(row => row.id_ubicacion)).toEqual([315, 366])
    expect(state.productos.filter(row => row.tipo_producto === 'Fresca').every(row => row.unidad_medida === 'kg' && row.peso_unidad_kg === null && row.presentacion === 'Granel')).toBe(true)
    expect(state.productos.filter(row => row.tipo_producto === 'Congelada').every(row => row.unidad_medida === 'bolsa' && row.peso_unidad_kg === 1 && row.presentacion === 'Bolsa 1 kg')).toBe(true)
    expect(state.compras.length).toBeGreaterThanOrEqual(20)
    expect(state.compras.every(purchase => state.detalle_compra.some(detail => detail.id_compra === purchase.id_compra
      && state.lotes.some(lot => lot.id_detalle_compra === detail.id_detalle_compra)))).toBe(true)
    expect(state.produccion.filter(row => row.estado === 'Finalizada')).toHaveLength(8)
    expect(state.produccion.filter(row => row.estado === 'En proceso')).toHaveLength(1)
    expect(state.produccion.filter(row => row.estado === 'Anulada')).toHaveLength(1)
    expect(state.ventas.length).toBeGreaterThanOrEqual(30)
    expect(state.ventas.filter(row => !row.estado && Boolean(row.motivo_anulacion)).length).toBe(2)
    expect(state.detalle_venta.every(row => Number.isInteger(row.id_lote))).toBe(true)
    const today = localDateString()
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 14)
    const minimum = localDateString(cutoff)
    for (const dates of [state.compras.map(row => row.fecha_compra), state.ventas.map(row => row.fecha_venta), state.produccion.map(row => row.fecha_produccion)]) {
      expect(dates.every((date, index) => {
        const day = date.slice(0, 10)
        return day >= minimum && day <= today && (index === 0 || dates[index - 1].localeCompare(date) <= 0)
      })).toBe(true)
    }
    checkInvariants(state)
  })

  it('deriva stock vendible y vencido de lotes, sin stock persistido en productos', () => {
    const state = createDemoSeed()
    const fresh = state.productos[0]
    const frozen = state.productos[4]
    expect(stockVendible(state, fresh.id_producto)).toBe(sellableStock(state, fresh.id_producto))
    expect(stockVencido(state, 3)).toBeGreaterThan(0)
    expect(stockEnKg(state, frozen.id_producto)).toBe(stockVendible(state, frozen.id_producto))
    expect(fresh).not.toHaveProperty('stock_disponible')
    checkInvariants(state)
  })

  it('guarda el estado desde los formularios maestros y mantiene el stock derivado de lotes', () => {
    const state = createDemoSeed()
    const product = state.productos[0]
    const stockBefore = stockVendible(state, product.id_producto)
    const updated = saveMaster(state, 'producto', {
      id_categoria: String(product.id_categoria),
      tipo_producto: product.tipo_producto,
      presentacion: product.presentacion,
      precio_compra: String(product.precio_compra),
      precio_venta_detal: String(product.precio_venta_detal),
      precio_venta_mayorista: String(product.precio_venta_mayorista),
      peso_unidad_kg: '',
      stock_minimo: String(product.stock_minimo),
      estado: 'false',
    }, product.id_producto)
    expect(updated.productos.find(row => row.id_producto === product.id_producto)?.estado).toBe(false)
    expect(stockVendible(updated, product.id_producto)).toBe(stockBefore)
    checkInvariants(updated)
  })

  it('registra compra multilínea con importes en pesos, lote opcional y stock solo al asociarlo', () => {
    const state = createDemoSeed()
    const next = makePurchase(state)
    const purchase = next.compras.at(-1)!
    expect(purchase).toMatchObject({ iva: 500, descuento: 100, total_compra: 33900 })
    const details = next.detalle_compra.filter(row => row.id_compra === purchase.id_compra)
    expect(details).toHaveLength(2)
    expect(next.lotes.some(row => row.id_detalle_compra === details[1].id_detalle_compra)).toBe(false)
    checkInvariants(next)
    const associated = associateLot(next, details[1].id_detalle_compra, {
      numero_lote: 'TEST-B', id_ubicacion: 366, tipo_empaque: 'Bulto',
      fecha_ingreso: futureDate(0), fecha_vencimiento: futureDate(30),
    })
    expect(associated.lotes.find(row => row.numero_lote === 'TEST-B')?.cantidad_disponible).toBe(3)
    checkInvariants(associated)
  })

  it('permite editar compra sin movimientos y bloquea reemplazar las líneas cuando ya hay movimientos', () => {
    const initial = createDemoSeed()
    const purchase = makePurchase(initial)
    const id = purchase.compras.at(-1)!.id_compra
    const editable = editPurchase(purchase, id, {
      id_proveedor: 2, id_usuario: 1, fecha: new Date().toISOString(), iva: 0, descuento: 0,
      observaciones: 'Actualizada',
      lines: [{ id_producto: 3, cantidad_kg: 4, precio_unitario: 6000 }],
    })
    expect(editable.detalle_compra.filter(row => row.id_compra === id)).toHaveLength(1)
    expect(editable.compras.find(row => row.id_compra === id)?.total_compra).toBe(24000)
    checkInvariants(editable)
    const blockedSeed = createDemoSeed()
    const noteOnly = editPurchase(blockedSeed, 1, { observaciones: 'Solo observación' })
    expect(noteOnly.compras.find(row => row.id_compra === 1)?.observaciones).toBe('Solo observación')
    expect(noteOnly.detalle_compra.filter(row => row.id_compra === 1)).toEqual(blockedSeed.detalle_compra.filter(row => row.id_compra === 1))
    expect(() => editPurchase(noteOnly, 1, {
      id_proveedor: 1, id_usuario: 1, fecha: new Date().toISOString(), iva: 0, descuento: 0,
      observaciones: 'Solo nota', lines: [{ id_producto: 1, cantidad_kg: 1, precio_unitario: 1 }],
    })).toThrow('La compra tiene movimientos; solo se pueden editar las observaciones.')
    checkInvariants(noteOnly)
  })

  it('anula compra sin movimientos, inactivando y vaciando su lote', () => {
    const canceled = cancelPurchase(createDemoSeed(), 20)
    expect(canceled.compras.find(row => row.id_compra === 20)?.estado).toBe(false)
    expect(canceled.lotes.find(row => row.id_detalle_compra === 20)).toMatchObject({ estado: false, cantidad_disponible: 0 })
    checkInvariants(canceled)
    expect(() => cancelPurchase(canceled, 20)).toThrow('La compra seleccionada ya se encuentra anulada.')
    expect(() => cancelPurchase(createDemoSeed(), 4)).toThrow('No es posible anular la compra')
  })

  it('crea orden en proceso, ajusta cantidad, finaliza con lote congelado y permite anular si no se vendió', () => {
    let state = createDemoSeed()
    const source = state.lotes.find(row => row.es_transformable && row.estado && row.fecha_vencimiento >= futureDate(0))!
    const before = source.cantidad_disponible
    state = createProductionOrder(state, { id_usuario: 3, id_lote_origen: source.id_lote, cantidad_a_procesar: 2, observaciones: 'inicio' })
    const orderId = state.produccion.at(-1)!.id_produccion
    expect(state.produccion.at(-1)?.estado).toBe('En proceso')
    expect(state.lotes.find(row => row.id_lote === source.id_lote)?.cantidad_disponible).toBe(before - 2)
    checkInvariants(state)
    state = updateProductionOrder(state, orderId, { cantidad_a_procesar: 3, observaciones: 'ajustada' })
    checkInvariants(state)
    state = finishProduction(state, orderId, { unidades_obtenidas: 2, id_ubicacion: 315, fecha_vencimiento: futureDate(180) })
    expect(state.produccion.find(row => row.id_produccion === orderId)).toMatchObject({ estado: 'Finalizada', merma: 1 })
    expect(state.lotes.find(row => row.id_detalle_produccion === state.detalle_produccion.find(row => row.id_produccion === orderId)?.id_detalle_produccion))
      .toMatchObject({ cantidad_disponible: 2, id_ubicacion: 315 })
    checkInvariants(state)
    state = cancelProduction(state, orderId)
    expect(state.produccion.find(row => row.id_produccion === orderId)?.estado).toBe('Anulada')
    checkInvariants(state)
  })

  it('rechaza producción congelada cuyo peso excede el ingreso fresco y devuelve stock al cancelar en proceso', () => {
    let state = createDemoSeed()
    const source = state.lotes.find(row => row.es_transformable && row.estado && row.fecha_vencimiento >= futureDate(0))!
    state = createProductionOrder(state, { id_usuario: 3, id_lote_origen: source.id_lote, cantidad_a_procesar: 2 })
    const id = state.produccion.at(-1)!.id_produccion
    expect(() => finishProduction(state, id, { unidades_obtenidas: 3, id_ubicacion: 315, fecha_vencimiento: futureDate(180) }))
      .toThrow('Los kilos resultantes de fresa congelada no pueden superar los kilos ingresados de fresa fresca.')
    const before = state.lotes.find(row => row.id_lote === source.id_lote)!.cantidad_disponible
    state = cancelProduction(state, id)
    expect(state.lotes.find(row => row.id_lote === source.id_lote)?.cantidad_disponible).toBe(before + 2)
    checkInvariants(state)
  })

  it('vende fresa fresca en kg desde FEFO y fresa congelada en bolsas enteras con lote obligatorio', () => {
    const state = createDemoSeed()
    const fresh = state.productos.find(row => row.tipo_producto === 'Fresca')!
    const frozen = state.productos.find(row => row.tipo_producto === 'Congelada')!
    const sales = [
      { id_producto: fresh.id_producto, cantidad: 0.25 },
      { id_producto: frozen.id_producto, cantidad: 1 },
    ]
    const total = sales.reduce((sum, line) => sum + line.cantidad * state.productos.find(row => row.id_producto === line.id_producto)!.precio_venta_detal, 0)
    const next = createSale(state, {
      numero_documento: '222222222222', id_usuario: 2, tipo_venta: 'Detal', iva: 0, descuento_total: 0,
      pagos: [{ metodo_pago: 'Efectivo', monto: total }],
      lines: sales,
    })
    const details = next.detalle_venta.filter(row => row.id_venta === next.ventas.at(-1)?.id_venta)
    expect(details).toHaveLength(2)
    expect(details.every(row => Number.isInteger(row.id_lote))).toBe(true)
    expect(details.map(row => row.unidad_medida)).toEqual(['kg', 'bolsa'])
    checkInvariants(next)
    expect(() => createSale(state, {
      numero_documento: '222222222222', id_usuario: 2, tipo_venta: 'Detal', iva: 0, descuento_total: 0,
      pagos: [{ metodo_pago: 'Efectivo', monto: 1 }],
      lines: [{ id_producto: fresh.id_producto, cantidad: stockVendible(state, fresh.id_producto) + 1 }],
    })).toThrow(`Stock insuficiente para el producto seleccionado. Cantidad disponible: ${stockVendible(state, fresh.id_producto)}`)
  })

  it('registra pagos mixtos, anula con motivo y restituye exactamente cada lote', () => {
    const state = createDemoSeed()
    const product = state.productos.find(row => row.tipo_producto === 'Congelada')!
    const total = product.precio_venta_detal + 100
    const next = createSale(state, {
      numero_documento: '222222222222', id_usuario: 2, tipo_venta: 'Detal', iva: 100, descuento_total: 0,
      pagos: [{ metodo_pago: 'Efectivo', monto: total / 2 }, { metodo_pago: 'Transferencia', monto: total / 2, referencia: 'TR-001' }],
      lines: [{ id_producto: product.id_producto, cantidad: 1 }],
    })
    const saleId = next.ventas.at(-1)!.id_venta
    const detail = next.detalle_venta.find(row => row.id_venta === saleId)!
    const remaining = next.lotes.find(row => row.id_lote === detail.id_lote)!.cantidad_disponible
    expect(next.pagos_venta.filter(row => row.id_venta === saleId)).toHaveLength(2)
    expect(next.pagos_venta.find(row => row.id_venta === saleId && row.metodo_pago === 'Transferencia')?.referencia).toBe('TR-001')
    expect(() => cancelSale(next, saleId, '')).toThrow('Es obligatorio ingresar un motivo')
    const canceled = cancelSale(next, saleId, 'Error de digitación')
    expect(canceled.lotes.find(row => row.id_lote === detail.id_lote)?.cantidad_disponible).toBe(remaining + 1)
    checkInvariants(canceled)
  })

  it('edita una compra permitida y reemplaza sus líneas y totales', () => {
    const initial = createDemoSeed()
    const purchase = makePurchase(initial)
    const id = purchase.compras.at(-1)!.id_compra
    const edited = editPurchase(purchase, id, {
      id_proveedor: 2, id_usuario: 1, fecha: new Date().toISOString(), iva: 0, descuento: 0,
      lines: [{ id_producto: 3, cantidad_kg: 4, precio_unitario: 6000 }],
    })
    expect(edited.detalle_compra.filter(row => row.id_compra === id)).toHaveLength(1)
    expect(edited.compras.find(row => row.id_compra === id)?.total_compra).toBe(24000)
    checkInvariants(edited)
  })

  it('bloquea edición comercial de compra con movimientos y permite solo observaciones', () => {
    const initial = createDemoSeed()
    const details = initial.detalle_compra.filter(row => row.id_compra === 1)
    const notesOnly = editPurchase(initial, 1, { observaciones: 'Solo observación' })
    expect(notesOnly.compras.find(row => row.id_compra === 1)?.observaciones).toBe('Solo observación')
    expect(notesOnly.detalle_compra.filter(row => row.id_compra === 1)).toEqual(details)
    expect(() => editPurchase(notesOnly, 1, {
      id_proveedor: 1, id_usuario: 1, fecha: new Date().toISOString(), iva: 0, descuento: 0,
      lines: [{ id_producto: 1, cantidad_kg: 1, precio_unitario: 1 }],
    })).toThrow('La compra tiene movimientos; solo se pueden editar las observaciones.')
    checkInvariants(notesOnly)
  })

  it('anula una orden En proceso y devuelve cantidad al lote fresco', () => {
    let state = createDemoSeed()
    const source = state.lotes.find(row => row.es_transformable && row.estado && row.fecha_vencimiento >= futureDate(0))!
    const before = source.cantidad_disponible
    state = createProductionOrder(state, { id_usuario: 3, id_lote_origen: source.id_lote, cantidad_a_procesar: 2 })
    const orderId = state.produccion.at(-1)!.id_produccion
    state = cancelProduction(state, orderId)
    expect(state.produccion.find(row => row.id_produccion === orderId)?.estado).toBe('Anulada')
    expect(state.lotes.find(row => row.id_lote === source.id_lote)?.cantidad_disponible).toBe(before)
    checkInvariants(state)
  })

  it('anula una orden Finalizada sin ventas y revierte lote congelado y lote origen', () => {
    let state = createDemoSeed()
    const source = state.lotes.find(row => row.es_transformable && row.estado && row.fecha_vencimiento >= futureDate(0))!
    const before = source.cantidad_disponible
    state = createProductionOrder(state, { id_usuario: 3, id_lote_origen: source.id_lote, cantidad_a_procesar: 2 })
    const orderId = state.produccion.at(-1)!.id_produccion
    state = finishProduction(state, orderId, { unidades_obtenidas: 1, id_ubicacion: 315, fecha_vencimiento: futureDate(180) })
    const outputDetail = state.detalle_produccion.find(row => row.id_produccion === orderId)!
    const outputLotId = state.lotes.find(row => row.id_detalle_produccion === outputDetail.id_detalle_produccion)!.id_lote
    state = cancelProduction(state, orderId)
    expect(state.produccion.find(row => row.id_produccion === orderId)?.estado).toBe('Anulada')
    expect(state.lotes.find(row => row.id_lote === source.id_lote)?.cantidad_disponible).toBe(before)
    expect(state.lotes.find(row => row.id_lote === outputLotId)).toMatchObject({ estado: false, cantidad_disponible: 0 })
    checkInvariants(state)
  })

  it('vende congelados solo en bolsas enteras y persiste unidad bolsa', () => {
    const state = createDemoSeed()
    const frozen = state.productos.find(row => row.tipo_producto === 'Congelada')!
    const sale = createSale(state, {
      numero_documento: '222222222222', id_usuario: 2, tipo_venta: 'Detal', iva: 0, descuento_total: 0,
      pagos: [{ metodo_pago: 'Efectivo', monto: frozen.precio_venta_detal }],
      lines: [{ id_producto: frozen.id_producto, cantidad: 1 }],
    })
    expect(sale.detalle_venta.at(-1)).toMatchObject({ id_producto: frozen.id_producto, cantidad: 1, unidad_medida: 'bolsa' })
    expect(() => createSale(state, {
      numero_documento: '222222222222', id_usuario: 2, tipo_venta: 'Detal', iva: 0, descuento_total: 0,
      pagos: [{ metodo_pago: 'Efectivo', monto: frozen.precio_venta_detal / 2 }],
      lines: [{ id_producto: frozen.id_producto, cantidad: 0.5 }],
    })).toThrow('La cantidad de producto congelado debe ser un número entero de bolsas.')
    checkInvariants(sale)
  })

  it('acepta pago mixto válido de efectivo y transferencia', () => {
    const state = createDemoSeed()
    const frozen = state.productos.find(row => row.tipo_producto === 'Congelada')!
    const total = frozen.precio_venta_detal + 100
    const sale = createSale(state, {
      numero_documento: '222222222222', id_usuario: 2, tipo_venta: 'Detal', iva: 100, descuento_total: 0,
      pagos: [
        { metodo_pago: 'Efectivo', monto: total / 2 },
        { metodo_pago: 'Transferencia', monto: total / 2, referencia: 'TR-MIX-1' },
      ],
      lines: [{ id_producto: frozen.id_producto, cantidad: 1 }],
    })
    const id = sale.ventas.at(-1)!.id_venta
    expect(sale.pagos_venta.filter(row => row.id_venta === id)).toHaveLength(2)
    expect(sale.pagos_venta.find(row => row.id_venta === id && row.metodo_pago === 'Transferencia')?.referencia).toBe('TR-MIX-1')
    checkInvariants(sale)
  })

  it('rechaza pago mixto cuya suma no coincide con el total', () => {
    const state = createDemoSeed()
    const frozen = state.productos.find(row => row.tipo_producto === 'Congelada')!
    expect(() => createSale(state, {
      numero_documento: '222222222222', id_usuario: 2, tipo_venta: 'Detal', iva: 0, descuento_total: 0,
      pagos: [{ metodo_pago: 'Efectivo', monto: 1 }, { metodo_pago: 'Transferencia', monto: 2 }],
      lines: [{ id_producto: frozen.id_producto, cantidad: 1 }],
    })).toThrow('El pago en efectivo y transferencia debe sumar exactamente el total.')
    checkInvariants(state)
  })

  it('valida los permisos contra los pares válidos del módulo y aplica rol 1 como administrador', () => {
    const state = createDemoSeed()
    expect(state.permisos.map(row => row.nombre_permiso)).toContain('Producción')
    expect(hasPermission(state, 1, 'Dashboard', 'Consultar')).toBe(true)
    expect(hasPermission(state, 2, 'Ventas', 'Registrar')).toBe(true)
    expect(hasPermission(state, 2, 'Compras', 'Registrar')).toBe(false)
    expect(() => login(state, 'admin@fresas.co', 'Admin123*')).not.toThrow()
    checkInvariants(state)
  })
})
