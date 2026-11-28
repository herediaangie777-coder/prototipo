export type Id = number
export type MetodoPago = 'Efectivo' | 'Transferencia'
export type TipoDocumento = 'CC' | 'CE' | 'NIT' | 'PAS'
export type TipoEmpaque = 'Bulto' | 'Caja' | 'Bolsa'
export type TipoProducto = 'Fresca' | 'Congelada'
export type EstadoProduccion = 'En proceso' | 'Finalizada' | 'Anulada'
export type TipoVenta = 'Detal' | 'Mayorista'
export type TableName =
  | 'categorias' | 'clientes' | 'compras' | 'departamentos' | 'detalle_compra'
  | 'detalle_produccion' | 'detalle_venta' | 'lotes' | 'municipios' | 'pagos_venta'
  | 'permisos' | 'permisos_privilegios' | 'privilegios' | 'produccion' | 'productos'
  | 'proveedores' | 'roles' | 'roles_x_permisos' | 'ubicaciones' | 'usuarios' | 'ventas'

export interface Categoria { id_categoria: number; nombre_categoria: string; estado: boolean }
export interface Departamento { id_departamento: number; nombre_departamento: string }
export interface Municipio { id_municipio: number; id_departamento: number; nombre_municipio: string }
export interface Ubicacion { id_ubicacion: number; nombre_ubicacion: string; estado: boolean }
export interface Cliente {
  numero_documento: string
  tipo_documento: TipoDocumento
  nombre_cliente: string
  contrasenia?: string | null
  telefono: string | null
  correo: string | null
  direccion: string | null
  estado: boolean
  id_municipio: number | null
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
  unidad_medida: 'kg'
  precio_unitario: number
}
export interface DetalleProduccion {
  id_detalle_produccion: number
  id_produccion: number
  id_producto: number
  cantidad_obtenida: number
  unidad_medida: 'bolsa'
}
export interface DetalleVenta {
  id_detalle_venta: number
  id_venta: number
  id_producto: number
  id_lote: number
  cantidad: number
  unidad_medida: 'kg' | 'bolsa'
  precio_unitario: number
}
export interface Lote {
  id_lote: number
  id_producto?: number
  id_detalle_compra: number | null
  id_detalle_produccion: number | null
  numero_lote: string
  fecha_ingreso: string
  fecha_vencimiento: string
  tipo_empaque: TipoEmpaque
  cantidad_disponible: number
  id_ubicacion: number
  es_transformable: boolean
  estado: boolean
}
export interface PagoVenta {
  id_pago_venta: number
  id_venta: number
  metodo_pago: MetodoPago
  monto_recibido: number
  referencia: string | null
}
export interface Permiso { id_permiso: number; nombre_permiso: string }
export interface Privilegio { id_privilegio: number; nombre_privilegio: string }
export interface PermisoPrivilegio { id_permiso: number; id_privilegio: number }
export interface Produccion {
  id_produccion: number
  id_usuario: number
  id_lote_origen: number
  id_producto_resultado?: number
  fecha_produccion: string
  cantidad_a_procesar: number
  cantidad_estimada_congelada?: number
  merma_estimada?: number
  merma: number | null
  estado: EstadoProduccion
  fecha_finalizacion: string | null
  observaciones: string | null
}
export interface Producto {
  id_producto: number
  id_categoria: number
  imagen_url?: string | null
  tipo_producto: TipoProducto
  presentacion: string
  unidad_medida: 'kg' | 'bolsa'
  peso_unidad_kg: number | null
  precio_compra: number
  precio_venta_detal: number
  precio_venta_mayorista: number
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
  id_municipio: number | null
}
export interface Rol { id_rol: number; nombre_rol: string; estado: boolean }
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
  motivo_anulacion: string | null
}
export interface AppState {
  categorias: Categoria[]
  clientes: Cliente[]
  compras: Compra[]
  departamentos: Departamento[]
  detalle_compra: DetalleCompra[]
  detalle_produccion: DetalleProduccion[]
  detalle_venta: DetalleVenta[]
  lotes: Lote[]
  municipios: Municipio[]
  pagos_venta: PagoVenta[]
  permisos: Permiso[]
  permisos_privilegios: PermisoPrivilegio[]
  privilegios: Privilegio[]
  produccion: Produccion[]
  productos: Producto[]
  proveedores: Proveedor[]
  roles: Rol[]
  roles_x_permisos: RolPermiso[]
  ubicaciones: Ubicacion[]
  usuarios: Usuario[]
  ventas: Venta[]
  nextIds: Record<TableName, number>
}
