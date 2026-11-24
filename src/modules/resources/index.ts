import type { ReactNode } from 'react'
import { api } from '@/data/services/api'

export type Row = Record<string, unknown>

export type FieldType =
  | 'text'
  | 'number'
  | 'date'
  | 'datetime'
  | 'switch'
  | 'password'
  | 'select'
  | 'email'

export interface SelectOption {
  value: string | number
  label: string
}

export interface FieldConfig {
  key: string
  label: string
  type: FieldType
  required?: boolean
  maxLength?: number
  options?: SelectOption[]
  fkEndpoint?: string
  fkLabelKey?: string
  fkValueKey?: string
  placeholder?: string
  min?: number
  max?: number
  step?: number
  defaultValue?: string | number | boolean
  hiddenOnEdit?: boolean
  hiddenOnCreate?: boolean
  uiOnly?: boolean
  dependsOn?: string
  filterKey?: string
  sendNullIfEmpty?: boolean
}

export interface ColumnConfig {
  key: string
  label: string
  type?: 'text' | 'number' | 'currency' | 'date' | 'datetime' | 'boolean' | 'badge'
  formatter?: (value: unknown, row: Row) => ReactNode
  width?: string
  fkField?: string
}

export interface DetailFieldConfig {
  key: string
  label: string
  type?: 'text' | 'number' | 'currency' | 'date' | 'datetime' | 'boolean'
  formatter?: (value: unknown, row: Row) => ReactNode
  fkField?: string
}

export interface ResourceConfig {
  key: string
  endpoint: string
  title: string
  singular: string
  columns: ColumnConfig[]
  fields: FieldConfig[]
  detailFields: DetailFieldConfig[]
  defaultSort?: { column: string; direction: 'asc' | 'desc' }
  filterableColumns?: string[]
  subResources?: SubResourceConfig[]
  listEnhancer?: (rows: Row[]) => Promise<Row[]>
  payloadTransform?: (payload: Record<string, unknown>, values: Record<string, unknown>) => Record<string, unknown>
  extraValidate?: (values: Record<string, unknown>) => Record<string, string>
}

export interface SubResourceConfig {
  key: string
  endpoint: string
  title: string
  singular: string
  parentKey: string
  columns: ColumnConfig[]
  fields: FieldConfig[]
  detailFields: DetailFieldConfig[]
  defaultSort?: { column: string; direction: 'asc' | 'desc' }
  customLoad?: (parentId: string | number) => Promise<Row[]>
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const cop = (v: unknown): string =>
  v != null && v !== ''
    ? new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(v))
    : '—'

const boolLabel = (v: unknown): string => (v ? 'Activo' : 'Inactivo')

const idFormatter = (prefix: string) => (v: unknown): string =>
  `${prefix}-${String(v).padStart(4, '0')}`

// ── Resource configs ──────────────────────────────────────────────────────────

export const roleResource: ResourceConfig = {
  key: 'id_rol',
  endpoint: 'roles',
  title: 'Roles y permisos',
  singular: 'rol',
  columns: [
    { key: 'nombre_rol', label: 'Nombre' },
    { key: 'estado', label: 'Estado', type: 'boolean' },
  ],
  fields: [
    { key: 'nombre_rol', label: 'Nombre del rol', type: 'text', required: true, maxLength: 30 },
    { key: 'estado', label: 'Estado', type: 'switch', defaultValue: true },
  ],
  detailFields: [
    { key: 'nombre_rol', label: 'Nombre del rol' },
    { key: 'estado', label: 'Estado', formatter: boolLabel },
  ],
  defaultSort: { column: 'id_rol', direction: 'desc' },
  filterableColumns: ['nombre_rol', 'estado'],
}

