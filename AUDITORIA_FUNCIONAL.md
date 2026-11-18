# Comparación funcional y mejoras propuestas

Fecha: 27 de octubre de 2026.

## Alcance

Revisión de documentación pública oficial de Fresha, Timely y Phorest para identificar funciones pertinentes a Touché. No se ingresó a cuentas, no se auditaron sus sistemas internos ni se ejecutó REA en esta comparación. Touché aún no tiene una implementación que pueda auditarse técnicamente. Las siguientes son propuestas, no funciones implementadas ni compromisos nuevos confirmados.

## Hallazgos y aplicación propuesta

| Prioridad | Propuesta para Touché | Propósito y comportamiento |
| --- | --- | --- |
| Primera versión | Ficha técnica por atención | Servicio, profesional, observaciones, productos y fórmula utilizada cuando corresponda. Registrar resultado y siguiente paso sin reemplazar atenciones anteriores. |
| Primera versión | Evolución con fotos opcionales | Fotos antes/después vinculadas a la atención y su fecha, con autorización de la clienta y acceso restringido. El progreso lo registra el profesional; no inferirlo automáticamente desde fotos. |
| Primera versión | Bandeja de seguimiento | Mostrar motivo, vencimiento, responsable y estado: pendiente de contactar, contactada, cita agendada o cerrado. Evitar seguimientos duplicados y distinguir plazo vencido de tarea vencida. |
| Primera versión | Etiquetas y filtros | Etiquetas administrativas editables, como nueva, habitual o pendiente de datos. Combinar filtros por servicio, última atención y próxima fecha; no usar etiquetas para fusionar personas. |
| Primera versión | Control de agenda | Duración por servicio, profesional o recurso, ausencias, reprogramaciones y cancelaciones. Definir capacidad real antes de implementar conflictos. |
| Primera versión | Permisos y trazabilidad | Separar administrador, recepción y profesional según necesidades confirmadas. Registrar quién cambió fechas, historial o reglas, y cuándo. Probar permisos en el servidor. |
| Primera versión | Respaldo y exportación | Exportación propia de clientas e historial, acceso autorizado y comprobación de restauración de una copia. |
| Posterior | Panel de retorno | Clientas atendidas, quiénes volvieron, no retornadas, próximas citas y ausencias. Definir períodos comparables y contar visitas completadas, no servicios ni reservas canceladas. |
| Posterior | Formularios configurables | Preguntas por servicio, preferencias, observaciones relevantes y consentimientos. Conservar versión y fecha de las respuestas. |
| Posterior | Lista de espera | Fechas preferidas, servicio y responsable; permitir asignación manual al liberarse un horario. No prometer disponibilidad antes de validarla. |
| Posterior | Recordatorios y cumpleaños | Plantillas y tiempos editables. Proponer primero tareas y borradores internos; el envío externo y sus integraciones requieren autorización expresa. |
| Posterior | Pagos y anticipos | Importe acordado, anticipo, saldo y estado. No inferir ingresos cobrados a partir del precio actual del catálogo ni del historial sin importes. |

## Evidencia consultada

- Timely documenta notas, historial, fotos antes/después, documentos, formularios, recordatorios y lista de espera: https://www.gettimely.com/pricing/
- Fresha documenta formularios personalizados asociados a servicios y perfiles: https://www.fresha.com/help-center/knowledge-base/clients/607-client-forms-overview
- Fresha documenta perfiles con historial, notas, documentos y permisos para restringir datos de contacto: https://www.fresha.com/help-center/academy/run-your-business/manage-your-clients/lessons/100299
- Fresha documenta lista de espera con gestión manual o automática: https://www.fresha.com/help-center/knowledge-base/calendar/259-set-up-and-manage-your-waitlist
- Phorest documenta retorno por cohortes de dos períodos y distingue retorno al profesional y al salón: https://support.phorest.com/hc/en-us/articles/360018307159-Client-Retention-report-overview

Las métricas propuestas para Touché no copian sin revisión la definición de Phorest: su reporte también considera compras de productos como visitas. Para Touché se propone contar atenciones completadas, pendiente de confirmación.

## Qué auditar al implementar

1. Datos: identidades dudosas, campos faltantes, fechas ambiguas e importación repetida sin duplicados.
2. Seguimiento: reglas administrativas, fechas individuales, límites de día y múltiples tratamientos de una clienta.
3. Agenda: disponibilidad por recurso, solapamientos, concurrencia y efecto de cancelar o reprogramar.
4. Evolución: asociación correcta de fotos/notas a clienta y atención, orden temporal y permisos de acceso.
5. Administración: cambios registrados, restricción de exportaciones, persistencia y restauración de respaldos.
6. Indicadores: denominadores, períodos y exclusión de citas canceladas; no presentar cifras sin datos suficientes.

## Información operativa que falta

Equipo y roles reales; horarios y recursos; duración por servicio; quién realiza seguimiento; qué datos técnicos registra hoy el salón; necesidad de fotos; si se administrarán pagos. Resolver durante el diseño sin inventar reglas ni condicionar la investigación a estas respuestas.
