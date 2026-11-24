# Plantillas de checklist en el servidor (M18)

## Catálogo real de fases

`app_private.valid_phase` (M12): Development = `backlog, analysis, design, dev, code_review, testing, deploy, done`; Administrative = `backlog, ready_to_start, discovery, design, build, uat_validation, deployed`. No se crearon fases. «QA» y «Validación» corresponden a Testing.

## Mecanismo existente (sin cambios)

`app_private.add_flows`, usado por `create_internal_project` (versión M17) y `approve_request` (versión M12), copia a cada flujo nuevo todas las filas de `checklist_templates` de su tipo, **solo si el flujo aún no tiene tareas**. Por tanto, basta con añadir filas de referencia: no hace falta una arquitectura paralela ni tocar funciones.

## Filas añadidas (texto idéntico a `src/lib/checklist-defaults.ts`; lo verifican una prueba unitaria y el arnés PostgreSQL)

| Fase | # | Tarea |
|---|---|---|
| analysis | 0 | Revisar el requerimiento y aclarar dudas con el solicitante |
| analysis | 1 | Identificar dependencias y sistemas afectados |
| analysis | 2 | Definir criterios de aceptación |
| analysis | 3 | Documentar riesgos y supuestos |
| code_review | 0 | Revisar el diff y la lógica implementada |
| code_review | 1 | Validar estándares, seguridad y manejo de errores |
| code_review | 2 | Resolver las observaciones de la revisión |
| code_review | 3 | Registrar la aprobación del revisor |

Las otras 35 plantillas (6 fases de Development y las 7 de Administrative) no cambian: se comprobó con md5 antes y después. Total: 43.

## Comportamiento resultante

| Caso | Resultado |
|---|---|
| Tarjeta nueva | Nace con las 8 fases cubiertas: 25 tareas sin completar (3+4+3+3+4+3+3+2) |
| Cambio de fase | `operate_board_ticket` no toca el checklist; el frontend (30d00e3) solo siembra si la fase destino está vacía, y en tarjetas nuevas ya no lo estará, así que no duplica |
| Tarjetas históricas | **Sin cambios** (sin actualización masiva); probado con un proyecto en Analysis con Backlog completado: después de M18 sigue sin tareas en Analysis y conserva sus tareas completadas. El frontend ofrece «Agregar tareas sugeridas» |
| Edición manual | Completar, editar, añadir y borrar bajo RLS (probado como developer); la auditoría `checklist_added/updated/deleted` sigue activa |
