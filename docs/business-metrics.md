# Reglas y métricas de tickets

> **Revisión documental 20/11/2026 · base `c857a727c8e7640bbce8daada940f973acbf013e` · clasificación: ACTUAL.**
> Fuente oficial: [PRODUCT_REQUIREMENTS](specs/PRODUCT_REQUIREMENTS.md); estado operativo: [PROJECT_STATUS](PROJECT_STATUS.md).
> M11 aplicada. Cycle/Lead provienen de eventos del servidor; cohorte paired_complete y nulls preservados. Exportación completados paginada en servidor, proyectos por lotes de 100; sin snapshot transaccional único. No hay política SLA oficial.

## Alcance del documento anterior

El contenido siguiente conserva sus fechas y evidencias originales. Los estados de activación o contratos sustituidos no se consideran vigentes; prevalecen las especificaciones enlazadas arriba.

Título original conservado como contexto: **Reglas y métricas de tickets — backend preparado, pendiente de aplicar**.

Base `main@f526283`. Rama `codex/business-metrics` en copia Git aislada
`.supabase-local/workspaces/business-metrics/` (el worktree de Orca está fuera de
las rutas editables de esta sesión). No se integró en main ni se ejecutó SQL remoto.

Migración nueva: [`20261118000700_business_metrics.sql`](../supabase/migrations/20261118000700_business_metrics.sql).
Las diez anteriores no cambian. El remoto permanece en 10/10 según el estado confirmado.

## Nombre y prioridades

`submit_client_request` exige `requester_name` string, presente y no vacío tras
normalización. Un trigger BEFORE INSERT protege además toda nueva solicitud REQ,
incluidas las rutinas anteriores. No se validan retroactivamente ni actualizan registros.
El RPC actual y `operations.submitClientRequest` conservan el nombre recibido para
visualización. El seguimiento público no recibe ese campo ni estadísticas nuevas.

Se mantienen Baja=`low`, Media=`medium` (default PostgreSQL), Alta=`high` y
Urgente=`urgent`. `urgent_requested` es independiente de la prioridad definitiva:
el validador puede aceptar una solicitud urgente como Alta, por ejemplo.
No hay catálogo de prioridades ni cuotas de urgencias.

## Semántica de rendimiento

- Una fila por solicitud/proyecto, incluyendo REQ e INT; se excluyen proyectos borrados.
- Primera salida: primer `request_events.phase_changed` del proyecto desde `backlog`
  a otra fase. Se conserva aunque vuelva a Backlog, cambie el otro flujo o se reabra.
- Finalización: estado general `done` según M10 (todos los flujos finales o proyecto
  marcado `completed`), con el último evento de estado correspondiente. Un baseline
  histórico `done` no demuestra cuándo terminó el trabajo y no se usa como fecha de cierre.
- Cycle Time = cierre − primera salida. Lead Time = cierre − `requests.created_at`.
- Tiempo continuo, en **segundos numéricos**, sin redondear a días, sin restar bloqueos,
  sin horarios laborales y sin fechas máximas generadas.
- Al reabrir, los tiempos dejan de participar en los promedios; al volver a terminar
  se usa el nuevo cierre y el inicio original. Nunca se suman las duraciones de flujos.
- Sin evidencia, el valor es `null`. No se infiere desde `updated_at`, SLA o el reloj del
  navegador; no hay backfill. Un intervalo inconsistente tampoco se convierte en cero.
- Las fases hermanas se serializan con un lock del proyecto antes de cambiar. Los eventos
  nuevos de fase y estado usan `clock_timestamp()`, después de esperar ese lock.
  El cambio, sus eventos y cualquier error participan en la misma transacción.

No se eliminan campos SLA, registros ni RPC heredados. Las nuevas métricas no los leen.
La creación interna mediante `operations` deja de copiar `due_date` hacia `sla_target_date`;
una fecha ordinaria ingresada explícitamente sigue permitida. Las funciones históricas
con parámetros SLA permanecen por compatibilidad; no se declara una política SLA oficial.

## Contrato para Claude

Adaptador JS y tipos: [`ticket-metrics-client.mjs`](../contracts/ticket-metrics-client.mjs)
y [`ticket-metrics-client.d.mts`](../contracts/ticket-metrics-client.d.mts).
Usar el cliente Supabase con sesión ordinaria autenticada; ninguna clave privilegiada.

| RPC | Argumentos | Respuesta | Acceso |
|---|---|---|---|
| `get_ticket_performance` | `p_studio_id: uuid \| null` | Array de `TicketPerformance`; vacío válido | Los cuatro roles internos activos |
| `get_ticket_performance_summary` | `p_studio_id: uuid \| null` | `PerformanceSummary` | Los cuatro roles internos activos |
| `get_requester_urgency_month` | `p_month: date \| null`, `p_studio_id: uuid \| null` | `MonthlyUrgency` | Solo admin/superadmin activos |

