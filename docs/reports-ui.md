# Reportes y panel visual — interfaz (rama `claude/reports-ui`)

18/11/2026. Solo frontend; sin migraciones ni cambios de modelo. Las métricas se obtienen del
backend de Codex mediante un adaptador tipado; el frontend no las calcula.

## Cambios

- **Formulario público:** etiqueta «Nombre del solicitante *»; nombre vacío o solo espacios
  bloqueado (validación nativa `pattern` + comprobación al enviar, mensaje en línea). Título y
  descripción tampoco aceptan solo espacios. Se conservan estudio, «Solicito atención urgente»
  y adjuntos; el cliente no elige prioridad.
- **Validador:** resumen discreto «Historial de urgencias · mes» (solicitante, estudio, total,
  urgentes, % urgentes) para admin/superadmin. Prioridad inicial Urgente si el cliente la pidió;
  editable (Baja, Media, Alta, Urgente).
- **Dashboard:** retirados «Cumplimiento SLA» y los gráficos «a tiempo / fuera de SLA» (sin plazos
  Procont configurados). Se conservan Cycle Time y Lead Time; «Sin datos suficientes» si no hay
  trabajos terminados. «Vencidos» se mantiene (fecha de entrega real, no SLA). Nueva sección
  «Solicitudes urgentes por solicitante y estudio» con selector de mes (6 meses), solo
  admin/superadmin, tabla en escritorio y tarjetas en móvil.

## Dependencia con Codex (pendiente)

`src/lib/metrics-adapter.ts` define el contrato esperado (provisional) y es el único punto a
ajustar al recibir el definitivo:

| RPC provisional | Argumentos | Respuesta |
|---|---|---|
| `metrics_requester_urgency` | `p_request_id uuid, p_month 'YYYY-MM'` | `UrgencyRow` |
| `metrics_monthly_urgency` | `p_month 'YYYY-MM'` | `UrgencyRow[]` |
| `metrics_time_averages` | `p_period_days int\|null, p_studio_id uuid\|null` | `{completed_count, avg_cycle_time_days, avg_lead_time_days}` |

`UrgencyRow = {requester_name, studio_id, studio_name, month, total_requests, urgent_requests, urgent_pct}`
(mes en America/Lima; `urgent_pct` 0–100 calculado por el servidor, `null` si no hay solicitudes).
Mientras la RPC no exista (PGRST202/42883) la interfaz muestra «Pendiente de integración con
las métricas del servidor»; respuestas incoherentes se descartan. Hasta entonces, Cycle/Lead Time
usan los valores que el panel ya mostraba (registro de trabajos completados), sin cálculos nuevos.

## Verificación

`tests/metrics-adapter.test.mjs` (5). Build correcto. Revisión visual en escritorio y 390 px:
dashboard y validador con arnés local de datos ficticios (fuera del repositorio); formulario
público contra Supabase sin enviar (nombre con espacios → inválido, mensaje visible).
