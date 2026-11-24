# Resultados de pruebas (M18)

| Suite | Resultado | Registro |
|---|---|---|
| PostgreSQL 17.12 — `m18_colors_checklists_local.py --scenario clean` | **18/18 PASS** | `data/m18-clean.json`, `data/m18-clean-run.txt` |
| PostgreSQL 17.12 — `… --scenario upgrade` | **22/22 PASS** | `data/m18-upgrade.json`, `data/m18-upgrade-run.txt` |
| PostgreSQL 17.12 — `board_operations_local.py` con M1–M18 (afectada: copia plantillas) | **74 PASS** | `data/board-operations-m1-m18.txt` y `.json` |
| PostgreSQL 17.12 — `board_frontend_local.py` con M1–M18 (afectada: checklist del tablero) | **26 PASS** | `data/board-frontend-m1-m18.txt` y `.json` |
| Node — `tests/boards-dashboard-checklists.test.mjs` (paridad M18 ↔ frontend) | **14/14 PASS** | `data/node-boards-dashboard-checklists.txt` |
| TypeScript `tsc --noEmit` | OK | — |

PostgreSQL 17.12 se obtuvo del repositorio oficial PGDG (`postgresql-17_17.12-1.pgdg26.04+1`) y se extrajo sin instalar en el directorio temporal de la sesión. Los clústeres son desechables, solo por socket (`listen_addresses=''`) y se detienen y eliminan al terminar.

Las dos suites `board_*` escriben sus JSON en rutas históricas; se ejecutaron sobre una copia desechable del árbol (con las 19 migraciones) y sus resultados se guardaron aquí con nombres nuevos. Ninguna evidencia anterior se sobrescribió.

## Cobertura pedida

**Colores:** los 10 válidos ✔ · los 14 retirados no se autoasignan ✔ · los colores actuales se conservan (upgrade, md5 de preferencias) ✔ · sin duplicados (`23505`) ✔ · concurrencia sin duplicados (reclamaciones y activaciones simultáneas) ✔ · cambiar de color libera el anterior ✔ · con los 10 ocupados, perfil sin color ✔ · la activación del perfil continúa ✔ · los clientes (anon) y los autenticados sin perfil no acceden ✔ · los internos conservan sus permisos ✔.

**Checklist:** plantilla de Analysis en el servidor ✔ · plantilla de Code Review en el servidor ✔ · las 35 anteriores sin cambios ✔ · sin duplicados (idempotencia; 25 tareas tras un cambio de fase) ✔ · las completadas se conservan ✔ · las tarjetas históricas no se modifican ✔ · el cambio de fase funciona ✔ · el checklist sigue editable ✔.

**Migraciones:** instalación limpia M1–M18 ✔ · actualización M17→M18 ✔ · idempotencia ✔ · rollback transaccional ✔ · integridad de históricos ✔ · RLS y permisos ✔ · M1–M17 sin cambios (sus bytes comparados con `485e449`) ✔.

## No repetido (sigue válido)

Las 197 pruebas Node y las suites de interfaz de `30d00e3`: el frontend solo cambió en un comentario (`card-palette.ts`) y en la prueba de paridad. Los arneses PostgreSQL fijados a un número de migraciones (13, 14, 15, 17, 18) son instantáneas históricas y no se adaptaron; el arnés de M18 repite las comprobaciones de color de M17 que siguen vigentes.
