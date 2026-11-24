// Modelo puro de Portafolio (M19): tipos, etiqueta y codificación del selector. Sin dependencias de red.
export interface Portfolio { id: string; name: string; description: string | null; is_active: boolean; sort_order: number }
export interface Initiative { id: string; portfolio_id: string; name: string; description: string | null; is_active: boolean; sort_order: number }

/** «Gestión · Beneficiarios finales», «Gestión» o null. */
export function portfolioLabel(s: { portfolios: Portfolio[]; initiatives: Initiative[] }, portfolioId?: string | null, initiativeId?: string | null) {
  const p = s.portfolios.find(x => x.id === portfolioId)
  if (!p) return null
  const i = s.initiatives.find(x => x.id === initiativeId)
  return i ? `${p.name} · ${i.name}` : p.name
}

/** Valor de selector único: '' sin asignar, 'p:<id>' solo portafolio, 'i:<id>' iniciativa (implica su portafolio). */
export const encodePortfolio = (portfolioId?: string | null, initiativeId?: string | null) =>
  initiativeId ? `i:${initiativeId}` : portfolioId ? `p:${portfolioId}` : ''
export function decodePortfolio(value: string, initiatives: Initiative[]): { portfolio_id: string | null; initiative_id: string | null } {
  if (value.startsWith('i:')) { const i = initiatives.find(x => x.id === value.slice(2)); return { portfolio_id: i?.portfolio_id ?? null, initiative_id: i?.id ?? null } }
  if (value.startsWith('p:')) return { portfolio_id: value.slice(2), initiative_id: null }
  return { portfolio_id: null, initiative_id: null }
}
