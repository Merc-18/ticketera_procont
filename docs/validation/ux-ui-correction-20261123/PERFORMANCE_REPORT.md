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

| Vista | Auditoría | **Final** | Veredicto |
|---|---|---|---|
| Portal (inicial, tras scroll) | 442,4 | **393,2** | PASS |
| `/tracking` (carga en frío) | 442,4 | **386,3** | PASS |
| `/cliente/nuevo` (carga directa con sesión) | 442,4 | **436,2** | PASS |
| Cliente autenticado (recorrido acumulado) | 442,4 | 466,7 | WARN: +24 KiB por la capa de movimiento obligatoria del kit (T6) |
| Dashboard | 463 | **429,6** | PASS |
| Bandeja (antes de importar) | 500 | 469,7 | WARN |
| Kanban | 667 | 640,5 | WARN |
| Importador Planner abierto | 836 | 805,9 | WARN |

Ninguna vista llega a FAIL (900 KiB).

**WARN restantes.** En las vistas internas lo que queda es código de librerías que la app usa: `@supabase/supabase-js` con realtime (notificaciones), `react-router`, `react-dom`, `@hello-pangea/dnd` (Kanban) y `xlsx` (importador, ya diferido). Bajarlo exige cambiar o sustituir dependencias, y el encargo prohibía hacerlo sin autorización. Queda como H-20 PARCIAL.

## Estabilidad y pintado (re-auditoría)

| Ruta | CLS | FCP |
|---|---|---|
| `/portal` | 0 | — |
| `/tracking` | 0,0413 | — |
| `/cliente/nuevo` (directa) | 0,0429 | — |

El CLS de las rutas diferidas queda por debajo de 0,1, así que es PASS (H-29, observación). El FCP local, sin limitar red ni CPU, quedó en decenas de milisegundos ([`data/reaudit-results.json`](data/reaudit-results.json) → `perf`); sirve para comparar, no son valores de campo.

## Fuentes y peticiones

No se añadieron fuentes ni dependencias. Las peticiones externas durante la re-auditoría fueron **0** (`external: []`).
