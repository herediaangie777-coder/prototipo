export type Id = number
export type MetodoPago = 'Efectivo' | 'Transferencia'
export type TipoDocumento = 'CC' | 'CE' | 'NIT' | 'PAS'
export type TipoEmpaque = 'Bulto' | 'Caja' | 'Bolsa'
export type TipoProducto = 'Fresca' | 'Congelada'
export type TipoVenta = 'Detal' | 'Mayorista'
export type TableName =
  | 'categorias' | 'clientes' | 'compras' | 'detalle_compra'
  | 'detalle_produccion' | 'detalle_venta' | 'lotes' | 'pagos_venta'
  | 'permisos' | 'privilegios' | 'produccion' | 'productos'
  | 'proveedores' | 'roles' | 'roles_x_permisos' | 'usuarios' | 'ventas'

export interface Categoria {
  id_categoria: number
  nombre_categoria: string
  estado: boolean // PENDIENTE EN BD
}
export interface Cliente {
  numero_documento: string
  tipo_documento: TipoDocumento
  nombre_cliente: string
  telefono: string | null
  correo: string | null
  direccion: string | null
  estado: boolean
  departamento: string | null
  municipio: string | null
}
export interface Compra {
  id_compra: number
  id_proveedor: number
  id_usuario: number
  fecha_compra: string
  iva: number
  descuento: number
  total_compra: number
  observaciones: string | null
  estado: boolean
}
export interface DetalleCompra {
  id_detalle_compra: number
  id_compra: number
  id_producto: number
  cantidad: number
  unidad_medida: string
  precio_unitario: number
}
export interface DetalleProduccion {
  id_detalle_produccion: number
  id_produccion: number
  id_producto: number
  cantidad_obtenida: number
  unidad_medida: string | null
}
export interface DetalleVenta {
  id_detalle_venta: number
  id_venta: number
  id_producto: number
  id_lote: number | null
  cantidad: number
  unidad_medida: string
  precio_unitario: number
}
export interface Lote {
  id_lote: number
  id_detalle_compra: number
  numero_lote: string
  fecha_ingreso: string
  fecha_vencimiento: string
  tipo_empaque: TipoEmpaque
  cantidad_disponible: number
  zona_ubicacion: string | null
  es_transformable: boolean
  estado: boolean
}
export interface PagoVenta {
  id_pago_venta: number
  id_venta: number
  metodo_pago: MetodoPago
  monto_recibido: number
}
export interface Permiso { id_permiso: number; nombre_permiso: string }
export interface Privilegio { id_privilegio: number; nombre_privilegio: string }
export interface Produccion {
  id_produccion: number
  id_usuario: number
  id_lote: number
  fecha_produccion: string
  cantidad_procesada: number
  merma: number
  observaciones: string | null
  unidad_medida: string | null
}
export interface Producto {
  id_producto: number
  id_categoria: number
  tipo_producto: TipoProducto
  presentacion: string
  unidad_medida: string
  precio_compra: number
  precio_venta_detal: number
  precio_venta_mayorista: number
  stock_inicial: number
  stock_disponible: number
  stock_minimo: number
  estado: boolean
}
export interface Proveedor {
  id_proveedor: number
  nombre_proveedor: string
  telefono: string | null
  correo: string | null
  direccion: string | null
  estado: boolean
  municipio: string | null
  departamento: string | null
}
export interface Rol {
  id_rol: number
  nombre_rol: string
  estado: boolean // PENDIENTE EN BD
}
export interface RolPermiso { id_rol: number; id_permiso: number; id_privilegio: number }
export interface Usuario {
  id_usuario: number
  id_rol: number
  nombre: string
  apellido: string
  correo: string
  telefono: string | null
  contrasenia: string
  estado: boolean
}
export interface Venta {
  id_venta: number
  numero_documento: string
  id_usuario: number
  tipo_venta: TipoVenta
  fecha_venta: string
  iva: number
  descuento_total: number
  total_pagar: number
  estado: boolean
  motivo_anulacion: string | null // PENDIENTE EN BD
}

export interface AppState {
  categorias: Categoria[]
  clientes: Cliente[]
  compras: Compra[]
  detalle_compra: DetalleCompra[]
  detalle_produccion: DetalleProduccion[]
  detalle_venta: DetalleVenta[]
  lotes: Lote[]
  pagos_venta: PagoVenta[]
  permisos: Permiso[]
  privilegios: Privilegio[]
  produccion: Produccion[]
  productos: Producto[]
  proveedores: Proveedor[]
  roles: Rol[]
  roles_x_permisos: RolPermiso[]
  usuarios: Usuario[]
  ventas: Venta[]
  nextIds: Record<TableName, number>
}
