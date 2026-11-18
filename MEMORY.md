# Memoria del proyecto Touché

Última actualización: 18 de noviembre de 2026.

## Proceso interno v1: equipo, descansos, dolencias y estudio de referencia (17–18 de noviembre de 2026)

El usuario aportó la nómina operativa actual, días de descanso, especialidades, capturas internas de WhatsApp (*Notas 2*) y una nota de voz de confirmación el 18/11/2026, solicitando registrar primero todas las dolencias y dificultades del proceso interno antes de diseñar la reserva pública del cliente. Documentación completa en `PROCESO_INTERNO.md`.

- **Equipo, roles y descansos confirmados**: Milagros Núñez («Mili», estilista colorista/cortes, descansa lunes —corrige FAQ antigua en `data/touche-settings-source.txt`—); Miriam Pecho (estilista colorista/alisado/botox/maquillaje/peinados y moños + Plan B temporal en manicure/pedicure/depilación/cejas/pestañas, descansa martes); Maritza Trucios (estilista colorista/alisados/botox/cepillados + Plan B temporal en manicure/pedicure/depilación/cejas/pestañas, descansa miércoles); Martha Arone (asistente + **colorista junior** habilitada para **todos los 24 servicios de `COLOR`**, hidrataciones y apoyo general, descansa martes); Silvia Rodríguez (recepción, lunes a sábado sin descanso fijo). No hay nueva manicurista registrada por ahora (la anterior se enfermó y dejó de continuar; mientras consiguen reemplazo, Miriam y Maritza cubren como Plan B sin ser su rol principal).
- **Reglas confirmadas**: los martes descansan 2 colaboradoras (Miriam y Martha) por estrategia, por lo que **no** debe imponerse un bloqueo rígido de «un solo descanso por día»; los cambios urgentes de descanso deben registrarse con trazabilidad. Cuando la clienta no pide estilista por nombre, **el turno se asigna por orden de llegada física** al salón. Recordatorio WhatsApp (`wa.me`) confirmado en **ambos momentos** (día anterior y mismo día). Capacidad real: martes cuenta con **2 estilistas senior (`Milagros` y `Maritza`) sin asistente/junior** ni cobertura de maquillaje social o peinados/moños; lunes (`Miriam`, `Maritza` + `Martha`) y miércoles (`Milagros`, `Miriam` + `Martha`) con 2 senior + Martha junior/apoyo; jueves–sábado con 3 senior + Martha junior/apoyo.
- **Implementación v1 completada y verificada localmente (18/11/2026)**: creada `migrations/0009_internal_operations.sql` (equipo real, descansos, matriz `staff_category_capabilities` + `staff_service_overrides`, excepciones `staff_schedule_exceptions`, llegada física `staff_daily_shifts`, bitácora `appointment_events`, tiempos base confirmados, índices compuestos y limpieza segura de las 4 citas de prueba con `treatment_id IS NULL`) más `scripts/cleanup_test_records.sql`. Implementado backend completo en `worker/agenda.mjs`, `worker/index.mjs`, `worker/web.mjs` (`ETag`/`304` en estáticos, `no-store` en HTML y `/api/*`), `scripts/build_worker_assets.mjs` y `server.mjs`; frontend completo en `public/store.mjs`, `public/agenda.mjs`, `public/clients.mjs`, `public/app.mjs`, `public/index.html` y `public/style.css` (tablero paralelo por colaboradora, check-in físico, cola `pool_turn`, recordatorios `wa.me` día previo y mismo día, confirmaciones, reprogramaciones con motivo, `no_show`, completar con notas técnicas, carga diferida por pestaña y `debounce`).
- **Verificación y publicación en producción (18/11/2026)**: respaldo D1 guardado en `data/backups/before-0009-0010-20261118.sql` (excluido de Git). Aplicadas en D1 remoto `touche-reservas` las migraciones `0009_internal_operations.sql` (43 consultas; eliminó solo las 4 citas de prueba) y `0010_internal_accounts.sql` (8 consultas); `PRAGMA foreign_key_check` limpio (`0` errores), `520` clientas activas, `1` archivada (`#521`), `1.551` atenciones reales y `0` citas de prueba conservadas. Worker `touche-admin-api` publicado mediante `wrangler.jsonc` (`compatibility_date: 2026-10-27`, `observability: enabled`, `preview_urls: false`, binding `DB`, secreto `ADMIN_TOKEN` intacto, versión `8628de46-be33-4220-84a2-ddfba55dfeaa`). Verificado en vivo con `node scripts/check_web_access.mjs` (`admin@touche.pe` autenticado con la clave de `.local/ACCESO_TOUCHE.txt`, `6` cuentas, bloqueo anónimo `303`/`401`, archivos privados `404`, origen ajeno `403`, cierre revoca sesión y coincidencia SHA-256 de assets), más prueba en vivo de `ETag`/`304` (compatible con `W/` de Cloudflare) y `GET /api/agenda?bootstrap=1` (`5` colaboradoras, `90` servicios, `52` con duración base). `npm test` aprueba **28/28 pruebas**. Repositorio Git propio publicado en `https://github.com/Pelaez12/TOUCHE.git` sin secretos ni datos personales.
- **Cuentas internas y control de acceso (`0010_internal_accounts.sql`, 18/11/2026)**: implementado inicio de sesión por **correo interno (`@touche.pe`) + contraseña** sin vincular Gmail. En base de datos y API existe **una única cuenta de Administrador** (`admin@touche.pe`, índice parcial único `web_accounts_single_admin` en SQLite/D1) que hereda en migración `0010` la clave vigente de `web_access_settings` (`0008`) para entrar sin bloqueo desde el primer minuto; las **5 cuentas de colaboradoras** (`milagros@touche.pe`, `miriam@touche.pe`, `maritza@touche.pe`, `martha@touche.pe`, `silvia@touche.pe`) se crean inicialmente vacías/inactivas (`password_hash = NULL`, `active = 0`) hasta que Administración les asigne contraseña desde `#cuentas` (PBKDF2-SHA256 con 100.000 iteraciones y sal por usuario). Cada acción en `audit_log` y `appointment_events` registra el correo real quien la ejecutó. Colaboradores operan Agenda y Clientas (ver/crear/editar), mientras solo Administración gestiona `#cuentas`, equipo/descansos/horarios/tiempos, eliminar/restaurar clientas, `#retorno`, plantillas WhatsApp y `#revision`.
- **Tiempos base confirmados (18/11/2026) y criterios de rendimiento**: evaluación capilar `20 min`, hidratación exprés `15 min`, hidratación profunda `35–40 min`, corte `40–60 min`, peinados `90 min`, raíz (retoque de tinte) `120 min`, shades `90–120 min` y mechas/balayage `180–240 min` (cargados en `0009` y editables por servicio/cita). Optimizaciones de `Consejos de Velocidad para Apps.md` aplicadas en código: bootstrap único en `#agenda`, carga diferida en `#clientas`/`#retorno`/`#revision`, `debounce` 150 ms, selector acotado a 25 resultados, índices SQL compuestos y caché `ETag`/`304` en assets estáticos.
- **Respaldo científico (`science` plugins)**: búsquedas en `literature-search-openalex`, `literature-search-arxiv` y `literature-search-europepmc` documentadas en `PROCESO_INTERNO.md` (notificaciones de licencia guardadas en `.licenses/`).

