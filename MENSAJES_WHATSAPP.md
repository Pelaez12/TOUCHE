# Contacto y seguimiento de retorno

## Alcance confirmado

El usuario pidió separar clientas sin teléfono, mostrar próximos pasos y el último servicio, y preparar mensajes promocionales. Después aclaró expresamente que quiere un enlace directo con un mensaje preescrito, sin conectar WhatsApp Business Platform. La aplicación no envía mensajes ni consulta el estado de entrega.

## Directorio

- Directorio con teléfono: clientas activas con un número normalizable para construir un enlace internacional.
- Faltan datos: clientas activas sin teléfono o con formato que requiere verificación.
- Todas: conjunto de ambos grupos activos.
- Eliminadas: fichas archivadas recuperables.

Los celulares peruanos de nueve dígitos se normalizan con el prefijo 51. También se admiten celulares peruanos ya prefijados y números internacionales con prefijo explícito + o 00. No se adivina el país de otros números locales. Esta validación de formato no comprueba que el número exista o use WhatsApp.

## Retorno y siguientes pasos

Cada fila muestra el servicio o conjunto de servicios de la fecha utilizable más reciente del historial completo. Los días al corte y la tasa de retorno mantienen su definición histórica del período seleccionado; no confundirlos con la última atención conocida.

Las prioridades son: completar teléfono, revisar historial incierto, dar seguimiento si ya registra un regreso o una atención posterior al período, e invitar a regresar cuando hay teléfono y no hay regreso registrado. No son una prescripción de retoque ni un diagnóstico de abandono.

Los botones de Próximos pasos filtran la tabla. Completar teléfono abre directamente la ficha existente. No fusionar personas ni modificar la identidad al cambiar el número.

## Plantilla y enlace

La plantilla y la promoción opcional se guardan en D1 con `message_preferences`, migración `0003_message_preferences.sql`. Variables disponibles: `{nombre}`, `{servicio}`, `{fecha}` y `{promocion}`. La promoción inicial está vacía; no hay un descuento predeterminado.

Preparar WhatsApp muestra la clienta, número normalizado, última fecha/servicio y un mensaje editable. Los cambios de ese borrador actualizan el enlace `https://wa.me/<numero>?text=<mensaje-codificado>`. La ficha sin teléfono no ofrece ese enlace.

El chat se abre solo al pulsar el enlace. La persona que administra el salón debe pulsar Enviar dentro de WhatsApp. Abrir o preparar no se registra como mensaje enviado. No se configuraron API, webhooks, automatizaciones ni campañas masivas.

## Verificación

Se comprobaron normalización de teléfonos, partición sin perder fichas, último servicio independiente del período histórico, múltiples servicios el mismo día, prioridad de siguientes pasos, codificación del enlace y límites/variables de plantilla. Se verificó en navegador el enlace sin navegar a WhatsApp, el guardado de la plantilla y el acceso de completar teléfono a la ficha. Ningún mensaje real fue enviado durante las pruebas.
