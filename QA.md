# QA manual

## Acceso y persistencia

- [ ] Iniciar sesión con Administrador, Vendedor y Operario; confirmar menús y guards.
- [x] Navegador: comprobar menús por rol y que Dashboard/módulos sin permiso redirigen al primer módulo permitido sin bucles.
- [ ] Intentar credenciales inválidas, cuenta inactiva y recuperar contraseña.
- [x] Navegador: credenciales inválidas y cuenta inactiva muestran los mensajes requeridos; recuperación rechaza clave débil y actualiza la clave válida. Seed restaurado tras la prueba.
- [ ] Cerrar sesión con confirmación; restablecer datos demo como Administrador.
- [ ] Registrar cambios, recargar y verificar persistencia en localStorage.

## Módulos (repetir en modo claro y oscuro; capturar pantalla de cada módulo)

- [ ] Dashboard: periodo, KPIs, gráficas, alertas, cierre de caja y descargas PDF/Excel.
- [x] Periodo Anual del dashboard: verificado en navegador con subtítulo “Últimos 12 meses”; la serie ahora agrupa doce meses.
- [x] Navegador: activar los botones PDF y Excel; ambos completan la generación y muestran el Toast de éxito. La confirmación del archivo descargado queda pendiente.
- [ ] Roles & Permisos: matriz 4 × 4, persistencia, estado y protección del rol Administrador.
- [x] Navegador: registrar rol temporal con permiso en la matriz; la asociación persiste tras recargar y se restauró el seed demo.
- [ ] Usuarios: alta, edición, filtro por rol, estado y rechazo de auto-inactivación.
- [x] Navegador: los campos requeridos de usuarios señalan errores bajo el campo y el selector de rol presenta borde de error.
- [ ] Categorías: alta, edición, productos asociados y confirmación de estado.
- [ ] Productos: alta, detalle de lotes y stock mínimo.
- [ ] Proveedores: CRUD e historial calculado.
- [x] Historial de proveedores: incluye folio/fecha y total individual por compra, además de la suma histórica del proveedor.
- [ ] Compras: registrar, asociar lote y anular compra permitida/bloqueada.
- [x] Navegador: validar errores obligatorios y registrar compra con lote, empaque, vencimiento y ubicación; se restauró el seed tras la prueba.
- [x] Prueba de servicios: flujo compra → lote → producción con merma → venta con pago → anulación, con `checkInvariants` después de cada operación.
- [x] Prueba de servicios: anulación de compra bloqueada atómicamente si el stock fue ajustado y no alcanza para descontar la compra.
- [ ] Lotes y Existencias: cantidades, vencimientos y filtros.
- [ ] Producción: procesar lote fresco con merma y comprobar el stock congelado.
- [x] Tabla de producción: incluye etiquetas de columna en el diseño móvil y formato legible de cantidades decimales.
- [ ] Clientes: CRUD, consumidor final protegido e historial de ventas.
- [ ] Ventas: venta con pago, FEFO entre lotes y anulación con devolución.

## Responsive

- [ ] Probar viewport 390 px: menú cajón, tablas como tarjetas, POS y modales.
- [x] Navegador a 390 px: historial de ventas se muestra en tarjetas y el carrito del POS se colapsa sin bloquear las pestañas.
- [x] Navegador a 396 px: el popover de filtros se mantiene dentro del viewport.

## Capturas

Las capturas se tomaron en la vista previa disponible (396 × 275 px), en modo claro y oscuro. Las rutas de listados y el Dashboard/Existencias son capturas de página completa; el POS móvil mantiene el carrito fijo y se documenta en capturas separadas para mostrar el producto y el pago.

### Vistas principales

| Vista | Claro | Oscuro |
| --- | --- | --- |
| Dashboard y KPIs | [Captura](./qa-capturas/dashboard-claro.png) | [Captura](./qa-capturas/dashboard-oscuro.png) |
| Existencias y tarjetas resumen | [Captura](./qa-capturas/existencias-claro.png) | [Captura](./qa-capturas/existencias-oscuro.png) |
| Notificaciones | [Captura](./qa-capturas/notificaciones-claro.png) | [Captura](./qa-capturas/notificaciones-oscuro.png) |
| Header, sidebar y perfil | [Captura](./qa-capturas/header-sidebar-claro.png) | [Captura](./qa-capturas/header-sidebar-oscuro.png) |

### Filtros e íconos de acción

En cada captura se muestra el popover abierto; las acciones de tabla permiten comprobar los íconos con color.

