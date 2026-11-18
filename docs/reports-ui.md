# Reportes y panel visual — interfaz integrada con métricas de Codex

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

## Integración con Codex (rama `integration/business-metrics`)

Contrato real: migración `20261118000700_business_metrics.sql` (Codex, `537d7cf`), **aplicada y
verificada** (historial 11/11; [evidencia](validation/business-metrics-remote.json)). `src/lib/metrics-adapter.ts` usa sus tres RPC (solo `authenticated` con perfil interno
activo; anon sin acceso):

| RPC | Uso en la interfaz |
|---|---|
| `metrics_time_averages(p_period_days, p_studio_id)` | Dashboard: Cycle Time (primera salida efectiva de Backlog → Terminado) y Lead Time (solicitud → Terminado), días transcurridos; «Sin datos suficientes» sin trabajos terminados |
| `metrics_monthly_urgency(p_month)` | Dashboard: urgencias por solicitante (nombre normalizado) y estudio, mes de Lima (admin/superadmin) |
| `metrics_requester_urgency(p_request_id, p_month)` | Validador: resumen del solicitante; `null` → «Sin datos suficientes» |

El dashboard ya no calcula tiempos desde `activity_logs`; el hook dejó de consultar los registros
SLA (los datos históricos no se tocan; «Equipo → Carga» conserva su vista). Sin RPC publicada la
interfaz muestra «Pendiente de integración».

## Verificación

`tests/metrics-adapter.test.mjs` (7) y `business_metrics_local.py` de Codex (39, incluida la validación del adaptador con respuestas reales en PostgreSQL aislado). Build correcto. Revisión visual en escritorio y 390 px:
dashboard y validador con arnés local de datos ficticios (fuera del repositorio); formulario
público contra Supabase sin enviar (nombre con espacios → inválido, mensaje visible).

## Cohorte comparable de Cycle/Lead Time

La revisión visual mostró Cycle 1,4d y Lead 10h: eran valores escritos a mano en el arnés simulado,
no del servidor. Al revisarlo apareció un problema real de presentación: los promedios usaban
poblaciones distintas (Lead incluía terminados sin inicio registrado), por lo que Lead podía quedar
por debajo de Cycle. Corregido en la migración 11 antes de aplicarla: ambos promedios se calculan
sobre la misma cohorte (`cohort: paired_complete`) y los excluidos se informan (`excluded_count`).
El panel indica el tamaño de la muestra. Prueba: `supabase/tests/metrics_cohort_local.py`
(espera en Backlog, flujos simultáneos, bloqueo, reapertura, cierre sin inicio, sin terminar).
