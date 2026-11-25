# Handoff — auditoría independiente de cierre QA

**Worktree objetivo:** rama `codex/closure-real-qa-20261125`, commit de código `de640de` (base `ec022c768461aa8b4de143e3db94975853a5d34c`).

## Encargo

Realiza una auditoría independiente, solo lectura, de los cambios de `de640de` contra su padre y del informe `REPORT.md`. Usa un worktree aislado. No edites archivos, no crees commits, no hagas push/merge/deploy y no accedas a Supabase remoto para escribir.

## Cambios bajo revisión

1. `src/App.tsx`: `viewer` ahora puede ver Equipo.
2. `tests/ui/portal-navigation.ui.test.mjs`: expectativas de navegación viewer en desktop/móvil y selector exacto.
3. `tests/ui/qa-fixtures.mjs`: catálogo QA de subproyectos ya no queda vacío; se deriva de `qa-dataset.json`.
4. `tests/ui/qa-integral.ui.test.mjs`: aserción de forma y vínculo sistema/subproyecto, y controles de escritura ocultos para viewer.
5. `scripts/qa-local/verify-viewer-subprojects.mjs`: prueba local loopback de RLS viewer y RPC de subproyectos.

El informe afirma que RLS existente concede lectura interna a viewer y niega escritura de perfil; evidencia local reportada: siete perfiles, 27 proyectos, 27 flujos visibles, `PATCH` de rol HTTP 403, rol conservado; `client_subprojects` respondió un elemento Quipu con `id/system_id/name`. Auth se simula; PostgreSQL 17 local es real. No confundirlo con Supabase alojado.

## Criterios

- Confirma que Equipo/Workload/PortfolioPanel no ofrece acciones de escritura al viewer.
- Comprueba que no se amplía ningún permiso SQL/RLS y que los datos consultados ya son visibles según las policies existentes.
- Revisa si `WorkloadView` o `PortfolioPanel` expone datos personales más allá de la política de lectura y del contrato.
- Revisa que el fixture QA conserve la forma real del catálogo, con sistema padre correcto.
- Verifica que la prueba local rechace destinos no loopback y no imprima tokens.
- Inspecciona el informe para distinguir mock, PostgreSQL local y Supabase/Vercel reales.
- Ejecuta solo pruebas independientes necesarias; no repitas las suites completas ya documentadas salvo que halles contradicción.

## Entrega

Devuelve hallazgos concretos con archivo/línea, severidad, evidencia y recomendación. Clasifica el resultado como APROBADO, APROBADO CON OBSERVACIONES o BLOQUEADO. No modifiques el árbol.

Las limitaciones de infraestructura ya registradas (sin proyecto Supabase QA separado y Vercel CLI logged out) son reales; no intentes publicar ni sustituirlas con producción.

## Resultado recibido y seguimiento (25/11/2026)

Claude concluyó la auditoría en worktree aislado sobre `de640de`: **APROBADO CON OBSERVACIONES**; no halló severidad superior a Baja. Ejecutó `tsc --noEmit`, `node --test tests/ui/qa-integral.ui.test.mjs` (11/11) y validación de checksums (2/2).

Hallazgos y resolución:

1. **Precisión de permisos viewer:** el 403 de `users.role` procede del privilegio de columna, no de RLS. La política `own_profile` permite editar solo el `full_name` propio según `PERMISSIONS_SPEC.md`. El informe se corrigió, y la prueba ahora también intenta editar un proyecto ficticio, verifica que RLS no cambie ninguna fila y vuelve a leer su título.
2. **Reloj/subtítulo:** el reloj se restringió a admin/superadmin y el viewer recibe el subtítulo «Carga de trabajo y portafolios del equipo». Se añadieron aserciones UI.
3. **Subproyectos:** la verificación local consulta `client_subprojects` para cada producto autorizado y valida `system_id`, además de rechazo de sesión inválida. La UI E2E local selecciona productos distintos y verifica que cambiar producto limpie la selección anterior.
4. **Redirecciones:** el fetch de la prueba local utiliza `redirect: 'error'`.

La auditoría completa con evidencia está reflejada en `REPORT.md`; el gateway usa PostgreSQL 17 local real y Auth/proveedor simulados. No se accedió para escritura a Supabase remoto ni a Vercel.
