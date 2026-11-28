# API REST

La API se ejecuta desde la raíz del proyecto y lee las variables de entorno de `.env`.

1. Copia `.env.example` como `.env` y completa las credenciales de PostgreSQL.
2. Carga el esquema de base de datos proporcionado en PostgreSQL.
3. Ejecuta `npm run api:dev` durante el desarrollo (configura `NODE_ENV=development`) o `npm run api` para un proceso normal.

La conexión con PostgreSQL se verifica antes de abrir el puerto.

## Variables de entorno

| Variable        | Descripción                                                                 | Ejemplo                                                    |
|-----------------|-----------------------------------------------------------------------------|------------------------------------------------------------|
| `DATABASE_URL`  | URL de conexión completa (Render). Si existe, tiene prioridad.              | `postgres://user:pass@host:5432/db?sslmode=require`        |
| `DB_SSL`        | `true` para SSL (Render), `false` para desactivar en local.                 | `true`                                                     |
| `DB_HOST`       | Host de PostgreSQL (si no hay `DATABASE_URL`).                              | `localhost`                                                |
| `DB_PORT`       | Puerto de PostgreSQL.                                                       | `5432`                                                     |
| `DB_NAME`       | Nombre de la base de datos.                                                 | `fresas`                                                   |
| `DB_USER`       | Usuario de PostgreSQL.                                                      | `postgres`                                                 |
| `DB_PASSWORD`   | Contraseña de PostgreSQL.                                                   | `secret`                                                   |
| `CORS_ORIGIN`   | Orígenes permitidos separados por comas. En local por defecto `http://localhost:5173,http://localhost:3000`. | `https://miapp.com,https://admin.miapp.com` |
| `JWT_SECRET`    | Secreto JWT obligatorio fuera del bypass local; debe tener al menos 32 caracteres. | `secreto-aleatorio-de-32-caracteres-o-mas` |
| `AUTH_BYPASS_LOCAL` | `true` habilita el bypass únicamente con `NODE_ENV=development` y solicitudes loopback. `api:dev` lo activa por defecto, pero puede establecerse en `false`. | `true` |
| `PORT`          | Puerto donde escucha la API.                                                | `3000`                                                     |

## Scripts

| Comando             | Descripción                              |
|---------------------|------------------------------------------|
| `npm run api`       | Inicia la API en producción (`start`).   |
| `npm run api:dev`   | Inicia la API con recarga automática.    |
| `npm run seed:demo` | Crea usuarios demo si no existen.        |

## Despliegue en Render

1. Crea un **Web Service** nuevo en Render.
2. Conecta tu repositorio.
3. Configura:
   - **Build Command**: `npm ci`
   - **Start Command**: `npm run start`
   - **Environment Variables**: añade `DATABASE_URL` (la URL interna de Render PostgreSQL), `JWT_SECRET` (mínimo 32 caracteres aleatorios), `NODE_ENV=production`, `CORS_ORIGIN` (tu dominio frontend), `PORT` (Render lo inyecta, pero puedes fijarlo a `3000`).
4. Render provee `DATABASE_URL` con `sslmode=require`; la API usa `DB_SSL=true` por defecto y configura `rejectUnauthorized: false`.
5. El health check está en `GET /api/health`.

## Rutas

### Salud
- `GET /api/health`

### CRUD genérico (19 tablas)
- `GET /api/:recurso`
- `GET /api/:recurso/:id`
- `POST`, `PUT` y `DELETE /api/:recurso...` cuando el recurso lo permite. Producción usa sus rutas transaccionales.

Recursos: `departamentos`, `municipios`, `ubicaciones`, `categorias`, `roles`, `permisos`, `privilegios`, `permisos_privilegios` (solo GET), `usuarios`, `proveedores`, `clientes`, `productos`, `compras`, `detalle_compra`, `lotes`, `produccion`, `detalle_produccion`, `ventas`, `detalle_venta`, `pagos_venta`.

