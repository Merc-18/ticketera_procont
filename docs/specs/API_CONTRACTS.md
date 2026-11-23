# Contratos API y adaptadores

Revisión: **23/11/2026** · Código de referencia: **`2f9ab74aff3d612951596986490b5641a27f3932`** (tag `ticketera-production-20261123`, [release](../validation/production-release-20261123/REPORT.md)). Revisión anterior: 20/11/2026 sobre `c857a72`.

Fuente oficial de requisitos: [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md).

## Ampliación M16 + M16b — 23/11/2026

> **Producción 23/11/2026 15:55 UTC:** M16 (`20261123000100_client_request_data_security.sql`, sha256 `ecec0b9a…3f102`) y M16b (`20261123000200_client_legacy_payload_compat.sql`, sha256 `8adce4bb…d036`) **aplicadas** en `xsxdpaiivklqeudgqoqf`; historial 17/17 y funciones remotas idénticas a la instalación probada (107/107). [Activación](../validation/m16-activation-20261123/REPORT.md).

Base comprobada: `a61450c93f5180ecd623d945b100424a47a3a5d3`; handoff
`8fabd88e99cc0e53dbc43c3402730d785c148a7a`. Inicialmente preparada en local; **aplicada en producción el 23/11/2026**.
M16b no cambia firmas: `client_submit_request` acepta además el payload del frontend anterior
(`requester_name` Quipu ignorado y no almacenado; sin clave `subsystem_id` se acepta NULL hasta la aprobación).
El [contrato de coordinación](../validation/client-experience-contract-handoff.md) es la definición
exacta de la ampliación; [informe backend](../../REPORT-backend-codex1.md). Los contratos de login Edge no cambian.

- Nueva RPC `client_subprojects(p_session_token text,p_system_id uuid) RETURNS jsonb`: array
  `{id,system_id,name}`, solo hijos activos de producto permitido por sesión/contexto.
- Firma y recibo de `client_submit_request` se conservan. Payload añade `subsystem_id?: uuid|null`
  y `requested_priority?: low|medium|high|urgent` con default `medium`; null/arbitrarios rechazados.
- `urgent_requested` sigue booleano independiente, omitido=false. No se infiere de prioridad
  ni a la inversa: low+true y urgent+false son válidos. No sustituye `projects.priority`.
- Quipu deriva requester_name desde verified_name confiable o username exacto; si el cliente
  lo envía, debe coincidir. QuipuFac requiere nombre declarado por ticket, sin efecto en permisos.
- Listado/detalle añaden `requested_priority`, `requested_subsystem_id`, `requester_name_source`;
  históricos null. `requester_name_verified` true solo para source verified_name. Firma de listado,
  limit1..100/offset0..100000 y orden created_at desc/id desc se mantienen; no hay total nuevo.
- Lectura interna `public.requests` y relación calculada `requests(public.projects)` incluyen
  las columnas nuevas bajo RLS existente. Proyecciones explícitas deben incluir requested_priority.
- Sesiones/códigos históricos Quipu provider_id sin snapshot fallan cerrados; links ambiguos
  no se reasignan. PT404 de ticket ajeno conserva sesión válida; sesión ambigua recibe PT401.


## Alcance y fuente

