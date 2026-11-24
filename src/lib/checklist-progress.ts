// Progreso REAL del checklist (24/11/2026).
//  · Las sugerencias no existen como tareas: nunca cuentan.
//  · Solo cuentan las tareas incorporadas al checklist del ticket.
// Las sugerencias no se escriben al mostrar o cambiar de fase: solo el contenido existente en checklist_items cuenta.
// El histórico anterior a M19 no guarda procedencia; una coincidencia de created_at no prueba su origen, por lo que
// no se reclasifica ni se excluye ninguna fila existente.
export interface ChecklistItemLite { id?: string; completed: boolean; created_at?: string | null; phase?: string }
export interface ChecklistProgress { done: number; total: number; percent: number | null }

export function checklistProgress(items: ChecklistItemLite[]): ChecklistProgress {
  const done = items.filter(i => i.completed).length
  return { done, total: items.length, percent: items.length ? Math.round((done / items.length) * 10000) / 100 : null }
}

/** «3 de 5 tareas completadas · 60 %» o el texto de checklist vacío. */
export function progressLabel(p: ChecklistProgress): string {
  if (!p.total) return 'Sin tareas de checklist agregadas'
  const pct = p.percent === null ? '' : ` · ${p.percent.toLocaleString('es-PE', { maximumFractionDigits: 0 })} %`
  return `${p.done} de ${p.total} ${p.total === 1 ? 'tarea completada' : 'tareas completadas'}${pct}`
}
