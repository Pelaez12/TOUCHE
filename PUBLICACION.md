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

La migración 0008, `0009_internal_operations` y `0010_internal_accounts` ya están aplicadas en D1 remoto `touche-reservas` (respaldo previo guardado en `data/backups/before-0009-0010-20261118.sql`). No reaplicarlas ni reinicializar `scripts/prepare_web_access.mjs`. Despliegue reproducible mediante `wrangler.jsonc` (`compatibility_date: 2026-10-27`, `observability: enabled`, `preview_urls: false`).

## Verificación realizada (18 de noviembre de 2026)

- 28 pruebas JavaScript aprobadas (`npm test`), incluyendo migraciones `0001..0010`, RBAC y `ETag` fuerte/débil (`W/`).
- D1 remoto verificado tras `0009` y `0010`: `PRAGMA foreign_key_check` sin errores, `520` clientas activas, `1.551` atenciones reales, `0` citas de prueba, `5` colaboradoras en `staff`, `52` servicios con duración base y `6` cuentas internas (`1` admin activa + `5` colaboradoras pendientes).
- En vivo (`scripts/check_web_access.mjs`): raíz anónima `303 -> /login`, `/api/history` anónimo `401`, archivos privados `404`, origen ajeno `403`, login de `admin@touche.pe` con clave actual `200`, cookie `HttpOnly; Secure; SameSite=Strict`, cierre revoca sesión y coincidencia SHA-256 de recursos publicados.
- Caché estática en vivo: `/style.css` devuelve `Cache-Control: public, max-age=300, stale-while-revalidate=86400` y `304 Not Modified` ante `If-None-Match` con `W/` de Cloudflare; HTML y `/api/*` mantienen `Cache-Control: no-store`.
