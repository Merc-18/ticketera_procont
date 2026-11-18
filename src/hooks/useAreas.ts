import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { errorMessage } from '../lib/supabase-errors'

export interface Area { id: string; name: string; is_active: boolean }

/**
 * Catálogo de áreas almacenado en Supabase (`public.areas`).
 * - `onlyActive` (por defecto): lo que ven formularios y filtros; RLS solo
 *   devuelve áreas activas a anon y miembros.
 * - Gestión: el superadmin recibe también las inactivas y puede crear/editar/
 *   desactivar; RLS rechaza cualquier escritura de otros roles.
 * Si la migración de áreas aún no está aplicada, `available` es false y los
 * formularios conservan el campo de texto libre.
 */
export function useAreas({ onlyActive = true }: { onlyActive?: boolean } = {}) {
  const [areas, setAreas] = useState<Area[]>([])
  const [loading, setLoading] = useState(true)
  const [available, setAvailable] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    let query = supabase.from('areas').select('id,name,is_active').order('name')
    if (onlyActive) query = query.eq('is_active', true)
    const { data, error: err } = await query
    if (err) { setAreas([]); setAvailable(false); setError(errorMessage(err)) }
    else { setAreas((data ?? []) as Area[]); setAvailable(true); setError(null) }
    setLoading(false)
  }, [onlyActive])
  useEffect(() => { void reload() }, [reload])

  const normalize = (name: string) => {
    const value = name.trim().replace(/\s+/g, ' ')
    if (!value || value.length > 200) throw new Error('El nombre del área debe tener entre 1 y 200 caracteres.')
    return value
  }
  const createArea = async (name: string) => {
    const { error: err } = await supabase.from('areas').insert({ name: normalize(name) })
    if (err) throw new Error(err.code === '23505' ? 'Ya existe un área con ese nombre.' : errorMessage(err))
    await reload()
  }
  const updateArea = async (id: string, changes: { name?: string; is_active?: boolean }) => {
    const payload = { ...changes, ...(changes.name !== undefined ? { name: normalize(changes.name) } : {}) }
    const { data, error: err } = await supabase.from('areas').update(payload).eq('id', id).select('id')
    if (err) throw new Error(err.code === '23505' ? 'Ya existe un área con ese nombre.' : errorMessage(err))
    if (!data?.length) throw new Error('No tienes permiso para modificar esta área.')
    await reload()
  }

  return { areas, activeNames: areas.filter(a => a.is_active).map(a => a.name),
    loading, available, error, reload, createArea, updateArea }
}
