# Trazabilidad y seguimiento de tickets — activo

Migración [`20261118000600_request_tracking.sql`](../supabase/migrations/20261118000600_request_tracking.sql),
aplicada con Supabase CLI (historial 10/10). Evidencia: [local](validation/request-tracking-local.json) ·
[remota](validation/request-tracking-remote.json).

## Estados generales (calculados y registrados en el servidor)

| Estado | Cuándo |
|---|---|
| Solicitud recibida (`received`) | Al crear el ticket |
| En revisión (`in_review`) | El validador abre la solicitud (`start_request_review`) o la clasifica; revisión y clasificación son una sola etapa |
| Aprobada — En backlog (`approved_backlog`) | Al aceptar: el trabajo se crea con sus flujos en Backlog |
| Trabajo en proceso (`in_progress`) | Cualquier flujo sale de Backlog hacia **cualquier** fase activa |
| Terminado (`done`) | Todos los flujos en su fase final (Done / Deployed) o proyecto completado |
| Bloqueado (`blocked`) | `projects.is_blocked` (mecanismo existente) en Backlog o en proceso; no cambia la fase técnica. Al desbloquear vuelve a En backlog o En proceso según la fase actual |
| Rechazada (`rejected`) | Decisión de rechazo; no entra a Backlog |

Las fases detalladas del tablero se conservan. Disparadores sobre `requests`, `request_events`,
`project_flows` y `projects` registran en `request_events` (auditoría existente): `status_changed`
(de/a), `review_started`, `phase_changed` (incluidos retrocesos) y `blocked`/`unblocked` con motivo,
responsable (`actor_id`) y fechas. El historial persiste aunque el ticket termine. Las solicitudes
existentes recibieron un evento inicial (`cause: baseline`) sin modificar el ticket (REQ26-001 →
`received`).

## Cliente (`/tracking`)

Solo número REQ (p. ej. REQ26-001) → `track_request_status`: devuelve únicamente número y estado
general. Sin token, nombre, descripción, adjuntos, motivos, responsables, códigos, UUID, prioridad
ni SLA. Respuesta mínima (`null`) para números inexistentes o mal formados; límite de frecuencia
por cliente (10/min por IP, hash md5) y global (300/min). El token privado se conserva solo como
credencial técnica de la reserva de adjuntos y ya no se muestra al cliente.

## Validador

El modal de la solicitud muestra la línea de tiempo interna (`RequestTimeline`): estados, eventos,
clasificación, decisiones, fases y bloqueos con fecha/hora de Lima y usuario, más el historial del
proyecto (`activity_logs`). Identificador estable: UUID interno de la solicitud.

## Verificación visual (18/11/2026)

Seguimiento público contra Supabase (solo consulta de REQ26-001 → «Solicitud recibida», sin
token ni datos internos) en escritorio y móvil (390 px). Vistas internas (tablero, bandeja,
validación y línea de tiempo con bloqueo/desbloqueo, terminado y rechazado) con un arnés local
de datos ficticios, fuera del repositorio. Correcciones móviles: pestañas de la bandeja con
desplazamiento horizontal propio y buscador del tablero a ancho completo; sin desbordamiento
de página a 390 px.

## Reglas y métricas nuevas — pendientes de integración/aplicación

Ver [contrato de métricas](business-metrics.md), migración `20261118000700`: nombre
público obligatorio, prioridades existentes sin cambio, tiempos derivados de eventos
del servidor y urgencias por nombre normalizado/estudio en America/Lima. No altera
solicitudes existentes ni el seguimiento público. No aplicada en remoto.

## Reglas operativas nuevas — M12 pendiente

Ver [contrato del tablero](board-operations.md), migración `20261118000800`: estados
sincronizados por Done, reapertura controlada, progresos separados y auditoría inmutable.
Reutiliza los eventos y métricas existentes; no convierte registros históricos ni
aplica cambios remotos. Requiere adaptar el frontend antes de autorizar su activación.