export const usuarioResource: ResourceConfig = {
  key: 'id_usuario',
  endpoint: 'usuarios',
  title: 'Usuarios',
  singular: 'usuario',
  columns: [
    { key: 'nombre', label: 'Nombre completo', formatter: (_v, row) => `${row.nombre ?? ''} ${row.apellido ?? ''}`.trim() },
    { key: 'correo', label: 'Correo' },
    { key: 'telefono', label: 'Teléfono' },
    { key: 'id_rol', label: 'Rol', fkField: 'id_rol' },
    { key: 'estado', label: 'Estado', type: 'boolean' },
  ],
  fields: [
    { key: 'nombre', label: 'Nombre', type: 'text', required: true, maxLength: 25 },
    { key: 'apellido', label: 'Apellido', type: 'text', required: true, maxLength: 25 },
    { key: 'correo', label: 'Correo', type: 'email', required: true, maxLength: 40 },
    { key: 'telefono', label: 'Teléfono', type: 'text', maxLength: 15 },
    { key: 'id_rol', label: 'Rol', type: 'select', required: true, fkEndpoint: 'roles', fkLabelKey: 'nombre_rol', fkValueKey: 'id_rol' },
    { key: 'contrasenia', label: 'Contraseña', type: 'password', required: true, maxLength: 255, hiddenOnEdit: true },
    { key: 'estado', label: 'Estado', type: 'switch', defaultValue: true },
  ],
  detailFields: [
    { key: 'nombre', label: 'Nombre' },
    { key: 'apellido', label: 'Apellido' },
    { key: 'correo', label: 'Correo' },
    { key: 'telefono', label: 'Teléfono' },
    { key: 'id_rol', label: 'Rol', fkField: 'id_rol' },
    { key: 'estado', label: 'Estado', formatter: boolLabel },
  ],
  defaultSort: { column: 'id_usuario', direction: 'desc' },
  filterableColumns: ['nombre', 'apellido', 'correo', 'id_rol', 'estado'],
}

export const categoriaResource: ResourceConfig = {
  key: 'id_categoria',
  endpoint: 'categorias',
  title: 'Categorías',
  singular: 'categoría',
  columns: [
    { key: 'nombre_categoria', label: 'Categoría' },
    { key: 'estado', label: 'Estado', type: 'boolean' },
  ],
  fields: [
    { key: 'nombre_categoria', label: 'Nombre', type: 'text', required: true, maxLength: 20 },
    { key: 'estado', label: 'Estado', type: 'switch', defaultValue: true },
  ],
  detailFields: [
    { key: 'nombre_categoria', label: 'Nombre' },
    { key: 'estado', label: 'Estado', formatter: boolLabel },
  ],
  defaultSort: { column: 'id_categoria', direction: 'desc' },
  filterableColumns: ['nombre_categoria', 'estado'],
}

