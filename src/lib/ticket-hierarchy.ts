import type { Portfolio, Initiative } from './portfolio-model'
export interface ProductCatalog {
  systems: { id: string; name: string }[]
  subsystems: { id: string; system_id: string; name: string }[]
}
export interface TicketClassification {
  system_id?: string | null
  subsystem_id?: string | null
  requested_subsystem_id?: string | null
}
export interface HierarchyTicket {
  portfolio_id?: string | null
  initiative_id?: string | null
  requests?: TicketClassification | TicketClassification[] | null
}
export const EMPTY_PRODUCTS: ProductCatalog = { systems: [], subsystems: [] }
export function productPairError(systemId: string | null | undefined, subId: string | null | undefined, catalog: ProductCatalog): string | null {
  if (!subId) return null
  return catalog.subsystems.some(s => s.id === subId && s.system_id === systemId) ? null : 'El subproducto no pertenece al producto seleccionado.'
}
/** Catalog subsystem is a subproduct. An operational project is a portfolio initiative, never a subsystem. */
export function ticketHierarchy(ticket: HierarchyTicket, products: ProductCatalog, portfolios: { portfolios: Portfolio[]; initiatives: Initiative[] }) {
  const request = Array.isArray(ticket.requests) ? ticket.requests[0] : ticket.requests
  const sid = request?.system_id
  const subId = request?.subsystem_id ?? request?.requested_subsystem_id
  const product = products.systems.find(s => s.id === sid)
  const sub = products.subsystems.find(s => s.id === subId && s.system_id === sid)
  const portfolio = portfolios.portfolios.find(p => p.id === ticket.portfolio_id)
  const initiative = portfolios.initiatives.find(i => i.id === ticket.initiative_id && i.portfolio_id === ticket.portfolio_id)
  return {
    product: product?.name ?? (sid ? 'Producto no disponible' : 'Sin producto'),
    subproduct: sub?.name ?? (subId ? 'Subproducto no disponible' : 'Sin subproducto'),
    portfolio: portfolio?.name ?? (ticket.portfolio_id ? 'Portafolio no disponible' : 'Sin portafolio'),
    project: initiative?.name ?? (ticket.initiative_id ? 'Proyecto no disponible' : 'Sin proyecto específico'),
  }
}
