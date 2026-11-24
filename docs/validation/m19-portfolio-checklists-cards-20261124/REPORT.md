# M19 — checklist sugerido, tarjetas, Portafolio y alta interna (24/11/2026)

Base: `main` `2382b36` (M18 en producción). Migración: `20261124000200_suggested_checklists_portfolios_internal_tickets.sql` (SHA-256 `a689297e3b78b71a6ec0fdf3c0b04f41675cac2d216af57227fc2d04137e6f61`).

## Qué cambió

| Área | Cambio | Dónde |
|---|---|---|
| Checklist | Ninguna tarjeta nace con tareas y ningún cambio de fase las siembra. Cada fase vacía muestra «Tareas sugeridas para [fase]» con **3** tareas y «Agregar tareas sugeridas (3)», sin duplicar, borrar ni desmarcar. Mismas 45 sugerencias (15 fases reales × 3) en el servidor y en el frontend | M19 (`add_flows`, `checklist_templates`), `checklist-defaults.ts`, `checklist-templates.ts`, `useProjects`, `ProjectModal` |
| Tarjetas | Fondo con el color personal del responsable al 7 % (8 % en oscuro) y neutro sin responsable; avatar relleno con el color personal, aro igual e iniciales ≥ 4,5:1 (tarjeta, Tabla, menú, detalle, carga del equipo y equipo) | `index.css`, `card-colors.ts` (`avatarClass`) |
| Prioridad | Semáforo: Bajo verde `#15803D`, Medio ámbar `#EEBB31`, Alto naranja `#C2410C`, Urgente rojo `#B91C1C` (`#DC2626` en oscuro), en Kanban, Tabla, detalle, Gantt, Roadmap, Dashboard, carga del equipo y prioridad solicitada | `constants.ts`, `index.css`, `RequestedPriority.tsx` |
| Portafolio (fase 1) | Portafolio → iniciativa → tickets → checklist; «Gestión» → «Beneficiarios finales». Filtro y búsqueda en Boards, chip en la tarjeta, columna en Tabla, asociación desde el detalle (auditada) y catálogo «Portafolios» (admin) | M19, `portfolios.ts`, `PortfolioSelect`, `PortfolioManagerModal`, `KanbanBoard`, `ProjectCard`, `TableView`, `ProjectModal` |
| Alta interna | «Nuevo ticket» con dos modos y paridad (detalle abajo), adjuntos con seleccionar, arrastrar y pegar | M19 `create_internal_ticket`, `NewProjectModal.tsx`, `operations.ts` |

## Paridad: cliente frente a TI

| Dato | Portal del cliente | TI · originado por cliente | TI · interno u operativo |
|---|---|---|---|
| Título, descripción | Obligatorios | Obligatorios | Obligatorios |
| Solicitante | Sesión del cliente | Obligatorio (+ correo opcional) | Opcional (por defecto, quien crea) |
| Producto, subproyecto | Obligatorio; subproyecto si el producto lo exige | Igual | — |
| Tipo de solicitud | Obligatorio | Obligatorio | — |
| Prioridad solicitada | Bajo/Medio/Alto/Urgente (sin urgencia separada) | Igual | — |
| Estudio y código interno | Los fija el validador | Obligatorios | — |
| Área y subárea | La fija el validador, solo con el código exacto PROCONT | Solo con el código exacto PROCONT (área obligatoria ahí) | — |
| Prioridad asignada, responsable | Al aprobar | Obligatorios | Obligatorios |
| Fase inicial, fechas, Portafolio | — | Opcionales (nunca Done) | Opcionales |
| Adjuntos | Seleccionar, arrastrar, pegar | Igual (evidencia interna tras crear) | Igual |
| Resultado | REQ pendiente en la bandeja | REQ clasificada y aprobada en una transacción | INT |

Por qué: el modo cliente registra lo mismo que el portal y aplica las mismas reglas del servidor (`classify_request`, `approve_request`), sin duplicarlas. El modo interno no inventa datos de cliente.

## Pruebas

| Suite | Resultado |
|---|---|
| PostgreSQL 17.12 M19 limpio / actualización desde M18 con historia | 19/19 · 21/21 |
| PostgreSQL afectadas con M1–M19 (`board_operations` / `board_frontend`) | 74 · 26 |
| Node (todas) | 201/201 |
| Interfaz nueva `portfolio-cards-ticket` | 9/9 |
| Interfaz afectadas: boards-dashboard-checklists · kanban-attachments · dashboard-boards · theme · ux-four-areas · portal-navigation | 12 · 17 · 9 · 8 · 31 (+6 omitidas por diseño) · 31 |
| `tsc` y `vite build` | OK |

Registros en `data/`; capturas en `screenshots/` (`screenshots-manifest.json`); sumas en `SHA256SUMS`.

## Fase 2 de Portafolio (no implementada)

Equipo de la iniciativa, colaboradores por ticket, dependencias, hitos y vistas de resumen o Gantt por iniciativa (ver `LONG_TERM_PROJECT_MODEL.md`, D-054).
