import { useEffect, useState } from 'react'
import type { PublicTracking } from '../../lib/operations'
import { GENERAL_STATUS } from '../../lib/request-status'
import { errorMessage } from '../../lib/supabase-errors'
import Icon from '../ui/Icon'

type Outcome = { kind: 'loading' } | { kind: 'found'; result: PublicTracking } | { kind: 'not-found' } | { kind: 'error'; message: string }

/**
 * Resultado del seguimiento público (chunk diferido: solo se descarga al consultar o al acercarse a la tarjeta).
 * Consulta el contrato existente `track_request_status` y muestra EXCLUSIVAMENTE número REQ y estado general.
 * Cada `nonce` nuevo es una consulta nueva; una respuesta tardía de una consulta anterior se descarta.
 */
export default function TrackingOutcome({ number, nonce, onBusy }: { number: string; nonce: number; onBusy: (busy: boolean) => void }) {
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let current = true
    setOutcome({ kind: 'loading' }); onBusy(true)
    import('../../lib/api')
      .then(({ operations }) => operations.trackRequest(number))
      .then(found => { if (current) setOutcome(found ? { kind: 'found', result: found } : { kind: 'not-found' }) })
      .catch(err => { if (current) setOutcome({ kind: 'error', message: errorMessage(err) }) })
      .finally(() => { if (current) onBusy(false) })
    return () => { current = false }
  }, [number, nonce, attempt, onBusy])

  if (outcome.kind === 'loading') return <p role="status" className="portal-tracking-note">Buscando {number}…</p>
  if (outcome.kind === 'not-found') return <p role="status" className="portal-tracking-note">No encontramos la solicitud {number}. Verifica el número e inténtalo de nuevo.</p>
  if (outcome.kind === 'error') return (
    <div role="alert" className="tracking-error">
      <p>No pudimos consultar el estado: {outcome.message}</p>
      <button type="button" className="ui-button ui-button-secondary" onClick={() => setAttempt(a => a + 1)}>
        <Icon name="refresh" size={18} /><span>Reintentar</span>
      </button>
    </div>
  )
  const status = GENERAL_STATUS[outcome.result.status]
  return (
    <div data-testid="public-tracking-result" role="status" className="tracking-outcome">
      <strong className="font-mono tracking-number">{outcome.result.request_number}</strong>
      <span className={`inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1 rounded-full border ${status.tone}`}>
        <Icon name={status.icon} size={14} />{status.label}
      </span>
    </div>
  )
}
