# Release de producción — 23/11/2026

Informe consolidado del paso a producción de la experiencia del cliente con M16 y M16b.
Tag: `ticketera-production-20261123` → `2f9ab74aff3d612951596986490b5641a27f3932` (código desplegado).
Los informes de cada etapa se conservan sin cambios:
- [integración](../client-experience-integration-20261123/REPORT.md)
- [preparación de M16b](../m16b-preparation-20261123/REPORT.md)
- [activación](../m16-activation-20261123/REPORT.md)
- informes originales de [Codex 1](../../../REPORT-backend-codex1.md) y [Codex 2](../../../REPORT-frontend-codex2.md)

## GitHub

| Elemento | Valor |
|---|---|
| main de la release | `2f9ab74aff3d612951596986490b5641a27f3932` |
| PR #2 | Merge normal `718ab04`, padres `a61450c` (main anterior) y `5814a6d` (integración). Código, M16, M16b, pruebas y evidencias. |
| PR #3 | Merge normal `2f9ab74`, padres `718ab04` y `849f41f`. Solo documentación del despliegue. |
| Historial de Codex 1 | `8fabd88` (handoff) y `b795fb9` (M16), alcanzables desde main. |
| Historial de Codex 2 | `016d724` y `947eeee` (frontend), alcanzables desde main. |
| Integración | `ed75df9` y `c126089` (merges `--no-ff`), `091200c` (fixtures de login), `f1e0632` (evidencias), `449b4bc` (M16b), `5814a6d` y `849f41f` (documentación). |
| Ramas | Tras esta release solo queda `main` en el remoto; las ramas eliminadas eran ancestros de main (ver más abajo). |

Archivos principales incorporados:
- `supabase/migrations/20261123000100_client_request_data_security.sql` (M16)
- `supabase/migrations/20261123000200_client_legacy_payload_compat.sql` (M16b)
- Componentes de cliente, RequestInbox y RequestValidationModal; adaptador `src/lib/client-portal.ts` y contratos `contracts/client-access-client.*`
- Pruebas: `supabase/tests/client_data_security_local.py`, `client_data_security_bridge.mjs`, `m15_function_fingerprint.py`; pruebas Node y UI
- Evidencias en `docs/validation/` (las tres carpetas del 23/11 y `client-experience-ui-20261123`, con 133 capturas)

## Supabase (`xsxdpaiivklqeudgqoqf`)

| Elemento | Resultado |
|---|---|
| M16 | `20261123000100_client_request_data_security.sql`, sha256 `ecec0b9a9fe5b878f542725f3015d71a7aae48845ceb00e3982d9c3186f3c102` |
| M16b | `20261123000200_client_legacy_payload_compat.sql`, sha256 `8adce4bb65462feaa437b356c14e136f4c2b1e9ad33a9eda2ac47f247c5ad036` |
| Aplicación | `supabase db push` del 23/11/2026, 15:55:05–15:55:14 UTC. Cada archivo en su propia transacción (no son atómicas en conjunto); ambas terminaron sin error. |
| Historial | 17/17 (local = remoto). |
| Huella | 107/107 funciones `public`/`app_private` idénticas a una instalación local M1–M16b (cuerpo, firma, `SECURITY DEFINER`, configuración, EXECUTE). |
| Datos históricos | 4 solicitudes conservadas con `requested_priority`, `requested_subsystem_id` y `requester_name_source` en NULL. 1 urgencia histórica conservada. |
| Propiedad | 3/3 tickets de clientes siguen visibles para su identidad propietaria (1 Quipu, 2 QuipuFac). |
| Estructura | Default de `requested_priority` = `'medium'`. CHECK `low/medium/high/urgent`. FK `(requested_subsystem_id, system_id)`. 3 triggers. La unicidad de identidad incluye el username y la de M13 se retiró. |

No se hizo respaldo lógico previo, por decisión expresa del usuario: la CLI 3.2.0 necesita Docker para `db dump`.
Cualquier corrección será una migración nueva.

