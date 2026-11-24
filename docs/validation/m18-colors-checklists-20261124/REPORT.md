# M18 — paleta de 10 colores y plantillas de checklist en servidor

| Dato | Valor |
|---|---|
| Fecha | 24/11/2026 |
| Base recuperada | `30d00e3fa41c872e8a62f8f98e2a4c107ec4a045` en `local/boards-dashboard-checklists-20261124` (sobre `main` `485e449`); bundle anterior verificado (`ae48665e…`, `git bundle verify` OK) |
| Migración | `20261124000100_limit_card_colors_and_seed_missing_checklists.sql` · SHA-256 `439c0e2980c7bb0dbcd2a52bead94783d0fde5bf24e78e331107ce891f50bdd8` |
| Producción | **Sin cambios.** M18 no está aplicada; sin push, merge ni despliegue. No se repitieron consultas remotas (se usa el preflight del 24/11: 2 perfiles activos con `azul` y `pizarra`; 35 plantillas sin Analysis ni Code Review) |

## Resultado

1. **Corrección A — paleta de 10 en el servidor.** La autoasignación solo entrega los 10 colores aprobados y libres. Sin capacidad, el perfil queda sin color en lugar de fallar su activación. Los colores retirados asignados se conservan y se pueden cambiar. La unicidad y la concurrencia siguen garantizadas por PostgreSQL. Detalle: [COLOR_ASSIGNMENT_REPORT.md](COLOR_ASSIGNMENT_REPORT.md).
2. **Corrección B — plantillas de Analysis y Code Review.** 8 filas en `checklist_templates`, con el mismo texto que el frontend; el mecanismo existente (`add_flows`) las copia a tarjetas nuevas. Los históricos no se tocan. Detalle: [CHECKLIST_TEMPLATES_REPORT.md](CHECKLIST_TEMPLATES_REPORT.md).
3. **Migración**: transaccional, idempotente y aditiva; M1–M17 intactas. Detalle: [MIGRATION_REPORT.md](MIGRATION_REPORT.md).
4. **Seguridad**: sin cambios en RLS, permisos, roles ni autenticación. Detalle: [SECURITY_REPORT.md](SECURITY_REPORT.md).
5. **Pruebas**: PostgreSQL 17 clean 18/18 y upgrade 22/22; suites afectadas `board_operations` 74 y `board_frontend` 26; paridad Node 14/14. Detalle: [TEST_RESULTS.md](TEST_RESULTS.md).

## Archivos

| Archivo | Cambio |
|---|---|
| `supabase/migrations/20261124000100_limit_card_colors_and_seed_missing_checklists.sql` | **Nuevo** (M18) |
| `supabase/tests/m18_colors_checklists_local.py` | **Nuevo** arnés PostgreSQL 17 (clean/upgrade) |
| `tests/boards-dashboard-checklists.test.mjs` | La prueba de la propuesta pasa a dos pruebas de paridad con M18 (paleta y plantillas) |
| `src/lib/card-palette.ts` | Solo un comentario (ahora remite a M18) |
| `docs/specs/DATABASE_SPEC.md`, `API_CONTRACTS.md`, `SECURITY_SPEC.md`, `PERMISSIONS_SPEC.md`, `TESTING_SPEC.md`, `docs/PROJECT_STATUS.md` | Secciones M18 añadidas (sin reescribir las anteriores) |
| `docs/specs/DECISION_LOG.md` | D-055 |
| `docs/validation/m18-colors-checklists-20261124/` | Este informe y sus evidencias |

Se conservan intactos `LONG_TERM_PROJECT_MODEL.md`, D-054 y la propuesta anterior (`boards-dashboard-checklists-20261124/proposed-migration/`), que queda como antecedente de M18.

## Pendientes de producción (requieren autorización)

1. Aplicar **solo** M18 en `xsxdpaiivklqeudgqoqf`: `db push --remote --dry-run` (debe listar únicamente `20261124000100`), aplicación y verificación de solo lectura (19 migraciones, 10 ofrecidos, `azul`/`pizarra` intactos, 43 plantillas, permisos).
2. Publicar el frontend (`30d00e3` + este commit) con push normal de `main` y comprobar el despliegue de Vercel. El frontend funciona con o sin M18, pero sin M18 la autoasignación puede entregar colores retirados.
3. Fuera de alcance por ahora: jerarquía de proyectos largos (D-054) y el límite de 1.000 solicitudes de los KPI del Dashboard.