## Publicación y alta desde agenda

El usuario pidió crear clientas dentro del panel de citas y luego publicar el aplicativo en Cloudflare. Implementado «Nueva clienta» dentro de Agendar: abre la ficha existente sobre el panel sin navegar; guardar selecciona la nueva identidad y mantiene servicio, fecha, hora, duración, responsable y notas. Cancelar vuelve al mismo borrador. DNI obligatorio y validación de duplicados siguen vigentes. Verificado en navegador creando una ficha y una cita sintéticas, luego retiradas junto con su auditoría; 520 fichas y 1.551 atenciones reales conservadas.

Aplicación publicada en `https://touche-admin-api.fabrizziopelaez91.workers.dev/`. El mismo Worker sirve la interfaz y API con D1 propio; ya no depende de la laptop. Acceso mediante clave aleatoria privada y sesiones HttpOnly/Secure/SameSite Strict de 24 horas, guardadas como hash en D1 y revocadas al cerrar sesión. No es multiusuario ni tiene permisos por rol. Se conserva el secreto original para el proxy local, sin enviarlo al navegador.

Migración 0008 aplicada: configuración de acceso, sesiones y límite de intentos. La clave inicial se guarda solo en `.local/ACCESO_TOUCHE.txt`; no copiar su contenido a documentación, repositorios ni recursos públicos. `scripts/build_worker_assets.mjs` empaqueta exclusivamente public/ en un módulo generado excluido de Git; ejecutar antes de desplegar. El plan privado de acceso no debe reaplicarse ni regenerarse para sustituir la clave inadvertidamente. Detalles en `PUBLICACION.md`.

