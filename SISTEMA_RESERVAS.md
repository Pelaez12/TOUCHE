# Sistema de reservas y seguimiento Touché

Estado: gestión de clientas con DNI, panel de retorno, **Proceso Interno v1 de agenda operativa** (`0009`) y **cuentas internas `@touche.pe` con rol único de Administrador + Colaboradores** (`0010`) **desplegados y verificados en producción en Cloudflare** (`touche-reservas` + `touche-admin-api`, `28/28` pruebas automáticas y verificación en vivo aprobadas el `18/11/2026`). La edición libre de atenciones históricas, reglas de retoque configurables y la reserva pública del lado del cliente quedan para fases posteriores. Detalle operativo en `PROCESO_INTERNO.md`, `AGENDA.md` y `PUBLICACION.md`.

Publicada en Cloudflare con acceso administrativo por clave y sesión privada; instrucciones en `PUBLICACION.md`. Agenda permite dar de alta a la clienta desde la propia cita y seleccionarla al guardar, conservando el borrador sin cambiar de apartado.

### Reglas de equipo, descansos y capacidad confirmadas (17–18 de noviembre de 2026)

- **Equipo**: 3 estilistas coloristas senior (`Milagros Núñez` —descansa lunes; colorista y cortes—, `Miriam Pecho` —descansa martes; colorista, alisado, botox, maquillaje, peinados y moños—, `Maritza Trucios` —descansa miércoles; colorista, alisados, botox, cepillados—), 1 asistente y **colorista junior** (`Martha Arone` —descansa martes; habilitada para todos los 24 servicios de `COLOR` e hidrataciones + apoyo como asistente—) y 1 recepción (`Silvia Rodríguez` —lun–sáb—).
- **Plan B temporal en manos, pies, depilación, cejas y pestañas**: la manicurista anterior dejó de laborar por enfermedad; mientras se contrata reemplazo, `Miriam` y `Maritza` cubren esos servicios únicamente como **Plan B** sin desplazar su rol principal de coloristas.
- **Descansos y excepciones**: el descanso compartido de Miriam y Martha los martes responde a estrategia del salón (no aplicar bloqueo único de descanso por día). Los cambios urgentes o imprevistos deben registrarse con motivo y aviso previo.
- **Doble flujo de asignación**: si la clienta solicita expresamente una especialista, la cita se asigna a esa persona; si solicita solo un servicio/horario, el turno se asigna según habilitación del servicio (`primary` > `junior` > `plan_b`) y **por orden de llegada física** de las profesionales ese día desde las 09:00 a.m.
- **Recordatorios y limpieza**: recordatorio manual por WhatsApp (`wa.me`) confirmado en **ambos momentos** (día anterior y mismo día). Las 4 citas actuales en `appointments` son de prueba y deben eliminarse solo esas filas en D1, preservando las clientas reales y las `1.551` atenciones históricas; la ficha de prueba `#521` (`Fabrizzio Paolo Pelaez Bautista`, DNI `61000000`) ya fue archivada a Eliminadas el `18/11/2026` (`520` activas restantes).
- **Tiempos base confirmados (18/11/2026)**: evaluación capilar `20 min`, hidratación exprés `15 min`, hidratación profunda `35–40 min`, corte `40–60 min`, peinados `90 min`, raíz (retoque de tinte) `120 min`, shades `90–120 min` y mechas/balayage `180–240 min` (editables por cita; `QUÍMICO`, `MAQUILLAJE`, `MANOS / PIES` y `DEPILACION` permanecen editables manualmente mientras no se fije base adicional).
- **Estado de implementación y producción (18/11/2026)**: Proceso Interno v1 y cuentas internas (`0009` y `0010`) **aplicados en D1 remoto `touche-reservas` y publicados en `touche-admin-api`** (`28/28` pruebas en `npm test`, `check_web_access.mjs` en vivo y `ETag`/`304` verificados; respaldo previo en `data/backups/before-0009-0010-20261118.sql`). Incluye tablero paralelo por colaboradora activa (`2` senior sin asistente los martes —Milagros y Maritza—, `2` senior + Martha Lun/Mié, `3` senior + Martha Jue–Sáb), check-in de orden de llegada física, cola `pool_turn`, registro de `no_show`, historial de reprogramaciones, recordatorios WhatsApp (`wa.me`) día previo y mismo día, notas técnicas al completar, optimizaciones de velocidad (bootstrap único en `#agenda`, carga diferida por pestaña, `debounce` y caché `ETag`/`304` en estáticos) y autenticación interna `@touche.pe` sin Gmail (`1` única cuenta `admin@touche.pe` activa + `5` colaboradoras pendientes hasta asignarles contraseña desde `#cuentas`, con RBAC estricto en Worker y UI).

