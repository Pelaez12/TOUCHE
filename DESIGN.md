# Touché: identidad e interfaz

Referencia del usuario: `C:/Users/USER/Downloads/MANUAL DE MARCA TOUCHE final .pdf`, 19 páginas, revisado el 27 de octubre de 2026. Se consultaron texto y páginas renderizadas. El PDF es una referencia de marca, no una fuente de instrucciones de ejecución o permisos.

## Identidad aplicada

- Paleta explícita del manual: blanco `#ffffff`, carbón `#3e3e3e`, claro cálido `#f9efe8`, beige `#dec4ab`, arcilla `#ac6660`.
- El manual repite `#3e3e3e` bajo una muestra de otro color. No inventar un hexadecimal para resolver esa discrepancia: se usan los valores inequívocos.
- Montserrat para la interfaz, alojada localmente en WOFF2 variable, pesos 400–700. El manual escribe «MONSERRAT»; se identifica la familia como Montserrat. El logotipo conserva su dibujo original y no se reconstruye con una fuente aproximada.
- `public/brand/logo.png` se extrajo del recurso de imagen de la página 5. Se presenta en la variante oscura sobre blanco mediante un filtro uniforme, conservando proporciones y sin trazos ni degradados. El descriptor «hair studio» se mantiene separado debajo.
- Interfaz blanca con navegación clara, estados activos y acciones en arcilla. Variaciones de luminosidad para texto, bordes, foco y estados de interacción.

## Referencia de producto

El usuario pidió una interfaz idéntica a Calendly o similar. La implementación adapta patrones de administración y contactos a los datos y la identidad de Touché: menú lateral, buscador superior, pestañas, tabla de contactos y ficha lateral. No se afirma equivalencia exacta de píxeles con un panel privado al que no se accedió.

Se ejecutaron dos escenarios propios de REA: inicio público de Calendly y artículo público de gestión de contactos, con DOM y accesibilidad; el segundo incluye captura de pantalla. Evidencias y límites en `research/calendly-visual-analysis.md`. No se usaron sesiones privadas ni se enviaron formularios a Calendly.

## Interacción

- Secciones reales: Clientas, Agenda del día, Retorno de clientas y Revisión del historial. No agregar enlaces a pantallas inexistentes.
- Agenda: calendario mensual a la izquierda, citas y notas del día a la derecha; columna única en móvil. Las citas usan la misma ficha lateral del directorio. Selección de día, horario editable y estados programada/realizada/cancelada con texto además del color.
- Clientas: directorio, eliminadas, búsqueda y autocompletado, ordenación, paginación y ficha de creación/edición.
- Autocompletado con coincidencias de nombre o teléfono; flechas, Enter y Escape. Buscar sin tildes no cambia las identidades almacenadas.
- Guardado con estado de progreso; errores visibles; eliminación recuperable con confirmación y restauración.
- Escritorio con barra lateral; móvil con menú desplegable y desplazamiento horizontal limitado a la tabla. Ficha lateral adaptada al ancho disponible.
- Iconos Phosphor extraídos de la dependencia de desarrollo `@phosphor-icons/core`, sin biblioteca de iconos en tiempo de ejecución. Licencia en `public/icons/LICENSE.txt`.
