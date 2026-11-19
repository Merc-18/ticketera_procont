# Portal de clientes Quipu / QuipuFac — frontend

19/11/2026. Rama de integración `integration/client-portal` (base `main@35b9726`) =
backend de Codex `codex/client-access-m13@77fe593` (M13 + Edge Function `client-login`) +
frontend de Claude `claude/client-portal@aeeaa12`, conectado al contrato real
`contracts/client-access-client.mjs`. Backend detallado: [client-access-backend.md](client-access-backend.md).

## Rutas

| Ruta | Pantalla | Sesión |
|---|---|---|
| `/cliente` | Pública: «¿Qué producto utilizas para ingresar?», tarjetas Quipu / QuipuFac, formulario dinámico y búsqueda por REQ (solo número y estado) | No |
| `/cliente/acceso/{quipu\|quipufac}#code=<código>` | Acceso desde plataforma: lee y borra el fragmento, `exchange(provider, code)`, confirmación «Continuar / No soy yo» | Crea sesión |
| `/cliente/nuevo` | Nuevo ticket (reutiliza `PublicRequestForm` en modo cliente) o aviso de asociación pendiente | Sí |
| `/cliente/tickets` | Mis tickets (tabla en escritorio, tarjetas en móvil) | Sí |
| `/cliente/tickets/:id` | Detalle autorizado por UUID: seguimiento general y datos enviados | Sí |

Sin cambios: `/login`, `/`, `/portal`, `/request` (formulario público provisional), `/tracking`.

## Conexión con el contrato de Codex (`src/lib/client-portal.ts`)

`createClientPortal(transport, {metadata, upload})` envuelve `createClientAccess` (no hay backend propio):

| Interfaz | Contrato | Notas |
|---|---|---|
| Ingreso Quipu / QuipuFac | `login` → Edge `client-login` `{action:'login', provider, ruc, username?, password}` | Luego `client_session_info` + `client_products` |
| Acceso desde plataforma | `exchange(provider, code)` → Edge `client-login` `action:'exchange'` | Exige `entry_context:'platform'` del mismo proveedor |
| Sesión actual | `session` + `products` | Coherencia: Quipu = usuario; QuipuFac = empresa; plataforma ≤ 1 producto |
| Nuevo ticket | `submit(token, payload, key)` → `client_submit_request` | Sin `studio_id`/RUC; clave de idempotencia de `createRpcAttempt` |
| Adjuntos | `reserveAttachments` → `client_reserve_attachments` + `uploadReservedTicketAttachment` | 4 archivos / 2.500.000 bytes, reserva atómica |
| Mis tickets | `tickets(token, {limit:100})` → `client_list_tickets` | Nombre de producto desde `client_products` o el catálogo público |
| Detalle | `detail(token, id)` → `client_ticket_detail` | Ajeno o inexistente → «no encontrado» |
| Salir | `logout` → `client_logout` | Revoca y limpia `sessionStorage` |

Mensajes por código: `provider_contract_pending` → «El ingreso todavía no está habilitado»;
`invalid_credentials*`/`provider_identity_mismatch` → «No pudimos validar los datos»;
`studio_mapping_required` (o `company.studio_mapping:'required'`) → «Tu empresa aún no está
habilitada…», sin datos internos; resto → «servicio no disponible».

**Errores distintos antes de activar M13.** `PT401` → sesión inválida/vencida;
`PT403` → producto no permitido; `PT404` → ticket ajeno o inexistente (misma respuesta).
El contrato devuelve códigos de recurso distintos y el frontend conserva una sesión
vigente al rechazar un producto o un ticket. No se consulta otra vez la sesión para
adivinar el motivo. `42501` queda como permiso/ventana de adjuntos, sin expulsar al cliente.

El ingreso real está deshabilitado por defecto (`VITE_CLIENT_LOGIN_ENABLED=0`):
no muestra el formulario de contraseña ni canjea códigos. La vista ficticia sigue
limitada a DEV. Solo se habilitará tras confirmar los contratos y un despliegue autorizado
de `client-login`; el seguimiento público por REQ continúa disponible.

Diferencias con el diseño previo: el contrato no expone nombre de empresa (la cabecera muestra el
estudio asociado o «RUC …») ni el tipo de solicitud en el detalle (no se muestra).

## Datos ficticios

Solo en `tests/client-portal.test.mjs` y en la vista de desarrollo aislada
(`src/dev/client-portal-mock.ts`, simula el contrato de Codex con sus SQLSTATE), activada únicamente
con `vite` y `VITE_CLIENT_PORTAL_MOCK=1`. Eliminada del build (verificado).

## Validación anterior de la integración (19/11/2026)

- `node --test tests/client-portal.test.mjs tests/client-login.test.mjs tests/ticket-attachment-limits.test.mjs tests/attachment-integration.test.mjs`: 44/44.
- Contrato TypeScript de Codex (`tests/client-access-contract.types.mts`) y `tsc` del proyecto: sin errores; `npm run build` correcto.
- Chromium headless 1366×900 y 390×844: dos formularios, cuatro reglas (QuipuFac directo incluye
  Quipu_Gestion y excluye Quipu), envío, Mis tickets por identidad, detalle propio/rechazado/ajeno,
  acceso desde plataforma (fragmento eliminado, producto fijo), código inválido, asociación pendiente,
  contrato de proveedor pendiente y detalle sin sesión → ingreso. Sin errores de consola.
- Supabase `xsxdpaiivklqeudgqoqf`: `migration list` 12/12 aplicadas, solo `20261119000100` pendiente;
  `db push --remote --dry-run` → solo `20261119000100_client_access.sql`. Precondiciones (solo
  lectura): `Quipu` y `Quipu_Fac` activos, `requests.public_rejection_reason`, `submit_client_request`
  y `reserve_request_attachments` presentes, ninguna tabla `app_private.client_*` previa. M13 **no aplicada en esa comprobación anterior**. La activación vigente se registra en
  [client-m13-activation.json](validation/client-m13-activation.json).

## Pendiente para operar con clientes reales

1. **Contrato de respuesta de las API externas** (Quipu y QuipuFac): sin `QUIPU_AUTH_RESPONSE_CONTRACT`
   / `QUIPUFAC_AUTH_RESPONSE_CONTRACT` verificados, `client-login` responde `provider_contract_pending`
   y la interfaz muestra «El ingreso todavía no está habilitado». No se hicieron llamadas reales.
2. Desplegar la Edge Function `client-login` con `PROCONT_ALLOWED_ORIGINS` = origen del frontend
   (si falta, el navegador recibe `origin_denied` → «servicio no disponible»).
3. Acceso desde plataforma: secretos `QUIPU_PLATFORM_ENTRY_SECRET` / `QUIPUFAC_PLATFORM_ENTRY_SECRET`
   y que el integrador abra `https://<ticketera>/cliente/acceso/{quipu|quipufac}#code=<código>`.
4. Asociaciones RUC → estudio ambiguas mediante `set_client_company_studio` (admin/superadmin).
5. `client-login` no limita intentos por RUC/IP (observado en esta integración); recomendable antes de producción.
6. Habilitar explícitamente `VITE_CLIENT_LOGIN_ENABLED=1` solo después de esos contratos y del despliegue autorizado. El despliegue del frontend queda fuera de esta activación.
