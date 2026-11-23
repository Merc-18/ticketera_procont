# Instalación, despliegue y operación

Revisión: **20/11/2026** · Código de referencia: **`c857a727c8e7640bbce8daada940f973acbf013e`**.

Fuente oficial de requisitos: [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md).

## Estado conocido del piloto

> **Actualización 23/11/2026** ([activación](../validation/m16-activation-20261123/REPORT.md)): main `718ab04` (merge del PR #2), Vercel Production desplegado con
> **Versión 202611231058**; M1–M16b aplicadas (17/17). El merge posterior con solo documentación genera una versión más reciente;
> la tabla inferior conserva el estado del 20/11 como antecedente.

| Elemento | Estado / fuente | Grado de verificación |
|---|---|---|
| GitHub main | `c857a727c8e7640bbce8daada940f973acbf013e` | Ref local y `git ls-remote` coincidentes en revisión. |
| Vercel | Proyecto ticketera-procont; https://ticketera-procont.vercel.app | Dominio HTTP 200; panel/facturación no consultados. |
| Plan | **Hobby gratuito elegido por el usuario** | Decisión aprobada; facturación, cuotas y elegibilidad no verificadas nuevamente. No prometer capacidad ilimitada. |
| Versión visible | **Versión 202611191900** | GET del bundle; se calcula en America/Lima al iniciar cada build. |
| Login frontend | `VITE_CLIENT_LOGIN_ENABLED=1` | Constante true en bundle actual y evidencia UI conservada. No demuestra login nuevo. |
| Supabase | ticketera-procont / `xsxdpaiivklqeudgqoqf` | GET Management API ACTIVE_HEALTHY. Único destino autorizado. |
| Migraciones | M1–M15, **15/15** | Evidencia remota conservada de activación 20/11; no ejecutar SQL otra vez en esta tarea. |
| client-login | ACTIVE **v3**, verify_jwt=false | GET actual; reporte previo v2 superado por esta observación. |
| admin-users | ACTIVE **v4**, verify_jwt=false | GET actual; validación del bearer en handler. |
| Proveedores | Dos API **de desarrollo**, autorizadas expresamente para piloto público | Decisión del usuario; configuración por nombres presente, no se leyeron valores privados. |
| Auth URLs | Site URL localhost:3000, allowlist vacía | GET actual; no dar invitaciones/callback por operativos. |
| QA después de M15 | Creación/adjuntos/navegación autenticada pendientes | Sin sesiones reutilizables; no volver a solicitar contraseñas ni fabricar sesiones. |

Una URL pública o una opción Vercel llamada Production no convierte las API externas del piloto en contratos de producción. [API y límites](API_CONTRACTS.md), [evidencia](EVIDENCE_20261120.md).

### Activación M16 + M16b (23/11/2026)

Orden usado: base de datos primero (M16 → M16b con `supabase db push --remote=xsxdpaiivklqeudgqoqf --yes`), verificación
posterior y luego merge a main. Gracias a M16b, el frontend anterior sigue siendo compatible, así que no hubo ventana crítica.
El frontend nuevo exige M16 (`client_subprojects`), por lo que no debe desplegarse sobre una base sin M16.
Si M16 entra y M16b falla, la base queda en M16: reintentar M16b (repetible) o desplegar el frontend nuevo; no revertir M16.
No se hizo respaldo lógico previo, por decisión expresa del usuario (la CLI exige Docker para `db dump`).

## Instalación local del frontend

Usar una copia independiente y el lockfile, sin ejecutar SQL de raíz ni seeds. Entorno reproducido: Node 26.8.2, TypeScript 5.9.3, Vite 5.4.21; los rangos declarados están en package.json. No hay `engines` fijado: no prometer compatibilidad con todas las versiones anteriores.

```bash
npm ci
cp .env.example .env.local
```

Editar **solo variables públicas** del frontend en `.env.local` local/ignorada: URL exacta del proyecto y clave publicable proporcionada por un administrador; nunca una clave de servidor. Para frontend de piloto, login enabled 1. El procedimiento documental no solicita ni muestra sus valores.

```bash
npm run dev -- --host 127.0.0.1
npm run build
npm run preview -- --host 127.0.0.1
```

Vite dev utiliza 5173; preview sirve assets ya compilados y su puerto se obtiene del mensaje de arranque. Cambiar variables exige reiniciar dev o generar un build nuevo; preview no recompila. Un build de la misma fuente puede tener otra versión por hora de compilación; una recarga del mismo build no la cambia.

Para trabajar sin proveedores/red remota usar **solo DEV** `VITE_CLIENT_PORTAL_MOCK=1`; aparece «DATOS FICTICIOS», transportes mock y sin tickets alojados. Se elimina del build productivo. La prueba UI inicia su propio fixture HTTP local; no reutilizar una pestaña real para introducir datos ficticios y enviarlos al piloto.

### Backend local y alternativas existentes

El frontend puede usar `client-login` ya desplegado si su origen local está autorizado y la operación de prueba está aprobada. Otra opción existente es `scripts/run_client_login_local.py`, misma Edge en puerto 8000 y Vite 5173; fija proyecto y transmite la clave servidor solo al proceso Deno. `--server-only`/`--frontend-only` evitan reemplazar servidores ya activos. No ejecutarlo durante documentación, no pedir nuevamente QA ni usar una clave privada en frontend.

`VITE_CLIENT_LOGIN_DEV_ORIGIN` solo admite loopback, solo DEV; no altera el destino de las RPC M13. El lanzador configura desarrollo explícitamente y no es un nuevo sistema de login ni almacén cifrado. Deno usa `--cached-only`, así que deben estar previamente disponibles el binario y sus imports autorizados. Si faltan, detener el arranque; no inventar dependencias ni guardar una clave en un archivo env.

Para SQL real aislado usar las suites PostgreSQL de [TESTING_SPEC.md](TESTING_SPEC.md), no el Supabase remoto. `supabase/config.toml` describe puertos y esquema local; no prueba que esas opciones estén sincronizadas con el remoto. No se certificó aquí un stack Docker Supabase completo ni un E2E Storage alojado por correr fixtures PostgreSQL.

## Variables y separación de entornos

| Variable / grupo | Ámbito | Regla |
|---|---|---|
| VITE_SUPABASE_URL | Frontend público | URL HTTPS raíz del proyecto autorizado. |
| VITE_SUPABASE_PUBLISHABLE_KEY | Frontend público | Clave publicable; compatibilidad VITE_SUPABASE_ANON_KEY solo JWT anon, nunca rol privilegiado. |
| VITE_CLIENT_LOGIN_ENABLED | Frontend, por build y entorno | Cadena exacta 1 habilita; 0 o ausente cierra UI. Cambiar requiere nuevo build. |
| VITE_CLIENT_PORTAL_MOCK | Solo DEV | 1 activa datos ficticios; nunca autenticación real de producción. |
| VITE_CLIENT_LOGIN_DEV_ORIGIN | Solo DEV | URL loopback de la función existente; no gateway de producción. |
| SUPABASE_URL y credencial técnica de servidor | Solo proceso Edge | Supabase las inyecta; no copiarlas ni prefijarlas VITE_. No sustituir admin Auth por ella. |
| PROCONT_ALLOWED_ORIGINS | Edge, compartida | Lista separada por comas de orígenes exactos; preservar legítimos, sin wildcard amplio. |
| QUIPU_AUTH_URL / QUIPUFAC_AUTH_URL | Solo Edge | URL explícita, HTTPS y endpoint confirmado; sin fallback. |
| QUIPU_AUTH_RESPONSE_CONTRACT / QUIPUFAC_AUTH_RESPONSE_CONTRACT | Solo Edge | JSON del contrato verificado o alias development en piloto explícito y URL exacta. |
| CLIENT_LOGIN_ALLOW_DEVELOPMENT_PROVIDERS | Solo Edge/lanzador | 1 permite proveedores de desarrollo exclusivamente por autorización de piloto/local. No habilitar silenciosamente como producción real. |
| QUIPU_PLATFORM_ENTRY_SECRET / QUIPUFAC_PLATFORM_ENTRY_SECRET | Solo servidor | Opcionales hasta integración plataforma; distintos por proveedor, nunca enviados desde navegador. |
| PROCONT_INVITE_REDIRECT_URL | Solo Edge admin-users | Callback HTTPS autorizado para invitaciones; falta configuración/validación alojada completa. |

Las variables Vercel Preview y Production son ámbitos distintos. Su configuración efectiva de panel no fue leída: se acredita el bundle servido, no la declaración del panel. No usar el código de ejemplo histórico que guarda todos los secretos en `~/ticketera-edge.env`: fue sustituido por gestión privada en servidor/entrada protegida, sin archivos de secretos en claro. La clave publicable no debe confundirse con un secreto de servidor.

## Secuencia de cambio y puntos de detención

El sistema actual ya pasó M14 → Edge/frontend → M15. **No volver a aplicar M14/M15.** Para otro cambio:

| Paso | Comprobar antes | Detener si | Evidencia después |
|---|---|---|---|
| 1. Fuente | Commit, ancestros, árbol limpio y proyecto correcto; conservar worktrees/archivo 1 | Fuente o destino ambiguos, secretos versionados o cambios pendientes no autorizados | SHA fuente y diff acotado. |
| 2. Migración nueva | Prefijo aplicado, hash y plan exacto; compatibilidad frontend/backend | Plan incluye otra migración, seeds, roles o Vault no autorizados | Historial y permisos efectivos, sin cambiar datos históricos fuera de alcance. |
| 3. Edge | M14 disponible, URLs/contratos del entorno y origen exacto, fuente aprobada | URL no confirmada, contrato pendiente, flag dev no autorizado | Función concreta ACTIVE y preflight correcto; no desplegar todas por omitir nombre. |
| 4. Preview | Proyecto Vercel existente, variables Preview correctas, origen exacto autorizado | Apunta a otro Supabase o depende de RPC anónima antigua | Navegación/formularios/versionado y pruebas autorizadas. Preview comparte DB si usa mismo URL. |
| 5. Publicación | Aprobación de main/push/despliegue y control de promoción automática | Settings Production Branch/auto-deploy no comprendidos | SHA esperado y bundle/version/flag reales en dominio. |
| 6. Smoke/QA | Sesiones reutilizables, alcance y notificaciones revisados | Falta sesión o un fallo de seguridad/contrato; no pedir claves repetidamente | Estados reales o NO VERIFICADO; jamás un PASS simulado. |

Referencia de CLI observada **3.2.0**. Estos comandos describen acciones futuras condicionadas a autorización, **no se ejecutaron en documentación**:

```bash
# Plan de una migración futura: revisar target y lista exacta antes de cualquier escritura.
/ruta/supabase db push --remote=xsxdpaiivklqeudgqoqf --workdir /ruta/checkout --dry-run --skip-vault --output-format json --agent no
# Solo tras autorización y revisión del plan anterior:
/ruta/supabase db push --remote=xsxdpaiivklqeudgqoqf --workdir /ruta/checkout --yes --skip-vault --output-format json --agent no
# Solo función existente y fuente aprobada, sin pruning ni despliegue masivo:
/ruta/supabase functions deploy client-login --remote=xsxdpaiivklqeudgqoqf --workdir /ruta/checkout --use-api --no-verify-jwt
```

No usar `--include-all`, seeds, roles, repair ni comandos de recuperación históricos para forzar una coincidencia. Ante envío ambiguo, leer historial con autorización antes de reintentar; nunca reenviar una migración a ciegas. La CLI puede actualizar Vault antes de migraciones si se omite `--skip-vault`; mantenerlo al no autorizar esa mutación.

No se conoce nuevamente la configuración de auto-deploy de Vercel. Un status Vercel success en GitHub acredita un despliegue, no sus reglas futuras. Antes de publicar, verificar proyecto/Production Branch/promoción/protección Preview; no crear otro proyecto ni hacer doble publicación automática/manual. El repositorio ya está vinculado, así que «Add New Project» no es el procedimiento vigente.

## Verificación operativa y diagnóstico

| Síntoma | Comprobar | Respuesta segura |
|---|---|---|
| Botones No disponible | Constante del bundle, entorno Production/Preview correcto, build nuevo | Una variable guardada no cambia assets existentes; no tocar backend por ese síntoma. |
| origin_denied | Origin exacto, dominio sin slash, allowlist compartida y preflight | No abrir wildcard ni quitar orígenes legítimos. |
| provider_contract_pending / configuration_required | URL/contrato explícitos y flag dev solo si piloto | No probar hosts alternativos ni enviar contraseñas a destinos desconocidos. |
| provider_unavailable | DNS/TLS/timeout/status real desde Edge | No traducir 500 genérico a password incorrecta ni exponer el cuerpo upstream. |
| rate_limited | Ventana M14 e intento previo | No reintentar en bucle ni cambiar IP/usuario para eludir protección. |
| PT401 | Token propio vencido/revocado/ausente | Limpiar sesión; reutilizar otra válida si existe; si prueba sin credencial, NO VERIFICADO. |
| PT403/PT404 | Producto/contexto o identidad del ticket | Conservar sesión y mostrar denegación de recurso. |
| studio_mapping required | Cero/varios estudios activos o explícito inactivo | Admin elige asociación autorizada; nunca inferir UUID al azar. |
| Error de adjuntos | Reserva, edad pending, MIME, bytes finales y cupo | Conservar recibo/clave; no reenviar ticket completo para reparar una subida. |
| CSV incompleto/error | count exact, filtro done, orden, páginas y lotes | No descargar parcial; si cambia la muestra reintentar posteriormente con datos estables. |
| Cuenta interna no accede | Auth válida y perfil activo/rol, no solo JWT | No usar clave técnica como superadmin ni modificar roles sin autorización. |

Guardar solo REQ/UUID/código/status y tiempos de prueba; sin HAR, Authorization, valores de secretos, contraseñas, cuerpos completos ni URLs firmadas. Correlacionar fallos de alta por request_id; resultado Auth desconocido no se remedia creando otro job/cuenta.

## Contingencia antes y después de M15

**Antes de M15 (histórico):** frontend antiguo podía funcionar mientras la RPC anónima seguía expuesta. No era un estado seguro final; cualquier ventana debía estar acotada.

**Después de M15 (vigente):** conservar revocaciones y guardas. No rollback a `44cebeb` ni frontend que requiere submit_client_request anónimo. Recuperar con versión compatible o corrección hacia adelante revisada. No restaurar DB anterior ni aplicar compensaciones M1–M4 automáticamente; podrían perder historial nuevo.

Deshabilitar el flag UI o retirar CORS no revoca las sesiones ni constituye contención completa para llamadas servidor-servidor. Si hay incidente, definir alcance y usar mecanismos administrativos existentes con autorización específica; no revocar masivamente, borrar datos ni crear un kill switch nuevo como reacción implícita. No cambiar proveedores del piloto ni reabrir permisos como fallback.

## Pendientes de operación

Invitaciones/callback/SMTP, contratos de producción externos, plan Vercel verificado en panel, configuración Preview/auto-deploy y seis pruebas post-M15 siguen pendientes con alcances de [PROJECT_STATUS](../PROJECT_STATUS.md). Este documento no declara preparación de producción completa ni autoriza esas operaciones.