export const productoResource: ResourceConfig = {
  key: 'id_producto',
  endpoint: 'productos',
  title: 'Productos',
  singular: 'producto',
  columns: [
    { key: 'presentacion', label: 'Producto' },
    { key: 'id_categoria', label: 'Categoría', fkField: 'id_categoria' },
    { key: 'tipo_producto', label: 'Tipo' },
    { key: 'unidad_medida', label: 'Unidad' },
    { key: 'precio_venta_detal', label: 'P. Detal', type: 'currency' },
    { key: 'precio_venta_mayorista', label: 'P. Mayorista', type: 'currency' },
    { key: 'stock_vendible', label: 'Stock vendible', type: 'number' },
    { key: 'stock_minimo', label: 'Stock mín.', type: 'number' },
    { key: 'estado', label: 'Estado', type: 'boolean' },
  ],
  fields: [
    { key: 'id_categoria', label: 'Categoría', type: 'select', required: true, fkEndpoint: 'categorias', fkLabelKey: 'nombre_categoria', fkValueKey: 'id_categoria' },
    { key: 'tipo_producto', label: 'Tipo de producto', type: 'select', required: true, options: [{ value: 'Fresca', label: 'Fresca' }, { value: 'Congelada', label: 'Congelada' }] },
    { key: 'presentacion', label: 'Presentación', type: 'text', required: true, maxLength: 40 },
    // unidad_medida is derived from tipo_producto by payloadTransform; shown read-only
    { key: 'peso_unidad_kg', label: 'Peso por bolsa (kg)', type: 'number', min: 0.001, step: 0.001, sendNullIfEmpty: true },
    { key: 'precio_compra', label: 'Precio de compra', type: 'number', required: true, min: 0, step: 0.01 },
    { key: 'precio_venta_detal', label: 'Precio venta detal', type: 'number', required: true, min: 0, step: 0.01 },
    { key: 'precio_venta_mayorista', label: 'Precio venta mayorista', type: 'number', required: true, min: 0, step: 0.01 },
    { key: 'stock_minimo', label: 'Stock mínimo', type: 'number', required: true, min: 0, step: 0.01 },
    { key: 'estado', label: 'Estado', type: 'switch', defaultValue: true },
  ],
  detailFields: [
    { key: 'id_categoria', label: 'Categoría', fkField: 'id_categoria' },
    { key: 'tipo_producto', label: 'Tipo' },
    { key: 'presentacion', label: 'Presentación' },
    { key: 'unidad_medida', label: 'Unidad' },
    { key: 'peso_unidad_kg', label: 'Peso por bolsa (kg)' },
    { key: 'precio_compra', label: 'P. Compra', formatter: cop },
    { key: 'precio_venta_detal', label: 'P. Detal', formatter: cop },
    { key: 'precio_venta_mayorista', label: 'P. Mayorista', formatter: cop },
    { key: 'stock_vendible', label: 'Stock vendible' },
    { key: 'stock_minimo', label: 'Stock mínimo' },
    { key: 'estado', label: 'Estado', formatter: boolLabel },
  ],
  defaultSort: { column: 'id_producto', direction: 'desc' },
  filterableColumns: ['id_categoria', 'tipo_producto', 'estado'],
  extraValidate: (values) => {
    if (String(values.tipo_producto) === 'Congelada') {
      const kg = Number(values.peso_unidad_kg)
      if (!kg || kg <= 0) return { peso_unidad_kg: 'El peso por bolsa es obligatorio para productos Congelados (debe ser > 0).' }
    }
    return {} as Record<string, string>
  },
  // Enforce the DB CHECK constraint: derive unidad_medida and handle peso_unidad_kg
  payloadTransform: (payload, values) => {
    const tipo = String(values.tipo_producto ?? '')
    if (tipo === 'Fresca') {
      payload.unidad_medida = 'kg'
      payload.peso_unidad_kg = null  // must be NULL for Fresca
    } else if (tipo === 'Congelada') {
      payload.unidad_medida = 'bolsa'
      // peso_unidad_kg must be > 0 for Congelada; keep whatever the user entered
      if (!payload.peso_unidad_kg || Number(payload.peso_unidad_kg) <= 0) {
        delete payload.peso_unidad_kg  // let the DB reject with a clear message
      }
    }
    return payload
  },
  listEnhancer: async (rows) => {
    try {
      const stockData = await api.getVStockProducto()
      return rows.map(row => {
        const stock = stockData.find(s => s.id_producto === row.id_producto)
        return { ...row, stock_vendible: stock?.stock_vendible ?? 0, stock_bajo: stock?.stock_bajo ?? false }
      })
    } catch {
      return rows
    }
  },
}

export const proveedorResource: ResourceConfig = {
  key: 'id_proveedor',
  endpoint: 'proveedores',
  title: 'Proveedores',
  singular: 'proveedor',
  columns: [
    { key: 'nombre_proveedor', label: 'Nombre' },
    { key: 'telefono', label: 'Teléfono' },
    { key: 'correo', label: 'Correo' },
    { key: 'direccion', label: 'Dirección' },
    { key: 'id_municipio', label: 'Municipio', fkField: 'id_municipio' },
    { key: 'estado', label: 'Estado', type: 'boolean' },
  ],
  fields: [
    { key: 'nombre_proveedor', label: 'Nombre', type: 'text', required: true, maxLength: 50 },
    { key: 'telefono', label: 'Teléfono', type: 'text', maxLength: 15 },
    { key: 'correo', label: 'Correo', type: 'email', maxLength: 30 },
    { key: 'direccion', label: 'Dirección', type: 'text', maxLength: 40 },
    { key: 'id_departamento', label: 'Departamento', type: 'select', fkEndpoint: 'departamentos', fkLabelKey: 'nombre_departamento', fkValueKey: 'id_departamento', uiOnly: true },
    { key: 'id_municipio', label: 'Municipio', type: 'select', fkEndpoint: 'municipios', fkLabelKey: 'nombre_municipio', fkValueKey: 'id_municipio', dependsOn: 'id_departamento', filterKey: 'id_departamento' },
    { key: 'estado', label: 'Estado', type: 'switch', defaultValue: true },
  ],
  detailFields: [
    { key: 'nombre_proveedor', label: 'Nombre' },
    { key: 'telefono', label: 'Teléfono' },
    { key: 'correo', label: 'Correo' },
    { key: 'direccion', label: 'Dirección' },
    { key: 'id_municipio', label: 'Municipio', fkField: 'id_municipio' },
    { key: 'estado', label: 'Estado', formatter: boolLabel },
  ],
  defaultSort: { column: 'id_proveedor', direction: 'desc' },
  filterableColumns: ['nombre_proveedor', 'id_municipio', 'estado'],
}

