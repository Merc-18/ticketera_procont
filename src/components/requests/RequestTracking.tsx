import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { operations } from '../../lib/api'
import type { PublicTracking } from '../../lib/operations'
import { errorMessage } from '../../lib/supabase-errors'
import { peekTrackingNumber, clearTrackingNumber } from '../../lib/tracking-handoff'
import { GENERAL_STATUS, MAIN_PATH } from '../../lib/request-status'
import BrandLogo from '../ui/BrandLogo'

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
  // Bloqueado puede ocurrir en Backlog o en proceso: se muestra la aprobación como completada, sin paso actual.
  const blocked = result?.status === 'blocked'
  const pathIndex = result ? (blocked ? MAIN_PATH.indexOf('approved_backlog') + 1 : MAIN_PATH.indexOf(result.status)) : -1

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-700 via-brand-800 to-brand-950 py-12 px-4">
      <div className="max-w-xl mx-auto">
        <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8">
          <button onClick={() => navigate('/portal')} className="text-sm text-gray-400 hover:text-gray-600 transition mb-4">← Inicio</button>
          <div className="text-center mb-8">
            <BrandLogo size={48} showName={false} className="justify-center mb-4" />
            <h1 className="text-3xl font-bold text-brand-700 mb-2">Rastrear Solicitud</h1>
            <div className="mx-auto mb-3 h-1 w-16 rounded-full bg-accent-400" aria-hidden="true" />
            <p className="text-gray-600">Ingresa tu número de solicitud para conocer su estado</p>
          </div>

          <form onSubmit={e => { e.preventDefault(); void search(requestNumber) }} className="flex gap-3 mb-6">
            <input value={requestNumber} onChange={e => setRequestNumber(e.target.value.toUpperCase())}
              placeholder={`${CURRENT_PREFIX}001`} maxLength={20} required autoFocus
              className="flex-1 min-w-0 px-4 py-3 border-2 border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary text-lg font-mono" />
            <button type="submit" disabled={loading || !requestNumber.trim()}
              className="px-6 py-3 bg-primary text-white rounded-lg font-semibold hover:bg-brand-700 disabled:opacity-50 transition">
              {loading ? 'Buscando…' : 'Buscar'}
            </button>
          </form>

          {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>}
          {notFound && (
            <div className="bg-gray-50 border rounded-lg p-5 text-center">
              <p className="font-medium text-gray-800">No encontramos esa solicitud</p>
              <p className="text-sm text-gray-500 mt-1">Verifica el número, por ejemplo {CURRENT_PREFIX}001.</p>
            </div>
          )}

          {result && status && (
            <div className="space-y-5">
              <div className="text-center bg-gray-50 border rounded-xl p-5">
                <p className="text-sm text-gray-500">Solicitud</p>
                <p className="font-mono font-bold text-2xl text-primary">{result.request_number}</p>
                <span className={`inline-flex items-center gap-2 mt-3 px-4 py-1.5 rounded-full border text-sm font-semibold ${status.tone}`}>
                  {status.icon} {status.label}
                </span>
              </div>
              {blocked && <p className="text-sm text-orange-800 bg-orange-50 border border-orange-200 rounded-lg p-3 text-center">
                El trabajo está detenido temporalmente. Se reanudará automáticamente al resolverse.</p>}
              {result.status !== 'rejected' && (
                <ol>
                  {MAIN_PATH.map((step, i) => {
                    const done = i < pathIndex || result.status === 'done'
                    const current = i === pathIndex && result.status !== 'done' && !blocked
                    return (
                      <li key={step} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <span className={`w-4 h-4 rounded-full border-2 mt-0.5 ${done ? 'bg-primary border-primary'
                            : current ? 'bg-accent-400 border-accent-400'
                            : 'bg-white border-gray-300'}`} />
                          {i < MAIN_PATH.length - 1 && <span className={`w-0.5 flex-1 min-h-[22px] my-1 ${done ? 'bg-primary' : 'bg-gray-200'}`} />}
                        </div>
                        <p className={`pb-4 text-sm ${done || current ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
                          {GENERAL_STATUS[step].label}
                        </p>
                      </li>
                    )
                  })}
                </ol>
              )}
              <button onClick={() => navigate('/request')}
                className="w-full bg-gray-100 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-200 transition">
                Nueva solicitud
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
