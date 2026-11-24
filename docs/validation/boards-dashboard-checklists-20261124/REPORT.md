# Boards, Dashboard, checklist y proyectos de largo alcance — informe

| Dato | Valor |
|---|---|
| Fecha | 24/11/2026 |
| Base | `main` = `485e449154a17413a4a3f6a97649a1d97243dc51` (verificado con `git ls-remote`: única rama remota `main`) |
| Copia | Worktree `.agent-workspaces/boards-dashboard-checklists-20261124`, rama **local** `local/boards-dashboard-checklists-20261124` sin upstream |
| Skills | `design-taste-frontend` 2.5.1 y `emil-design-eng` (copias de auditoría del proyecto). El gate Taste sigue en OPEN 14, sin reiniciar |
| Publicación | **No**: sin push, merge ni despliegue |
| Lecturas remotas | Solo lectura con la CLI de Supabase (`db query --remote --read-only`): cuántos perfiles internos hay y qué colores tienen asignados, conteos de checklist por fase y plantillas. Sin nombres ni correos y sin escrituras |

## 1. Resultado por ajuste

| # | Ajuste | Estado | Detalle |
|---|---|---|---|
| 1 | Colores personales: máximo 10 | **Hecho en el frontend**; backend **propuesto, no aplicado** | [BOARD_COLOR_PALETTE.md](BOARD_COLOR_PALETTE.md) |
| 2 | Quitar Área de la barra de Boards y compactar | **Hecho** | Abajo y [RESPONSIVE_REPORT.md](RESPONSIVE_REPORT.md) |
| 3 | Dashboard: Tickets por estudio | **Hecho** | [DASHBOARD_TICKETS_BY_STUDY.md](DASHBOARD_TICKETS_BY_STUDY.md) |
| 4 | Checklist predeterminado por fase | **Hecho** con el modelo actual (sin backend) | [CHECKLIST_TEMPLATES_BY_PHASE.md](CHECKLIST_TEMPLATES_BY_PHASE.md) |
| 5 | Proyectos de largo alcance | **Propuesta técnica**; requiere autorización | [LONG_TERM_PROJECT_MODEL.md](LONG_TERM_PROJECT_MODEL.md) |

### Barra de Boards

- El filtro «Área (código PROCONT)» desaparece de la barra. También se eliminaron su estado, la lógica de filtrado y el valor guardado `kanban_areaFilter`: un filtro antiguo guardado habría seguido ocultando tarjetas sin control visible.
- Se corrigió un defecto previo: Prioridad, Estudio y Responsable solo aparecían si el catálogo devolvía el código PROCONT. Ahora dependen solo de «Activos».
- Distribución: la fila 1 tiene el estado a la izquierda y las vistas con «Nuevo proyecto» a la derecha, alineados; la fila 2 tiene Prioridad, Estudio y Responsable a la izquierda y «Mi color de tarjeta» a la derecha, bajo una línea separadora. «Limpiar filtros» y el conteo aparecen junto a los filtros cuando hay alguno activo.
- Altura: 158 → 155 px a 1440 y 524 → 424 px a 390. Controles de 44 px y etiquetas visibles. En móvil todo ocupa el ancho disponible, sin desbordarse.
- Las áreas siguen en los formularios de clasificación, en la tarjeta y la Tabla (solo para el código PROCONT), en la búsqueda y en el filtro de área del Dashboard (D-047 sin cambios).

## 2. Archivos

