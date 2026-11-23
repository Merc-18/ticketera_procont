# Matriz de remediación — Corrección UX/UI (23/11/2026)

Base: auditoría [`ux-ui-audit-20261123`](../ux-ui-audit-20261123/REPORT.md) (veredicto NO APROBADO, 25 hallazgos).
Rama local `ux-ui-correction-20261123`, desde `5b411e5` (main `a1d9e9c`). Evidencia final: re-auditoría de
115 pantallas, versión `202611231424`, build local con servidor de datos ficticios
([`data/reaudit-results.json`](data/reaudit-results.json), [`screenshots-manifest.json`](screenshots-manifest.json)).

Estados: **CORREGIDO**, **CORREGIDO CON OBSERVACIÓN** (cumple con una incompatibilidad o decisión documentada),
**PARCIAL** (mejora medida, el criterio sigue sin cumplirse del todo) y **ABIERTO**.

## Hallazgos de la auditoría (H-01 … H-25)

| ID | Sev. | Hallazgo | Corrección | Archivos principales | Evidencia después | Estado |
|---|---|---|---|---|---|---|
| H-01 | ALTA | Gate Taste no en PASS ni ejecutado sobre el build actual | Se ejecutó el gate en un **build nuevo** (`--start --new`): 3 rondas, FAIL 18 → FAIL 19 → **OPEN 14** (rondas agotadas), 5 waivers justificados. También se ejecutó el checker `consistency.mjs` sobre `/cliente` y `/tracking` del build final. El log histórico OPEN 19 se conserva sin reiniciar | `.agent-artifacts/taste-gate/` | [round1–3](data/taste-gate/), [waivers.json](data/taste-gate/waivers.json), [checker-final-*](data/taste-gate/) | **PARCIAL**: el gate está OPEN, no PASS. Los FAIL restantes son reglas de landing incompatibles con la composición aprobada (ver TASTE_COMPLIANCE) |
| H-02 | ALTA | Violeta en el panel | Se quitaron `purple`/`indigo`/`violet`, avatares `#A855F7` y `info #8B5CF6`. `info` pasa a usar el azul de marca. Columnas de fase neutras | `tailwind.config.ts`, `constants.ts`, `KanbanBoard.tsx`, `BoardColumn.tsx`, `ProjectCard.tsx`, `DashboardView.tsx`, `request-status.ts` | La búsqueda en `src` no da resultados; `colours` de la re-auditoría no tiene tonos de 255° a 300° | **CORREGIDO** |
| H-03 | ALTA | «Aceptar y crear trabajo» a 3,15:1 | `ui-button-primary` (#F8FAFC sobre #1E3A8A, **9,9:1**); el rechazo final es `ui-button-danger-solid` (**6,18:1**) | `RequestValidationModal.tsx`, `index.css` | `lowContrastCount 0` | **CORREGIDO** |
| H-04 | ALTA | La paleta no era la oficial | Paleta medida en procontbusiness.com y en el logo: azules `#1E3A8A` `#01257B` `#001E64`, dorados `#EEBB31` `#F2CE52` `#FFCC2A` y neutros slate. Registrada como **D-037**; documentación de identidad actualizada | `src/theme/brand.ts`, `tailwind.config.ts`, `index.css`, `docs/frontend-identidad-procont.md`, `docs/specs/DECISION_LOG.md` | Capturas | **CORREGIDO** |
| H-05 | MEDIA | Borde de campo a 1,39:1 | `--field-line #64748B`: **4,55:1** sobre la superficie y 4,76:1 sobre blanco. Foco en el color de acción; `aria-invalid` en rojo | `index.css` | Cálculo (ACCESSIBILITY_REPORT) | **CORREGIDO** |
| H-06 | MEDIA | Emojis como iconos (264 en 35 archivos) | Un solo sistema `Icon` (trazos estilo Lucide). `ControlLabel` acepta `icon`. Estados, fases, filtros, toasts, notificaciones y administración convertidos | `Icon.tsx`, `ControlLabel.tsx` y unos 40 componentes | `renderedEmoji 0` en 115 pantallas | **CORREGIDO CON OBSERVACIÓN**: se conserva el marcador de datos `startsWith('🔴 URGENTE')`, que lee texto histórico guardado en BD y no se muestra como icono |
| H-07 | MEDIA | Dos botones rellenos en el dashboard | «Activos CSV» es el primario; «Completados CSV» y «Actualizar» son secundarios | `DashboardView.tsx` | `laptop-30-dashboard.png` | **CORREGIDO** |
| H-08 | MEDIA | Texto cortado («Developmer») | Etiquetas de HBarChart con `break-words`, sin `truncate` | `DashboardView.tsx` | Capturas del dashboard | **CORREGIDO** |
| H-09 | MEDIA | `MEDIUM/HIGH/LOW` en el Kanban | Prioridades en español en todas las vistas: `PRIORITY_LABEL` = Bajo/Medio/Alto/Urgente; «Prioridad definitiva: …» en tarjeta y modal | `constants.ts`, `ProjectCard.tsx`, `ProjectModal.tsx`, `GanttView.tsx`, `RoadmapView.tsx`, `ProjectListView.tsx`, `NewProjectModal.tsx`, `KanbanBoard.tsx`, `RequestValidationModal.tsx` | Capturas del Kanban y el modal | **CORREGIDO CON OBSERVACIÓN**: el CSV exportado mantiene «Alta/Media/Baja» (formato de datos con prueba, `tests/ticket-export.test.mjs`) |
| H-10 | MEDIA | Panel sin `h1` | `h1.view-title` en cada vista. Las secciones del dashboard, la urgencia y la carga de trabajo pasan de `h3` a `h2` | `App.tsx`, vistas internas, `DashboardView.tsx`, `UrgencyStatsPanel.tsx`, `WorkloadView.tsx` | `h1Count 115/115`, `headingSkips 0` | **CORREGIDO** |
| H-11 | MEDIA | Formulario sin errores por campo y con el botón deshabilitado | `noValidate`, `fieldErrors` y `aria-invalid` con mensaje `.field-error` (16 px) bajo cada campo; el foco va al primer error; línea de estado `role=status`. «Enviar» solo se deshabilita durante el envío | `PublicRequestForm.tsx`, `index.css` | Re-auditoría: 5 errores, 5 `aria-invalid`, foco en el primero; pruebas UX | **CORREGIDO** |
| H-12 | MEDIA | Contraste de insignias, avatares y vacíos; iniciales a 9 px | Tonos AA para insignias y avatares de marca con texto blanco; iniciales a 13 px. Etiqueta del Gantt oscura sobre la barra dorada (**9,96:1**, antes 1,78:1); glifo de orden de la tabla en `gray-600` (**6,94:1**) | `constants.ts`, `ProjectCard.tsx`, `RoadmapView.tsx`, `GanttView.tsx`, `TableView.tsx` | `lowContrastCount 0`, `under13px 0` | **CORREGIDO** |
| H-13 | BAJA | Hover sin transición antes del primer clic | `InteractionMode` arranca sin modo y pasa a «pointer» con `pointermove` | `InteractionMode.tsx` | `motion.hoverBeforeClick`: 0,15 s, −2 px | **CORREGIDO** |
| H-14 | MEDIA | «← Inicio» 49×20 y cierre del modal 20×36 | `.back-link` y el botón de cierre a ≥ 44 px; botones y selectores Enterprise a 44 px | `RequestTracking.tsx`, `index.css`, modales | `under44Samples`: solo falsos positivos (ACCESSIBILITY_REPORT) | **CORREGIDO** |
| H-15 | BAJA | Movimiento reducido que lo anulaba todo | Se quitan las transformaciones; opacidad y color se mantienen; el spinner pasa a ser un fundido | `index.css` | `reducedMotion`: `transform none`, propiedades de opacidad y color, 0,15 s | **CORREGIDO** |
| H-16 | BAJA | Presión de .985, sin paso de hover | Hover −1 px en el botón y −2 px en la tarjeta. Presión con `translateY(1px) scale(.98)` en 100 ms | `index.css` | `pressedTransform matrix(0.98,…,1)` | **CORREGIDO CON OBSERVACIÓN**: hay una incompatibilidad entre las skills (Emil pide .95–.98 y Taste .985); se aplica .98, el rango que pidió el usuario |
| H-17 | BAJA | Búsqueda REQ y filtros solo con `aria-label` | `<label>` visible en la búsqueda REQ, los filtros del Kanban, el lote, el dashboard (Área, Estudio), el mes de urgencia y la validación. «Responsable principal» con `htmlFor` | `ClientHome.tsx`, `KanbanBoard.tsx`, `DashboardView.tsx`, `UrgencyStatsPanel.tsx`, `RequestValidationModal.tsx`, `ProjectModal.tsx` | `unlabeledFields 0` | **CORREGIDO CON OBSERVACIÓN**: el selector de prioridad del modal usa una etiqueta `sr-only`; su texto visible es «Prioridad: …» |
| H-18 | BAJA | Ayudas de lectura a 13–14 px | Párrafos, `dd` y listas de lectura a 16 px; `.field-error` a 16 px; descripción del detalle a 16 px; historial de urgencias de 11 px a 14 px (rótulo) | `index.css`, `ClientTicketDetail.tsx`, `RequesterUrgencySummary.tsx` | `readingTextUnder16 0` | **CORREGIDO** |
| H-19 | BAJA | Asterisco a 3,6:1 | `text-red-700` | `PublicRequestForm.tsx` | `lowContrastCount 0` | **CORREGIDO** |
| H-20 | MEDIA | JS por vista > 450 KiB | Rutas del cliente con carga diferida y precarga por intención: el bundle inicial baja de 449,8 a 379 KB. Dashboard 463 → 429,6 KiB (PASS); bandeja 500 → 469,7; Kanban 667 → 640,5; importador 836 → 805,9 | `App.tsx`, `src/lib/client-routes.ts` | [`browser-bundle.json`](data/browser-bundle.json) | **PARCIAL**: siguen 4 vistas en WARN (< 900 KiB, sin FAIL). Lo que queda es código de librerías (supabase realtime, router, dnd, xlsx) y bajarlo exige cambiar dependencias, algo que no estaba autorizado |
| H-21 | BAJA | Marca truncada a 360/390 | `whitespace-nowrap` y cabecera con `flex-wrap` | `BrandLogo.tsx`, `App.tsx`, `index.css` | Capturas m360 y móvil | **CORREGIDO** |
| H-22 | BAJA | «Siguiente» activo en la última página | `setEnd(page.length < PAGE_SIZE)` | `MyTickets.tsx` | Prueba UX de paginación | **CORREGIDO** |
| H-23 | BAJA | «Cancelar» encima de «Enviar» | `.form-actions`: primario primero; columna en móvil y fila de ancho natural desde 768 px | `PublicRequestForm.tsx`, `index.css` | Capturas `25-*` | **CORREGIDO** |
| H-24 | BAJA | Selector desplazado en el modal de validación | La ayuda de prioridad va bajo el selector con `aria-describedby`, así las etiquetas tienen la misma altura | `RequestValidationModal.tsx` | Captura del modal | **CORREGIDO** |
| H-25 | BAJA | Punto pulsante infinito | Punto estático con la etiqueta `sr-only` «Fase actual» | `ChecklistSection.tsx` | Búsqueda: sin `animate-pulse` | **CORREGIDO** |

## Hallazgos nuevos detectados durante la corrección

| ID | Hallazgo | Corrección | Estado |
|---|---|---|---|
| H-26 | Bandeja: el título de la solicitud solo se abría con el ratón (no con el teclado) | El título es un `<button>` que abre el detalle | **CORREGIDO** |
| H-27 | «Cancelar» del modal de validación con un `aria-label` distinto del texto visible (WCAG 2.5.3) | Se retiró el `aria-label` | **CORREGIDO** |
| H-28 | Checklist: el botón de eliminar solo se veía con hover (inaccesible con teclado o táctil) | Visible con foco y en pantallas táctiles | **CORREGIDO** |
| H-29 | CLS en las rutas diferidas (0,041–0,043) | Por debajo de 0,1 (PASS): `/tracking` 0,0413 y `/cliente/nuevo` 0,0429. Queda registrado | **OBSERVACIÓN** |
| H-30 | Taste `heading-scale` en `/cliente` (h2 de 32 px fuera de escala) | `.public-search h2` a 24 px; el checker final ya no informa `heading-scale` | **CORREGIDO** |
| H-31 | Regresión intermedia: el modal de proyecto mostraba el nombre del icono («inbox») como texto del estado | `<Icon name={statusInfo.icon}>` | **CORREGIDO** (detectado en esta revisión, antes del commit) |
| H-32 | El kit Taste de movimiento no estaba en el proyecto (T6) | `public/assets/motion/motion.css` y `motion.js` copiados sin cambios (sha256 `948bfb71…`, `e4453f1a…`), con la entrada `m-enter` en `index.html` | **CORREGIDO** |
| H-33 | Faltaban las etiquetas para compartir (`og:*`) | `og:title`, `og:description`, `og:type`, `og:image` (`/share.jpg` de 1200×630) y `twitter:card` | **CORREGIDO** |
| H-34 | Prioridad en femenino («Media/Alta/Baja») en el selector del modal de proyecto y en la línea de tiempo de la solicitud, mientras el resto usaba Bajo/Medio/Alto | Ambos usan `PRIORITY_LABEL`; el CSV conserva su formato | **CORREGIDO** (detectado al revisar capturas) |

## Resumen

- Auditoría original (25): **19 CORREGIDO** (H-02, 03, 04, 05, 07, 08, 10, 11, 12, 13, 14, 15, 18, 19, 21, 22, 23, 24, 25), **4 CORREGIDO CON OBSERVACIÓN** (H-06, 09, 16, 17), **2 PARCIAL** (H-01, gate OPEN; H-20, JS en WARN) y **0 ABIERTO**.
- Nuevos (H-26 a H-34): 8 corregidos y 1 observación.