export const clienteResource: ResourceConfig = {
  key: 'numero_documento',
  endpoint: 'clientes',
  title: 'Clientes',
  singular: 'cliente',
  columns: [
    { key: 'tipo_documento', label: 'Tipo doc.' },
    { key: 'numero_documento', label: 'N° documento' },
    { key: 'nombre_cliente', label: 'Nombre' },
    { key: 'telefono', label: 'Teléfono' },
    { key: 'direccion', label: 'Dirección' },
    { key: 'id_municipio', label: 'Municipio', fkField: 'id_municipio' },
    { key: 'estado', label: 'Estado', type: 'boolean' },
  ],
  fields: [
    { key: 'tipo_documento', label: 'Tipo de documento', type: 'select', required: true, options: [{ value: 'CC', label: 'CC' }, { value: 'CE', label: 'CE' }, { value: 'NIT', label: 'NIT' }, { value: 'PAS', label: 'PAS' }] },
    { key: 'numero_documento', label: 'Número de documento', type: 'text', required: true, maxLength: 15 },
    { key: 'nombre_cliente', label: 'Nombre / razón social', type: 'text', required: true, maxLength: 100 },
    { key: 'telefono', label: 'Teléfono', type: 'text', maxLength: 15 },
    { key: 'correo', label: 'Correo', type: 'email', maxLength: 100 },
    { key: 'direccion', label: 'Dirección', type: 'text', maxLength: 120 },
    { key: 'id_departamento', label: 'Departamento', type: 'select', fkEndpoint: 'departamentos', fkLabelKey: 'nombre_departamento', fkValueKey: 'id_departamento', uiOnly: true },
    { key: 'id_municipio', label: 'Municipio', type: 'select', fkEndpoint: 'municipios', fkLabelKey: 'nombre_municipio', fkValueKey: 'id_municipio', dependsOn: 'id_departamento', filterKey: 'id_departamento' },
    { key: 'estado', label: 'Estado', type: 'switch', defaultValue: true },
  ],
  detailFields: [
    { key: 'tipo_documento', label: 'Tipo de documento' },
    { key: 'numero_documento', label: 'Número documento' },
    { key: 'nombre_cliente', label: 'Nombre' },
    { key: 'telefono', label: 'Teléfono' },
    { key: 'correo', label: 'Correo' },
    { key: 'direccion', label: 'Dirección' },
    { key: 'id_municipio', label: 'Municipio', fkField: 'id_municipio' },
    { key: 'estado', label: 'Estado', formatter: boolLabel },
  ],
  defaultSort: { column: 'numero_documento', direction: 'desc' },
  filterableColumns: ['tipo_documento', 'numero_documento', 'nombre_cliente', 'id_municipio', 'estado'],
}