### Compatibilidad directa con la interfaz actual de Claude

Se revisó `main@42b5af7` en solo lectura. Se conservan sus tres nombres y formas
provisionales: no es necesario modificar `metrics-adapter.ts` para las respuestas válidas.
Los cálculos se reutilizan desde las consultas anteriores, sin duplicar el historial.

| RPC de la interfaz | Argumentos | Respuesta |
|---|---|---|
| `metrics_time_averages` | `p_period_days: int \| null`, `p_studio_id: uuid \| null` | `{completed_count, avg_cycle_time_days, avg_lead_time_days, cycle_sample_size, lead_sample_size}` |
| `metrics_monthly_urgency` | `p_month: text \| null` (`YYYY-MM`) | Array de `UrgencyRow` |
| `metrics_requester_urgency` | `p_request_id: uuid`, `p_month: text \| null` (`YYYY-MM`) | Una `UrgencyRow` |

`UrgencyRow = {requester_name, studio_id, studio_name, month, total_requests,
urgent_requests, urgent_pct}`. Los nombres de estudio se resuelven del UUID canónico.
Estas dos RPC de urgencias admiten solo admin/superadmin activos; la de tiempos,
los cuatro roles internos activos. El mes inválido y período no positivo se rechazan.

El filtro de período utiliza la fecha de finalización en una ventana continua de
`p_period_days` días hasta ahora; null significa todo el historial. No utiliza la fecha
de creación para decidir a qué período pertenece un trabajo terminado. Las medias en días
son segundos / 86400, sin redondeo: null se conserva cuando faltan muestras.

El resumen de un solicitante conocido sin solicitudes en el mes devuelve conteos 0 y
porcentaje null (una cuenta real vacía). Si el ticket no existe, no es REQ, o falta su
identidad canónica, devuelve SQL null, sin inventar persona ni conteos. El adaptador actual
de Claude trata ese caso histórico como respuesta no disponible/error de formato; puede
presentarlo como ausencia de datos al integrar. El listado mensual omite esas identidades;
la consulta detallada conserva `unattributed_requests` para explicarlas.

Se ejecutaron los validadores reales de `42b5af7` contra respuestas de las RPC locales:
`isUrgencyRow` e `isTimeAverages` aceptan los tres contratos. No se repitió su suite.
No hay archivos en común con los diez modificados por ese commit: integración textual
sin conflictos en ese corte, pendiente de revisión y autorización de merge/aplicación.

### Consultas detalladas adicionales

Argumentos opcionales, default `null`. Para el mes se recomienda `YYYY-MM-01`; cualquier
fecha del mes se normaliza al primer día. `null` utiliza el mes actual en America/Lima.

`TicketPerformance` contiene `request_id`, `request_number`, `project_id`, `studio_id`,
`general_status`, `first_started_at`, `completed_at`, `cycle_time_seconds`,
`lead_time_seconds`, `metric_status`. Fechas ISO timestamptz o null.

| `metric_status` | Interpretación |
|---|---|
| `not_completed` | No participa en promedios; tiempos y cierre null |
| `missing_completion` | Terminado, pero sin fecha histórica de cierre fiable |
| `missing_start` | Cierre conocido, primera salida desconocida; puede tener Lead Time |
| `invalid_timeline` | Alguna fecha es inconsistente; el intervalo afectado queda null |
| `complete` | Ambos intervalos disponibles |

`PerformanceSummary` entrega `total_tickets`, `completed_tickets`,
`cycle_sample_size`, `lead_sample_size`, `avg_cycle_time_seconds`,
`avg_lead_time_seconds`, `incomplete_completed_tickets`, `unit: "seconds"`,
`calendar: "elapsed"`. Los promedios consideran únicamente tiempos disponibles de
terminados; cada métrica tiene denominador propio. Sin muestras: promedio null,
conteo 0. Presentar ausencia de datos, sin reemplazar null por 0 ni deducir SLA.
Para mostrar horas/días, dividir por 3600/86400 al presentar, sin alterar el valor fuente.

`MonthlyUrgency` contiene `month`, `timezone: "America/Lima"`, `total_requests`,
`urgent_requests`, `urgent_percentage`, `unattributed_requests`, `requesters`.
Cada solicitante entrega `studio_id`, `requester_key`, `requester_name` original
más reciente, `total_requests`, `urgent_requests`, `urgent_percentage`.

