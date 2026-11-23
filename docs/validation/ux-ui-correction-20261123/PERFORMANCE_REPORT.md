# Informe de rendimiento

Métrica Taste (`perf.md`): suma de los bytes de script recibidos, con caché deshabilitada, tras scroll e inactividad. Límites: **WARN > 450 KiB**, **FAIL > 900 KiB**. Medido sobre el build de producción del árbol corregido (`UI_UX_BUILD_DIR`), con el servidor de datos ficticios. Fuente: [`data/browser-bundle.json`](data/browser-bundle.json).

## Build

| Chunk | Antes | Después |
|---|---|---|
| `index-*.js` (inicial) | 449,8 KB | **379,0 KB** (gzip 113 KB) |
| Rutas del cliente | dentro del inicial | chunks diferidos: ClientHome 5,2 KB; RequestTracking 3,2 KB; ClientWorkspace 4,2 KB; ClientNewTicket 15,3 KB; MyTickets 7,3 KB; ClientTicketDetail 4,6 KB; LoginForm 2,3 KB; ClientLaunch 3,1 KB |
| Kit de movimiento Taste | — | `motion.js` 22,8 KiB y `motion.css` (desde `public/`, sin pasar por el bundler) |

Para que la carga diferida no se note, las rutas se precargan por intención (`pointerenter`, `focus` o `touchstart` sobre la tarjeta del portal) y en segundo plano al entrar al espacio del cliente (`src/lib/client-routes.ts`).

## Presupuesto por vista (KiB de script)

| Vista | Auditoría | Corrección (`9fc4afa`) | **Cierre** | Veredicto |
|---|---|---|---|---|
| Portal (inicial, tras scroll) | 442,4 | 393,2 | **393,1** | PASS |
| `/tracking` (carga en frío) | 442,4 | 386,3 | **386,3** | PASS |
| `/cliente/nuevo` (carga directa con sesión) | 442,4 | 436,2 | **436,2** | PASS |
| Dashboard | 463 | 429,6 | **429,6** | PASS |
| Bandeja (antes de importar) | 500 | 469,7 WARN | **445,9** | **PASS** (antes WARN) |
| Cliente autenticado (recorrido acumulado) | 442,4 | 466,7 | 466,6 | WARN |
| Kanban | 667 | 640,5 | **567,9** | WARN |
| Importador Planner abierto | 836 | 805,9 | **782,6** | WARN |

Ninguna vista llega a FAIL (900 KiB). Fuente del cierre: [`cierre/data/browser-bundle.json`](cierre/data/browser-bundle.json) (UX sobre build de producción, 36/36). Los recorridos del panel son **acumulativos**: el personal entra desde el portal, así que la bandeja y el Kanban incluyen el portal, la capa de movimiento y el dashboard.

## Cierre: optimizaciones seguras aplicadas

Composición medida por módulo antes y después: [`cierre/data/chunk-modules-antes.json`](cierre/data/chunk-modules-antes.json) y [`-despues.json`](cierre/data/chunk-modules-despues.json); el script es [`cierre/data/analyze.mjs`](cierre/data/analyze.mjs).

| Cambio (sin dependencias nuevas ni funciones retiradas) | Efecto |
|---|---|
| Tabla, Gantt, Roadmap y la lista de completados/archivados del tablero en carga diferida; precarga al acercar el puntero, el foco o el toque a su botón | Chunk `KanbanBoard` 191,4 → 134,1 KB |
| Modal de proyecto (32,9 KB) y de nuevo proyecto (6,3 KB) diferidos; precarga al acercarse a una tarjeta o fila, o a «Nuevo proyecto» | idem |
| Modal de validación de la bandeja (14,7 KB) diferido; precarga al acercarse a la lista de solicitudes, no al botón del importador | Chunk `RequestInbox` 25,6 → 12,7 KB; bandeja **PASS** |

Las pruebas UX que abren estos modales y vistas (validación, modal de proyecto, arrastre cancelado y vistas del tablero) pasan sobre el build de producción.

## Por qué no se puede reducir más sin cambiar dependencias

| Recorrido en WARN | Qué lo compone (KiB decodificados) | Opción evaluada | Decisión |
|---|---|---|---|
| Cliente autenticado 466,6 | Inicial 370,3 + capa de movimiento 22,8 + espacio del cliente 73,5 | Quitar la precarga de «Mis tickets» y del detalle (−12) | Seguiría en WARN (≈ 454) y empeoraría la navegación (Emil E18). Se mantiene. La capa de movimiento es obligatoria (T6) y no se edita |
| Kanban 567,9 | Inicial 370,3 + capa 22,8 + dashboard 37 + tablero 135 (≈ 80 % `@hello-pangea/dnd` y `react-redux`) | Sustituir o quitar el arrastre | Cambia una dependencia y una función. No autorizado |
| Importador 782,6 | Lo anterior más `xlsx` 335,5 | Usar `xlsx.mini` (250 KB) | No lee `.xls`, que el importador acepta (`accept=".xlsx,.xls"`): quita una función. Descartado |
| Inicial 370 (todas) | Supabase auth 238 + realtime 93 + storage 84 + postgrest 47 (sin minificar), react-dom 131, router 61 | Cargar el cliente de Supabase de forma diferida | Lo usan de forma síncrona casi todos los hooks; sería una refactorización amplia con riesgo funcional, fuera del alcance «seguro». Sin cambio |

**Conclusión:** los tres WARN restantes están por debajo de 900 KiB (el máximo es 782,6) y reducirlos exige cambiar dependencias o retirar funciones. Se documenta como excepción (H-20) y se conserva el rendimiento actual.

## Estabilidad y pintado (re-auditoría)

| Ruta | CLS | FCP |
|---|---|---|
| `/portal` | 0 | — |
| `/tracking` | 0,0413 | — |
| `/cliente/nuevo` (directa) | 0,0429 | — |

El CLS de las rutas diferidas queda por debajo de 0,1, así que es PASS (H-29, observación). El FCP local, sin limitar red ni CPU, quedó en decenas de milisegundos ([`data/reaudit-results.json`](data/reaudit-results.json) → `perf`); sirve para comparar, no son valores de campo.

## Fuentes y peticiones

No se añadieron fuentes ni dependencias. Las peticiones externas durante la re-auditoría fueron **0** (`external: []`).
