# Recuperación de la integración del tablero de Claude

Base encontrada: `integration/board-operations@1ba71b2`; `main@94bd8fd`.
El backend ya estaba incorporado: no se volvió a importar, fusionar ni implementar.
Claude no dejó commits frontend: sus cambios estaban en el árbol y dos eliminaciones
preparadas en el índice (`ActivitySection.tsx`, `useActivityLog.ts`), sustituidas por el
historial autoritativo. Se conservan en el commit anterior y en el respaldo, sin recuperarlas
como caminos activos que vuelvan a escribir auditoría desde el navegador.

## Rescate verificable

- Respaldo privado `.supabase-local/recovery/claude-board-20261118T231348Z/` del proyecto original:
  staged.patch, unstaged.patch, working-files.tar, commits.bundle y manifest.json.
- 35 archivos presentes verificados por SHA-256 (incluidos ocho nuevos) y las dos eliminaciones
  verificadas. El bundle de commits también se verificó. El archivo `1` fue excluido y no se tocó.
- Se restauró ese estado exacto en `.supabase-local/workspaces/board-integration-recovery/`,
  rama `integration/board-operations-recovery`. Commit de preservación **`17c8c19`**.
- El árbol original de Claude queda intacto. Se usa la copia aislada porque `.git` del árbol
  original está restringido. No se descartaron cambios ni borraron worktrees.

## Comparación acotada y resultado

| Requisito | Estado recuperado | Estado final |
|---|---|---|
| Flujo único y ocho etapas; Administrative/Dual solo históricos | Terminado | Terminado, conservado |
| Cuatro RPC de operaciones conectadas | Parcial en reintentos | Terminado: clave de Done estable y errores aislados por llamada |
| Cierre únicamente por Done | Terminado | Terminado, conservado |
| Confirmación de pendientes y actualización de huella | Terminado | Terminado: se conserva el reinicio de aceptación al cambiar la huella |
| Reapertura con motivo obligatorio | Terminado | Terminado, conservado |
| Progreso de fase separado del checklist | Terminado | Terminado, conservado |
| Developers reasignan; bloqueo restringe la reasignación a admins | Terminado | Terminado, conservado |
| Bloqueo con motivo; sin movimientos/finalización bloqueados | Terminado | Terminado, conservado |
| Historial inmutable del servidor; sin logActivity cliente | Terminado | Terminado, conservado |
| Carga de trabajo sin métricas SLA antiguas | Terminado | Terminado, conservado |
| Evidencias privadas y compresión existente | Parcial en entregas parciales | Terminado: reintenta pendientes y reconoce respuestas perdidas verificables |
| Tickets históricos, seguimiento público y estadísticas | Terminado | Terminado, conservado |
| Build | Ya reportado por Claude | Verificado de nuevo sobre la recuperación y las correcciones |
| Dry-run remoto actual M12 | Reportado por Claude, sin recibo recuperable | **Pendiente: autenticación de la terminal local** |

## Correcciones concretas, sin reconstrucción

1. Kanban conserva una UUID para toda la confirmación de Done y sus reintentos, igual que
   el detalle ya implementado. No se crea otra acción cuando la primera respuesta se pierde.
2. El adaptador reutiliza las RPC existentes, pero captura cada error dentro de su llamada:
   una lectura simultánea no sustituye el motivo del rechazo de una mutación.
3. Evidencias conserva las claves entregadas; reintentar un lote parcial no vuelve a reservar
   ni subir sus archivos ya confirmados. Ante respuesta perdida verifica el objeto exacto,
   tamaño y MIME por Storage autorizado, sin upsert ni deducir éxito de un nombre parecido.
4. Documentos sin MIME del navegador reutilizan la inferencia por extensión que ya existía
   en el adaptador de adjuntos. Se envía el File original; sus bytes no se alteran.

Sin modificaciones SQL ni nuevas RPC/migraciones. M12 conserva el SHA-256 de `1ba71b2`.
Los cambios frontend de Claude permanecen en el primer commit de preservación para poder
compararlos con las correcciones posteriores.

## Verificación específica

- Build TypeScript/React/Vite correcto, antes y después de las correcciones.
- 9 pruebas del adaptador/guardas del tablero reejecutadas por modificar su integración
  (fases, Done, reapertura, bloqueos, reasignación, operaciones masivas y ausencia de escrituras
  directas/auditoría cliente). 6 pruebas nuevas de recuperación: **15/15**.
- 4 pruebas nuevas del comando de dry-run: no puede aplicar, incluir otro plan, roles o seeds.
- Se reutilizan las evidencias de Claude: 26 pruebas PostgreSQL del frontend y la revisión
  visual previa. No se repitieron ni esas 26 ni las 74 comprobaciones backend de Codex;
  el SQL no cambió. Tampoco se repitieron las otras suites anteriores.
- La evidencia de revisión actual está en [board-recovery-local.json](validation/board-recovery-local.json).

## Único bloqueo restante: dry-run autenticado

Se verificaron enlace, nombre y ref locales. El intento nativo con URL del proyecto fijado,
TLS y `--dry-run --skip-vault` terminó en autenticación: esta sesión no tiene contraseña DB.
No se usó Management API para crear roles temporales ni se repitió un inventario.
No se afirma que el plan remoto siga igual por el reporte anterior de Claude.
Ver [estado actual](validation/board-recovery-dry-run.json).

Después del commit final, ejecutar en **terminal Ubuntu normal** (no pegar secretos en el chat):

```bash
python3 /home/procont/projects/ticketera-procont/.supabase-local/workspaces/board-integration-recovery/scripts/check_board_m12_dry_run.py --commit-evidence
```

Pide la contraseña de forma oculta, no la guarda ni la incorpora a argv. Solo acepta CLI 3.2.0,
proyecto ticketera-procont/ref xsxdpaiivklqeudgqoqf, las once migraciones originales sin cambios
y un plan con únicamente `20261118000800_board_operations.sql`, sin seeds/roles/vault.
Si confirma el plan, actualiza el recibo y crea un commit local que contiene solo esa evidencia.
No tiene modo de aplicación, merge o push. Si falla, se detiene sin reintentos automáticos.

El frontend está preparado para revisión/integración, pero **NO APTO para autorizar la
aplicación todavía**: falta ese dry-run actual y la autorización expresa de activación.
No se fusiona main ni se aplica M12 desde esta tarea. La coordinación frontend/backend de
[board-ui.md](board-ui.md) se conserva para la activación posterior.

## Transporte local de los commits recuperados

Se exporta también `.supabase-local/exports/board-integration-recovery.bundle` del proyecto
original. La copia Git es la fuente más reciente, incluido el eventual commit del dry-run.
Para importar su referencia desde Ubuntu normal, sin checkout ni merge:

```bash
git -C /home/procont/projects/ticketera-procont fetch /home/procont/projects/ticketera-procont/.supabase-local/workspaces/board-integration-recovery integration/board-operations-recovery:refs/heads/integration/board-operations-recovered
```

Esto conserva los cambios sin commit del árbol original; no hay que descartarlos para traer
la referencia. La integración en main continúa requiriendo autorización separada.