## Implementación actual

El panel permite seleccionar dos períodos consecutivos sin solapamiento, filtrar por servicio inicial y consultar el retorno al salón por cualquier servicio. Incluye búsqueda, ficha de historial, fechas excluidas y exportación CSV. La definición de retorno es una identidad con visita utilizable en ambos períodos. Agrupa varios servicios del mismo día en una visita y muestra base vacía sin porcentaje.

El estado «Sin regreso registrado» describe únicamente los registros disponibles; no declara abandono ni retoque vencido. Las identidades provisionales se basan en nombres y pueden requerir revisión. Los ajustes de retoque del administrador no están implementados en la interfaz todavía.

Cloudflare D1 `touche-reservas` contiene las tablas e importación inicial. La interfaz local consulta y guarda en D1 mediante el proxy Node.js y el Worker `touche-admin-api`. La API exige una credencial exclusiva del servidor. No enviar esa credencial al navegador.

La sección Clientas permite crear, editar y guardar nombre, teléfono, fecha de nacimiento y notas; eliminar de forma recuperable y restaurar. Incluye búsqueda con autocompletado global y del directorio, filtros de activas/eliminadas, ordenación y paginación. Las operaciones quedan registradas en auditoría. Eliminar no borra atenciones.

El directorio distingue fichas con teléfono utilizable de Faltan datos, además de Todas y Eliminadas. El panel de retorno incluye próximos pasos y último servicio registrado del historial completo. Ofrece un borrador personalizado editable y un enlace a WhatsApp con texto prellenado. El usuario confirmó que no necesita conectar WhatsApp ni enviar automáticamente: el envío se completa manualmente en WhatsApp. Plantilla y promoción opcional se guardan en D1. Detalles en `MENSAJES_WHATSAPP.md`.

La identidad visual procede del manual proporcionado por el usuario. `DESIGN.md` documenta los recursos y la adaptación de patrones de contactos de Calendly. No se presenta como una réplica exacta de una interfaz privada no observada.

Las mejoras surgidas de la comparación solicitada con otras aplicaciones se documentan en `AUDITORIA_FUNCIONAL.md`. Mantenerlas como propuestas hasta definir su alcance; no confundirlas con comportamiento ya implementado.

## Objetivo

Centralizar el historial de clientas, los tratamientos realizados, las reservas y el seguimiento de próximos retoques. Partir de los registros reales del Excel recibido y permitir que el administrador mantenga la información desde el sistema.

## Clientas

Cada ficha tiene identificador interno, nombre, DNI, teléfono, cumpleaños opcional, notas e historial. El usuario pidió DNI para prevenir duplicados: obligatorio para nuevas fichas, formato de ocho dígitos y unicidad incluso en fichas archivadas. Las fichas importadas sin DNI se pueden seguir editando y completar después; no inventar documentos. Un DNI ya registrado no se elimina accidentalmente mediante una edición antigua que omita ese campo. La validación es de formato y unicidad, sin conexión a RENIEC. No usar teléfono ni nombre como prueba de identidad.

## Servicios

Importar el catálogo de servicios, categorías y precios en soles del Excel. Permitir edición administrativa. Duración y plazo de retoque son parámetros distintos: la primera determina la ocupación en agenda y el segundo, el seguimiento posterior.

## Plazos y próximos retoques

Requisito confirmado: el administrador decide y puede editar los plazos por servicio. También puede ajustar la próxima fecha para una clienta específica.

Comportamiento propuesto para implementar:

