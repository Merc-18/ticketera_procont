import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { operations } from '../../lib/api'
import type { PublicTracking } from '../../lib/operations'
import { errorMessage } from '../../lib/supabase-errors'
import { peekTrackingReceipt, clearTrackingReceipt } from '../../lib/tracking-handoff'

interface ProjectFlow {
  flow_type: string
  current_phase: string
  progress: number
}

const PHASE_MESSAGE: Record<string, string> = {
  backlog:          'Tu solicitud está en cola, próximamente se iniciará',
  design:           'Tu requerimiento ha iniciado — el equipo está en la etapa de análisis',
  discovery:        'Tu requerimiento ha iniciado — el equipo está en la etapa de análisis',
  dev:              'El equipo está trabajando en tu requerimiento',
  build:            'El equipo está trabajando en tu requerimiento',
  testing:          'Tu entregable está en etapa de pruebas finales',
  uat_validation:   'Tu entregable está en etapa de pruebas finales',
  deploy:           'Tu requerimiento fue completado ✅',
  deployed:         'Tu requerimiento fue completado ✅',
  done:             'Tu requerimiento fue completado ✅',
}

function getOverallMessage(flows: ProjectFlow[]): string | null {
  if (flows.length === 0) return null
  // Use the most advanced phase across all flows
  const order = ['backlog', 'ready_to_start', 'discovery', 'design', 'dev', 'build', 'testing', 'uat_validation', 'deploy', 'deployed', 'done']
  const sorted = [...flows].sort((a, b) => order.indexOf(b.current_phase) - order.indexOf(a.current_phase))
  return PHASE_MESSAGE[sorted[0].current_phase] ?? null
}

const DEV_PHASES = ['backlog', 'design', 'dev', 'testing', 'deploy', 'done']
const ADM_PHASES = ['backlog', 'ready_to_start', 'discovery', 'build', 'uat_validation', 'deployed']

const PHASE_LABELS: Record<string, string> = {
  backlog: 'Backlog', design: 'Design', dev: 'Development', testing: 'Testing',
  deploy: 'Deploy', done: 'Done', ready_to_start: 'Ready to Start',
  discovery: 'Discovery', build: 'Build', uat_validation: 'UAT/Validation', deployed: 'Deployed',
}

const CURRENT_PREFIX = `REQ${new Date().getFullYear().toString().slice(2)}-`

