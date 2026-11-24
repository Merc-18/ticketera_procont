# Dashboard: «Tickets por estudio»

Sustituye por completo el bloque «Áreas · código PROCONT» y sus textos («Trabajo en ejecución clasificado con el código interno exacto PROCONT.», «Sin trabajo en ejecución con área registrada.»).

## Definición

| Aspecto | Regla |
|---|---|
| Qué se cuenta | **Solicitudes** (`public.requests`): pendientes, aprobadas y rechazadas. Los proyectos operativos no se cuentan como tickets |
| Relación | `requests.studio_id` (UUID → `studios`). Nombre desde el catálogo de estudios; un id fuera del catálogo se muestra como «Estudio no disponible» |
| Sin estudio | `studio_id` nulo → categoría aparte «Sin estudio asignado», al final y separada |
| Área | **No interviene.** Si el filtro de área del Dashboard está activo, el bloque lo indica («El filtro de área no se aplica a este bloque.») |
| Periodo | El selector del Dashboard (30 días, 90 días, todo el tiempo), aplicado **en el servidor** (`created_at >= desde`) |
| Estudio | El filtro de estudio del Dashboard (`studio_id = X`) |

## Totales exactos (paginación)

La consulta anterior de solicitudes del Dashboard no pagina. PostgREST corta en `max_rows = 1000`, así que pasado ese número los KPI de «Solicitudes» serían parciales. Es una limitación previa y está registrada como pendiente. El bloque nuevo **no** depende de esa consulta:

- `src/lib/tickets-by-studio.ts` pide `id, studio_id` con `count=exact`, orden estable por `id` y páginas de 1000 (`range`).
- Deduplica por `id` y exige que lo leído coincida con el total del servidor. Si una página falla o el total cambia durante la lectura, muestra el error («… Usa «Actualizar».») en lugar de un total parcial.
- Sin RPC nuevas: es la misma lectura de `requests` que RLS ya permite al personal interno.

## Presentación

Un bloque compacto de la rejilla inferior, junto a «Urgencias solicitadas»:
- Título «Tickets por estudio» y, a la derecha, el **total general** (mono, 24 px) seguido de «en total».
- Barras horizontales en azul de marca, proporcionales al estudio con más tickets (`transform: scaleX`), ordenadas de mayor a menor. «Sin estudio asignado» va en neutro y separado por una línea discontinua.
- La suma de las barras es el total (lo verifica la prueba). Con más de 8 estudios la lista se desplaza dentro del bloque, sin ocultar ninguno.
- Sin datos: «No hay solicitudes en el periodo elegido.». En móvil, nombre y número en una fila y la barra debajo.

## Pruebas

- Unitarias (`tests/boards-dashboard-checklists.test.mjs`): 2.202 filas en 3 páginas; periodo y estudio en el servidor; error con una página fallida o un total que no cuadra; orden de filas y «Sin estudio» al final.
- Interfaz (claro y oscuro): 1.497 solicitudes ficticias, más de 1.000 en un estudio, 340 en otro y 7 sin estudio; «Todo el tiempo» = 1.497 en más de una página; «Últimos 30d» = 1.197 (excluye 300 antiguas); el filtro `gte` va en la consulta; la suma de barras coincide con el total; no queda ningún bloque de áreas.

Capturas: `antes-dashboard-bloque-*` (bloque de áreas) y `despues-dashboard-bloque-*` / `despues-dashboard-tickets-estudio-*`.
