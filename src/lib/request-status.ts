// Estados generales del ticket (migración 20261118000600). Calculados y registrados en el servidor.
export type GeneralStatus = 'received' | 'in_review' | 'approved_backlog' | 'in_progress' | 'blocked' | 'done' | 'rejected'

import type { IconName } from '../components/ui/Icon'

export const GENERAL_STATUS: Record<GeneralStatus, { label: string; icon: IconName; tone: string }> = {
  received:         { label: 'Solicitud recibida',        icon: 'inbox', tone: 'bg-gray-100 text-gray-700 border-gray-200' },
  // Corrección de color: cada estado con su apariencia (antes «en revisión» = «bloqueado» y «aprobada» = «en proceso»).
  in_review:        { label: 'En revisión',               icon: 'search', tone: 'bg-accent-100 text-accent-700 border-accent-300' },
  approved_backlog: { label: 'Aprobada — En backlog',     icon: 'tickets', tone: 'bg-surface text-brand-700 border-brand-300' },
  in_progress:      { label: 'Trabajo en proceso',        icon: 'clock', tone: 'bg-brand-100 text-brand-700 border-brand-200' },
  blocked:          { label: 'Bloqueado',                 icon: 'block', tone: 'bg-red-50 text-red-700 border-red-200' },
  done:             { label: 'Terminado',                 icon: 'check', tone: 'bg-green-50 text-green-800 border-green-200' },
  rejected:         { label: 'Rechazada',                 icon: 'close', tone: 'bg-surface text-red-700 border-red-300' },
}

/** Recorrido principal (el bloqueo es temporal y el rechazo es el camino alternativo). */
export const MAIN_PATH: GeneralStatus[] = ['received', 'in_review', 'approved_backlog', 'in_progress', 'done']

export const isGeneralStatus = (s: unknown): s is GeneralStatus => typeof s === 'string' && s in GENERAL_STATUS

/** Fecha y hora de Lima para la trazabilidad interna. */
export const limaDateTime = (iso: string) =>
  new Date(iso).toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'medium', timeStyle: 'short' })
