# Cierre QA integral — estado alcanzable al 25/11/2026

## Resumen ejecutivo

Base publicada verificada en GitHub: `main@ec022c768461aa8b4de143e3db94975853a5d34c`.
Rama local de trabajo: `codex/closure-real-qa-20261125`.
Commit de código: `de640de` (`fix: expose Equipo read-only to viewer and restore QA subprojects`).
El checkout compartido y los worktrees anteriores se conservaron.

El trabajo previo sigue disponible: informe de la QA PostgreSQL local en [REPORT.md](../qa-integral-20261125/REPORT.md), commit de Claude `58725e058c55876906e8c0f8fb35295c9024fdc9`, fixture `tests/ui/qa-dataset.json` y contrato `QA_FIXTURE_CONTRACT.md`.

En esta continuación se corrigieron dos defectos locales:

1. El rol `viewer` puede entrar a Equipo y consultar Carga de trabajo y Portafolios/proyectos. Se mantuvieron ocultas las pestañas y acciones de administración.
2. Los fixtures de UI servían un arreglo vacío para `catalog_subsystems` a pesar de que el snapshot QA tiene ocho filas. Ahora se sirven esas filas y la prueba valida su forma y relación `system_id`.

No se aplicaron migraciones ni se escribieron datos en Supabase remoto. No se creó ticket alguno en un servicio remoto.

## Estado de infraestructura y publicación

La sesión guardada de Supabase CLI permitió enumerar proyectos. La lista no contiene un proyecto QA de Ticketera separado; el único proyecto Ticketera observado es `ticketera-procont`, que es producción. No se ejecutó ninguna escritura sobre él.

`npx vercel whoami` se pudo ejecutar con una configuración temporal dentro del workspace y respondió `Logged out`. No existe una sesión Vercel accesible desde este entorno. No se puede crear ni proteger un Preview, configurar acceso, verificar deployments o publicar la rama sin esa cuenta.

Por ello no existen todavía una URL de Vercel QA ni credenciales de QA. La aplicación pública y la versión Vercel actual no fueron modificadas en esta etapa. No se hizo push, merge, migración remota ni deploy.

## Evidencia ejecutada

| Área | Resultado | Tipo / límite |
|---|---|---|
| Node | 209/209 PASS | Unitarias/adaptadores existentes. |
| UI focalizada `qa-integral.ui.test.mjs` | 11/11 PASS | React + Chromium con REST/Auth simulados. |
| UI completa | 145 PASS, 0 FAIL, 6 SKIP | Chromium con servicios simulados. Los SKIP no se cuentan como aprobados. |
| TypeScript + build | PASS | `npm run build` (`tsc && vite build`). |
| Viewer: lectura real | PASS | PostgREST hacia PostgreSQL 17 local: 7 perfiles, 27 proyectos y 27 flujos visibles bajo el rol viewer. Auth local simulada. |
| Viewer: lectura y modificación | PASS CON ALCANCE | El viewer consultó perfiles internos autorizados, proyectos y flujos. `PATCH users.role` devolvió 403 por privilegio de columna; `PATCH projects` no modificó filas por RLS (HTTP 200 con arreglo vacío; lectura posterior confirmó título intacto). El permiso existente permite al usuario editar su propio `full_name` únicamente; está documentado en `PERMISSIONS_SPEC.md` y no es permiso de gestión de Equipo. Auth local simulada, PostgreSQL 17 real. |
| Subproyectos | PASS | `client_subprojects` se consultó para los siete productos permitidos; todos los elementos retornados conservaron el `system_id` solicitado. Quipu devolvió Escritorio. La sesión inválida fue rechazada con HTTP 401. Auth local simulada; PostgreSQL 17 real. |
| Chromium contra PostgreSQL local | PASS | Ingreso viewer, Carga de trabajo, Portafolios en solo lectura, 0 errores JavaScript y 0 respuestas API fallidas. Capturas en `screenshots/`. |
| Smoke Chromium adicional | PASS | Dashboard, 25 tarjetas en Boards, Tabla, Requests y Equipo con gateway/PostgreSQL local; cero errores JS y cero respuestas API fallidas. Capturas conservadas en [`screenshots/continuation/`](screenshots/continuation/). |
| Suites Node | PASS | 209/209 en la revisión de cierre; sin cambios en código cubierto por esas pruebas. |
| Suites Chromium UI | PASS CON SKIP DOCUMENTADOS | `npm run test:ui`: 145 PASS, 0 FAIL, 6 SKIP. En la repetición focalizada tras aplicar observaciones: 42/42 PASS, 0 SKIP. |
| TypeScript y build | PASS | `npm run build` ejecutó `tsc && vite build`; build Vite finalizó correctamente. Claude verificó adicionalmente `tsc --noEmit`. |
| M20 y flujos integrados | Evidencia previa PASS | La prueba anterior creó y confirmó dos solicitudes ficticias en PostgreSQL local, no remoto; ver el informe QA enlazado arriba. No se repitió. |
| Auth/expiración/logout en Supabase alojado | NO VERIFICADO | No hay proyecto QA separado. En las pruebas locales, Supabase Auth y la validación de proveedores se simulan; las RPC/sesiones de clientes usan PostgreSQL local real. |
| Quipu/QuipuFac con proveedores reales desde QA | NO VERIFICADO | No se hizo login externo en esta etapa. |
| Supabase Storage binario (subir/descargar/eliminar y políticas reales) | NO VERIFICADO | El harness anterior usa stub de Storage. Escribir en Storage de producción está expresamente fuera de autorización. |
| Checklist persistente tras recarga | PASS LOCAL | Chromium cambió una tarea existente mediante la interfaz, recargó la aplicación, comprobó el estado consultado de PostgreSQL y restauró el valor original. PostgreSQL 17 local vía PostgREST; Auth interna simulada. No equivale a Supabase alojado. |
| Selector y persistencia de subproyecto | PASS LOCAL | Chromium seleccionó QuipuFac, verificó opciones dependientes, cambió a Quipu (limpió selección anterior), volvió a QuipuFac, creó una solicitud QA local mediante `client_submit_request` y verificó en PostgreSQL `system_id`, `requested_subsystem_id` y REQ. Autenticación de proveedor simulada. Se conservó una solicitud sintética `QA-FICTICIO` local. |
| Realtime | NO VERIFICADO | No disponible en el gateway local. |
| Producción Vercel — smoke público posterior al push | PASS | Chromium en el dominio oficial: Portal, Quipu, QuipuFac e ingreso interno. Versión visible uniforme `202611251439`; bundle inicial HTTP 200, 382.766 bytes y contiene esa versión; 0 errores JS y 0 respuestas first-party fallidas. No se inició sesión ni se escribieron datos. El estado/ID de deployment en el panel Vercel no pudo consultarse porque el CLI está logged out. |

