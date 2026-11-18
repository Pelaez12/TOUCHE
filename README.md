# Touché: administración de clientas y retorno

Proyecto independiente de Fabrizzito's. Interfaz HTML/CSS/JavaScript sin frameworks. Servidor local con módulos incluidos con Node.js y API Cloudflare Workers con D1 propio. Gestión de clientas con DNI único, panel de retorno, historial y agenda diaria con datos en vivo. Las reglas de retoque aún no tienen interfaz.

## Uso

Versión publicada: [Abrir Touché](https://touche-admin-api.fabrizziopelaez91.workers.dev/). Requiere la clave privada guardada en esta laptop en `.local/ACCESO_TOUCHE.txt`. Funciona sin mantener la laptop encendida. Detalles de acceso y despliegue en `PUBLICACION.md`.

1. En esta laptop, la conexión del servidor ya está preparada en `.local/`, excluido de Git. No copiar sus credenciales al frontend. Otra instalación necesita configurar su acceso de servidor al Worker.
2. Ejecutar `npm start` desde esta carpeta.
3. Abrir `http://127.0.0.1:5188/#clientas` para crear, editar, guardar, eliminar o restaurar fichas. Usar el buscador para ver sugerencias por nombre o teléfono.
4. Abrir Retorno de clientas para comparar períodos, filtrar, consultar fichas o exportar resultados a CSV.
5. Abrir Revisión del historial (`#revision`) para consultar atenciones de 2025 y 2026, filtrar año, buscar nombre/servicio y ver fechas originales y correcciones.
6. Abrir Agenda del día (`#agenda`) para agendar, editar, reprogramar, cancelar o marcar realizada una cita; guardar notas por día y ajustar el horario general. Detalles y límites en `AGENDA.md`.

La importación inicial ya fue realizada. `scripts/import_history.py` permite extraer de nuevo el Excel con Python/openpyxl sin modificarlo; su JSON en `data/` es un archivo intermedio, no el almacenamiento que consulta actualmente la interfaz.

Ejecutar `npm test` para comprobar cálculos y validaciones. El servidor local escucha solo en esta laptop; la versión Cloudflare sirve la interfaz con clave y sesión privada, además de admitir el proxy local existente. No es un sistema de roles multiusuario.

## Interpretación

- Base: nombres distintos con al menos una fecha utilizable en el período inicial.
- Retorno: alguna atención de esas mismas identidades en el período posterior, por cualquier servicio.
- Porcentaje: retornadas / base. Si la base está vacía, no hay porcentaje.
- Varios servicios de una persona el mismo día cuentan como una visita.
- «Sin regreso registrado» describe el archivo disponible, no abandono ni retoque vencido.
- Los días desde la última visita se calculan hasta el final del período posterior.
- Las fechas se reconciliaron con la confirmación del usuario del período 2025–2026 y dos confirmaciones individuales posteriores. Los valores ambiguos y fechas futuras siguen excluidos. Estado actual: 1.551 atenciones y una incidencia pendiente al 27 de octubre de 2026. Política y resultados en `REVISION_FECHAS.md`.
- La identidad provisional usa nombre con espacios normalizados y mayúsculas. No fusiona variantes ni teléfonos; los homónimos y nombres repetidos requieren revisión. Los resultados son provisionales hasta resolver esas identidades.
- Los períodos pueden tener diferente duración y cobertura incompleta. La interfaz muestra la fecha de corte y permite ajustarlos.

## Rust y JavaScript

El usuario planteó Rust combinado con JavaScript para reducir peso y mejorar velocidad. No se encontraron rustc/Cargo en PATH ni en las rutas habituales comprobadas. Esta primera versión funciona con el runtime existente. Rust puede incorporarse al backend si se decide y se verifica su beneficio; todavía no hay código Rust ni benchmarks comparativos. No confundir velocidad de ejecución con velocidad de desarrollo ni con tamaño final de descarga.

## Base de datos Cloudflare

Base independiente: `touche-reservas`. Identificadores en `cloudflare-resources.json`; esquema en `migrations/0001_initial.sql`. La base ya fue creada e importada mediante el conector de Cloudflare y sus recuentos se verificaron remotamente. No se modificaron bases de datos del otro proyecto.

`scripts/prepare_d1.py` prepara solicitudes parametrizadas en `data/d1-queries.json` y comprueba migración, claves foráneas y repetición sin duplicados en SQLite temporal. Las fechas dudosas se guardan en `import_issues`; no se incorporan a `treatments` hasta su revisión. Los cumpleaños originales se conservan como texto pendiente de normalización.

La interfaz consulta D1 en vivo a través del proxy local y `worker/index.mjs`. `migrations/0002_client_management.sql` añade cumpleaños normalizado, fecha de modificación y archivo recuperable. Crear, editar, eliminar y restaurar usan sentencias parametrizadas y auditoría en un lote transaccional. Nunca colocar tokens de Cloudflare ni la credencial de enlace en JavaScript del navegador.

`scripts/import_history.py` conserva la extracción inicial estricta. La revisión posterior usa `scripts/reconcile_history.py` y produce `data/history-reconciled.json` y un plan parametrizado privado. La migración 0004 ya está aplicada; no repetirla ni sustituir la base actual por el JSON inicial. `tests/test_history_dates.py` valida las reglas y `scripts/verify_date_plan.py` comprueba el plan contra el respaldo previo, sin modificar D1.

Diseño y referencia de marca en `DESIGN.md`. Fuente Montserrat e iconos SVG alojados localmente; los iconos Phosphor se obtienen de una dependencia de desarrollo y conservan su licencia.

## Contactar a las clientas

Clientas separa Directorio con teléfono, Faltan datos, Todas y Eliminadas. Retorno muestra el último servicio, próximos pasos y el botón Preparar WhatsApp. La plantilla y promoción opcional se editan en esa pantalla y se guardan en D1 mediante `0003_message_preferences`.

El botón abre un enlace con el mensaje prellenado; la persona administradora pulsa Enviar en WhatsApp. No requiere conectar Meta ni enviar desde la aplicación. Comportamiento y criterios de teléfono documentados en `MENSAJES_WHATSAPP.md`.