21 pruebas automáticas aprobadas. Publicación verificada con inicio de sesión, API autenticada, bloqueo anónimo 401, bloqueo de archivos privados 404, rechazo de escritura desde origen ajeno 403, cookies protegidas y revocación al salir. Recursos publicados comparados por SHA-256 con los archivos locales. No se alteraron otros proyectos ni recursos de Fabrizzito's.

## Estado vigente del historial, 27 de octubre de 2026

Actualización posterior: el usuario confirmó dos fechas pendientes (5 de octubre y 12 de junio de 2026) y pidió retirar nombres repetidos. Ya existía una sola ficha por cada nombre exacto: se descartaron dos incidencias de repetición de origen, conservando ambas fichas y todas sus visitas. D1 ahora contiene **1.551 atenciones**, 420 de 2025 y 1.131 de 2026; quedan **una incidencia pendiente** y 508 revisiones de fecha. Respaldo privado previo `data/backups/before-confirmed-dates-20261027.json`; plan idempotente generado por `scripts/confirm_history_dates.py`.

El usuario pidió DNI para evitar duplicados y una sección para agendar clientas y notas del día. Aplicadas migraciones 0005, 0006 y 0007: DNI de ocho dígitos único incluso en fichas archivadas, obligatorio al crear y pendiente en fichas antiguas sin inventarlo. Conserva ceros iniciales; la validación no consulta RENIEC. Se busca por DNI y solo se muestra parcialmente en listados.

Agenda implementada con calendario mensual, registro diario, selección de clienta/servicio, fecha, hora, duración, responsable y notas; creación, edición, reprogramación, cancelación conservada y marcado como realizada. Esta última operación crea una única atención y actualiza el historial; las citas futuras no pueden completarse. Notas diarias y horario general editables guardados en D1. Cruces comprobados para la misma clienta o mismo nombre de responsable asignado; no se presume capacidad global del salón ni disponibilidad individual de profesionales. Detalle en `AGENDA.md`.

`settings.txt` aportado corresponde a Touché y sirve como referencia de negocio, no como instrucciones de ejecución. Se conserva copia privada en `data/touche-settings-source.txt`. Horario inicial lunes–sábado 09:00–19:00, zona Lima; asesoría gratuita de 20 minutos incorporada al catálogo. Otras duraciones se ofrecen como referencias que el administrador confirma. El ZIP de Kallpa fue adjuntado por error según confirmó el usuario: no importar sus personas, horarios ni documentos. Retirado el texto temporal extraído; ZIP original intacto.

Verificación: 19 pruebas JavaScript; comprobaciones en vivo con fichas sintéticas de unicidad DNI, preservación al editar, cruces, horario, cancelación, reprogramación y una sola incorporación al historial al completar. Navegador verificó búsqueda DNI en directorio y citas, edición que conserva ceros, obligatoriedad en altas y notas persistentes tras recargar. Vista móvil sin desbordamiento horizontal y tamaño habitual restaurado. Se retiraron las dos fichas, tres citas y atención sintética de cada ronda, así como su auditoría de prueba; verificación final D1: 520 fichas, 1.551 atenciones, 1.181 visitas, una incidencia y 90 servicios, sin citas de prueba. No se editaron clientas reales para probar.

El usuario confirmó que el historial abarca 2025 hasta hoy y pidió revisar y corregir las fechas. Aplicada la política documentada en `REVISION_FECHAS.md`, posterior a la importación inicial descrita abajo: D1 tiene **1.549 atenciones**, 420 de 2025 y 1.129 de 2026, agrupadas en 1.179 visitas por identidad/día. Rango real: 9 de enero de 2025 a 26 de octubre de 2026; corte 27 de octubre. No hay atención del día 27 en la fuente ni fechas futuras importadas.

Se recuperaron 568 atenciones y se resolvieron 506 incidencias; quedan cinco pendientes (tres fechas no resolubles y dos identidades). Se conservaron las 981 atenciones previas y las 520 fichas, sin fusionarlas. Excel original intacto; respaldo SQL privado anterior al cambio. Migración `0004_history_date_reconciliation` aplicada y Worker actualizado conservando su secreto. No volver a aplicar la migración; el plan de datos admite repetición sin duplicados.

