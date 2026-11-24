// Portafolio (M19, fase 1): nivel superior de organización del trabajo («Gestión») con iniciativas de largo alcance
// («Beneficiarios finales») a las que se asocian los tickets del tablero. Catálogo leído una sola vez y compartido
// (useSyncExternalStore); la escritura pasa por las RPC de M19, que validan rol y auditan en activity_logs.
import { useEffect, useSyncExternalStore } from 'react'
import { supabase } from './supabase'
import { errorMessage } from './supabase-errors'

import type { Portfolio, Initiative } from './portfolio-model.ts'
export * from './portfolio-model.ts'
type State = { portfolios: Portfolio[]; initiatives: Initiative[]; loaded: boolean; error: string | null }

let state: State = { portfolios: [], initiatives: [], loaded: false, error: null }
let inFlight: Promise<void> | null = null
const listeners = new Set<() => void>()
const publish = (next: State) => { state = next; listeners.forEach(l => l()) }
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l) }

export function refreshPortfolios(): Promise<void> {
  if (inFlight) return inFlight
  inFlight = (async () => {
    const [p, i] = await Promise.all([
      supabase.from('portfolios').select('id,name,description,is_active,sort_order').order('sort_order').order('name'),
      supabase.from('portfolio_initiatives').select('id,portfolio_id,name,description,is_active,sort_order').order('sort_order').order('name'),
    ])
    if (p.error || i.error) { publish({ ...state, loaded: true, error: errorMessage(p.error ?? i.error) }); return }
    publish({ portfolios: (p.data ?? []) as Portfolio[], initiatives: (i.data ?? []) as Initiative[], loaded: true, error: null })
  })().finally(() => { inFlight = null })
  return inFlight
}

export function usePortfolios() {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => state)
  useEffect(() => { if (!state.loaded) void refreshPortfolios() }, [])
  return snapshot
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw new Error(errorMessage(error))
  return data as T
}
export const savePortfolio = async (payload: { id?: string; name: string; description?: string | null; is_active?: boolean }) => {
  const row = await rpc<Portfolio>('save_portfolio', { p_payload: payload }); await refreshPortfolios(); return row
}
export const saveInitiative = async (payload: { id?: string; portfolio_id: string; name: string; description?: string | null; is_active?: boolean }) => {
  const row = await rpc<Initiative>('save_portfolio_initiative', { p_payload: payload }); await refreshPortfolios(); return row
}
export const setProjectPortfolio = (projectId: string, portfolioId: string | null, initiativeId: string | null) =>
  rpc<{ portfolio_id: string | null; initiative_id: string | null }>('set_project_portfolio',
    { p_project_id: projectId, p_portfolio_id: portfolioId, p_initiative_id: initiativeId })

