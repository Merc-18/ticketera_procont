import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { operations } from '../../lib/api'
import type { PublicTracking } from '../../lib/operations'
import { errorMessage } from '../../lib/supabase-errors'
import { peekTrackingNumber, clearTrackingNumber } from '../../lib/tracking-handoff'
import { GENERAL_STATUS } from '../../lib/request-status'
import BrandLogo from '../ui/BrandLogo'
import Icon from '../ui/Icon'

const CURRENT_PREFIX = `REQ${new Date().getFullYear().toString().slice(2)}-`

/**
 * Seguimiento público solo con el número REQ. Muestra únicamente el número y el estado general;
 * nunca nombre, descripción, adjuntos, motivos, responsables, códigos, prioridad ni SLA.
 */
export default function RequestTracking() {
  const navigate = useNavigate()
  const [requestNumber, setRequestNumber] = useState(() => peekTrackingNumber() ?? '')
  const [result, setResult] = useState<PublicTracking | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const search = async (raw: string) => {
    setLoading(true); setNotFound(false); setResult(null); setError(null)
    try {
      // Solo dígitos → número completo con el prefijo del año actual (p. ej. 1 → REQ26-001).
      const full = /^\d+$/.test(raw.trim()) ? `${CURRENT_PREFIX}${raw.trim().padStart(3, '0')}` : raw.trim().toUpperCase()
      const found = await operations.trackRequest(full)
      if (found) setResult(found); else setNotFound(true)
    } catch (err) {
      setError(errorMessage(err))
    } finally { setLoading(false) }
  }

  useEffect(() => {
    const handed = peekTrackingNumber()
    clearTrackingNumber()
    if (handed) void search(handed)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const status = result ? GENERAL_STATUS[result.status] : null
  return (
    <main id="main-content" tabIndex={-1} className="tracking-page app-surface px-4">
      <div className="max-w-xl mx-auto">
        <div className="tracking-panel">
          <button onClick={() => navigate('/portal')} className="back-link mb-4">← Inicio</button>
          <div className="text-center mb-8">
            <BrandLogo size={48} showName={false} className="justify-center mb-4" />
            <h1 className="text-3xl font-medium text-brand-700 mb-2">Rastrear Solicitud</h1>
            <div className="mx-auto mb-3 h-1 w-16 rounded-full bg-accent-400" aria-hidden="true" />
            <p className="text-gray-600">Ingresa tu número de solicitud para conocer su estado</p>
          </div>

          <label htmlFor="tracking-number" className="block text-sm font-medium text-gray-700 mb-2">Número de solicitud</label>
          <form noValidate onSubmit={e => { e.preventDefault(); if (!requestNumber.trim()) { setError('Escribe el número de solicitud.'); return } void search(requestNumber) }} className="flex flex-col sm:flex-row gap-3 mb-6">
            <input id="tracking-number" value={requestNumber} onChange={e => setRequestNumber(e.target.value.toUpperCase())}
              placeholder={`${CURRENT_PREFIX}001`} maxLength={20} required autoFocus aria-invalid={!!error || undefined} aria-describedby={error ? 'tracking-error' : undefined}
              className="ui-input flex-1 min-w-0 text-lg font-mono" />
            <button type="submit" disabled={loading}
              className="ui-button ui-button-primary">
              {loading ? 'Buscando…' : 'Buscar'}
            </button>
          </form>

          {error && <p id="tracking-error" role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>}
          {notFound && (
            <div className="bg-gray-50 border rounded-lg p-5 text-center">
              <p className="font-medium text-gray-800">No encontramos esa solicitud</p>
              <p className="text-sm text-gray-600 mt-1">Verifica el número, por ejemplo {CURRENT_PREFIX}001.</p>
            </div>
          )}

          {result && status && (
            <div className="space-y-5">
              <div data-testid="public-tracking-result" role="status" className="text-center bg-gray-50 border rounded-xl p-5">
                <p className="text-sm text-gray-600">Solicitud</p>
                <p className="font-mono font-medium text-2xl text-primary">{result.request_number}</p>
                <span className={`inline-flex items-center gap-2 mt-3 px-4 py-1.5 rounded-full border text-sm font-medium ${status.tone}`}>
                  <Icon name={status.icon} size={16} />{status.label}
                </span>
              </div>
              <button onClick={() => navigate('/request')}
                className="ui-button ui-button-secondary w-full">
                Nueva solicitud
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
