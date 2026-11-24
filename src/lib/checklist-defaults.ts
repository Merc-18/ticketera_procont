// Tareas SUGERIDAS por fase (M19, 24/11/2026): exactamente 3 por cada fase real del flujo. Nunca se materializan
// solas: una fase sin tareas muestra «Tareas sugeridas para [fase]» y el botón «Agregar tareas sugeridas (3)».
// Es la misma lista que `public.checklist_templates` en el servidor (M19); una prueba compara ambas.
export const DEFAULT_CHECKLIST: Record<string, Record<string, string[]>> = {
  development: {
    backlog: ['Definir requerimientos con el solicitante', 'Estimar horas de desarrollo', 'Priorizar en el sprint'],
    analysis: ['Revisar el requerimiento y aclarar dudas con el solicitante', 'Identificar dependencias y sistemas afectados', 'Definir criterios de aceptación'],
    design: ['Crear wireframes o mockups', 'Revisar diseño con el equipo', 'Aprobar diseño final'],
    dev: ['Implementar la funcionalidad', 'Pruebas unitarias', 'Actualizar la documentación técnica'],
    code_review: ['Revisar el diff y la lógica implementada', 'Validar estándares, seguridad y manejo de errores', 'Resolver las observaciones de la revisión'],
    testing: ['Pruebas funcionales completas', 'Pruebas de regresión', 'Documentar resultados'],
    deploy: ['Preparar release notes', 'Deploy a producción', 'Smoke test en producción'],
    done: ['Notificar al solicitante', 'Confirmar la conformidad del solicitante', 'Cerrar el ticket'],
  },
  administrative: {
    backlog: ['Revisar la solicitud', 'Definir alcance', 'Asignar responsable'],
    ready_to_start: ['Confirmar recursos disponibles', 'Notificar inicio al solicitante', 'Acordar fechas objetivo'],
    discovery: ['Levantar información del proceso', 'Identificar stakeholders', 'Documentar proceso actual (AS-IS)'],
    design: ['Diseñar solución (TO-BE)', 'Validar con stakeholders', 'Aprobar diseño de la solución'],
    build: ['Ejecutar plan de acción', 'Documentar avances', 'Validar avances con el solicitante'],
    uat_validation: ['Pruebas con usuario final', 'Validar resultados con el solicitante', 'Obtener firma de conformidad'],
    deployed: ['Entregar al usuario', 'Documentar solución final', 'Cerrar el ticket'],
  },
}
