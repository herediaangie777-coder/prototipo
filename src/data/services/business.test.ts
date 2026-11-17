import { describe, expect, it } from 'vitest'
import { createDemoSeed } from '../seed'
import { checkInvariants } from '../invariants'
import { expiryStatus, localDateFromTimestamp, localDateString } from '../dates'
import { dashboardStats, freezeCandidates, freezeSuggestions, hasPermission, periodRows, sellableStock } from '../selectors'
import { getHomePath } from '../navigation'
import { formatId } from '../format'
import { toKg } from '../units'
import type { MetodoPago } from '../types'
import { INVALID_CREDENTIALS, INACTIVE_ACCOUNT, login } from './auth'
import { associateLot, cancelPurchase, cancelSale, createProduction, createPurchase, createSale } from './business'
import { saveMaster, toggleMasterState } from './masters'

const dateInDays = (days: number) => {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}
const localDateInDays = (days: number) => {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return localDateString(date)
}

describe('fechas de vencimiento', () => {
  const now = new Date(2026, 10, 13, 12, 0, 0)

  it('clasifica los vencimientos por fecha de calendario hasta el fin del día', () => {
    expect(expiryStatus('2026-11-13', now)).toBe('critico')
    expect(expiryStatus('2026-11-12', now)).toBe('vencido')
    expect(expiryStatus('2026-11-14', now)).toBe('critico')
    expect(expiryStatus('2026-11-15', now)).toBe('advertencia')
  })

  it('solo considera candidatos de fresa fresca activos, transformables, disponibles y no vencidos', () => {
    const state = createDemoSeed()
    const candidates = freezeCandidates(state, now)
    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates.every(lot => lot.estado && lot.es_transformable && lot.cantidad_disponible > 0
      && expiryStatus(lot.fecha_vencimiento, now) !== 'vencido'
      && state.productos.find(product => product.id_producto === lot.detail?.id_producto)?.tipo_producto === 'Fresca')).toBe(true)
  })

  it('sugiere primero solo lotes frescos críticos o en advertencia', () => {
    const state = createDemoSeed()
    const suggestions = freezeSuggestions(state, new Date())
    expect(suggestions.map(lot => lot.id_lote)).toEqual([1, 2])
    expect(suggestions.map(lot => lot.fecha_vencimiento)).toEqual(
      [...suggestions].map(lot => lot.fecha_vencimiento).sort(),
    )
  })
})

function saleInput(
  state: ReturnType<typeof createDemoSeed>,
  lines: Array<{ id_producto: number; cantidad_kg: number }>,
  options: { iva?: number; descuento_total?: number; pagos?: Array<{ metodo_pago: MetodoPago; monto: number }> } = {},
): Parameters<typeof createSale>[1] {
  const tipo_venta = 'Detal'
  const subtotal = lines.reduce((sum, line) => {
    const product = state.productos.find(row => row.id_producto === line.id_producto)!
    return sum + line.cantidad_kg * product.precio_venta_detal
  }, 0)
  const iva = options.iva ?? 0
  const descuento_total = options.descuento_total ?? 0
  const total = Number((subtotal - descuento_total + iva).toFixed(2))
  return {
    numero_documento: '222222222222', id_usuario: 2, tipo_venta, iva, descuento_total,
    pagos: options.pagos ?? [{ metodo_pago: 'Efectivo', monto: total }],
    lines,
  }
}

