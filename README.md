# Comercializadora Fresas del Oriente — prototipo frontend

Aplicación React + TypeScript + Vite. Toda la información se genera en el navegador y se conserva en `localStorage`; no hay servidor, API ni conexión a PostgreSQL.

El prototipo incluye compras multilínea con lotes, órdenes de producción en dos pasos, POS de fresa fresca y congelada, historial con comprobante, roles/permisos y exportaciones PDF/Excel por reporte o widget. Los productos congelados se venden por bolsas enteras; el inventario de dashboard se expresa en kg.

## Ejecutar

```bash
npm i
npm run dev
```

## Usuarios demo

- Administrador: `admin@fresas.co` / `Admin123*`
- Vendedor: `ventas@fresas.co` / `Ventas123*`
- Operario: `operario@fresas.co` / `Operario123*`

Las claves en texto plano son exclusivamente datos de demostración.

## Restablecer datos

Inicia sesión como Administrador y usa **Restablecer datos demo** al pie del menú lateral. Los datos se guardan bajo la clave versionada `fresas-oriente-store-v1`; borrar esa clave también fuerza la carga del seed en el siguiente inicio.

## Validar

```bash
npx tsc --noEmit
npm test
npm run build
```

`db/schema.sql` y `db/AJUSTES_PENDIENTES.md` son referencias del modelo; el prototipo nunca se conecta a PostgreSQL.

La evidencia visual disponible está en [`QA.md`](./QA.md) y `qa-capturas/`. Las capturas faltantes para matriz de roles, detalle de producto con lotes y modal de finalización están identificadas como pendientes; no se presentan capturas de otras pantallas como si las mostraran.
