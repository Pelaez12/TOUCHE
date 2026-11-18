# Touché Hair Studio — Proceso Interno v1: Diagnóstico, Dolencias y Diseño Base

Fecha de registro: 17 de noviembre de 2026 (actualizado con audio operativo el **18 de noviembre de 2026**, `America/Lima`).  
Alcance de esta versión: **solo proceso interno** (recepción, equipo, descansos, asignación de turnos, agenda diaria, confirmaciones, reprogramaciones, inasistencias e historial técnico). La reserva directa del lado del cliente queda explícitamente fuera de esta etapa y se diseñará en una fase posterior.

> **Nota metodológica**: Este documento distingue entre **(1) datos y reglas confirmadas por el negocio**, **(2) brechas observadas en el sistema actual (`touche/`)**, y **(3) propuestas respaldadas por literatura científica** consultada mediante los plugins `science` (`literature-search-openalex`, `literature-search-arxiv`, `literature-search-europepmc`). No se incluyen listados personales de clientas, contraseñas ni tokens.

---

## 1. Equipo confirmado, días de descanso y especialidades

Datos aportados el 17 y 18 de noviembre de 2026 (nómina, capturas internas de WhatsApp *Notas 2* y nota de voz operativa):

| Colaboradora | Rol | Descanso semanal fijo | Días activos | Especialidades principales (`primary` / `junior`) | Apoyo temporal (`plan_b`) y observaciones |
| --- | --- | --- | --- | --- | --- |
| **Milagros Núñez** («Mili») | Estilista colorista (Directora) | **Lunes** | Mar–Sáb | Colorimetría (Shades, tinte, mechas/balayage), **cortes** | Única estilista declarada explícitamente para **cortes**. *Nota*: corrige FAQs antiguas en `data/touche-settings-source.txt` que mencionaban atención los lunes 09:00–15:00. |
| **Miriam Pecho** | Estilista colorista | **Martes** | Lun, Mié–Sáb | Colorimetría, **alisado**, **botox**, **maquillaje**, **peinados y moños** | **Plan B temporal**: apoya **manicure, pedicure, depilación, cejas y pestañas** hasta contratar nueva manicurista (la anterior se enfermó y dejó de laborar). No desplaza su rol principal de estilista colorista. |
| **Maritza Trucios** | Estilista colorista | **Miércoles** | Lun–Mar, Jue–Sáb | Colorimetría, **alisados**, **botox**, **cepillados** | **Plan B temporal**: apoya **manicure, pedicure, depilación, cejas y pestañas** hasta contratar nueva manicurista. |
| **Martha Arone** | Asistente y **Colorista Junior** | **Martes** | Lun, Mié–Sáb | **Todos los 24 servicios de `COLOR`** (nivel junior) e **hidrataciones** (`TRATAMIENTO`) | Además realiza **apoyo como asistente** a las estilistas titulares. Descansa el mismo día que Miriam **por estrategia del negocio**. |
| **Silvia Rodríguez** | Recepción | **Sin descanso fijo** (Lun–Sáb) | Lun–Sáb | Atención al cliente, WhatsApp Web, agenda, confirmaciones | No atiende servicios en cabina (aunque en citas de prueba previas en D1 figuraba `assignee: "silvia"`). |

### Reglas confirmadas de horarios, descansos y turnos
1. **Horario del salón**: lunes a sábado, `09:00` a `19:00` (`America/Lima`), atención exclusiva previa cita. Domingos cerrado.
2. **Descansos simultáneos por estrategia**: se descarta la restricción rígida de *"ninguna colaboradora puede coincidir en el día de descanso"*, ya que **los martes descansan Miriam y Martha juntas por estrategia**. Si se modela una alerta de coincidencia, debe ser **informativa (advertencia)** y nunca un bloqueo que impida la regla real.
3. **Cambios urgentes de descanso**: los días de descanso ya están establecidos; solo se modifican por urgencia y con aviso previo. Todo cambio imprevisto o permiso debe registrarse en una bitácora de excepciones vinculada a la agenda del día para detectar citas afectadas.
4. **Regla confirmada de asignación de turnos (18/11/2026)**:
   * **Con preferencia de especialista**: si la clienta solicita expresamente el nombre de una estilista, la cita se asigna directamente a su lista (`requested`).
   * **Sin preferencia de especialista (solo servicio y hora)**: el turno se asigna según **orden de llegada física al salón** (check-in diario desde las `09:00 a.m.`, 1.er turno, 2.º turno, etc.), filtrando por habilitación para el servicio y priorizando rol principal antes que `plan_b`.

### Capacidad real por día de la semana

