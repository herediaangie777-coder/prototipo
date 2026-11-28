function defineResource(table, key, columns, readColumns, options = {}) {
  return {
    table,
    key,
    columns,
    readColumns: readColumns ?? [key, ...columns.filter((column) => column !== key)],
    allowCreate: options.allowCreate ?? true,
    allowUpdate: options.allowUpdate ?? true,
    allowDelete: options.allowDelete ?? true,
    filterColumns: options.filterColumns ?? columns,
    orderColumns: options.orderColumns ?? columns.concat(key),
    defaultOrder: options.defaultOrder ?? `${key} DESC`,
  }
}

export const resources = {
  departamentos: defineResource('departamentos', 'id_departamento', ['nombre_departamento']),
  municipios: defineResource('municipios', 'id_municipio', ['id_departamento', 'nombre_municipio']),
  ubicaciones: defineResource('ubicaciones', 'id_ubicacion', ['nombre_ubicacion', 'estado']),
  categorias: defineResource('categorias', 'id_categoria', ['nombre_categoria', 'estado']),
  roles: defineResource('roles', 'id_rol', ['nombre_rol', 'estado']),
  permisos: defineResource('permisos', 'id_permiso', ['nombre_permiso']),
  privilegios: defineResource('privilegios', 'id_privilegio', ['nombre_privilegio']),
  permisos_privilegios: defineResource(
    'permisos_privilegios',
    'id_permiso',
    ['id_permiso', 'id_privilegio'],
    ['id_permiso', 'id_privilegio'],
    { allowCreate: false, allowUpdate: false, allowDelete: false, filterColumns: ['id_permiso', 'id_privilegio'], orderColumns: ['id_permiso', 'id_privilegio'], defaultOrder: 'id_permiso, id_privilegio' }
  ),
  roles_x_permisos: defineResource(
    'roles_x_permisos',
    'id_rol',
    ['id_rol', 'id_permiso', 'id_privilegio'],
    ['id_rol', 'id_permiso', 'id_privilegio'],
    { allowCreate: false, allowUpdate: false, allowDelete: false, filterColumns: ['id_rol', 'id_permiso', 'id_privilegio'], orderColumns: ['id_rol', 'id_permiso', 'id_privilegio'], defaultOrder: 'id_rol DESC' }
  ),
  usuarios: defineResource(
    'usuarios',
    'id_usuario',
    ['id_rol', 'nombre', 'apellido', 'correo', 'telefono', 'contrasenia', 'estado'],
    ['id_usuario', 'id_rol', 'nombre', 'apellido', 'correo', 'telefono', 'estado']
  ),
  proveedores: defineResource('proveedores', 'id_proveedor', ['nombre_proveedor', 'telefono', 'correo', 'direccion', 'id_municipio', 'estado']),
  clientes: defineResource(
    'clientes',
    'numero_documento',
    ['numero_documento', 'tipo_documento', 'nombre_cliente', 'contrasenia', 'telefono', 'correo', 'direccion', 'id_municipio', 'estado'],
    ['numero_documento', 'tipo_documento', 'nombre_cliente', 'telefono', 'correo', 'direccion', 'id_municipio', 'estado']
  ),
  productos: defineResource('productos', 'id_producto', ['id_categoria', 'tipo_producto', 'presentacion', 'unidad_medida', 'peso_unidad_kg', 'precio_compra', 'precio_venta_detal', 'precio_venta_mayorista', 'stock_minimo', 'estado']),
  compras: defineResource('compras', 'id_compra', ['id_proveedor', 'id_usuario', 'fecha_compra', 'iva', 'descuento', 'total_compra', 'observaciones', 'estado']),
  detalle_compra: defineResource('detalle_compra', 'id_detalle_compra', ['id_compra', 'id_producto', 'cantidad', 'unidad_medida', 'precio_unitario']),
  lotes: defineResource('lotes', 'id_lote', ['numero_lote', 'id_producto', 'id_detalle_compra', 'id_detalle_produccion', 'fecha_ingreso', 'fecha_vencimiento', 'tipo_empaque', 'cantidad_disponible', 'id_ubicacion', 'es_transformable', 'estado']),
  produccion: defineResource(
    'produccion',
    'id_produccion',
    ['id_usuario', 'id_lote_origen', 'id_producto_resultado', 'fecha_produccion', 'cantidad_a_procesar', 'cantidad_estimada_congelada', 'merma', 'estado', 'fecha_finalizacion', 'observaciones'],
    undefined,
    { allowCreate: false, allowUpdate: false, allowDelete: false }
  ),
  detalle_produccion: defineResource('detalle_produccion', 'id_detalle_produccion', ['id_produccion', 'id_producto', 'cantidad_obtenida', 'unidad_medida']),
  ventas: defineResource(
    'ventas',
    'id_venta',
    ['numero_documento', 'id_usuario', 'tipo_venta', 'fecha_venta', 'iva', 'descuento_total', 'total_pagar', 'estado', 'motivo_anulacion'],
    undefined,
    { allowCreate: false, allowUpdate: false, allowDelete: false }
  ),
  detalle_venta: defineResource(
    'detalle_venta',
    'id_detalle_venta',
    ['id_venta', 'id_producto', 'id_lote', 'cantidad', 'unidad_medida', 'precio_unitario'],
    undefined,
    { allowCreate: false, allowUpdate: false, allowDelete: false }
  ),
  pagos_venta: defineResource(
    'pagos_venta',
    'id_pago_venta',
    ['id_venta', 'metodo_pago', 'monto_recibido', 'referencia'],
    undefined,
    { allowCreate: false, allowUpdate: false, allowDelete: false }
  ),
}