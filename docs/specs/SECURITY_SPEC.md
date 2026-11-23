# Seguridad, identidades y sesiones

Revisión: **23/11/2026** · Código de referencia: **`2f9ab74aff3d612951596986490b5641a27f3932`** (tag `ticketera-production-20261123`, [release](../validation/production-release-20261123/REPORT.md)). Revisión anterior: 20/11/2026 sobre `c857a72`.

Fuente oficial de requisitos: [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md).

## M16 + M16b — 23/11/2026

> **Producción 23/11/2026 15:55 UTC:** M16 (`20261123000100_client_request_data_security.sql`, sha256 `ecec0b9a…3f102`) y M16b (`20261123000200_client_legacy_payload_compat.sql`, sha256 `8adce4bb…d036`) **aplicadas** en `xsxdpaiivklqeudgqoqf`; historial 17/17 y funciones remotas idénticas a la instalación probada (107/107). [Activación](../validation/m16-activation-20261123/REPORT.md).

M16b: el `requester_name` enviado por un cliente Quipu se valida (string 1–200) y se descarta sin persistirlo (tampoco en `original_payload`);
la suplantación es imposible porque el nombre deriva siempre de la identidad. Identidades, sesiones, propiedad, RLS y EXECUTE sin cambios;
`submit_client_request` sigue sin EXECUTE para anon/authenticated/service_role y `client_owns_request` revocada (verificado en remoto).

Base `a61450c`; handoff `8fabd88e99cc0e53dbc43c3402730d785c148a7a`. Aplicada en producción el 23/11/2026 (antes: preparada solo en local).
[Informe con evidencias](../../REPORT-backend-codex1.md), [contrato exacto](../validation/client-experience-contract-handoff.md).

Auditoría focalizada: M13 sí filtra por identity_id, pero su UPSERT podía sobrescribir username
al reutilizar provider_id en otro usuario del mismo RUC. Reproducido localmente, sin afirmar
incidente remoto del piloto (que usa fallback username). M16 incluye username exacto en unicidad,
impide mutar alcance/propiedad y valida snapshots privados de capacidades y enlaces nuevos.

Históricos username siguen disponibles; links provider_id sin evidencia quedan denegados y
preservados, sin reasignación automática. Sus sesiones/códigos antiguos sin snapshot fallan
cerrados para impedir adoptar username sobrescrito; un nuevo login legítimo no reconstruye
propiedad histórica ambigua. QuipuFac conserva identidad empresarial y comparte dentro del RUC.
El nombre declarado se guarda por ticket y no concede acceso.

requested_priority y urgent_requested son independientes; se conserva la semántica histórica de
urgencia y las métricas. No se amplían permisos de creación directa M15 ni tablas privadas.
Los tests son PostgreSQL real con fixtures Auth/Storage, no E2E de Supabase alojado. No se usan
credenciales reales, proveedores ni escrituras remotas.


## Modelo de confianza

El navegador es no confiable. Las claves públicas solo identifican el proyecto/gateway y no autorizan por sí solas una operación. Contraseña externa solo pasa a `client-login`; nunca a RPC ni tablas. Tokens/roles de Quipu/QuipuFac no crean perfiles internos. Estudio, identity_id, contexto de entrada y productos los decide servidor. [Permisos por capa](PERMISSIONS_SPEC.md).

**Personal:** Supabase Auth → token Auth → `public.users` activo con rol. `auth-controller` centraliza eventos, sincronización y rechaza un Auth válido sin perfil activo. `admin-users` valida `auth.getUser`; no toma actor del body ni user_metadata como rol.

**Cliente:** proveedor validado → `client_open_session` exclusivo Edge → token propio → RPC client_* con capacidad. Quipu individual por RUC/username exacto; QuipuFac empresarial por RUC; iguales RUC/estudio no mezclan identidades. `subject_source=provider_id` existe en contrato genérico, pero no fue confirmado para el Quipu del piloto.

## Tokens, almacenamiento y revocación

| Elemento | Generación/almacenamiento | Vida y validación |
|---|---|---|
| Sesión cliente | 32 bytes CSPRNG, 64 hex; SHA-256 en PostgreSQL; valor solo al cliente | Edge emite ocho horas; SQL admite techo técnico 24 horas; revoked_at/expires_at revisados por RPC. |
| Código de entrada | 32 bytes aleatorios, SHA-256 almacenado y binding a proveedor/identidad | Edge 60 segundos; SQL techo dos minutos; used_at consumido una vez atómicamente. |
| Token de proveedor | Solo lectura temporal de respuesta en Edge | Validar no vacío, descartar; no guardarlo ni devolverlo. |
| Capacidad de adjuntos legacy | UUID técnico tracking_token del recibo, tabla privada request_access | Reserva cliente pendiente dentro de 30 minutos; no autoriza lista de tickets de otra identidad. |
| Secreto de plataforma | Configuración privada por proveedor; no navegador | issue_code solo servidor sin Origin y comparación por digest; nunca valor en Git/docs. |

`src/lib/client-session-store.ts` guarda token cliente en **sessionStorage** de la pestaña con fallback en memoria; no almacena contraseña. Esto **no es un almacén cifrado del SO**. Supabase Auth interno conserva su mecanismo de sesión del SDK; no se añade un gestor de credenciales propio. No afirmar que ya existe almacenamiento cifrado reutilizable QA: no se encontró disponible. Reutilizar sesión vigente si puede accederse legítimamente; si falta, no extraer hashes ni crear sesión con credencial servidor para simular login. Marcar prueba NO VERIFICADA conforme a instrucción del usuario, sin volver a pedir sus contraseñas.

