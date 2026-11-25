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
| Viewer: escritura | PASS | `PATCH` a `users.role` respondió 403; una lectura posterior confirmó que el rol siguió siendo viewer. PostgreSQL local; no se alteró el registro. |
| Subproyectos | PASS | RPC `client_subprojects` en PostgreSQL 17 local devolvió 1 subproyecto Quipu con `id`, `system_id` coincidente y `name`. La apertura de sesión usa el gateway de QA local. |
| Chromium contra PostgreSQL local | PASS | Ingreso viewer, Carga de trabajo, Portafolios en solo lectura, 0 errores JavaScript y 0 respuestas API fallidas. Capturas en `screenshots/`. |
| M20 y flujos integrados | Evidencia previa PASS | La prueba anterior creó y confirmó dos solicitudes ficticias en PostgreSQL local, no remoto; ver el informe QA enlazado arriba. No se repitió. |
| Auth/expiración/logout en Supabase alojado | NO VERIFICADO | No hay proyecto QA separado. En las pruebas locales, Supabase Auth y la validación de proveedores se simulan; las RPC/sesiones de clientes usan PostgreSQL local real. |
| Quipu/QuipuFac con proveedores reales desde QA | NO VERIFICADO | No se hizo login externo en esta etapa. |
| Supabase Storage binario (subir/descargar/eliminar y políticas reales) | NO VERIFICADO | El harness anterior usa stub de Storage. Escribir en Storage de producción está expresamente fuera de autorización. |
| Checklist persistente tras recarga contra QA alojado | NO VERIFICADO | Los tests UI cubren presentación/progreso con fixtures. Una verificación local posterior no pudo ejecutarse porque los servicios persistentes dejaron de escuchar; no se reiniciaron ni se presenta como PASS. |
| Realtime | NO VERIFICADO | No disponible en el gateway local. |
| Preview/Production Vercel del commit de esta rama | NO VERIFICADO | Vercel CLI confirma estado logged out; la rama no se publicó. |

Los seis SKIP de UI corresponden a cuatro pruebas existentes de carga de ambos proveedores por viewport y dos de presupuesto/carga diferida. Permanecen omitidos; no cuentan como PASS.

## Seguridad y alcance de los cambios

- `src/App.tsx`: agrega viewer a `canSeeEquipo`. No agrega pestañas de Usuarios, Papelera o Catálogos para ese rol. `PortfolioPanel` conserva `canManage=false` para viewer.
- Las políticas SQL existentes permiten lectura interna a `viewer` y restringen las escrituras de perfiles/operaciones. La prueba PostgreSQL local confirmó la lectura y el rechazo de escritura indicados arriba.
- `tests/ui/portal-navigation.ui.test.mjs`: actualiza las expectativas viewer para escritorio/móvil y usa una consulta de nombre exacta para evitar ambigüedad con la entrada de Dashboard.
- `tests/ui/qa-fixtures.mjs` y `tests/ui/qa-integral.ui.test.mjs`: incluyen y verifican los ocho subproyectos del snapshot.
- `scripts/qa-local/verify-viewer-subprojects.mjs`: verificación reproducible limitada a loopback, exige `production:false` y PostgreSQL local; no permite apuntar a producción.
- No se modificaron SQL, RPC, RLS, Edge Functions, modelos de datos ni contratos API.

## Capturas

- [Equipo — viewer, carga de trabajo](screenshots/viewer-team-readonly.png)
- [Equipo — viewer, portafolios en solo lectura](screenshots/viewer-portfolios-readonly.png)

Ambas capturas son de Chromium local con datos QA ficticios. No son capturas de Vercel.

## Archivos cambiados

Aplicación/test:

- `src/App.tsx`
- `tests/ui/portal-navigation.ui.test.mjs`
- `tests/ui/qa-fixtures.mjs`
- `tests/ui/qa-integral.ui.test.mjs`
- `scripts/qa-local/verify-viewer-subprojects.mjs`

Evidencia:

- `docs/validation/closure-integral-20261125/REPORT.md`
- `docs/validation/closure-integral-20261125/HANDOFF_CLAUDE_READ_ONLY.md`
- `docs/validation/closure-integral-20261125/screenshots/*`
- `docs/validation/closure-integral-20261125/SHA256SUMS`

## Bloqueos restantes

1. Se necesita un proyecto Supabase QA separado de `xsxdpaiivklqeudgqoqf`, con Auth, Storage y migraciones M1–M21. La organización actual no muestra ese proyecto.
2. Vercel CLI necesita una sesión autenticada y un proyecto/deployment QA con protección configurada. Esta ejecución no tiene una sesión Vercel disponible.
3. Solo cuando exista QA podrán completarse los logins de prueba, expiración/logout contra Auth alojado, Storage binario real, E2E Chromium contra backend real, persistencia de checklist con reload y credenciales ficticias utilizables desde el Preview.
4. La auditoría solo lectura de Claude sigue pendiente y debe hacerse en un worktree aislado desde el commit de esta rama.

## Estado de aceptación

**PARCIAL — cambios locales probados, publicación y QA alojado bloqueados por infraestructura.** No se declara cerrada la etapa ni listo el deployment.
