import { useMemo } from 'react'
import { useSubprojectNames } from './useSubprojectNames'
import RequestedPriority from '../requests/RequestedPriority'
import ClientTicketStatus from './ClientTicketStatus'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useClientSession } from './ClientWorkspace'
import { shortDate } from './MyTickets'
import { clientPortal } from '../../lib/client-portal-api'
import type { ClientTicketDetail as Detail } from '../../lib/client-portal'
import { GENERAL_STATUS, MAIN_PATH } from '../../lib/request-status'
import Icon from '../ui/Icon'

/**
 * Detalle autorizado de un ticket propio: seguimiento general y datos enviados por el cliente.
 * Sin información interna (clasificación, responsables, prioridad, SLA, notas). Un ticket ajeno
 * o inexistente muestra el mismo mensaje.
 */
export default function ClientTicketDetail() {
  const { id = '' } = useParams()
  const { session, token, handleError, productName } = useClientSession()
  const [ticket, setTicket] = useState<Detail | null | undefined>(undefined)
  const nameOfSubproject = useSubprojectNames(useMemo(() => ticket ? [ticket] : [], [ticket]))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setTicket(undefined); setError(null)
    clientPortal.ticketDetail(token, id)
      .then(t => { if (alive) setTicket(t) })
      .catch(err => { if (alive) setError(handleError(err)) })
    return () => { alive = false }
  }, [token, id, handleError])

  const back = <Link to="/cliente/tickets" className="ui-button ui-button-quiet !px-0">← Mis tickets</Link>
  if (error) return <div className="space-y-4">{back}<p role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</p></div>
  if (ticket === undefined) return <p role="status" className="text-gray-600 py-10 text-center">Cargando ticket…</p>
  if (ticket === null) {
    return (
      <div className="space-y-4">
        {back}
        <div className="bg-surface rounded-xl border border-gray-200 p-10 text-center text-gray-600">
          No encontramos ese ticket entre los tuyos.
        </div>
      </div>
    )
  }

  const blocked = ticket.status === 'blocked'
  const rejected = ticket.status === 'rejected'
  const index = blocked ? MAIN_PATH.indexOf('approved_backlog') + 1 : MAIN_PATH.indexOf(ticket.status)
  const requesterLabel = ticket.requester_name_source === 'username' ? 'Usuario autenticado' : session.identity.kind === 'company_account' ? 'Solicitante (nombre declarado)' : 'Solicitante'

  return (
    <div className="space-y-4">
      {back}
      <article className="ticket-detail">
        <header className="px-5 sm:px-6 py-5 border-b border-gray-100 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-sm text-brand-700 mb-2">{ticket.request_number}</p>
            <h1 className="text-xl font-bold text-gray-900 break-words">{ticket.title}</h1>
          </div>
          <ClientTicketStatus status={ticket.status} />
        </header>

        {!rejected && (
          <ol className="px-5 sm:px-6 py-5 grid grid-cols-1 sm:grid-cols-5 gap-2" aria-label="Seguimiento">
            {MAIN_PATH.map((step, i) => {
              const done = i < index || (i === index && step === 'done')
              const current = i === index && !blocked && step !== 'done'
              return (
                <li key={step} aria-current={current ? 'step' : undefined}
                  className={`rounded-lg border px-3 py-2 text-xs font-medium ${done ? 'bg-green-50 border-green-200 text-green-800'
                    : current ? 'bg-accent-50 border-accent-300 text-gray-900' : 'bg-gray-50 border-gray-300 text-gray-600'}`}>
                  {done && <Icon name="check" size={14} className="inline-block mr-1 -mt-0.5" aria-label="Completado:" />}{GENERAL_STATUS[step].label}
                </li>
              )
            })}
          </ol>
        )}
        {blocked && <p className="mx-5 sm:mx-6 mb-4 text-sm text-yellow-800 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">El trabajo está temporalmente bloqueado.</p>}
        {rejected && ticket.rejection_reason && (
          <div className="mx-5 sm:mx-6 mt-5 text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <p className="font-semibold mb-1">Motivo</p>
            <p className="whitespace-pre-wrap">{ticket.rejection_reason}</p>
          </div>
        )}

        <dl className="px-5 sm:px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div><dt className="text-gray-500">Producto</dt><dd className="font-medium text-gray-900">{productName(ticket.system_id)}</dd></div>
          <div><dt className="text-gray-500">Fecha</dt><dd className="font-medium text-gray-900">{shortDate(ticket.created_at)}</dd></div>
          <div><dt className="text-gray-500">{requesterLabel}</dt><dd className="font-medium text-gray-900">{ticket.requester_name}</dd></div>
          <div><dt className="text-gray-500">Atención urgente solicitada</dt><dd className="font-medium text-gray-900">{ticket.urgent_requested ? 'Sí' : 'No'}</dd></div>
          <div><dt className="text-gray-500">Subproyecto solicitado</dt><dd>{nameOfSubproject(ticket.system_id, ticket.requested_subsystem_id)}</dd></div>
          <div><dt className="sr-only">Prioridad solicitada</dt><dd><RequestedPriority value={ticket.requested_priority} /></dd></div>
          <div className="sm:col-span-2">
            <dt className="text-gray-500 mb-1">Descripción</dt>
            <dd className="text-base text-gray-900 whitespace-pre-wrap break-words bg-gray-50 rounded-lg p-3">{ticket.description}</dd>
          </div>
        </dl>
      </article>
    </div>
  )
}
