# Guía de despliegue en Render

## Arquitectura

- **Frontend** → Static Site en Render (sirve `dist/` con SPA rewrite)
- **API** → Web Service en Render (Node.js/Express)
- **Base de datos** → PostgreSQL interno de Render

---

## 1. Base de datos (Render PostgreSQL)

1. Crea una instancia de **PostgreSQL** en Render.
2. Guarda la **Internal Database URL** (formato `postgresql://user:pass@host:5432/db`).
3. Ejecuta el esquema y los seeds:
   ```bash
   psql "postgresql://user:pass@host:5432/db" -f db/schema.sql
   psql "postgresql://user:pass@host:5432/db" -f db/seed-municipios.sql
   ```

## 2. API (Render Web Service)

1. Crea un **Web Service** nuevo en Render.
2. Conecta tu repositorio.
3. Configura:
   - **Build Command**: `npm ci`
   - **Start Command**: `npm run start` (ejecuta `node api/src/server.js`)
4. **Environment Variables**:

   | Variable | Valor | Notas |
   |---|---|---|
   | `DATABASE_URL` | `postgresql://user:pass@host:5432/db` | Internal Database URL de Render |
   | `DB_SSL` | `true` | Render requiere SSL |
   | `CORS_ORIGIN` | `https://tu-frontend.onrender.com` | URL del Static Site (añadir locales separados por coma si pruebas en local) |
   | `PORT` | *(auto)* | Render lo inyecta automáticamente |

5. La API queda disponible en `https://tu-api.onrender.com/api/health`.

## 3. Frontend (Render Static Site)

1. Crea un **Static Site** nuevo en Render.
2. Conecta el mismo repositorio.
3. Configura:
   - **Build Command**: `npm ci && npm run build`
   - **Publish Directory**: `dist`
4. **Environment Variables**:

   | Variable | Valor |
   |---|---|
   | `VITE_API_URL` | `https://tu-api.onrender.com` |

5. El archivo `public/_redirects` ya está en el repo y se copia a `dist/` en el build, garantizando que las rutas del SPA (`/ventas`, `/compras`, `/dashboard`, etc.) funcionen al recargar.

## 4. Verificación post-despliegue

1. Abre `https://tu-frontend.onrender.com` → debe mostrar el login.
2. Inicia sesión con `admin@fresas.co` / `Admin123*` (crear primero con `npm run seed:demo` apuntando a la BD de Render).
3. El Dashboard debe mostrar "Conectado a la base de datos".
4. Navega a cualquier módulo y recarga la página (F5) → no debe dar 404.

## Resumen de variables de entorno

### Render Web Service (API)
| Variable | Ejemplo |
|---|---|
| `DATABASE_URL` | `postgresql://user:pass@host:5432/db` |
| `DB_SSL` | `true` |
| `CORS_ORIGIN` | `https://tu-frontend.onrender.com` |

### Render Static Site (Frontend)
| Variable | Ejemplo |
|---|---|
| `VITE_API_URL` | `https://tu-api.onrender.com` |
