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

/** Badge (incluye borde; usar con `border`). Texto ≥ 4,5:1 sobre su fondo. */
export const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'bg-red-50 text-red-700 border-red-200',
  high:   'bg-accent-100 text-accent-700 border-accent-300',
  medium: 'bg-brand-50 text-brand-700 border-brand-200',
  low:    'bg-gray-100 text-gray-600 border-gray-300',
}

/** Barra del Gantt y punto del Roadmap: paleta oficial (rojo, dorado, azul, neutro). */
export const PRIORITY_BAR: Record<string, string> = {
  urgent: 'bg-red-700', high: 'bg-accent-400', medium: 'bg-brand-600', low: 'bg-gray-400',
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


