import { useEffect, useState } from 'react'
import ControlLabel from '../ui/ControlLabel'
import Icon from '../ui/Icon'
import { supabase } from '../../lib/supabase'
import { errorMessage } from '../../lib/supabase-errors'
import { saveInitiative, savePortfolio, usePortfolios, type Initiative, type Portfolio } from '../../lib/portfolios'
import { PRIORITY_COLORS, PRIORITY_LABEL } from '../../lib/constants'
import { toast } from '../../lib/toast'
import { readVerifiedPages } from '../../lib/verified-pagination'

type TicketRow = { id: string; title: string; project_number: string | null; status: string; priority: string; portfolio_id: string | null; initiative_id: string | null }
const STATUS_ES: Record<string, string> = { active: 'Activo', completed: 'Completado', archived: 'Archivado' }

/**
 * Equipo › Portafolios y proyectos (24/11/2026). Portafolio → Proyecto/Iniciativa → tickets. Administradores crean,
 * editan y activan/desactivan (RPC de M19, validadas en el servidor); el resto del personal consulta. Sin borrado.
 * No se mezcla con las áreas PROCONT. Colaboradores, dependencias, hitos y frentes quedan para la fase 2.
 */
export default function PortfolioPanel({ canManage }: { canManage: boolean }) {
  const { portfolios, initiatives, error } = usePortfolios()
  const [tickets, setTickets] = useState<TicketRow[] | null>(null)
  const [ticketsError, setTicketsError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ kind: 'portfolio' | 'initiative'; id?: string; portfolio_id?: string; name: string; description: string } | null>(null)

  const loadTickets = async () => {
    setTickets(null); setTicketsError(null)
    try {
      const data = await readVerifiedPages((from, to) => supabase.from('projects')
        .select('id,title,project_number,status,priority,portfolio_id,initiative_id', { count: 'exact' })
        .neq('status', 'deleted').order('created_at', { ascending: false }).order('id', { ascending: true }).range(from, to))
      setTickets(data as TicketRow[])
    } catch (err) { setTicketsError(errorMessage(err)) }
  }
  useEffect(() => { void loadTickets() }, [])

  const run = async (op: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    try { await op(); toast.success(ok); return true } catch (err) { toast.error(err instanceof Error ? err.message : 'No se pudo guardar.'); return false }
    finally { setBusy(false) }
  }
  const save = async () => {
    if (!editing || !editing.name.trim()) return
    const payload = { name: editing.name.trim(), description: editing.description.trim() || null }
    const done = editing.kind === 'portfolio'
      ? await run(() => savePortfolio({ ...(editing.id ? { id: editing.id } : {}), ...payload }), editing.id ? 'Portafolio actualizado' : 'Portafolio creado')
      : await run(() => saveInitiative({ ...(editing.id ? { id: editing.id } : {}), portfolio_id: editing.portfolio_id!, ...payload }), editing.id ? 'Proyecto actualizado' : 'Proyecto creado')
    if (done) setEditing(null)
  }
  const toggle = (item: Portfolio | Initiative, kind: 'portfolio' | 'initiative') => run(
    () => kind === 'portfolio'
      ? savePortfolio({ id: item.id, name: item.name, description: item.description, is_active: !item.is_active })
      : saveInitiative({ id: item.id, portfolio_id: (item as Initiative).portfolio_id, name: item.name, description: item.description, is_active: !item.is_active }),
    item.is_active ? 'Desactivado' : 'Activado')

  const count = (pred: (t: TicketRow) => boolean) => (tickets ?? []).filter(pred)
  const independent = count(t => !t.portfolio_id)

  // Lista de tickets asociados; se reutiliza para proyectos, portafolio sin proyecto e independientes.
  const ticketList = (rows: TicketRow[], label: string) => rows.length ? (
    <ul className="portfolio-tickets" aria-label={label}>
      {rows.map(t => (
        <li key={t.id}>
          <span className="card-number">{t.project_number ?? '—'}</span>
          <span className="portfolio-ticket-title">{t.title}</span>
          <span className={`prio-chip ${PRIORITY_COLORS[t.priority] ?? ''}`}>{PRIORITY_LABEL[t.priority] ?? t.priority}</span>
          <span className="portfolio-ticket-status">{STATUS_ES[t.status] ?? t.status}</span>
        </li>
      ))}
    </ul>
  ) : <p className="portfolio-description">Aún no hay tickets en este proyecto.</p>
  const toggleRow = (key: string, text: string, rows: TicketRow[]) => (
    <button type="button" className="initiative-toggle" aria-expanded={open === key} onClick={() => setOpen(open === key ? null : key)}>
      <Icon name="arrow" size={14} className={`transition-transform ${open === key ? 'rotate-90' : ''}`} aria-hidden="true" />
      <span>{text}</span>
      <span className="portfolio-count">{rows.length} ticket{rows.length === 1 ? '' : 's'}</span>
    </button>
  )

  const editor = editing && (
    <form className="portfolio-editor" onSubmit={e => { e.preventDefault(); void save() }} aria-label={editing.kind === 'portfolio' ? 'Datos del portafolio' : 'Datos del proyecto'}>
      <label className="nt-field" htmlFor="pf-name"><span>{editing.kind === 'portfolio' ? 'Nombre del portafolio' : 'Nombre del proyecto / iniciativa'} *</span>
        <input id="pf-name" className="ui-input" maxLength={editing.kind === 'portfolio' ? 120 : 160} value={editing.name} autoFocus
          onChange={e => setEditing({ ...editing, name: e.target.value })} />
      </label>
      <label className="nt-field" htmlFor="pf-description"><span>Descripción <small>(opcional)</small></span>
        <textarea id="pf-description" className="ui-input" rows={2} maxLength={editing.kind === 'portfolio' ? 2000 : 4000} value={editing.description}
          onChange={e => setEditing({ ...editing, description: e.target.value })} />
      </label>
      <div className="portfolio-editor-actions">
        <button type="button" className="ui-button ui-button-quiet" onClick={() => setEditing(null)}>Cancelar</button>
        <button type="submit" className="ui-button ui-button-primary" disabled={busy || !editing.name.trim()}>Guardar</button>
      </div>
    </form>
  )

  return (
    <div className="portfolio-panel space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium text-gray-900">Portafolios y proyectos</h2>
          <p className="text-sm text-gray-600">Portafolio → Proyecto / Iniciativa → tickets → checklist. {canManage ? 'Sin borrado: desactiva lo que ya no uses.' : 'Solo lectura para tu rol.'}</p>
        </div>
        {canManage && !editing && (
          <button type="button" className="ui-button ui-button-primary" onClick={() => setEditing({ kind: 'portfolio', name: '', description: '' })}>
            <ControlLabel icon="plus">Nuevo portafolio</ControlLabel>
          </button>
        )}
      </div>
      {(error || ticketsError) && <p role="alert" className="field-error">{error || ticketsError}</p>}
      {tickets === null && !ticketsError && <p className="text-sm text-gray-600" role="status">Cargando tickets asociados…</p>}
      {editing && !editing.id && editing.kind === 'portfolio' && editor}

      <ul className="portfolio-list">
        {portfolios.map(p => {
          const pTickets = count(t => t.portfolio_id === p.id)
          const items = initiatives.filter(i => i.portfolio_id === p.id)
          return (
            <li key={p.id} className={p.is_active ? '' : 'is-inactive'}>
              <div className="portfolio-row">
                <span className="portfolio-name"><Icon name="layers" size={16} aria-hidden="true" />{p.name}
                  {!p.is_active && <span className="portfolio-tag">Inactivo</span>}
                  <span className="portfolio-count">{pTickets.length} ticket{pTickets.length === 1 ? '' : 's'}</span></span>
                {canManage && (
                  <span className="portfolio-actions">
                    <button type="button" className="ui-button ui-button-quiet" onClick={() => setEditing({ kind: 'portfolio', id: p.id, name: p.name, description: p.description ?? '' })}>Editar</button>
                    <button type="button" className="ui-button ui-button-quiet" disabled={busy} onClick={() => void toggle(p, 'portfolio')}>{p.is_active ? 'Desactivar' : 'Activar'}</button>
                  </span>
                )}
              </div>
              {p.description && <p className="portfolio-description">{p.description}</p>}
              {editing?.kind === 'portfolio' && editing.id === p.id && editor}
              <ul className="initiative-list" aria-label={`Proyectos de ${p.name}`}>
                {items.map(i => {
                  const iTickets = count(t => t.initiative_id === i.id)
                  const expanded = open === i.id
                  return (
                    <li key={i.id} className={i.is_active ? '' : 'is-inactive'}>
                      <div className="portfolio-row">
                        <button type="button" className="initiative-toggle" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : i.id)}>
                          <Icon name="arrow" size={14} className={`transition-transform ${expanded ? 'rotate-90' : ''}`} aria-hidden="true" />
                          <span>{i.name}</span>{!i.is_active && <span className="portfolio-tag">Inactivo</span>}
                          <span className="portfolio-count">{iTickets.length} ticket{iTickets.length === 1 ? '' : 's'}</span>
                        </button>
                        {canManage && (
                          <span className="portfolio-actions">
                            <button type="button" className="ui-button ui-button-quiet" onClick={() => setEditing({ kind: 'initiative', id: i.id, portfolio_id: p.id, name: i.name, description: i.description ?? '' })}>Editar</button>
                            <button type="button" className="ui-button ui-button-quiet" disabled={busy} onClick={() => void toggle(i, 'initiative')}>{i.is_active ? 'Desactivar' : 'Activar'}</button>
                          </span>
                        )}
                      </div>
                      {editing?.kind === 'initiative' && editing.id === i.id && editor}
                      {expanded && ticketList(iTickets, `Tickets de ${i.name}`)}
                    </li>
                  )
                })}
                {(() => {
                  // Tickets del portafolio sin proyecto específico: antes solo sumaban al total y no se podían consultar.
                  const direct = count(t => t.portfolio_id === p.id && !t.initiative_id)
                  if (!direct.length) return null
                  return (
                    <li>
                      <div className="portfolio-row">{toggleRow(`direct-${p.id}`, 'Sin proyecto específico', direct)}</div>
                      {open === `direct-${p.id}` && ticketList(direct, `Tickets de ${p.name} sin proyecto específico`)}
                    </li>
                  )
                })()}
              </ul>
              {canManage && p.is_active && !(editing?.kind === 'initiative' && !editing.id && editing.portfolio_id === p.id) && (
                <button type="button" className="ui-button ui-button-secondary portfolio-add" onClick={() => setEditing({ kind: 'initiative', portfolio_id: p.id, name: '', description: '' })}>
                  <ControlLabel icon="plus">{`Nuevo proyecto en ${p.name}`}</ControlLabel>
                </button>
              )}
              {editing?.kind === 'initiative' && !editing.id && editing.portfolio_id === p.id && editor}
            </li>
          )
        })}
      </ul>
      {tickets !== null && (
        <section className="portfolio-independent" aria-label="Tickets independientes">
          <div className="portfolio-row">{toggleRow('independent', 'Tickets independientes (sin portafolio)', independent)}</div>
          {open === 'independent' && ticketList(independent, 'Tickets independientes')}
        </section>
      )}
    </div>
  )
}
