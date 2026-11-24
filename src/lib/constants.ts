// ─── Shared UI constants ──────────────────────────────────────────────────────

/** Avatares: tonos de marca y neutros con texto blanco (≥ 7:1 en claro, ≥ 4,9:1 en oscuro; src/theme/themes.ts). */
export const AVATAR_COLORS = ['bg-avatar-1', 'bg-avatar-2', 'bg-avatar-3', 'bg-avatar-4', 'bg-avatar-5']

export function getAvatarColor(name: string): string {
  let h = 0
  for (const c of name) h = c.charCodeAt(0) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

export function getInitials(name: string): string {
  return name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
}

/** Prioridad administrativa (projects.priority): mismas palabras que la prioridad solicitada por el cliente. */
export const PRIORITY_LABEL: Record<string, string> = {
  urgent: 'Urgente', high: 'Alto', medium: 'Medio', low: 'Bajo',
}
export const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 }

/**
 * Prioridad en SEMÁFORO (24/11/2026): Bajo verde · Medio ámbar (dorado Procont) · Alto naranja · Urgente rojo.
 * Clases CSS con valores por tema en index.css («Prioridad en semáforo»); texto ≥ 4,5:1 sobre el relleno en claro y
 * oscuro. Se usa igual en Kanban, Tabla, detalle, Gantt, Roadmap, Dashboard y prioridad solicitada.
 */
export const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'prio-fill prio-fill-urgent',
  high:   'prio-fill prio-fill-high',
  medium: 'prio-fill prio-fill-medium',
  low:    'prio-fill prio-fill-low',
}

/** Barras (Gantt, Dashboard) y puntos (Roadmap): mismo semáforo, solo fondo. */
export const PRIORITY_BAR: Record<string, string> = {
  urgent: 'prio-bg-urgent', high: 'prio-bg-high', medium: 'prio-bg-medium', low: 'prio-bg-low',
}
export const PRIORITY_DOT = PRIORITY_BAR

/**
 * Area badge — includes border-color class.
 * El catálogo de áreas vive en Supabase (`public.areas`, hook `useAreas`).
 * No se asignan colores por área: los consumidores usan el estilo neutro.
 */
export const AREA_COLORS: Record<string, string> = {}

export const PHASE_LABELS: Record<string, string> = {
  backlog:        'Backlog',
  analysis:       'Analysis',
  design:         'Design',
  dev:            'Development',
  code_review:    'Code Review',
  testing:        'Testing',
  deploy:         'Deploy',
  done:           'Done',
  ready_to_start: 'Ready to Start',
  discovery:      'Discovery',
  build:          'Build',
  uat_validation: 'UAT/Validation',
  deployed:       'Deployed',
}


