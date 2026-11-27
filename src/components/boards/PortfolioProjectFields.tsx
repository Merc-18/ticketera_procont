import { usePortfolios, type PortfolioChoice } from '../../lib/portfolios'

/**
 * Portafolio → Proyecto/Iniciativa con selección dependiente (24/11/2026). El proyecto solo lista los del portafolio
 * elegido; «Ticket independiente / Sin portafolio» es una opción explícita (no se asigna nada por defecto).
 * Un valor ya asignado que hoy está inactivo se sigue mostrando para no perderlo al editar.
 */
export default function PortfolioProjectFields({ idPrefix, value, onChange, disabled, invalid, layout = 'grid' }: {
  idPrefix: string; value: PortfolioChoice; onChange: (v: PortfolioChoice) => void; disabled?: boolean; invalid?: boolean; layout?: 'grid' | 'stack'
}) {
  const { portfolios, initiatives } = usePortfolios()
  const portfolioValue = value.mode === 'independent' ? 'independent' : value.mode === 'portfolio' ? value.portfolio_id ?? '' : ''
  const projects = initiatives.filter(i => i.portfolio_id === value.portfolio_id && (i.is_active || i.id === value.initiative_id))
  return (
    <div className={`portfolio-fields portfolio-fields-${layout}`}>
      <label className="nt-field" htmlFor={`${idPrefix}-portfolio`}><span>Portafolio</span>
        <select id={`${idPrefix}-portfolio`} className="ui-input" value={portfolioValue} disabled={disabled}
          aria-invalid={invalid && !value.mode ? true : undefined}
          onChange={e => {
            const v = e.target.value
            onChange(v === 'independent' ? { mode: 'independent', portfolio_id: null, initiative_id: null }
              : v ? { mode: 'portfolio', portfolio_id: v, initiative_id: null } : { mode: '', portfolio_id: null, initiative_id: null })
          }}>
          <option value="">Selecciona…</option>
          <option value="independent">Ticket independiente / Sin portafolio</option>
          {portfolios.filter(p => p.is_active || p.id === value.portfolio_id).map(p => (
            <option key={p.id} value={p.id}>{p.name}{p.is_active ? '' : ' (inactivo)'}</option>
          ))}
        </select>
      </label>
      <label className="nt-field" htmlFor={`${idPrefix}-project`}><span>Proyecto</span>
        <select id={`${idPrefix}-project`} className="ui-input" value={value.initiative_id ?? ''} disabled={disabled || value.mode !== 'portfolio'}
          onChange={e => onChange({ ...value, initiative_id: e.target.value || null })}>
          <option value="">{value.mode === 'portfolio' ? (projects.length ? 'Sin proyecto específico' : 'Este portafolio no tiene proyectos') : value.mode === 'independent' ? 'No aplica (ticket independiente)' : 'Elige primero el portafolio'}</option>
          {projects.map(i => <option key={i.id} value={i.id}>{i.name}{i.is_active ? '' : ' (inactivo)'}</option>)}
        </select>
      </label>
    </div>
  )
}
