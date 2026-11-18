import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { errorMessage } from '../lib/supabase-errors'

export interface CatalogSystem { id: string; name: string; requires_subproject: boolean; sort_order: number; is_active: boolean }
export interface CatalogSubsystem { id: string; system_id: string; name: string; is_active: boolean }
export interface Studio { id: string; name: string; is_active: boolean; ruc?: string | null; review_note?: string | null }
export interface StudioCode { id: string; studio_id: string; code: string; is_active: boolean }
export interface CatalogArea { id: string; name: string; is_active: boolean; parent_id: string | null; studio_id: string | null; code?: string | null }

type Scope = 'public' | 'member' | 'admin'

/**
 * Catálogos de clasificación de tickets (migración 20261118000300).
 * - public: solo columnas permitidas a anon (sin RUC ni códigos internos).
 * - member: incluye códigos internos de estudio activos (validación de tickets).
 * - admin: superadmin, incluye inactivos y RUC (RLS lo restringe en Supabase).
 * `available` es false si la migración aún no está aplicada.
 */
export function useCatalogs(scope: Scope = 'public') {
  const [systems, setSystems] = useState<CatalogSystem[]>([])
  const [subsystems, setSubsystems] = useState<CatalogSubsystem[]>([])
  const [studios, setStudios] = useState<Studio[]>([])
  const [codes, setCodes] = useState<StudioCode[]>([])
  const [areas, setAreas] = useState<CatalogArea[]>([])
  const [loading, setLoading] = useState(true)
  const [available, setAvailable] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    const active = <T,>(q: T) => (scope === 'admin' ? q : (q as any).eq('is_active', true)) as T
    const results = await Promise.all([
      active(supabase.from('catalog_systems').select('id,name,requires_subproject,sort_order,is_active').order('sort_order').order('name')),
      active(supabase.from('catalog_subsystems').select('id,system_id,name,is_active').order('name')),
      active(supabase.from('studios').select(scope === 'admin' ? 'id,name,is_active,ruc,review_note' : 'id,name,is_active').order('name')),
      scope === 'public' ? Promise.resolve({ data: [], error: null })
        : active(supabase.from('studio_codes').select('id,studio_id,code,is_active').order('code')),
      active(supabase.from('areas').select(scope === 'public' ? 'id,name,is_active,parent_id,studio_id' : 'id,name,is_active,parent_id,studio_id,code').order('name')),
    ])
    const failed = results.find(r => r.error)
    if (failed) {
      setAvailable(false); setError(errorMessage(failed.error))
    } else {
      setSystems((results[0].data ?? []) as CatalogSystem[])
      setSubsystems((results[1].data ?? []) as CatalogSubsystem[])
      setStudios((results[2].data ?? []) as unknown as Studio[])
      setCodes((results[3].data ?? []) as StudioCode[])
      setAreas((results[4].data ?? []) as unknown as CatalogArea[])
      setAvailable(true); setError(null)
    }
    setLoading(false)
  }, [scope])
  useEffect(() => { void reload() }, [reload])

  return { systems, subsystems, studios, codes, areas, loading, available, error, reload }
}

/** Escritura de catálogos (solo superadmin; RLS rechaza otros roles). Sin borrado. */
export async function saveCatalogRow(table: 'catalog_systems' | 'catalog_subsystems' | 'studios' | 'studio_codes' | 'areas',
  values: Record<string, unknown>, id?: string) {
  const query = id
    ? supabase.from(table).update(values).eq('id', id).select('id')
    : supabase.from(table).insert(values).select('id')
  const { data, error } = await query
  if (error) throw new Error(error.code === '23505' ? 'Ya existe un registro con ese nombre o código.' : errorMessage(error))
  if (!data?.length) throw new Error('No tienes permiso para modificar este catálogo.')
}
