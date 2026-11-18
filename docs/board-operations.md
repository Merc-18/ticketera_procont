# Reglas operativas del tablero — M12 preparada, no aplicada

Base `main@94bd8fd`, con once migraciones aplicadas según el estado confirmado.
Rama `codex/board-operations`, en copia Git aislada dentro de
`.supabase-local/workspaces/board-operations/` por la restricción de escritura de `.git`
del repositorio principal. No cambia main, sus componentes ni el archivo sin seguimiento `1`.

Migración: [`20261118000800_board_operations.sql`](../supabase/migrations/20261118000800_board_operations.sql).
Evidencia: [74 comprobaciones locales](validation/board-operations-local.json).

## Reglas implementadas

- Nuevos proyectos: solo Development, fases `backlog → analysis → design → dev →
  code_review → testing → deploy → done`, con responsable principal explícito al crear.
  La prioridad sigue siendo low/medium/high/urgent, con medium predeterminada.
- `workflow_version=2` identifica proyectos nuevos. Los existentes quedan en NULL:
  no hay UPDATE ni backfill de proyectos, solicitudes, flujos, tareas o eventos.
- Administrative/Dual históricos siguen legibles y operables por sus flujos anteriores.
  Se prohíben cambios de tipo y borrados de flujos que eliminen sus checklists.
  No se inventan plantillas nuevas para Analysis o Code Review; se conservan las existentes.
- Se permiten saltos y retrocesos. Cualquier salida de Backlog produce Trabajo en proceso,
  salvo que prevalezca bloqueo/finalización conforme al estado general existente.
- Finalización nueva: únicamente al entrar en Done; sincroniza `projects.status=completed`,
  estado general y eventos. En históricos con varios flujos, cierra cuando todos son finales.
  Ya no existe una escritura de aplicación que marque completed independientemente de la fase.
- El checklist pendiente exige confirmación explícita de su lista exacta; queda auditada con
  ids, flujo, fase y descripción. Una huella obsoleta se rechaza. Checklist y cierre comparten
  lock del proyecto para serializar cambios concurrentes.
- Reapertura: superadmin/admin/developer, motivo no vacío de hasta 5000 caracteres y destino
  no final. Registra actor, reloj del servidor, fases y referencia al cierre anterior.
  Reabre incluso históricos completados con fases incongruentes, sin corregirlos automáticamente.
- Progreso de fase: posición ordinal / (número de fases − 1), en porcentaje con dos decimales.
  Es una posición visual uniforme, no un peso de esfuerzo ni SLA. Se devuelve también índice y total.
- Progreso checklist: tareas completas / total, dos decimales; sin tareas, null.
  Ambos se calculan por separado en servidor. `project_flows.progress` queda como dato histórico
  de solo lectura: ni arrastrar ni marcar tareas lo sobrescribe.
- Responsable: uno por el único flujo de un proyecto nuevo. Reasignación a cualquier editor
  activo por los tres roles editores; retiro explícito con null, auditado, sin inventar sustituto.
  Se registra anterior/nuevo responsable y actor. En un histórico Dual se debe indicar el flujo.
- Bloqueo: motivo obligatorio en servidor; conserva fase/responsable/progreso y prohíbe mover
  fase, finalizar o reabrir hasta desbloquear. Permite comentarios, evidencias y checklist.
  Solo superadmin/admin pueden reasignar mientras esté bloqueado. Desbloquear restaura el
  estado derivado de la fase y conserva el motivo anterior en la auditoría.
- Asignación/reasignación y bloqueo generan sus notificaciones en la misma transacción.
  No se añaden notificaciones por cada fase ni una nueva política SLA.
- Bulk: prioridad y archivado, 1–100 ids únicos por llamada; transacción única, sin cambios
  parciales, con identificador común y auditoría individual. Es un límite técnico por llamada,
  no un límite de carga ni cuota mensual.

## Contratos para Claude

Adaptador sin privilegios: [`board-operations-client.mjs`](../contracts/board-operations-client.mjs)
y [tipos TypeScript](../contracts/board-operations-client.d.mts). Usar cliente Supabase con
sesión normal; no service key. Conservar una UUID por acción para reintentos idempotentes,
incluidos dos reintentos simultáneos. El resultado cacheado de un reintento corresponde a
la ejecución original; recargar el snapshot si hubo otras acciones posteriores.

