import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { operations } from '../../lib/api'
import type { PublicTracking } from '../../lib/operations'
import { errorMessage } from '../../lib/supabase-errors'
import { peekTrackingReceipt, clearTrackingReceipt } from '../../lib/tracking-handoff'

const CURRENT_PREFIX = `REQ${new Date().getFullYear().toString().slice(2)}-`

export default function RequestTracking() {
  const navigate = useNavigate()
  const [initialReceipt] = useState(peekTrackingReceipt)
  useEffect(() => { clearTrackingReceipt() }, [])
  const [requestNumber, setRequestNumber] = useState(initialReceipt?.request_number ?? '')
  const [trackingToken, setTrackingToken] = useState(initialReceipt?.tracking_token ?? '')
  const [searchError, setSearchError] = useState<string | null>(null)
  const [request, setRequest] = useState<PublicTracking | null>(null)
  const [loading, setLoading] = useState(false)
  const [notFound, setNotFound] = useState(false)

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setNotFound(false)
    setRequest(null)
    setSearchError(null)

    try {
      // Si el usuario ingresó solo dígitos, armar el número completo con el prefijo del año actual
      const fullNumber = /^\d+$/.test(requestNumber.trim())
        ? `${CURRENT_PREFIX}${requestNumber.trim().padStart(3, '0')}`
        : requestNumber.trim().toUpperCase()
      const result = await operations.trackRequest(fullNumber, trackingToken)
      if (result) {
        setRequest(result)
      } else { setNotFound(true) }
    } catch (err) {
      setSearchError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  // Línea de tiempo pública: solo pendiente → aprobada / rechazada (sin SLA, fases ni clasificación).
  const timelineSteps = request ? [
    {
      id: 'sent',
      label: 'Solicitud enviada',
      date: new Date(request.created_at).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }),
      done: true,
      icon: '📨',
    },
    {
      id: 'review',
      label: 'En revisión por el equipo',
      date: null,
      done: request.status !== 'pending',
      icon: '🔍',
    },
    request.status === 'rejected'
      ? {
          id: 'result',
          label: 'Solicitud rechazada',
          date: null,
          done: true,
          icon: '❌',
          error: true,
        }
      : {
          id: 'result',
          label: 'Solicitud aprobada — el equipo está trabajando en ella',
          date: null,
          done: request.status === 'approved',
          icon: '✅',
        },
  ] : []

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-700 via-brand-800 to-brand-950 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {/* Header */}
          <div className="mb-8">
            <button
              onClick={() => navigate('/portal')}
              className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 transition mb-4"
            >
              ← Inicio
            </button>
            <div className="text-center">
              <h1 className="text-3xl font-bold text-brand-700 mb-2">Rastrear Solicitud</h1>
              <p className="text-gray-600">
                Ingresa el número completo y el token para ver el estado de tu solicitud
              </p>
            </div>
          </div>

          {/* Search Form */}
          <form onSubmit={handleSearch} className="mb-8">
            <div className="flex gap-3">
              <div className="flex flex-1 border-2 border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-primary focus-within:border-transparent overflow-hidden">
                <input
                  type="text"
                  value={requestNumber}
                  onChange={(e) => setRequestNumber(e.target.value.toUpperCase())}
                  placeholder={`${CURRENT_PREFIX}001`}
                  maxLength={40}
                  required
                  className="flex-1 px-4 py-3 outline-none text-lg font-mono bg-white"
                  autoFocus
                />
              </div>
              <button
                type="submit"
                disabled={loading || !requestNumber || !trackingToken}
                className="px-6 py-3 bg-primary text-white rounded-lg font-semibold hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {loading ? 'Buscando...' : 'Buscar'}
              </button>
            </div>
            <label className="block mt-4 text-sm text-gray-600">
              Token de seguimiento
              <input type="password" value={trackingToken} onChange={e => setTrackingToken(e.target.value)}
                autoComplete="off" required className="block w-full mt-1 border-2 border-gray-300 rounded-lg px-4 py-3" />
            </label>
          </form>
          {searchError && <p role="alert" className="p-4 text-red-700">{searchError}</p>}

          {/* Not Found */}
          {notFound && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
              <p className="text-red-800 font-medium mb-2">❌ Solicitud no encontrada</p>
              <p className="text-sm text-red-600">Verifica que el número y el token sean correctos</p>
            </div>
          )}

          {/* Request Found */}
          {request && (
            <div className="space-y-6">
              {/* Visual Timeline */}
              <div className="bg-gray-50 rounded-xl p-5 border border-gray-100">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Estado de tu solicitud</p>
                <div className="space-y-0">
                  {timelineSteps.map((step, idx) => {
                    const isLast = idx === timelineSteps.length - 1
                    const dotColor = (step as any).error
                      ? 'bg-red-500 border-red-500'
                      : step.done
                        ? 'bg-primary border-primary'
                        : (step as any).active
                          ? 'bg-brand-300 border-brand-400 animate-pulse'
                          : 'bg-white border-gray-300'
                    const lineColor = step.done ? 'bg-primary' : 'bg-gray-200'
                    return (
                      <div key={step.id} className="flex gap-4">
                        <div className="flex flex-col items-center">
                          <div className={`w-4 h-4 rounded-full border-2 shrink-0 mt-0.5 ${dotColor}`} />
                          {!isLast && <div className={`w-0.5 flex-1 my-1 ${lineColor}`} style={{ minHeight: 24 }} />}
                        </div>
                        <div className="pb-4">
                          <p className={`text-sm font-medium leading-snug ${
                            (step as any).error ? 'text-red-700' :
                            step.done ? 'text-gray-900' :
                            (step as any).active ? 'text-brand-700' :
                            'text-gray-400'
                          }`}>
                            <span className="mr-1.5">{step.icon}</span>
                            {step.label}
                          </p>
                          {step.date && (
                            <p className="text-xs text-gray-400 mt-0.5 ml-6">{step.date}</p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Request Details */}
              <div className="bg-gray-50 rounded-lg p-6 space-y-4">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Número de Solicitud</p>
                  <p className="font-mono font-bold text-xl text-primary">{request.request_number}</p>
                </div>

                <div>
                  <p className="text-sm text-gray-600 mb-1">Fecha de creación</p>
                  <p>{new Date(request.created_at).toLocaleDateString('es-PE')}</p>
                </div>

                {request.title && (
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Título</p>
                    <p className="font-medium">{request.title}</p>
                  </div>
                )}

                {request.status === 'rejected' && request.rejection_reason && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <p className="text-sm text-red-600 mb-1 font-medium">Razón del Rechazo</p>
                    <p className="text-red-800">{request.rejection_reason}</p>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={() => { setRequest(null); setRequestNumber(''); setTrackingToken('') }}
                  className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-200 transition"
                >
                  Buscar otra solicitud
                </button>
                <button
                  onClick={() => window.location.href = '/request'}
                  className="flex-1 bg-primary text-white py-3 rounded-lg font-semibold hover:bg-brand-700 transition"
                >
                  Nueva solicitud
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
