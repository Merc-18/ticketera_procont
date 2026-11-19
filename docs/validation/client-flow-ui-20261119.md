# Corrección del flujo de clientes y restos SLA — evidencia (19/11/2026)

Rama `fix/ticketera-client-flow-ui` desde `main@44cebeb`. Solo frontend y pruebas: sin migraciones,
Edge Functions, Supabase remoto ni Vercel. `VITE_CLIENT_LOGIN_ENABLED=0` en Vercel no se cambió.

## Cambios

| Problema (auditoría) | Corrección | Archivo |
|---|---|---|
| «Nueva Solicitud» llevaba al formulario anónimo `/request` | `/portal` → `/cliente` (Quipu/QuipuFac) → `/cliente/nuevo` | `PublicLanding.tsx` |
| `/request` abría el formulario sin autenticación | Redirige a `/cliente`; el formulario ya no tiene modo anónimo ni selector de estudio; se retiró el adaptador `submitClientRequest` y la entrega de adjuntos por token anónimo | `App.tsx`, `PublicRequestForm.tsx`, `operations.ts`, `attachments.ts` |
| Sin entrada pública a Mis tickets | Tarjeta «Mis tickets» → `/cliente/tickets`; sin sesión `/cliente?ir=tickets` y vuelta tras ingresar (lista blanca `nuevo`/`tickets`) | `PublicLanding.tsx`, `ClientWorkspace.tsx`, `ClientHome.tsx` |
| Sin regreso desde `/cliente` | Enlace «← Inicio» | `ClientHome.tsx` |
| Ingreso del personal poco claro | Botón «Ingreso del personal» (modal separado; `/login` intacto) | `PublicLanding.tsx` |
| Tarjetas desactivadas parecían operativas | Gris, `cursor: not-allowed`, sin efectos, insignia «No disponible» y aviso destacado | `ClientHome.tsx` |
| Exportación «Completados» con `activity_logs.sla_completed`, «SLA Vencimiento», «A Tiempo» y `updated_at` | Métricas por ticket del servidor `get_ticket_performance` (M11, adaptador de Codex `ticket-metrics-client.mjs`): inicio, finalización, Cycle/Lead y «Estado de la métrica»; ausencias en blanco con su motivo, nunca cero | `DashboardView.tsx` |
| «SLA Vencimiento» en exportación de activos | «Fecha límite» (`due_date` ordinario) | `DashboardView.tsx` |
| `useSlaWarnings` creaba notificaciones «SLA vencido» cada hora | Retirado (archivo eliminado) | `App.tsx`, `useSlaWarnings.ts` |
| Roadmap ordenaba por `sla_target_date` («con SLA») | Usa la fecha límite `due_date` («con fecha límite») | `RoadmapView.tsx` |
| Validador permitía decidir solicitudes históricas sin responsable ni motivo | Responsable (aceptar) y motivo público (rechazar) siempre obligatorios; clasificación solo con estudio | `RequestValidationModal.tsx` |
| Rechazos del servidor con mensaje genérico | Lista cerrada de mensajes de validación conocidos → texto claro (responsable, código, área, subproyecto, motivo) | `supabase-errors.ts` |
| Error al listar evidencias mostrado como «Sin evidencias» | Error explícito | `attachments.ts`, `EvidenceSection.tsx`, `RequestValidationModal.tsx` |
| Documentación contradictoria | README, `client-portal.md`, `deployment.md` | docs |

Datos históricos: no se borra ni modifica ningún dato; `sla_target_date` y los eventos históricos se
conservan. Proyectos históricos con solo `sla_target_date` (sin `due_date`) ya no aparecen en Roadmap.

## Pruebas

`npm run test:ui` — React renderizado en Chromium (playwright-core 1.62.1) sobre el servidor Vite real,
escritorio 1366×900 y móvil 390×844. **Datos simulados**: simulador del portal (banner «DATOS FICTICIOS»)
y `tests/ui/fixture-server.mjs` (REST/Auth de Supabase simulados). Sin red externa ni tickets reales.

| # | Caso | Escritorio | Móvil |
|---|---|---|---|
| 1 | `/portal` muestra Nueva Solicitud, Mis tickets, Rastrear e Ingreso del personal | ✔ | ✔ |
| 2 | Nueva Solicitud → `/cliente` (con «← Inicio») | ✔ | ✔ |
| 3 | `/request` → `/cliente`, sin formulario ni llamada `submit_client_request` | ✔ | ✔ |
| 4 | Quipu: exactamente `client-ruc`, `client-username`, `client-password` | ✔ | ✔ |
| 5 | QuipuFac: exactamente `client-ruc`, `client-password` | ✔ | ✔ |
| 6 | Login desactivado: deshabilitado, `not-allowed`, «No disponible», sin formulario | ✔ | ✔ |
| 7 | Login válido → `/cliente/nuevo`; Quipu 5 productos simulados, QuipuFac sin Quipu; Salir | ✔ | ✔ |
| 8 | Sin sesión `/cliente/nuevo` → `/cliente?ir=nuevo` | ✔ | ✔ |
| 9 | Sin sesión `/cliente/tickets` → `/cliente?ir=tickets` → tras ingresar, Mis tickets | ✔ | ✔ |
| 10 | Mis tickets solo de la identidad; detalle propio; ajeno «no encontrado» conservando sesión | ✔ | ✔ |
| 11 | Rastrear público: solo número y estado | ✔ | ✔ |
| 12 | Personal: viewer/developer/admin/superadmin con sus pestañas; sesión separada del cliente; `/login` | ✔ | ✔ |
| 13 | Exportaciones sin columnas SLA; Cycle/Lead por ticket; ausencia en blanco con motivo | ✔ | — |
| 14 | Sin inserciones de notificaciones SLA al cargar el tablero | ✔ | — |