### Filtrado y ordenamiento (listados)
- Filtro por igualdad en columnas permitidas: `GET /api/detalle_compra?id_compra=3`
- Compras de un proveedor: `GET /api/compras?id_proveedor=3`
- Orden por defecto: PK descendente
- Orden personalizado: `?orden=columna&dir=asc|desc` (columna en lista blanca)

### Roles y permisos
- `GET /api/roles/:id/permisos` → `[{id_permiso, id_privilegio}]`
- `PUT /api/roles/:id/permisos` con body `{ "permisos": [{id_permiso, id_privilegio}, ...] }` → reemplaza en una transacción
- `DELETE /api/roles/:id` → borra primero `roles_x_permisos` en la misma transacción

### Vistas de solo lectura
- `GET /api/v_stock_producto` (con filtro por igualdad)
- `GET /api/v_lotes` (con filtro por igualdad)
- `GET /api/productos/:id/lotes` → lotes del producto con referencia a compra o producción

### Producción
- `POST /api/produccion` crea una orden en proceso, reserva stock fresco y guarda `cantidad_estimada_congelada` en bolsas aproximadas.
- `PUT /api/produccion/:id` ajusta cantidad/observaciones y recalcula la estimación actualizando la reserva.
- `POST /api/produccion/:id/congelar` recibe `{ "unidades_obtenidas": 10, "id_ubicacion": 1, "fecha_vencimiento": "2027-05-01" }`; registra el detalle, calcula merma y crea el lote congelado vinculado al producto de salida.
- `POST /api/produccion/:id/anular` anula la orden y revierte la reserva; una orden finalizada no se anula si su lote resultante ya tiene ventas.

### Ventas
- `POST /api/ventas` recibe cliente, tipo de venta, IVA, descuento, `lines: [{ id_producto, cantidad }]` y `pagos: [{ metodo_pago, monto, referencia? }]`. Selecciona lotes FEFO, guarda cada detalle vinculado a su lote y descuenta existencias dentro de una transacción SQL.
- `PUT /api/ventas/:id` usa el mismo formato y reemplaza líneas/pagos en una transacción, devolviendo las cantidades anteriores a sus lotes y reasignando stock FEFO. No permite editar una venta anulada.
- `POST /api/ventas/:id/anular` recibe `{ "motivo_anulacion": "..." }`; revierte cantidades por lote y actualiza estado/motivo dentro de una transacción. No se permite modificar ventas mediante el CRUD genérico.
- Los recursos `detalle_venta` y `pagos_venta` son de solo lectura para evitar registrar líneas/pagos sin el flujo transaccional.

### Reportes (endpoints recomendados, aún no implementados)
- `GET /api/reportes/cierre-caja?desde=AAAA-MM-DD&hasta=AAAA-MM-DD`: ventas activas menos compras recibidas, desglosado por medio de pago y proveedor.
- `GET /api/reportes/alertas?dias_vencimiento=30`: productos bajo mínimo, lotes vencidos y lotes próximos a vencer.
- `GET /api/reportes/produccion?desde=AAAA-MM-DD&hasta=AAAA-MM-DD`: kg procesados, bolsas/kg congelados, merma y rendimiento.
- Actualmente `GET /api/v_stock_producto` da stock/stock bajo y `GET /api/v_lotes` permite filtros por igualdad; no existe agregado de cierre diario ni rango de fechas para los reportes anteriores.

### Autenticación
- `POST /api/auth/login` `{ "correo": "...", "contrasenia": "..." }`
  - 200: `{ usuario, rol, permisos: [{modulo, privilegio}], token, expiresIn }`
  - 401: `Credenciales de acceso inválidas. Por favor verifique e intente de nuevo.`
  - 403: `Su cuenta se encuentra inactiva. Contacte al administrador del sistema.`
- Envía el JWT como `Authorization: Bearer <token>` al resto de rutas. Sin excepción, la API requiere `JWT_SECRET` fuera de `NODE_ENV=development` + `AUTH_BYPASS_LOCAL=true`. El bypass solo aplica a loopback y conserva `req.user.id = 1`; el login sigue validando credenciales.

