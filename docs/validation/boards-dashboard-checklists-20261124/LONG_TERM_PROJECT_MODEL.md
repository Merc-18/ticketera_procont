# Proyectos de largo alcance — caso «Beneficiarios finales» (agrupación «Gestión»)

**Estado: propuesta técnica. No se creó ninguna migración ni se cambió el backend.** Hace falta autorización para ampliar el modelo.

## 1. Lo que permite hoy el esquema (inspección de `supabase/migrations`, M1–M17)

| Necesidad | ¿Existe? | Evidencia en el esquema |
|---|---|---|
| Agrupación / portafolio («Gestión») | **No** | No hay tabla de portafolio. `areas` (con `parent_id`) es la clasificación de solicitudes del código PROCONT y **no debe usarse** para esto. `catalog_systems`/`catalog_subsystems` son productos del cliente (Quipu, Quipu_Gestion…), no agrupaciones de trabajo |
| Proyecto principal con hijos | **No** | `projects` no tiene `parent_id`. Cada proyecto exige su propia solicitud (`request_id NOT NULL UNIQUE`, número `REQ`/`INT`). `project_type` solo admite `development`/`administrative`/`dual` y no expresa jerarquía |
| Frentes de trabajo | **No** | No existe ninguna entidad. Las fases (`backlog…done`) son etapas del flujo, no frentes |
| Tareas con responsable, prioridad, fase y fechas | **Parcial** | Cada `project` (tarjeta) tiene `priority`, `start_date`, `due_date` y un flujo con `assigned_to` y `current_phase`. Sirve para una tarea, pero sin relación con un proyecto padre |
| Colaboradores además del responsable | **No** | Un único `project_flows.assigned_to` por flujo. El «dual» histórico permite dos responsables (uno por flujo), pero no es un equipo |
| Dependencias entre tareas | **No** | No existe una tabla de dependencias. El Gantt dibuja fechas, no relaciones |
| Hitos | **No** | El Roadmap agrupa por trimestre según las fechas del proyecto; no hay entidad «hito» |
| Checklist (pasos pequeños) | **Sí** | `checklist_items` por flujo y fase, con auditoría (`checklist_added/updated/deleted`) |
| Comentarios, evidencias, historial | **Sí** | `comments`, adjuntos de la solicitud, `activity_logs`/`request_events` inmutables |
| Equipo del proyecto principal | **No** | No hay `project_members` |

**Conclusión:** con el modelo actual, «Beneficiarios finales» solo puede ser **una tarjeta** (`create_internal_project`, número `INT`) con su descripción, un responsable, fechas, comentarios, evidencias y checklist por fase. **No se puede** representar Gestión → proyecto → frentes → tareas → checklist sin datos o relaciones nuevos. Crear varias tarjetas con un prefijo en el título (por ejemplo «[BF] …») daría tarjetas independientes sin una relación real. La instrucción lo descarta, y además ensuciaría métricas y vencimientos.

### Uso recomendado mientras no se amplíe el modelo

1. Una sola tarjeta interna «Beneficiarios finales» con objetivo y alcance en la descripción, responsable general, fecha inicial y fecha objetivo.
2. Checklist solo para pasos cortos de la fase actual (el checklist sugerido de esta entrega ayuda).
3. Frentes, responsables por frente y riesgos se anotan en comentarios fechados (quedan en el historial). Es un registro, no un seguimiento.
4. No se recomienda crear tarjetas hijas sin relación. Si el equipo necesita trabajar ya en paralelo, conviene autorizar la fase 1 de la propuesta.

## 2. Propuesta de jerarquía

```
Portafolio (Gestión)                       portfolios
  └─ Iniciativa (Beneficiarios finales)    initiatives          ← objetivo, responsable general, equipo, fechas, estado
       ├─ Equipo                           initiative_members   ← user_id, rol (líder / miembro)
       ├─ Hitos                            initiative_milestones← título, fecha objetivo, estado
       └─ Frentes de trabajo               workstreams          ← análisis, desarrollo, integración… (no son fases)
            └─ Tareas = tarjetas existentes  projects (+ initiative_id, workstream_id)
                 ├─ Responsable              project_flows.assigned_to (sin cambios)
                 ├─ Colaboradores            project_collaborators
                 ├─ Dependencias             project_dependencies (finish→start)
                 └─ Checklist                checklist_items (sin cambios)
```

