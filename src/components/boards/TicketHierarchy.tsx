import { usePortfolios } from '../../lib/portfolios'
import { EMPTY_PRODUCTS, ticketHierarchy, type HierarchyTicket, type ProductCatalog } from '../../lib/ticket-hierarchy'
export default function TicketHierarchy({ ticket, products = EMPTY_PRODUCTS, className = '' }: { ticket: HierarchyTicket; products?: ProductCatalog; className?: string }) {
  const names = ticketHierarchy(ticket, products, usePortfolios())
  return <dl className={`card-hierarchy ticket-hierarchy ${className}`} aria-label="Producto → Subproducto → Portafolio → Proyecto">
    {([['Producto', 'product'], ['Subproducto', 'subproduct'], ['Portafolio', 'portfolio'], ['Proyecto', 'project']] as const).map(([label, key]) =>
      <div className="hierarchy-item" key={key}><dt>{label}</dt><dd className={`card-tag ${key === 'portfolio' && !ticket.portfolio_id ? 'card-tag-none' : ''} card-tag-${key === 'subproduct' ? 'subproduct' : key === 'product' ? 'product' : key === 'portfolio' ? 'portfolio' : 'project'}`}>{names[key]}</dd></div>)}
  </dl>
}
