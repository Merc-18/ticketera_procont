import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import Icon from '../ui/Icon'

const CURRENT_PREFIX = `REQ${new Date().getFullYear().toString().slice(2)}-`
const REQ_FORMAT = /^REQ\d{2}-\d{3,}$/
// Consulta y resultado en un chunk diferido (Taste perf.md): se pide al acercarse a la tarjeta (foco, puntero o
// toque) o al buscar; quien no usa el seguimiento (p. ej. el personal que entra al panel) no lo descarga.
const loadOutcome = () => import('./TrackingOutcome')
const TrackingOutcome = lazy(loadOutcome)
const preload = () => { loadOutcome().catch(() => undefined) }

/** Solo dígitos → número completo con el prefijo del año actual (1 → REQ26-001); si no, mayúsculas. */
export function normalizeRequestNumber(raw: string) {
  const value = raw.trim()
  return /^\d+$/.test(value) ? `${CURRENT_PREFIX}${value.padStart(3, '0')}` : value.toUpperCase()
}

/**
 * Seguimiento público dentro de la tarjeta «Rastrear Solicitud» del portal. Usa el contrato público existente
 * (`track_request_status` vía `operations.trackRequest`) y muestra EXCLUSIVAMENTE el número REQ y el estado
 * general. Nunca solicitante, RUC, empresa, producto, título, descripción, prioridad, urgencia, adjuntos ni
 * historial: el detalle completo vive en «Mis tickets» después del ingreso. Sin consultas al escribir.
 */
export default function PortalTracking() {
  const [value, setValue] = useState('')
  const [fieldError, setFieldError] = useState<'empty' | 'invalid' | null>(null)
  const [query, setQuery] = useState<{ number: string; nonce: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const onBusy = useCallback((b: boolean) => setBusy(b), [])

  // Enlaces antiguos (/tracking) llegan a /portal#seguimiento: el foco va directamente al campo.
  useEffect(() => {
    if (window.location.hash === '#seguimiento') {
      inputRef.current?.focus({ preventScroll: true })
      inputRef.current?.closest('section')?.scrollIntoView({ block: 'center' })
    }
  }, [])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (!value.trim()) { setFieldError('empty'); inputRef.current?.focus(); return }
    const number = normalizeRequestNumber(value)
    if (!REQ_FORMAT.test(number)) { setFieldError('invalid'); inputRef.current?.focus(); return }
    setFieldError(null)
    setQuery(q => ({ number, nonce: (q?.nonce ?? 0) + 1 }))
  }

  const errorText = fieldError === 'empty' ? 'Escribe el número de solicitud.'
    : fieldError === 'invalid' ? `Revisa el formato: ${CURRENT_PREFIX}001 o solo el número (por ejemplo, 1).` : null

  return (
    <section aria-labelledby="seguimiento-title" id="seguimiento" className="portal-tracking" onPointerEnter={preload} onTouchStart={preload}>
      <span className="icon-tile"><Icon name="search" size={26} /></span>
      <h2 id="seguimiento-title">Rastrear Solicitud</h2>
      <p>Consulta el estado general de una solicitud con su número REQ. El detalle completo está en «Mis tickets» después de ingresar.</p>
      <form onSubmit={submit} noValidate className="portal-tracking-form" aria-busy={busy || undefined}>
        <label htmlFor="tracking-number">Número de solicitud</label>
        <div className="portal-tracking-row">
          <input id="tracking-number" ref={inputRef} value={value} autoComplete="off" spellCheck={false} maxLength={20}
            placeholder={`${CURRENT_PREFIX}001`} onFocus={preload}
            onChange={e => { setValue(e.target.value.toUpperCase()); if (fieldError) setFieldError(null) }}
            aria-invalid={errorText ? true : undefined} aria-describedby={errorText ? 'tracking-field-error' : 'tracking-hint'}
            className="ui-input font-mono" />
          <button type="submit" disabled={busy} className="ui-button ui-button-primary">
            <Icon name="search" size={18} /><span>{busy ? 'Buscando…' : 'Buscar'}</span>
          </button>
        </div>
        {errorText
          ? <p id="tracking-field-error" className="field-error">{errorText}</p>
          : <p id="tracking-hint" className="portal-tracking-hint">Ejemplo: {CURRENT_PREFIX}001. Puedes escribir solo el número.</p>}
      </form>
      {/* Región viva: anuncia la búsqueda y su resultado sin mover el foco. */}
      <div className="portal-tracking-result" aria-live="polite">
        {query && (
          <Suspense fallback={<p role="status" className="portal-tracking-note">Buscando {query.number}…</p>}>
            <TrackingOutcome key={query.nonce} number={query.number} nonce={query.nonce} onBusy={onBusy} />
          </Suspense>
        )}
      </div>
    </section>
  )
}