| Día | Estilistas senior activas | Colorista junior / Apoyo | Recepción | Capacidad simultánea real | Observación operativa |
| --- | --- | --- | --- | --- | --- |
| **Lunes** | Miriam, Maritza (2) | Martha (color junior / hidrataciones / apoyo) | Silvia | **2 titulares** (+ apoyo / citas junior de color e hidratación) | Descansa Milagros (sin especialista declarada de *corte* salvo excepción). |
| **Martes** | **Milagros, Maritza (2)** | — *(descansa Martha)* | Silvia | **2 titulares** *(sin asistente/junior)* | Descansan Miriam y Martha por estrategia: no hay apoyo de asistente/junior ni cobertura de maquillaje social o peinados/moños; si Maritza cubre un `plan_b` de manicure/depilación ese día, consume uno de los dos turnos senior. |
| **Miércoles** | Milagros, Miriam (2) | Martha (color junior / hidrataciones / apoyo) | Silvia | **2 titulares** (+ apoyo / citas junior de color e hidratación) | Descansa Maritza. |
| **Jueves** | Milagros, Miriam, Maritza (3) | Martha (color junior / hidrataciones / apoyo) | Silvia | **3 titulares** (+ apoyo / citas junior de color e hidratación) | Capacidad plena (3 estilistas senior en paralelo + soporte junior/asistencia). |
| **Viernes** | Milagros, Miriam, Maritza (3) | Martha (color junior / hidrataciones / apoyo) | Silvia | **3 titulares** (+ apoyo / citas junior de color e hidratación) | Capacidad plena. |
| **Sábado** | Milagros, Miriam, Maritza (3) | Martha (color junior / hidrataciones / apoyo) | Silvia | **3 titulares** (+ apoyo / citas junior de color e hidratación) | Capacidad plena. |

### Cobertura frente al catálogo actual de D1 (`90` servicios activos)
En la base `touche-reservas` existen **90 servicios activos** distribuidos en 9 categorías:
* **Cobertura principal (`primary`)**: `COLOR` (24), `QUÍMICO` (8: alisados y botox, Miriam/Maritza), `CORTE` (4, Milagros), `PEINADO` (13: Miriam completa + cepillados Maritza), `MAQUILLAJE` (ojos/social con Miriam), `ASESORÍA` (1: `Evaluación y diagnóstico capilar`, 20 min) y `TRATAMIENTO` (10).
* **Cobertura junior y asistencia (`junior` / apoyo)**: **Martha Arone** queda confirmada para atender **todos los 24 servicios de la categoría `COLOR`** (nivel `junior`) e **hidrataciones** (`TRATAMIENTO`), además de apoyar como asistente a las estilistas.
* **Cobertura temporal de respaldo (`plan_b`)**: `MANOS / PIES` (**12 servicios**: manicure, pedicure, esmaltado, retiro gel), `DEPILACION` (**11 servicios**) y **cejas/pestañas** (dentro de `MAQUILLAJE`) quedan asignados temporalmente a **Miriam y Maritza como Plan B** hasta contratar a la nueva manicurista (reemplazo por enfermedad de la titular anterior). En cuanto ingrese la nueva especialista, se registrará como `primary` para liberar carga de las coloristas.

---

## 2. Dolencias y dificultades detectadas en el proceso interno

Cruce entre la operativa diaria descrita en las capturas de WhatsApp (*Notas 2*) y el estado actual del sistema en `touche/`:

1. **WhatsApp funciona como libreta de disponibilidad («ceguera de horarios»)**
   * *Dolencia del negocio*: Recepción tiene que abrir WhatsApp Web, leer conversaciones previas para reconstruir qué citas ya se dieron y recién confirmar disponibilidad.
   * *Brecha en el sistema actual*: `#agenda` consulta D1, pero muestra una lista plana diaria sin grilla/columnas paralelas por estilista, sin filtros por habilidad ni cálculo de cupos libres según descansos.

2. **Necesidad de agendar hasta 3 clientas simultáneamente sin perder control por persona**
   * *Dolencia del negocio*: Se requiere *"agendar a la misma hora 3 clientes sabiendo por el horario diferentes chicas a la vez"*.
   * *Brecha en el sistema actual*: Aunque `0001_initial.sql` creó la tabla `staff`, la implementación previa de `worker/agenda.mjs` no la usaba; las citas guardaban texto libre en `assignee` (en vivo se observaron valores inconsistentes como `"silvia"`, `"Colaboradora1"`, `"colaboradora2"`). Tampoco conocía la capacidad real del día (`2` senior + `1` junior Lun/Mié, `2` senior sin asistente los martes, `3` senior + `1` junior Jue–Sáb).

