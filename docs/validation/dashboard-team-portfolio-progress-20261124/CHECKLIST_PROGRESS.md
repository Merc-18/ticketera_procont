# Progreso de fase y checklist

Revisión 24/11/2026.

La fase es posición, no porcentaje: se muestra nombre y `Fase n de 8`. El porcentaje ordinal se quitó.

Las sugerencias son propuestas no persistidas. Fase vacía: «Sin tareas de checklist agregadas», «Tareas sugeridas para [fase]» y botón «Agregar tareas sugeridas (3)»; no 0/3, porcentaje o barra. Solo `checklist_items` persistidos y aceptados forman el denominador. Porcentaje = completadas persistidas / total persistido. Globalmente solo se suman tareas existentes de las fases del ticket; cero tareas mantiene ausencia de progreso.

No se agregan automáticamente al cambiar fase y no se desmarcan ni eliminan tareas completadas. No se infiere procedencia histórica por timestamp coincidente; filas antiguas ambiguas se conservan y se cuentan como persistidas. Sin cambios SQL ni modificación de históricos en esta etapa. Evidencia: `tests/boards-dashboard-checklists.test.mjs`, suite Node y UI, capturas de detalle vacío/histórico.
