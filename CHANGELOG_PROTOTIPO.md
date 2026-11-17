# Changelog del prototipo

## 2026-11-11

- Se migró el mockup a rutas React Router con sesión simulada y autorización derivada de roles y permisos.
- Se reemplazaron los datos de las pantallas por un store local persistente y seed transaccional coherente.
- Se agregaron servicios atómicos, validación de invariantes, ventas FEFO, producción, compras/anulación y exportación local.
- Desviación: el restablecimiento de contraseña usa un token local de sesión en lugar de enviar correo, porque no existe backend.
- Desviación: los reportes PDF/Excel contienen indicadores y tablas sintetizadas en navegador; no se genera un comprobante fiscal.
- Desviación: las operaciones de autenticación son demostrativas y guardan las contraseñas en texto plano solo en el seed local.
- El dump original no estaba en el repositorio; se incorporó como `db/schema.sql` para referencia.
- Se corrigió el agrupamiento de fechas para usar el día local en seed, dashboard, periodos y servicios; los reportes exportados ahora calculan ventas y compras según el periodo elegido.
- QA móvil a 390 px detectó que el carrito fijo podía cubrir las pestañas; se corrigió el anclaje y se verificó la tabla de ventas en tarjetas y el colapso del carrito.
- Se completó el formulario de compra con tipo de empaque, zona y observaciones; ahora muestra errores de campo para cantidad, número de lote y vencimiento antes de llamar al servicio.
- QA de permisos encontró una redirección circular para roles sin acceso a Ventas; las rutas protegidas ahora redirigen al primer módulo permitido para ese usuario.
- El periodo Anual del dashboard ahora agrupa doce meses calendario relativos al mes actual; las exportaciones incluyen todo el rango y el historial de proveedores muestra folios y suma histórica.
- Las cantidades decimales de stock y producción se formatean con un máximo de dos decimales en las tablas para evitar ruido de precisión de punto flotante.
- La anulación de compra ya no recorta el stock silenciosamente: valida previamente que el descuento pueda aplicarse y aborta sin mutaciones si hubo un ajuste manual incompatible.
- Se añadió prueba integrada del flujo compra → lote → producción → venta → anulación con verificación de invariantes después de cada servicio.
- Roles y formularios maestros fortalecen validación en el servicio (longitudes, correo, nombres permitidos, rol activo, permisos de matriz válidos); la matriz y selectores muestran estados de error junto al campo.
- QA navegador verificó validación de roles, persistencia de permisos, errores de login/inactividad y recuperación de contraseña; se restauraron los datos demo al terminar.
- Los toggles de estado usan tokens semánticos en lugar de colores claros codificados, para mantener legibilidad entre temas.

## 2026-11-13

- Se alinearon roles y categorías con el esquema PostgreSQL eliminando descripciones del modelo, seed y mantenimiento; sus estados y `ventas.motivo_anulacion` siguen pendientes en BD.
- Se retiró `Tarjeta` de los tipos, datos demo, cierres de caja y selector de pago; pagos mixtos quedan representados por dos filas.
- Se versionó la clave de persistencia local a `fresas-oriente-store-v2` para descartar el estado anterior incompatible.
- Se ajustó el seed a presentación `Granel`, lotes `L-001`, producción fresca no vencida con salida del mismo calibre, ventas no vencidas e importes con IVA/descuento.
- Se agregaron formato de folios y conversión a kg; los servicios transaccionales ahora admiten compras multilínea, validan stock vendible/FEFO, asocian salida de producción por calibre y exigen motivo para anular una venta.
- Desviación pendiente: el `CHECK` actual de `pagos_venta` en `db/schema.sql` todavía permite `Tarjeta`; no se modificó el dump y su retiro queda marcado como opcional en `db/AJUSTES_PENDIENTES.md`.
- Se completaron compra multilínea, vista previa de producción y POS guiado por tipo/calibre con conversiones a kg, stock vendible, descuentos, IVA, pagos mixtos, detalle/ticket e historial. Los JPG no existen en el prototipo: las rutas requeridas se conservan y cada imagen usa una ilustración SVG local como fallback. La impresión del ticket es una salida de navegador no fiscal.
- Se añadieron filtros con popover, contador y limpieza en los listados solicitados; al cambiar criterios se reinicia la paginación. Se validó en navegador el filtro de rol de Usuarios y el medio de pago de Ventas.
- Se reemplazaron las acciones genéricas por botones compartidos de color semántico y se añadieron vistas de historial para proveedores y clientes; se retiró el detalle de existencias por lote del producto.
- Se estilizaron toasts y notificaciones, y se tokenizaron las tarjetas de existencias, KPIs y perfil del sidebar para ambos temas. El encabezado ya no repite avatar ni nombre/rol.
- Se corrigió el anclaje del popover de filtros en pantallas de hasta 420 px para que el panel no quede recortado.
- QA visual: se guardaron capturas claras/oscuras de los diez listados filtrables, Dashboard, Existencias, notificaciones, header/sidebar, compra multilínea con descuento e IVA, producción en gramos y escenarios POS. Desviación: la vista previa disponible se limita a 396 × 275 px; por ello las capturas son de página completa en formato móvil y los detalles altos del POS se documentan en vistas separadas.
- Se centralizó el estado de vencimiento por fecha de calendario (con límites al fin del día), se restringieron los candidatos de congelación a lotes frescos elegibles y las alertas de stock bajo ahora muestran «Ahora».
- Se ordenaron los movimientos por ID descendente, se resaltan por tres segundos los nuevos registros maestros, las compras muestran sus lotes y el POS detalla bloqueos de pago y conserva mensajes completos de error.
- Se centralizó el destino inicial por permisos y se versionó el seed persistido; los datos se regeneran si la versión queda antigua o un rol activo pierde todas sus asignaciones.
