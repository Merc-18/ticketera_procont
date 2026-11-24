import { useState } from 'react'
import ModalFocus from '../ui/ModalFocus'
import ControlLabel from '../ui/ControlLabel'
import Icon from '../ui/Icon'
import { saveInitiative, savePortfolio, usePortfolios } from '../../lib/portfolios'
import { toast } from '../../lib/toast'

/**
 * Catálogo de Portafolios e iniciativas (solo admin/superadmin; el servidor lo vuelve a comprobar). Sin borrado:
 * se desactivan, y lo ya asignado conserva su referencia.
 */
export default function PortfolioManagerModal({ onClose }: { onClose: () => void }) {
  const { portfolios, initiatives, error } = usePortfolios()
  const [busy, setBusy] = useState(false)
  const [newPortfolio, setNewPortfolio] = useState('')
  const [newInitiative, setNewInitiative] = useState<Record<string, string>>({})

  const run = async (op: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    try { await op(); toast.success(ok) } catch (err) { toast.error(err instanceof Error ? err.message : 'No se pudo guardar.') }
    finally { setBusy(false) }
  }

  return (
    <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center">
      <div role="dialog" aria-modal="true" aria-labelledby="portfolio-manager-title" className="modal-panel w-full max-w-2xl flex flex-col">
        <ModalFocus onDismiss={onClose} />
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 id="portfolio-manager-title" className="text-lg font-medium text-gray-900"><ControlLabel icon="layers">Portafolios</ControlLabel></h2>
            <p className="text-sm text-gray-600">Portafolio → iniciativa de largo alcance → tickets del tablero → checklist.</p>
          </div>
          <button aria-label="Cerrar" onClick={onClose}><Icon name="close" size={20} /></button>
        </div>
        <div className="overflow-y-auto px-6 py-5 space-y-5">
          {error && <p role="alert" className="field-error">{error}</p>}
          <form className="portfolio-new" onSubmit={e => { e.preventDefault(); if (newPortfolio.trim()) void run(() => savePortfolio({ name: newPortfolio.trim() }).then(() => setNewPortfolio('')), 'Portafolio creado') }}>
            <label htmlFor="new-portfolio" className="toolbar-field grow"><span>Nuevo portafolio</span>
              <input id="new-portfolio" className="ui-input" value={newPortfolio} maxLength={120} onChange={e => setNewPortfolio(e.target.value)} placeholder="Ej.: Gestión" />
            </label>
            <button type="submit" className="ui-button ui-button-secondary" disabled={busy || !newPortfolio.trim()}><ControlLabel icon="plus">Crear</ControlLabel></button>
          </form>
          {portfolios.length === 0 && <p className="text-gray-600">Aún no hay portafolios.</p>}
          <ul className="portfolio-list">
            {portfolios.map(p => (
              <li key={p.id} className={p.is_active ? '' : 'is-inactive'}>
                <div className="portfolio-row">
                  <span className="portfolio-name"><Icon name="layers" size={16} aria-hidden="true" />{p.name}{!p.is_active && <span className="portfolio-tag">Inactivo</span>}</span>
                  <button type="button" className="ui-button ui-button-quiet" disabled={busy}
                    onClick={() => void run(() => savePortfolio({ id: p.id, name: p.name, description: p.description, is_active: !p.is_active }), p.is_active ? 'Portafolio desactivado' : 'Portafolio activado')}>
                    {p.is_active ? 'Desactivar' : 'Activar'}
                  </button>
                </div>
                <ul className="initiative-list" aria-label={`Iniciativas de ${p.name}`}>
                  {initiatives.filter(i => i.portfolio_id === p.id).map(i => (
                    <li key={i.id} className={`portfolio-row ${i.is_active ? '' : 'is-inactive'}`}>
                      <span>{i.name}{!i.is_active && <span className="portfolio-tag">Inactiva</span>}</span>
                      <button type="button" className="ui-button ui-button-quiet" disabled={busy}
                        onClick={() => void run(() => saveInitiative({ id: i.id, portfolio_id: p.id, name: i.name, description: i.description, is_active: !i.is_active }), i.is_active ? 'Iniciativa desactivada' : 'Iniciativa activada')}>
                        {i.is_active ? 'Desactivar' : 'Activar'}
                      </button>
                    </li>
                  ))}
                </ul>
                {p.is_active && (
                  <form className="portfolio-new" onSubmit={e => { e.preventDefault(); const name = newInitiative[p.id]?.trim(); if (name) void run(() => saveInitiative({ portfolio_id: p.id, name }).then(() => setNewInitiative(v => ({ ...v, [p.id]: '' }))), 'Iniciativa creada') }}>
                    <label className="toolbar-field grow"><span>Nueva iniciativa en {p.name}</span>
                      <input className="ui-input" value={newInitiative[p.id] ?? ''} maxLength={160} onChange={e => setNewInitiative(v => ({ ...v, [p.id]: e.target.value }))} placeholder="Ej.: Beneficiarios finales" />
                    </label>
                    <button type="submit" className="ui-button ui-button-secondary" disabled={busy || !newInitiative[p.id]?.trim()}><ControlLabel icon="plus">Agregar</ControlLabel></button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex justify-end px-6 py-4 border-t">
          <button onClick={onClose} className="ui-button ui-button-secondary">Cerrar</button>
        </div>
      </div>
    </div>
  )
}
