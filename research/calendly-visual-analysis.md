# Referencia pública Calendly observada con REA

Fecha: 27 de octubre de 2026. Herramienta: REA 6.7.0 con Node 24.22.1 y Chrome en un perfil temporal propio.

## Evidencia obtenida

- `https://calendly.com/`: escenario `calendly-visual-scenario.json`; evidencia `ev_3d863d158fd3b8754c3ac63afae6d8418de0e62e39dfbb51ca8ad593f83eb14b`. Navegación pública, espera por `body`, DOM y accesibilidad capturados.
- `https://calendly.com/help/how-to-manage-a-contact`: escenario `calendly-contacts-scenario.json`; evidencia `ev_15c8f3b499af71737a7278f5e01b77cb34ac32a5a059c1d7241ba6c84873f4ca`. Incluye captura de pantalla, DOM y accesibilidad. La captura muestra un centro de ayuda público, no una cuenta administrativa.
- En ambos casos REA informó cierre del proceso de navegador propio. Los registros íntegros están en `artifacts/`, excluido de Git. No se inició sesión ni se creó o modificó un contacto de Calendly.

## Observaciones y adaptación

La página pública de gestión de contactos explica edición desde tabla o ficha y la actualización del nombre desde la ficha. La documentación de creación describe alta manual. La documentación de analítica ofrece filtros y exportación.

La interfaz de Touché adapta esos patrones de producto: navegación lateral, campos de búsqueda, tabla de clientas, acciones por fila, edición y guardado, filtros de retorno y exportación. Se usa la marca real de Touché del manual recibido.

## Límites

No se accedió al panel privado autenticado de Calendly. Por tanto, no se promete una copia idéntica de sus pantallas privadas. El intento de descargar directamente la imagen enlazada por el artículo respondió HTTP 403; no se eludió el bloqueo. La captura de la página pública sí se obtuvo con REA. Estas observaciones no prueban el funcionamiento interno del servidor de Calendly.

## Fuentes públicas

- https://calendly.com/help/how-to-manage-a-contact
- https://calendly.com/help/how-to-create-a-contact
- https://calendly.com/help/calendly-analytics