`client_logout` marca revocación y UI borra su token. M13 serializa creación/reserva frente a revocación con lock de la fila de sesión. Expiración o revocación invalida capacidades nuevas; PT403/PT404 no son expiración y conservan sesión. No persistir storageState/HAR con tokens ni registrarlos para reproducir una prueba.

## M14: protección de intentos

SQL [M14](../../supabase/migrations/20261119000200_client_login_throttle.sql) y Edge aprobada:

- Ventana **fija** alineada por `date_bin('15 minutes',...)`; no ventana deslizante.
- Límite **10** por identidad: Quipu RUC+username+proveedor; QuipuFac RUC+proveedor.
- Límite **50** por IP y **2000** globales por ventana.
- Contadores persistentes `app_private.client_login_attempts`; Edge envía buckets SHA-256, nunca RUC/usuario/IP/contraseña en claro a esta tabla. SHA-256 aquí no es cifrado reversible ni elimina todos los riesgos de adivinación de entradas conocidas.
- Cuenta antes de llamar al proveedor, después de validar formato y configuración. Intentos de login rechazados cuentan; canje de código no usa este contador.
- Función inaccesible para anon/authenticated/PUBLIC; solo servidor. Falta de contador falla cerrado; exceso responde 429, Retry-After 900 (no garantiza segundo exacto de liberación).
- Limpieza probabilística del 2% borra ventanas mayores de un día; no prometer borrado puntual. Dirección IP derivada best-effort de headers; bucket de identidad es protección principal, no se documenta IP como identidad infalsificable.

M10 tiene otro contador para búsqueda pública: 10/IP/min y 300 global/min. Una petición pública de seguimiento escribe esos contadores; no es una lectura SQL pura.

## M15 y compatibilidad

Retira ejecución directa de helper antiguo a PUBLIC/anon/authenticated/service_role. Dos RPC internas exigen perfil activo de editor **antes de validación y replay**. M13 sigue con mismo cuerpo y propietario que helper. `client_submit_request` continúa publicado a anon/authenticated de forma intencional y exige sesión independiente. Negar EXECUTE al wrapper cliente rompería la web; no hacerlo como «corrección» adicional.

La activación 20/11 comprobó permisos efectivos, denegaciones SQL/HTTP y huella de requests sin cambios. No modifica tickets/catálogos/estudios ni M1–M14. Una prueba alojada de creación exitosa posterior a M15 todavía falta; compatibilidad SQL/fixtures no sustituye esa prueba.

## CORS, errores y secretos

`PROCONT_ALLOWED_ORIGINS` es compartida por `admin-users` y `client-login`. Comparación exacta de origen; preservar orígenes legítimos al actualizar. Dominio oficial permitido, origen desconocido 403, POST/OPTIONS. CORS limita navegadores, **no sustituye** autenticación ni impide llamadas servidor-servidor.

`verify_jwt=false` en gateway de ambas funciones permite contratos propios; `admin-users` verifica explícitamente Auth y cliente verifica proveedor/código. Nunca exponer valores privados como VITE_*. Supabase inyecta URL y credencial de servidor; código Edge la mantiene en proceso con persistSession/autoRefreshToken false. Registrar solo nombre de configuración, estado HTTP, código de error y evidencia depurada. No incluir cuerpos, contraseñas, tokens, cookies, Authorization, cadenas PostgreSQL con contraseña ni URLs firmadas.

Errores de proveedores: tratar solo reglas verificadas como credenciales incorrectas; no convertir un 500 genérico o un timeout en password inválido. El handler limita cuerpos, usa HTTPS sin credenciales embebidas/query/fragmento, no sigue redirects y acota llamada a diez segundos. Validación del contrato es configuración privada, nunca una afirmación enviada por el cliente.

## Adjuntos y datos privados

Bucket privado; reserva opaca, cuota 4/2500000 bytes, MIME allowlist, expiración y trigger diferido con metadatos reales. Clientes reservan por sesión y propiedad; internos por actor/editor y proyecto, incluso bloqueado. Código no ofrece lectura pública de adjuntos a partir del REQ ni un listado de Storage para cliente anónimo. Un enlace firmado interno vence a los 600 segundos.

Auditoría M12 es inmutable frente a roles de aplicación y captura actor/rol al actuar. SQL owner capaz de modificar esquema/triggers queda fuera de esa frontera de seguridad. No prometer retención inalterable frente al administrador del motor.

## Riesgos y límites vigentes

- Piloto público usa **desarrollo** con autorización explícita; no es aprobación de contratos de producción externos.
- Auth Site URL sigue localhost y redirecciones vacías en GET actual. Alta Edge exige password 12..128, mientras configuración Auth observada tiene mínimo 6: no afirmar política uniforme de doce en todo Auth.
- Signups aparecen habilitados y autoconfirmación de correo activa; un alta Auth no concede perfil activo ni rol interno, pero debe revisarse antes de un alcance distinto del piloto.
- Asociación explícita RUC→estudio valida coincidencia al guardarse; resolución posterior comprueba actividad, no vuelve a comparar RUC cambiado. Riesgo preventivo registrado, sin cambio de datos automático.
- Sin snapshot único de exportación y sin evidencia post-M15 de Storage/login de plataforma/operación autenticada completa.
- No se reabren permisos anónimos como rollback ni se usa la clave técnica de servidor para reemplazar una sesión administrativa.

Estado y evidencias: [EVIDENCE_20261120.md](EVIDENCE_20261120.md), [TESTING_SPEC.md](TESTING_SPEC.md).