| Listado | Claro | Oscuro |
| --- | --- | --- |
| Roles | [Captura](./qa-capturas/filtro-roles-claro.png) | [Captura](./qa-capturas/filtro-roles-oscuro.png) |
| Usuarios | [Captura](./qa-capturas/filtro-usuarios-claro.png) | [Captura](./qa-capturas/filtro-usuarios-oscuro.png) |
| Categorías | [Captura](./qa-capturas/filtro-categorias-claro.png) | [Captura](./qa-capturas/filtro-categorias-oscuro.png) |
| Productos | [Captura](./qa-capturas/filtro-productos-claro.png) | [Captura](./qa-capturas/filtro-productos-oscuro.png) |
| Proveedores | [Captura](./qa-capturas/filtro-proveedores-claro.png) | [Captura](./qa-capturas/filtro-proveedores-oscuro.png) |
| Compras | [Captura](./qa-capturas/filtro-compras-claro.png) | [Captura](./qa-capturas/filtro-compras-oscuro.png) |
| Lotes | [Captura](./qa-capturas/filtro-lotes-claro.png) | [Captura](./qa-capturas/filtro-lotes-oscuro.png) |
| Producción | [Captura](./qa-capturas/filtro-produccion-claro.png) | [Captura](./qa-capturas/filtro-produccion-oscuro.png) |
| Clientes | [Captura](./qa-capturas/filtro-clientes-claro.png) | [Captura](./qa-capturas/filtro-clientes-oscuro.png) |
| Historial de ventas | [Captura](./qa-capturas/filtro-ventas-claro.png) | [Captura](./qa-capturas/filtro-ventas-oscuro.png) |

### Compra, producción y POS

La compra de evidencia contiene dos líneas (20 kg y 10 kg), descuento de $ 5.000 e IVA del 19 % sobre el neto.

| Flujo | Claro | Oscuro |
| --- | --- | --- |
| Compra, línea 1 y lote | [Línea 1](./qa-capturas/compra-lineas-claro.png), [línea 2](./qa-capturas/compra-linea2-claro.png), [totales](./qa-capturas/compra-totales-claro.png) | [Línea 1](./qa-capturas/compra-lineas-oscuro.png), [línea 2](./qa-capturas/compra-linea2-oscuro.png), [totales](./qa-capturas/compra-totales-oscuro.png) |
| Producción, 250 g con 10 g de merma | [Cantidad](./qa-capturas/produccion-gramos-cantidad-claro.png), [rendimiento](./qa-capturas/produccion-gramos-rendimiento-claro.png) | [Cantidad](./qa-capturas/produccion-gramos-cantidad-oscuro.png), [rendimiento](./qa-capturas/produccion-gramos-rendimiento-oscuro.png) |
| POS Fresa Fresca | [Captura](./qa-capturas/pos-fresca-claro.png) | [Captura](./qa-capturas/pos-fresca-oscuro.png) |
| POS Fresa Congelada | [Captura](./qa-capturas/pos-congelada-claro.png) | [Captura](./qa-capturas/pos-congelada-oscuro.png) |
| Caja (2 kg), pago mixto | [Orden](./qa-capturas/pos-caja-orden-claro.png), [pago](./qa-capturas/pos-caja-mixto-pago-claro.png) | [Orden](./qa-capturas/pos-caja-orden-oscuro.png), [pago](./qa-capturas/pos-caja-mixto-pago-oscuro.png) |
| Bulto (10 kg), pago mixto | [Orden](./qa-capturas/pos-bulto-orden-claro.png), [pago](./qa-capturas/pos-bulto-mixto-pago-claro.png) | [Orden](./qa-capturas/pos-bulto-orden-oscuro.png), [pago](./qa-capturas/pos-bulto-mixto-pago-oscuro.png) |
| Alerta de stock insuficiente | [Captura](./qa-capturas/pos-stock-alerta-claro.png) | [Captura](./qa-capturas/pos-stock-alerta-oscuro.png) |

### Evidencia solicitada para los flujos ampliados

Las capturas disponibles arriba acreditan la compra multilínea, POS fresco/congelado y los escenarios de producción existentes. El directorio `qa-capturas/` todavía no contiene tomas específicas para las filas siguientes; quedan pendientes de captura desde el preview en ambos temas:

| Vista solicitada | Claro | Oscuro |
| --- | --- | --- |
| Roles, matriz de permisos | Pendiente | Pendiente |
| Productos, detalle con lotes | Pendiente | Pendiente |
| Compras, modal rediseñado completo | [Líneas y lotes](./qa-capturas/compra-lineas-claro.png) · [totales](./qa-capturas/compra-totales-claro.png) | [Líneas y lotes](./qa-capturas/compra-lineas-oscuro.png) · [totales](./qa-capturas/compra-totales-oscuro.png) |
| Producción, listado con acciones | [Listado filtrado](./qa-capturas/filtro-produccion-claro.png) | [Listado filtrado](./qa-capturas/filtro-produccion-oscuro.png) |
| Producción, modal Finalizar | Pendiente | Pendiente |
| POS congelados | [Captura](./qa-capturas/pos-congelada-claro.png) | [Captura](./qa-capturas/pos-congelada-oscuro.png) |
| Dashboard, exportar por gráfico | [Dashboard](./qa-capturas/dashboard-claro.png) | [Dashboard](./qa-capturas/dashboard-oscuro.png) |

Se comprobó en navegador que el filtro de Usuarios por rol reduce el listado y que «Limpiar» restaura las filas; en Ventas, filtrar por transferencia actualiza el contador y muestra solo coincidencias. Las acciones de creación de compra, producción y venta no se confirmaron durante la captura, por lo que los datos demo permanecen intactos.