Los seis SKIP de UI corresponden a cuatro pruebas existentes de carga de ambos proveedores por viewport y dos de presupuesto/carga diferida. Permanecen omitidos; no cuentan como PASS.

## Seguridad y alcance de los cambios

- `src/App.tsx`: agrega viewer a `canSeeEquipo`. No agrega pestañas de Usuarios, Papelera o Catálogos para ese rol. `PortfolioPanel` conserva `canManage=false` para viewer.
- Las políticas SQL existentes permiten lectura interna autorizada a `viewer`. El permiso de columna solo permite actualizar `full_name` propio (M2 y `PERMISSIONS_SPEC.md:68`); `role` e `is_active` no son editables por viewer. La prueba PostgREST comprobó que el viewer no modificó proyectos ni su rol. No se amplió RLS ni se modificó SQL.
- `tests/ui/portal-navigation.ui.test.mjs`: actualiza las expectativas viewer para escritorio/móvil y usa una consulta de nombre exacta para evitar ambigüedad con la entrada de Dashboard.
- `tests/ui/qa-fixtures.mjs` y `tests/ui/qa-integral.ui.test.mjs`: incluyen y verifican el catálogo por `system_id` con consultas filtradas por producto.
- `scripts/qa-local/verify-viewer-subprojects.mjs`: verificación reproducible limitada a loopback, exige `production:false` y PostgreSQL local; no permite apuntar a producción.
- `scripts/qa-local/verify-checklist-persistence-browser.mjs`: persistencia real de checklist por UI y recarga, restaura la fixture al valor previo.
- `scripts/qa-local/verify-client-subproject-ui-persistence.mjs`: selector dependiente y creación sintética contra M13 local; verifica relaciones persistidas y hace logout.
- No se modificaron SQL, RPC, RLS, Edge Functions, modelos de datos ni contratos API.

## Capturas

- [Equipo — viewer, carga de trabajo](screenshots/viewer-team-readonly.png)
- [Equipo — viewer, portafolios en solo lectura](screenshots/viewer-portfolios-readonly.png)

Ambas capturas son de Chromium local con datos QA ficticios. No son capturas de Vercel.

Galería adicional capturada con el build y la fixture local de esta continuación (PostgreSQL real, Auth simulada): [Dashboard](screenshots/continuation/dashboard.png), [Boards](screenshots/continuation/boards.png), [Tabla](screenshots/continuation/tabla.png), [Requests](screenshots/continuation/requests.png), [Equipo](screenshots/continuation/equipo-carga-de-trabajo.png), [Checklist antes](screenshots/continuation/before.png), [Checklist después de recargar](screenshots/continuation/after-reload.png), [formulario con subproyecto](screenshots/continuation/form-selected.png) y [constancia de solicitud local](screenshots/continuation/receipt.png). Dimensiones, contexto y hashes: [screenshots-manifest.json](screenshots/continuation/screenshots-manifest.json), [SHA256SUMS](screenshots/continuation/SHA256SUMS).

## Archivos cambiados

Aplicación/test:

