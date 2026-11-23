import RequestedPriority from './RequestedPriority'
import ModalFocus from '../ui/ModalFocus'
import { useEffect, useRef, useState } from 'react'
import type { Request, User } from '../../types/database.types'
import type { useCatalogs } from '../../hooks/useCatalogs'
import { operations } from '../../lib/api'
import { createRpcAttempt } from '../../lib/rpc-attempt'
import { errorMessage } from '../../lib/supabase-errors'
import { listRequestAttachments } from '../../lib/attachments'
import { toast } from '../../lib/toast'
import RequestTimeline from './RequestTimeline'
import RequesterUrgencySummary from '../metrics/RequesterUrgencySummary'
import Icon from '../ui/Icon'
import ControlLabel from '../ui/ControlLabel'
import { PRIORITY_LABEL } from '../../lib/constants'

type Catalogs = ReturnType<typeof useCatalogs>
type Mode = 'view' | 'approve' | 'reject'
type Priority = 'low' | 'medium' | 'high' | 'urgent'

const PRIORITIES: [Priority, string][] = (['low', 'medium', 'high', 'urgent'] as Priority[]).map(v => [v, PRIORITY_LABEL[v]])
const input = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none bg-surface'

interface Props {
  request: Request
  initialMode: Mode
  canManage: boolean
  catalogs: Catalogs
  users: User[]
  onApprove: (id: string, data: { title: string; priority: Priority; assigned_dev: string },
    attempt: ReturnType<typeof createRpcAttempt>) => Promise<void>
  onReject: (id: string, publicReason: string, internalNotes?: string) => Promise<void>
  onClose: () => void
}

/**
 * Vista del validador: datos originales del cliente (inmutables), evidencias y urgencia
 * solicitada; clasificación interna (código, subproyecto, área/subárea) y decisión.
 * SLA: interno y pendiente de configuración para Procont (no se calcula ni se inventa).
 */