export default function RequestTracking() {
  const navigate = useNavigate()
  const [initialReceipt] = useState(peekTrackingReceipt)
  useEffect(() => { clearTrackingReceipt() }, [])
  const [requestNumber, setRequestNumber] = useState(initialReceipt?.request_number ?? '')
  const [trackingToken, setTrackingToken] = useState(initialReceipt?.tracking_token ?? '')
  const [searchError, setSearchError] = useState<string | null>(null)
  const [request, setRequest] = useState<PublicTracking | null>(null)
  const [flows, setFlows] = useState<ProjectFlow[]>([])
  const [slaTargetDate, setSlaTargetDate] = useState<string | null>(null)
  const [projectStatus, setProjectStatus] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [notFound, setNotFound] = useState(false)

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setNotFound(false)
    setRequest(null)
    setFlows([])
    setSlaTargetDate(null)
    setProjectStatus(null)
    setSearchError(null)

    try {
      // Si el usuario ingresó solo dígitos, armar el número completo con el prefijo del año actual
      const fullNumber = /^\d+$/.test(requestNumber.trim())
        ? `${CURRENT_PREFIX}${requestNumber.trim().padStart(3, '0')}`
        : requestNumber.trim().toUpperCase()
      const result = await operations.trackRequest(fullNumber, trackingToken)
      if (result) {
        setRequest(result)
        setFlows(result.flows)
        setSlaTargetDate(result.sla_target_date)
        setProjectStatus(result.project_status)
      } else { setNotFound(true) }
    } catch (err) {
      setSearchError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  // Build timeline steps
  const isCompleted = projectStatus === 'completed' ||
    flows.some(f => ['deploy', 'deployed', 'done'].includes(f.current_phase))

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
          label: 'Aprobada y en curso',
          date: null,
          done: request.status === 'approved',
          icon: '✅',
        },
    ...(request.status === 'approved' ? [{
      id: 'progress',
      label: getOverallMessage(flows) ?? 'En desarrollo',
      date: null,
      done: isCompleted,
      active: !isCompleted && flows.length > 0,
      icon: '🔄',
    }] : []),
    ...(request.status === 'approved' ? [{
      id: 'done',
      label: 'Entregado',
      date: null,
      done: isCompleted,
      icon: '🎉',
    }] : []),
  ] : []

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary to-info py-12 px-4">
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
              <h1 className="text-3xl font-bold text-gray-900 mb-2">🔍 Rastrear Solicitud</h1>
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
                className="px-6 py-3 bg-primary text-white rounded-lg font-semibold hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
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
                          ? 'bg-blue-300 border-blue-400 animate-pulse'
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
                            (step as any).active ? 'text-blue-700' :
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

                {/* Fecha compromiso (sla_target_date) */}
                {slaTargetDate && (() => {
                  const today = new Date().toISOString().slice(0, 10)
                  const diff = Math.ceil((new Date(slaTargetDate).getTime() - new Date(today).getTime()) / 86400000)
                  const isCompleted = flows.some(f => ['deploy', 'deployed', 'done'].includes(f.current_phase))
                  const isOverdue = diff < 0 && !isCompleted
                  return (
                    <div className={`rounded-lg px-4 py-3 border ${isOverdue ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                      <p className={`text-xs font-semibold mb-1 ${isOverdue ? 'text-red-600' : 'text-green-600'}`}>
                        {isOverdue ? '⚠️ Fecha compromiso' : '🎯 Fecha compromiso de entrega'}
                      </p>
                      <p className={`font-bold text-lg ${isOverdue ? 'text-red-900' : 'text-green-900'}`}>
                        {new Date(slaTargetDate + 'T12:00:00').toLocaleDateString('es-PE', {
                          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                        })}
                      </p>
                      {isOverdue && (
                        <p className="text-xs text-red-500 mt-1">
                          El plazo estimado ha vencido. El equipo está gestionando la entrega.
                        </p>
                      )}
                      {!isOverdue && diff <= 2 && (
                        <p className="text-xs text-green-600 mt-1">Entrega muy próxima.</p>
                      )}
                    </div>
                  )
                })()}

                {/* Progreso de fases */}
                {flows.length > 0 && (
                  <div className="space-y-4">
                    {flows.map(flow => {
                      const phases = flow.flow_type === 'development' ? DEV_PHASES : ADM_PHASES
                      const currentIdx = phases.indexOf(flow.current_phase)
                      return (
                        <div key={flow.flow_type}>
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-sm font-medium text-gray-700">
                              {flow.flow_type === 'development' ? '💻 Desarrollo' : '📋 Administrativo'}
                            </p>
                            <span className="text-sm font-bold text-primary">{flow.progress}%</span>
                          </div>
                          <div className="flex items-center gap-0.5">
                            {phases.map((phase, idx) => {
                              const done = idx < currentIdx
                              const active = idx === currentIdx
                              return (
                                <div key={phase} className="flex-1 flex flex-col items-center gap-1">
                                  <div className={`h-2 w-full rounded-full ${done ? 'bg-primary' : active ? 'bg-blue-300' : 'bg-gray-200'}`} />
                                  {active && (
                                    <span className="text-[9px] text-primary font-semibold leading-none text-center">
                                      {PHASE_LABELS[phase]}
                                    </span>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
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
                  className="flex-1 bg-primary text-white py-3 rounded-lg font-semibold hover:bg-blue-600 transition"
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