### Usuarios
- `POST /api/usuarios` y `PUT /api/usuarios/:id`: `contrasenia` se cifra con bcrypt (10 rondas). En PUT, si no se envía `contrasenia` no se modifica. Nunca se devuelve en respuestas.
- `clientes.contrasenia` es opcional, se conserva en texto plano y se excluye de las respuestas; no se usa para autenticar clientes.

## Ejemplos curl

### Health
```bash
curl http://localhost:3000/api/health
```

### Listar con filtro y orden
```bash
curl "http://localhost:3000/api/detalle_compra?id_compra=3"
curl "http://localhost:3000/api/categorias?estado=true&orden=nombre_categoria&dir=asc"
```

### Obtener por ID
```bash
curl http://localhost:3000/api/roles/1
```

### Crear recurso
```bash
curl -X POST http://localhost:3000/api/categorias \
  -H "Content-Type: application/json" \
  -d '{"nombre_categoria": "Calibre 4", "estado": true}'
```

### Actualizar recurso
```bash
curl -X PUT http://localhost:3000/api/categorias/5 \
  -H "Content-Type: application/json" \
  -d '{"estado": false}'
```

### Eliminar recurso
```bash
curl -X DELETE http://localhost:3000/api/categorias/5
```

### Roles - permisos
```bash
curl http://localhost:3000/api/roles/1/permisos

curl -X PUT http://localhost:3000/api/roles/2/permisos \
  -H "Content-Type: application/json" \
  -d '{"permisos": [{"id_permiso": 1, "id_privilegio": 1}, {"id_permiso": 1, "id_privilegio": 2}]}'

curl -X DELETE http://localhost:3000/api/roles/2
```

### Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"correo": "admin@fresas.co", "contrasenia": "Admin123*"}'
```

### Registrar venta
```bash
curl -X POST http://localhost:3000/api/ventas \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"numero_documento":"222222222222","tipo_venta":"Detal","iva":0,"descuento_total":0,"lines":[{"id_producto":1,"cantidad":2}],"pagos":[{"metodo_pago":"Efectivo","monto":24000}]}'
```

### Anular venta
```bash
curl -X POST http://localhost:3000/api/ventas/12/anular \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"motivo_anulacion":"Venta registrada por error"}'
```

### Vistas
```bash
curl "http://localhost:3000/api/v_stock_producto"
curl "http://localhost:3000/api/v_lotes?id_producto=1"
curl "http://localhost:3000/api/productos/1/lotes"
```

### Usuarios (con bcrypt)
```bash
curl -X POST http://localhost:3000/api/usuarios \
  -H "Content-Type: application/json" \
  -d '{"id_rol": 1, "nombre": "Nuevo", "apellido": "Usuario", "correo": "nuevo@fresas.co", "contrasenia": "Clave123*"}'

curl -X PUT http://localhost:3000/api/usuarios/4 \
  -H "Content-Type: application/json" \
  -d '{"nombre": "Actualizado"}'
```

### Seed demo
```bash
npm run seed:demo
```

## Manejo de errores

- `23503` (FK) con "is still referenced" → 409 `No se puede eliminar: el registro tiene información asociada.`
- `23503` (FK) sin "is still referenced" → 400 `El registro relacionado no existe.`
- `23505` (unique) → 400 `Ya existe un registro con ese valor único.`
- `23502` (not null) → 400 `Falta un campo obligatorio.`
- `22P02` (tipo) → 400 `El formato de uno de los valores no es válido.`
- `23514` (check) → 400 `Uno de los valores no cumple una restricción de la base de datos.`

## Tipos de PostgreSQL

- `numeric` (OID 1700) → `Number`
- `date` (OID 1082) → texto `YYYY-MM-DD` sin zona horaria
- `timestamp` (OID 1114) → texto `YYYY-MM-DDTHH:mm:ss` sin `Z`