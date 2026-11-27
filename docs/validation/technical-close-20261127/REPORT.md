# Cierre técnico documental — Ticketera Procont — 27/11/2026

Referencia de código: **406a46351411fdf845a73a811cb798b7964617b1**. Proyecto Supabase: **xsxdpaiivklqeudgqoqf**. Sitio: https://ticketera-procont.vercel.app.

El estado de código y base queda documentado, con **22 migraciones confirmadas** y **17 validaciones adicionales PASS externas de ChatGPT**. No se ejecutaron nuevas pruebas de producto ni escrituras de datos en producción. **Dictamen final: APROBADO CON OBSERVACIONES.** Se autoriza expresamente el push documental y su despliegue automático Vercel. El checkout original conserva una observación de permisos: su `.git` es de solo lectura y conserva material local anterior. Se entregan commits y una copia independiente limpia, además del archivo recuperable de ese material.

## Referencia y comprobaciones de este cierre

- Base funcional de GitHub `main` antes de la publicación documental: `406a463`; su padre es `b69afbd81059108302000966ab82d3149b0797a4` (refresh/filtros de catálogo).
- Check GitHub Vercel **success**, [deployment](https://vercel.com/merc-18s-projects/ticketera-procont/EncbzJ62P6ZyWXLkN5wjMJQtBQuv). Este estado corresponde a la base funcional anterior. La publicación documental y su despliegue automático se autorizan en la continuación; el SHA final y el check se comprueban al finalizar, sin volver a ejecutar pruebas de navegación.
- Supabase MCP `list_migrations` devuelve **22 filas**. Se contrastaron versión/nombre con los 22 archivos de la referencia Git. [Manifiesto](supabase-migrations.json). La última es `20261126231933_realtime_requests_postgres_changes`; este cierre no la aplicó.
- Únicas comprobaciones nuevas: historial de migraciones de solo lectura; metadatos GitHub; integridad/procedencia de documentación; inventario de ramas/worktrees; igualdad de datos ficticios locales. Sin SQL de negocio, Auth Admin, Storage, Edge Functions, cambios de secretos o permisos.

## Evidencia externa de ChatGPT — 17 PASS, 0 FAIL

**Fuente:** información suministrada explícitamente por el usuario en esta conversación el 27/11/2026. **Ejecutor:** ChatGPT mediante Supabase MCP, no Codex. **Entorno:** PostgreSQL real del proyecto de producción. **Método:** RPC reales con contextos SQL `anon` y `authenticated`, identidades/sesiones sintéticas, RUC `00000000000` previamente comprobado inexistente, dos solicitudes QA existentes, transacción BEGIN/ROLLBACK. No hubo autenticación contra proveedores ni persistencia de los datos generados. [Registro estructurado](chatgpt-production-validation.json).

| # | Caso exacto reportado | Resultado |
|---|---|---|
| 1 | `same_RUC_two_Quipu_users_and_QuipuFac_separated` | PASS |
| 2 | `QuipuFac_company_identity_shared_across_sessions` | PASS |
| 3 | `Quipu_lists_only_own_ticket` | PASS |
| 4 | `Quipu_other_user_same_RUC_empty_list` | PASS |
| 5 | `QuipuFac_lists_company_ticket_only` | PASS |
| 6 | `own_detail_allowed` | PASS |
| 7 | `Quipu_other_user_detail_denied` | PASS |
| 8 | `QuipuFac_cannot_read_Quipu_ticket` | PASS |
| 9 | `Quipu_cannot_read_QuipuFac_ticket` | PASS |
| 10 | `foreign_attachment_reservation_denied` | PASS |
| 11 | `unknown_session_denied` | PASS |
| 12 | `expired_session_denied` | PASS |
| 13 | `revoked_session_denied` | PASS |
| 14 | `logout_does_not_revoke_other_identity` | PASS |
| 15 | `anonymous_internal_ticket_denied` | PASS |
| 16 | `authenticated_without_active_profile_denied` | PASS |
| 17 | `unprofiled_account_management_denied` | PASS |

Estos casos prueban reglas de backend alojado y autorización. No son E2E y no fueron repetidos para el cierre.

### Conservación después del ROLLBACK, reportada por ChatGPT

- 30 tickets QA; 35 solicitudes QA, cinco pendientes.
- Dos tickets reales; seis solicitudes reales.
- 27 sesiones de cliente y cinco vínculos cliente-solicitud preexistentes conservados.
- Cero empresas sintéticas, identidades sintéticas o cuentas Auth QA residuales.
- 22 migraciones; RLS habilitado en 19 tablas públicas.
- Realtime configurado en `projects`, `project_flows`, `notifications`, `requests`.

Estos conteos no son un nuevo inventario de Codex. No se regeneraron ni limpiaron datos de producción. La comprobación de publicación Realtime no equivale a recepción de eventos por un cliente.

## Evidencia anterior incorporada con su alcance original

La [auditoría Codex del 26/11](codex-auth-audit-20261126/REPORT.md) acreditó Auth real, Storage binario aislado con hash y broadcast Realtime, y eliminó sus cuatro cuentas, objeto y bucket temporales. Las identidades no obtuvieron perfiles activos: service_role recibió 403/42501 en `public.users`; no se probaron roles de aplicación. Sus resultados originales, incluida una observación de borrado inmediato resuelta después y una expectativa HTTP incorrecta corregida, se conservan sin convertirlos en una suite distinta.

La evidencia SQL externa del 27/11 aporta aislamiento/sesiones y rechazos de perfiles; no transforma las cuatro identidades sin perfil en pruebas de roles activos. Las evidencias locales de [QA integral](../qa-integral-20261125/REPORT.md) y [cierre local](../closure-integral-20261125/REPORT.md) mantienen sus distinciones de PostgreSQL real y Auth/Storage simulados.

## Validaciones pendientes — NO VERIFICADAS

1. Login real contra Quipu/QuipuFac y verificación de contratos/URLs oficiales de producción de los proveedores.
2. UI alojada con los cuatro roles activos, acciones permitidas/prohibidas y sesiones reales de personal.
3. Aprobación M20 y operaciones de fase/checklist/comentarios/cierre/reapertura desde UI en el entorno alojado.
4. Transferencia binaria mediante reservas de Ticketera, acceso de dueño/ajeno, vínculo de actor y límites combinados de cantidad/tamaño.
5. Entrega E2E de eventos PostgreSQL Realtime y actualización real de Dashboard por cambios de `requests`.
6. Invitaciones/callback/SMTP y configuración pública de Auth; protecciones/plan de Vercel y otras decisiones operativas sin evidencia nueva.
7. Seis pruebas UI históricas omitidas, limitaciones Windows/WSL y escenarios de dispositivos/sesiones no ejecutados.

No declarar estas validaciones aprobadas por existir código, publicación SQL, un mock, el check Vercel o un resultado de otra clase.

## Git, ramas y material local

La copia de trabajo original está en `integration/board-operations@2858a02`, con main local antiguo `16064c5`. `git fetch` fue rechazado con `cannot open '.git/FETCH_HEAD': Read-only file system`. No se cambiaron permisos ni se eludió la protección de sus metadatos. Se creó una **copia independiente** bajo `.agent-artifacts/technical-close-20261127/checkout`, se descargó GitHub allí y se inició su main en `406a463`.

Se revisaron 19 directorios de trabajo y **34 heads distintos** de sus ramas locales:

- Las ramas de funcionalidad están incorporadas por ascendencia o equivalencia de parches. La única divergencia de patch-id repetida es `c6e79f4`, preparación histórica de Supabase: sus once rutas están presentes en main (cinco blobs iguales, seis evolucionados). Reintroducirla no es necesario y restauraría configuración/documentación antigua.
- `fix/qa-catalog-refresh-20261125@57c7761` es ancestro de main.
- `fix/realtime-requests-publication-20261126@b0b4f7f` tiene parche equivalente a `406a463`; no requiere otro merge.
- No se borraron ramas ni worktrees preexistentes.

El inventario encontró cambios sin commit en `.agent-workspaces/dashboard-team-portfolio-progress-20261124`: **142 rutas**, 115 idénticas a main, una eliminación también presente en main y 26 archivos diferentes/evolucionados, incluidas variantes del dataset QA. Se preservaron íntegramente en el commit local de archivo **0f353decf35b03d310df7900e2906620be8b17f4** (`archive/local-progress-20261127`) y `local-progress-recovery.bundle`. El snapshot parte de `16064c5`; no se mezcló con main ni se publicaron esas versiones antiguas de código/datos. La rama de archivo no representa funcionalidad pendiente de integrar.

De las 26 variantes, las 16 que comprenden código, pruebas y datos coinciden byte por byte con versiones del historial de main; las diez restantes son documentos históricos conservados en el archivo. [Comparación por blobs](snapshot-history-review.json). No se identificó funcionalidad nueva necesaria por integrar.

La copia de cierre registra únicamente documentación y estado; no cambia código funcional, migraciones ni fixtures respecto de `406a463`. Su main integra `94b2329` y la actualización selectiva de CLAUDE.md para publicación. No se fusionan la rama antigua ni el archivo histórico. El dataset `tests/ui/qa-dataset.json` de main se conserva byte por byte; la variante histórica también queda recuperable en el archivo.

**Observación administrativa conservada:** el checkout original y el worktree histórico mantienen su estado físico protegido; los untracked de dependencias, respaldos y capturas se conservaron. No se afirma que todas las carpetas originales estén limpias. La restricción inicial de publicación quedó superada por la autorización expresa del usuario: publicar exclusivamente el cierre documental mediante push normal a main y verificar el despliegue automático Vercel. La limitación de permisos original no impide publicar desde la copia independiente y no se intenta forzar su sincronización.

Inventarios: [ramas completas](all-branches-review.json), [workspaces](workspaces-inventory.json), [material no registrado](uncommitted-material-review.json), [preparación histórica](historical-preparation-review.json). Los inventarios describen el estado previo al archivo, no una limpieza de los directorios originales.

## Entrega y comprobaciones documentales

Se recuperó únicamente la actualización de CLAUDE.md de Claude, sin fusionar `integration/board-operations`; se reconciliaron sus cortes históricos con el estado vigente. Se actualizaron AGENTS.md, README, PROJECT_STATUS y las cabeceras de TESTING_SPEC, DATABASE_SPEC y TRACEABILITY_MATRIX. Los cortes históricos se conservan identificados; el registro externo contiene los 17 nombres exactos y su metodología. No se ejecutaron las suites aprobadas.

El manifiesto `SHA256SUMS` cubre la evidencia de este directorio. La verificación de cierre comprueba solo JSON, enlaces nuevos, correspondencia de 22 migraciones, árbol funcional idéntico a `406a463`, dataset intacto y Git limpio en la copia independiente. Los SHA finales de commits, bundle y evidencia de estado se entregan en el recibo local `CLOSURE_RECEIPT.json`, fuera del commit para evitar referencias circulares.

## Publicación final autorizada

**APROBADO CON OBSERVACIONES.** Se conservan todas las validaciones pendientes y la limitación de permisos de la carpeta original. [Nota de publicación y procedencia selectiva de CLAUDE.md](PUBLICATION.md). La verificación GitHub/Vercel se realiza sobre el SHA final, sin nuevos tests y sin modificar código funcional, Supabase ni datos.
