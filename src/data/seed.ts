import type { AppState, MetodoPago, TableName } from './types'
import { checkInvariants } from './invariants'
import { localDateString, localTimestampString } from './dates'
import { moduleActions } from './moduleActions'

const tables: TableName[] = [
  'categorias', 'clientes', 'compras', 'departamentos', 'detalle_compra', 'detalle_produccion',
  'detalle_venta', 'lotes', 'municipios', 'pagos_venta', 'permisos', 'permisos_privilegios',
  'privilegios', 'produccion', 'productos', 'proveedores', 'roles', 'roles_x_permisos',
  'ubicaciones', 'usuarios', 'ventas',
]
function offsetDate(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return localDateString(date)
}
function orderedStamp(index: number, count: number, startDaysAgo: number, endDaysAgo = 0) {
  const date = new Date()
  date.setDate(date.getDate() - startDaysAgo)
  date.setHours(8, 0, 0, 0)
  if (count > 1) date.setTime(date.getTime() + (startDaysAgo - endDaysAgo) * 24 * 60 * 60 * 1000 * index / (count - 1))
  return localTimestampString(date)
}
const emptyIds = () => Object.fromEntries(tables.map(table => [table, 1])) as Record<TableName, number>

const moduleNames = ['Dashboard', 'Roles y permisos', 'Usuarios', 'Categorías', 'Productos', 'Proveedores', 'Compras', 'Producción', 'Clientes', 'Ventas']
const actionNames = ['Consultar', 'Filtrar', 'Registrar', 'Ver detalle', 'Editar', 'Cambiar estado', 'Anular', 'Eliminar', 'Exportar', 'Asociar lote', 'Congelar']
export function createDemoSeed(): AppState {
  const categorias = ['Calibre 1', 'Calibre 2', 'Calibre 3', 'Jumbo'].map((nombre_categoria, index) => ({
    id_categoria: index + 1, nombre_categoria, estado: true,
  }))
  const productos = Array.from({ length: 8 }, (_, index) => ({
    id_producto: index + 1,
    id_categoria: (index % 4) + 1,
    tipo_producto: (index < 4 ? 'Fresca' : 'Congelada') as 'Fresca' | 'Congelada',
    presentacion: index < 4 ? 'Granel' : 'Bolsa',
    unidad_medida: (index < 4 ? 'kg' : 'bolsa') as 'kg' | 'bolsa',
    peso_unidad_kg: index < 4 ? null : 1,
    precio_compra: [7000, 6500, 6000, 8000, 9500, 9000, 8500, 10500][index],
    precio_venta_detal: [12000, 11000, 10000, 14000, 15000, 14000, 13000, 17000][index],
    precio_venta_mayorista: [10500, 9500, 8500, 12000, 13000, 12000, 11500, 15000][index],
    stock_minimo: 8, estado: true,
  }))
  const departamentos = [
    { id_departamento: 1, nombre_departamento: 'Antioquia' },
    { id_departamento: 2, nombre_departamento: 'Cundinamarca' },
  ]
  const municipios = [
    { id_municipio: 1, id_departamento: 1, nombre_municipio: 'Medellín' },
    { id_municipio: 2, id_departamento: 1, nombre_municipio: 'Marinilla' },
    { id_municipio: 3, id_departamento: 1, nombre_municipio: 'San Vicente' },
    { id_municipio: 4, id_departamento: 1, nombre_municipio: 'La Ceja' },
    { id_municipio: 5, id_departamento: 2, nombre_municipio: 'Bogotá' },
  ]
  const ubicaciones = [
    { id_ubicacion: 315, nombre_ubicacion: 'Módulo 315', estado: true },
    { id_ubicacion: 366, nombre_ubicacion: 'Módulo 366', estado: true },
  ]
  const proveedores = [
    { nombre_proveedor: 'Fresas del Oriente', telefono: '3111111111', correo: 'oriente@mail.co', direccion: 'Vereda La Cruz', id_municipio: 2 },
    { nombre_proveedor: 'Agro San Vicente', telefono: '3122222222', correo: 'sanvic@mail.co', direccion: 'Finca El Mirador', id_municipio: 3 },
    { nombre_proveedor: 'Cultivos La Ceja', telefono: '3133333333', correo: 'laceja@mail.co', direccion: 'Km 5 Vía La Ceja', id_municipio: 4 },
  ].map((row, index) => ({ id_proveedor: index + 1, ...row, estado: true }))
  const clientes: AppState['clientes'] = [
    { numero_documento: '222222222222', tipo_documento: 'CC', nombre_cliente: 'Cliente General / Final', telefono: null, correo: null, direccion: null, estado: true, id_municipio: null },
    { numero_documento: '1017123456', tipo_documento: 'CC', nombre_cliente: 'Juan Pérez', telefono: '3101234567', correo: 'juan@mail.com', direccion: 'Calle 10 20-30', estado: true, id_municipio: 1 },
    { numero_documento: '900123456', tipo_documento: 'NIT', nombre_cliente: 'Frutería La Cosecha SAS', telefono: '6044445566', correo: 'compras@cosecha.com', direccion: 'Carrera 50 40-10', estado: true, id_municipio: 1 },
    { numero_documento: '43567890', tipo_documento: 'CC', nombre_cliente: 'María Torres', telefono: '3157654321', correo: 'maria@mail.com', direccion: 'Calle 30 45-12', estado: true, id_municipio: 1 },
    { numero_documento: '1020456789', tipo_documento: 'CC', nombre_cliente: 'Andrés Mejía', telefono: '3209876543', correo: 'andres@mail.com', direccion: 'Transversal 78 65-20', estado: true, id_municipio: 1 },
    { numero_documento: '901234567', tipo_documento: 'NIT', nombre_cliente: 'Restaurante El Fresal', telefono: '6047778899', correo: 'info@elfresal.com', direccion: 'Circular 4 70-15', estado: true, id_municipio: 1 },
  ]
  const roles = [
    { id_rol: 1, nombre_rol: 'Super Administrador', estado: true },
    { id_rol: 2, nombre_rol: 'Vendedor', estado: true },
    { id_rol: 3, nombre_rol: 'Operario', estado: true },
  ]
  const permisos = moduleNames.map((nombre_permiso, index) => ({ id_permiso: index + 1, nombre_permiso }))
  const privilegios = actionNames.map((nombre_privilegio, index) => ({ id_privilegio: index + 1, nombre_privilegio }))
  const permisos_privilegios = permisos.flatMap(permission => moduleActions[permission.nombre_permiso as keyof typeof moduleActions].map(name => ({
    id_permiso: permission.id_permiso,
    id_privilegio: privilegios.find(row => row.nombre_privilegio === name)!.id_privilegio,
  })))
  const roles_x_permisos: AppState['roles_x_permisos'] = []
  for (const pair of permisos_privilegios) roles_x_permisos.push({ id_rol: 1, ...pair })
  const roleAssignments: Record<number, string[]> = {
    2: ['Productos:Consultar', 'Productos:Filtrar', 'Clientes:Consultar', 'Clientes:Filtrar', 'Clientes:Registrar', 'Clientes:Ver detalle', 'Clientes:Editar',
      'Ventas:Consultar', 'Ventas:Filtrar', 'Ventas:Registrar', 'Ventas:Ver detalle', 'Ventas:Anular', 'Ventas:Exportar'],
    3: ['Productos:Consultar', 'Productos:Filtrar', 'Proveedores:Consultar', 'Proveedores:Filtrar',
      'Compras:Consultar', 'Compras:Filtrar', 'Compras:Ver detalle', 'Producción:Consultar', 'Producción:Filtrar',
      'Producción:Registrar', 'Producción:Ver detalle', 'Producción:Editar', 'Producción:Anular', 'Producción:Congelar'],
  }
  for (const [roleIdText, pairs] of Object.entries(roleAssignments)) {
    for (const pair of pairs) {
      const [module, action] = pair.split(':')
      const permission = permisos.find(row => row.nombre_permiso === module)!
      const privilege = privilegios.find(row => row.nombre_privilegio === action)!
      if (permisos_privilegios.some(valid => valid.id_permiso === permission.id_permiso && valid.id_privilegio === privilege.id_privilegio)) {
        roles_x_permisos.push({ id_rol: Number(roleIdText), id_permiso: permission.id_permiso, id_privilegio: privilege.id_privilegio })
      }
    }
  }
  const usuarios = [
    { id_usuario: 1, id_rol: 1, nombre: 'Laura', apellido: 'Gómez', correo: 'admin@fresas.co', telefono: '3001112233', contrasenia: 'Admin123*', estado: true },
    { id_usuario: 2, id_rol: 2, nombre: 'Carlos', apellido: 'Ríos', correo: 'ventas@fresas.co', telefono: '3002223344', contrasenia: 'Ventas123*', estado: true },
    { id_usuario: 3, id_rol: 3, nombre: 'Marta', apellido: 'Londoño', correo: 'operario@fresas.co', telefono: '3003334455', contrasenia: 'Operario123*', estado: true },
  ]

  const compras: AppState['compras'] = []
  const detalle_compra: AppState['detalle_compra'] = []
  const lotes: AppState['lotes'] = []
  for (let index = 0; index < 20; index++) {
    const id = index + 1
    const productId = (index % 4) + 1
    const quantity = 50
    const price = productos[productId - 1].precio_compra
    const iva = index % 5 === 0 ? 35000 : 0
    const descuento = index % 5 === 0 ? 10000 : index % 5 === 1 ? 5000 : 0
    compras.push({
      id_compra: id, id_proveedor: (index % 3) + 1, id_usuario: 1,
      fecha_compra: orderedStamp(index, 20, 14, 10), iva, descuento,
      total_compra: quantity * price - descuento + iva, observaciones: null, estado: true,
    })
    detalle_compra.push({
      id_detalle_compra: id, id_compra: id, id_producto: productId,
      cantidad: quantity, unidad_medida: 'kg', precio_unitario: price,
    })
    const expiry = index === 0 ? 1 : index === 1 ? 2 : index === 2 ? -1 : 30 + index
    lotes.push({
      id_lote: id, id_detalle_compra: id, id_detalle_produccion: null,
      numero_lote: `L-${String(id).padStart(3, '0')}`,
      fecha_ingreso: localDateString(new Date(compras[index].fecha_compra)),
      fecha_vencimiento: offsetDate(expiry), tipo_empaque: ['Bulto', 'Caja', 'Bolsa'][index % 3] as 'Bulto' | 'Caja' | 'Bolsa',
      cantidad_disponible: quantity, id_ubicacion: index % 2 === 0 ? 315 : 366,
      es_transformable: true, estado: true,
    })
  }

  const produccion: AppState['produccion'] = []
  const detalle_produccion: AppState['detalle_produccion'] = []
  for (let index = 0; index < 10; index++) {
    const id = index + 1
    const sourceLot = lotes[index + 3]
    const quantity = index < 8 ? 5 : 2
    sourceLot.cantidad_disponible -= quantity
    const status = index < 8 ? 'Finalizada' : index === 8 ? 'En proceso' : 'Anulada'
    produccion.push({
      id_produccion: id, id_usuario: 3, id_lote_origen: sourceLot.id_lote,
      fecha_produccion: orderedStamp(index, 10, 9, 6), cantidad_a_procesar: quantity,
      merma: status === 'Finalizada' ? 1 : null, estado: status,
      fecha_finalizacion: status === 'Finalizada' ? orderedStamp(index, 10, 9, 6) : null,
      observaciones: null,
    })
    if (status === 'Finalizada') {
      const sourceProduct = productos[detalle_compra[sourceLot.id_detalle_compra! - 1].id_producto - 1]
      const outputProductId = 4 + sourceProduct.id_categoria
      const detailId = index + 1
      detalle_produccion.push({
        id_detalle_produccion: detailId, id_produccion: id,
        id_producto: outputProductId, cantidad_obtenida: 4, unidad_medida: 'bolsa',
      })
      lotes.push({
        id_lote: lotes.length + 1, id_detalle_compra: null, id_detalle_produccion: detailId,
        numero_lote: `P-${String(id).padStart(4, '0')}`,
        fecha_ingreso: localDateString(new Date(produccion[index].fecha_finalizacion!)),
        fecha_vencimiento: offsetDate(180), tipo_empaque: 'Bolsa',
        cantidad_disponible: 4, id_ubicacion: index % 2 === 0 ? 315 : 366,
        es_transformable: false, estado: true,
      })
    } else if (status === 'Anulada') {
      sourceLot.cantidad_disponible += quantity
    }
  }

  const ventas: AppState['ventas'] = []
  const detalle_venta: AppState['detalle_venta'] = []
  const pagos_venta: AppState['pagos_venta'] = []
  const methods: MetodoPago[] = ['Efectivo', 'Transferencia']
  for (let index = 0; index < 30; index++) {
    const id = index + 1
    const isFresh = index % 2 === 0
    const productId = isFresh ? (Math.floor(index / 2) % 4) + 1 : 5 + (Math.floor(index / 2) % 4)
    const product = productos[productId - 1]
    const quantity = isFresh ? 0.5 : 1
    const voided = index >= 28
    const candidates = lotes.filter(lot => {
      if (!lot.estado || lot.fecha_vencimiento < localDateString() || lot.cantidad_disponible < quantity) return false
      const detail = lot.id_detalle_compra !== null
        ? detalle_compra.find(row => row.id_detalle_compra === lot.id_detalle_compra)
        : detalle_produccion.find(row => row.id_detalle_produccion === lot.id_detalle_produccion)
      return detail?.id_producto === productId
    }).sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento) || a.id_lote - b.id_lote)
    const lot = candidates[0]
    if (!lot) throw new Error(`No hay stock seed para la venta demo de producto ${productId}.`)
    if (!voided) {
      lot.cantidad_disponible -= quantity
      if (lot.cantidad_disponible === 0) lot.estado = false
    }
    const price = index % 2 ? product.precio_venta_mayorista : product.precio_venta_detal
    const subtotal = quantity * price
    const iva = index % 6 === 0 ? Number((subtotal * 0.19).toFixed(2)) : 0
    const descuento = index % 4 === 0 ? 100 : 0
    const total = subtotal + iva - descuento
    ventas.push({
      id_venta: id, numero_documento: clientes[index % clientes.length].numero_documento,
      id_usuario: 2, tipo_venta: index % 2 ? 'Mayorista' : 'Detal',
      fecha_venta: orderedStamp(index, 30, 5, 0), iva, descuento_total: descuento,
      total_pagar: total, estado: !voided, motivo_anulacion: voided ? `Anulación demo ${id}` : null,
    })
    detalle_venta.push({
      id_detalle_venta: id, id_venta: id, id_producto: productId, id_lote: lot.id_lote,
      cantidad: quantity, unidad_medida: product.unidad_medida, precio_unitario: price,
    })
    if (index % 6 === 0) {
      const cash = Number((total * 0.4).toFixed(2))
      pagos_venta.push({ id_pago_venta: pagos_venta.length + 1, id_venta: id, metodo_pago: 'Efectivo', monto_recibido: cash, referencia: null })
      pagos_venta.push({ id_pago_venta: pagos_venta.length + 1, id_venta: id, metodo_pago: 'Transferencia', monto_recibido: total - cash, referencia: `TR-${id}`, })
    } else {
      pagos_venta.push({ id_pago_venta: pagos_venta.length + 1, id_venta: id, metodo_pago: methods[index % 2], monto_recibido: total, referencia: null })
    }
  }

  const state: AppState = {
    categorias, clientes, compras, departamentos, detalle_compra, detalle_produccion, detalle_venta,
    lotes, municipios, pagos_venta, permisos, permisos_privilegios, privilegios, produccion,
    productos, proveedores, roles, roles_x_permisos, ubicaciones, usuarios, ventas, nextIds: emptyIds(),
  }
  const keys: Record<TableName, string> = {
    categorias: 'id_categoria', clientes: 'numero_documento', compras: 'id_compra', departamentos: 'id_departamento',
    detalle_compra: 'id_detalle_compra', detalle_produccion: 'id_detalle_produccion', detalle_venta: 'id_detalle_venta',
    lotes: 'id_lote', municipios: 'id_municipio', pagos_venta: 'id_pago_venta', permisos: 'id_permiso',
    permisos_privilegios: 'id_permiso', privilegios: 'id_privilegio', produccion: 'id_produccion',
    productos: 'id_producto', proveedores: 'id_proveedor', roles: 'id_rol', roles_x_permisos: 'id_rol',
    ubicaciones: 'id_ubicacion', usuarios: 'id_usuario', ventas: 'id_venta',
  }
  for (const table of tables) {
    if (table === 'permisos_privilegios' || table === 'roles_x_permisos') continue
    const rows = state[table] as unknown as Record<string, unknown>[]
    const values = rows.map(row => row[keys[table]]).filter((value): value is number => typeof value === 'number')
    state.nextIds[table] = values.length ? Math.max(...values) + 1 : 1
  }
  checkInvariants(state)
  return state
}
