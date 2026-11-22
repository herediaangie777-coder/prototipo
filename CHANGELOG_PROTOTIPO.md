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

## 2026-11-22

- Se completó la compra multilínea en modal adaptable con edición protegida si hay movimientos, cálculo en vivo de subtotal/descuento/IVA/total en pesos, asociación de lotes y reporte por rango de fechas.
- Producción opera en dos pasos: orden En proceso, edición limitada al estado, finalización con bolsas enteras, cálculo en vivo de kg/merma/rendimiento y lote congelado generado.
- El POS diferencia unidades para producto fresco y bolsas enteras para congelado; guarda referencias de transferencia en los pagos y presenta detalle/comprobante con lotes, descuentos, IVA y métodos de pago.
- El dashboard exporta los datos de cada widget por separado, expresa stock en kg (incluido congelado) y permite iniciar producción desde las sugerencias de congelación.
- Se actualizó README y QA con el alcance y el inventario honesto de capturas. Quedan pendientes capturas claras/oscuras específicas de matriz de roles, detalle de producto con lotes, modal de finalizar y botones de exportación por widget; no hay herramienta de captura de navegador disponible en este entorno.
- Se comparó la suite v2 con `git show HEAD:src/data/services/business.test.ts`, se recuperaron los casos de fecha, permisos, validaciones de maestros, ventas y FEFO adaptados al esquema vigente, y se separaron edición de compras, anulaciones de producción, bolsas congeladas y pagos mixtos. Se eliminaron únicamente las pruebas de alteración manual de stock almacenado y venta congelada en bultos, incompatibles con inventario derivado de lotes y venta congelada por bolsas.

### Migración de las 22 pruebas de `HEAD`

| # | Prueba de `HEAD` | Estado en la suite actual |
| --- | --- | --- |
| 1 | Clasifica vencimiento por fecha de calendario y fin del día | Restaurada: hoy, mañana, pasado mañana y ayer. |
| 2 | Filtra candidatos frescos, activos, transformables y no vencidos | Restaurada con selector de lotes v2. |
| 3 | Ordena sugerencias críticas y en advertencia | Restaurada con `freezeSuggestions`. |
| 4 | Interpreta fechas ISO sin desplazamiento horario | Restaurada para día ISO y timestamp local. |
| 5 | Convierte unidades de compra/venta a kg | Restaurada para gramos, bultos y peso unitario requerido. |
| 6 | Crea compra multilínea con IVA, descuento y línea sin lote | Adaptada; comprueba lote opcional, pesos y asociación posterior. |
| 7 | Rechaza compra vacía y descuento inválido | Adaptada; comprueba compra vacía y total negativo, que es la regla del servicio v2. |
| 8 | Asocia lote sin sumar stock dos veces | Adaptada dentro de la prueba de compra y asociación de lote. |
| 9 | Anula compra sin consumo y bloquea consumida/anulada | Adaptada; mantiene casos de compra anulable y bloqueo por movimientos. |
| 10 | Simula stock insuficiente escribiendo `producto.stock_disponible` | Eliminada: v2 no almacena stock en producto; el stock se deriva de lotes y el bloqueo por consumo se prueba con movimientos reales. |
| 11 | Produce calibre correspondiente y valida lote origen | Adaptada en creación/finalización de orden; verifica calibre de salida, merma, reserva de stock y lote generado. |
| 12 | Vende 250 g y anula devolviendo cantidad al lote | Restaurada con conversión a 0.25 kg y restitución FEFO. |
| 13 | Vende dos bultos de congelado de 10 kg | Eliminada: v2 solo permite vender congelados en bolsas enteras; fresco sí conserva unidades de empaque. |
| 14 | Pago mixto, suma incorrecta y rechazo de Tarjeta | Adaptada y separada: pago mixto válido, inválido y método fuera del catálogo son pruebas distintas. |
| 15 | POS con IVA decimal y pago mixto exacto | Restaurada con cantidad fresca en kg y validación de importes. |
| 16 | Consistencia de pagos/seed e invariantes de transacciones | Adaptada en la prueba de seed v2, que verifica métodos permitidos, pagos mixtos, fechas y datos coherentes. |
| 17 | Permisos y errores de login | Adaptada y ampliada con login inválido/inactivo y permisos de Vendedor/Operario. |
| 18 | Ruta inicial según rol y caso sin permisos | Adaptada con rutas iniciales por rol y denegación de módulos no autorizados. El SPA redirige; no emite una respuesta HTTP 403. |
| 19 | Agrupación local y periodo anual de 12 meses | Restaurada para agrupación diaria local y doce meses calendario. |
| 20 | Flujo integral compra → producción → venta → anulación | Restaurada con `checkInvariants` después de cada operación. |
| 21 | Validación de roles/usuarios y protección de rol principal | Adaptada; incluye duplicado, caracteres, permiso obligatorio, correo inválido, rol principal y auto-inactivación. |
| 22 | Edición de cliente con documento numérico | Restaurada con búsqueda/edición por documento numérico. |

- Se migró el modelo local y sus servicios a productos en kg/bolsas, inventario derivado de lotes, producción en dos pasos, ventas FEFO con lote obligatorio, ubicaciones y permisos por módulo/acción. Se incrementó `SEED_VERSION` a 5 y se actualizó el seed y sus invariantes.
- Se eliminaron los ajustes manuales de existencias; las compras sin lote no generan stock y las producciones finalizadas generan un lote congelado con vencimiento.
- Desviación bloqueante: `db/fresas_oriente_bd_v2.sql` no está en el workspace, el historial ni la rama remota disponible. No se fabricó ni copió un dump sustituto. La matriz `permisos_privilegios`, sus asignaciones demo y los catálogos geográficos se implementaron provisionalmente a partir de la descripción recibida; no pueden certificarse como idénticos al SQL v2 hasta contar con ese archivo.
- Se retiraron las rutas y pantallas independientes de Lotes y Existencias; los lotes ahora aparecen en detalles de Compras y Productos, con exportación real de existencias en Excel y PDF.
- Se alinearon formularios, listados y detalles de maestros con el modelo v2, incluidos estados editables y selects dependientes de departamento/municipio. La matriz de roles ahora aplica privilegios válidos, acceso por Consultar, selección por filas/columnas y permisos exactos por acción.
- Las notificaciones identifican la fresa, su calibre y cantidad, en vez de presentar el lote como sujeto de la alerta.

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
