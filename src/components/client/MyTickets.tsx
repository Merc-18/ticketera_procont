import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useClientSession } from './ClientWorkspace'
import { clientPortal } from '../../lib/client-portal-api'
import type { ClientTicketSummary } from '../../lib/client-portal'
import { GENERAL_STATUS } from '../../lib/request-status'

export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: 'short', year: 'numeric' })

/**
 * Tickets de la identidad autenticada (filtrados por el servidor):
 * Quipu → del usuario individual; QuipuFac → de la cuenta empresarial, con el nombre declarado.
 */
export default function MyTickets() {
  const { session, token, handleError, productName } = useClientSession()
  const [tickets, setTickets] = useState<ClientTicketSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const companyAccount = session.identity.kind === 'company_account'

  useEffect(() => {
    let alive = true
    clientPortal.listMyTickets(token)
      .then(list => { if (alive) setTickets(list) })
      .catch(err => { if (alive) setError(handleError(err)) })
    return () => { alive = false }
  }, [token, handleError])

  return (
    <section className="my-tickets">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-brand-700">Mis tickets</h1>
        <p className="text-sm text-gray-600 mt-1">
          {companyAccount
            ? 'Tickets registrados con la cuenta empresarial QuipuFac. El solicitante es el nombre declarado en cada ticket.'
            : 'Tickets registrados con tu usuario Quipu.'}
        </p>
      </div>

      {error ? (
        <p role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</p>
      ) : tickets === null ? (
        <p className="text-gray-400 py-10 text-center">Cargando tickets…</p>
      ) : tickets.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-gray-600 mb-4">Aún no tienes tickets registrados.</p>
          <Link to="/cliente/nuevo" className="inline-block bg-accent-400 hover:bg-accent-300 text-gray-900 px-5 py-2.5 rounded-lg font-bold transition">
            Crear un ticket
          </Link>
        </div>
      ) : (
        <>
          {/* Escritorio: tabla */}
          <div className="ticket-table hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-brand-50 text-brand-800 text-left">
                <tr>
                  <th className="px-4 py-3 font-semibold">Número</th>
                  <th className="px-4 py-3 font-semibold">Producto</th>
                  <th className="px-4 py-3 font-semibold">Título</th>
                  {companyAccount && <th className="px-4 py-3 font-semibold">Solicitante (declarado)</th>}
                  <th className="px-4 py-3 font-semibold">Fecha</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tickets.map(t => {
                  const s = GENERAL_STATUS[t.status]
                  return (
                    <tr key={t.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-bold">
                        <Link to={`/cliente/tickets/${t.id}`} className="text-brand-700 hover:underline">{t.request_number}</Link>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{productName(t.system_id)}</td>
                      <td className="px-4 py-3 text-gray-900 max-w-xs truncate" title={t.title}>{t.title}</td>
                      {companyAccount && <td className="px-4 py-3 text-gray-700">{t.requester_name}</td>}
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{shortDate(t.created_at)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap ${s.tone}`}>{s.icon} {s.label}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Móvil: tarjetas */}
          <ul className="md:hidden space-y-3">
            {tickets.map(t => {
              const s = GENERAL_STATUS[t.status]
              return (
                <li key={t.id}>
                  <Link to={`/cliente/tickets/${t.id}`}
                    className="ticket-mobile-card hover:border-brand-400">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-mono text-brand-700">{t.request_number}</span>
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${s.tone}`}>{s.icon} {s.label}</span>
                    </div>
                    <p className="text-gray-900 font-medium">{t.title}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {productName(t.system_id)} · {shortDate(t.created_at)}{companyAccount && <> · {t.requester_name} (declarado)</>}
                    </p>
                  </Link>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}