## Seguridad: resultados HTTP reales (sin escrituras)

Llamadas a PostgREST de producción con la clave publicable del bundle público y un token inválido:

| Llamada | Resultado |
|---|---|
| `client_subprojects` | 401, PT401 |
| `client_list_tickets` | 401, PT401 |
| `client_ticket_detail` | 401, PT401 |
| `client_session_info` | 401, PT401 |
| `submit_client_request` | 401, 42501 (sin EXECUTE) |
| Lectura directa de `requests` | 401, 42501 |

El postcheck original de M16 usaba `app_private.client_owns_request`. M16 revoca EXECUTE sobre esa función a todos los roles,
y el rol de solo lectura de la CLI recibió 42501: eso confirma que la revocación es efectiva.
La versión equivalente, con la regla de propiedad escrita inline (`m16-postcheck-readonly.sql`), pasó con todos los valores esperados.
CORS: `client-login` y `admin-users` responden 204 al origen oficial y 403 a un origen ajeno. Las Edge Functions no se modificaron (v3/v4).

## Reglas vigentes

- **Quipu**: identidad individual por RUC y username exacto (sensible a mayúsculas). Solo ve sus tickets.
  El nombre del ticket es el nombre verificado o, si no lo hay, el username. El `requester_name` que envíe el navegador se descarta (M16b).
- **QuipuFac**: identidad empresarial por RUC. Las sesiones del mismo RUC ven todos sus tickets.
  Cada ticket conserva el nombre declarado, que es obligatorio y no concede permisos. Otro RUC y Quipu no acceden.
- **Prioridad solicitada**: Bajo/Medio/Alto/Urgente → `low/medium/high/urgent`, con default `medium`.
  Es independiente de `urgent_requested` y de `projects.priority`. La bandeja y el modal la muestran separada de la prioridad definitiva.
- **Subproyectos**: `catalog_systems` = producto, `catalog_subsystems` = subproyecto, `projects` = tablero.
  `client_subprojects` devuelve los subproyectos activos de un producto autorizado, y la creación revalida pertenencia y actividad.
  Por compatibilidad (M16b), un payload sin la clave `subsystem_id` se acepta con NULL y el subproyecto se exige al aprobar.

## Vercel

| Elemento | Resultado |
|---|---|
| Dominio | https://ticketera-procont.vercel.app |
| Build de `718ab04` | Completado; dominio con **Versión 202611231058**. |
| Build de `2f9ab74` (release) | Completado 16:05:08 UTC; dominio con **Versión 202611231105**, bundle `index-CkoVW0ZI.js` (453.010 bytes). |
| Production Branch | **main** (inferido, panel no consultado). El bot de Vercel etiquetó la rama de integración como *Preview*, con URL propia; el dominio solo cambió con los builds de main. No hay CLI de Vercel. |
| Variables | Sin cambios. `VITE_CLIENT_LOGIN_ENABLED` activo: selectores Quipu/QuipuFac habilitados en el navegador. |

Los commits posteriores de solo documentación disparan un build nuevo, con el mismo código y otra cadena de versión.

## Límites de validación

Comprobado en producción: historial, estructura, permisos, huella de funciones, rechazo HTTP sin sesión, CORS
y navegación pública sin enviar credenciales (0 errores JS, 0 POST).

Comprobado en local con PostgreSQL 17 real (mismo SQL desplegado): limpia 21/21, upgrade 26/26 y matriz de compatibilidad
entre frontend antiguo y nuevo. Con servicios simulados: UI 36/36 y 31/31, Node 173/173.

**NO VERIFICADO en producción** hasta disponer de pruebas autorizadas:
- login real de clientes Quipu y QuipuFac
- creación real de solicitudes
- Mis tickets con sesión activa
- detalle
- adjuntos reales
- logout
- bandeja interna y RequestValidationModal con sesión de personal

Las API de Quipu y QuipuFac siguen siendo **API de desarrollo** autorizadas para el piloto; no son API oficiales de producción del proveedor.
