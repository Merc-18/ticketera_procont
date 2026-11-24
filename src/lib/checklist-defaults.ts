// Plantillas de checklist por fase. Las fases con plantilla en `public.checklist_templates` (migración
// 20261117000400) conservan EXACTAMENTE ese texto, para no duplicar tareas que el servidor ya creó.
// 24/11/2026: se añaden Analysis y Code Review, las dos fases del flujo M12 que no tenían plantilla (por eso
// sus checklists aparecían vacíos). Ver lib/checklist-templates.ts y CHECKLIST_TEMPLATES_BY_PHASE.md.
export const DEFAULT_CHECKLIST: Record<string, Record<string, string[]>> = {
  development: {
    backlog: [
      'Definir requerimientos con el solicitante',
      'Estimar horas de desarrollo',
      'Priorizar en el sprint',
    ],
    analysis: [
      'Revisar el requerimiento y aclarar dudas con el solicitante',
      'Identificar dependencias y sistemas afectados',
      'Definir criterios de aceptación',
      'Documentar riesgos y supuestos',
    ],
    design: [
      'Crear wireframes o mockups',
      'Revisar diseño con el equipo',
      'Aprobar diseño final',
    ],
    dev: [
      'Implementar la funcionalidad',
      'Code review por otro developer',
      'Pruebas unitarias',
    ],
    code_review: [
      'Revisar el diff y la lógica implementada',
      'Validar estándares, seguridad y manejo de errores',
      'Resolver las observaciones de la revisión',
      'Registrar la aprobación del revisor',
    ],
    testing: [
      'Pruebas funcionales completas',
      'Pruebas de regresión',
      'Documentar resultados',
    ],
    deploy: [
      'Preparar release notes',
      'Deploy a producción',
      'Smoke test en producción',
    ],
    done: [
      'Notificar al solicitante',
      'Cerrar el ticket',
    ],
  },
  administrative: {
    backlog: [
      'Revisar la solicitud',
      'Definir alcance',
      'Asignar responsable',
    ],
    ready_to_start: [
      'Confirmar recursos disponibles',
      'Notificar inicio al solicitante',
    ],
    discovery: [
      'Levantar información del proceso',
      'Identificar stakeholders',
      'Documentar proceso actual (AS-IS)',
    ],
    design: [
      'Diseñar solución (TO-BE)',
      'Validar con stakeholders',
      'Aprobar diseño de la solución',
    ],
    build: [
      'Ejecutar plan de acción',
      'Documentar avances',
    ],
    uat_validation: [
      'Pruebas con usuario final',
      'Validar resultados con el solicitante',
      'Obtener firma de conformidad',
    ],
    deployed: [
      'Entregar al usuario',
      'Documentar solución final',
    ],
  },
}