export const compraResource: ResourceConfig = {
  key: 'id_compra',
  endpoint: 'compras',
  title: 'Compras',
  singular: 'compra',
  columns: [
    { key: 'id_compra', label: 'N°', formatter: idFormatter('C') },
    { key: 'id_proveedor', label: 'Proveedor', fkField: 'id_proveedor' },
    { key: 'id_usuario', label: 'Usuario', fkField: 'id_usuario' },
    { key: 'fecha_compra', label: 'Fecha', type: 'datetime' },
    { key: 'total_compra', label: 'Total', type: 'currency' },
    { key: 'estado', label: 'Estado', type: 'boolean' },
  ],
  fields: [
    { key: 'id_proveedor', label: 'Proveedor', type: 'select', required: true, fkEndpoint: 'proveedores', fkLabelKey: 'nombre_proveedor', fkValueKey: 'id_proveedor' },
    { key: 'id_usuario', label: 'Usuario', type: 'select', required: true, fkEndpoint: 'usuarios', fkLabelKey: 'correo', fkValueKey: 'id_usuario' },
    { key: 'fecha_compra', label: 'Fecha de compra', type: 'datetime' },
    { key: 'iva', label: 'IVA', type: 'number', required: true, min: 0, step: 0.01, defaultValue: 0 },
    { key: 'descuento', label: 'Descuento', type: 'number', required: true, min: 0, step: 0.01, defaultValue: 0 },
    { key: 'total_compra', label: 'Total', type: 'number', required: true, min: 0, step: 0.01, defaultValue: 0 },
    { key: 'observaciones', label: 'Observaciones', type: 'text', maxLength: 200 },
    { key: 'estado', label: 'Estado', type: 'switch', defaultValue: true },
  ],
  detailFields: [
    { key: 'id_proveedor', label: 'Proveedor', fkField: 'id_proveedor' },
    { key: 'id_usuario', label: 'Usuario', fkField: 'id_usuario' },
    { key: 'fecha_compra', label: 'Fecha', type: 'datetime' },
    { key: 'iva', label: 'IVA', formatter: cop },
    { key: 'descuento', label: 'Descuento', formatter: cop },
    { key: 'total_compra', label: 'Total', formatter: cop },
    { key: 'observaciones', label: 'Observaciones' },
    { key: 'estado', label: 'Estado', formatter: boolLabel },
  ],
  defaultSort: { column: 'id_compra', direction: 'desc' },
  filterableColumns: ['id_proveedor', 'estado'],
  subResources: [
    {
      key: 'id_detalle_compra',
      endpoint: 'detalle_compra',
      title: 'Líneas de compra',
      singular: 'línea',
      parentKey: 'id_compra',
      columns: [
        { key: 'id_producto', label: 'Producto', fkField: 'id_producto' },
        { key: 'cantidad', label: 'Cantidad', type: 'number' },
        { key: 'unidad_medida', label: 'Unidad' },
        { key: 'precio_unitario', label: 'Precio unit.', type: 'currency' },
      ],
      fields: [
        { key: 'id_producto', label: 'Producto', type: 'select', required: true, fkEndpoint: 'productos', fkLabelKey: 'presentacion', fkValueKey: 'id_producto' },
        { key: 'cantidad', label: 'Cantidad', type: 'number', required: true, min: 0.01, step: 0.01 },
        { key: 'unidad_medida', label: 'Unidad', type: 'select', required: true, options: [{ value: 'kg', label: 'kg' }, { value: 'bolsa', label: 'bolsa' }], defaultValue: 'kg' },
        { key: 'precio_unitario', label: 'Precio unitario', type: 'number', required: true, min: 0, step: 0.01 },
      ],
      detailFields: [
        { key: 'id_producto', label: 'Producto', fkField: 'id_producto' },
        { key: 'cantidad', label: 'Cantidad' },
        { key: 'unidad_medida', label: 'Unidad' },
        { key: 'precio_unitario', label: 'Precio unitario', formatter: cop },
      ],
      defaultSort: { column: 'id_detalle_compra', direction: 'desc' },
    },
    {
      key: 'id_lote',
      endpoint: 'lotes',
      title: 'Lotes',
      singular: 'lote',
      parentKey: 'id_detalle_compra',
      columns: [
        { key: 'numero_lote', label: 'N° lote' },
        { key: 'fecha_ingreso', label: 'Ingreso', type: 'date' },
        { key: 'fecha_vencimiento', label: 'Vencimiento', type: 'date' },
        { key: 'tipo_empaque', label: 'Empaque' },
        { key: 'cantidad_disponible', label: 'Disponible', type: 'number' },
        { key: 'id_ubicacion', label: 'Ubicación', fkField: 'id_ubicacion' },
        { key: 'estado', label: 'Estado', type: 'boolean' },
      ],
      fields: [
        { key: 'numero_lote', label: 'N° lote', type: 'text', required: true, maxLength: 20 },
        { key: 'id_detalle_compra', label: 'Línea de compra', type: 'select', required: true, fkEndpoint: 'detalle_compra', fkLabelKey: 'id_detalle_compra', fkValueKey: 'id_detalle_compra' },
        { key: 'fecha_ingreso', label: 'Fecha de ingreso', type: 'date', required: true },
        { key: 'fecha_vencimiento', label: 'Fecha de vencimiento', type: 'date', required: true },
        { key: 'tipo_empaque', label: 'Tipo de empaque', type: 'select', required: true, options: [{ value: 'Bulto', label: 'Bulto' }, { value: 'Caja', label: 'Caja' }, { value: 'Bolsa', label: 'Bolsa' }] },
        { key: 'cantidad_disponible', label: 'Cantidad disponible', type: 'number', required: true, min: 0, step: 0.01 },
        { key: 'id_ubicacion', label: 'Ubicación', type: 'select', required: true, fkEndpoint: 'ubicaciones', fkLabelKey: 'nombre_ubicacion', fkValueKey: 'id_ubicacion' },
        { key: 'es_transformable', label: 'Transformable', type: 'switch', defaultValue: false },
        { key: 'estado', label: 'Estado', type: 'switch', defaultValue: true },
      ],
      detailFields: [
        { key: 'numero_lote', label: 'N° lote' },
        { key: 'id_detalle_compra', label: 'Línea de compra', fkField: 'id_detalle_compra' },
        { key: 'fecha_ingreso', label: 'Ingreso', type: 'date' },
        { key: 'fecha_vencimiento', label: 'Vencimiento', type: 'date' },
        { key: 'tipo_empaque', label: 'Empaque' },
        { key: 'cantidad_disponible', label: 'Disponible' },
        { key: 'id_ubicacion', label: 'Ubicación', fkField: 'id_ubicacion' },
        { key: 'es_transformable', label: 'Transformable', formatter: (v) => (v ? 'Sí' : 'No') },
        { key: 'estado', label: 'Estado', formatter: boolLabel },
      ],
      defaultSort: { column: 'id_lote', direction: 'desc' },
      customLoad: async (compraId) => {
        const lineas = await api.list<Row>('detalle_compra', { id_compra: String(compraId) })
        const lotes: Row[] = []
        for (const linea of lineas) {
          try {
            const loteList = await api.list<Row>('lotes', { id_detalle_compra: String(linea.id_detalle_compra) })
            lotes.push(...loteList)
          } catch { /* skip if load fails */ }
        }
        return lotes
      },
    },
  ],
}