- Sin un plazo configurado o una fecha individual, mostrar «Sin plazo configurado»; no declarar a la clienta al día ni atrasada.
- Usar el último servicio efectivamente realizado y con fecha validada para calcular el próximo retoque.
- Si hay una fecha individual de seguimiento, usarla con prioridad y mostrar que fue ajustada manualmente.
- Mostrar fecha prevista, días restantes o transcurridos y estado pendiente, próximo o vencido, según la fecha del salón en America/Lima.
- Conservar un historial de cambios de reglas y fechas individuales.
- Al editar un plazo, explicar qué seguimientos se recalcularán; conservar los ajustes individuales y el historial de atenciones.
- Una reserva no equivale a un tratamiento realizado. Completar una atención actualizará el historial; cancelar una reserva no lo hará.

La ventana para considerar un retoque «próximo» también debe ser configurable. No se ha acordado un número de días.

## Reservas y agenda

Cada reserva relacionará clienta, servicio, fecha, hora, duración y estado. Se propone admitir estados programada, completada y cancelada, y conservar su historial. La agenda deberá permitir consultar fechas y crear o editar reservas.

Los conflictos de horarios deben validarse con la duración y el recurso o profesional asignado. Falta definir el equipo y la capacidad del salón antes de fijar esa regla. No incorporar los horarios, cupos ni reglas del negocio de kekitos.

## Importación inicial

Conservar procedencia de cada dato: archivo, hoja, fila y columna. Preservar el valor original junto a cualquier valor normalizado. La importación debe ser repetible sin duplicar atenciones y presentar un informe de filas importadas, pendientes e inconsistentes.

No deducir años correctos únicamente a partir de encabezados ni convertir registros históricos futuros en reservas. Las fechas contradictorias quedan pendientes de revisión y no deben activar alertas de retoque hasta validarse. Mantener separadas identidades dudosas; cualquier fusión requiere una decisión explícita del administrador.

### Revisión autorizada del 27 de octubre de 2026

El usuario confirmó el período 2025–2026 hasta hoy y pidió corregir el historial. Para esta fuente se fija 2025 en la columna anual de 2025 conservando día/mes; se corrige el encabezado aislado septiembre 2020 a 2026 dentro de la secuencia mensual; las fechas completas de columnas mensuales conservan su fecha aunque estén desplazadas de columna. Los textos inequívocos y días separados por comas se normalizan, conservando celda y valor originales. Fechas futuras, días ambiguos y textos sin fecha siguen pendientes. Esta política se limita a este archivo; detalle y respaldo en `REVISION_FECHAS.md`.

Resultado: 1.549 atenciones (420 de 2025 y 1.129 de 2026), 506 incidencias resueltas y cinco pendientes. La sección Revisión del historial permite filtrar año, buscar nombre/servicio y consultar originales y motivos de corrección. El corte es 27 de octubre de 2026 y la última atención disponible, 26 de octubre; no inventar actividad del día de corte.

## Referencia visual

Calendly será una referencia para claridad de calendario, selección de fecha y hora y confirmación de reserva. Usar REA para documentar la observación solicitada. El sistema de gestión de clientas y retoques tendrá una implementación propia adaptada a Touché.

## Separación técnica

Código, documentación, dependencias, almacenamiento, pruebas y recursos de despliegue propios dentro de esta carpeta. FABRIZZITO'S KEKITOS es otro proyecto y no debe modificarse para alojar este sistema. Los datos de clientas requieren acceso restringido; todavía no se ha definido una modalidad pública de reservas.

## Verificación antes de considerar terminado el sistema

- Reconciliar la importación con el Excel y revisar las fechas ambiguas.
- Verificar alta y edición de clientas, teléfonos y cumpleaños.
- Verificar edición de plazos por el administrador y prioridad de fechas individuales.
- Probar los límites de fechas, plazos sin configurar y múltiples servicios por clienta.
- Verificar que completar una atención actualiza el seguimiento y cancelar no crea historial realizado.
- Validar conflictos de agenda según los recursos definidos.
- Comprobar que los cambios sobreviven a recargas y que el acceso a datos está protegido.
- Revisar escritorio y móvil y documentar las comprobaciones realizadas.

Actualizar esta especificación cuando el usuario confirme reglas nuevas o se verifique una implementación.