Por qué las tareas siguen siendo `projects`: así heredan sin trabajo extra el Kanban, la Tabla, el Gantt, el Roadmap, la auditoría, los bloqueos, las métricas Cycle/Lead y el color del responsable. Una tarea interna ya se crea con `create_internal_project` (número `INT`), sin solicitud de cliente.

### Tablas nuevas (todas con RLS: lectura para el personal interno; escritura solo por RPC con `require_role`)

| Tabla | Campos clave | Reglas |
|---|---|---|
| `portfolios` | `id`, `name` UNIQUE, `description`, `is_active` | Catálogo administrado por admin/superadmin. «Gestión» es la primera fila. **Distinto de `areas`** |
| `initiatives` | `id`, `portfolio_id`, `code` (`INI26-001`), `title`, `objective`, `owner_id`, `start_date`, `target_date`, `status` (`planned`/`active`/`on_hold`/`completed`/`cancelled`) | Estado global manual + progreso calculado de sus tareas |
| `initiative_members` | `initiative_id`, `user_id`, `role` (`lead`/`member`) | PK compuesta; solo usuarios internos activos |
| `initiative_milestones` | `id`, `initiative_id`, `title`, `due_date`, `status`, `order_index` | Roadmap |
| `workstreams` | `id`, `initiative_id`, `name`, `order_index`, `lead_id` | UNIQUE (`initiative_id`, `name`) |
| `projects` (+2 columnas nulas) | `initiative_id`, `workstream_id` | El frente debe pertenecer a la iniciativa (trigger). Nulas para todo lo existente: **ningún histórico cambia** |
| `project_collaborators` | `project_id`, `user_id`, `added_at` | El responsable principal sigue siendo `assigned_to` |
| `project_dependencies` | `project_id`, `depends_on_id`, `kind` (`finish_to_start`) | Sin ciclos (comprobación recursiva en el RPC); misma iniciativa |

### RPC nuevas (mismo patrón M12: idempotencia `p_idempotency_key`, auditoría en `request_events`/`activity_logs`)

`create_initiative`, `update_initiative`, `set_initiative_members`, `upsert_workstream`, `upsert_milestone`, `link_project_to_initiative(p_project_id, p_initiative_id, p_workstream_id)`, `set_project_collaborators`, `add_project_dependency` / `remove_project_dependency`, y `get_initiative_summary(p_initiative_id)`, que devuelve el progreso (tareas terminadas / total y progreso medio del checklist), los bloqueos, los vencidos, los próximos vencimientos y la carga por persona.

### Vistas de frontend (después de la migración)

| Vista | Contenido | Reutiliza |
|---|---|---|
| Resumen de la iniciativa | Progreso, estado, líder y equipo, hitos, bloqueos y próximos vencimientos | Tarjetas KPI del Dashboard |
| Kanban | Filtro «Iniciativa» y agrupación opcional por frente; las fases son las 8 actuales | `KanbanBoard` |
| Gantt | Tareas por frente, flechas de dependencia y rombos de hito | `GanttView` (+ dependencias) |
| Roadmap | Hitos y entregas por trimestre | `RoadmapView` |
| Dashboard | Progreso, carga del equipo, pendientes y vencidas de la iniciativa | `useDashboardData` (+ filtro) |

### Implicaciones y riesgos

- **Métricas**: agrupar por iniciativa es una agregación adicional; no cambia cómo se calculan las métricas actuales.
- **Seguridad**: los clientes no ven iniciativas (RLS solo para el personal interno). El portal del cliente no cambia.
- **Migración aditiva**: solo tablas nuevas y dos columnas nulas; no reescribe filas. Hay que ensayarla en PostgreSQL local con las pruebas de M12/M17 antes de aplicarla en remoto.
- **Esfuerzo estimado**: fase 1 (portafolio, iniciativa, equipo, frentes y vínculo de tareas, más el filtro en Kanban y el resumen) y fase 2 (colaboradores, dependencias, hitos, Gantt y Roadmap). Cada fase lleva migración, RPC, pruebas PostgreSQL locales, interfaz y evidencias.
- **Fuera de alcance**: no se proponen subtareas anidadas (tarea dentro de tarea). El checklist cubre los pasos pequeños.

## 3. Decisión pedida al usuario

Autorizar (a) la **fase 1** de la jerarquía o (b) mantener el uso de una tarjeta única. Hasta entonces, la entrega no modifica el backend.
