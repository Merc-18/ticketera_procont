// Color personal de tarjeta para usuarios INTERNOS (nunca clientes). Identifica al responsable; la prioridad y el
// estado conservan sus propios canales (borde superior + insignia, y tinte/insignia de estado). D-043.
//
// Persistencia: no existe un mecanismo de preferencias en el backend (public.users solo guarda id, email, nombre,
// rol y estado) y no se crean migraciones sin autorización. La preferencia vive en localStorage de ESTE navegador,
// asociada al UUID del usuario interno: { [uuid]: colorId }. Sin datos de clientes; otro navegador o dispositivo no la ve.
import { useSyncExternalStore } from 'react'

export const OWNER_COLOR_KEY = 'ticketera-owner-colors'

/** Paleta oficial Procont y derivados aprobados (escalas blue/yellow/slate del sitio). Sin violeta, sin rojo ni verde
 *  (reservados para estados). Cada valor tiene variante clara y oscura en src/index.css (.owner-*). */
export const OWNER_COLORS = [
  { id: 'azul', label: 'Azul Procont' },
  { id: 'celeste', label: 'Celeste' },
  { id: 'dorado', label: 'Dorado' },
  { id: 'ambar', label: 'Ámbar' },
  { id: 'grafito', label: 'Grafito' },
  { id: 'pizarra', label: 'Pizarra' },
] as const
export type OwnerColorId = typeof OWNER_COLORS[number]['id']
const VALID = new Set<string>(OWNER_COLORS.map(c => c.id))
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const listeners = new Set<() => void>()
let cache: string | null = null
let snapshot: Record<string, OwnerColorId> = {}

function read(): Record<string, OwnerColorId> {
  let raw: string | null = null
  try { raw = localStorage.getItem(OWNER_COLOR_KEY) } catch { /* almacenamiento bloqueado */ }
  if (raw === cache) return snapshot
  cache = raw
  const out: Record<string, OwnerColorId> = {}
  try {
    const parsed = raw ? JSON.parse(raw) : {}
    for (const [id, color] of Object.entries(parsed ?? {})) if (UUID.test(id) && typeof color === 'string' && VALID.has(color)) out[id] = color as OwnerColorId
  } catch { /* valor corrupto: se ignora */ }
  snapshot = out
  return snapshot
}

export function setOwnerColor(userId: string, color: OwnerColorId | null) {
  if (!UUID.test(userId)) return
  const next = { ...read() }
  if (color) next[userId] = color; else delete next[userId]
  try { localStorage.setItem(OWNER_COLOR_KEY, JSON.stringify(next)) } catch { /* solo esta visita */ }
  listeners.forEach(l => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  const onStorage = (e: StorageEvent) => { if (e.key === OWNER_COLOR_KEY) listener() }
  window.addEventListener('storage', onStorage)
  return () => { listeners.delete(listener); window.removeEventListener('storage', onStorage) }
}

/** Mapa vigente { uuid: color } (se actualiza al elegir y entre pestañas). */
export function useOwnerColors() {
  return useSyncExternalStore(subscribe, read, () => ({}) as Record<string, OwnerColorId>)
}

/** Clase de color del responsable de una tarjeta, o '' si no eligió color. */
export const ownerClass = (colors: Record<string, OwnerColorId>, userId?: string | null) =>
  userId && colors[userId] ? `owner-${colors[userId]}` : ''