export const produccionResource: ResourceConfig = {
  key: 'id_produccion',
  endpoint: 'produccion',
  title: 'Producción',
  singular: 'producción',
  columns: [
    { key: 'id_produccion', label: 'N°', formatter: idFormatter('P') },
    { key: 'id_usuario', label: 'Usuario', fkField: 'id_usuario' },
    { key: 'id_lote_origen', label: 'Lote origen', fkField: 'id_lote_origen' },
    { key: 'fecha_produccion', label: 'Fecha', type: 'datetime' },
    { key: 'cantidad_a_procesar', label: 'Cantidad (kg)', type: 'number' },
    { key: 'estado', label: 'Estado' },
  ],
  fields: [
    { key: 'id_usuario', label: 'Usuario', type: 'select', required: true, fkEndpoint: 'usuarios', fkLabelKey: 'correo', fkValueKey: 'id_usuario' },
    { key: 'id_lote_origen', label: 'Lote origen', type: 'select', required: true, fkEndpoint: 'lotes', fkLabelKey: 'numero_lote', fkValueKey: 'id_lote' },
    { key: 'cantidad_a_procesar', label: 'Cantidad a procesar (kg)', type: 'number', required: true, min: 0.01, step: 0.01 },
    { key: 'merma', label: 'Merma (kg)', type: 'number', min: 0, step: 0.01 },
    { key: 'estado', label: 'Estado', type: 'select', required: true, options: [{ value: 'En proceso', label: 'En proceso' }, { value: 'Finalizada', label: 'Finalizada' }, { value: 'Anulada', label: 'Anulada' }], defaultValue: 'En proceso' },
    { key: 'fecha_finalizacion', label: 'Fecha de finalización', type: 'datetime' },
    { key: 'observaciones', label: 'Observaciones', type: 'text', maxLength: 200 },
  ],
  detailFields: [
    { key: 'id_usuario', label: 'Usuario', fkField: 'id_usuario' },
    { key: 'id_lote_origen', label: 'Lote origen', fkField: 'id_lote_origen' },
    { key: 'fecha_produccion', label: 'Fecha', type: 'datetime' },
    { key: 'cantidad_a_procesar', label: 'Cantidad a procesar (kg)' },
    { key: 'merma', label: 'Merma (kg)' },
    { key: 'estado', label: 'Estado' },
    { key: 'fecha_finalizacion', label: 'Finalización', type: 'datetime' },
    { key: 'observaciones', label: 'Observaciones' },
  ],
  defaultSort: { column: 'id_produccion', direction: 'desc' },
  filterableColumns: ['id_usuario', 'estado'],
  subResources: [
    {
      key: 'id_detalle_produccion',
      endpoint: 'detalle_produccion',
      title: 'Detalle de producción',
      singular: 'detalle',
      parentKey: 'id_produccion',
      columns: [
        { key: 'id_producto', label: 'Producto', fkField: 'id_producto' },
        { key: 'cantidad_obtenida', label: 'Cantidad obtenida', type: 'number' },
        { key: 'unidad_medida', label: 'Unidad' },
      ],
      fields: [
        { key: 'id_producto', label: 'Producto', type: 'select', required: true, fkEndpoint: 'productos', fkLabelKey: 'presentacion', fkValueKey: 'id_producto' },
        { key: 'cantidad_obtenida', label: 'Cantidad obtenida', type: 'number', required: true, min: 0.01, step: 0.01 },
        { key: 'unidad_medida', label: 'Unidad', type: 'select', required: true, options: [{ value: 'bolsa', label: 'bolsa' }], defaultValue: 'bolsa' },
      ],
      detailFields: [
        { key: 'id_producto', label: 'Producto', fkField: 'id_producto' },
        { key: 'cantidad_obtenida', label: 'Cantidad obtenida' },
        { key: 'unidad_medida', label: 'Unidad' },
      ],
      defaultSort: { column: 'id_detalle_produccion', direction: 'desc' },
    },
  ],
}

