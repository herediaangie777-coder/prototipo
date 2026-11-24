# API REST

La API se ejecuta desde la raíz del proyecto y lee las variables de entorno de `.env`.

1. Copia `.env.example` como `.env` y completa las credenciales de PostgreSQL.
2. Carga el esquema de base de datos proporcionado en PostgreSQL.
3. Ejecuta `npm run api:dev` durante el desarrollo o `npm run api` para un proceso normal.

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
   - **Environment Variables**: añade `DATABASE_URL` (la URL interna de Render PostgreSQL), `CORS_ORIGIN` (tu dominio frontend), `PORT` (Render lo inyecta, pero puedes fijarlo a `3000`).
4. Render provee `DATABASE_URL` con `sslmode=require`; la API usa `DB_SSL=true` por defecto y configura `rejectUnauthorized: false`.
5. El health check está en `GET /api/health`.

## Rutas

### Salud
- `GET /api/health`

### CRUD genérico (19 tablas)
- `GET /api/:recurso`
- `GET /api/:recurso/:id`
- `POST /api/:recurso`
- `PUT /api/:recurso/:id`
- `DELETE /api/:recurso/:id`

Recursos: `departamentos`, `municipios`, `ubicaciones`, `categorias`, `roles`, `permisos`, `privilegios`, `permisos_privilegios` (solo GET), `usuarios`, `proveedores`, `clientes`, `productos`, `compras`, `detalle_compra`, `lotes`, `produccion`, `detalle_produccion`, `ventas`, `detalle_venta`, `pagos_venta`.

### Filtrado y ordenamiento (listados)
- Filtro por igualdad en columnas permitidas: `GET /api/detalle_compra?id_compra=3`
- Orden por defecto: PK descendente
- Orden personalizado: `?orden=columna&dir=asc|desc` (columna en lista blanca)

### Roles y permisos
- `GET /api/roles/:id/permisos` → `[{id_permiso, id_privilegio}]`
- `PUT /api/roles/:id/permisos` con body `{ "permisos": [{id_permiso, id_privilegio}, ...] }` → reemplaza en una transacción
- `DELETE /api/roles/:id` → borra primero `roles_x_permisos` en la misma transacción

### Vistas de solo lectura
- `GET /api/v_stock_producto` (con filtro por igualdad)
- `GET /api/v_lotes` (con filtro por igualdad)

### Autenticación
- `POST /api/auth/login` `{ "correo": "...", "contrasenia": "..." }`
  - 200: `{ usuario, rol, permisos: [{modulo, privilegio}] }`
  - 401: `Credenciales de acceso inválidas. Por favor verifique e intente de nuevo.`
  - 403: `Su cuenta se encuentra inactiva. Contacte al administrador del sistema.`

### Usuarios
- `POST /api/usuarios` y `PUT /api/usuarios/:id`: `contrasenia` se cifra con bcrypt (10 rondas). En PUT, si no se envía `contrasenia` no se modifica. Nunca se devuelve en respuestas.

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

### Vistas
```bash
curl "http://localhost:3000/api/v_stock_producto"
curl "http://localhost:3000/api/v_lotes?id_producto=1"
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