| RPC | Argumentos | Resultado |
|---|---|---|
| `get_board_ticket` | `p_project_id uuid` | `BoardTicket`; lectura por los cuatro perfiles activos |
| `operate_board_ticket` | `p_project_id uuid, p_action text, p_payload jsonb, p_idempotency_key uuid` | Snapshot posterior; tres roles editores activos |
| `operate_board_tickets` | `p_project_ids uuid[], p_action text, p_payload jsonb, p_idempotency_key uuid` | Array de snapshots; solo set_priority/archive |
| `reserve_board_evidence` | `p_project_id uuid, p_upload_key uuid, p_file_name text, p_size_bytes bigint, p_mime_type text` | Reserva privada para el actor autenticado |

`BoardTicket`: project_id/request_id/request_number, workflow_version, project_status,
general_status, priority, is_blocked/blocked_reason, flows[], pending_items[], pending_fingerprint.
`flows[]`: id, flow_type, phase, assignee_id, phase_index, phase_count,
phase_progress_percent, checklist_total, checklist_completed, checklist_progress_percent.
Los nombres/tipos completos están en el archivo `.d.mts`; no sustituir null por un cero ficticio.

| `p_action` | Payload estricto |
|---|---|
| `move_phase` | `{to_phase, flow_id?}`; para cerrar con pendientes añadir `{confirm_pending:true, pending_fingerprint}` |
| `reopen` | `{to_phase, reason, flow_id?}`; motivo obligatorio, destino distinto de Done/Deployed |
| `assign` | `{assignee_id:uuid|null, flow_id?}`; null significa retiro explícito |
| `set_priority` | `{priority:'low'|'medium'|'high'|'urgent'}` |
| `block` | `{reason}`; permite corregir el motivo existente con evento adicional |
| `unblock` | `{}` |
| `archive` | `{}` |
| `restore` | `{}`; restaurar un eliminado histórico exige admin/superadmin; fases finales siguen completed |

`flow_id` es opcional solo si hay un único flujo. Un UUID ajeno al ticket se rechaza.
Para cerrar: cargar snapshot, mostrar pending_items y solicitar confirmación al usuario;
solo después mandar confirm_pending=true y la huella recibida. No confirmar automáticamente.
La huella es control de concurrencia, no un token de autorización.
El cambio fallido deja fases, estado, eventos e idempotencia sin cambios.

`approve_request` y `create_internal_project` conservan sus nombres y recibos, pero exigen
`assigned_dev` como principal. project_type omitido equivale a development; otro valor se rechaza.
`assigned_admin` solo se admite por compatibilidad si es null o coincide con assigned_dev;
no crea otro flujo. Parámetros SLA no nulos se rechazan. No se generan fechas de entrega.
El adaptador ofrece createInternal/approve con ese contrato.

`requests.status` conserva pending/approved/rejected. Después de aprobar, no se intenta
escribir done en esa columna: utilizar general_status del snapshot o seguimiento actual.

### Checklist, historial y evidencias

El CRUD de `checklist_items` sigue bajo RLS para editores, con auditoría automática.
No escribir progress ni completed_at. Después de cada CRUD, recargar get_board_ticket;
no mantener el antiguo saveProgress del navegador. Reordenar sigue siendo CRUD de order_index.
Los comentarios conservan su API; no enviar el log de auditoría desde el cliente.

La subida de evidencias internas usa el bucket privado existente y sus mismos límites:
4 archivos / 2.500.000 bytes combinados por ticket, incluidas reservas públicas e internas.
Funciona para tickets aprobados y bloqueados sin pedir el token del cliente. La reserva
vence 30 minutos después de emitirse, ligada al UUID del editor activo que la solicita;
ni anon, viewer ni otro editor pueden usar su ruta. No se renuevan automáticamente cupos.

Reservar después de preparar/comprimir imágenes; documentos sin alterar. Subir con
storage.from(grant.bucket).upload(grant.path,file,{upsert:false,contentType:grant.mime_type}),
reutilizando el adaptador uploadReservedTicketAttachment cuando corresponda. Tamaño/MIME
reales se verifican en la escritura final de Storage; el dueño interno se obtiene de la
reserva aunque esa escritura final la haga el servicio. Se evita duplicar el evento de subida
si Storage inserta y actualiza metadatos en una transacción.
La subida pública anterior conserva token privado, estado pending y ventana original
30 minutos desde creación; no obtiene privilegios de la nueva operación interna.

