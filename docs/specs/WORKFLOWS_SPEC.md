# Flujos funcionales y operación interna

Revisión: **20/11/2026** · Código de referencia: **`c857a727c8e7640bbce8daada940f973acbf013e`**.

Fuente oficial de requisitos: [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md).

## Recepción y clasificación

El cliente autenticado envía la solicitud con datos de origen; recibe REQ y capacidad de adjuntos. No escoge estudio ni responsable. `request_type_id` y `system_id` deben estar activos al crear. La solicitud queda pending y estado general received; todavía no existe tarjeta de proyecto Kanban.

Requests lista hasta 200 registros recientes con `useRequests`; pendientes son `requests.status=pending`. Al abrir para validar, admin/superadmin invoca `start_request_review`; clasificación se guarda mediante `classify_request`. Para solicitudes con estudio: código interno del mismo estudio obligatorio al decidir; subproyecto al aprobar si sistema lo exige y tiene subproyectos activos; área principal al aprobar si el estudio tiene áreas activas; subárea opcional debe pertenecer al área. Otros estudios no reciben un área inventada.

Información original de clientes se conserva mediante trigger: estudio/sistema ya fijados no cambian; tipo/título/descripción/urgencia originales no se sustituyen. La clasificación solo es editable mientras pending. Solicitudes históricas sin clasificación no se fuerzan a un catálogo inventado, pero la UI sigue exigiendo responsable para aceptar y motivo para rechazar.

| Decisión | Campos / efecto | Autorización |
|---|---|---|
| Aprobar | Responsable principal, prioridad, Development; se crea proyecto y flujo Backlog, mismo REQ y eventos. No SLA. | admin/superadmin activo |
| Rechazar | Motivo destinado al cliente, notas internas opcionales; sin proyecto; `public_rejection_reason` separado. | admin/superadmin activo |
| Crear interno | Título, descripción, responsable, prioridad opcional; serie INT y Development. | superadmin/admin/developer activo |
| Importar Planner | XLSX → previsualización/validación → RPC heredada interna; conservar UUID de intento por fila lógica. | UI admin/superadmin; RPC M15 admite editores activos |

## Operaciones del tablero

Todas las mutaciones de fase, asignación, prioridad, estado y bloqueo usan `operate_board_ticket`. Checklist sigue CRUD con RLS y triggers; comentarios conservan API separada. No escribir directamente `current_phase`, `assigned_to`, `progress`, `status` o `is_blocked` para saltar comandos.

| Acción | Payload estricto | Regla y efecto |
|---|---|---|
| `move_phase` | `to_phase`, `flow_id?`, `confirm_pending?`, `pending_fingerprint?` | Fase válida, trabajo activo y no bloqueado; saltos/retrocesos permitidos. Done comprueba pendientes. |
| `reopen` | `to_phase`, `reason`, `flow_id?` | Estado general done, no bloqueado, destino no final y motivo 1..5000 no vacío normalizado. Registra cierre anterior. |
| `assign` | `assignee_id: UUID o null`, `flow_id?` | Editor activo destino; null retira. En bloqueado, solo admin/superadmin. |
| `set_priority` | `priority` | `low`, `medium`, `high`, `urgent`; no altera urgencia del cliente. |
| `block` | `reason` | Activo no terminado, motivo requerido; corregir motivo existente produce evento específico. |
| `unblock` | objeto vacío | Limpia bandera/motivo operativo; evento conserva motivo y fechas previas. |
| `archive` | objeto vacío | Archiva sin borrar fases/historia. |
| `restore` | objeto vacío | Solo archived/deleted; deleted histórico requiere admin/superadmin; fases finales vuelven completed, no se reabren. |

Si hay varios flujos históricos, `flow_id` debe identificar uno de ese proyecto. Si solo hay uno puede omitirse. El snapshot tiene estado general, estado de proyecto, flujos, porcentajes, lista pendiente y huella; refrescarlo después de una acción y después de editar checklist. Un replay devuelve el resultado original, no necesariamente el último estado si otra persona cambió algo después.

### Done y concurrencia

Mostrar pendientes exactos del snapshot y una confirmación explícita; enviar `confirm_pending=true` y huella recibida solo tras aceptar. La huella es control de concurrencia, no credencial. El servidor bloquea proyecto/checklist para evitar que un cambio concurrente pase inadvertido y registra ids/flujo/fase/descripción de las tareas confirmadas. Históricos con varios flujos solo completan cuando todos están en fase final. No hay botón «Complete» independiente de esta operación.

### Bloqueo y responsabilidades

Bloquear conserva fase y responsable. Impide fase, cierre y reapertura, pero permite checklist, comentarios y evidencias. Developers pueden reasignar trabajo no bloqueado; en bloqueado requieren administrador. Asignaciones y bloqueos generan notificaciones internas en la misma transacción; no se prometen correos externos. Menciones de comentarios siguen un camino frontend distinto, visible en `CommentsSection` y `notifications.ts`.

### Progreso

`phase_progress_percent = round(100 * phase_index / (phase_count-1), 2)`; `phase_index` base cero. Checklist = `round(100 * completed / total,2)` o null sin tareas. Son dos medidas, no esfuerzo, cumplimiento SLA ni una conversión de `project_flows.progress` heredado.

### Bulk, archivado e historia

`operate_board_tickets` admite prioridad/archivado, entre 1 y 100 UUID únicos. Bloquea ids en orden, opera una transacción e informa snapshots; un error revierte todo. `command_id` y bandera bulk permiten agrupar eventos, sin borrar los individuales. Este límite es por llamada, no cuota de usuarios ni mensual.

`request_events` es historial autoritativo. `activity_logs` previos se muestran como registro anterior. Los triggers impiden UPDATE/DELETE/TRUNCATE a roles normales y las FK protegen actores/historial. La purga y el cambio de tipo que eliminaría flujos están cerrados. Un administrador SQL que puede cambiar esquema no es un rol de aplicación.

## Flujos históricos y diagnóstico

No convertir Administrative/Dual ni crear otros nuevos. `workflow_version=null` conserva históricos; versión 2 identifica nuevos. Un histórico con fases incoherentes no se arregla por migración automática; reapertura explícita permite volver a una fase no final con motivo.

Ante 23514 revisar estado, bloqueo, pendientes/huella, clasificación o cupo según operación; ante 42501 revisar rol activo y permisos; no compensar reabriendo permisos. Ante respuesta incierta conservar UUID y consultar recibo/estado antes de reenviar. [API](API_CONTRACTS.md), [permisos](PERMISSIONS_SPEC.md) y [operación](DEPLOYMENT_SPEC.md).

## Addendum M17 — áreas y color personal

Revisión local 23/11/2026; fuente de código M17, aún NO verificada como aplicada remotamente.

- En validación/clasificación, el servidor resuelve el código canónico de estudio. Solo igualdad exacta con `PROCONT` permite seleccionar área/subárea. El área activa debe pertenecer al estudio; subárea activa debe ser hija del área. Otros códigos descartan las áreas enviadas por formularios legacy. Al cambiar de PROCONT a otro código se limpian asociaciones nuevas; históricos no se migran.
- Las tarjetas de Kanban y filas de Tabla toman el color de la preferencia persistida del responsable interno. Selector: miembro elige color disponible; asignación automática al activar perfil; se libera al desactivar. Unicidad impuesta por PostgreSQL; el color no cambia prioridad ni estado.
- APIs internas: `internal_card_colors()` lee catálogo y mapa de asignaciones; `set_my_internal_card_color(p_color_id)` cambia solo al actor autenticado. RLS/RPC requieren perfil interno activo.
