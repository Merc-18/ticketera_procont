# Reestructuración del Dashboard (D-045)

## Nueva organización (de lo urgente a lo analítico)

| # | Sección | Contenido | Por qué |
|---|---|---|---|
| — | Barra | Periodo, **Estudio** y **Área** (solo con el estudio PROCONT), Activos CSV, Completados CSV, Actualizar | Se retira el filtro por tipo (obsoleto). El área de catálogo solo aparece donde aplica |
| 1 | **Solicitudes** | KPIs compactos: Recibidas (neutro), En revisión (dorado = atención), Aprobadas (azul), Rechazadas (neutro) | La entrada del negocio, antes ausente |
| 2 | **Trabajo** | En ejecución (azul), Completados (verde), Bloqueados (rojo **solo si > 0**), Vencidos (rojo **solo si > 0**), Archivados (neutro) | Situación actual del trabajo aprobado |
| 3 | **Tiempos** | Cycle y Lead Time del servidor (dorado), con su muestra | Se conserva el contrato M11; nota honesta si no hay datos |
| 4 | **Prioridad del trabajo en ejecución** | Barras Urgente / Alto / Medio / Bajo (colores de D-042) | Solo lo que está en curso, sin mezclar terminados |
| 4 | **Carga del equipo** | Tickets en ejecución por responsable (hasta 6) y cuántos no tienen responsable | Pregunta operativa diaria |
| 5 | **Urgencias solicitadas** (admin y superadmin) | Compacto: hasta 5 solicitantes con su estudio y número de urgentes del mes; selector de mes; **histórico aparte** | Ver la sección siguiente |
| 5 | **Áreas** | Solo el estudio PROCONT. Con todos los estudios: «Áreas · solo estudio PROCONT». Con otro estudio: «No aplica» | Ver STUDIO_AREA_RULES.md |

**Retirado:**

- **«Por Tipo»:** era obsoleto. Se eliminó también su cálculo (`byType`) del hook. `project_type` sigue en el backend, en el CSV de activos y en los tableros, que son procesos válidos.
- **«Estado de proyectos»:** duplicaba los KPIs.
- **«Total»:** sumaba estados distintos.
- **Filtro por tipo.**

**Periodo, ahora honesto:**

- Filtra las solicitudes aprobadas y rechazadas (por fecha de recepción) y los tiempos.
- Las cifras de estado actual (bandeja y trabajo en ejecución) se rotulan como tales.

## Urgencias: dos fuentes que no se mezclan

1. **Prioridad «Urgente» elegida por el cliente** (`requests.requested_priority = 'urgent'`, desde M16): es la fuente de las solicitudes nuevas. Se agrupa por solicitante y estudio en el mes de Lima elegido.
2. **Histórico · casilla anterior** (`urgent_requested`, vía `metrics_monthly_urgency`): se muestra en una línea aparte, con sus estados de servidor (sin datos, no disponible, error). **No se suma** a lo anterior.

Las solicitudes del periodo de transición que tengan ambas marcas aparecen en cada fuente por su propio criterio. No se modificó ningún registro histórico.

## Dirección visual (Taste + Emil)

- **KPIs compactos en fila:** icono en tinte funcional, cifra en mono de 26 px y etiqueta de 16 px. Sin tarjetas gigantes; la fila completa ocupa unos 90 px.
- **Gráficos:** si no hay datos, no se dibujan barras vacías como si fueran información. Se muestra un texto que dice qué falta (Taste: «no fact twice», cada visual con contenido real).
- **Jerarquía:** h1 de la vista, h2 de 18 px por sección, nota de 16 px que explica qué mide cada bloque.
- **Movimiento:** ninguna animación nueva (Emil: «a professional dashboard should be crisp and fast»).

## Límites

- Las lecturas de `projects` y `requests` heredan el límite de filas de PostgREST (el mismo que el Dashboard anterior). Con volúmenes por encima de ese límite haría falta una RPC agregada, que necesita autorización de backend.
- El panel de urgencias del **modal de validación** («Historial de urgencias», `metrics_requester_urgency`) sigue basado en la casilla histórica, porque cambiarlo requiere una RPC nueva. Queda documentado.
