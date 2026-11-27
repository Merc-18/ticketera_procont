import { usePortfolios } from '../../lib/portfolios'
import { EMPTY_PRODUCTS, ticketHierarchy, type HierarchyTicket, type ProductCatalog } from '../../lib/ticket-hierarchy'
export default function TicketHierarchy({ ticket, products = EMPTY_PRODUCTS, className = '', compact = false }: { ticket: HierarchyTicket; products?: ProductCatalog; className?: string; compact?: boolean }) {
  const names = ticketHierarchy(ticket, products, usePortfolios())
  if (compact) return <div className={`card-hierarchy card-hierarchy-compact ${className}`} aria-label="Producto → Subproducto → Proyecto">
    <p className="card-product-line" title={`${names.product} · ${names.subproduct}`}>
      <span className="card-tag-product" title={names.product}>{names.product}</span><span aria-hidden="true"> · </span><span className="card-tag-subproduct" title={names.subproduct}>{names.subproduct}</span>
    </p>
    <p className="card-project-line card-tag-project" title={names.project} aria-label={`Proyecto: ${names.project}`}>{names.project}</p>
  </div>
  return <dl className={`card-hierarchy ticket-hierarchy ${className}`} aria-label="Producto → Subproducto → Portafolio → Proyecto">
    {([['Producto', 'product'], ['Subproducto', 'subproduct'], ['Portafolio', 'portfolio'], ['Proyecto', 'project']] as const).map(([label, key]) =>
      <div className="hierarchy-item" key={key}><dt>{label}</dt><dd className={`card-tag ${key === 'portfolio' && !ticket.portfolio_id ? 'card-tag-none' : ''} card-tag-${key === 'subproduct' ? 'subproduct' : key === 'product' ? 'product' : key === 'portfolio' ? 'portfolio' : 'project'}`}>{names[key]}</dd></div>)}
  </dl>
}