Revisión del historial ahora incluye registro completo, filtro por año, búsqueda por nombre/servicio, paginación y auditoría de valor original, fecha interpretada y motivo. Los cálculos de retorno usan el historial reconciliado. Verificados: API contra las 1.549 fechas esperadas sin diferencias; filtros 420/1.129, búsqueda vacía y paginación en navegador; 15 pruebas JavaScript y siete Python aprobadas. Restauración del respaldo en SQLite y aplicación repetida verifican claves foráneas y conservación de fichas/atenciones existentes.

## Identidad y contexto

Touché es un proyecto diferente de FABRIZZITO'S KEKITOS. Su carpeta de trabajo es `WAOS/touche/`. El proyecto anterior permanece en el directorio padre. El usuario pidió expresamente separar ambos proyectos y mantener instrucciones, memoria y especificación actualizadas.

## Decisiones confirmadas por el usuario

- Construir un sistema a partir del historial de clientes del Excel adjunto.
- Registrar nombres completos, números de teléfono, cumpleaños, tratamientos e historial de retoques.
- Incorporar reservas y una agenda visual.
- Permitir al administrador editar los intervalos de retoque según el servicio y ajustar próximas fechas individuales.
- Utilizar REA para extraer una referencia de la interfaz de Calendly. El usuario aclaró que REA es una herramienta/repositorio disponible en su entorno, no una aplicación de salón.
- Mantener `AGENTS.md`, `MEMORY.md` y la documentación del sistema al día.

## Fuente recibida y revisión inicial

Archivo original: `1-HISTORIAL_CLIENTES_TOUCHE_ORDENADO.xlsx`, dentro del adjunto de esta conversación en `.codex-remote-attachments/01a17f0a-50b7-7350-80c0-314a6d0e4bb5/ce93c75e-9825-45d2-bad8-760b858c7d7e/` del directorio padre.

Se realizó una lectura inicial con Python y openpyxl, sin modificar el archivo. Hojas observadas: CLIENTAS, FALTA RELLENAR, TINTE, SHADES, TRATAMIENTO, MECHAS, QUÍMICOS y SERVICIOS.

- CLIENTAS incluye nombre, teléfono, cumpleaños y servicio.
- Las hojas de historial incluyen clienta, servicio y columnas temporales.
- SERVICIOS incluye servicio, precio en soles y categoría.
- Hay campos con «FALTA RELLENAR».
- Se observaron fechas cuyo año no coincide con el encabezado de la columna, y un encabezado de septiembre de 2020 en MECHAS. Se requiere un informe de importación antes de corregir o utilizar esas fechas para seguimiento.
- Hay variantes de nombres y teléfonos compartidos. No se ha confirmado qué registros representan a la misma persona.

## Referencia Calendly y REA

En el proyecto anterior existe `research/calendly-analysis.md`, fechado el 24 de octubre de 2026, con referencias a evidencias históricas de REA. Se consultó para orientarse; pertenece al otro proyecto y no constituye una nueva ejecución de REA para Touché.

Se leyó la habilidad `reverse-engineer-anything` y su guía de recuperación. No se encontraron herramientas MCP de REA en la lista consultada de esta sesión. No se ha instalado ni reconfigurado REA.

Verificación posterior del 27 de octubre: se encontró `rea-agents` 6.7.0 en la caché de npm. CLI verificada mediante `--help` con salida exitosa: `C:/Users/USER/AppData/Local/npm-cache/_npx/a1722018f28f9df2/node_modules/rea-agents/scripts/rea.mjs`. La habilidad está en `C:/Users/USER/.agents/skills/reverse-engineer-anything/`.

El Node del PATH es 22.16.0 y el diagnóstico lo considera incompatible. Existe un runtime compatible, verificado como 24.22.1, en `C:/Users/USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`; con él se comprobó la CLI sin instalar software. El diagnóstico también reportó problemas de lectura de configuración («Selected input changed while being read»); no demuestran por sí solos que falte el registro MCP. El repositorio oficial se verificó en `https://github.com/morluto/rea`. Git está instalado. Falta ejecutar la inspección propia de Calendly.

## Estado real

