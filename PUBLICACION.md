# Touché en Cloudflare

Publicado por petición expresa del usuario el 27 de octubre de 2026.

Aplicación: https://touche-admin-api.fabrizziopelaez91.workers.dev/

El Worker propio `touche-admin-api` sirve interfaz, fuentes, logotipo, iconos y API. Los datos operativos se consultan y guardan en D1 `touche-reservas`, sin depender del servidor de la laptop. El Excel original no se modifica ni se publica. Se mantienen la separación y credenciales exclusivas de Touché.

## Acceso y cuentas internas (`0010_internal_accounts`)

La clave inicial del administrador, generada con 192 bits de entropía, está en `.local/ACCESO_TOUCHE.txt`. No adjuntarla al repositorio ni incluirla en recursos públicos, capturas, logs o documentación. Con la migración `0010_internal_accounts.sql`:

- La cuenta única de **Administrador** (`admin@touche.pe`) hereda el hash vigente de `web_access_settings` (`0008`) para conservar el primer ingreso sin bloqueo, y puede cambiar su contraseña desde `#cuentas` o `#mi contraseña` (PBKDF2-SHA256, 100.000 iteraciones con sal).
- Solo puede existir **una cuenta de Administrador** (índice único parcial `web_accounts_single_admin` en SQLite/D1 y bloqueo en API).
- Las 5 cuentas internas de **Colaboradores** (`milagros@touche.pe`, `miriam@touche.pe`, `maritza@touche.pe`, `martha@touche.pe`, `silvia@touche.pe` —sin vincular Gmail—) comienzan vacías/inactivas hasta que Administración les asigne contraseña desde `#cuentas`.
- Cada inicio correcto crea una sesión aleatoria de 256 bits asociada a `account_id` en D1 (`HttpOnly; Secure; SameSite=Strict`, 24 horas). Desactivar una cuenta o cambiar su contraseña revoca de inmediato sus sesiones activas.
- Permisos: **Colaboradores** acceden a operación diaria (`#agenda` completa y `#clientas` ver/crear/editar, sin eliminar). **Administrador** accede además a `#cuentas`, configuración de equipo/descansos/horarios/tiempos, eliminar/restaurar clientas, `#retorno` (CSV y plantillas WhatsApp) y `#revision`.

## Actualizaciones

1. Modificar fuentes de Touché y comprobar los flujos afectados.
2. Ejecutar `npm test`; su paso previo regenera los recursos públicos con `scripts/build_worker_assets.mjs`.
3. Publicar juntos `worker/index.mjs`, `validation.mjs`, `agenda.mjs`, `accounts.mjs`, `crypto.mjs`, `web.mjs` y `assets.generated.mjs`, conservando el binding D1 y los secretos existentes.
4. Mantener compatibilidad 2026-10-27 y observabilidad configurada. Solo el contenido de `public/` puede entrar en el módulo de recursos generado; nunca data/ ni .local/.
5. Comprobar acceso anónimo, autenticado, cierre de sesión y correspondencia de recursos. `scripts/check_web_access.mjs` comprueba estos límites sin imprimir claves ni cookies.

La migración 0008 ya está aplicada. `scripts/prepare_web_access.mjs` fue usado una sola vez; no reinicializar el acceso ni publicar el plan privado de configuración. Una rotación posterior debe ser explícita y revocar las sesiones activas.

## Verificación realizada

- 21 pruebas JavaScript aprobadas.
- Anónimos: raíz redirige al acceso, historial responde 401, archivos privados 404.
- Inicio válido y API autenticada comprobados; las escrituras desde un origen ajeno reciben 403.
- Cookie con protecciones y cierre que revoca la sesión verificados.
- HTML, módulos de agenda/clientas y logotipo publicados coinciden por SHA-256 con sus fuentes.
- Alta desde Agenda verificada con ficha y cita sintéticas, retiradas al finalizar. Se conservaron las 520 fichas y 1.551 atenciones reales.
