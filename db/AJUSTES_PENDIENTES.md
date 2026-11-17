# Ajustes pendientes para el esquema PostgreSQL

Estos cambios son necesarios para alinear la base de datos con el prototipo:

- Obligatorio: agregar `roles.estado BOOLEAN NOT NULL DEFAULT TRUE`.
- Obligatorio: agregar `categorias.estado BOOLEAN NOT NULL DEFAULT TRUE`.
- Obligatorio: agregar `ventas.motivo_anulacion VARCHAR(200) NULL`.
- Insertar el cliente consumidor final con documento `222222222222`.
- Poblar `roles_x_permisos`; actualmente la tabla está vacía.
- Eliminar los valores `{}` de `proveedores.municipio`, `proveedores.departamento` y `produccion.unidad_medida`.
- Asegurar la presentación `Granel` en los registros de `productos`.
- Opcional: retirar `Tarjeta` del `CHECK` de `pagos_venta`; el prototipo solo permite `Efectivo` y `Transferencia`.

Incluir las columnas en el próximo cambio del dump y revisar índices/constraints
antes de conectar el prototipo a una base de datos real. Este prototipo no hace
conexiones ni genera migraciones.
