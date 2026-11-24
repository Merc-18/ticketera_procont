# Corrección de carga de trabajo del equipo

Fecha: 24/11/2026 · Base: `75a9e1cec5b7253ebdab56f64dafa823430830ea` · Rama local: `fix/team-workload-completeness-20261124`

## Hallazgos y cambios

En la revisión de la implementación publicada se confirmó que Dashboard, Equipo, Portafolios, la confirmación atómica M20, la jerarquía de tarjetas y el progreso de checklist ya estaban conectados. No se reconstruyeron esas funciones.

Se corrigió la vista de carga de trabajo por responsable:

- Añade conteos completos de tickets asignados, activos, en curso, pendientes, bloqueados, vencidos, completados y archivados. Cada proyecto se deduplica por responsable; vencido se calcula solo para tickets activos cuya fecha `due_date` precede a la fecha civil `America/Lima`.
- La consulta incluye `active`, `completed` y `archived`, pagina con `readVerifiedPages` y conserva los KPIs globales existentes.
- Si falla la lectura de flujos o de perfiles, la vista no presenta una tabla de ceros ni métricas incompletas; muestra el error y permite reintentar ambas lecturas.
- En desktop conserva la tabla. En pantallas móviles presenta tarjetas por miembro, conteos legibles y detalle expandible. La tabla ancha queda fuera del layout móvil y evita que el viewport se amplíe por su ancho intrínseco.
- La lista de tickets expandidos identifica fecha vencida, bloqueo, estado completado o archivado, sin alterar estados ni acciones de negocio.

Los conteos por responsable usan los flujos con asignación principal disponible en el esquema actual. No se crearon métricas de coasignación.

## Integración conservada

El resto de las funcionalidades de Dashboard, Equipo, gestión de portafolios, asociación Portafolio → Proyecto durante la aprobación M20, alta interna, Kanban, Tabla, Gantt, Roadmap, prioridades, regla de áreas PROCONT y checklist corresponde al código ya publicado en la base `75a9e1c`. La implementación existente y sus pruebas no fueron reconstruidas ni cambiadas en backend.

La integración de confirmación utiliza `operations.approveRequestWithPortfolio` y la RPC `approve_request_with_portfolio`; M20 registra aprobación y relación en una operación atómica, con selección dependiente y opción de ticket independiente. Esta sesión no ejecutó escrituras de tickets en ningún servicio.

## Base de datos y seguridad

No se necesitó migración nueva ni cambio de RPC/RLS. La comprobación remota de solo lectura con Supabase CLI contra `xsxdpaiivklqeudgqoqf` mostró los 21 identificadores locales y remotos coincidentes, incluido M20 `20261124000300`; no hay migraciones locales pendientes. La CLI tuvo que ejecutarse con HOME temporal porque su ruta de telemetría global no es escribible en este entorno. No se modificó configuración ni historial remoto.

## Evidencia QA

El caso de carga usa cuatro filas ficticias en un servicio local simulado: ticket activo vencido y bloqueado, activo pendiente, completado y archivado, todos asignados al usuario QA de pruebas. Verifica conteos `4/2/1/1/1/1/1/1`, el detalle, la vista móvil y errores de React. Otro caso fuerza HTTP 500 en `project_flows`, confirma que se ocultan tabla y KPIs y que el botón ejecuta un reintento.

Las capturas se generaron desde un build local de producción servido en Chromium, sin solicitudes externas. Todas pertenecen a `Versión 202611241851`; no se insertaron tickets en Supabase y no se usaron credenciales de proveedor.

- [Carga de Equipo en desktop, 1440 px](screenshots/followup-equipo-carga-desktop.png)
- [Carga de Equipo en móvil, 390 px](screenshots/followup-equipo-carga-movil.png)
- [Manifiesto del build, viewport y hashes](gallery-manifest.json)
- [SHA-256 de los artefactos](SHA256SUMS)

## Pruebas

| Comprobación | Resultado | Naturaleza |
|---|---:|---|
| `node --test tests/*.test.mjs` | 209/209 PASS | Node local |
| `npm run test:ui` | 131 PASS, 6 SKIP, 0 FAIL de 137 | React real + Chromium; servicios Supabase simulados localmente |
| Build de producción y TypeScript | PASS | `tsc` + Vite |
| Carga completa de Equipo y screenshots desktop/móvil | 1/1 PASS | Build local, Chromium y fixture `QA-FICTICIO` |
| Carga errónea de flujos y reintento | PASS dentro de la suite UI | Fixture HTTP 500 local |
| PostgreSQL remoto | Solo lectura, M1–M20 coincidentes | CLI Supabase; no se invocaron RPC de escritura |

Los seis casos omitidos siguen siendo los skips preexistentes documentados en la suite UI; no se cuentan como aprobados. El aviso de Browserslist sobre datos de compatibilidad desactualizados no afecta el build ni las pruebas.

## Publicación

La rama remota `main` fue `75a9e1cec5b7253ebdab56f64dafa823430830ea` al iniciar esta corrección y permaneció en ese SHA durante las comprobaciones. El diff es frontend y pruebas UI más este informe. No se creó migración. El push y despliegue se ejecutarán después de revisar el commit local y verificar nuevamente `main`.