La fuente autoritativa es `public.request_events`, solo SELECT para perfiles de aplicación.
Eventos nuevos: assigned/reassigned/unassigned, priority_changed, checklist_added/updated/deleted,
completed, reopened, archived/restored, bulk_updated, block_reason_changed,
evidence_reserved/uploaded. Continúan phase_changed, status_changed, blocked/unblocked.
Los eventos incluyen actor_id, created_at servidor y snapshots/detalles; las acciones de
comando incluyen command_id y bulk, además de nombre/rol del actor al actuar.
No depende de que el navegador envíe activity_logs o notificaciones después de guardar.

UPDATE, DELETE y TRUNCATE de request_events/activity_logs/security_events se rechazan;
los nuevos registros los insertan funciones/triggers del servidor. Las FK de auditoría
impiden anular actores y borrar historial por cascada. No hay RPC de edición de auditoría.
El superadmin de aplicación tampoco puede purgar; purge_project queda cerrado y los
proyectos/flujos no se eliminan físicamente mediante operaciones normales.
Una cuenta con historial se desactiva; no puede borrarse destruyendo sus referencias.
Un administrador SQL con capacidad de cambiar triggers/esquema queda fuera del límite
normal de los perfiles de aplicación; no se pretende impedirle administrar el motor.

## Compatibilidad, límites y activación pendiente

El frontend actual NO es compatible con las escrituras antiguas de current_phase/progress,
assigned_to, prioridad, status y bloqueo, cuyos permisos directos se revocan. Claude debe
usar las RPC, retirar el botón de cierre independiente, añadir confirmación/reapertura,
y dejar de insertar activity_logs o duplicar notificaciones que ahora emite el servidor.
También debe usar el nuevo snapshot para porcentajes separados y las ocho columnas.
No se ha modificado ningún componente ni hook frontend en esta rama.

Cycle/Lead reutilizan M11: primera salida real de Backlog, cierre más reciente, tiempo
continuo con bloqueos y regresiones incluidos. Reapertura excluye del promedio hasta el
nuevo cierre; se conserva el primer inicio y todas las finalizaciones anteriores.
Los históricos sin evidencia fiable mantienen null; no se inventa ni repara su cronología.
Archivar no introduce un estado público nuevo: se mantiene la semántica anterior. Restore
no reabre fases finales; para reabrir se requiere la acción explícita y su motivo.

Ninguna decisión adicional bloquea las reglas solicitadas. No se definen nuevos pesos de
esfuerzo, SLA, calendarios, cuotas de usuarios ni plantillas oficiales de tareas.

Antes de aplicar: revisar/integrar coordinadamente el frontend bajo autorización separada,
capturar baseline privado de funciones, ACL y FK reemplazadas, y autorizar M12 expresamente.
La migración es transaccional, sin DML de conversión. Un fallo antes de COMMIT revierte el DDL.
Después de usar fases/eventos nuevos, NO restaurar ciegamente M11 ni eliminar auditoría:
la recuperación debe conservar esos datos mediante una corrección posterior revisada.
Las pruebas Auth/Storage son simulaciones PostgreSQL; Storage alojado y UI real requieren
validación posterior autorizada, sin tickets reales creados por estas pruebas.

```bash
python3 supabase/tests/board_operations_local.py --pg-bin /ruta/postgresql/17/bin --runtime-lib /ruta/runtime/lib
node --test tests/board-operations-client.test.mjs
```

74 comprobaciones nuevas PostgreSQL 17.12, 6 del adaptador y validación TypeScript del
contrato nuevo. No se ejecutaron las suites anteriores. Servidores aislados detenidos.

## Disponibilidad del commit aislado

Además de la copia Git, se exporta `.supabase-local/exports/board-operations.bundle` en el
proyecto original. Para traer la rama desde Ubuntu normal cuando `.git` permita escritura,
sin merge, push ni SQL remoto:

```bash
git -C /home/procont/projects/ticketera-procont fetch /home/procont/projects/ticketera-procont/.supabase-local/exports/board-operations.bundle refs/heads/codex/board-operations:refs/heads/codex/board-operations-ready
```
