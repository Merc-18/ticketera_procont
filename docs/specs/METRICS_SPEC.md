# Métricas, cohortes y exportaciones

Revisión: **20/11/2026** · Código de referencia: **`c857a727c8e7640bbce8daada940f973acbf013e`**.

Fuente oficial de requisitos: [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md).

## Reglas oficiales

Requisitos METRIC-001..007 del [maestro](PRODUCT_REQUIREMENTS.md#metric-001). Implementación autoritativa: `app_private.ticket_performance`, `metrics_time_averages` y funciones de urgencia de M11; los comandos y eventos M12 conservan la semántica.

| Campo | Fuente y cálculo |
|---|---|
| `first_started_at` | Primer evento `phase_changed` por `id` del proyecto actual cuyo `from=backlog` y `to` es distinto de Backlog. No exige que sea la fase inmediata siguiente. |
| `completed_at` | Último evento `status_changed` a `done`, solo si estado general actual es `done` y causa distinta de `baseline`. |
| `cycle_time_seconds` | `completed_at - first_started_at` si orden temporal válido, inicio >= creación y cierre >= inicio. |
| `lead_time_seconds` | `completed_at - requests.created_at` si cierre >= creación, aunque falte inicio; el resumen comparable puede excluirlo. |
| `metric_status` | `not_completed`, `missing_completion`, `invalid_timeline`, `missing_start` o `complete`. |

Días = segundos/86400. Calendario corrido, sin descontar noches, fines de semana, bloqueos ni retrocesos. No hay política de horas hábiles. `updated_at`, `sla_target_date` y `activity_logs.sla_completed` no reconstruyen el inicio/cierre oficial. Un histórico cerrado sin evento confiable conserva null. Una reapertura conserva el primer inicio, deja de estar terminado y se excluye hasta un cierre nuevo; no borra los cierres anteriores.

## Cohortes: no intercambiar RPC

- `get_ticket_performance(p_studio_id default null)` devuelve una fila por solicitud, incluyendo solicitudes sin proyecto, excluye proyectos deleted. Unidad segundos. El estudio filtra por UUID canónico.
- `get_ticket_performance_summary` informa total, terminados, muestras y promedios independientes de campos no nulos; **no** es la cohorte pareada de los paneles.
- `metrics_time_averages(p_period_days default null,p_studio_id default null)` usa **los mismos tickets `metric_status=complete`** para ambos promedios: `cohort=paired_complete`, muestras iguales, `excluded_count` e `completed_count`. Filtro de periodo por `completed_at >= current_timestamp - intervalo`, no por fecha de creación. La carga de trabajo pide 90 días; Dashboard usa su periodo elegido. Un cierre histórico sin timestamp no entra a un periodo finito.
- Mostrar «sin datos suficientes»/«pendiente de integración»/error según el adaptador; no usar esos textos como una medición de cero.

## Urgencia declarada

`get_requester_urgency_month(date,uuid)`, `metrics_monthly_urgency(text)` y `metrics_requester_urgency(uuid,text)` solo admin/superadmin activos. Mes calendario y límites timestamptz de **America/Lima**, solicitudes REQ pendientes/aprobadas/rechazadas. Identidad estadística = `(studio_id, nombre normalizado)`; la normalización NFKC colapsa espacios Unicode/ASCII y pasa a minúsculas, conserva tildes y no hace fuzzy matching. No es la identidad de autenticación.

Campos: total, urgentes y porcentaje; sin atribución se cuentan aparte. El porcentaje de un grupo sin solicitudes es null; la vista de un solicitante puede mostrar contadores cero y porcentaje null. La prioridad definitiva no altera `urgent_requested` ni sus estadísticas. No fusionar estudios con nombre o RUC compartido.

## Exportación de terminados

Código: [ticket-export.ts](../../src/lib/ticket-export.ts), integrado en [DashboardView.tsx](../../src/components/dashboard/DashboardView.tsx).

1. Invocar `get_ticket_performance` con `{p_studio_id:null}` y `{count:'exact'}`.
2. Encadenar `eq('general_status','done')`, `order('request_id',{ascending:true})`, `range(filasRecibidas,filasRecibidas+999)`. Filtro y orden se aplican en PostgREST **antes** del límite de 1000 filas.
3. Continuar por el número realmente recibido, incluso si el servidor recorta a menos de lo solicitado, hasta alcanzar el total exacto. Total cero implica mensaje y ninguna descarga.
4. Detener ante error, falta de array/count, cambio del total, página vacía prematura, duplicado, fila no done o exceso del total. No producir CSV parcial.
5. Consultar `projects` por UUID únicos en lotes de **100**, con campos descriptivos y `requests(requester_area)`. Un error de lote detiene exportación. Un proyecto ausente deja datos descriptivos vacíos; no se inventan.
6. Orden final del archivo: `completed_at` descendente y desempate `request_id`. Fechas visibles en Lima; tiempos en días con un decimal. Null queda vacío y se explica por «Estado de la métrica».

Columnas exactas: Número, Proyecto, Área, Prioridad, Tipo, Inicio de trabajo, Finalización, Cycle Time (d), Lead Time (d), Estado de la métrica. La exportación de activos conserva una fecha límite ordinaria `due_date`, sin columna SLA oficial.

**Limitación aceptada:** varias consultas no forman una fotografía transaccional única. Se detectan algunas mutaciones por total/duplicados, pero un cambio de pertenencia que conserve el total puede pasar inadvertido. Ejecutar sobre datos estables cuando la integridad del archivo sea crítica; no prometer snapshot ni cambiar SQL para simularlo. Las pruebas de más de 2500 terminados usan HTTP/servicios simulados y no demuestran una exportación alojada bajo concurrencia real.

## SLA y vencimientos

No existe política SLA oficial. Campos/eventos heredados se preservan como historia. El hook de alertas automáticas `useSlaWarnings` fue retirado; las RPC de creación/aprobación M12 rechazan parámetros SLA no nulos. `due_date` sigue siendo fecha límite ordinaria y puede alimentar vistas de vencimiento. Roadmap usa solo `due_date`; proyectos con solo SLA histórico quedan en «Sin fecha de vencimiento». La permanencia de columnas históricas no activa reglas SLA nuevas ni autoriza editarlas como política.

## Evidencia y pendientes

M11: 38 grupos en integración; cohorte: 5 comprobaciones específicas históricas. Exportación: 11 unitarias y 5 UI en revisión independiente, más escenario de 3201 terminados/33 lotes en integración. Véanse [TESTING_SPEC.md](TESTING_SPEC.md) y [evidencia integrada](../validation/integration-security-client-flow.json). No se ejecutaron nuevas suites de aplicación en esta tarea documental.
