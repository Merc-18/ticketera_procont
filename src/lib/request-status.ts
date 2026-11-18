// Estados generales del ticket (migración 20261118000600). Calculados y registrados en el servidor.
export type GeneralStatus = 'received' | 'in_review' | 'approved_backlog' | 'in_progress' | 'blocked' | 'done' | 'rejected'

export const GENERAL_STATUS: Record<GeneralStatus, { label: string; icon: string; tone: string }> = {
  received:         { label: 'Solicitud recibida',        icon: '📨', tone: 'bg-gray-100 text-gray-700 border-gray-200' },
  in_review:        { label: 'En revisión',               icon: '🔍', tone: 'bg-yellow-50 text-yellow-800 border-yellow-200' },
  approved_backlog: { label: 'Aprobada — En backlog',     icon: '📋', tone: 'bg-brand-50 text-brand-700 border-brand-200' },
  in_progress:      { label: 'Trabajo en proceso',        icon: '⚙️', tone: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  blocked:          { label: 'Bloqueado',                 icon: '⛔', tone: 'bg-orange-50 text-orange-800 border-orange-200' },
  done:             { label: 'Terminado',                 icon: '✅', tone: 'bg-green-50 text-green-800 border-green-200' },
  rejected:         { label: 'Rechazada',                 icon: '❌', tone: 'bg-red-50 text-red-700 border-red-200' },
}

/** Recorrido principal (el bloqueo es temporal y el rechazo es el camino alternativo). */
export const MAIN_PATH: GeneralStatus[] = ['received', 'in_review', 'approved_backlog', 'in_progress', 'done']

export const isGeneralStatus = (s: unknown): s is GeneralStatus => typeof s === 'string' && s in GENERAL_STATUS

/** Fecha y hora de Lima para la trazabilidad interna. */
export const limaDateTime = (iso: string) =>
  new Date(iso).toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'medium', timeStyle: 'short' })
