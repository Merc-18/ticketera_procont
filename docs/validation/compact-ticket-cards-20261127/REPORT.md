# Simplificación definitiva de tarjetas — 27/11/2026

Base: main `40f582de2f314be5f2b46bbaa2f39ecfeb5eaa14`. Implementación de Codex, sin Claude, en la copia independiente escribible. Se conserva la carpeta original protegida, sus archivos y metadatos; no se fuerza su sincronización.

## Resultado

Las tarjetas activas, completadas y archivadas comparten `ProjectCard`: título primero de máximo dos líneas; Producto · Subproducto en una línea con espacio propio para ambos; Proyecto en una línea con elipsis y tooltip; prioridad y antigüedad juntas; checklist y responsable con avatar/nombre en el pie. Se reducen padding y separaciones. En el ancho más estrecho el pie se distribuye en dos filas para conservar un nombre legible y el área de asignación de 44 px.

No se renderizan portafolio, INT/REQ, solicitante, área, distintivo Dual ni sus filas/contenedores en estas tarjetas. El bloqueo usa un icono compacto con nombre accesible y motivo en tooltip. Selección múltiple y asignación conservan controles de 44×44 px; se preservan prioridades, colores personales, estados y contadores independientes. Los nombres completos están en el DOM/tooltips y en el detalle. Sin catálogo/proyecto/responsable se muestra el estado ausente; checklist 0/0 explícito, sin división por cero.

La presentación compacta de `TicketHierarchy` no cambia su modo completo: el detalle y las vistas administrativas conservan el portafolio y la información íntegra. Producto usa requests.system_id, subproducto subsystem_id o requested_subsystem_id original y su pertenencia a producto; proyecto usa initiative_id, validado internamente con portfolio_id. El resolver, relaciones, RPC, filtros, gestión de catálogos y operaciones permanecen intactos. No se inventan nombres ni asociaciones.

Antigüedad sigue siendo neutral desde projects.created_at, por días civiles de Lima; no se cambia por fase, responsable o proyecto. No reaparecen vencimientos ni se modifica expiración de sesiones/reservas.

## Verificación

| Prueba | Resultado | Alcance |
|---|---|---|
| Node | **215 PASS, 0 FAIL** | Reglas, fechas Lima, pertenencias y contratos existentes |
| Regresión UI completa | **163 PASS, 0 FAIL, 6 SKIP / 169 casos** | React/Chromium reales; Auth/REST ficticios locales; incluye los nueve casos compactos |
| Casos focalizados | **9 PASS, 0 FAIL** | Ocho combinaciones tema/ancho × tres estados, más detalle íntegro; no se suman otra vez al total |
| TypeScript y build | **PASS** | npm run build ejecuta tsc y Vite |
| Capturas del antes | **8 escenarios, sin errores JS** | main@40f582d aislado en /tmp; mismos cuatro tickets ficticios; no califica las reglas nuevas |

Se verificaron 320, 390, 834 y 1440 px, claro/oscuro, tickets activos/completados/archivados, nombres largos, con/sin producto/subproducto/proyecto, dos responsables diferentes del mismo proyecto, bloqueo, 0/0, 3/3 y 3/18. Las aserciones geométricas comprueban título de dos líneas, jerarquía de una línea, visibilidad de producto y subproducto, controles de 44 px, altura máxima de 225 px en estos casos, menú acotado, ausencia de cruces y overflow del documento. El detalle conserva portafolio, proyecto, número, solicitante, área y motivo de bloqueo.

Las regresiones de administración confirman filtros de portafolio/proyecto, búsqueda, tabla y portafolio completo, asociación mediante set_project_portfolio, catálogo vía save_portfolio, selección dependiente, permisos de consulta/gestión por rol, refresco compartido, alta interna/cliente, aprobación, checklist, adjuntos y colores/contraste. Se actualizan las expectativas de presentación; una comprobación con títulos repetidos pasa a identificar tickets por su UUID, sin confundir responsables. Las capturas históricas de la entrega anterior se conservan: su prueba ahora escribe en /tmp salvo destino explícito.

Los seis SKIP históricos son cuatro casos de carga de ambos ingresos (desktop, laptop, tablet, móvil) y dos de presupuesto/carga diferida de vistas internas/Planner (desktop y móvil). Permanecen pendientes, no aprobados. No se repiten pruebas SQL ni se trasladan los 17 PASS externos a estas pantallas.

## Reducción medida

Promedio de altura de las cuatro tarjetas activas, mismo escenario de nombres largos en ambos temas. La reducción depende del contenido; no es un porcentaje universal.

| Ancho | Antes | Después | Reducción |
|---|---|---|---|
| 320 px | 690.67 px | 216 px | 68.7 % |
| 390 px | 566.87 px | 194 px | 65.8 % |
| 834 px | 566.87 px | 194 px | 65.8 % |
| 1440 px | 566.87 px | 194 px | 65.8 % |

[Galería antes/después](GALLERY.md) · [Resultados](results.json) · [Node](node-results.txt) · [UI](ui-regression-results.txt) · [Focalizadas](focused-results.txt) · [TypeScript/build](typecheck-build-results.txt).

## Conservación y límites

- Sin SQL, migraciones, cambios de Supabase ni escrituras de datos alojados. No se cambian src/lib, src/hooks o src/types. Snapshot QA y lockfile idénticos a la base. portfolio_id, portfolio_initiatives y todos los datos históricos permanecen.
- La verificación usa datos sintéticos locales con red externa bloqueada. Las capturas no representan cuentas autenticadas de producción. No sustituye login de proveedores, UI con cuatro perfiles alojados, reservas binarias ni recepción E2E de Realtime.
- AGENTS.md, CLAUDE.md, requisitos oficiales, README y estado describen esta regla y conservan el contexto histórico.
- Publicación autorizada por PR y merge normal a main. Se confirma GitHub, deployment Vercel y versión visible mediante GET público sin autenticación, sin tocar datos. SHA final y versión se entregan con recibo local de publicación; no se incorpora un SHA propio circular al commit.