Resultado: **22/22**. Control de validez: con `App.tsx` y `PublicLanding.tsx` originales de `44cebeb`,
los casos 1–3 fallan (3/3), es decir, las pruebas detectan el defecto publicado.

Además: `node --test tests/*.test.mjs` 144/144, `tsc` del proyecto y del contrato, `npm run build`
correcto; el bundle no contiene el simulador ni datos de prueba.

## Límites

- Sin prueba contra Supabase real: el login real depende de M14, M15 y del despliegue de `client-login`.
- Las métricas por ticket dependen de `get_ticket_performance` (M11, aplicada); probado con datos simulados.
- Exportaciones verificadas solo en escritorio (descarga de archivo); la vista móvil del tablero no se probó.
- Las pestañas por rol se prueban en la interfaz; los permisos reales los aplica el servidor (RLS/RPC).

## Corrección posterior: paginación de la exportación de terminados (hallazgo de Codex)

**Causa raíz (b21c91c).** `exportCompletedCSV` llamaba a `get_ticket_performance` una sola vez, sin
filtro ni rango, y filtraba `general_status === 'done'` en el navegador. PostgREST devuelve como
máximo `max_rows = 1000` filas por respuesta: con más de 1.000 tickets, los terminados fuera de esa
primera respuesta se omitían, o el CSV decía «No hay tickets terminados». La búsqueda de proyectos
(`.in('id', …)` con todos los ids en una consulta) tenía el mismo límite.

**Algoritmo (`src/lib/ticket-export.ts`), misma RPC y argumentos, sin cambios en M11:**
1. `get_ticket_performance` devuelve `TABLE`; PostgREST admite filtros, orden y rango sobre su
   resultado. Cada petición: `general_status=eq.done` (filtro en el servidor, antes del límite),
   `order=request_id.asc` (clave única por fila → orden determinista), `offset/limit` (página de 1.000)
   y `Prefer: count=exact` (total filtrado en `Content-Range`).
2. Se avanza por las filas realmente recibidas hasta reunir exactamente el total; si el servidor
   recorta la página, se continúa.
3. Sin CSV parcial: error si una página falla, si el total cambia entre páginas, si llega una página
   vacía antes de completar, si hay duplicados o una fila no terminada.
4. Proyectos por lotes de 100 ids (cada lote por debajo del límite de filas).
5. Mismas columnas y métricas por ticket; null y fechas desconocidas quedan vacías con su motivo.

**Pruebas añadidas.** `tests/ticket-export.test.mjs` (11, PostgREST simulado con `max_rows`, orden
arbitrario sin `ORDER BY`, `count=exact`, fallo y mutación inyectables) y 4 casos UI en Chromium contra
el servidor simulado por HTTP (`get_ticket_performance` con la misma semántica):

| Caso | Unidad | UI | Contra b21c91c |
|---|---|---|---|
| A. Cero terminados (1.500 registros): mensaje, sin descarga | ✔ | ✔ | pasa (mismo mensaje por coincidencia) |
| B. Algunos terminados: exportación exacta | ✔ | ✔ (caso 13) | pasa |
| C/D. 1.000 sin terminar + 2 terminados fuera de la primera página | ✔ | ✔ | **falla** |
| E. 2.500 terminados en 3 páginas, sin duplicados ni pérdidas (+ página recortada a 400) | ✔ | ✔ | **falla** |
| F. Error en la página 2: sin CSV parcial, error visible (+ total cambiado entre páginas) | ✔ | ✔ | **falla** |
| G. null en Cycle/Lead y fechas desconocidas sin inventar | ✔ | ✔ | — |
| H. Orden `request_id.asc` en todas las páginas, offsets 0/1000/2000; control: sin orden se pierden filas | ✔ | ✔ | — |

Resultados: UI 26/26, Node 155/155, `tsc` y build correctos.

**Límites.** Simulación local de PostgREST (no se probó contra el proyecto real). Las páginas son
consistentes si los datos no cambian durante la exportación; si cambian, se detecta por el total y se
pide reintentar (un cambio que no altere el total ni el orden por `request_id` no se detecta).