3. **Choque entre dos lógicas de asignación: «Estilista pedida» vs. «Orden de llegada / turno»**
   * *Dolencia del negocio*:
     * Si la clienta pide expresamente a una especialista (*Mili*, *Miriam* o *Maritza*), pasa directo a la agenda de esa persona.
     * Si la clienta solo pide servicio y hora (ej. *"Shades 11:00 am"*), recepción no puede designar arbitrariamente quién atiende primero: opera una regla de **turno por orden de llegada / entrada desde las 9:00 a.m. (1.er turno, 2.º turno)** combinada con la **especialidad requerida**.
   * *Brecha en el sistema actual*: No existe concepto de cola/turno rotativo del día, ni distinción entre *cita nominada (fija a estilista)* y *cita por servicio (asignable por turno y competencia)*, ni vista de orden de llegada de las estilistas.

4. **Falta de matriz `estilista × servicio` y duraciones reales («Inicio y fin»)**
   * *Dolencia del negocio*: Recepción necesita ver claramente *"el nombre de las colaboradoras, tiempo y a quiénes puedo designar"* y bloques exactos de inicio y fin.
   * *Brecha en el sistema actual*: En D1, **89 de los 90 servicios tienen `durationMinutes = null`** (solo `Evaluación y diagnóstico capilar` tiene `20` min). La UI ofrece cuatro botones fijos (`20 min`, `35 min`, `2 h`, `2 h 30`) sin distinguir qué duración base ni qué rango requiere cada servicio según largo/densidad, ni quién está habilitada para ejecutarlo.

5. **Ausencia de bitácora para cambios urgentes de descanso e imprevistos**
   * *Dolencia del negocio*: Aunque los descansos están fijados, las urgencias e imprevistos deben quedar registrados con antelación y visibilidad operativa.
   * *Brecha en el sistema actual*: Solo existe `agenda_preferences` global del salón (`09:00–19:00`, días `1..6`). No hay calendario individual de descansos base ni tabla de excepciones/permisos por fecha que alerte conflictos con citas ya agendadas.

6. **Reprogramaciones constantes, cancelaciones y No-Shows vigilados manualmente**
   * *Dolencia del negocio*: Las clientas reprograman de última hora (más tarde o para otro día), cancelan o simplemente no se presentan, obligando a Silvia a vigilar constantemente el celular y WhatsApp Web y a enviar recordatorios el mismo día.
   * *Brecha en el sistema actual*:
     * El esquema SQL (`0001_initial.sql`) contempla el estado `'no_show'` y el frontend tiene la etiqueta `'No asistió'`, pero **no existe botón ni endpoint `/api/appointments/:id/no-show`** para registrar inasistencias.
     * No hay registro de **reprogramaciones** (cuántas veces se movió una cita ni motivo) porque `PATCH /api/appointments/:id` sobrescribe `starts_at`/`ends_at` dejando solo los nombres de campos en `audit_log`.
     * El generador de enlaces `wa.me` existe únicamente en la pestaña *Retorno*, **no en *Agenda*** para recordatorios de confirmación del día o día previo.

7. **Historial técnico desconectado del momento de agendar y atender**
   * *Dolencia del negocio*: Al agendar y recibir a la clienta se necesita tener a la mano *"el historial de los clientes de los servicios que toma"* (y según FAQs del salón, su fórmula de color registrada).
   * *Brecha en el sistema actual*: El modal de cita solo busca nombre/DNI/teléfono y muestra el catálogo; no exhibe resumen de última visita, estilista previa, fórmula de color, historial de inasistencias ni alertas de datos de contacto incompletos.

8. **Calidad de datos de contacto y separación de roles internos**
   * *Dolencia y brecha*: Según el estado vigente de D1 (`521` fichas activas, `1.551` atenciones históricas), una fracción importante del directorio aún carece de teléfono WhatsApp válido (registros vacíos, incompletos o marcados como `"USUARIO"`). Además, el sistema actual usa un único actor `'local-administrator'` sin distinción entre recepción, dirección y estilistas.

---

## 3. Evidencia científica y sistemas de referencia (Plugins `science`)

Para fundamentar la solución del proceso interno se consultaron bases académicas mediante los plugins `science`: **`literature-search-openalex`**, **`literature-search-arxiv`** y **`literature-search-europepmc`**.

