# Recuperación de la integración del tablero de Claude

**Estado vigente, 19/11/2026:** M12 aplicada y verificada, historial 12/12; permisos,
lectura real de un ticket y rechazo de las cuatro RPC sin actor comprobados sin modificar
datos. La integración en main está autorizada; los apartados de rescate conservan el
registro histórico. Evidencia vigente: [diagnóstico y cierre remoto](validation/board-m12-rpc-smoke-diagnosis.json).

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
| Activación remota M12 | Reportada inicialmente sin recibo recuperable | Aplicada; historial 12/12 y verificación de solo lectura completada |

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

## Activación completada el 19/11/2026

El dry-run autenticado quedó confirmado en `83b148e`. Posteriormente se aplicó solo M12,
con capturas privadas anteriores y posteriores. El historial pasó de 11/11 a 12/12;
las once entradas anteriores y los hashes de datos de negocio permanecieron intactos.

La CLI detuvo `rpc_smoke` porque faltaba `--yes`, antes de ejecutar ese SQL. La corrección
`53f14a6` conserva la evidencia previa y permite continuar solo las verificaciones,
sin reenviar M12. La lectura real del tablero, las cuatro denegaciones sin actor y los
permisos se comprobaron en una transacción READ ONLY usando la sesión existente,
sin pedir contraseñas. Ver [resultado completo](validation/board-m12-rpc-smoke-diagnosis.json).

El cierre local conserva la recuperación de Claude y el backend de Codex, y actualiza
la documentación de activación. No vuelve a ejecutar migraciones ni las suites aprobadas.

## Transporte local de los commits recuperados

Se exporta también `.supabase-local/exports/board-integration-recovery.bundle` del proyecto
original. La copia Git es la fuente más reciente, incluidos el dry-run y la verificación de M12.
Para importar su referencia desde Ubuntu normal, sin checkout ni merge:

```bash
git -C /home/procont/projects/ticketera-procont fetch /home/procont/projects/ticketera-procont/.supabase-local/workspaces/board-integration-recovery integration/board-operations-recovery:refs/heads/integration/board-operations-recovered
```

Esto conserva los cambios sin commit del árbol original; no hay que descartarlos para traer
la referencia. La integración en main cuenta con autorización expresa del 19/11/2026;
no incluye push ni despliegue.
