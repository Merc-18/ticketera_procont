# M16b: incorporación, preflight remoto y respaldo — 23/11/2026

Rama `integration/ticketera-client-experience-final`, base de esta fase `f1e0632`.
Sin `db push`, escrituras SQL remotas, cambios de datos, logins, tickets, Vercel, push, merge ni despliegue.

## Resumen

| Punto | Estado |
|---|---|
| M16b incorporada, byte a byte igual al candidato probado | Hecho |
| M16 y M1–M15 intactas | Hecho |
| Preflight remoto de solo lectura | Hecho |
| **Respaldo lógico de producción** | **FALLÓ (Docker no disponible). Activación detenida.** |
| Restauración local de prueba | No realizada (no hay respaldo) |

## 1. Migraciones

| Archivo | SHA-256 |
|---|---|
| `20261123000100_client_request_data_security.sql` (M16, Codex 1) | `ecec0b9a9fe5b878f542725f3015d71a7aae48845ceb00e3982d9c3186f3c102`, sin cambios desde `b795fb9` |
| `20261123000200_client_legacy_payload_compat.sql` (M16b) | `8adce4bb65462feaa437b356c14e136f4c2b1e9ad33a9eda2ac47f247c5ad036` |

### Identidad del artefacto probado

El archivo `.agent-artifacts/compat/candidate/20261123000200_client_quipu_name_compat.sql` se fijó a las 10:33:03.
Sus copias en `.agent-backups/compat-m16-20261123/` se verificaron con `SHA256SUMS`.

- `result-m16c.json` (10:33:05) aplicó **ese archivo exacto** después de M16.
- La batería de seguridad (10:33:29 y 10:33:33) incorporó su cuerpo byte a byte dentro de M16, según `candidate-folded-into-m16.diff`.

Ambas pruebas se reutilizan. Se cambió el nombre del archivo, no su contenido.
Nota: la cabecera conserva el comentario «CANDIDATE (experiment only…)». Se mantuvo para no alterar el SHA probado.

M16b reemplaza solo `public.submit_client_request` (exclusiva del propietario) y `public.client_submit_request`:

- **Quipu**: `requester_name` es opcional. Si viene, debe ser un string de 1 a 200 caracteres; se descarta y no se guarda,
  tampoco en `original_payload`. El nombre sale siempre de la identidad.
- **QuipuFac**: sin cambios.
- **Subproyecto**: sin la clave `subsystem_id` se acepta NULL, como hoy. La aprobación lo sigue exigiendo.
  Con la clave, se valida pertenencia y actividad, y un `null` explícito se rechaza si el producto lo exige.

## 2. Pruebas

| Prueba | Clase | Resultado | Motivo |
|---|---|---|---|
| Matriz antiguo/nuevo × M15/M16/M16+M16b | PostgreSQL 17 local real | Reutilizada (`result-m1{5,6,6c}.json`) | Mismo SHA de M16b aplicado como archivo separado |
| Batería de seguridad con M16b incorporada en M16 | PostgreSQL 17 local real | Reutilizada: 21/21 y 25/25 | Mismo cuerpo SQL |
| Batería adaptada a 17 migraciones, M16b separada | PostgreSQL 17 local real | **Nueva: limpia 21/21, upgrade 26/26** (`runner-*.txt/json`) | El runner exigía 16 archivos; hubo que adaptarlo |
| Grupo nuevo: rollback de M16b = estado M16 exacto; el commit cambia solo 2 funciones | PostgreSQL 17 local real | PASS | Modela la contingencia «M16 aplicada y M16b falla» |
| Python | Unitarias | 52/52 | Hay 17 archivos en `supabase/migrations` |
| Postchecks M16 y M16b | PostgreSQL 17 local real | Se ejecutan; los indicadores M16b son correctos | Validar el SQL antes de usarlo en remoto |
| Node, UI y build | — | No se repitieron | No hay cambios de frontend |

Cambios del runner: espera 17 migraciones y aplica M16 y luego M16b. Dos aserciones cambian a propósito:
- La suplantación ahora se ignora y no se guarda; los valores no-string, vacíos o de más de 200 caracteres siguen dando 22023.
- Sin la clave `subsystem_id` se acepta NULL; con `subsystem_id: null` explícito se mantiene el rechazo.

Ninguna prueba es remota ni E2E.

## 3. Preflight remoto (solo lectura) — `preflight/`

- Proyecto vinculado `xsxdpaiivklqeudgqoqf` (ticketera-procont), confirmado en `.temp` y en cada respuesta de la CLI.
- `migration-list.txt`: M1–M15 aplicadas; **solo `20261123000100` y `20261123000200` pendientes**. No se ejecutó `db push --dry-run`.
- `migration-integrity.txt`: el SQL registrado por Supabase para M1–M15 coincide 15/15 con los archivos locales
  (comparación sin comentarios, espacios ni `;`).
- `functions-compare.json`: 102/102 funciones `public`/`app_private` idénticas a una instalación local M1–M15
  en cuerpo, resultado, `SECURITY DEFINER`, volatilidad, configuración y EXECUTE para anon/authenticated/service_role.
  Incluye las 11 funciones que reemplaza M16. Reproducible con `supabase/tests/m15_function_fingerprint.py`.
- `catalog-remote.json`: igual al catálogo sembrado en M7.

