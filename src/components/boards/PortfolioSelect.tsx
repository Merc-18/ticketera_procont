import { usePortfolios, type Initiative, type Portfolio } from '../../lib/portfolios'

/**
 * Selector único de Portafolio → iniciativa: cada portafolio activo es un grupo con la opción «todo el portafolio» y sus
 * iniciativas. Un valor ya asignado que hoy está inactivo se sigue mostrando (no se pierde al editar).
 */
export default function PortfolioSelect({ id, value, onChange, emptyLabel = 'Sin portafolio', disabled, className = 'ui-input', extraOptions }: {
  id?: string; value: string; onChange: (value: string) => void; emptyLabel?: string; disabled?: boolean; className?: string
  extraOptions?: { value: string; label: string }[]
}) {
  const { portfolios, initiatives } = usePortfolios()
  const keep = (p: Portfolio | Initiative, prefix: string) => p.is_active || value === `${prefix}:${p.id}`
  return (
    <select id={id} value={value} onChange={e => onChange(e.target.value)} disabled={disabled} className={className}>
      {extraOptions?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      <option value="">{emptyLabel}</option>
      {portfolios.filter(p => keep(p, 'p') || initiatives.some(i => i.portfolio_id === p.id && keep(i, 'i'))).map(p => (
        <optgroup key={p.id} label={`Portafolio: ${p.name}`}>
          <option value={`p:${p.id}`}>{p.name} (todo el portafolio){p.is_active ? '' : ' · inactivo'}</option>
          {initiatives.filter(i => i.portfolio_id === p.id && keep(i, 'i')).map(i => (
            <option key={i.id} value={`i:${i.id}`}>{p.name} · {i.name}{i.is_active ? '' : ' · inactiva'}</option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}
