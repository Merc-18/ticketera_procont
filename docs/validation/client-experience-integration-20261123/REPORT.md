# Integración final — experiencia del cliente y M16

Fecha: 23/11/2026. Ejecutor único: Claude Code.
Repositorio persistente: `.agent-workspaces/claude-integration`.
Rama: `integration/ticketera-client-experience-final`.
Base: `origin/main` = `a61450c93f5180ecd623d945b100424a47a3a5d3` (comprobado tras `git fetch`).

Sin push, merge a main, despliegue ni escrituras remotas. M16 **no aplicada** en Supabase.

## 1. Entregas recuperadas e integradas

| Entrega | Rama | Commits | Verificación |
|---|---|---|---|
| Backend (Codex 1) | `rebuild/ticketera-client-data-security-20261123` | `8fabd88` handoff, `b795fb9` M16 | Worktree limpio; SHA exacto; bundle `92c67ccc…e976` verificado, historia completa |
| Frontend (Codex 2) | `rebuild/ticketera-client-experience-ui-20261123` | `016d724`, `947eeee` | Worktree limpio; SHA exacto; bundle `25a6df82…371b` verificado, historia completa |

Ambas ramas parten de `a61450c`. El frontend se construyó contra el contrato del handoff
(copia de coordinación = versión final del handoff en `b795fb9`), no sobre el commit backend.

Historial (merge `--no-ff`, ambos historiales conservados):

```
091200c test: incluir requires_subproject en fixtures de login Quipu/QuipuFac
c126089 merge: integrar experiencia del cliente (Codex 2, 947eeee)
ed75df9 merge: integrar backend M16 y seguridad de datos de clientes (Codex 1, b795fb9)
a61450c Merge PR #1 (base publicada)
```

Conflictos: solo `report.md` (add/add). Se conservan ambos íntegros como
`REPORT-backend-codex1.md` y `REPORT-frontend-codex2.md` en la raíz (sus enlaces relativos siguen válidos).
Comprobación de unión: cada uno de los 197 archivos cambiados respecto a la base es idéntico
byte a byte a la versión de Codex 1 o de Codex 2 (salvo los dos informes renombrados).
No se reimplementó ningún componente ni migración.

### Única corrección posterior

`tests/client-login.test.mjs` y `tests/quipufac-login.test.mjs`: dos pruebas antiguas
fallaban **también en la rama original de Codex 2** porque `parseSession` exige ahora
`requires_subproject` (campo que `client_products` devuelve desde M13) y sus fixtures lo omitían.
Codex 2 solo ejecutó `client-portal.test.mjs`. Se añadió el campo a los fixtures; sin cambios de producción.

## 2. Matriz Quipu / QuipuFac (PostgreSQL 17.12 local real, M1–M16)

| Caso | Resultado |
|---|---|
| Quipu `Alpha` vs `alpha` (mayúsculas) | Identidades distintas; lista/detalle cruzados → PT404 |
| Quipu mismo username directo/plataforma con subject distinto | Misma cuenta |
| Quipu dos usernames con mismo `provider_id` | Identidades separadas (colisión M13 corregida) |
| Quipu nombre | `verified_name` si existe; si no, username (`requester_name_verified=false`); nombre libre distinto → 22023 |
| QuipuFac mismo RUC, dos sesiones | Comparten todos los tickets; cada uno con su nombre declarado |
| QuipuFac otro RUC | Lista sin esos tickets; detalle → PT404 |
| Quipu vs QuipuFac mismo RUC | Separados en ambos sentidos |
| QuipuFac nombre vacío/espacios/zero-width/>200 | 22023 |
| Forjar `studio_id`, `identity_id`, procedencia | 22023 |
| Logout, token vacío/erróneo/expirado/revocado | PT401 en lista, detalle, crear, subproyectos, adjuntos |
| Propiedad y alcance de identidad | Inmutables (23514) |

## 3. Resultados de la campaña conjunta (sobre el árbol integrado)

| Prueba | Tipo | Resultado | Evidencia |
|---|---|---|---|
| Instalación limpia M1–M16 | PostgreSQL 17.12 local real | **21/21** grupos | `pg-clean.txt/json` |
| Actualización M15→M16 + rollback transaccional + históricos | PostgreSQL 17.12 local real | **25/25** grupos | `pg-upgrade.txt/json` |
| Adaptador frontend integrado contra RPC SQL reales | Local real (sin HTTP/PostgREST) | PASS; hashes de 6 fuentes = árbol integrado | `frontend_bridge` en `pg-*.json` |
| Pruebas Node (adaptador, contratos, login, adjuntos, métricas, tablero…) | Unitarias con dobles | **173/173** | `node-unit.txt` |
| Contrato TypeScript consumidor | `tsc --strict` | PASS | `contract-types.txt` |
| Pruebas Python (preparación/activación) | Unitarias | **52/52** | `python-unit.txt` |
| TypeScript + Vite build | Build de producción | PASS | `build.txt` |
| Navegación, cuatro roles, adjuntos | Chromium, servicios simulados | **31/31** | `ui-navigation.txt` |
| Suite UX completa sobre build de producción | Chromium, HTTP local simulado | **36/36**, 133 capturas | `ui-ux-production.txt`, `screenshots-sha256.txt` |
| Presupuesto JS portal/cliente | Chromium | 452.982 bytes (PASS < 450 KiB) | `browser-bundle.json` |

Clasificación: las pruebas PostgreSQL son **locales reales** (Auth/Storage como stubs SQL).
Las pruebas UI usan **fixtures/servicios simulados**. **Ninguna es E2E de producción.**
No hubo HTTP a Supabase, login con proveedores ni creación de tickets reales.