describe('servicios transaccionales', () => {
  it('interpreta fechas ISO de solo día sin desplazar el calendario por zona horaria', () => {
    const previousTZ = process.env.TZ
    process.env.TZ = 'America/Bogota'
    try {
      expect(localDateFromTimestamp('2026-11-12')).toBe('2026-11-12')
    } finally {
      process.env.TZ = previousTZ
    }
  })

  it('convierte unidades de compra y venta a kg con precisión de dos decimales', () => {
    expect(formatId('C', 1)).toBe('C-0001')
    expect(formatId('V', 1)).toBe('V-0001')
    expect(formatId('OP', 1)).toBe('OP-0001')
    expect(toKg(250, 'g')).toBe(0.25)
    expect(toKg(2, 'Bulto', 10)).toBe(20)
    expect(() => toKg(2, 'Caja')).toThrow('Indique los kg por unidad.')
    expect(() => toKg(1, 'g')).toThrow('La cantidad mínima es 10 g (0.01 kg).')
    expect(() => toKg(15, 'g')).toThrow('La cantidad mínima es 10 g (0.01 kg).')
    expect(() => toKg(1, 'Bolsa', 0)).toThrow('Indique los kg por unidad.')
  })

  it('crea una compra multilínea, aplica IVA y descuento y permite líneas sin lote', () => {
    const seed = createDemoSeed()
    const next = createPurchase(seed, {
      id_proveedor: 1, id_usuario: 1, fecha: new Date().toISOString(),
      observaciones: 'Compra con impuestos', iva: 1200, descuento: 500,
      lines: [
        { id_producto: 1, cantidad_kg: 2, precio_unitario: 7000, lote: {
          numero_lote: 'COMPRA-IVA-1', fecha_vencimiento: dateInDays(10),
          tipo_empaque: 'Caja', zona_ubicacion: 'Zona A', es_transformable: true,
        } },
        { id_producto: 2, cantidad_kg: 3, precio_unitario: 6500 },
      ],
    })
    const purchase = next.compras.at(-1)!
    expect(next.detalle_compra.filter(row => row.id_compra === purchase.id_compra)).toHaveLength(2)
    expect(purchase).toMatchObject({ iva: 1200, descuento: 500, total_compra: 34200 })
    expect(next.lotes.some(row => row.numero_lote === 'COMPRA-IVA-1')).toBe(true)
    expect(next.lotes.some(row => row.id_detalle_compra === next.detalle_compra.at(-1)?.id_detalle_compra)).toBe(false)
    checkInvariants(next)
  })

  it('rechaza descuentos de compra superiores al subtotal y órdenes sin productos', () => {
    const seed = createDemoSeed()
    expect(() => createPurchase(seed, {
      id_proveedor: 1, id_usuario: 1, fecha: new Date().toISOString(), iva: 0, descuento: 1, lines: [],
    })).toThrow('Debe agregar al menos un producto a la orden de compra.')
    expect(() => createPurchase(seed, {
      id_proveedor: 1, id_usuario: 1, fecha: new Date().toISOString(), iva: 0, descuento: 100,
      lines: [{ id_producto: 1, cantidad_kg: 1, precio_unitario: 10 }],
    })).toThrow('El descuento no puede superar el subtotal.')
  })

  it('asocia un lote sin volver a sumar el stock ingresado en la compra', () => {
    const seed = createDemoSeed()
    const detail = seed.detalle_compra.find(row => row.id_compra === 20)!
    const product = seed.productos.find(row => row.id_producto === detail.id_producto)!
    const stockBefore = product.stock_disponible
    seed.lotes = seed.lotes.filter(row => row.id_detalle_compra !== detail.id_detalle_compra)
    const next = associateLot(seed, detail.id_detalle_compra, 'ASOCIADO-20', dateInDays(10), 'Bolsa')
    expect(next.lotes.some(row => row.numero_lote === 'ASOCIADO-20')).toBe(true)
    expect(next.productos.find(row => row.id_producto === detail.id_producto)?.stock_disponible).toBe(stockBefore)
    checkInvariants(next)
  })

  it('anula compras sin consumo y bloquea consumo o una compra ya anulada', () => {
    const seed = createDemoSeed()
    const canceled = cancelPurchase(seed, 20)
    expect(canceled.compras.find(row => row.id_compra === 20)?.estado).toBe(false)
    checkInvariants(canceled)
    expect(() => cancelPurchase(canceled, 20)).toThrow('La compra seleccionada ya se encuentra anulada.')
    expect(() => cancelPurchase(seed, 3)).toThrow('No es posible anular la compra debido a que parte del inventario ingresado ya fue consumido o vendido.')
  })

  it('rechaza anular una compra cuando el stock disponible no alcanza para descontarla', () => {
    const seed = createDemoSeed()
    const detail = seed.detalle_compra.find(row => row.id_compra === 20)!
    seed.productos.find(row => row.id_producto === detail.id_producto)!.stock_disponible = detail.cantidad - 1
    expect(() => cancelPurchase(seed, 20)).toThrow('No es posible anular la compra debido a que parte del inventario ingresado ya fue consumido o vendido.')
  })

  it('produce automáticamente el producto congelado del mismo calibre y valida el lote de origen', () => {
    const seed = createDemoSeed()
    const lot = seed.lotes.find(row => row.id_lote === 11)!
    const source = seed.detalle_compra.find(row => row.id_detalle_compra === lot.id_detalle_compra)!
    const sourceProduct = seed.productos.find(row => row.id_producto === source.id_producto)!
    const next = createProduction(seed, {
      id_usuario: 3, id_lote: lot.id_lote, cantidad_procesada: 2, merma: 0.5,
      fecha_produccion: new Date().toISOString(),
    })
    const output = next.detalle_produccion.find(row => row.id_produccion === next.produccion.at(-1)?.id_produccion)!
    expect(next.productos.find(row => row.id_producto === output.id_producto)).toMatchObject({
      tipo_producto: 'Congelada', id_categoria: sourceProduct.id_categoria,
    })
    expect(output).toMatchObject({ cantidad_obtenida: 1.5, unidad_medida: 'kg' })
    expect(next.lotes.find(row => row.id_lote === lot.id_lote)?.cantidad_disponible).toBe(lot.cantidad_disponible - 2)
    checkInvariants(next)

    const expired = createDemoSeed()
    expired.lotes.find(row => row.id_lote === 20)!.fecha_vencimiento = dateInDays(-1)
    expect(() => createProduction(expired, {
      id_usuario: 3, id_lote: 20, cantidad_procesada: 1, merma: 0,
      fecha_produccion: new Date().toISOString(),
    })).toThrow('No es posible procesar un lote vencido.')
    expect(() => createProduction(seed, {
      id_usuario: 3, id_lote: 20, cantidad_procesada: 1000, merma: 0,
      fecha_produccion: new Date().toISOString(),
    })).toThrow('El lote seleccionado no posee suficiente stock de fresa fresca para la cantidad solicitada.')
  })

  it('vende 250 g como 0.25 kg, y la anulación exige motivo y reactiva el lote devuelto', () => {
    const seed = createDemoSeed()
    const quantity = toKg(250, 'g')
    const next = createSale(seed, saleInput(seed, [{ id_producto: 1, cantidad_kg: quantity }]))
    const sale = next.ventas.at(-1)!
    const line = next.detalle_venta.find(row => row.id_venta === sale.id_venta)!
    expect(line).toMatchObject({ cantidad: 0.25, unidad_medida: 'kg' })
    checkInvariants(next)
    expect(() => cancelSale(next, sale.id_venta, '  ')).toThrow('Es obligatorio ingresar un motivo para proceder con la anulación.')
    const lot = next.lotes.find(row => row.id_lote === line.id_lote)!
    lot.estado = false
    const restored = cancelSale(next, sale.id_venta, 'Error de digitación')
    expect(restored.lotes.find(row => row.id_lote === line.id_lote)).toMatchObject({ estado: true, cantidad_disponible: lot.cantidad_disponible + 0.25 })
    expect(restored.ventas.find(row => row.id_venta === sale.id_venta)?.motivo_anulacion).toBe('Error de digitación')
    checkInvariants(restored)
  })

  it('vende dos bultos de 10 kg y rechaza el stock insuficiente', () => {
    const seed = createDemoSeed()
    const stocked = createProduction(seed, {
      id_usuario: 3, id_lote: 13, cantidad_procesada: 20, merma: 0,
      fecha_produccion: new Date().toISOString(),
    })
    checkInvariants(stocked)
    const frozen = stocked.productos.find(row => row.tipo_producto === 'Congelada' && row.id_categoria === 1)!
    const quantity = toKg(2, 'Bulto', 10)
    const next = createSale(stocked, saleInput(stocked, [{ id_producto: frozen.id_producto, cantidad_kg: quantity }]))
    expect(next.detalle_venta.find(row => row.id_venta === next.ventas.at(-1)?.id_venta)).toMatchObject({
      cantidad: 20, unidad_medida: 'kg', id_lote: null,
    })
    checkInvariants(next)

    const fresh = stocked.productos.find(row => row.tipo_producto === 'Fresca')!
    const available = sellableStock(stocked, fresh.id_producto)
    expect(() => createSale(stocked, saleInput(stocked, [{ id_producto: fresh.id_producto, cantidad_kg: available + 1 }])))
      .toThrow(`Stock insuficiente para el producto seleccionado. Cantidad disponible: ${available} kg`)
  })

  it('registra pago mixto, rechaza una suma incorrecta y no admite Tarjeta', () => {
    const seed = createDemoSeed()
    const product = seed.productos.find(row => row.tipo_producto === 'Congelada')!
    const line = [{ id_producto: product.id_producto, cantidad_kg: 1 }]
    const total = product.precio_venta_detal
    const mixed = createSale(seed, saleInput(seed, line, {
      iva: 100, descuento_total: 50,
      pagos: [{ metodo_pago: 'Efectivo', monto: total / 2 + 25 }, { metodo_pago: 'Transferencia', monto: total / 2 + 25 }],
    }))
    const sale = mixed.ventas.at(-1)!
    expect(mixed.pagos_venta.filter(row => row.id_venta === sale.id_venta)).toHaveLength(2)
    expect(sale.total_pagar).toBe(total + 50)
    checkInvariants(mixed)

    expect(() => createSale(seed, saleInput(seed, line, {
      pagos: [{ metodo_pago: 'Efectivo', monto: 1 }, { metodo_pago: 'Transferencia', monto: 2 }],
    }))).toThrow('El pago en efectivo y transferencia debe sumar exactamente el total.')
    const cardInput = saleInput(seed, line, {
      pagos: [{ metodo_pago: 'Tarjeta' as MetodoPago, monto: total }],
    })
    expect(() => createSale(seed, cardInput)).toThrow('El método de pago no es válido.')
    expect(seed.pagos_venta.some(row => (row.metodo_pago as string) === 'Tarjeta')).toBe(false)
  })

  it('registra el flujo POS con pago mixto e IVA porcentual con decimales', () => {
    const seed = createDemoSeed()
    const product = seed.productos.find(row => row.tipo_producto === 'Congelada' && row.stock_disponible > 0)!
    const quantity = 0.01
    const subtotal = quantity * product.precio_venta_detal
    const iva = Number((subtotal * 19 / 100).toFixed(2))
    expect(iva % 1).not.toBe(0)
    const total = Number((subtotal + iva).toFixed(2))
    const next = createSale(seed, saleInput(seed, [{ id_producto: product.id_producto, cantidad_kg: quantity }], {
      iva,
      pagos: [{ metodo_pago: 'Efectivo', monto: total / 2 }, { metodo_pago: 'Transferencia', monto: total / 2 }],
    }))
    const sale = next.ventas.at(-1)!
    expect(sale).toMatchObject({ iva, total_pagar: total, estado: true })
    expect(next.pagos_venta.filter(payment => payment.id_venta === sale.id_venta)).toHaveLength(2)
    checkInvariants(next)
  })

  it('usa solo pagos Efectivo y Transferencia en el seed y selector de cierre', () => {
    const seed = createDemoSeed()
    expect(seed.categorias.every(row => !('descripcion' in row))).toBe(true)
    expect(seed.roles.every(row => !('descripcion' in row))).toBe(true)
    expect(seed.productos.every(row => row.presentacion === 'Granel')).toBe(true)
    expect(seed.lotes.every(row => /^L-\d{3}$/.test(row.numero_lote))).toBe(true)
    expect(seed.pagos_venta.every(row => row.metodo_pago === 'Efectivo' || row.metodo_pago === 'Transferencia')).toBe(true)
    expect(seed.ventas.some(row => row.iva > 0 && row.descuento_total > 0)).toBe(true)
    expect(seed.pagos_venta.some(row => seed.pagos_venta.filter(payment => payment.id_venta === row.id_venta).length === 2)).toBe(true)
    const seedNow = new Date()
    const criticalLot = seed.lotes.find(row => row.id_lote === 1)!
    const warningLot = seed.lotes.find(row => row.id_lote === 2)!
    expect(criticalLot.fecha_vencimiento).toBe(localDateInDays(1))
    expect(warningLot.fecha_vencimiento).toBe(localDateInDays(2))
    expect(criticalLot.cantidad_disponible).toBeGreaterThan(0)
    expect(warningLot.cantidad_disponible).toBeGreaterThan(0)
    const expiredLot = seed.lotes.find(row => row.id_lote === 3)!
    expect(expiredLot.fecha_vencimiento).toBe(localDateInDays(-1))
    expect(expiredLot.fecha_ingreso <= expiredLot.fecha_vencimiento).toBe(true)
    expect(expiredLot.cantidad_disponible).toBeGreaterThan(0)
    expect(expiryStatus(criticalLot.fecha_vencimiento, seedNow)).toBe('critico')
    expect(expiryStatus(warningLot.fecha_vencimiento, seedNow)).toBe('advertencia')
    expect(expiryStatus(expiredLot.fecha_vencimiento, seedNow)).toBe('vencido')
    for (let id = 4; id <= 20; id++) {
      const lot = seed.lotes.find(row => row.id_lote === id)!
      expect(lot.fecha_vencimiento).toBe(localDateInDays(3 + ((id - 1) % 6)))
      expect(lot.fecha_ingreso <= lot.fecha_vencimiento).toBe(true)
    }
    for (const production of seed.produccion) {
      const lot = seed.lotes.find(row => row.id_lote === production.id_lote)!
      const source = seed.detalle_compra.find(row => row.id_detalle_compra === lot.id_detalle_compra)!
      const sourceProduct = seed.productos.find(row => row.id_producto === source.id_producto)!
      const output = seed.detalle_produccion.find(row => row.id_produccion === production.id_produccion)!
      expect(seed.productos.find(row => row.id_producto === output.id_producto)?.id_categoria).toBe(sourceProduct.id_categoria)
      expect(lot.fecha_vencimiento >= localDateString()).toBe(true)
      expect(production.id_lote).toBe(production.id_produccion + 3)
    }
    for (const detail of seed.detalle_venta.filter(row => row.id_lote !== null)) {
      expect(seed.lotes.find(row => row.id_lote === detail.id_lote)!.fecha_vencimiento >= localDateString()).toBe(true)
    }
    for (const records of [
      seed.compras.map(row => row.fecha_compra),
      seed.ventas.map(row => row.fecha_venta),
      seed.produccion.map(row => row.fecha_produccion),
    ]) {
      expect(records.every((date, index) => index === 0 || records[index - 1].localeCompare(date) <= 0)).toBe(true)
      expect(records.every(date => localDateFromTimestamp(date) >= localDateInDays(-14))).toBe(true)
      expect(records.every(date => localDateFromTimestamp(date) <= localDateInDays(0))).toBe(true)
    }
    expect(dashboardStats(seed, seedNow).freshCriticalCount).toBe(2)
    checkInvariants(seed)
  })

  it('consulta permisos y valida login inválido o inactivo', () => {
    const seed = createDemoSeed()
    expect(hasPermission(seed, 2, 'Ventas', 'Crear')).toBe(true)
    expect(hasPermission(seed, 2, 'Compras', 'Crear')).toBe(false)
    expect(login(seed, 'ADMIN@FRESAS.CO', 'Admin123*').id_rol).toBe(1)
    expect(() => login(seed, 'admin@fresas.co', 'incorrecta')).toThrow(INVALID_CREDENTIALS)
    seed.usuarios[0].estado = false
    expect(() => login(seed, 'admin@fresas.co', 'Admin123*')).toThrow(INACTIVE_ACCOUNT)
  })

  it('envía cada rol demo a su primera pantalla accesible después del login', () => {
    const seed = createDemoSeed()
    const cases = [
      { email: 'admin@fresas.co', password: 'Admin123*', path: '/dashboard', module: 'Ventas' },
      { email: 'ventas@fresas.co', password: 'Ventas123*', path: '/ventas', module: 'Ventas' },
      { email: 'operario@fresas.co', password: 'Operario123*', path: '/compras', module: 'Compras' },
    ]
    for (const item of cases) {
      const user = login(seed, item.email, item.password)
      expect(getHomePath(seed, user)).toBe(item.path)
      expect(hasPermission(seed, user.id_rol, item.module, 'Leer')).toBe(true)
    }
    const noAccess = createDemoSeed()
    const vendor = login(noAccess, 'ventas@fresas.co', 'Ventas123*')
    noAccess.roles_x_permisos = noAccess.roles_x_permisos.filter(permission => permission.id_rol !== vendor.id_rol)
    expect(getHomePath(noAccess, vendor)).toBeNull()
  })

  it('agrupa operaciones según fecha local y periodo anual de doce meses', () => {
    const seed = createDemoSeed()
    const now = new Date(2026, 10, 11, 20, 0, 0)
    seed.ventas = [{
      ...seed.ventas[0], fecha_venta: new Date(2026, 10, 11, 9, 0, 0).toISOString(),
      total_pagar: 4321, estado: true,
    }]
    seed.compras = []
    expect(dashboardStats(seed, now).salesToday).toBe(4321)
    expect(periodRows(seed, 'Diario', now)[0]).toMatchObject({
      date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
      ventas: 4321,
    })
    seed.ventas = [
      { ...seed.ventas[0], fecha_venta: new Date(2026, 10, 3, 10, 0, 0).toISOString(), total_pagar: 4321, estado: true },
      { ...seed.ventas[0], id_venta: 999, fecha_venta: new Date(2026, 9, 3, 10, 0, 0).toISOString(), total_pagar: 1234, estado: true },
    ]
    const annual = periodRows(seed, 'Anual', new Date(2026, 10, 11, 12, 0, 0))
    expect(annual).toHaveLength(12)
    expect(annual.at(-1)).toMatchObject({ date: '2026-11-01', ventas: 4321 })
    expect(annual.at(-2)).toMatchObject({ date: '2026-10-01', ventas: 1234 })
  })

  it('completa un flujo compra, producción, venta y anulación verificando invariantes tras cada paso', () => {
    let state = createDemoSeed()
    const freshBefore = state.productos.find(row => row.id_producto === 1)!.stock_disponible
    const frozenBefore = state.productos.find(row => row.id_producto === 5)!.stock_disponible
    state = createPurchase(state, {
      id_proveedor: 1, id_usuario: 1, fecha: new Date().toISOString(), iva: 1000, descuento: 500,
      lines: [{ id_producto: 1, cantidad_kg: 12, precio_unitario: 7000, lote: {
        numero_lote: 'FLUJO-INTEGRAL', fecha_vencimiento: dateInDays(10),
        tipo_empaque: 'Caja', zona_ubicacion: 'Zona A', es_transformable: true,
      } }],
    })
    checkInvariants(state)
    const lot = state.lotes.find(row => row.numero_lote === 'FLUJO-INTEGRAL')!
    expect(state.productos.find(row => row.id_producto === 1)?.stock_disponible).toBe(freshBefore + 12)

    state = createProduction(state, {
      id_usuario: 3, id_lote: lot.id_lote, cantidad_procesada: 5, merma: 0.5,
      fecha_produccion: new Date().toISOString(),
    })
    checkInvariants(state)
    expect(state.lotes.find(row => row.id_lote === lot.id_lote)?.cantidad_disponible).toBe(7)
    expect(state.productos.find(row => row.id_producto === 1)?.stock_disponible).toBe(freshBefore + 7)
    expect(state.productos.find(row => row.id_producto === 5)?.stock_disponible).toBe(frozenBefore + 4.5)

    const saleInputData = saleInput(state, [{ id_producto: 5, cantidad_kg: 1 }], {
      pagos: [{ metodo_pago: 'Transferencia', monto: state.productos[4].precio_venta_detal }],
    })
    state = createSale(state, saleInputData)
    checkInvariants(state)
    const sale = state.ventas.at(-1)!
    expect(state.pagos_venta.filter(row => row.id_venta === sale.id_venta)[0]?.monto_recibido).toBe(sale.total_pagar)
    expect(state.productos.find(row => row.id_producto === 5)?.stock_disponible).toBe(frozenBefore + 3.5)

    state = cancelSale(state, sale.id_venta, 'Prueba de anulación')
    checkInvariants(state)
    expect(state.ventas.find(row => row.id_venta === sale.id_venta)?.estado).toBe(false)
    expect(state.productos.find(row => row.id_producto === 5)?.stock_disponible).toBe(frozenBefore + 4.5)
  })

  it('valida roles y cuentas en servicios, incluida la protección del rol principal', () => {
    const seed = createDemoSeed()
    const permissions = [{ id_permiso: 1, id_privilegio: 1 }]
    expect(() => saveMaster(seed, 'rol', { nombre_rol: 'Vendedor' }, undefined, permissions))
      .toThrow('El nombre de rol ingresado ya existe en la plataforma.')
    expect(() => saveMaster(seed, 'rol', { nombre_rol: 'Ventas / Admin' }, undefined, permissions))
      .toThrow('No se permiten caracteres especiales')
    expect(() => saveMaster(seed, 'rol', { nombre_rol: 'Nuevo rol' }, undefined, []))
      .toThrow('Debe asignar al menos un permiso al rol.')
    expect(() => toggleMasterState(seed, 'rol', 1))
      .toThrow('No es posible desactivar el rol principal del sistema.')
    expect(() => toggleMasterState(seed, 'usuario', 1, 1))
      .toThrow('No puede desactivar su propio usuario mientras mantiene sesión activa.')
    expect(() => saveMaster(seed, 'usuario', {
      nombre: 'Nuevo', apellido: 'Usuario', correo: 'correo-invalido',
      id_rol: '2', contrasenia: 'sin-numeros',
    })).toThrow('El correo electrónico no posee un formato válido.')

    const inactiveRoleState = toggleMasterState(seed, 'rol', 2)
    expect(() => login(inactiveRoleState, 'ventas@fresas.co', 'Ventas123*')).toThrow(INACTIVE_ACCOUNT)
  })

  it('acepta editar clientes cuando el documento llega como número y no marca duplicado falso', () => {
    const seed = createDemoSeed()
    const current = seed.clientes.find(row => row.numero_documento === '1017123456')!
    const next = saveMaster(seed, 'cliente', {
      numero_documento: '1017123456', tipo_documento: 'CC', nombre_cliente: 'Juan Pérez Actualizado',
      telefono: '3101234567', correo: 'juan.nuevo@mail.com', direccion: 'Nueva dirección',
      departamento: 'Antioquia', municipio: 'Medellín',
    }, Number(current.numero_documento))
    expect(next.clientes.find(row => row.numero_documento === '1017123456')?.nombre_cliente).toBe('Juan Pérez Actualizado')
    expect(() => toggleMasterState(seed, 'cliente', Number(current.numero_documento))).not.toThrow()
  })
})
