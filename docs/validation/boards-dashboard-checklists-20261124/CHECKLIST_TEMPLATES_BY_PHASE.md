# Checklist predeterminado por fase

## 1. Inspección del modelo real

| Elemento | Hallazgo |
|---|---|
| Fases (Development, M12) | `backlog → analysis → design → dev → code_review → testing → deploy → done` (`DEVELOPMENT_PHASES`). Se permiten saltos y retrocesos; Done cierra el ticket con confirmación de pendientes. Administrative (histórico): `backlog, ready_to_start, discovery, design, build, uat_validation, deployed` |
| Persistencia | `public.checklist_items(project_flow_id, phase, description, completed, order_index, completed_at)`. **Cada tarea ya guarda su fase.** El trigger `validate_checklist` exige que la fase pertenezca al flujo; `board_checklist_lock` hace inmutables flujo y fase; `board_checklist_audit` registra `checklist_added/updated/deleted` |
| Escritura | CRUD bajo RLS desde el navegador (`useChecklist`); el progreso lo calcula el servidor (`get_board_ticket`) |
| Plantillas del servidor | `public.checklist_templates` (migración 20261117000400). `add_flows` copia **todas** las plantillas del flujo al crear el proyecto |
| **Causa de los «campos vacíos»** | Verificado en producción (solo lectura, 24/11/2026): hay 35 plantillas, pero **ninguna para `analysis` ni `code_review`**, las dos fases que M12 añadió después. Una tarjeta en Analysis (el caso real: Backlog 3/3 completado) muestra Analysis vacío. Datos actuales: 2 flujos y 34 tareas, ninguna en esas dos fases |

## 2. Plantillas (8 fases reales, Development)

Las fases con plantilla en el servidor **conservan su texto exacto**, porque así el control de duplicados reconoce las tareas que el servidor ya creó (la prueba compara las 35 filas de la migración). Se añaden las dos fases que faltaban:

| Fase | Tareas |
|---|---|
| Backlog | Definir requerimientos con el solicitante · Estimar horas de desarrollo · Priorizar en el sprint |
| **Analysis (nueva)** | Revisar el requerimiento y aclarar dudas con el solicitante · Identificar dependencias y sistemas afectados · Definir criterios de aceptación · Documentar riesgos y supuestos |
| Design | Crear wireframes o mockups · Revisar diseño con el equipo · Aprobar diseño final |
| Development | Implementar la funcionalidad · Code review por otro developer · Pruebas unitarias |
| **Code Review (nueva)** | Revisar el diff y la lógica implementada · Validar estándares, seguridad y manejo de errores · Resolver las observaciones de la revisión · Registrar la aprobación del revisor |
| Testing | Pruebas funcionales completas · Pruebas de regresión · Documentar resultados |
| Deploy | Preparar release notes · Deploy a producción · Smoke test en producción |
| Done | Notificar al solicitante · Cerrar el ticket |

Ninguna tarea se repite entre fases (lo verifica una prueba). Administrative conserva sus 7 plantillas. No existen fases llamadas «Validación» ni «QA»: corresponden a Testing, y no se inventaron fases.

## 3. Comportamiento

| Momento | Qué ocurre | Garantías |
|---|---|---|
| Crear tarjeta | El servidor ya copia las plantillas existentes (`add_flows`, sin cambios) | Analysis y Code Review se cubren al llegar a esas fases o con la acción manual (abajo) |
| Cambiar de fase (Kanban o «Mover a fase») | Cuando el servidor confirma el movimiento, se leen las tareas de la fase destino. **Solo si está vacía** se inserta su plantilla en **una sola sentencia** (`seedPhaseOnArrival`), sin completar | No duplica (volver a una fase con tareas no añade nada); no borra; no desmarca; nunca en la fase final (Done/Deployed cierran el ticket y tienen su confirmación de pendientes). Si la inserción falla, el cambio de fase se mantiene y se avisa |
| Tarjeta existente con fase vacía | La fase muestra «Tareas sugeridas para X» y el botón «Agregar tareas sugeridas (n)». Nada se guarda sin pulsarlo | Sin cambios en lote sobre históricos; solo se sugiere lo que falta (comparación por texto normalizado: mayúsculas, tildes y espacios) |
| Editar / eliminar / agregar | Nuevo botón «Editar tarea» (en línea: Guardar/Cancelar, Enter/Escape); eliminar y agregar ya existían | La edición solo cambia `description` (fase, orden y estado intactos). Los botones tienen nombre accesible |

Todo usa el INSERT/UPDATE que RLS ya permite y queda auditado por el servidor. **Sin cambios de backend, RPC ni migraciones.**

## 4. Propuesta de backend (opcional, no aplicada)

Para que una tarjeta nueva nazca con las 8 fases cubiertas desde el servidor, basta con insertar 8 filas en `checklist_templates` (4 de `analysis` y 4 de `code_review`, con los textos de arriba). Es una migración de datos de referencia, sin cambios de esquema. Queda pendiente de autorización; mientras tanto, el frontend cubre el caso al llegar a la fase.

## 5. Pruebas

Unitarias: plantillas de las 8 fases sin repetir; paridad con las 35 plantillas del servidor; duplicados normalizados; siembra solo en fase vacía y nunca en la final; una sola inserción; una tarea completada sigue completada.
Interfaz: tarjeta en Analysis con Backlog completo → sugerencias → 1 inserción de 4 tareas sin completar, con Backlog intacto (claro y oscuro); edición (el PATCH solo envía `description`), eliminación y conservación; cambio de fase Backlog → Analysis (4 tareas) → completar una → Design (3) → volver a Analysis (sin duplicar, la completada sigue completada, 2 inserciones en total).
