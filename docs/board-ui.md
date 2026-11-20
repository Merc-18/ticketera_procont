# Tablero operativo: integración del frontend (M12)

> **Revisión documental 20/11/2026 · base `c857a727c8e7640bbce8daada940f973acbf013e` · clasificación: ACTUAL.**
> Fuente oficial: [PRODUCT_REQUIREMENTS](specs/PRODUCT_REQUIREMENTS.md); estado operativo: [PROJECT_STATUS](PROJECT_STATUS.md).
> Frontend integrado en main c857a72. El estado global es 15/15, no 12/12; todas las mutaciones operativas usan M12. Requests y panel interno tienen reglas de rol distintas de cuentas cliente.

## Alcance del documento anterior

El contenido siguiente conserva sus fechas y evidencias originales. Los estados de activación o contratos sustituidos no se consideran vigentes; prevalecen las especificaciones enlazadas arriba.

Fuente de integración: `integration/board-operations-recovery`, descendiente de `main@94bd8fd`
y del backend de Codex `1ba71b2`. Conserva el trabajo de Claude en `17c8c19` y sus
correcciones en `6a4bce5`.
**M12 (`20261118000800_board_operations.sql`) está aplicada en ticketera-procont,
historial 12/12**, con las once entradas anteriores y los datos de negocio intactos.
Permisos y comprobación de lectura verificados en `53f14a6`:
[evidencia remota](validation/board-m12-rpc-smoke-diagnosis.json).
La fusión local en main está autorizada y permite fast-forward; no requiere otra aplicación remota.

El frontend no implementa otro motor: reutiliza el adaptador de Codex
[`contracts/board-operations-client.mjs`](../contracts/board-operations-client.mjs) a través de
[`src/lib/board.ts`](../src/lib/board.ts), que conserva la causa real del error del servidor y la traduce.

## Funciones del servidor conectadas

| RPC | Uso en pantalla |
|---|---|
| `get_board_ticket` | Snapshot del detalle (estado general, fases, progresos, pendientes y huella); arrastre a Done |
| `operate_board_ticket` | `move_phase` (Kanban y selector de fase), `reopen`, `assign` (detalle y asignación rápida), `set_priority`, `block`, `unblock`, `archive`, `restore` (detalle y Papelera) |
| `operate_board_tickets` | Barra de acciones masivas: prioridad y archivado (1–100 tickets, una transacción) |
| `reserve_board_evidence` | Pestaña Evidencias: reserva por archivo con la sesión del editor y subida a la ruta asignada |
| `create_internal_project` / `approve_request` | Solo Development, `assigned_dev` obligatorio, `assigned_admin` nulo, sin SLA |

Cada acción del usuario usa su propia UUID de idempotencia (`actionKey()`).

## Caminos antiguos retirados

- `useProjects`: sin `UPDATE` directo de `current_phase/progress/assigned_to/status/priority/is_blocked`;
  solo queda la edición descriptiva (título, descripción, fechas), permitida por M12.
- Sin `PHASE_PROGRESS` ni cálculo de SLA/Lead Time en el navegador al completar.
- `useChecklist`: CRUD bajo RLS sin `saveProgress`; tras cada cambio se recarga el snapshot.
- Sin inserciones en `activity_logs` (`logActivity`, `useActivityLog` y `ActivitySection` eliminados).
- Sin notificaciones del navegador para asignación o bloqueo (las emite el servidor). Se conserva
  la notificación de menciones en comentarios.
- Sin botón «Completar» ni «Eliminar»; sin cambio de tipo de proyecto ni purga (RPC cerradas en M12).
- Guardas en `tests/board-frontend.test.mjs` impiden reintroducir estas escrituras.

## Pantallas adaptadas

- **Kanban** (`KanbanBoard`, `BoardColumn`, `ProjectCard`): ocho columnas Backlog → Analysis → Design →
  Development → Code Review → Testing → Deploy → Done; se pueden saltar fases. Tickets bloqueados con
  borde y motivo en rojo, no arrastrables. Arrastrar a Done consulta el snapshot y, si hay tareas
  pendientes, pide confirmación explícita con la lista exacta. Asignación rápida vía RPC (en bloqueados
  solo admin/superadmin). Búsqueda, filtros (prioridad, área, estudio, responsable) y vistas se mantienen.