| Producto | Exige subproyecto | Subproyectos activos |
|---|---|---|
| Quipu | sí | Escritorio |
| Quipu_Fac | sí | Android, Escritorio, Web |
| Quipu_Gestion | sí | Web |
| Negmin | sí | Android, Web |
| Quipu_AI | sí | Web |
| Otros | no | — |
| Soporte tecnico | no | — |

  Vínculos de plataforma: quipu → Quipu, quipufac → Quipu_Fac.
  Los 3 tickets de clientes existentes están pendientes en Quipu/Quipu_Fac **sin subproyecto**. Confirma que el frontend
  publicado depende del comportamiento que M16b conserva.

- `cors-preflight.txt`: `client-login` y `admin-users` responden 204 con
  `Access-Control-Allow-Origin: https://ticketera-procont.vercel.app` y 403 a un origen ajeno.
  Los orígenes vienen del secreto `PROCONT_ALLOWED_ORIGINS`; solo se leyó su nombre. La rama no modifica Edge Functions,
  `config.toml` ni `vercel.json`. Edge: client-login v3 y admin-users v4, ACTIVE.
- `vercel-public.txt`: bundle `index-DpaJF02R.js`, «Versión 202611201618», que coincide con el commit a61450c (20/11 16:17 -05).
  No contiene `client_subprojects` ni `requested_priority`. El ID del deployment y el Instant Rollback no se pudieron verificar:
  no hay CLI de Vercel ni acceso al panel.

## 4. Respaldo lógico — FALLÓ

`supabase db dump --remote=xsxdpaiivklqeudgqoqf -f …/schema.sql` → `DockerRunError: failed to inspect docker image`.
La CLI 3.2.0 ejecuta `pg_dump` dentro de Docker, y Docker Desktop no está activo en este WSL.
El procedimiento del plan anterior nunca se había ejecutado: decir que estaba «verificado» era inexacto.
`.agent-backups/production-pre-m16-20261123/` (700) contiene `BACKUP_FAILED.txt` y un `schema.sql` de 0 bytes (600), que no es un respaldo.
Siguiendo la instrucción, no se improvisó otro método y la preparación de activación queda detenida.

Opciones para desbloquear:
- (a) Iniciar Docker Desktop con integración WSL y repetir los mismos comandos. **Recomendada**: es el procedimiento ya autorizado.
- (b) Autorizar expresamente que el script que genera `db dump --dry-run` se ejecute con el `pg_dump` 17.12 local.
  Usa el rol de login temporal de la CLI; la credencial no se guarda en disco.

Comandos a usar después:
- `db dump -f schema.sql`
- `db dump --data-only --use-copy -f data.sql`
- `db dump --role-only -f roles.sql`
- `chmod 600`, `sha256sum` y restauración en PostgreSQL 17 local desechable, comparando conteos por tabla con el remoto.

## 5. Contingencia: M16 se aplica y M16b falla

Ambos archivos tienen su propio `BEGIN…COMMIT`. Cada uno es atómico por separado; **no hay atomicidad conjunta**.
La CLI registra cada versión en `schema_migrations`.

| Fallo | Estado de la BD | Frontend antiguo (a61450c) | Frontend nuevo | Recuperación |
|---|---|---|---|---|
| M16 falla | M15 intacto (rollback; grupo «Transactional rollback») | Todo OK | Creación FALLA (no desplegar) | Corregir la causa y reintentar. Nada que revertir. |
| M16 OK, M16b falla | **Exactamente M16** (grupo nuevo de rollback de M16b) | Lectura/detalle/logout OK. Creación: **FALLA en todo Quipu** y en QuipuFac con productos que exigen subproyecto y desde plataforma; QuipuFac en Otros/Soporte OK (`result-m16.json`) | **Todo OK** (`result-m16.json`) | 1) Reintentar `db push`: solo queda M16b, y su `CREATE OR REPLACE` es repetible. 2) Si no se corrige en minutos, desplegar el frontend nuevo (requiere autorización). 3) No revertir M16. |
| SQL aplicado sin registro en el historial (corte de red tras el COMMIT) | M16 o M16b aplicadas, `migration list` las muestra pendientes | Según la fila anterior | Según la fila anterior | Ejecutar los postchecks. Si confirman la aplicación: `supabase migration repair --status applied <versión>`. Repetir M16 abortaría en `ADD COLUMN` sin daño. |
| Defecto funcional tras M16+M16b | M16+M16b | OK (matriz m16c) | OK | Corrección hacia delante con una migración nueva. La reversión no está preparada ni probada. Restaurar un respaldo perdería los tickets, sesiones y vínculos posteriores, y **hoy no existe respaldo**. |

Con M16+M16b, el frontend antiguo crea solicitudes Quipu y QuipuFac en todos los productos y entradas (matriz m16c, 7/7 casos).

## 6. Plan de activación actualizado

Sigue `ACTIVATION_PLAN.md` (`.agent-backups/compat-m16-20261123/`), con estos cambios:

1. **Bloqueante**: respaldo lógico real y restauración local verificada.
2. Fase 1 completada salvo el respaldo. Repetir `migration list` y `historical-risk.sql` inmediatamente antes de la Fase 2.
3. Fase 2: `db push` (M16 → M16b), luego `m16-postcheck.sql` y `m16b-postcheck.sql`.
4. Fase 3, despliegue de frontend: independiente. Antes, anotar el deployment actual en el panel de Vercel.
5. Recomendado y pendiente: script de reversión probado localmente.
