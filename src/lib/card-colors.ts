// Preferencias compartidas del color del responsable (M17). Supabase es la fuente de verdad;
// el UUID del usuario siempre procede de Supabase Auth y nunca de una elección del navegador.
import { useEffect, useSyncExternalStore } from 'react'
import { supabase } from './supabase'

export const OWNER_COLORS = [
  { id: 'azul', label: 'Azul Procont' }, { id: 'azul-claro', label: 'Azul claro' },
  { id: 'azul-oscuro', label: 'Azul profundo' }, { id: 'azul-acero', label: 'Azul acero' },
  { id: 'celeste', label: 'Celeste' }, { id: 'celeste-claro', label: 'Celeste claro' },
  { id: 'celeste-oscuro', label: 'Celeste intenso' }, { id: 'celeste-acero', label: 'Celeste acero' },
  { id: 'dorado', label: 'Dorado' }, { id: 'dorado-claro', label: 'Dorado claro' },
  { id: 'dorado-oscuro', label: 'Dorado tostado' }, { id: 'dorado-ocre', label: 'Dorado ocre' },
  { id: 'ambar', label: 'Ámbar' }, { id: 'ambar-claro', label: 'Ámbar claro' },
  { id: 'ambar-oscuro', label: 'Ámbar profundo' }, { id: 'ambar-bronce', label: 'Ámbar bronce' },
  { id: 'grafito', label: 'Grafito' }, { id: 'grafito-claro', label: 'Grafito claro' },
  { id: 'grafito-oscuro', label: 'Grafito oscuro' }, { id: 'grafito-humo', label: 'Grafito humo' },
  { id: 'pizarra', label: 'Pizarra' }, { id: 'pizarra-claro', label: 'Pizarra claro' },
  { id: 'pizarra-oscuro', label: 'Pizarra oscuro' }, { id: 'pizarra-acero', label: 'Pizarra acero' },
] as const
export type OwnerColorId = typeof OWNER_COLORS[number]['id']
const VALID = new Set<string>(OWNER_COLORS.map(c => c.id))
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type State = { assignments: Record<string, OwnerColorId>; loading: boolean; error: string | null }
let state: State = { assignments: {}, loading: false, error: null }
let inFlight: Promise<Record<string, OwnerColorId>> | null = null
const listeners = new Set<() => void>()
const publish = (next: State) => { state = next; listeners.forEach(listener => listener()) }
const subscribe = (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener) }

export async function refreshOwnerColors(): Promise<Record<string, OwnerColorId>> {
  if (inFlight) return inFlight
  publish({ ...state, loading: true, error: null })
  inFlight = (async () => {
    const { data, error } = await supabase.rpc('internal_card_colors')
    if (error) throw new Error(error.code === '42501' ? 'Se requiere una sesión interna activa.' : 'No se pudieron cargar los colores del equipo.')
    const assignments: Record<string, OwnerColorId> = {}
    const raw = data && typeof data === 'object' ? (data as { assignments?: Record<string, unknown> }).assignments : null
    for (const [userId, color] of Object.entries(raw ?? {})) {
      if (UUID.test(userId) && typeof color === 'string' && VALID.has(color)) assignments[userId] = color as OwnerColorId
    }
    publish({ assignments, loading: false, error: null })
    return assignments
  })().catch(error => {
    publish({ ...state, loading: false, error: error instanceof Error ? error.message : 'No se pudieron cargar los colores del equipo.' })
    throw error
  }).finally(() => { inFlight = null })
  return inFlight
}

export async function setOwnerColor(color: OwnerColorId): Promise<Record<string, OwnerColorId>> {
  if (!VALID.has(color)) throw new Error('El color seleccionado no está disponible.')
  publish({ ...state, loading: true, error: null })
  const { error } = await supabase.rpc('set_my_internal_card_color', { p_color_id: color })
  if (error) {
    const message = error.code === '23505' ? 'Ese color ya está asignado. Elige otro color disponible.'
      : error.code === '42501' ? 'Se requiere una sesión interna activa.' : 'No se pudo guardar el color. Inténtalo de nuevo.'
    publish({ ...state, loading: false, error: message })
    throw new Error(message)
  }
  if (inFlight) { try { await inFlight } catch { /* una consulta anterior puede haber fallado; se vuelve a leer */ } }
  inFlight = null
  return refreshOwnerColors()
}

export function useOwnerColors() {
  const snapshot = useSyncExternalStore(subscribe, () => state.assignments, () => ({} as Record<string, OwnerColorId>))
  useEffect(() => { void refreshOwnerColors().catch(() => undefined) }, [])
  return snapshot
}

export function useOwnerColorStatus() {
  const current = useSyncExternalStore(subscribe, () => state, () => state)
  return { loading: current.loading, error: current.error }
}

// Al regresar al tablero se vuelve a consultar el estado compartido. No se usa Realtime ni
// se guarda una copia persistente en el navegador.
if (typeof window !== 'undefined') {
  window.addEventListener('focus', () => { void refreshOwnerColors().catch(() => undefined) })
}

export const ownerClass = (colors: Record<string, OwnerColorId>, userId?: string | null) =>
  userId && colors[userId] ? `owner-${colors[userId]}` : ''
