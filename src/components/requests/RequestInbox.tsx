import RequestedPriority from './RequestedPriority'
import ControlLabel from '../ui/ControlLabel'
import { lazy, Suspense, useState } from 'react'
import { useRequests } from '../../hooks/useRequests'
import { useUsers } from '../../hooks/useUsers'
import { useAuth } from '../../hooks/useAuth'
import type { Request } from '../../types/database.types'
import ModalFocus from '../ui/ModalFocus'
import { useCatalogs } from '../../hooks/useCatalogs'
import Icon from '../ui/Icon'

// XLSX solo forma parte de la descarga iniciada al abrir el importador.
const PlannerImportModal = lazy(() => import('./PlannerImportModal'))
// Modal de validación diferido (JS por vista); se pide al acercarse a una solicitud (puntero, foco o toque).
const loadValidationModal = () => import('./RequestValidationModal')
const RequestValidationModal = lazy(loadValidationModal)
const preloadValidation = () => { loadValidationModal().catch(() => undefined) }

const isUrgent = (r: Request) => !!r.urgent_requested || !!r.observations?.startsWith('🔴 URGENTE')


function TypeChips({ request }: { request: Request }) {
  const types = request.needs_code
    ? request.request_type.split(',').map(t => t.trim()).filter(Boolean)
    : [request.request_type]
  return (
    <div className="flex flex-wrap gap-1">
      {types.map(t => (
        <span
          key={t}
          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
            request.needs_code ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-600'
          }`}
        >
          {t}
        </span>
      ))}
    </div>
  )
}

type InboxTab = 'pending' | 'approved' | 'rejected'
type Mode = 'view' | 'approve' | 'reject'

export default function RequestInbox() {
  const { requests, loading, error, reload, approveRequest, rejectRequest } = useRequests({ loadInbox: true })
  // Catálogos para mostrar estudio y clasificar al validar (código interno solo en la validación).
  const catalogs = useCatalogs('member')
  const nameOf = (list: { id: string; name: string }[], id?: string | null) => (id ? list.find(x => x.id === id)?.name : undefined)
  const [studioFilter, setStudioFilter] = useState('all')
  /** Línea secundaria de la lista: estudio y área por separado (el área solo si existe). */
  const meta = (r: Request) => (
    <p className="text-sm text-gray-600 flex flex-wrap gap-x-3">
      {r.studio_id && <span className="inline-flex items-center gap-1"><Icon name="building" size={14} /><span className="sr-only">Estudio: </span>{nameOf(catalogs.studios, r.studio_id) ?? '—'}</span>}
      {r.system_id && <span className="inline-flex items-center gap-1"><Icon name="package" size={14} /><span className="sr-only">Producto: </span>{nameOf(catalogs.systems, r.system_id) ?? '—'}</span>}
      {r.requester_area && <span className="inline-flex items-center gap-1"><Icon name="pin" size={14} /><span className="sr-only">Área: </span>{r.requester_area}</span>}
    </p>
  )
  const { assignableUsers } = useUsers()
  const { user: currentUser } = useAuth()
  const canManage = currentUser?.role === 'superadmin' || currentUser?.role === 'admin'
  const [activeTab, setActiveTab] = useState<InboxTab>('pending')
  const [selected, setSelected] = useState<{ request: Request; mode: Mode } | null>(null)
  const [showImportModal, setShowImportModal] = useState(false)
  const open = (request: Request, mode: Mode) => setSelected({ request, mode })

  const visibleRequests  = studioFilter === 'all' ? requests
    : requests.filter(r => studioFilter === 'none' ? !r.studio_id : r.studio_id === studioFilter)
  const pendingRequests  = visibleRequests.filter(r => r.status === 'pending')
  const approvedRequests = visibleRequests.filter(r => r.status === 'approved')
  const rejectedRequests = visibleRequests.filter(r => r.status === 'rejected')

  const statusColors = {
    pending:  'bg-yellow-100 text-yellow-800 border-yellow-200',
    approved: 'bg-green-100 text-green-800 border-green-200',
    rejected: 'bg-red-100 text-red-800 border-red-200',
  }

  if (error) return <div role="alert" className="p-4 text-red-700">{error} <button onClick={reload} className="underline">Reintentar</button></div>

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando solicitudes...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="request-inbox space-y-6">
      {/* Import button */}
      {canManage && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowImportModal(true)}
            className="ui-button ui-button-secondary"
          >
            <ControlLabel icon="upload">Importar Planner</ControlLabel>
          </button>
        </div>
      )}

      {/* Filtro Estudio (independiente del área) */}
      {catalogs.studios.length > 0 && (
        <div className="inbox-toolbar flex flex-wrap items-center gap-2">
          <label htmlFor="inbox-studio" className="text-sm text-gray-600">Estudio</label>
          <select id="inbox-studio" value={studioFilter} onChange={e => setStudioFilter(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary outline-none">
            <option value="all">Todos</option>
            {catalogs.studios.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
            <option value="none">Sin estudio</option>
          </select>
        </div>
      )}

      {/* Tabs */}
      <div className="request-tabs flex overflow-x-auto">
        {([
          { key: 'pending',  label: 'Pendientes',  count: pendingRequests.length,  dot: 'bg-yellow-400' },
          { key: 'approved', label: 'Aprobadas',   count: approvedRequests.length, dot: 'bg-green-700' },
          { key: 'rejected', label: 'Rechazadas',  count: rejectedRequests.length, dot: 'bg-red-700' },
        ] as const).map(tab => (
          <button
            key={tab.key}
            aria-pressed={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition flex items-center gap-2 whitespace-nowrap shrink-0 ${
              activeTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${tab.dot}`} />
            {tab.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
              activeTab === tab.key ? 'bg-primary text-white' : 'bg-gray-100 text-gray-500'
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Request List */}
      <div className="grid gap-4" onPointerOver={preloadValidation} onFocusCapture={preloadValidation} onTouchStartCapture={preloadValidation}>
        {/* ── Pendientes ── */}
        {activeTab === 'pending' && (
          pendingRequests.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <Icon name="check" size={36} className="mx-auto mb-3 text-gray-500" />
              <p className="text-gray-600 font-medium">No hay solicitudes pendientes</p>
            </div>
          ) : (
            pendingRequests.map(request => {
              const urgent = isUrgent(request)
              return (
                <div
                  key={request.id}
                  className={`request-card border cursor-pointer ${urgent ? 'border-red-300' : ''}`}
                  onClick={() => open(request, 'view')}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="font-mono font-bold text-primary">{request.request_number}</p>
                        {urgent && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded-full text-xs font-medium">
                            <Icon name="alert" size={12} />Urgente
                          </span>
                        )}
                      </div>
                      <button type="button" onClick={e => { e.stopPropagation(); open(request, 'view') }} className="font-medium text-gray-900 text-left text-base hover:text-brand-700 hover:underline">{request.title || request.requester_name}</button>
                      {request.title && <p className="text-sm text-gray-600">{request.requester_name}</p>}
                      {meta(request)}
                      <RequestedPriority value={request.requested_priority} internal />
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium border ${statusColors.pending}`}>
                      Pendiente
                    </span>
                  </div>
                  <div className="mb-2"><TypeChips request={request} /></div>
                  <p className="text-sm text-gray-600 line-clamp-2">{request.description}</p>
                  {canManage && (
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); open(request, 'approve') }}
                        className="ui-button ui-button-secondary"
                      >
                        <ControlLabel icon="check">Aprobar</ControlLabel>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); open(request, 'reject') }}
                        className="ui-button ui-button-danger"
                      >
                        <ControlLabel icon="close">Rechazar</ControlLabel>
                      </button>
                    </div>
                  )}
                </div>
              )
            })
          )
        )}

        {/* ── Aprobadas ── */}
        {activeTab === 'approved' && (
          approvedRequests.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <p className="text-gray-500">No hay solicitudes aprobadas</p>
            </div>
          ) : (
            approvedRequests.map(request => {
              const urgent = isUrgent(request)
              const projectDeleted = (request as any).projects?.status === 'deleted'
              return (
                <div
                  key={request.id}
                  className={`request-card border cursor-pointer ${projectDeleted ? 'border-gray-200 opacity-75' : 'border-green-100'}`}
                  onClick={() => open(request, 'view')}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="font-mono font-bold text-primary">{request.request_number}</p>
                        {urgent && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded-full text-xs font-medium">
                            <Icon name="alert" size={12} />Urgente
                          </span>
                        )}
                        {projectDeleted && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-600 border border-gray-300 rounded-full text-xs font-medium">
                            <Icon name="trash" size={12} />Proyecto eliminado
                          </span>
                        )}
                      </div>
                      <button type="button" onClick={e => { e.stopPropagation(); open(request, 'view') }} className="font-medium text-gray-900 text-left text-base hover:text-brand-700 hover:underline">{request.title || request.requester_name}</button>
                      {request.title && <p className="text-sm text-gray-600">{request.requester_name}</p>}
                      {meta(request)}
                      <RequestedPriority value={request.requested_priority} internal />
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium border ${statusColors.approved}`}>
                      <span className="inline-flex items-center gap-1"><Icon name="check" size={12} />Aprobado</span>
                    </span>
                  </div>
                  <div className="mb-2"><TypeChips request={request} /></div>
                  <p className="text-sm text-gray-600 line-clamp-2">{request.description}</p>
                  <p className="text-sm text-gray-600 mt-2">
                    Recibido: {new Date(request.created_at).toLocaleDateString('es-PE')}
                  </p>
                </div>
              )
            })
          )
        )}

        {/* ── Rechazadas ── */}
        {activeTab === 'rejected' && (
          rejectedRequests.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <p className="text-gray-600">No hay solicitudes rechazadas</p>
            </div>
          ) : (
            rejectedRequests.map(request => (
              <div
                key={request.id}
                className="request-card border border-red-100 cursor-pointer"
                onClick={() => open(request, 'view')}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-mono font-bold text-primary">{request.request_number}</p>
                    <button type="button" onClick={e => { e.stopPropagation(); open(request, 'view') }} className="font-medium text-gray-900 text-left text-base hover:text-brand-700 hover:underline">{request.title || request.requester_name}</button>
                      {request.title && <p className="text-sm text-gray-600">{request.requester_name}</p>}
                    {meta(request)}
                      <RequestedPriority value={request.requested_priority} internal />
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium border ${statusColors.rejected}`}>
                    <span className="inline-flex items-center gap-1"><Icon name="close" size={12} />Rechazado</span>
                  </span>
                </div>
                <div className="mb-2"><TypeChips request={request} /></div>
                <p className="text-sm text-gray-600 line-clamp-2">{request.description}</p>
                {(request.public_rejection_reason || request.rejection_reason) && (
                  <div className="mt-2 bg-red-50 border border-red-100 rounded px-3 py-2 space-y-1">
                    <p className="text-xs text-red-700 font-medium">Motivo para el solicitante:</p>
                    <p className="text-xs text-red-800 line-clamp-2">{request.public_rejection_reason || 'Sin motivo público (mensaje genérico)'}</p>
                    {request.rejection_reason && request.rejection_reason !== request.public_rejection_reason && (
                      <p className="text-xs text-gray-600 line-clamp-2"><span className="font-medium">Nota interna:</span> {request.rejection_reason}</p>
                    )}
                  </div>
                )}
                <p className="text-xs text-gray-400 mt-2">
                  Recibido: {new Date(request.created_at).toLocaleDateString('es-PE')}
                </p>
              </div>
            ))
          )
        )}
      </div>

      {selected && (
        <Suspense fallback={null}><RequestValidationModal
          key={selected.request.id}
          request={selected.request}
          initialMode={selected.mode}
          canManage={canManage}
          catalogs={catalogs}
          users={assignableUsers}
          onApprove={async (id, data, attempt) => { await approveRequest(id, data, attempt) }}
          onReject={rejectRequest}
          onClose={() => { setSelected(null); void reload() }}
        /></Suspense>
      )}

      {/* Planner Import Modal */}
      {showImportModal && (
        <Suspense fallback={
          <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4">
            <div role="dialog" aria-modal="true" aria-label="Importar desde Planner" className="modal-panel bg-white rounded-2xl p-6 max-w-lg w-full">
              <ModalFocus onDismiss={() => setShowImportModal(false)} />
              <p role="status" className="text-sm text-gray-600">Cargando importador de Planner…</p>
              <button onClick={() => setShowImportModal(false)} className="ui-button ui-button-secondary mt-4">Cancelar</button>
            </div>
          </div>
        }>
        <PlannerImportModal onClose={() => { setShowImportModal(false) }} />
        </Suspense>
      )}
    </div>
  )
}
