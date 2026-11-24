// Checklist sugerido por fase (24/11/2026). Solo frontend sobre el mecanismo existente: las tareas se guardan en
// `public.checklist_items` con su `phase` mediante el mismo INSERT que permite RLS (auditado por el servidor como
// `checklist_added`). Reglas:
//  · Nunca se borra, se desmarca ni se reescribe una tarea existente.
//  · Una tarea sugerida no se añade si la fase ya tiene una con el mismo texto (comparación normalizada).
//  · Al cambiar de fase solo se siembra si la fase de destino NO tiene ninguna tarea, y nunca en la fase final
//    (Done/Deployed cierran el ticket; ahí queda la sugerencia manual).
//  · Las tarjetas históricas no se modifican en lote: en una fase vacía se ofrece «Agregar tareas sugeridas».
import { DEFAULT_CHECKLIST } from './checklist-defaults.ts'

const FINAL: Record<string, string> = { development: 'done', administrative: 'deployed' }

export const phaseTemplate = (flowType: string, phase: string): string[] => DEFAULT_CHECKLIST[flowType]?.[phase] ?? []

export const normalizeTask = (text: string) =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

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

/** ¿Se siembra automáticamente al llegar a esta fase? Solo si está vacía y no es la fase final. */
export const shouldSeedOnArrival = (flowType: string, phase: string, phaseItemCount: number) =>
  phaseItemCount === 0 && FINAL[flowType] !== phase && phaseTemplate(flowType, phase).length > 0

type Row = { description: string; order_index: number }
type Result<T> = { data: T | null; error: unknown }
interface SelectQuery extends PromiseLike<Result<Row[]>> { eq(column: string, value: string): SelectQuery }
export interface ChecklistClient {
  from(table: 'checklist_items'): {
    select(columns: string): SelectQuery
    insert(rows: { project_flow_id: string; phase: string; description: string; order_index: number }[]): PromiseLike<Result<unknown>>
  }
}

/**
 * Tras un cambio de fase confirmado por el servidor: lee las tareas de la fase destino y, si está vacía,
 * inserta su plantilla en una sola sentencia (todas o ninguna). Devuelve cuántas tareas añadió.
 */
export async function seedPhaseOnArrival(client: ChecklistClient, flowId: string, flowType: string, phase: string): Promise<number> {
  if (FINAL[flowType] === phase || !phaseTemplate(flowType, phase).length) return 0
  const current = await client.from('checklist_items').select('description, order_index').eq('project_flow_id', flowId).eq('phase', phase)
  if (current.error) throw new Error('No se pudo leer el checklist de la nueva fase.')
  const rows = current.data ?? []
  if (!shouldSeedOnArrival(flowType, phase, rows.length)) return 0
  const tasks = missingTemplateTasks(flowType, phase, rows)
  const { error } = await client.from('checklist_items').insert(tasks.map((description, i) =>
    ({ project_flow_id: flowId, phase, description, order_index: i })))
  if (error) throw new Error('La fase cambió, pero no se pudieron agregar sus tareas sugeridas.')
  return tasks.length
}
