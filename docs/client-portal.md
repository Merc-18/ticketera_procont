# Portal de clientes Quipu / QuipuFac — frontend

19/11/2026. Base `main` @ `35b9726`, rama `claude/client-portal`. Solo frontend: sin SQL,
migraciones, Edge Functions ni cambios en Supabase. El backend (M13, autenticación, sesiones y
Mis tickets) lo implementa Codex; este frontend se conecta mediante un adaptador provisional.

## Rutas

| Ruta | Pantalla | Sesión |
|---|---|---|
| `/cliente` | Pública: «¿Qué producto utilizas para ingresar?», tarjetas Quipu / QuipuFac, formulario dinámico y búsqueda por REQ (solo número y estado) | No |
| `/cliente/acceso#c=<código>` | Acceso desde plataforma Quipu/QuipuFac: canje del código, confirmación «Continuar / No soy yo» | Crea sesión |
| `/cliente/nuevo` | Nuevo ticket (reutiliza `PublicRequestForm` en modo cliente) | Sí |
| `/cliente/tickets` | Mis tickets (tabla en escritorio, tarjetas en móvil) | Sí |
| `/cliente/tickets/:REQ` | Detalle autorizado: seguimiento general y datos enviados | Sí |

Sin cambios: `/login`, `/`, `/portal`, `/request` (formulario público provisional), `/tracking`.
La búsqueda por REQ no aparece dentro del espacio del cliente.

## Reglas de producto (las calcula el servidor)

| Acceso | Productos en Nuevo ticket |
|---|---|
| Web con Quipu | Todos los activos (selector) |
| Web con QuipuFac | Todos excepto Quipu (selector) |
| Desde plataforma Quipu | Quipu fijo (sin selector) |
| Desde plataforma QuipuFac | QuipuFac fijo (sin selector) |

El frontend no tiene lista propia: muestra `session.products`. `parseSession` descarta sesiones
incoherentes (QuipuFac con Quipu, plataforma con más de un producto, origen ≠ tipo de ingreso,
QuipuFac con usuario individual). `submitTicket` rechaza productos fuera de la sesión; el servidor
debe revalidarlo.

## Adaptador (`src/lib/client-portal.ts`)

`CLIENT_PORTAL_CONTRACT` (provisional; ajustar solo este archivo al publicarse el definitivo):

| Operación | Llamada | Argumentos | Respuesta esperada |
|---|---|---|---|
| Inicio de sesión | Edge Function `client-login` | `{auth_type:'quipu', ruc, username, password}` o `{auth_type:'quipufac', ruc, password}` | `{session_token, session}`; 400/401/403 → credenciales; 404 → no publicado; 429 → límite |
| Acceso desde plataforma | RPC `exchange_client_launch` | `p_code` | `{session_token, session}` con `origin` no nulo |
| Sesión actual | RPC `get_client_session` | `p_session_token` | `session` |
| Crear ticket | RPC `submit_authenticated_client_request` | `p_session_token`, `p_payload` {requester_name, system_id, request_type_id, title, description, urgent_requested}, `p_idempotency_key` | `{id, request_number, tracking_token}` |
| Mis tickets | RPC `list_my_client_requests` | `p_session_token` | `[{request_number, product_name, title, created_at, status, requester_name}]` |
| Detalle | RPC `get_my_client_request` | `p_session_token`, `p_request_number` | objeto o `null` (ajeno = inexistente) |
| Cerrar sesión | RPC `end_client_session` | `p_session_token` | — |

`session` = `{company_name, auth_type, origin, identity, products:[{id, name, client_key}], expires_at}`;
`identity` = `{kind:'individual', username, display_name}` (Quipu) o `{kind:'company_account'}` (QuipuFac).
`status` = estado general de `request-status.ts`.

Errores RPC esperados: `PGRST202`/`42883` → «acceso aún no habilitado»; `28000` → sesión vencida
(vuelve a `/cliente`); `22023`/`23514` → mensaje de validación del servidor.

Seguridad en el cliente: la contraseña solo viaja en el cuerpo de `client-login` y se borra del
estado tras cada intento; en `sessionStorage` solo se guarda el token opaco (`client-session-store.ts`);
el token nunca va en la URL; el código de acceso se lee del fragmento y se elimina del historial
antes del canje; las respuestas se filtran por lista blanca (nada interno llega a la vista).

## Adjuntos

Sin cambios de contrato: tras crear el ticket se usa `uploadRequestAttachments(id, tracking_token)`
(reserva atómica + subida, 4 archivos / 2,5 MB). Requiere que `submit_authenticated_client_request`
devuelva `tracking_token` como `submit_client_request`.

## Datos ficticios

Solo en `tests/client-portal.test.mjs` y en la vista de desarrollo aislada
(`src/dev/client-portal-mock.ts`), activada únicamente con `vite` y `VITE_CLIENT_PORTAL_MOCK=1`
(banner rojo «DATOS FICTICIOS»). La rama se elimina del build de producción (verificado: el bundle
no contiene textos del simulador). Credenciales ficticias: RUC `20000000001`, contraseña `demo`.

## Validación

- `node --test tests/*.test.mjs`: 101/101 (16 nuevas del portal).
- `npm run build`: correcto (aviso preexistente de tamaño de chunk).
- Revisión en Chromium headless, 1366×900 y 390×844: tarjetas y formularios, validaciones, las
  cuatro reglas, envío, Mis tickets Quipu/QuipuFac, detalle propio/rechazado/ajeno, acceso desde
  plataforma (código eliminado de la URL, producto fijo), código inválido, detalle sin sesión →
  ingreso; `/request` y `/portal` sin cambios. Sin errores de consola.

## Pendiente del backend (Codex)

1. Publicar `client-login` y las RPC con los nombres/formas de arriba, o informar los definitivos.
2. `catalog_systems.client_key` (`quipu`/`quipufac`) y el cálculo de productos permitidos.
3. `tracking_token` en la constancia de envío (adjuntos).
4. Códigos de error acordados (`28000` sesión, `22023` validación).
5. Decisiones abiertas del plan: si «excepto Quipu» incluye `Quipu_Gestion`; asociación RUC → estudio;
   formato de respuesta de las API de autenticación; destino del formulario público `/request`.