export const ventaResource: ResourceConfig = {
  key: 'id_venta',
  endpoint: 'ventas',
  title: 'Ventas',
  singular: 'venta',
  columns: [
    { key: 'id_venta', label: 'N°', formatter: idFormatter('V') },
    { key: 'numero_documento', label: 'Cliente', fkField: 'numero_documento' },
    { key: 'id_usuario', label: 'Usuario', fkField: 'id_usuario' },
    { key: 'tipo_venta', label: 'Tipo' },
    { key: 'fecha_venta', label: 'Fecha', type: 'datetime' },
    { key: 'total_pagar', label: 'Total', type: 'currency' },
    { key: 'estado', label: 'Estado', type: 'boolean' },
  ],
  fields: [
    { key: 'numero_documento', label: 'Cliente', type: 'select', required: true, fkEndpoint: 'clientes', fkLabelKey: 'nombre_cliente', fkValueKey: 'numero_documento' },
    { key: 'id_usuario', label: 'Usuario', type: 'select', required: true, fkEndpoint: 'usuarios', fkLabelKey: 'correo', fkValueKey: 'id_usuario' },
    { key: 'tipo_venta', label: 'Tipo de venta', type: 'select', required: true, options: [{ value: 'Detal', label: 'Detal' }, { value: 'Mayorista', label: 'Mayorista' }] },
    { key: 'fecha_venta', label: 'Fecha de venta', type: 'datetime' },
    { key: 'iva', label: 'IVA', type: 'number', required: true, min: 0, step: 0.01, defaultValue: 0 },
    { key: 'descuento_total', label: 'Descuento total', type: 'number', required: true, min: 0, step: 0.01, defaultValue: 0 },
    { key: 'total_pagar', label: 'Total a pagar', type: 'number', required: true, min: 0, step: 0.01, defaultValue: 0 },
    { key: 'estado', label: 'Estado', type: 'switch', defaultValue: true },
    { key: 'motivo_anulacion', label: 'Motivo de anulación', type: 'text', maxLength: 200 },
  ],
  detailFields: [
    { key: 'numero_documento', label: 'Cliente', fkField: 'numero_documento' },
    { key: 'id_usuario', label: 'Usuario', fkField: 'id_usuario' },
    { key: 'tipo_venta', label: 'Tipo' },
    { key: 'fecha_venta', label: 'Fecha', type: 'datetime' },
    { key: 'iva', label: 'IVA', formatter: cop },
    { key: 'descuento_total', label: 'Descuento', formatter: cop },
    { key: 'total_pagar', label: 'Total', formatter: cop },
    { key: 'estado', label: 'Estado', formatter: boolLabel },
    { key: 'motivo_anulacion', label: 'Motivo de anulación' },
  ],
  defaultSort: { column: 'id_venta', direction: 'desc' },
  filterableColumns: ['numero_documento', 'tipo_venta', 'estado'],
  subResources: [
    {
      key: 'id_detalle_venta',
      endpoint: 'detalle_venta',
      title: 'Líneas de venta',
      singular: 'línea',
      parentKey: 'id_venta',
      columns: [
        { key: 'id_producto', label: 'Producto', fkField: 'id_producto' },
        { key: 'id_lote', label: 'Lote', fkField: 'id_lote' },
        { key: 'cantidad', label: 'Cantidad', type: 'number' },
        { key: 'unidad_medida', label: 'Unidad' },
        { key: 'precio_unitario', label: 'Precio unit.', type: 'currency' },
      ],
      fields: [
        { key: 'id_producto', label: 'Producto', type: 'select', required: true, fkEndpoint: 'productos', fkLabelKey: 'presentacion', fkValueKey: 'id_producto' },
        { key: 'id_lote', label: 'Lote', type: 'select', required: true, fkEndpoint: 'lotes', fkLabelKey: 'numero_lote', fkValueKey: 'id_lote' },
        { key: 'cantidad', label: 'Cantidad', type: 'number', required: true, min: 0.01, step: 0.01 },
        { key: 'unidad_medida', label: 'Unidad', type: 'select', required: true, options: [{ value: 'kg', label: 'kg' }, { value: 'bolsa', label: 'bolsa' }], defaultValue: 'kg' },
        { key: 'precio_unitario', label: 'Precio unitario', type: 'number', required: true, min: 0, step: 0.01 },
      ],
      detailFields: [
        { key: 'id_producto', label: 'Producto', fkField: 'id_producto' },
        { key: 'id_lote', label: 'Lote', fkField: 'id_lote' },
        { key: 'cantidad', label: 'Cantidad' },
        { key: 'unidad_medida', label: 'Unidad' },
        { key: 'precio_unitario', label: 'Precio unitario', formatter: cop },
      ],
      defaultSort: { column: 'id_detalle_venta', direction: 'desc' },
    },
    {
      key: 'id_pago_venta',
      endpoint: 'pagos_venta',
      title: 'Pagos',
      singular: 'pago',
      parentKey: 'id_venta',
      columns: [
        { key: 'metodo_pago', label: 'Método' },
        { key: 'monto_recibido', label: 'Monto', type: 'currency' },
        { key: 'referencia', label: 'Referencia' },
      ],
      fields: [
        { key: 'metodo_pago', label: 'Método de pago', type: 'select', required: true, options: [{ value: 'Efectivo', label: 'Efectivo' }, { value: 'Transferencia', label: 'Transferencia' }] },
        { key: 'monto_recibido', label: 'Monto recibido', type: 'number', required: true, min: 0.01, step: 0.01 },
        { key: 'referencia', label: 'Referencia', type: 'text', maxLength: 40 },
      ],
      detailFields: [
        { key: 'metodo_pago', label: 'Método' },
        { key: 'monto_recibido', label: 'Monto', formatter: cop },
        { key: 'referencia', label: 'Referencia' },
      ],
      defaultSort: { column: 'id_pago_venta', direction: 'desc' },
    },
  ],
}
