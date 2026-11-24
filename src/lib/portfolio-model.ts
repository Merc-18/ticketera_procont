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

/**
 * Elección explícita de Portafolio → Proyecto/Iniciativa (24/11/2026). `mode` vacío = sin decidir (se exige elegir);
 * `independent` = ticket independiente / sin portafolio; `portfolio` = portafolio obligatorio y proyecto opcional,
 * siempre perteneciente a ese portafolio. Solo UUID del catálogo; nunca nombres escritos libremente.
 */
export interface PortfolioChoice { mode: '' | 'independent' | 'portfolio'; portfolio_id: string | null; initiative_id: string | null }
export const EMPTY_CHOICE: PortfolioChoice = { mode: '', portfolio_id: null, initiative_id: null }
export const choiceFromProject = (p: { portfolio_id?: string | null; initiative_id?: string | null }): PortfolioChoice =>
  p.portfolio_id ? { mode: 'portfolio', portfolio_id: p.portfolio_id, initiative_id: p.initiative_id ?? null } : { mode: 'independent', portfolio_id: null, initiative_id: null }

/** Mensaje de error o null. El proyecto debe pertenecer al portafolio elegido. */
export function validateChoice(c: PortfolioChoice, initiatives: Initiative[]): string | null {
  if (!c.mode) return 'Elige un portafolio o «Ticket independiente / Sin portafolio».'
  if (c.mode === 'independent') return c.portfolio_id || c.initiative_id ? 'Un ticket independiente no lleva portafolio ni proyecto.' : null
  if (!c.portfolio_id) return 'Selecciona el portafolio.'
  if (c.initiative_id && initiatives.find(i => i.id === c.initiative_id)?.portfolio_id !== c.portfolio_id) return 'El proyecto no pertenece al portafolio elegido.'
  return null
}
export const choiceIds = (c: PortfolioChoice) => c.mode === 'portfolio'
  ? { portfolio_id: c.portfolio_id, initiative_id: c.initiative_id } : { portfolio_id: null, initiative_id: null }