> **Aviso sobre términos de uso y licencias**: Revisar los términos de OpenAlex (<https://help.openalex.org/>), arXiv (<https://info.arxiv.org/help/api/index.html>) y Europe PMC (<https://europepmc.org/>), así como la licencia particular de cada publicación antes de reutilizar texto o material derivado. *(Nota técnica: las búsquedas anónimas con `--search` en OpenAlex devolvieron HTTP 429 temporal en el clúster de búsqueda; la consulta con `--filter` y la recuperación individual `get works` funcionaron correctamente).*

### Síntesis aplicable a Touché Hair Studio

1. **Salir de WhatsApp como única agenda sin romper el canal WhatsApp**:
   * *Fatma Salon (2026)* documenta que las reservas por WhatsApp sin formato estructurado producen agendas incompletas y pérdida de datos de clientes; combinar una base de datos de citas con mensajes prellenados («click to chat») ordena la recepción sin obligar a cambiar de canal de mensajería.
   * *TASA — Indian Salon SMEs (2026)* evaluó 265 participantes (dueños, estilistas, gerentes y clientes) y reportó que pasar de registros manuales a un sistema integrado con visibilidad de personal redujo problemas de reserva en ~80% y *no-shows* en 60–70%.
2. **Modelo de disponibilidad Estilista × Servicio × Bloque concurrente**:
   * *SalonBook (2023)* y *Kratisimo (2026)* estructuran explícitamente la relación **estilista ↔ servicios que domina ↔ horario individual**, impidiendo dobles reservas en la propia capa de base de datos (patrón que Touché ya aplica en SQL sobre `assignee` y debe migrar a `staff_id` + cupos reales).
   * *Jasmin Hair Studio (2025)* y *Quality Management at Beauty Salon (2025)* proponen modelar conjuntamente la programación del equipo, la jornada completa de la clienta (reserva → espera/llegada → atención → pago) y las preferencias históricas.
3. **Asignación inteligente por especialidad y equidad de turnos**:
   * *Skill-based queues routing (van Kempen et al., 2025)* muestra que en sistemas de servicio con especialistas heterogéneos, enrutar considerando **habilidades habilitadas**, **equidad de carga entre servidoras** (*server load fairness*) y **reducción de espera** supera a la asignación estática. En Touché esto se traduce directamente en el modo **"Por turno / orden de llegada (9:00 a.m.)"** cuando la clienta no pide estilista fija.
4. **Duraciones contextuales («Inicio y fin») y holguras contra variabilidad**:
   * *Contextual Appointment Scheduling (Salehi Sadghiani & Motiian, 2021)* y *Dynamic Appointment Scheduling (Mahes et al., 2021)* demuestran que usar una duración única ignora covariables críticas (en Touché: largo del cabello, densidad, proceso químico previo, evaluación de 20 min) y provoca retrasos en cadena. *Robust Appointment Scheduling with Waiting Time Guarantees (Bauerhenne et al., 2024)* respalda incorporar garantías de espera y ordenar/proteger trabajos de alta varianza.
5. **Descansos base con preferencias + contingencias imprevistas**:
   * *Reserve Staff Scheduling with Preferences (Perreault-Lafleur et al., 2022)* y *Optimization Helps Scheduling Staff (Anderson et al., 2021)* formalizan la separación entre **descanso semanal base** y **plan de contingencia ante ausencias imprevistas**, reduciendo ausentismo y desorden operativo.
6. **Cerrar el ciclo de confirmación para bajar No-Shows**:
   * *Prediction without intervention (Flagel, 2026)* demuestra que los sistemas fallan cuando el recordatorio, la agenda y el historial están desconectados: si la salida (*outreach*) no registra respuesta (`confirmada`, `reprogramada`, `no_show`), el sistema no aprende qué clientas o franjas tienen riesgo.
   * *Technology-facilitated appointment reminders (Rousaki et al., 2026)*, *Repeated non-utilized appointments (Aldadi et al., 2026)* y *Stratified Scheduling (Savelsbergh & Smilowitz, 2015)* muestran que la adherencia mejora con recordatorios oportunos en el canal habitual del cliente, registro de franjas horarias preferidas y reprogramación ágil.

### Fuentes científicas consultadas

#### OpenAlex (`literature-search-openalex`)
1. *Mathematical Justification for the Development of a Web Platform for Beauty Salon Operations* (2025, caso *Jasmin Hair Studio*) — <https://doi.org/10.1109/sist61657.2025.11139271> (`https://openalex.org/W4413891470`)
2. *Applying Quality Management Tools to Improve Customer Journey at Beauty Salon* (2025, European Scientific Journal, licencia `cc-by`) — <https://doi.org/10.19044/esj.2025.v21n22p77> · PDF: <https://eujournal.org/index.php/esj/article/download/19974/19527> (`https://openalex.org/W4413209640`)
3. *Assessing the Impact of Integrated Information Systems on Operational Efficiency in Indian Salon SMEs* (2026, TASA, acceso abierto) — <https://doi.org/10.22214/ijraset.2026.85148> (`https://openalex.org/W7222315739`)
4. *Perancangan Sistem Informasi Salon Berbasis Web Dengan Fitur Booking Melalui Whatsapp Pada Fatma Salon* (2026, licencia `cc-by-sa`) — <https://doi.org/10.55606/teknik.v6i2.11734> (`https://openalex.org/W7169717797`)
5. *Online Salon Booking App* (2023, SalonBook) — <https://doi.org/10.46335/ijies.2023.8.6.5> (`https://openalex.org/W4377290582`)
6. *Development of a Web-Based Appointment Management Application* (2026, Kratisimo, Harokopio University of Athens, licencia `cc-by-nc-nd`) — <https://doi.org/10.26258/heal.hua.7952> (`https://openalex.org/W7225161565`)

#### arXiv (`literature-search-arxiv`)
7. *Dynamic Appointment Scheduling* (Mahes et al., 2021) — <https://arxiv.org/pdf/2103.09596v4>
8. *The Contextual Appointment Scheduling Problem* (Salehi Sadghiani & Motiian, 2021) — <https://arxiv.org/pdf/2108.05531v1>
9. *A stochastic integer programming approach to reserve staff scheduling with preferences* (Perreault-Lafleur et al., 2022) — <https://arxiv.org/pdf/2210.04808v1> · DOI: <https://doi.org/10.1111/itor.13298>
10. *Optimization Helps Scheduling Nursing Staff at the Long-Term Care Homes of the City of Toronto* (Anderson et al., 2021) — <https://arxiv.org/pdf/2102.09461v1>
11. *Robust Appointment Scheduling with Waiting Time Guarantees* (Bauerhenne et al., 2024) — <https://arxiv.org/pdf/2402.12561v2> · DOI: <https://doi.org/10.1287/msom.2024.0852>
12. *Stratified Patient Appointment Scheduling for Community-based Chronic Disease Management Programs* (Savelsbergh & Smilowitz, 2015) — <https://arxiv.org/pdf/1505.07722v1>
13. *Demonstration of effective UCB-based routing in skill-based queues on real-world data* (van Kempen et al., 2025) — <https://arxiv.org/pdf/2506.20543v1>

#### Europe PMC (`literature-search-europepmc`)
14. *Prediction without intervention: why fifteen years of no-show models have not closed the loop on patient adherence* (Flagel, 2026, Frontiers in Digital Health, licencia `cc by`) — <https://europepmc.org/articles/PMC13683762> · DOI: <https://doi.org/10.3389/fdgth.2026.1949255>
15. *Patient and carer perceptions and experiences of technology-facilitated appointment reminders in healthcare: a scoping review* (Rousaki et al., 2026, JAMIA) — <https://europepmc.org/articles/PMC13630306> · DOI: <https://doi.org/10.1093/jamia/ocag112>
16. *Factors influencing repeated non-utilized healthcare appointments: a qualitative study of patient and provider perspectives in a Saudi outpatient setting* (Aldadi et al., 2026, BMC Health Services Research, licencia `cc by`) — <https://europepmc.org/articles/PMC13732855> · DOI: <https://doi.org/10.1186/s12913-026-15260-0>

---

## 4. Diseño propuesto para la Versión 1 del Proceso Interno (antes de abrir reservas al cliente)

### A. Modelo de datos propuesto sobre Cloudflare D1 (`touche-reservas`)
Sin alterar las `521` fichas ni las `1.551` atenciones históricas:
1. **`staff` (ampliación de tabla existente)**:
   * `id`, `display_name`, `short_name` (`Mili`, `Miriam`, `Maritza`, `Martha`, `Silvia`), `role` (`stylist`, `junior_stylist_assistant`, `reception`, y futuro `manicurist`), `seniority_tier` (`senior`, `junior`, `support`), `can_hold_appointments` (`1` para estilistas y Martha junior; `0` para recepción), `rest_weekday` (`0..6` o `NULL`), `active`.
2. **`staff_services` (matriz de especialidades con prioridad de rol)**:
   * Relación `staff_id ↔ service_id` con `capability_level` (`primary`, `junior`, `plan_b`).
   * Permite que al agendar `MANOS / PIES` o `DEPILACION`, `Miriam` y `Maritza` aparezcan marcadas como **Plan B temporal**, y cuando se contrate nueva manicurista (`primary`), esta pase al frente automáticamente sin reescribir reglas.
   * Igualmente identifica el nivel `junior` de `Martha` en los 24 servicios de `COLOR` (habilitada para hacer todo color, priorizando `primary` cuando haya senior disponibles en el turno del día salvo que la clienta la pida o le corresponda por flujo de capacidad).
3. **`staff_schedule_exceptions` (cambios urgentes, permisos y ausencias)**:
   * `id`, `staff_id`, `exception_date`, `kind` (`rest_swap`, `urgent_leave`, `extra_shift`, `partial_block`), `starts_at`, `ends_at`, `reason`, `approved_by`, `created_at`.
   * Al registrar una excepción, el sistema comprueba inmediatamente si quedan citas `scheduled` afectadas para esa colaboradora y exige reasignar o avisar a la clienta.
4. **`staff_daily_shifts` (orden de llegada física desde 09:00)**:
   * `day`, `staff_id`, `turn_order` (1.er turno, 2.º turno, 3.er turno según llegada física), `checked_in_at`, `status` (`present`, `rest`, `absent`).
   * Cuando la clienta **no pidió especialista por nombre**, el sistema ordena candidatas libres del día por `capability_level` (`primary` > `junior` > `plan_b`) y luego por `turn_order` físico del día. Para citas de **días futuros** (antes de registrar el orden de llegada de esa mañana), las citas `pool_turn` reservan cupo contra la capacidad del bloque y quedan listas para asignación automática al registrar el check-in físico del día.
5. **Ampliación de `appointments` + `appointment_events`**:
   * Campos en `appointments`: `staff_id` (referencia formal a `staff`), `assignment_mode` (`requested` cuando la clienta pidió a la estilista vs. `pool_turn` cuando llegó por servicio/turno), `confirmation_status` (`unconfirmed`, `reminded`, `confirmed`, `rescheduled`), `confirmed_at`, `reschedule_count`, `cancel_reason`.
   * `appointment_events`: historial inmutable de creación, recordatorio enviado, confirmación, reprogramación (hora anterior → hora nueva + motivo), cambio de estilista, `no_show`, cancelación o finalización.
6. **Duraciones base por servicio (`services.duration_minutes` + rangos) y notas técnicas de atención**:
   * Completar duraciones sugeridas por servicio (manteniendo edición en la cita según largo/densidad).
   * Ficha técnica por atención completada (fórmula de color, largo, densidad, observaciones y enlace al próximo retoque).

### B. Flujo operativo diario para Recepción (Silvia) y Dirección (Milagros)
1. **Tablero visual diario por colaboradora (columnas paralelas)**:
   * Muestra únicamente a las colaboradoras activas que atienden citas ese día según descanso base + excepciones urgentes (`3` estilistas senior + Martha junior Jue–Sáb; `2` senior + Martha Lun/Mié; `2` senior —Milagros y Maritza— sin asistente los martes).
   * Muestra la capacidad disponible por franja horaria sin tener que leer chats de WhatsApp.
2. **Dos modos claros al crear cita**:
   * **Pidió especialista**: selecciona directamente a la estilista solicitada (marcada como `requested`; bloquea días de descanso o excepciones).
   * **Pidió solo servicio y hora**: muestra únicamente a las colaboradoras habilitadas para ese servicio, ordenadas por nivel (`primary` > `junior` > `plan_b`) y luego por **orden de llegada física del día (1.º, 2.º, 3.º)** y disponibilidad en ese horario.
3. **Bandeja de «Confirmaciones y Reprogramaciones de Hoy / Mañana»**:
   * Lista las citas pendientes de confirmar en **ambos momentos** (día previo y mismo día) con botón directo **"Recordar por WhatsApp"** (`wa.me` prellenado, mismo patrón sin Meta API) y registro de cada envío (`reminded_day_before`, `reminded_same_day`), junto con botones de un clic: **Confirmó**, **Reprogramar** (guarda historial de cambio), **No asistió (`no_show`)**, **Cancelar** y **Realizada**.
4. **Alerta de historial y reincidencia**:
   * Al elegir a una clienta en Agenda, muestra en el mismo panel: última atención y servicio, estilista habitual (si tuvo), contador de *no-shows* / reprogramaciones previas y si le falta teléfono válido para recordatorios.

---

## 5. Estado de decisiones (Actualizado 18 de noviembre de 2026)

### Decisiones ya respondidas
1. **`MANOS / PIES` (12 servicios), `DEPILACION` (11 servicios), cejas y pestañas — RESPONDIDO**: no hay manicurista adicional que registrar por ahora (la especialista anterior se enfermó y dejó de continuar). Temporalmente **Miriam y Maritza** actúan como **Plan B** para cubrir esos servicios mientras se contrata reemplazo; su rol principal sigue siendo **estilistas coloristas**.
2. **Alcance operativo de Martha Arone — RESPONDIDO**: cumple rol dual de **Asistente + Colorista Junior**, y queda confirmado que **puede atender todos los 24 servicios de `COLOR`** e **hidrataciones**, además de apoyar como asistente a las estilistas.
3. **Regla de «primer turno / segundo turno» — RESPONDIDO**: cuando la clienta no pide estilista por nombre, el turno se asigna por **orden de llegada física** de las colaboradoras al salón ese día.
4. **Citas actuales en vivo en D1 — RESPONDIDO (pendiente de ejecutar limpieza en D1)**: el usuario confirmó que las **4 citas** registradas actualmente en la tabla `appointments` (3 canceladas de oct/nov y 1 `scheduled` el `27/11/2026` con `"colaboradora2"`) son **de prueba** y deben **eliminarse únicamente esas citas** (junto con su auditoría de prueba), conservando intactos los datos y atenciones reales (`520` clientas históricas y `1.551` atenciones en `treatments`). *(Nota técnica: no se eliminaron todavía en esta sesión porque `worker/agenda.mjs` no expone ruta `DELETE` y `wrangler` no está autenticado en este entorno; se ejecutará al habilitar acceso D1 o mediante script de limpieza controlado.)*
5. **Momento de recordatorio WhatsApp — RESPONDIDO**: se confirma recordatorio en **ambos momentos** (día anterior y mismo día) mediante enlace manual `wa.me` desde Agenda.
6. **Tiempos base confirmados por el negocio — RESPONDIDO (18/11/2026)**:
   * **Evaluación y diagnóstico capilar**: `20 min` (ya cargado en D1).
   * **Hidratación exprés**: `15 min`.
   * **Hidratación profunda**: `35–40 min`.
   * **Corte**: `40–60 min`.
   * **Peinados**: `90 min`.
   * **Raíz (retoque de tinte)**: `120 min`.
   * **Shades**: `90–120 min`.
   * **Mechas / Balayage**: `180–240 min`.
   * *Nota operativa*: las duraciones funcionan como valor base/rango sugerido editable en cada cita según largo, densidad o estado del cabello. Las categorías sin duración fija declarada en esta ronda (`QUÍMICO` —alisado/botox—, `MAQUILLAJE`, `MANOS / PIES` y `DEPILACION`) permanecen editables manualmente en la cita salvo definición posterior.
   * *Limpieza de ficha #521*: `Fabrizzio Paolo Pelaez Bautista` (DNI `61000000`) fue archivada vía `DELETE /api/clients/:id` el `18/11/2026`, dejando `520` clientas activas y `1` en Eliminadas (lista para purga física en SQL junto con las 4 citas de prueba).

---

## 6. Auditoría de rendimiento para v1 (`Consejos de Velocidad para Apps.md`)

Evaluación del código actual de `touche/` (`public/`, `worker/`, `migrations/`, `server.mjs`) frente a los 5 bloques de optimización:

* **Lo que Touché ya cumple bien**:
  * **Sin frameworks pesados ni scripts externos**: HTML/CSS/JS nativo, 0 scripts de terceros, `<script type="module">` diferidos por defecto, 1 sola fuente local (`montserrat-0.woff2`, `37.956` bytes, `font-display: swap`), iconos SVG propios (`200–666` bytes) y logo único (`12.320` bytes).
  * **Worker en el borde + `db.batch()`**: Cloudflare Worker junto a D1, Brotli automático en red, `GET /api/agenda` acotado por mes e índices en `clients`, `treatments` y `web_sessions`.
* **Cuellos de botella reales detectados para corregir en v1**:
  1. **Llamadas API duplicadas al cargar y guardar (Prioridad alta)**: al abrir `#agenda`, `clients.mjs` (`GET /api/clients`), `app.mjs` (`GET /api/history` + `/api/message-preferences`) y `agenda.mjs` (`GET /api/agenda` + `GET /api/clients` + `GET /api/history`) lanzan **doble petición** de `clients` e `history`, y al guardar una cita `touche:data-changed` repite la recarga múltiple. Solución: almacén de estado compartido y carga diferida por pestaña.
  2. **Falta de caché en estáticos (`Cache-Control: no-store` global, Prioridad alta)**: `worker/web.mjs` aplica `no-store` tanto a la API como a `montserrat-0.woff2`, `logo.png`, `style.css`, `icons/*.svg` y `.mjs`, impidiendo que el navegador los cachee entre recargas. Solución: mantener `no-store` en `/api/*` y HTML autenticado, y usar hash/ETag o `Cache-Control` cacheable en assets estáticos versionados.
  3. **Payload excesivo y falta de proyección/paginación en servidor (Prioridad alta)**: `GET /api/clients` (`521` filas con `notes` completas + 2 subconsultas por fila) y `GET /api/history` (`1.551` eventos + `520` clientes + `508` revisiones + `90` servicios) se descargan completos en el navegador. En `#agenda` basta un endpoint ligero (`clients` resumido + `services`) sin descargar los `1.551` eventos históricos.
  4. **DOM y búsquedas sin `debounce` (Prioridad media)**: `agenda.mjs` inserta `520+` nodos `<option>` en `<select id="appointment-client">` al abrir o teclear sin retardo; conviene autocompletado acotado (top 15–20 coincidencias) + `debounce` de 150–200 ms.
  5. **Índices SQL para la nueva agenda por estilista (Prioridad media)**: añadir índice compuesto `(status, starts_at, ends_at)` y `(staff_id, starts_at, ends_at)` en la migración de `staff` y `appointments`.
* **No prioritario ahora**: colas de trabajos (no hay procesos pesados asíncronos), *connection pooling* (D1 lo gestiona Cloudflare) ni OpenTelemetry pesado (basta latencia básica sin PII). Si más adelante se suman fotos antes/después, aplicar WebP/AVIF y skeletons en carga.

---

## 7. Estado de implementación y verificación (18 de noviembre de 2026)

### Implementado y verificado localmente
* **Base de datos y migración**: `migrations/0009_internal_operations.sql` crea las tablas `staff_category_capabilities`, `staff_service_overrides`, `staff_schedule_exceptions`, `staff_daily_shifts` y `appointment_events`, amplía `staff`, `services`, `appointments` y `treatments`, carga al equipo real, descansos, matriz de habilidades (`primary` / `junior` / `plan_b`), tiempos base confirmados, índices compuestos y elimina únicamente las 4 citas de prueba (`WHERE treatment_id IS NULL`). Script opcional `scripts/cleanup_test_records.sql` preparado para purga física de auditoría y ficha archivada `#521`.
* **API y reglas de negocio (`worker/agenda.mjs`, `worker/index.mjs`, `server.mjs`)**:
  * `GET /api/agenda?date=YYYY-MM-DD&bootstrap=1` en un solo lote sin descargar las 1.551 atenciones históricas.
  * Gestión de equipo y descansos (`/api/staff`, `PATCH /api/staff/:id` con aviso informativo de descanso compartido, sin bloqueo rígido).
  * Excepciones urgentes (`/api/staff/exceptions`, `DELETE /api/staff/exceptions/:id`) con detección inmediata de citas afectadas.
  * Orden de llegada física diaria (`PUT /api/agenda/shifts`) y autoasignación de citas `pool_turn` (`POST /api/agenda/assign-turn`) priorizando `primary` > `junior` > `plan_b` y luego `turn_order`.
  * Ciclo completo de cita: `POST /api/appointments/:id/{remind,confirm,no-show,cancel,complete}`, edición/reprogramación con motivo e historial (`GET /api/appointments/:id/events`), y `PATCH /api/services/:id` para duraciones.
* **Interfaz y rendimiento (`public/index.html`, `public/agenda.mjs`, `public/store.mjs`, `public/clients.mjs`, `public/app.mjs`, `public/style.css`, `worker/web.mjs`, `scripts/build_worker_assets.mjs`)**:
  * Tablero diario por columnas de colaboradora activa, barra de capacidad real, registro de orden de llegada física, cola de turnos pendientes con asignación en 1 clic, filtros de confirmación, botones WhatsApp (`wa.me`) para día previo y mismo día, tarjeta de contexto técnico/historial de clienta al agendar y modales de Equipo/Tiempos y Excepciones.
  * Carga diferida por pestaña (`#clientas`, `#retorno`, `#revision`), estado compartido en `public/store.mjs`, `debounce` (150 ms) con selector acotado a 25 coincidencias y `ETag` / `304` + `Cache-Control` cacheable en assets estáticos (`no-store` preservado en HTML y `/api/*`).
* **Pruebas y publicación en Cloudflare verificadas (18/11/2026)**:
  * `npm test` → **28/28 pruebas aprobadas**, incluyendo migraciones `0001..0010` (`PRAGMA foreign_key_check` limpio), cuentas internas `@touche.pe` con 1 solo Administrador + 5 colaboradoras pendientes y `ETag`/`304` fuerte y débil (`W/`).
  * Respaldo D1 previo guardado en `data/backups/before-0009-0010-20261118.sql`; `0009_internal_operations.sql` y `0010_internal_accounts.sql` aplicadas en D1 remoto `touche-reservas` y Worker `touche-admin-api` publicado con `wrangler.jsonc` (`preview_urls: false`, `observability: enabled`, secreto `ADMIN_TOKEN` conservado).
  * Verificado en producción (`scripts/check_web_access.mjs` + prueba `ETag`/`304` y `/api/agenda?bootstrap=1`): `520` clientas activas, `1.551` atenciones reales, `0` citas de prueba, `5` colaboradoras, `52` servicios con duración base y `6` cuentas internas (`1` admin activa + `5` colaboradoras listas para asignar contraseña).