API propia: Edge `client-login` y RPC de PostgreSQL. Las firmas se contrastaron con M1–M15 (inventario del 20/11; las ampliaciones M16/M16b están en la sección superior) y contratos `.d.mts`/`.mjs`; inventario completo de 47 nombres públicos (incluye dos relaciones calculadas) en [DATABASE_SPEC.md](DATABASE_SPEC.md#catalogo-de-funciones-publicas). [OpenAPI 3.1](client-login.openapi.yaml) cubre solamente el endpoint propio `client-login`; no inventa un esquema completo de proveedores ni de todos los servicios Supabase.

## Endpoint `client-login`

`POST https://xsxdpaiivklqeudgqoqf.supabase.co/functions/v1/client-login`

- HTTPS. `Content-Type: application/json`; cuerpo objeto, máximo **16384 bytes**; se rechazan claves desconocidas.
- Navegador: `Origin` exacto autorizado; SDK envía `apikey` pública y headers de transporte (`authorization`, `x-client-info`). El token de sesión cliente **no** se usa como JWT Auth ni Bearer de personal.
- `OPTIONS`: 204, métodos POST/OPTIONS; origen desconocido: 403. Otros métodos: 405. Cabeceras del handler: `Vary: Origin`, `Cache-Control: no-store` y JSON.
- `verify_jwt=false` en configuración Edge: no requiere sesión interna para login, pero cada acción verifica sus credenciales/código/secreto. No significa «sin seguridad».
- Gateway Supabase puede devolver su propio formato `{code,message,...}` antes del handler. Los errores propios son `{error: código}`. No loguear cuerpos de login, headers de autorización ni respuestas completas.

### Login Quipu

```json
{"action":"login","provider":"quipu","ruc":"20000000000","username":"UsuarioQA","password":"CONTRASEÑA_FICTICIA"}
```

### Login QuipuFac

```json
{"action":"login","provider":"quipufac","ruc":"20000000000","password":"CONTRASEÑA_FICTICIA"}
```

Ejemplos deliberadamente ficticios; no ejecutar con estos valores para medir disponibilidad.

| Campo | Validación exacta |
|---|---|
| `action` | `login`, `exchange` o `issue_code`; campos permitidos dependen de acción. |
| `provider` | `quipu` o `quipufac`. |
| `ruc` login/issue_code | Cadena de exactamente 11 dígitos. No hay comprobación implementada de dígito SUNAT. |
| `username` login Quipu | Cadena de 1..256, igual a su trim; comparación exacta sensible a mayúsculas. |
| `username` login QuipuFac | Debe estar ausente. El adaptador usa el RUC como username upstream. |
| `password` login | Cadena de 1..4096; solo pasa al proveedor en servidor. No se guarda ni refleja. |
| URL del proveedor | HTTPS, sin usuario, password, query ni fragmento. Timeout de 10000 ms; `redirect:error`. |
| Respuesta upstream | JSON objeto <=65536 bytes, token no vacío <=16384 caracteres y regla de éxito declarada. |

Antes de contactar al proveedor se valida contrato y M14 registra el intento. Las respuestas reales del proveedor solo acreditan los campos observados; no convierten sus roles o tokens en autorización interna.

### Respuesta de sesión 200

Forma **raw** del contrato, no la sesión transformada de React:

```text
{
  session_token: string (64 hex; capacidad propia de Ticketera),
  session: {
    expires_at: timestamp ISO,
    entry_context: "direct" | "platform",
    identity: {
      id: UUID, provider: "quipu" | "quipufac", kind: "user" | "company",
      username: string | null, subject_source: "provider_id" | "username" | "company",
      verified_name: string | null, name_verified: boolean
    },
    company: {ruc: string, studio_id: UUID | null, studio_mapping: "resolved" | "required"}
  }
}
```

El handler genera token de 256 bits y guarda solo SHA-256 en M13; sesión Edge de ocho horas. La restricción SQL admite hasta 24 horas como límite técnico, pero la Edge aprobada emite ocho. No hay refresh de sesión cliente; un nuevo ingreso no debe ejecutarse automáticamente ante un error de producto o ticket. `client_products` se consulta aparte; la respuesta Edge no incluye `products` ni `auth_type` plano.

### Códigos temporales de plataforma

Mismo endpoint, sin endpoint adicional:

| Acción | JSON | Autorización / respuesta |
|---|---|---|
| `issue_code` Quipu | `action, provider, ruc, subject, subject_source, username, verified_name?` | Servidor de plataforma, sin Origin, `Authorization: Bearer` del secreto del proveedor (32..4096 caracteres); devuelve `{code,provider,expires_at}`. |
| `issue_code` QuipuFac | `action, provider, ruc, verified_name?` | No admitir subject/subject_source/username suministrados; el servidor fija company. |
| `exchange` | `action, provider, code` | Código de 64 hex del mismo proveedor, no usado y vigente; devuelve recibo de sesión con contexto platform. |

Para Quipu, `subject_source` es provider_id o username; si es username, subject y username deben coincidir. `verified_name`, si se envía, 1..300. Código Edge vence en **60 segundos** (SQL impone máximo dos minutos), se consume atómicamente una sola vez y ambos códigos/tokens quedan como hash. El navegador abre `/cliente/acceso/quipu#code=...` o `/cliente/acceso/quipufac#code=...`; `ClientLaunch` elimina el fragmento antes del canje, pide confirmar la identidad y revoca si el usuario indica «No soy yo». No se confirmó integración real con servidores externos ni secretos de plataforma en el piloto.

### Errores propios

| HTTP | Códigos / causa |
|---|---|
| 400 | `invalid_json`, `invalid_request`, `invalid_provider`, `invalid_action`, `invalid_entry_code`, `invalid_ruc`, `invalid_credentials_input`, `invalid_identity`; también `invalid_request` por RPC 22023. |
| 401 | `invalid_credentials`, `provider_identity_mismatch`, `platform_authentication_required`, `client_authentication_required`. |
| 403 | `origin_denied`, `platform_server_required`. |
| 405 | `method_not_allowed`. |
| 413 | `body_too_large`. |
| 415 | `json_required`. |
| 429 | `rate_limited`; `Retry-After: 900`. |
| 502 | `provider_unavailable`, `provider_response_invalid` (red/timeout/status/cuerpo inesperado). |
| 503 | `provider_contract_pending`, `provider_configuration_required`, `client_backend_unavailable`. |

No devolver texto privado upstream ni mensajes de excepción. El transporte del frontend recupera el código seguro desde errores HTTP de Edge y muestra mensajes del catálogo de `client-portal.ts`. Un PT404 de RPC no debe expulsar de la sesión.

## Proveedores usados expresamente en el piloto público

**Son API de desarrollo, no las API oficiales de producción.** La autorización temporal del usuario permite probarlas desde la web pública. Módulo `client-login-config.mjs`: ninguna URL/contrato tiene fallback automático; requiere variables explícitas. Las URLs de desarrollo se descartan salvo `CLIENT_LOGIN_ALLOW_DEVELOPMENT_PROVIDERS=1`; el alias de contrato `development` solo sirve con ese permiso y la URL exacta conocida.

| Proveedor | POST desarrollo y cuerpo | Éxito observado | Error observado / adaptación |
|---|---|---|---|
| Quipu | `https://api-gestion-test.quipufac.com/api/users/auth`; `ruc, username, password` | HTTP 200; username coincidente y token no vacío. | Credenciales incorrectas HTTP 400, cuerpo cadena JSON sin token. Regla `failure.statuses=[400]`; Ticketera devuelve 401. |
| QuipuFac | `https://dev.quipufac.com/auth/login`; `username=RUC, password` | HTTP 200; username y businessRuc coinciden con RUC, businessName observado y token no vacío. | HTTP 500 con `{success:false,message}`; solo `500` y `success===false` declarado significan credenciales incorrectas → 401. Otro 500/502 es fallo de proveedor. |

Fuentes: [Quipu](../validation/client-login-dev-api.json), [QuipuFac](../validation/quipufac-login-dev-api.json), [errores](../validation/provider-failure-responses-20261119.json). El adaptador no exige que `businessName` exista para aceptar si falta/null, pero si se devuelve debe ser cadena acotada y se usa como nombre verificado. No elevar la observación de «nombre no vacío» a una validación obligatoria que no está en el código.

**No confirmados:** ID estable Quipu, RUC devuelto por Quipu, esquema exhaustivo de respuestas, todos los errores posibles y contratos de producción. No inferir tenant, permisos, usuarios internos o campos adicionales. Quipu del piloto usa fallback explícito al username exacto; QuipuFac se identifica como cuenta empresarial. Los tokens upstream se descartan siempre.

## RPC de clientes M13

POST a `/rest/v1/rpc/{nombre}` con clave pública y JSON; la capacidad cliente viaja solo en `p_session_token`, nunca URL/header de sesión interna. Tipos completos en [client-access-client.d.mts](../../contracts/client-access-client.d.mts).

| RPC | Argumentos | Respuesta / regla |
|---|---|---|
| `client_session_info` | `p_session_token:text` | Sesión raw anterior, sin token. |
| `client_products` | `p_session_token:text` | Array `{id,name,requires_subproject}` activo y autorizado por contexto. |
| `client_submit_request` | `p_session_token:text,p_payload:jsonb,p_idempotency_key:uuid` | `{id,request_number,tracking_token}`; sesión, producto y estudio; enlace por identidad; helper antiguo solo interno. |
| `client_list_tickets` | `p_session_token:text,p_limit:int=50,p_offset:int=0` | Array de resumen, limit 1..100, offset 0..100000, created_at desc/id desc. UI actual pide 100 y no pagina más. |
| `client_ticket_detail` | `p_session_token:text,p_request_id:uuid` | Resumen + description, urgent_requested, motivo público de rechazo y timeline filtrado; ajeno=inexistente. |
| `client_reserve_attachments` | `p_session_token:text,p_request_id:uuid,p_files:jsonb` | Array de reservas; validar propiedad y reutilizar cuota M9. |
| `client_logout` | `p_session_token:text` | void; marca revoked_at sin emitir token nuevo. |
| `set_client_company_studio` | `p_ruc:text,p_studio_id:uuid o null` | void; solo admin/superadmin activo, no cliente. |

Payload de creación, sin estudio/identidad elegibles:

```json
{"requester_name":"Persona QA","system_id":"00000000-0000-4000-8000-000000000101","request_type_id":"00000000-0000-4000-8000-000000000102","title":"Ejemplo ficticio","description":"Solicitud de ejemplo, sin incidencia real.","urgent_requested":false}
```

Nombre requerido; título trim 1..300, descripción trim 1..20000, ids activos, urgencia booleana opcional. Cliente no decide prioridad. `tracking_token` es una capacidad técnica UUID distinta del token de sesión de 256 bits; no mostrarla en el recibo visual ni convertirla en autorización para Mis tickets.

Resumen raw de ticket: `id,request_number,title,created_at,status,general_status,system_id,requester_name,requester_name_verified:false`. `status` raw conserva pending/approved/rejected; el adaptador de UI usa el estado general para presentación. Timeline cliente solo incluye submitted/review_started/approved/rejected/status_changed, sin notas internas de otros eventos.

RPC exclusivas de Edge por ACL: `client_open_session`, `client_issue_entry_code`, `client_exchange_entry_code`; también `client_login_throttle` M14. No invocarlas desde navegador ni usarlas para eludir la autenticación de QA.

| SQLSTATE | Significado de recurso | Respuesta de frontend |
|---|---|---|
| PT401 | Sesión inválida/vencida/revocada | Limpiar sesión y regresar al ingreso. |
| PT403 | Producto no permitido | Mostrar error y conservar sesión. |
| PT404 | Ticket ajeno o inexistente | «No encontrado», conservar sesión. |
| 42501 | Permiso/ventana de reserva u otra autorización | Error de recurso; no deducir expiración de sesión automáticamente. |
| 22023 | Payload, clave, formato o paginación inválidos | Corregir la entrada conservando las reglas de reintento. |
| 23514 | Asociación, clasificación, cupo/estado incompatibles | No reintentar a ciegas ni inventar asociaciones. |

## Seguimiento y capacidades heredadas

`track_request_status(p_request_number:text)` no necesita sesión y devuelve `null`, `{request_number,status}` o `{rate_limited:true}`. Contador M10 por minuto: IP 10/global 300; no equivale al throttle de login. El frontend no proyecta otros campos.

La RPC anterior `track_request(p_request_number,p_tracking_token)` permanece como contrato de capacidad privada de M3/M9; devuelve además fecha/título/motivo público solo a quien presenta el UUID secreto. No es la búsqueda pública por REQ ni se usa en la ruta `/tracking` vigente. Las reservas heredadas siguen exigiendo esa capacidad; no son una vía anónima para crear solicitudes. M15 cierra `submit_client_request` directo, no reabre estos permisos.

## Personal, tablero y administración

- Operaciones de `board-operations-client`: [WORKFLOWS_SPEC.md](WORKFLOWS_SPEC.md) lista cada acción/payload. RPC `get_board_ticket`, `operate_board_ticket`, `operate_board_tickets` y `reserve_board_evidence` conservan contratos M12. Una UUID por comando; locks y auditoría en la misma transacción.
- `submit_request` recibe payload interno de solicitante/correo/área/tipo/origen/sistema/description/observations/request_date/requested_date/needs_code. `submit_classified_request` separa `p_classification` `{studio_id,system_id,subsystem_id?,area_id?,subarea_id?}` y no acepta requester_area. Consumidor: Planner vía `createOperations.submitRequest`. M15 exige editor activo antes de replay; UI limita importador a administradores.
- `classify_request` `{studio_code_id,subsystem_id?,area_id?,subarea_id?}`; `assign_request_studio_code` conserva firma compatible; `start_request_review` inicia revisión.
- `approve_request`: `{title?,project_type:development,priority,assigned_dev,start_date?,due_date?,assigned_admin:null,sla_target_date:null,sla_formal_days:null}`; responsable obligatorio; admin/superadmin. `create_internal_project` usa INT y también admite requester_name/area descriptivos. [Permisos](PERMISSIONS_SPEC.md).
- `reject_request` o `reject_request_with_notes`: separar motivo público obligatorio y notas internas; `publish_rejection_reason` permite publicar un motivo seguro de rechazo histórico mediante autorización administrativa, sin copiar notas automáticamente.
- Métricas: [METRICS_SPEC.md](METRICS_SPEC.md) documenta parámetros, cohortes, unidades, nulls y diferencias entre resumen general y pareado.
- Relaciones calculadas `requests(public.projects)` y `projects(public.requests)` resuelven embeddings PostgREST; no son comandos de creación.
- `change_project_type`/`purge_project` conservan nombre pero M12 los bloquea (`0A000`). No usarlos como APIs funcionales nuevas.

### Edge `admin-users`

`POST /functions/v1/admin-users`, JSON <=16384 bytes, origen permitido y Bearer Supabase Auth válido verificado con `auth.getUser`. El actor no se toma del body ni de metadata arbitraria. Acciones: `create` `{request_id,email,full_name,role,password}`; `invite` mismo cuerpo sin password; `resume` solo `{action,request_id}`. UUID estable por alta; email <=320, nombre 1..200; password de alta 12..128. Invitación necesita redirect HTTPS privado configurado y no activa inmediatamente el perfil.

Respuestas 201 para alta completada o 200 para replay/reanudación: `{id,request_id}`. Errores seguros incluyen authentication_required 401, forbidden/origin_denied 403, invalid_request/password_policy 400, json_required 415, request_too_large 413, reconciliation_required/auth_outcome_requires_review 409, invitation_not_configured/backend_unavailable/operation_requires_review 503. Mantener request_id ante resultado incierto; no repetir alta con otro id ni asumir que una identidad Auth ya existente fue creada por esta operación.

RPC `admin_account_begin/record/finish` solo para servidor; el backend sigue exigiendo actor autorizado y roles M5. Superadmin crea cualquier rol; admin solo developer/viewer y no administra objetivos admin/superadmin. Bootstrap es privado, inicial e irreversible desde aplicación; nunca endpoint HTTP. Invitaciones/SMTP/callback real permanecen sin validación completa.