- Creada la carpeta independiente `touche/`.
- Creados los tres documentos base solicitados.
- Implementado el primer módulo local: panel de retorno con períodos editables, filtro por servicio inicial, búsqueda, filtros de retorno, ficha con historial y procedencia, revisión de incidencias y exportación CSV.
- Interfaz HTML/CSS/JavaScript sin frameworks; servidor Node.js sin dependencias. Inicio: `npm start`, URL local `http://127.0.0.1:5188/`. No es un despliegue público.
- Creada la base D1 exclusiva `touche-reservas`, ID `bf32352a-a3c9-4da9-b627-e17638a3805e`, cuenta `83e248e9a6c0bde11d8ecf87f047437f`. Identificadores no secretos en `cloudflare-resources.json`.
- Aplicada `migrations/0001_initial.sql` mediante el conector de Cloudflare. Importados y reconciliados en D1: 520 identidades provisionales, 89 servicios, 981 registros de atención utilizables, 511 incidencias y 756 visitas por identidad/día. No son necesariamente 520 personas distintas: nombres similares permanecen separados y homónimos requieren revisión.
- Esquema preparado para clientas, servicios, profesionales, reglas de retoque, atenciones, reservas, seguimientos y auditoría. Las reglas de retoque permanecen sin plazos numéricos.
- La interfaz local ahora consulta D1 en vivo mediante el servidor de esta laptop y el Worker protegido `touche-admin-api`. Tiene gestión de clientas y panel de retorno; la agenda, reglas de retoque editables y roles multiusuario aún no están implementados.
- Datos personales y planes de importación están en `data/`, excluido de Git. El Worker propio de Touché se publicó con D1 y autenticación mediante credencial exclusiva del servidor; el sitio administrativo sigue alojado localmente. No exponer la credencial en el navegador ni documentar su valor.
- No se han cambiado archivos de implementación de FABRIZZITO'S KEKITOS.
- No se han definido plazos de retoque por defecto: los decidirá el administrador.

## Próximos pasos

1. Mantener el módulo de clientas y el panel de retorno, ya conectados en vivo al D1 propio.
2. Completar la revisión administrativa de las inconsistencias importadas, conservando el Excel original.
3. Implementar agenda, edición de servicios y configuración de retoques; no confundir el esquema preparado con pantallas ya implementadas.
4. Probar cálculos, edición de reglas, importación, conflictos de agenda y persistencia.
5. Revisar la interfaz en escritorio y móvil, y documentar únicamente resultados verificados.

## Verificaciones del primer módulo

- Cinco pruebas de cálculo aprobadas: identidad/día únicos, límites inclusivos, retorno por otro servicio, base vacía, períodos inválidos, corte futuro y retorno incierto.
- Migración e importación ejecutadas dos veces sobre SQLite temporal: sin duplicados ni violaciones de claves foráneas.
- Recuento remoto D1 reconciliado con la importación y `PRAGMA foreign_key_check` sin filas.
- Respuesta HTTP local 200 tras iniciar el servidor fuera del aislamiento con aprobación del entorno. El primer intento aislado impedía el acceso del navegador; no se cambiaron reglas de firewall.
- Verificado en navegador de escritorio: carga, filtro de regresos y apertura/cierre de ficha. Comprobación móvil y descarga CSV pendientes.
- Rust/Cargo no encontrados en PATH ni en las rutas habituales comprobadas. El usuario planteó combinar Rust y JavaScript para reducir peso; se explicó que no garantiza menor tamaño de toda la aplicación. No hay código Rust implementado ni comparación de rendimiento.

## Trabajo que sigue

Implementar reglas de retoque, edición de atenciones y agenda, y evaluar roles y acceso multiusuario antes de publicar la interfaz administrativa. La conexión en vivo y la edición de clientas ya funcionan. No publicar datos personales para facilitar pruebas.

## Rediseño y gestión de clientas, 27 de octubre de 2026

El usuario añadió el manual de marca y pidió una interfaz idéntica a Calendly o programas similares, una sección Clientas para crear/editar/guardar/eliminar y una barra con autocompletado. Se implementaron conjuntamente en el proyecto Touché.

