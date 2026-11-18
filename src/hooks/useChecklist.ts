import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { errorMessage, requireData } from '../lib/supabase-errors'
import type { ChecklistItem } from '../types/database.types'

/**
 * CRUD del checklist bajo RLS (permitido también con el ticket bloqueado). La auditoría
 * (checklist_added/updated/deleted) la genera el servidor; el progreso NO se escribe desde el
 * navegador: tras cada cambio se recarga el snapshot del tablero (get_board_ticket).
 */
export function useChecklist(flowId: string) {
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const loadItems = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await supabase.from('checklist_items').select('*').eq('project_flow_id', flowId).order('order_index')
      if (result.error) throw result.error
      setItems(result.data || [])
    } catch (err) { setItems([]); setError(errorMessage(err)) }
    finally { setLoading(false) }
  }
  useEffect(() => { if (flowId) void loadItems() }, [flowId])
  const toggleItem = async (id: string, completed: boolean) => {
    const row = requireData(await supabase.from('checklist_items').update({ completed }).eq('id', id)
      .select('*').single(), 'Tarea') as ChecklistItem
    setItems(prev => prev.map(item => item.id === id ? row : item))
  }
  const deleteItem = async (id: string) => {
    requireData(await supabase.from('checklist_items').delete().eq('id', id).select('id').single(), 'Tarea')
    setItems(prev => prev.filter(item => item.id !== id))
  }
  const addItem = async (phase: string, description: string) => {
    const last = Math.max(-1, ...items.filter(item => item.phase === phase).map(item => item.order_index))
    const row = requireData(await supabase.from('checklist_items').insert({ project_flow_id: flowId,
      phase, description: description.trim(), order_index: last + 1 }).select('*').single(), 'Tarea') as ChecklistItem
    setItems(prev => [...prev, row])
  }
  const reorderItems = async (phase: string, from: number, to: number) => {
    const rows = items.filter(item => item.phase === phase)
    const [moved] = rows.splice(from, 1)
    if (!moved) return
    rows.splice(to, 0, moved)
    try {
      for (const [index, row] of rows.entries()) {
        requireData(await supabase.from('checklist_items').update({ order_index: index }).eq('id', row.id)
          .select('id').single(), 'Orden de tarea')
      }
      setItems([...items.filter(item => item.phase !== phase), ...rows.map((row, index) => ({ ...row, order_index: index }))])
    } catch (err) {
      await loadItems()
      throw new Error(`No se confirmó todo el orden; se recargaron las tareas: ${errorMessage(err)}`)
    }
  }
  return { items, loading, error, toggleItem, addItem, deleteItem, reorderItems, reload: loadItems }
}