- **Histórico Admin.**: el tablero Administrative queda solo para proyectos anteriores, sin «Nuevo Proyecto».
- **Detalle** (`ProjectModal`): estado general del servidor, prioridad editable, banner de bloqueo,
  selector de fase, **progreso de fase** y **progreso del checklist** como dos barras separadas con los
  valores del servidor, responsable principal (reasignar/retirar), acciones Bloquear / Corregir motivo /
  Desbloquear / Reabrir ticket / Archivar / Restaurar. Pestañas Checklist, Comentarios, Evidencias e Historial.
- **Diálogos** (`BoardDialogs`): confirmación de Done con pendientes (casilla obligatoria; se envía la huella
  `pending_fingerprint`), bloqueo con motivo obligatorio, reapertura con motivo y fase de retorno
  (todas excepto la final).
- **Historial inmutable** (`RequestTimeline`): `request_events` del servidor con usuario y rol al actuar,
  hora de Perú, valores anterior/nuevo (responsable, prioridad, fase, checklist), motivos de bloqueo y
  reapertura, finalización con pendientes confirmados, operaciones masivas y evidencias. Los registros
  anteriores de `activity_logs` se muestran como «registro anterior». Sin controles de edición o borrado.
- **Tabla, lista y Gantt**: sin el `progress` heredado; muestran fase, posición (`5/8`) y conteo del checklist.
- **Nuevo proyecto** y **validación de solicitudes**: solo Development, responsable principal obligatorio.
- **Papelera**: restauración vía RPC (admin/superadmin), sin eliminación definitiva.
- **Carga de trabajo**: sin «Cumplimiento SLA», sin vencidos ni progreso promedio; cada ticket cuenta una
  vez por persona; distribución por fase y bloqueados; Cycle/Lead Time del equipo desde
  `metrics_time_averages` (cohorte común, 90 días).

## Validación anterior documentada por Claude

Estos resultados se conservan como evidencia previa. La recuperación ejecutó build, las
9 pruebas de integración afectadas y 6 nuevas; no repitió las suites PostgreSQL. El estado
de activación y las pruebas nuevas están en [board-recovery.md](board-recovery.md).

| Prueba | Resultado |
|---|---|
| `tests/board-frontend.test.mjs` (reglas de cierre/reapertura, contrato, errores, guardas estáticas) | 9/9 |
| `tests/consumers.test.mjs`, `board-operations-client`, `metrics-adapter` | 43/43 en total con la anterior |
| `supabase/tests/board_operations_local.py` (Codex, M1–M12) | 74/74 |
| `supabase/tests/board_frontend_local.py` (flujos y payloads exactos del frontend, M1–M12) | 26/26 — [evidencia](validation/board-frontend-local.json) |
| `npm run build` / `tsc --noEmit` | OK |
| Revisión visual con datos ficticios (escritorio 1440/1280 px y móvil 390 px) | Kanban, detalle bloqueado, historial, confirmación de Done, reapertura y carga de trabajo sin desbordes ni errores de consola |
| `db push --dry-run` | Solo `20261118000800_board_operations.sql` pendiente |

Las pruebas usan PostgreSQL 17 aislado con stubs de Auth/Storage y datos ficticios; no crean tickets
reales ni modifican REQ26-001.

## Recuperación tras interrupción de Claude

El trabajo sin commit se preservó en `17c8c19`, rama `integration/board-operations-recovery`
en una copia Git aislada. Se corrigieron reintentos de Done/evidencias, inferencia MIME y
concurrencia del diagnóstico, conservando los componentes y las RPC existentes.
Ver [estado, respaldo y comprobaciones actuales](board-recovery.md).

## Cierre de activación

M12 se aplicó una sola vez el 19/11/2026. La primera comprobación `rpc_smoke` se detuvo
en la confirmación de la CLI, antes de ejecutar SQL; se corrigió y se completó la
verificación pendiente en una transacción READ ONLY, sin modificar tickets.
El frontend de esta integración usa las RPC y es compatible con los permisos de M12.
El cierre de Git conserva todos los commits mediante fast-forward desde `main@94bd8fd`.
No se repiten las suites anteriores ni se ejecutan SQL remoto, push o despliegue como parte del cierre.
