# M18 — informe de migración

| Dato | Valor |
|---|---|
| Archivo | `supabase/migrations/20261124000100_limit_card_colors_and_seed_missing_checklists.sql` |
| SHA-256 | `439c0e2980c7bb0dbcd2a52bead94783d0fde5bf24e78e331107ce891f50bdd8` |
| Posición | 19.ª migración, después de M17 (`20261123000300`); timestamp único (lo verifica el arnés) |
| Requisitos | Comprueba al inicio que existen el catálogo y las preferencias de M17, `ensure_internal_card_color(uuid,text)`, `checklist_templates` y las fases M12 `analysis` y `code_review`; si falta algo, aborta con `55000` |
| Transacción | `BEGIN … COMMIT`; ROLLBACK probado (la base queda idéntica tabla por tabla) |
| Idempotencia | `ADD COLUMN IF NOT EXISTS`; `UPDATE … WHERE offered IS DISTINCT FROM …`; `CREATE OR REPLACE`; `INSERT … WHERE NOT EXISTS`. Una segunda ejecución no cambia ninguna tabla (comparación md5 de todas las tablas) |
| Comprobaciones internas | 24 colores y exactamente 10 ofrecidos; exactamente 8 plantillas Analysis/Code Review. Si no se cumple, aborta con `23514` |

## Qué cambia

1. `app_private.internal_card_color_catalog.offered` (nueva columna, `NOT NULL DEFAULT false`); 10 filas en `true`.
2. `app_private.ensure_internal_card_color(uuid,text)`: reemplazo con la misma firma, la misma seguridad y la misma revocación.
3. `public.internal_card_colors()`: reemplazo con la misma firma; añade `capacity` y `offered`. Se repiten explícitamente REVOKE y GRANT a `authenticated`.
4. `public.checklist_templates`: 8 filas nuevas (`development`/`analysis` 0–3, `development`/`code_review` 0–3).

## Qué no cambia

M1–M17 (bytes idénticos a `485e449`); tablas y columnas existentes; `internal_card_preferences` (datos, RLS y permisos); `set_my_internal_card_color`; el trigger de perfil; `add_flows`; `checklist_items`; contratos de login; `requested_priority`; `urgent_requested`; prioridad administrativa; identidades; sesiones; regla PROCONT; permisos de tickets.

## Escenarios en PostgreSQL 17.12 (desechable, solo socket, stubs de Auth y Storage)

| Escenario | Resultado | Evidencia |
|---|---|---|
| Instalación limpia M1–M17 → ROLLBACK de M18 → M18 → segunda M18 | **18/18 PASS** | `data/m18-clean.json`, `data/m18-clean-run.txt` |
| Actualización M17 con historia → ROLLBACK → M18 → segunda M18 | **22/22 PASS** | `data/m18-upgrade.json`, `data/m18-upgrade-run.txt` |
| `board_operations_local.py` con M1–M18 | 74 PASS | `data/board-operations-m1-m18.*` |
| `board_frontend_local.py` con M1–M18 | 26 PASS | `data/board-frontend-m1-m18.*` |

## Aplicación remota (pendiente de autorización)

1. `supabase db push --remote --dry-run` en `xsxdpaiivklqeudgqoqf`: debe listar **solo** `20261124000100`.
2. `db push --remote --yes`.
3. Verificación de solo lectura: 19 entradas en el historial; 10 colores con `offered`; asignaciones actuales sin cambios (azul y pizarra, verificadas el 24/11); 8 plantillas nuevas; las otras 35 intactas; permisos de las dos funciones.
