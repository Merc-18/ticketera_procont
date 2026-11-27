import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useClientSession } from './ClientWorkspace'
import { clientPortal } from '../../lib/client-portal-api'
import type { ClientTicketSummary } from '../../lib/client-portal'
import ClientTicketStatus from './ClientTicketStatus'
import RequestedPriority from '../requests/RequestedPriority'
import { REQUESTED_PRIORITIES } from '../../lib/client-request-data'
import { useSubprojectNames } from './useSubprojectNames'
import Icon from '../ui/Icon'

export const shortDate = (iso: string) => new Date(iso).toLocaleDateString('es-PE', {
  timeZone: 'America/Lima', day: '2-digit', month: 'short', year: 'numeric',
})
const EMPTY: ClientTicketSummary[] = []
const PAGE_SIZE = 50

/** Una página autorizada por consulta. La propiedad y el orden los decide el servidor. */
export default function MyTickets() {
  const { session, token, handleError, productName } = useClientSession()
  const company = session.identity.kind === 'company_account'
  const [tickets, setTickets] = useState<ClientTicketSummary[] | null>(null)
  const [offset, setOffset] = useState(0)
  const [history, setHistory] = useState<number[]>([])
  const [busy, setBusy] = useState(false)
  const [end, setEnd] = useState(false)
  const [failed, setFailed] = useState<{ target: number; previous: number[]; first: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const sequence = useRef(0)
  const nameOfSubproject = useSubprojectNames(tickets ?? EMPTY)
  const load = useCallback(async (target: number, previous: number[], first = false) => {
    const call = ++sequence.current
    setBusy(true); setError(null); setFailed(null)
    try {
      const page = await clientPortal.listMyTickets(token, { limit: PAGE_SIZE, offset: target })
      if (sequence.current !== call) return
      if (!page.length && target > 0) { setEnd(true); return }
      // Menos de PAGE_SIZE resultados: es la última página (el servidor devuelve hasta `limit`); con 50 exactos se confirma con [].
      setTickets(page); setOffset(target); setHistory(previous); setEnd(page.length < PAGE_SIZE)
    } catch (err) {
      if (sequence.current === call) { setError(handleError(err)); setFailed({ target, previous, first }); if (first) setTickets(null) }
    } finally { if (sequence.current === call) setBusy(false) }
  }, [token, handleError])
  useEffect(() => {
    void load(0, [], true)
    return () => { sequence.current++ }
  }, [load])
  const nextOffset = offset + (tickets?.length ?? 0)
  return <section className="my-tickets" aria-busy={busy}>
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-2xl font-bold text-brand-700">Mis tickets</h1>
        <p className="text-sm text-gray-600 mt-1">{company
          ? 'Solicitudes de la cuenta empresarial QuipuFac, con el nombre declarado en cada ticket.'
          : 'Solicitudes registradas con tu usuario Quipu.'}</p></div>
      <Link to="/cliente/nuevo" className="ui-button ui-button-secondary"><Icon name="plus" size={18} />Nuevo ticket</Link>
    </div>
    {error && <div role="alert" className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg mb-4">
      <p>{error}</p><button className="ui-button ui-button-secondary mt-2" disabled={busy} onClick={() => failed && void load(failed.target, failed.previous, failed.first)}>Reintentar página</button>
    </div>}
    {tickets === null ? !error && <p role="status" className="py-10 text-center text-gray-600">Cargando tickets…</p>
      : !tickets.length ? <div className="empty-state">
        <span className="kpi-tile tone-brand" aria-hidden="true"><Icon name="tickets" size={22} /></span>
        <p>Aún no tienes tickets registrados.</p>
        <Link to="/cliente/nuevo" className="ui-button ui-button-primary">Crear un ticket</Link>
      </div> : <>
        <div className="ticket-table hidden lg:block overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Solicitudes de tu sesión. Abre el número REQ para consultar el detalle.</caption>
            <thead className="bg-brand-50 text-brand-800"><tr>
              {['Número REQ', 'Producto / subproducto', 'Título', ...(company ? ['Solicitante (declarado)'] : []), 'Fecha', 'Prioridad solicitada', 'Estado'].map(label => <th key={label} scope="col" className="px-4 py-3">{label}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-gray-100">{tickets.map(t => <tr key={t.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 whitespace-nowrap"><Link to={`/cliente/tickets/${t.id}`} aria-label={`Ver detalle de ${t.request_number}`} className="text-brand-700 hover:underline">{t.request_number}</Link></td>
              <td className="px-4 py-3"><p>{productName(t.system_id)}</p>{t.requested_subsystem_id && <p className="text-xs text-gray-500">{nameOfSubproject(t.system_id, t.requested_subsystem_id)}</p>}</td>
              <td className="px-4 py-3 max-w-xs break-words">{t.title}</td>
              {company && <td className="px-4 py-3 break-words">{t.requester_name}</td>}
              <td className="px-4 py-3 whitespace-nowrap"><time dateTime={t.created_at}>{shortDate(t.created_at)}</time></td>
              <td className="px-4 py-3">{t.requested_priority ? REQUESTED_PRIORITIES[t.requested_priority] : 'Sin registro'}</td>
              <td className="px-4 py-3"><ClientTicketStatus status={t.status} /></td>
            </tr>)}</tbody>
          </table>
        </div>
        <ul className="lg:hidden space-y-3" aria-label="Solicitudes de tu sesión">{tickets.map(t => <li key={t.id}>
          <Link to={`/cliente/tickets/${t.id}`} className="ticket-mobile-card" aria-label={`Ver detalle de ${t.request_number}: ${t.title}`}>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3"><span className="font-mono text-brand-700">{t.request_number}</span><ClientTicketStatus status={t.status} /></div>
            <p className="font-medium text-gray-900 break-words">{t.title}</p>
            {company && <p className="text-sm text-gray-600 mt-2 break-words">Solicitante: {t.requester_name}</p>}
            <p className="text-sm text-gray-700 mt-2">{productName(t.system_id)}</p>
            {t.requested_subsystem_id && <p className="text-sm text-gray-600">{nameOfSubproject(t.system_id, t.requested_subsystem_id)}</p>}
            <p className="text-xs text-gray-500 my-2"><time dateTime={t.created_at}>{shortDate(t.created_at)}</time></p>
            <RequestedPriority value={t.requested_priority} />
            <span className="flex items-center gap-2 text-brand-700 text-sm mt-4">Ver detalle<Icon name="arrow" size={16} /></span>
          </Link>
        </li>)}</ul>
        <nav aria-label="Paginación de mis tickets" className="flex flex-wrap items-center justify-between gap-3 mt-5">
          <button className="ui-button ui-button-secondary" disabled={busy || !history.length} onClick={() => void load(history[history.length - 1], history.slice(0, -1))}>Anterior</button>
          <span className="text-sm text-gray-600" role="status">{busy ? 'Cargando página…' : `Página ${history.length + 1} · ${tickets.length} solicitudes`}</span>
          <button className="ui-button ui-button-secondary" disabled={busy || end || nextOffset > 100000} onClick={() => void load(nextOffset, [...history, offset])}>Siguiente</button>
        </nav>
        {end && <p role="status" className="text-sm text-gray-600 mt-3">No hay más solicitudes.</p>}
        {nextOffset > 100000 && <p role="status" className="text-sm text-gray-600 mt-3">Se alcanzó el límite de consulta de este acceso.</p>}
      </>}
  </section>
}
