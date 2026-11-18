// ─── Shared UI constants ──────────────────────────────────────────────────────

export const AVATAR_COLORS = [
  'bg-brand-500', 'bg-purple-500', 'bg-green-500',
  'bg-orange-500', 'bg-pink-500', 'bg-teal-500', 'bg-indigo-500',
]

export function getAvatarColor(name: string): string {
  let h = 0
  for (const c of name) h = c.charCodeAt(0) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

export function getInitials(name: string): string {
  return name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
}

/** Badge style — includes border-color class (pair with `border` in template when needed) */
export const PRIORITY_COLORS: Record<string, string> = {
  low:    'bg-green-100 text-green-800 border-green-200',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  high:   'bg-orange-100 text-orange-800 border-orange-200',
  urgent: 'bg-red-100 text-red-800 border-red-200',
}

/** Emoji + label for each priority */
export const PRIORITY_LABEL: Record<string, string> = {
  urgent: '🔴 Urgente', high: '🟠 Alta', medium: '🟡 Media', low: '🟢 Baja',
}

/** Solid bar color for Gantt timeline */
export const PRIORITY_BAR: Record<string, string> = {
  urgent: 'bg-red-500', high: 'bg-orange-400', medium: 'bg-brand-500', low: 'bg-green-500',
}

/** Small dot color for Roadmap cards */
export const PRIORITY_DOT: Record<string, string> = {
  urgent: 'bg-red-500', high: 'bg-orange-500', medium: 'bg-yellow-400', low: 'bg-green-500',
}

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