- `src/App.tsx`
- `tests/ui/portal-navigation.ui.test.mjs`
- `tests/ui/qa-fixtures.mjs`
- `tests/ui/qa-integral.ui.test.mjs`
- `scripts/qa-local/verify-viewer-subprojects.mjs`
- `scripts/qa-local/verify-checklist-persistence-browser.mjs`
- `scripts/qa-local/verify-client-subproject-ui-persistence.mjs`

Evidencia:

- `docs/validation/closure-integral-20261125/REPORT.md`
- `docs/validation/closure-integral-20261125/HANDOFF_CLAUDE_READ_ONLY.md`
- `docs/validation/closure-integral-20261125/screenshots/*`, incluida la galería de continuidad con nueve imágenes y manifiesto SHA-256.
- `docs/validation/closure-integral-20261125/SHA256SUMS`

## Bloqueos restantes

1. No existe un proyecto Supabase QA separado. Auth local es simulada; por tanto expiración, revocación y logout no se verifican contra Auth alojado.
2. Supabase Storage binario alojado y Realtime no se verificaron; el gateway local no los implementa. No se escribió en Storage de producción.
3. Quipu/QuipuFac con proveedores reales desde un backend QA no se verificaron; la autenticación local usa identidades reservadas ficticias.
4. No hay Preview QA protegido con credenciales ficticias. Vercel CLI sigue logged out, por lo que no se pudo leer el ID ni el campo de estado del deployment en su panel. La comprobación del dominio oficial y el bundle es evidencia directa del artefacto público.

## Estado de aceptación

**PARCIAL — la revisión funcional local sigue completándose.** Las pruebas contra servicios alojados (Auth real, Storage y proveedores reales) permanecen NO VERIFICADAS; no se sustituirán por mocks.

### Continuación y revisión independiente — 25/11/2026

El worktree de QA persistente se recuperó. `scripts/qa-local/verify-viewer-subprojects.mjs` pasó con siete productos, siete perfiles internos, 27 proyectos y 27 flujos; el intento de cambiar `users.role` recibió 403 por privilegio de columna y el intento de editar un proyecto no alteró la fila (RLS, HTTP 200 sin fila afectada). El permiso existente permite editar el propio `full_name`, conforme a `PERMISSIONS_SPEC.md`; no concede gestión de Equipo.

Chromium contra PostgreSQL 17 local pasó el cambio de checklist, recarga, comprobación del dato persistido y restauración al valor original. La prueba del portal cliente cargó las opciones reales de subproyecto por producto, limpió la selección al cambiar de producto y creó una solicitud sintética mediante M13; el registro local guardó el producto, subproyecto y REQ coincidentes. Se conservó únicamente en el cluster local QA con prefijo `QA-FICTICIO`, REQ `REQ26-020`.

Auditoría independiente de Claude: **APROBADO CON OBSERVACIONES**, sin hallazgos mayores que severidad Baja. Ejecutó `tsc --noEmit` (PASS), `qa-integral.ui` (11/11 PASS) y checksums (2/2 PASS). Las observaciones se corrigieron en esta rama: texto/reloj viewer, precisión de permisos, validación de subproyectos por producto y rechazo de redirecciones en el script QA.

Chromium smoke adicional contra el gateway/PostgreSQL local: Dashboard, Boards (25 tarjetas), Tabla, Requests y Equipo; cero errores JS y cero respuestas API fallidas. En las pruebas UI completas se registraron seis SKIP preexistentes, no contabilizados como aprobados; Node 209/209 y `npm run build` pasan.


### Publicación y smoke de producción — 25/11/2026

- `origin/main` quedó en `76ddfc2d6ab73e953e9f9c0d1984aec8a0a24a87` después de un fast-forward desde `ec022c768461aa8b4de143e3db94975853a5d34c`; push normal exitoso. `git ls-remote --heads origin` mostró únicamente `main`.
- El dominio `https://ticketera-procont.vercel.app` sirvió una nueva compilación después del push. La versión visible y uniforme en `/portal`, `/cliente` y `/login` fue `202611251439` en America/Lima.
- Chromium confirmó Portal (Nueva Solicitud y Rastrear Solicitud), selección/login Quipu (RUC, usuario, contraseña), QuipuFac (RUC y contraseña) y Acceso del equipo de TI. No se enviaron credenciales ni solicitudes. Las cuatro pantallas dieron 0 errores JavaScript y 0 respuestas first-party fallidas.
- El bundle inicial publicado `/assets/index-BpBZJfyk.js` respondió HTTP 200, mide 382.766 bytes y contiene el identificador visible de compilación. La verificación pública confirma el artefacto servido; el ID/estado detallado del Deployment en Vercel no se consultó porque el CLI estaba logged out.
- Capturas de producción y checksums: [`screenshots/production-verification/`](screenshots/production-verification/); portal, formulario Quipu, formulario QuipuFac e ingreso interno son imágenes de solo lectura del dominio oficial. Manifiesto: [`screenshots-manifest.json`](screenshots/production-verification/screenshots-manifest.json).
- No se ejecutaron consultas ni escrituras remotas de Supabase; M1–M21 permanecen sin cambios en esta entrega.
