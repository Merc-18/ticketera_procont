// Checklist SUGERIDO por fase (M19). Ninguna fase se siembra sola (ni al crear la tarjeta ni al cambiar de fase):
// una fase sin tareas sugiere sus 3 tareas y el usuario las agrega con «Agregar tareas sugeridas (3)». Se guardan en
// `public.checklist_items` con su `phase` mediante el INSERT que permite RLS (auditado como `checklist_added`).
//  · Nunca se borra, se desmarca ni se reescribe una tarea existente.
//  · Una tarea sugerida no se añade si la fase ya tiene una con el mismo texto (comparación normalizada).
import { DEFAULT_CHECKLIST } from './checklist-defaults.ts'

export const phaseTemplate = (flowType: string, phase: string): string[] => DEFAULT_CHECKLIST[flowType]?.[phase] ?? []

export const normalizeTask = (text: string) =>
  text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/** Tareas de la plantilla que la fase aún no tiene (sin duplicar por texto). */
export function missingTemplateTasks(flowType: string, phase: string, existing: { description: string }[]): string[] {
  const have = new Set(existing.map(i => normalizeTask(i.description)))
  const seen = new Set<string>()
  return phaseTemplate(flowType, phase).filter(t => {
    const key = normalizeTask(t)
    if (have.has(key) || seen.has(key)) return false
    seen.add(key); return true
  })
}
