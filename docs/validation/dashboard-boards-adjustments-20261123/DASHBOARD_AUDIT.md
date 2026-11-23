# Auditoría del Dashboard (estado publicado `3ec6659`)

Fuente: `src/components/dashboard/DashboardView.tsx`, `src/hooks/useDashboardData.ts` y `src/components/metrics/UrgencyStatsPanel.tsx` en `main` publicada.

## Qué había y de dónde salía

| Bloque | Fuente de datos | Problema detectado |
|---|---|---|
| Filtro de periodo (30d / 90d / Todo) | Solo `metrics_time_averages` | **Engañoso:** el periodo no afectaba a ninguna cifra salvo Cycle/Lead Time. Los KPIs y los gráficos eran siempre «todo el tiempo» |
| Filtro «Global / Development / Administrative» | `projects.project_type` | Usa la clasificación por tipo que el usuario declaró obsoleta |
| Filtro «Área» | `requests.requester_area` (texto heredado) | Mezclaba áreas de **todos** los estudios y no usaba el área de catálogo (`area_id`) |
| KPIs Total / Activos / Completados / Archivados / Bloqueados / Vencidos | `projects` | «Total» suma activos, completados y archivados (dato poco útil para operar). **No había ninguna métrica de solicitudes** (recibidas, en revisión, aprobadas), que es la entrada del negocio |
| Cycle / Lead Time | RPC `metrics_time_averages` (M11) | Correcto; se conserva |
| «Por Prioridad» | `projects.priority` de **todos** los estados | Mezclaba trabajo terminado y archivado con el que está en curso |
| **«Por Tipo»** (Development / Administrative / Dual) | `projects.project_type` | **Obsoleto** según el modelo operativo actual |
| «Por Área» | `requests.requester_area` de todos los estudios | Atribuía áreas a estudios que no las usan (la regla es: solo PROCONT) |
| «Solicitudes urgentes por solicitante y estudio» | RPC `metrics_monthly_urgency` (`urgent_requested`, M11) | Bloque a ancho completo, tabla grande y jerarquía de título excesiva. Además se basaba solo en la **casilla anterior**, no en la prioridad que ahora elige el cliente (`requested_priority`) |
| «Estado de proyectos» (Activos / Completados / Archivados con %) | `projects` | **Duplicaba** tres KPIs de la fila superior |
| Carga del equipo | — (solo en Equipo) | Faltaba en el Dashboard, aunque es una pregunta operativa diaria |

## Conclusiones

1. El Dashboard medía solo proyectos y no mostraba la entrada del negocio (solicitudes y su revisión).
2. Había un bloque duplicado (Estado de proyectos), uno obsoleto (Por Tipo), uno sobredimensionado (urgencias) y uno mal atribuido (Por Área).
3. El filtro de periodo prometía más de lo que hacía.
4. La urgencia dependía del campo histórico. Desde M16 el cliente elige `requested_priority`, y la casilla se retira del formulario (D-044).

## Datos disponibles sin backend nuevo (verificado)

| Pregunta | Dato | Lectura permitida hoy |
|---|---|---|
| Solicitudes recibidas, aprobadas, rechazadas | `requests.status`, `created_at` | Sí, la bandeja ya lo lee |
| En revisión | Pendiente con evento `review_started` o `classified` en `request_events` (la misma regla que `track_request_status`) | Sí, la línea de tiempo ya lo lee |
| Trabajo en ejecución, bloqueado, vencido, completado | `projects.status`, `is_blocked`, `due_date` | Sí |
| Carga del equipo | `project_flows.assigned_to` embebido en `projects` (la misma fuente que el Kanban) | Sí |
| Áreas de PROCONT | `requests.area_id` + catálogo `areas` + código canónico `PROCONT` | Sí |
| Urgencias nuevas | `requests.requested_priority = 'urgent'` | Sí |
| Urgencias históricas | RPC `metrics_monthly_urgency` (casilla) | Sí, sin cambios |
| Cycle / Lead | RPC `metrics_time_averages` | Sí, sin cambios |

**Descartado por no poder calcularse con datos actuales:**

- **Cumplimiento de SLA:** los plazos no están configurados.
- **Tiempo en revisión por solicitud:** necesitaría una métrica de servidor nueva.
- **Productividad por persona:** no hay un registro fiable de horas.
