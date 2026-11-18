# Revisión del historial 2025–2026

Fecha de corte: 27 de octubre de 2026, America/Lima. El usuario confirmó que hay historial desde 2025 hasta hoy y pidió revisar y corregir sus fechas. Política específica: `touche-date-review-2026-10-27-v1`.

Actualización posterior confirmada por el usuario: dos fechas añadidas (5 de octubre de 2026 y 12 de junio de 2026), dos incidencias de nombres repetidos descartadas porque ya había una sola ficha por nombre. Estado actual: **1.551 atenciones** (420 de 2025 y 1.131 de 2026), **1.181 visitas**, 508 revisiones de fecha y **una incidencia pendiente**. Se conservaron las 520 fichas y no se borraron historiales. La tabla siguiente documenta la primera revisión; la confirmación posterior está auditada bajo `touche-confirmed-dates-20261027-v2` y preparada por `scripts/confirm_history_dates.py`.

## Reglas aplicadas a esta fuente

- Columna anual 2025: conservar día y mes y usar 2025. Había 417 fechas almacenadas con año 2026; dos textos adicionales indicaban día/mes legibles. Una fecha ya tenía 2025.
- Columnas mensuales de 2026: conservar fechas completas aunque no coincidan con el mes de la columna. Se aceptaron 15 fechas completas desplazadas; no se cambió su mes.
- MECHAS, encabezado septiembre 2020: interpretar septiembre 2026 por la secuencia enero–octubre de 2026 y el período confirmado. Se recuperaron 12 registros.
- Textos con días inequívocos: usar mes expreso o mes de columna y su año. La abreviatura `0CT` se interpreta como OCT. Los días separados por comas producen atenciones distintas.
- Un día ambiguo, texto sin fecha o fecha posterior al corte permanece pendiente. No convertir fechas futuras en reservas ni inventar una atención del día 27.

## Resultado verificado en D1

| Medida | Resultado |
|---|---:|
| Atenciones de 2025 | 420 |
| Atenciones de 2026 | 1.129 |
| Total de atenciones | 1.549 |
| Visitas por identidad/día | 1.179 |
| Atenciones recuperadas | 568 |
| Incidencias resueltas | 506 |
| Incidencias pendientes | 5 |
| Fichas conservadas | 520 |

Fechas disponibles: 9 de enero de 2025 a 26 de octubre de 2026. Los pendientes incluyen tres fechas (día ilegible, texto sin fecha y fecha futura) y dos identidades con nombres repetidos. No se fusionaron fichas.

## Procedencia, respaldo y comprobaciones

El Excel original no se modificó; su SHA-256 se valida contra la extracción inicial. Antes de cambiar D1 se exportó el respaldo SQL privado `data/backups/before-date-review-20261027.sql`. Mantenerlo fuera de Git y de archivos públicos.

`0004_history_date_reconciliation.sql` añade procedencia original, parte de celda y resolución a las atenciones, y crea `history_date_revisions`. La migración ya se aplicó. Las celdas con varios días conservan la referencia original; las partes adicionales usan sufijo interno para mantener la unicidad. Los valores originales, encabezados, fechas interpretadas, regla y autorización se conservan en la auditoría. Las 506 incidencias pasan a resueltas; no se borran.

`reconcile_history.py` prepara el JSON normalizado y las sentencias parametrizadas. El plan usa inserciones idempotentes. `verify_date_plan.py` restaura el respaldo en SQLite temporal, aplica migración y plan dos veces y comprueba claves foráneas, conservación de las 981 fechas existentes y de los campos de las 520 fichas. Siete pruebas Python cubren fechas, comas, encabezados, días ambiguos y límites; 15 pruebas JavaScript cubren retorno y validaciones existentes.

La API publicada devuelve las 1.549 atenciones esperadas sin diferencias de hoja/celda/fecha y ninguna fecha futura. En navegador se verificaron filtro 2025 (420), filtro 2026 (1.129), búsqueda sin resultados y paginación. La interfaz administrativa sigue siendo local y protegida; no se enviaron mensajes a clientas.
