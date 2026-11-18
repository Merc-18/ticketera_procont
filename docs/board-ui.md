# Tablero operativo: integración del frontend (M12)

Rama `integration/board-operations`, construida sobre `main@94bd8fd` más el backend de Codex
(`codex/board-operations@1ba71b2`, recuperado de `.supabase-local/workspaces/board-operations`).
**M12 (`20261118000800_board_operations.sql`) no está aplicada**. Claude reportó un dry-run
sobre `ticketera-procont` (`xsxdpaiivklqeudgqoqf`) con M12 como única pendiente.
Las once migraciones aplicadas no se modificaron. El dry-run mencionado arriba es el
reporte previo de Claude: el intento actual se detuvo en autenticación y no se considera
verificación remota vigente. Ver [recuperación y cierre](board-recovery.md).

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
actual del dry-run y las pruebas nuevas están en [board-recovery.md](board-recovery.md).

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

## Pendiente para activar

1. Autorización para aplicar M12 en `xsxdpaiivklqeudgqoqf` (captura previa privada, `db push`, verificación).
2. Fusión de `integration/board-operations` en `main` después de aplicar M12: el frontend de esta rama
   requiere M12 (las RPC nuevas) y el `main` actual no funciona con M12 aplicada (sus escrituras directas quedan revocadas).
   Ambos pasos deben hacerse juntos.