export default function RequestValidationModal({ request: r, initialMode, canManage, catalogs, users, onApprove, onReject, onClose }: Props) {
  const pending = r.status === 'pending'
  const [mode, setMode] = useState<Mode>(pending && canManage ? (initialMode === 'view' ? 'approve' : initialMode) : 'view')
  const [code, setCode] = useState(r.studio_code_id ?? '')
  const [subsystem, setSubsystem] = useState(r.subsystem_id ?? '')
  const [area, setArea] = useState(r.area_id ?? '')
  const [subarea, setSubarea] = useState(r.subarea_id ?? '')
  const [responsible, setResponsible] = useState('')
  const [priority, setPriority] = useState<Priority>(r.urgent_requested ? 'urgent' : 'medium')
  const [reason, setReason] = useState('')          // motivo público (lo ve el cliente)
  const [internalNotes, setInternalNotes] = useState('') // notas internas (no se publican)
  const [busy, setBusy] = useState(false)
  const [files, setFiles] = useState<{ name: string; url: string | null }[] | null>(null)
  const attempt = useRef(createRpcAttempt())

  const [filesError, setFilesError] = useState<string | null>(null)
  useEffect(() => {
    setFiles(null); setFilesError(null)
    listRequestAttachments(r.id).then(setFiles).catch(err => setFilesError(errorMessage(err)))
  }, [r.id])
  // Abrir una solicitud pendiente como validador inicia la etapa «En revisión» (idempotente en el servidor).
  const [timelineKey, setTimelineKey] = useState(0)
  useEffect(() => {
    if (pending && canManage) void operations.startRequestReview(r.id).then(() => setTimelineKey(k => k + 1)).catch(() => {})
  }, [r.id, pending, canManage])

  const name = (list: { id: string; name: string }[], id?: string | null) => (id ? list.find(x => x.id === id)?.name : undefined)
  const classified = !!r.studio_id
  const system = catalogs.systems.find(s => s.id === r.system_id)
  const subs = catalogs.subsystems.filter(s => s.system_id === r.system_id)
  const studioAreas = catalogs.areas.filter(a => a.studio_id === r.studio_id && !a.parent_id && r.studio_id)
  const subareas = catalogs.areas.filter(a => a.parent_id === area && area)
  const codes = catalogs.codes.filter(c => c.studio_id === r.studio_id)
  const requiresSub = !!system?.requires_subproject && subs.length > 0
  const urgent = r.urgent_requested || !!r.observations?.startsWith('🔴 URGENTE')

  // Requisitos de la decisión. La clasificación (código, área, subproyecto) solo aplica a solicitudes
  // con estudio; el responsable al aceptar y el motivo público al rechazar se exigen SIEMPRE, también
  // en solicitudes históricas sin estudio (antes se omitían y solo el servidor las rechazaba).
  const missing = (() => {
    if (classified && !code) return 'Selecciona el código interno del estudio.'
    if (mode === 'approve' && classified && studioAreas.length > 0 && !area) return 'Selecciona el área (obligatoria para este estudio).'
    if (mode === 'approve' && classified && requiresSub && !subsystem) return 'Selecciona el subproyecto.'
    if (mode === 'approve' && !responsible) return 'Selecciona el responsable.'
    if (mode === 'reject' && !reason.trim()) return 'Indica el motivo del rechazo para el solicitante.'
    return null
  })()

  const decide = async () => {
    if (missing) { toast.error(missing); return }
    setBusy(true)
    try {
      if (classified) {
        await operations.classifyRequest(r.id, { studio_code_id: code, subsystem_id: subsystem || null,
          area_id: area || null, subarea_id: subarea || null })
      }
      if (mode === 'approve') {
        await onApprove(r.id, { title: r.title || r.request_type, priority, assigned_dev: responsible }, attempt.current)
        toast.success('Solicitud aceptada y trabajo creado en el tablero')
      } else {
        await onReject(r.id, reason, internalNotes)
        toast.success('Solicitud rechazada')
      }
      onClose()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally { setBusy(false) }
  }

  const info = (label: string, value?: string | null) => (
    <div><p className="text-xs text-gray-500">{label}</p><p className="text-sm font-medium text-gray-900 break-words">{value || '—'}</p></div>
  )
  const decided = r.status !== 'pending'

  return (
    <div className="modal-backdrop fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Validación de solicitud" className="modal-panel bg-surface rounded-xl max-w-3xl w-full max-h-[92vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <ModalFocus onDismiss={onClose} />
        <div className="flex items-center justify-between px-6 py-4 border-b brand-band rounded-t-xl">
          <div>
            <p className="font-mono text-accent-300 text-sm">{r.request_number}</p>
            <h2 className="text-lg font-medium text-white">{r.title || r.request_type}</h2>
          </div>
          <button aria-label="Cerrar" onClick={onClose} className="text-white hover:bg-white/10"><Icon name="close" size={20} /></button>
        </div>

        <div className="p-6 space-y-6">
          {/* Información original del solicitante */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-brand-700">Solicitud del cliente</h3>
            {urgent && <p className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-50 text-red-700 border border-red-200 rounded-full text-sm font-medium"><Icon name="alert" size={14} />Atención urgente solicitada</p>}
            <RequestedPriority value={r.requested_priority} internal />
            {canManage && <RequesterUrgencySummary requestId={r.id} createdAt={r.created_at} />}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-gray-50 border rounded-lg p-3">
              {info('Solicitante', r.requester_name)}
              {info('Estudio', name(catalogs.studios, r.studio_id))}
              {info('Proyecto / Sistema', name(catalogs.systems, r.system_id))}
              {info('Tipo de solicitud', r.request_type)}
              {info('Recibida', new Date(r.created_at).toLocaleString('es-PE'))}
              {r.requester_email && info('Correo', r.requester_email)}
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Descripción</p>
              <p className="text-sm text-gray-800 whitespace-pre-wrap bg-gray-50 border rounded-lg p-3">{r.description}</p>
            </div>
            {r.observations && <div><p className="text-xs text-gray-500 mb-1">Observaciones</p><p className="text-sm text-gray-700 whitespace-pre-wrap">{r.observations}</p></div>}
            <div>
              <p className="text-xs text-gray-500 mb-1">Evidencias</p>
              {filesError ? <p role="alert" className="text-sm text-red-700">{filesError}</p>
                : files === null ? <p role="status" className="text-sm text-gray-600">Cargando…</p>
                : files.length === 0 ? <p className="text-sm text-gray-600">Sin adjuntos</p>
                : <ul className="flex flex-wrap gap-2">{files.map(f => (
                    <li key={f.name}>{f.url
                      ? <a href={f.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-3 py-2 bg-brand-50 text-brand-700 rounded-lg text-sm font-medium hover:bg-brand-100"><Icon name="file" size={14} />{f.name}</a>
                      : <span className="text-sm text-gray-600 inline-flex items-center gap-1"><Icon name="file" size={14} />{f.name}</span>}</li>))}</ul>}
            </div>
          </section>

          {/* Clasificación interna */}
          {classified && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-brand-700">Clasificación interna</h3>
              {decided || !canManage ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-gray-50 border rounded-lg p-3">
                  <div><p className="text-xs text-gray-500">Código interno</p><p className="text-sm font-mono font-medium">{catalogs.codes.find(c => c.id === r.studio_code_id)?.code ?? '—'}</p></div>
                  {info('Subproyecto', name(catalogs.subsystems, r.subsystem_id))}
                  {info('Área', name(catalogs.areas, r.area_id))}
                  {info('Subárea', name(catalogs.areas, r.subarea_id))}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="validation-code" className="block text-sm font-medium text-gray-700 mb-1">Código interno del estudio *</label>
                    <select id="validation-code" value={code} onChange={e => setCode(e.target.value)} className={input}>
                      <option value="">Selecciona un código</option>
                      {codes.map(c => <option key={c.id} value={c.id}>{c.code}</option>)}
                    </select>
                  </div>
                  {subs.length > 0 && (
                    <div>
                      <label htmlFor="validation-subsystem" className="block text-sm font-medium text-gray-700 mb-1">Subproyecto {requiresSub && mode === 'approve' ? '*' : ''}</label>
                      <select id="validation-subsystem" value={subsystem} onChange={e => setSubsystem(e.target.value)} className={input}>
                        <option value="">Sin subproyecto</option>
                        {subs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                  )}
                  {studioAreas.length > 0 ? (
                    <>
                      <div>
                        <label htmlFor="validation-area" className="block text-sm font-medium text-gray-700 mb-1">Área {mode === 'approve' ? '*' : ''}</label>
                        <select id="validation-area" value={area} onChange={e => { setArea(e.target.value); setSubarea('') }} className={input}>
                          <option value="">Selecciona un área</option>
                          {studioAreas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                      </div>
                      {subareas.length > 0 && (
                        <div>
                          <label htmlFor="validation-subarea" className="block text-sm font-medium text-gray-700 mb-1">Subárea (opcional)</label>
                          <select id="validation-subarea" value={subarea} onChange={e => setSubarea(e.target.value)} className={input}>
                            <option value="">Sin subárea</option>
                            {subareas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                          </select>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-gray-600 self-end pb-2">Área y subárea no aplican a este estudio.</p>
                  )}
                </div>
              )}
            </section>
          )}

          {/* Decisión */}
          {decided ? (
            <section className={`rounded-lg p-4 border ${r.status === 'approved' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <p className="text-sm font-medium inline-flex items-center gap-1.5"><Icon name={r.status === 'approved' ? 'check' : 'close'} size={16} />{r.status === 'approved' ? 'Aceptada — trabajo creado en el tablero' : 'Rechazada'}</p>
              {r.status === 'rejected' && (
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <div><p className="text-xs text-gray-500">Motivo para el solicitante</p>
                    <p className="text-sm text-red-800 whitespace-pre-wrap">{r.public_rejection_reason || 'Sin motivo público registrado (se mostrará un mensaje genérico).'}</p></div>
                  <div><p className="text-xs text-gray-500">Notas internas</p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{r.rejection_reason || '—'}</p></div>
                </div>
              )}
              {r.classified_at && <p className="text-xs text-gray-500 mt-1">Clasificada el {new Date(r.classified_at).toLocaleString('es-PE')}</p>}
            </section>
          ) : canManage ? (
            <section className="space-y-4">
              <div className="flex gap-2">
                <button aria-pressed={mode === 'approve'} onClick={() => setMode('approve')} className={`flex-1 min-h-[44px] rounded-lg text-sm font-medium border-2 transition ${mode === 'approve' ? 'border-green-700 bg-green-50 text-green-800' : 'border-gray-300 text-gray-600'}`}><ControlLabel icon="check">Aceptar</ControlLabel></button>
                <button aria-pressed={mode === 'reject'} onClick={() => setMode('reject')} className={`flex-1 min-h-[44px] rounded-lg text-sm font-medium border-2 transition ${mode === 'reject' ? 'border-red-700 bg-red-50 text-red-800' : 'border-gray-300 text-gray-600'}`}><ControlLabel icon="close">Rechazar</ControlLabel></button>
              </div>

              {mode === 'approve' ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-start">
                  <div>
                    <label htmlFor="validation-responsible" className="block text-sm font-medium text-gray-700 mb-1">Responsable principal *</label>
                    <select id="validation-responsible" value={responsible} onChange={e => setResponsible(e.target.value)} className={input}>
                      <option value="">Selecciona</option>
                      {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="validation-priority" className="block text-sm font-medium text-gray-700 mb-1">Prioridad definitiva *</label>
                    <select id="validation-priority" aria-describedby="validation-priority-help" value={priority} onChange={e => setPriority(e.target.value as Priority)} className={input}>
                      {PRIORITIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    <p id="validation-priority-help" className="text-sm text-gray-600 mt-1">Asignada por el personal{urgent ? '. El cliente pidió urgencia; puedes cambiarla.' : '.'}</p>
                  </div>
                  <div>
                    <p className="block text-sm font-medium text-gray-700 mb-1">Tablero</p>
                    <p className="px-3 py-2 min-h-[44px] text-sm text-gray-700 bg-gray-50 border border-gray-300 rounded-lg flex items-center"><ControlLabel icon="code">Development · inicia en Backlog</ControlLabel></p>
                  </div>
                  <div className="sm:col-span-3 bg-gray-50 border border-dashed rounded-lg px-3 py-2 text-xs text-gray-600">
                    <strong>SLA interno:</strong> Pendiente de configuración. Los plazos de Procont aún no están definidos; no se asigna fecha.
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label htmlFor="validation-reason" className="block text-sm font-medium text-gray-700 mb-1">Motivo para el solicitante *</label>
                    <textarea id="validation-reason" value={reason} onChange={e => setReason(e.target.value)} rows={3} maxLength={5000}
                      placeholder="Visible para el cliente en el seguimiento"
                      className={`${input} resize-none`} />
                  </div>
                  <div>
                    <label htmlFor="validation-notes" className="block text-sm font-medium text-gray-700 mb-1">Notas internas (opcional)</label>
                    <textarea id="validation-notes" value={internalNotes} onChange={e => setInternalNotes(e.target.value)} rows={2} maxLength={5000}
                      placeholder="Solo para el equipo; nunca se muestran al cliente"
                      className={`${input} resize-none bg-gray-50`} />
                  </div>
                </div>
              )}

              {missing && <p role="status" className="text-sm text-yellow-900 bg-accent-50 border border-accent-300 rounded-lg px-3 py-2">{missing}</p>}
              <div className="flex gap-3">
                <button onClick={onClose} className="ui-button ui-button-secondary flex-1">Cancelar</button>
                <button onClick={() => void decide()} disabled={busy || !!missing}
                  className={`ui-button flex-1 ${mode === 'approve' ? 'ui-button-primary' : 'ui-button-danger-solid'}`}>
                  {busy ? 'Guardando…' : mode === 'approve' ? 'Aceptar y crear trabajo' : 'Confirmar rechazo'}
                </button>
              </div>
            </section>
          ) : (
            <p className="text-sm text-gray-500">Pendiente de validación por un administrador.</p>
          )}

          <RequestTimeline requestId={r.id} projectId={r.project_id} catalogs={catalogs} refreshKey={timelineKey} />
        </div>
      </div>
    </div>
  )
}
