import type { AppState, MetodoPago, TableName } from './types'
import { checkInvariants } from './invariants'
import { localDateString, localTimestampString } from './dates'

const tables: TableName[] = [
  'categorias', 'clientes', 'compras', 'detalle_compra', 'detalle_produccion',
  'detalle_venta', 'lotes', 'pagos_venta', 'permisos', 'privilegios',
  'produccion', 'productos', 'proveedores', 'roles', 'roles_x_permisos',
  'usuarios', 'ventas',
]
const dateOffset = (days: number) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return localDateString(d)
}
const stampInRange = (index: number, count: number, daysAgo: number) => {
  const date = new Date()
  date.setHours(8, 0, 0, 0)
  date.setDate(date.getDate() - daysAgo)
  date.setMinutes(date.getMinutes() + Math.floor(index * daysAgo * 24 * 60 / (count - 1)))
  return localTimestampString(date)
}
const emptyIds = () => Object.fromEntries(tables.map(t => [t, 1])) as Record<TableName, number>

export function createDemoSeed(): AppState {
  const categorias = ['Calibre 1', 'Calibre 2', 'Calibre 3', 'Jumbo'].map((nombre_categoria, i) => ({
    id_categoria: i + 1, nombre_categoria, estado: true,
  }))
  const productos = Array.from({ length: 8 }, (_, i) => ({
    id_producto: i + 1,
    id_categoria: (i % 4) + 1,
    tipo_producto: (i < 4 ? 'Fresca' : 'Congelada') as 'Fresca' | 'Congelada',
    presentacion: 'Granel',
    unidad_medida: 'kg',
    precio_compra: [7000, 6500, 6000, 8000, 9500, 9000, 8500, 10500][i],
    precio_venta_detal: [12000, 11000, 10000, 14000, 15000, 14000, 13000, 17000][i],
    precio_venta_mayorista: [10500, 9500, 8500, 12000, 13000, 12000, 11500, 15000][i],
    stock_inicial: 0,
    stock_disponible: 0,
    stock_minimo: 8,
    estado: true,
  }))
  const proveedores = [
    { nombre_proveedor: 'Fresas del Oriente', telefono: '3111111111', correo: 'oriente@mail.co', direccion: 'Vereda La Cruz', municipio: 'Marinilla', departamento: 'Antioquia' },
    { nombre_proveedor: 'Agro San Vicente', telefono: '3122222222', correo: 'sanvic@mail.co', direccion: 'Finca El Mirador', municipio: 'San Vicente', departamento: 'Antioquia' },
    { nombre_proveedor: 'Cultivos La Ceja', telefono: '3133333333', correo: 'laceja@mail.co', direccion: 'Km 5 Vía La Ceja', municipio: 'La Ceja', departamento: 'Antioquia' },
  ].map((p, i) => ({ id_proveedor: i + 1, ...p, estado: true }))
  const clientes = [
    { numero_documento: '222222222222', tipo_documento: 'CC' as const, nombre_cliente: 'Cliente General / Final', telefono: null, correo: null, direccion: null, estado: true, departamento: null, municipio: null },
    { numero_documento: '1017123456', tipo_documento: 'CC' as const, nombre_cliente: 'Juan Pérez', telefono: '3101234567', correo: 'juan@mail.com', direccion: 'Calle 10 # 20-30', estado: true, departamento: 'Antioquia', municipio: 'Medellín' },
    { numero_documento: '900123456', tipo_documento: 'NIT' as const, nombre_cliente: 'Frutería La Cosecha SAS', telefono: '6044445566', correo: 'compras@cosecha.com', direccion: 'Carrera 50 # 40-10', estado: true, departamento: 'Antioquia', municipio: 'Medellín' },
    { numero_documento: '43567890', tipo_documento: 'CC' as const, nombre_cliente: 'María Torres', telefono: '3157654321', correo: 'maria@mail.com', direccion: 'Calle 30 # 45-12', estado: true, departamento: 'Antioquia', municipio: 'Medellín' },
    { numero_documento: '1020456789', tipo_documento: 'CC' as const, nombre_cliente: 'Andrés Mejía', telefono: '3209876543', correo: 'andres@mail.com', direccion: 'Transversal 78 # 65-20', estado: true, departamento: 'Antioquia', municipio: 'Medellín' },
    { numero_documento: '901234567', tipo_documento: 'NIT' as const, nombre_cliente: 'Restaurante El Fresal', telefono: '6047778899', correo: 'info@elfresal.com', direccion: 'Circular 4 # 70-15', estado: true, departamento: 'Antioquia', municipio: 'Medellín' },
  ]
  const roles = [
    { id_rol: 1, nombre_rol: 'Administrador', estado: true },
    { id_rol: 2, nombre_rol: 'Vendedor', estado: true },
    { id_rol: 3, nombre_rol: 'Operario', estado: true },
  ]
  const permisos = ['Ventas', 'Compras', 'Produccion', 'Inventario'].map((nombre_permiso, i) => ({ id_permiso: i + 1, nombre_permiso }))
  const privilegios = ['Crear', 'Leer', 'Actualizar', 'Eliminar'].map((nombre_privilegio, i) => ({ id_privilegio: i + 1, nombre_privilegio }))
  const roles_x_permisos: AppState['roles_x_permisos'] = []
  for (const permission of permisos) for (const privilege of privilegios) roles_x_permisos.push({ id_rol: 1, id_permiso: permission.id_permiso, id_privilegio: privilege.id_privilegio })
  for (const [name, privileges] of [['Ventas', [1, 2, 3]], ['Inventario', [2]]] as [string, number[]][]) {
    for (const privilege of privileges) roles_x_permisos.push({ id_rol: 2, id_permiso: permisos.find(p => p.nombre_permiso === name)!.id_permiso, id_privilegio: privilege })
  }
  for (const [name, privileges] of [['Compras', [1, 2, 3]], ['Produccion', [1, 2, 3]], ['Inventario', [2, 3]]] as [string, number[]][]) {
    for (const privilege of privileges) roles_x_permisos.push({ id_rol: 3, id_permiso: permisos.find(p => p.nombre_permiso === name)!.id_permiso, id_privilegio: privilege })
  }
  const usuarios = [
    { id_usuario: 1, id_rol: 1, nombre: 'Laura', apellido: 'Gómez', correo: 'admin@fresas.co', telefono: '3001112233', contrasenia: 'Admin123*', estado: true },
    { id_usuario: 2, id_rol: 2, nombre: 'Carlos', apellido: 'Ríos', correo: 'ventas@fresas.co', telefono: '3002223344', contrasenia: 'Ventas123*', estado: true },
    { id_usuario: 3, id_rol: 3, nombre: 'Marta', apellido: 'Londoño', correo: 'operario@fresas.co', telefono: '3003334455', contrasenia: 'Operario123*', estado: true },
  ]
  const compras: AppState['compras'] = []
  const detalle_compra: AppState['detalle_compra'] = []
  const lotes: AppState['lotes'] = []
  for (let i = 0; i < 20; i++) {
    const id_compra = i + 1
    const id_producto = (i % 4) + 1
    const id_detalle_compra = i + 1
    const quantity = 50
    const price = productos[id_producto - 1].precio_compra
    const subtotal = quantity * price
    const iva = i % 5 === 0 ? 35000 : 0
    const descuento = i % 5 === 0 ? 10000 : i % 5 === 1 ? 5000 : 0
    compras.push({ id_compra, id_proveedor: (i % 3) + 1, id_usuario: 1, fecha_compra: stampInRange(i, 20, 6), iva, descuento, total_compra: subtotal - descuento + iva, observaciones: null, estado: true })
    detalle_compra.push({ id_detalle_compra, id_compra, id_producto, cantidad: quantity, unidad_medida: 'kg', precio_unitario: price })
    const expiryDays = i === 0 ? 1 : i === 1 ? 2 : i === 2 ? -1 : 3 + (i % 6)
    lotes.push({
      id_lote: i + 1, id_detalle_compra, numero_lote: `L-${String(i + 1).padStart(3, '0')}`,
      fecha_ingreso: dateOffset(-6 + Math.round(i * 6 / 19)),
      fecha_vencimiento: dateOffset(expiryDays),
      tipo_empaque: ['Bulto', 'Caja', 'Bolsa'][i % 3] as AppState['lotes'][number]['tipo_empaque'],
      cantidad_disponible: quantity, zona_ubicacion: `Zona ${String.fromCharCode(65 + (i % 3))}`,
      es_transformable: true, estado: true,
    })
  }
  const produccion: AppState['produccion'] = []
  const detalle_produccion: AppState['detalle_produccion'] = []
  for (let i = 0; i < 10; i++) {
    const id_produccion = i + 1
    const id_lote = i + 4
    const sourceProductId = detalle_compra[id_lote - 1].id_producto
    const sourceProduct = productos[sourceProductId - 1]
    const processed = 5
    const obtained = 4.2
    produccion.push({ id_produccion, id_usuario: 3, id_lote, fecha_produccion: stampInRange(i, 10, 4), cantidad_procesada: processed, merma: processed - obtained, observaciones: null, unidad_medida: 'kg' })
    const outputProductId = 4 + sourceProduct.id_categoria
    detalle_produccion.push({ id_detalle_produccion: i + 1, id_produccion, id_producto: outputProductId, cantidad_obtenida: obtained, unidad_medida: 'kg' })
    lotes[id_lote - 1].cantidad_disponible -= processed
    productos[outputProductId - 1].stock_disponible += obtained
  }
  for (const product of productos.slice(0, 4)) {
    product.stock_disponible = lotes
      .filter(lot => detalle_compra[lot.id_detalle_compra - 1].id_producto === product.id_producto)
      .reduce((sum, lot) => sum + lot.cantidad_disponible, 0)
  }
  const ventas: AppState['ventas'] = []
  const detalle_venta: AppState['detalle_venta'] = []
  const pagos_venta: AppState['pagos_venta'] = []
  const methods: MetodoPago[] = ['Efectivo', 'Transferencia']
  for (let i = 0; i < 30; i++) {
    const id_venta = i + 1
    const productId = (i % 8) + 1
    const product = productos[productId - 1]
    const quantity = 0.5
    let id_lote: number | null = null
    if (product.tipo_producto === 'Fresca') {
      const candidates = lotes.filter(l => l.estado && l.fecha_vencimiento >= localDateString() && detalle_compra[l.id_detalle_compra - 1].id_producto === productId && l.cantidad_disponible >= quantity).sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento))
      const lot = candidates[0]
      if (lot) {
        id_lote = lot.id_lote
        lot.cantidad_disponible -= quantity
      }
    }
    product.stock_disponible -= quantity
    const price = product.precio_venta_detal
    const subtotal = quantity * price
    const iva = i % 6 === 0 ? Number((subtotal * 0.19).toFixed(2)) : 0
    const descuento_total = i % 4 === 0 ? 100 : 0
    const total = subtotal - descuento_total + iva
    ventas.push({ id_venta, numero_documento: clientes[i % clientes.length].numero_documento, id_usuario: 2, tipo_venta: i % 2 ? 'Mayorista' : 'Detal', fecha_venta: stampInRange(i, 30, 5), iva, descuento_total, total_pagar: total, estado: true, motivo_anulacion: null })
    detalle_venta.push({ id_detalle_venta: i + 1, id_venta, id_producto: productId, id_lote, cantidad: quantity, unidad_medida: product.unidad_medida, precio_unitario: price })
    if (i % 6 === 0) {
      const cash = Number((total * 0.4).toFixed(2))
      pagos_venta.push({ id_pago_venta: pagos_venta.length + 1, id_venta, metodo_pago: 'Efectivo', monto_recibido: cash })
      pagos_venta.push({ id_pago_venta: pagos_venta.length + 1, id_venta, metodo_pago: 'Transferencia', monto_recibido: total - cash })
    } else {
      pagos_venta.push({ id_pago_venta: pagos_venta.length + 1, id_venta, metodo_pago: methods[i % methods.length], monto_recibido: total })
    }
  }
  const state: AppState = {
    categorias, clientes, compras, detalle_compra, detalle_produccion, detalle_venta, lotes,
    pagos_venta, permisos, privilegios, produccion, productos, proveedores, roles, roles_x_permisos,
    usuarios, ventas, nextIds: emptyIds(),
  }
  for (const table of tables) {
    const keyByTable: Record<TableName, string> = {
      categorias: 'id_categoria', clientes: 'numero_documento', compras: 'id_compra',
      detalle_compra: 'id_detalle_compra', detalle_produccion: 'id_detalle_produccion',
      detalle_venta: 'id_detalle_venta', lotes: 'id_lote', pagos_venta: 'id_pago_venta',
      permisos: 'id_permiso', privilegios: 'id_privilegio', produccion: 'id_produccion',
      productos: 'id_producto', proveedores: 'id_proveedor', roles: 'id_rol',
      roles_x_permisos: 'id_rol', usuarios: 'id_usuario', ventas: 'id_venta',
    }
    const rows = state[table] as unknown as Record<string, unknown>[]
    const numericIds = rows.map(row => row[keyByTable[table]]).filter((id): id is number => typeof id === 'number')
    state.nextIds[table] = numericIds.length ? Math.max(...numericIds) + 1 : 1
  }
  checkInvariants(state)
  return state
}
