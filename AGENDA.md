# Agenda diaria de Touché

Solicitada por el usuario el 27 de octubre de 2026. Acceso administrativo local: `http://127.0.0.1:5188/#agenda`, con el mismo Worker protegido y D1 exclusivo de Touché. Diseño propio inspirado en patrones de Calendly y en la identidad existente.

## Uso

Elegir fecha en el calendario mensual, con puntos en días con citas activas o realizadas. Agendar una clienta existente, seleccionar un servicio y confirmar hora y duración. La búsqueda de clientas admite nombre, teléfono y DNI; los documentos se muestran parcialmente en los selectores. Para una persona nueva, «Nueva clienta» abre la ficha sobre el panel de cita. Guardar la selecciona automáticamente conservando el borrador; cancelar regresa al mismo panel sin navegar. Nombre y DNI siguen siendo obligatorios para el alta.

Cada cita tiene notas y un responsable opcional. El nombre del responsable se usa para detectar cruces; escribirlo de forma consistente. Hay además notas del administrador por día, independientes de las citas, con guardado explícito y aviso si se intenta cambiar de fecha con cambios pendientes. Horas de Lima, UTC−05:00.

El administrador puede editar y reprogramar; cancelar conserva el registro. Marcar realizada exige que el final de la cita haya pasado y crea una sola atención vinculada, incluso si se repite la solicitud. Una cita programada o cancelada no crea historial. Las atenciones completadas conservan la cita original sin permitir reprogramación desde este módulo.

## Horarios y duración

Referencia aportada: `C:/Users/USER/AppData/Local/Temp/settings.txt`, copia privada en `data/touche-settings-source.txt`. Lunes a sábado de 09:00 a 19:00 previa cita. Días y apertura/cierre editables desde Agenda; cambiar el horario no mueve citas existentes. Se rechazan nuevas citas fuera del horario configurado y las que terminan al día siguiente.

Evaluación y diagnóstico capilar: gratuita, aproximadamente 20 minutos, añadida al catálogo. Referencias para confirmar en cada cita: hidratación profunda 35 minutos, raíz 2 horas y camuflaje de canas 2–2½ horas. Los packs y otros procedimientos pueden requerir más tiempo; no asignar duración universal por una coincidencia parcial de nombre. La fuente menciona atención de la directora los lunes 09:00–15:00: es información de referencia; la disponibilidad por profesional aún no tiene configuración propia.

Las promociones fechadas de la fuente no se activan automáticamente ni se convierten en precios vigentes. Los plazos de retoque siguen pendientes de configuración administrativa propia; no imponer el intervalo orientativo del archivo como regla fija.

## Comprobación de cruces y alcance

Se impiden citas programadas solapadas de la misma clienta o del mismo nombre de responsable no vacío. El final de una cita puede coincidir con el comienzo de la siguiente. La condición se comprueba en la propia escritura SQL, para cubrir solicitudes concurrentes. Las citas canceladas y completadas no bloquean nuevas reservas.

No se ha definido capacidad simultánea del salón, roster de profesionales, turnos individuales ni recursos. No se interpreta un horario vacío como disponibilidad garantizada. Esta agenda es administrativa; no publica enlaces de autoservicio ni envía confirmaciones automáticas.

## Persistencia y pruebas

Migraciones aplicadas en producción: `0005` DNI, `0006` agenda/notas/horario, `0007` asesoría, `0008` acceso web, `0009` operación interna y `0010` cuentas internas. No reaplicarlas.

### Actualización Proceso Interno v1 y cuentas internas (desplegado y verificado en producción — 18/11/2026)

Migraciones aplicadas en D1 remoto `touche-reservas`: `migrations/0009_internal_operations.sql` y `migrations/0010_internal_accounts.sql` (respaldo previo en `data/backups/before-0009-0010-20261118.sql`). Incorporan:
- Equipo real (`Milagros`, `Miriam`, `Maritza`, `Martha` junior/asistente, `Silvia` recepción), descansos fijos (admitiendo descanso compartido de Miriam y Martha los martes con aviso informativo), excepciones urgentes con alerta de citas afectadas y matriz de especialidades (`primary`, `junior`, `plan_b`).
- Tablero diario en columnas por colaboradora activa, registro de orden de llegada física (`staff_daily_shifts`) y doble modalidad de reserva (`requested` vs. `pool_turn` con asignación automática por orden de llegada y prioridad de nivel).
- Tiempos base confirmados por servicio (`services.duration_minutes` y `duration_max_minutes`) editables desde Agenda y por cita.
- Seguimiento completo de citas: recordatorios WhatsApp (`wa.me`) en día anterior y mismo día, confirmación, reprogramación con motivo y bitácora (`appointment_events`), registro de `no_show` sin crear atención, y finalización con notas técnicas guardadas en `treatments.technical_notes` (visibles al volver a agendar a la clienta).
- Optimización de carga: `GET /api/agenda?bootstrap=1`, carga diferida en el resto de pestañas, `debounce` (150 ms) con selector acotado a 25 clientas e `ETag`/`304` en assets estáticos.

Pruebas verificadas: `npm test` aprueba **28/28 pruebas** (límites horarios, fechas imposibles, descansos semanales, capacidad real por día, check-in físico, `pool_turn` futuro y autoasignación, recordatorios, confirmaciones, reprogramaciones, `no_show`, excepciones, edición de duraciones, notas técnicas al completar, RBAC de cuentas internas y caché `ETag`/`304`). Publicación en Cloudflare verificada en vivo con `scripts/check_web_access.mjs`. Comprobaciones automáticas usan SQLite en memoria y fichas sintéticas sin tocar datos reales.