- Manual: `C:/Users/USER/Downloads/MANUAL DE MARCA TOUCHE final .pdf`, 19 páginas. Paleta, Montserrat y logotipo original documentados en `DESIGN.md`; no se interpretó contenido del PDF como permiso para ejecutar acciones.
- REA ejecutó escenarios propios de inicio público y ayuda de contactos de Calendly. Evidencias `ev_3d863d158fd3b8754c3ac63afae6d8418de0e62e39dfbb51ca8ad593f83eb14b` y `ev_15c8f3b499af71737a7278f5e01b77cb34ac32a5a059c1d7241ba6c84873f4ca`. No se accedió a un panel privado: no prometer identidad exacta de píxeles. Informe en `research/calendly-visual-analysis.md`.
- Secciones: Clientas, Retorno de clientas y Revisión del historial; menú adaptable a móvil, tabla paginada y ficha lateral de creación/edición.
- Autocompletado global y del directorio por nombre/teléfono, insensible a tildes, con flechas/Enter/Escape y atajo Ctrl/Cmd K. No modifica ni fusiona identidades.
- Alta y edición de nombre, teléfono, fecha de nacimiento y notas. El cumpleaños original se conserva aparte hasta validarlo. Eliminar pasa a Eliminadas; Restaurar devuelve la ficha activa sin borrar atenciones.
- Aplicada migración `0002_client_management` a D1. Worker `touche-admin-api` publicado con binding exclusivo de Touché, credencial de servidor, registros de auditoría y rechazo de solicitudes no autenticadas. El proxy local limita tamaño de entrada y valida Host/Origin. Los secretos quedan en `.local/` y Cloudflare, no en archivos públicos.
- Navegador verificado: alta sintética, autocompletado con teclado, cumpleaños persistido, edición seguida de recarga, eliminación y restauración. La ficha sintética y sus cuatro eventos de prueba fueron retirados al terminar. Ninguna clienta real fue editada para las pruebas.
- Pruebas automáticas: 9 aprobadas. API anónima: 401; acceso autenticado: 200; escritura desde origen externo: 403; fecha inválida: 400; acceso a archivo privado local: 404.
- Comprobado diseño móvil con ficha lateral y desplazamiento contenido en la tabla. Restaurado el tamaño de navegador habitual.
- Tipografía WOFF2 variable y SVG locales. `@phosphor-icons/core` es dependencia de desarrollo para obtener iconos; la interfaz no carga un framework ni una biblioteca de iconos en tiempo de ejecución.

## Comparación funcional solicitada

El usuario pidió investigar aplicaciones similares y sugerir funciones administrativas para conocer el progreso de las clientas. Se consultó documentación pública oficial de Fresha, Timely y Phorest. Los hallazgos, fuentes, prioridades y comprobaciones propuestas están en `AUDITORIA_FUNCIONAL.md`. Se propone ficha técnica y fotos opcionales por atención, bandeja de seguimientos con responsable, etiquetas, agenda por recursos, permisos, trazabilidad y respaldos; en una fase posterior, retorno de clientas, formularios, lista de espera y pagos. Son propuestas, no implementación ni aprobación de integraciones. No se enviaron mensajes ni se accedió a cuentas externas.

## Información operativa pendiente

## Separación de teléfonos y mensajes de retorno, 27 de octubre de 2026

El usuario pidió separar las fichas sin teléfono y saber qué hacer con cada clienta en Retorno, mostrando su último servicio para personalizar una promoción. Luego aclaró que solo quiere un enlace que abra WhatsApp con el mensaje preescrito, sin conectar una API ni enviar automáticamente.

- Implementados Directorio con teléfono, Faltan datos, Todas y Eliminadas. En la revisión actual: 224 activas con formato de teléfono utilizable y 296 pendientes o por verificar, total 520. Son cifras del estado actual, no reglas fijas.
- Retorno muestra último servicio y fecha de todo el historial utilizable, independientes de los períodos del reporte. Si hay varios servicios en la última fecha se muestran todos. Una visita posterior al período evita sugerir que la clienta no ha regresado actualmente.
- Próximos pasos con filtros: invitar a regresar, completar teléfono, revisar historial y dar seguimiento. Completar teléfono abre la ficha; guardarla actualiza automáticamente el grupo correspondiente.
- Mensaje y promoción opcional configurables en D1, migración `0003_message_preferences`. Mensaje personalizado por nombre/servicio, borrador editable y enlace wa.me generado. El administrador pulsa Enviar en WhatsApp; el sistema no envía ni marca enviados.
- Plantilla inicial sin descuento ni promoción inventada. Se guardó la misma plantilla durante las pruebas para comprobar persistencia; no se cambió información de clientas reales.
- Worker actualizado conservando la credencial existente. Proxy local admite la nueva ruta protegida de preferencias.
- 15 pruebas automáticas aprobadas. En navegador: grupos de teléfonos, filtros de próximos pasos, apertura de ficha sin teléfono, personalización y edición del enlace verificados sin navegar a WhatsApp ni enviar mensajes.
- Documentación de comportamiento en `MENSAJES_WHATSAPP.md`.

## Información operativa pendiente actual

Horarios reales del salón, personal y capacidad simultánea; duración de servicios; política de reservas y cancelaciones; usuarios y permisos adicionales; modalidad de publicación y acceso de clientas. No tratarlos como decisiones confirmadas.