Cubre: aislamiento Quipu, visibilidad QuipuFac, separación de proveedores, nombre del solicitante,
prioridad y persistencia, subproyectos y pertenencia, Mis tickets (paginación 106 tickets en SQL,
137 en UI), detalle propio/ajeno, logout, bandeja interna y modal de validación.

## 4. Prioridad y subproyectos

- `requested_priority`: `low/medium/high/urgent`, default `medium` en nuevas; NULL en históricas (sin backfill);
  inmutable. Independiente de `urgent_requested` (8 combinaciones probadas) y de `projects.priority`
  (aprobación `high` → proyecto `low` verificada).
- UI: selector Bajo/Medio/Alto/Urgente (Medio inicial). RequestInbox y RequestValidationModal muestran
  "Prioridad solicitada por el cliente" separada de "Prioridad definitiva asignada por el personal".
- `catalog_systems` = producto, `catalog_subsystems` = subproyecto, `projects` = tablero; sin mezcla.
  `client_subprojects` valida sesión y producto autorizado; creación revalida pertenencia/actividad;
  `requested_subsystem_id` conserva la selección original tras la clasificación interna.
- Observación: el trigger de M16 asigna `medium` también a solicitudes internas nuevas
  (`submit_request`), no solo a las de cliente. Comportamiento de Codex 1; no se modificó.

## 5. M16 y preflight de Supabase (solo lectura)

Archivo: `supabase/migrations/20261123000100_client_request_data_security.sql`,
SHA-256 `ecec0b9a9fe5b878f542725f3015d71a7aae48845ceb00e3982d9c3186f3c102`, 361 líneas, transaccional
(`BEGIN…COMMIT`), aditiva, sin UPDATE/DELETE de filas de aplicación.

| Comprobación remota (`xsxdpaiivklqeudgqoqf`, producción) | Resultado |
|---|---|
| M1–M15 en historial remoto | Aplicadas (15/15) |
| `db push --dry-run` | Solo `20261123000100_client_request_data_security.sql` |
| PostgreSQL ≥15 (`NULLS NOT DISTINCT`) | 17.12 |
| UNIQUE M13 exacto que M16 elimina | Presente (1) |
| UNIQUE `(id, system_id)` para la FK compuesta | Presente (1) |
| Columnas/funciones/triggers M16 ya existentes | 0 (sin aplicación parcial) |
| Subsistemas incoherentes con su sistema | 0 |
| **Backups físicos / PITR** | **Lista vacía; PITR desactivado** |

Riesgo de históricos (agregados, sin datos personales): 4 solicitudes, 3 vinculadas a clientes
(1 Quipu, 2 QuipuFac), 1 empresa, identidades Quipu solo `username` (2), QuipuFac (1).
Identidades `provider_id`: **0**. Usernames con varias identidades: **0**. Variantes de mayúsculas: **0**.
Vínculos que M16 ocultaría: **0**. Sesiones activas o códigos pendientes afectados: **0**.

## 6. Históricos que requieren revisión administrativa

**Ninguno en el remoto a 23/11/2026.** No hay identidades Quipu ambiguas; M16 no ocultará
ningún ticket existente. Las 4 solicitudes históricas quedarán con `requested_priority`,
`requested_subsystem_id` y `requester_name_source` en NULL (la UI muestra "Sin registro");
se conserva su `urgent_requested` (1 urgente). No se modificó ningún dato.
Si se crean identidades `provider_id` antes de activar, repetir `preflight/historical-risk.sql`.

## 7. Activación (pendiente de autorización)

Propuesta, solo tras autorización expresa:

1. Respaldo lógico previo (lectura): `supabase db dump --remote=<ref>` (esquema y datos) a `.agent-backups/`, con checksum.
2. Repetir `migration list`, `db push --dry-run` y `preflight/historical-risk.sql`; abortar si difiere.
3. `supabase db push --remote=xsxdpaiivklqeudgqoqf --yes` (solo M16).
4. `m16-postcheck.sql` (solo lectura) con los valores esperados anotados.
5. Despliegue inmediato del frontend integrado (requiere autorización propia; ver riesgo de transición).
6. Validación real (sección 8).

Riesgos:

- Sin backup físico/PITR; M16 no tiene migración inversa (reversión = restaurar respaldo lógico o
  migración correctiva).
- **Incompatibilidad de transición:** el frontend publicado (`a61450c`) envía para Quipu un
  `requester_name` escrito a mano. Tras M16, el servidor lo rechaza (22023) salvo coincidencia exacta con
  el nombre verificado o username. **Entre aplicar M16 y desplegar el frontend integrado, la creación de
  tickets Quipu falla.** QuipuFac, listas, detalle, logout y bandeja siguen funcionando (firmas M13 iguales,
  campos solo añadidos).
- A la inversa, el frontend integrado llama a `client_subprojects` (inexistente antes de M16):
  no desplegarlo antes de M16.
- Por tanto M16 y el despliegue del frontend deben autorizarse y ejecutarse como una única ventana corta.

## 8. Validación real posterior (preparada, no ejecutada)

Login Quipu, login QuipuFac, creación autenticada, Mis tickets, detalle, adjuntos, bandeja interna y logout
requieren sesiones reales de proveedor. No se inventaron sesiones ni se pidieron contraseñas.
La creación de tickets reales requiere autorización específica.

## 9. Respaldo

Bundle de integración y recibo con checksum en `.agent-backups/` (fuera del árbol).
Respaldos de Codex 1 y 2 conservados sin cambios.
