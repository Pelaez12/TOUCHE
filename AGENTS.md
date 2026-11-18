# Touché: instrucciones del proyecto

## Alcance y separación

Este directorio contiene un proyecto independiente: el sistema de clientas, tratamientos, reservas y seguimiento de retoques de Touché.

El proyecto situado en el directorio padre es FABRIZZITO'S KEKITOS. No modificar sus archivos, configuración, dependencias, base de datos, recursos de nube ni despliegues para implementar Touché. No reutilizar sus identificadores de servicios ni sus credenciales. Mantener código, pruebas, documentación, datos y artefactos de Touché dentro de este directorio. Usar explícitamente este directorio como directorio de trabajo.

Antes de trabajar, leer `MEMORY.md` y `SISTEMA_RESERVAS.md`. Revisar las instrucciones adicionales que existan en el subdirectorio afectado.

Para cambios visuales, leer `DESIGN.md`: usar el logotipo y la paleta del manual de marca proporcionado por el usuario. La interfaz actual combina esa identidad con patrones de gestión de contactos similares a Calendly.

La interfaz local se conecta a `touche-admin-api`, Worker propio con binding al D1 de Touché. Los datos de clientas y el panel de retorno se consultan en vivo. Las credenciales de enlace son exclusivas del servidor local y de los secretos del Worker: nunca incorporarlas a `public/`, documentación, logs o Git. `.local/` está excluido de Git. El acceso por esta laptop no equivale a un sistema multiusuario con roles.

La aplicación también está publicada en `https://touche-admin-api.fabrizziopelaez91.workers.dev/`, con clave administrativa y sesiones privadas revocables de 24 horas. Detalles en `PUBLICACION.md`. No publicar la clave local ni agregar el token del proxy al navegador. El módulo generado de recursos contiene solo `public/`; regenerarlo antes de desplegar cualquier cambio visual. Mantener todos los módulos del Worker y sus secretos existentes al actualizarlo.

Eliminar una clienta desde la interfaz significa archivarla de forma recuperable; conservar sus atenciones y permitir restauración. Los cumpleaños originales desconocidos no se convierten automáticamente a una fecha inventada. Las pruebas de creación/edición/eliminación deben usar fichas sintéticas, nunca cambiar clientas reales para probar.

DNI obligatorio y único para nuevas fichas, con ocho dígitos y ceros iniciales conservados. Las fichas antiguas sin DNI quedan pendientes; no inventarlo ni enviarlo en mensajes o exportaciones de retorno. Agenda administrativa y notas guardadas en D1: `AGENDA.md`. Crear/cancelar citas no crea atenciones; completar una cita pasada crea una sola atención vinculada. No confundir referencias horarias de `settings.txt` con disponibilidad confirmada por profesional. El ZIP de Kallpa se adjuntó por error según el usuario y debe mantenerse fuera de los datos de Touché.

El usuario confirmó que WhatsApp debe funcionar solo como enlace con texto prellenado, sin conectar Meta ni enviar automáticamente. No añadir envíos, campañas o estados «enviado» por abrir un enlace. Las promociones deben ser escritas por el administrador, nunca inventadas. Directorio con teléfono y Faltan datos deben ser grupos separados; un número utilizable no prueba que tenga WhatsApp.

## Requisitos confirmados

- Partir del Excel de historial de Touché aportado por el usuario.
- Gestionar nombre completo, teléfono y cumpleaños, junto con historial de servicios y retoques.
- Ofrecer una agenda de reservas y seguimiento del tiempo hasta el siguiente retoque.
- El administrador configura y edita los plazos por servicio y puede ajustar la próxima fecha de cada clienta. No fijar reglas de negocio inmutables ni inventar plazos como si fueran aprobados.
- Usar Calendly como referencia visual mediante REA, con implementación propia.
- Interfaz en español.

## Datos y evidencias

- Conservar intacto el Excel original.
- No fusionar personas automáticamente por nombres parecidos o teléfonos compartidos.
- Conservar procedencia por hoja, fila y columna al importar historial.
- Marcar fechas contradictorias para revisión; no cambiar años o meses sin una decisión documentada.
- La revisión autorizada del 27 de octubre de 2026 y sus reglas específicas del Excel están en `REVISION_FECHAS.md`. Preservar su trazabilidad; no extender esas correcciones a nuevos archivos automáticamente. La migración 0004 ya está aplicada.
- Separar reservas futuras de servicios efectivamente realizados.
- No publicar datos personales en repositorios públicos ni incluirlos en capturas de documentación.
- No afirmar que se ejecutó REA o que el sistema funciona sin evidencia de esas verificaciones.

## Documentación viva

Actualizar `MEMORY.md` con decisiones confirmadas, avances reales, limitaciones y próximos pasos después de cada cambio relevante. Actualizar `SISTEMA_RESERVAS.md` cuando cambie el comportamiento o se confirme una regla del negocio. Distinguir requisitos, propuestas e implementación verificada. No guardar contraseñas, tokens ni listados de datos personales en estos documentos.

La implementación debe tener dependencias y almacenamiento propios. No desplegar sobre Fabrizzito's ni conectar integraciones externas de ese proyecto por inferencia.