Identidad: UUID de `studios.id` + nombre normalizado (NFKC, minúsculas según colación
PostgreSQL, espacios colapsados/extremos eliminados; no se eliminan tildes).
El UUID de un código interno, RUC o nombre visible del estudio no sustituye ese UUID.
No es una identidad personal verificada: homónimos del mismo estudio se agrupan;
variantes ortográficas distintas no se fusionan automáticamente.

La ventana usa `requests.created_at` entre medianoche local inclusiva y la del siguiente
mes exclusiva; no `request_date`. Cuenta solo solicitudes REQ, todas las decisiones,
y exclusivamente la marca `urgent_requested`, nunca prioridad ni texto de observaciones.
Porcentaje = urgentes / total × 100, dos decimales; sin solicitudes, porcentaje null.
Los históricos sin estudio canónico/nombre normalizable cuentan en los totales y en
`unattributed_requests`, pero no se agrupan como si fueran una misma persona.
No hay nuevas restricciones sobre la cantidad mensual.

Las RPC validan permisos en servidor. El contrato de urgencias es exclusivamente
administrativo: no incorporarlo al formulario ni al seguimiento público.

## Integración y validación

La interfaz de Claude ya consulta las tres RPC compatibles. Tras la integración y
aplicación autorizadas dejará de mostrar la dependencia de contrato pendiente. Debe
conservar null como ausencia de datos; exportaciones/otros paneles que aún lean logs SLA
no quedan convertidos automáticamente por esta migración.
Esta rama no modifica componentes, hooks de reportes ni pantallas: el código anterior
que genera/lee `sla_started` y `sla_completed` permanece hasta su integración frontend.
El hook histórico de alertas SLA tampoco cambia en esta tarea.

Archivos compartidos a conciliar al integrar: `src/lib/operations.ts`, README y los
apéndices de `docs/request-intake.md` / `docs/request-tracking.md`. No se resolvieron
conflictos mediante merge ni se sobrescribieron archivos del árbol de Claude.

La M11 es transaccional, solo DDL de funciones/triggers: no escribe tickets, eventos,
usuarios, estudios ni el historial CLI manualmente. Antes de autorizar su aplicación,
integrar/revisar ambos trabajos y capturar el baseline privado de funciones reemplazadas
(`submit_client_request`, `sync_request_status`, `trg_flow_phase`) mediante el procedimiento
existente. Un fallo antes del COMMIT revierte el conjunto; no ejecutar compensaciones
ni reparaciones de historial automáticamente. Ninguna nueva migración está autorizada
por este documento.

Prueba nueva aislada: [business-metrics-local.json](validation/business-metrics-local.json).
PostgreSQL 17.12, Auth/Storage simulados y datos ficticios. Cubre 39 comprobaciones,
incluida concurrencia, preservación del histórico, meses de Lima, ausencia de datos y
rechazos de acceso. No repite las suites previas ni representa una prueba de Supabase remoto.

```bash
python3 supabase/tests/business_metrics_local.py --pg-bin /ruta/postgresql/17/bin --runtime-lib /ruta/runtime/lib
# Opcional: --frontend-adapter /ruta/main/src/lib/metrics-adapter.ts (verifica compatibilidad real)
node --test tests/ticket-metrics-client.test.mjs
```

El adaptador tiene 3 pruebas específicas. También se verifica TypeScript únicamente
sobre el contrato nuevo y `src/lib/operations.ts`, sin repetir build ni suites frontend.

## Disponibilidad de la rama local

El commit está en la copia Git aislada indicada al comienzo, con árbol limpio. Se
exporta además a `.supabase-local/exports/business-metrics.bundle` del proyecto original.
La rama homónima del worktree de Orca permanece en la base, pues su ruta no es editable
desde esta sesión; no confundirla con la rama de la copia que contiene la implementación.

Para traer el commit al repositorio original desde una terminal Ubuntu normal, sin
merge, push ni modificación remota (se crea una referencia local nueva):

```bash
git -C /home/procont/projects/ticketera-procont fetch /home/procont/projects/ticketera-procont/.supabase-local/exports/business-metrics.bundle refs/heads/codex/business-metrics:refs/heads/codex/business-metrics-ready
```

No ejecutar esta operación en una terminal que mantenga `.git` montado en solo lectura.
El bundle requiere la base `f526283`, que ya pertenece al repositorio original.

## Reglas operativas nuevas — M12 pendiente

Ver [contrato del tablero](board-operations.md), migración `20261118000800`: estados
sincronizados por Done, reapertura controlada, progresos separados y auditoría inmutable.
Reutiliza los eventos y métricas existentes; no convierte registros históricos ni
aplica cambios remotos. Requiere adaptar el frontend antes de autorizar su activación.