| Archivo | Cambio |
|---|---|
| `src/lib/card-palette.ts` (nuevo), `src/lib/card-colors.ts` | Catálogo de 24 ids, paleta ofrecida de 10, `availableColors`, validación local |
| `src/components/boards/OwnerColorPicker.tsx` | 10 opciones; aviso de color retirado y de capacidad agotada |
| `src/components/boards/KanbanBoard.tsx` | Sin filtro de área; barra en dos filas; filtros que ya no dependen del código PROCONT |
| `src/lib/tickets-by-studio.ts` (nuevo), `src/hooks/useDashboardData.ts`, `src/components/dashboard/DashboardView.tsx` | Conteo paginado y verificado; panel «Tickets por estudio»; bloque de áreas retirado |
| `src/lib/checklist-defaults.ts`, `src/lib/checklist-templates.ts` (nuevo) | Plantillas de Analysis y Code Review; duplicados, siembra al llegar a la fase |
| `src/hooks/useChecklist.ts`, `src/components/projects/ChecklistSection.tsx` | `addMany`, `editItem`; tareas sugeridas; edición en línea; nombres accesibles |
| `src/hooks/useProjects.ts`, `src/components/projects/ProjectModal.tsx` | Siembra después de un cambio de fase confirmado (Kanban y «Mover a fase») |
| `src/index.css` | Estilos de la barra, del bloque por estudio, del checklist sugerido y de los avisos de color |
| `tests/boards-dashboard-checklists.test.mjs` (nuevo) | 13 pruebas unitarias |
| `tests/ui/boards-dashboard-checklists.ui.test.mjs`, `boards-dashboard-fixtures.mjs`, `capture-boards-dashboard.mjs` (nuevos) | 12 pruebas de interfaz, datos ficticios y capturas |
| `tests/ui/dashboard-boards.ui.test.mjs` | La prueba del filtro de área pasa a comprobar que ya no existe; la del bloque de áreas pasa a comprobar «Tickets por estudio» |
| `docs/specs/DECISION_LOG.md` | Se añaden D-049 a D-054 sin modificar las filas anteriores |
| `proposed-migration/20261124000100_internal_card_palette_10.sql` | **Propuesta no aplicada**, guardada fuera de `supabase/migrations` |

**Backend intacto**: `git diff 485e449 -- supabase contracts scripts vercel.json package.json package-lock.json` está vacío. No hay dependencias nuevas.

## 3. Pruebas

| Suite | Resultado | Registro |
|---|---|---|
| Unitarias `tests/*.test.mjs` (13 nuevas) | **197/197** | [data/unit-tests.txt](data/unit-tests.txt) |
| Nueva `boards-dashboard-checklists.ui` | **12/12**, en 4 ejecuciones seguidas | [data/boards-dashboard-checklists-ui-final.txt](data/boards-dashboard-checklists-ui-final.txt), `…-run1..3.txt` |
| `dashboard-boards.ui` (ajustada) | **9/9** | [data/ui-suites.txt](data/ui-suites.txt) |
| `kanban-attachments.ui` | **17/17** | ídem |
| `theme.ui` | **8/8** | ídem |
| `ux-four-areas.ui` | **31/31**; 6 omitidas por diseño (`BUILD_DIR`) | ídem |
| `tsc --noEmit` y `vite build` | OK | CSS 99,30 kB (18,61 kB gzip; base 95,52/18,00); JS principal sin cambios |

En `data/ui-suites.txt` la primera ejecución de la suite nueva muestra 2 fallos. No eran defectos del producto: la prueba leía el radio antes de que llegaran los colores compartidos, y otra prueba comparaba los filtros antes de que cargara el catálogo de estudios. Se añadió la espera en las pruebas y desde entonces la suite pasa entera en cada ejecución. No se repitieron `portal-navigation` ni `portal-tracking`, que no están afectadas.

Defectos del producto detectados en la validación y ya corregidos: (1) a 320–479 px las etiquetas de estado se montaban unas sobre otras; (2) la barra era 9 px más alta que la original y se ajustó el espaciado.

## 4. Evidencias

`screenshots/`: 62 capturas. Hay 24 **antes**, tomadas de una copia limpia de `485e449`; 24 **después** con el mismo script; y 14 **estado**, tomadas de la suite de interfaz (paleta de 10, barra, bloque por estudio y checklist sugerido, agregado y tras un cambio de fase). Ver `screenshots-manifest.json` y `SHA256SUMS`.

## 5. Pendientes

1. **Migración de la paleta (autorización):** sin ella, el próximo perfil interno que se active recibirá `azul-claro` (retirado) por autoasignación, y un perfil número 25 haría fallar su activación. El selector ya lo informa, pero no puede evitarlo.
2. **Plantillas de Analysis y Code Review en el servidor (opcional, autorización):** 8 filas en `checklist_templates`.
3. **Jerarquía de proyectos (autorización):** fase 1 de la propuesta.
4. **Limitación previa:** los KPI de «Solicitudes» del Dashboard leen `requests` sin paginar y serían parciales pasadas 1.000 solicitudes. El bloque nuevo sí pagina; corregir los KPI queda propuesto como un ajuste aparte.
5. Revisión visual por parte del usuario y autorización para publicar.
