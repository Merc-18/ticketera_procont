import ControlLabel from '../ui/ControlLabel'
import Icon, { type IconName } from '../ui/Icon'
import ModalFocus from '../ui/ModalFocus'
import { useEffect, useState } from 'react'
import type { Project, ProjectFlow } from '../../types/database.types'
import CommentsSection from './CommentsSection'
import ChecklistSection from './ChecklistSection'
import EvidenceSection from './EvidenceSection'
import RequestTimeline from '../requests/RequestTimeline'
import { BlockDialog, DoneConfirmDialog, ReopenDialog } from './BoardDialogs'
import { useUsers } from '../../hooks/useUsers'
import { useAuth } from '../../hooks/useAuth'
import { useCatalogs } from '../../hooks/useCatalogs'
import { useBoardTicket } from '../../hooks/useBoardTicket'
import { operations, board } from '../../lib/api'
import { canEdit } from '../../lib/access'
import { errorMessage } from '../../lib/supabase-errors'
import { toast } from '../../lib/toast'
import { getAvatarColor, getInitials, AREA_COLORS, PHASE_LABELS, PRIORITY_COLORS, PRIORITY_LABEL } from '../../lib/constants'
import { GENERAL_STATUS, isGeneralStatus } from '../../lib/request-status'
import { actionKey, needsPendingConfirmation, pct, phasesFor, type BoardFlow, type BoardTicket, type Phase, type Priority } from '../../lib/board'
import { areasApply } from '../../lib/studio-rules'
import { supabase } from '../../lib/supabase'
import { seedPhaseOnArrival, type ChecklistClient } from '../../lib/checklist-templates'

interface Props {
  project: Project & { requests?: { requester_area: string; requester_name: string; request_type: string; studio_code_id?: string | null; area_id?: string | null } | null }
  flows: ProjectFlow[]
  onClose: () => void
  /** Recarga la lista del tablero tras una operación. */
  onUpdate?: () => void
  updateProject: (id: string, updates: Pick<Partial<Project>, 'title' | 'description' | 'start_date' | 'due_date'>) => Promise<void>
}

const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: 'low', label: PRIORITY_LABEL.low }, { value: 'medium', label: PRIORITY_LABEL.medium }, { value: 'high', label: PRIORITY_LABEL.high }, { value: 'urgent', label: PRIORITY_LABEL.urgent },
]
type Tab = 'details' | 'checklist' | 'comments' | 'evidence' | 'history'
type Dialog = null | { kind: 'block' } | { kind: 'reopen' } | { kind: 'done'; flowId: string; target: Phase; key: string }

function Bar({ value, tone }: { value: number | null; tone: string }) {
  return (
    <div className="w-full bg-gray-200 rounded-full h-2" aria-hidden>
      <div className={`h-2 rounded-full ${tone}`} style={{ width: `${Math.min(100, Math.max(0, value ?? 0))}%` }} />
    </div>
  )
}

export default function ProjectModal({ project, onClose, onUpdate, updateProject }: Props) {
  const { assignableUsers, users } = useUsers()
  const { user } = useAuth()
  const catalogs = useCatalogs('member')
  const hasProcontArea = areasApply(project.requests?.studio_code_id, catalogs.codes)
  const editable = canEdit(user)
  const canManage = user?.role === 'superadmin' || user?.role === 'admin'
  const { ticket, setTicket, error: ticketError, reload: reloadTicket } = useBoardTicket(project.id)
  const [tab, setTab] = useState<Tab>('details')
  const [busy, setBusy] = useState(false)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [history, setHistory] = useState(0)
  const [editMode, setEditMode] = useState(false)
  const [assignDraft, setAssignDraft] = useState<Record<string, string>>({})
  const blank = () => ({
    title: project.title, description: project.description, start_date: project.start_date ?? '', due_date: project.due_date ?? '',
    requester_area: project.requests?.requester_area ?? '', requester_name: project.requests?.requester_name ?? '',
  })
  const [editData, setEditData] = useState(blank)

  // Otro usuario (realtime) cambió el ticket: refrescar el snapshot.
  useEffect(() => { void reloadTicket() }, [project.updated_at, reloadTicket])

  const blocked = ticket?.is_blocked ?? project.is_blocked
  const status = ticket?.general_status
  const isDone = status === 'done'
  const active = ticket?.project_status === 'active'
  const legacy = ticket ? ticket.workflow_version === null && (project.project_type !== 'development' || (ticket.flows.length > 1)) : false

  /** Ejecuta una operación del tablero y refleja el snapshot devuelto por el servidor. */
  const run = async (op: () => Promise<BoardTicket | BoardTicket[]>, success?: string) => {
    setBusy(true)
    try {
      const result = await op()
      if (!Array.isArray(result)) setTicket(result)
      setHistory(h => h + 1)
      onUpdate?.()
      if (success) toast.success(success)
      return true
    } catch (err) {
      toast.error(errorMessage(err)); void reloadTicket(); return false
    } finally { setBusy(false) }
  }

  const requestMove = (flow: BoardFlow, target: Phase) => {
    if (!ticket || target === flow.phase) return
    if (needsPendingConfirmation(ticket, flow.id, target)) { setDialog({ kind: 'done', flowId: flow.id, target, key: actionKey() }); return }
    void run(async () => {
      const next = await board.movePhase(project.id, target, actionKey(), { flowId: flow.id })
      // Tareas sugeridas de la nueva fase si está vacía; un fallo no deshace el cambio de fase.
      try {
        const added = await seedPhaseOnArrival(supabase as unknown as ChecklistClient, flow.id, flow.flow_type, target)
        if (added) toast.info(`Se agregaron ${added} tareas sugeridas para ${PHASE_LABELS[target] ?? target}.`)
      } catch (err) { toast.error(errorMessage(err)) }
      return next
    }, `Fase: ${PHASE_LABELS[target] ?? target}`)
  }

  const handleSaveEdit = async () => {
    setBusy(true)
    try {
      await updateProject(project.id, { title: editData.title.trim(), description: editData.description,
        start_date: editData.start_date || null, due_date: editData.due_date || null })
      const areaChanged = editData.requester_area !== (project.requests?.requester_area ?? '')
      const nameChanged = editData.requester_name !== (project.requests?.requester_name ?? '')
      if ((areaChanged || nameChanged) && project.request_id) {
        try { await operations.updateRequestDetails(project.request_id, editData.requester_area, editData.requester_name) }
        catch (err) { throw new Error(`El ticket se guardó, pero no los datos del solicitante: ${errorMessage(err)}`) }
      }
      setEditMode(false); onUpdate?.()
    } catch (err) { toast.error(errorMessage(err)) } finally { setBusy(false) }
  }

  const area = editMode ? editData.requester_area : (project.requests?.requester_area ?? '')
  const statusInfo = status && isGeneralStatus(status) ? GENERAL_STATUS[status] : null
  const userName = (id: string | null) => (id ? users.find(u => u.id === id)?.full_name ?? 'Usuario no disponible' : null)

  return (
    <>
    <div className="modal-backdrop fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-2 sm:p-4 z-50" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Detalle del ticket" className="modal-panel bg-surface rounded-lg max-w-4xl w-full max-h-[94vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <ModalFocus onDismiss={onClose} />
        {/* ── HEADER ── */}
        <div className={`shrink-0 border-b px-4 sm:px-6 py-4 flex items-start justify-between gap-3 ${blocked ? 'bg-red-50' : 'bg-gray-50'}`}>
          <div className="flex-1 min-w-0">
            {editMode ? (
              <input type="text" value={editData.title} onChange={e => setEditData(p => ({ ...p, title: e.target.value }))} aria-label="Título"
                className="text-xl sm:text-2xl font-bold text-gray-900 w-full border-b-2 border-primary outline-none bg-transparent mb-2" />
            ) : (
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2 break-words">{project.title}</h2>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              {ticket?.request_number && <span className="font-mono text-xs text-gray-500">{ticket.request_number}</span>}
              {statusInfo && (
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold ${statusInfo.tone}`}><Icon name={statusInfo.icon} size={12} />{statusInfo.label}</span>
              )}
              {editable && ticket && ticket.project_status !== 'deleted' ? (<>
                <label htmlFor="project-priority" className="sr-only">Prioridad definitiva</label>
                <select id="project-priority" value={ticket.priority} disabled={busy}
                  onChange={e => { const v = e.target.value as Priority; void run(() => board.setPriority(project.id, v, actionKey()), 'Prioridad actualizada') }}
                  className={`px-2 py-1 rounded-full text-xs font-medium border cursor-pointer ${PRIORITY_COLORS[ticket.priority]}`}>
                  {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>Prioridad: {o.label}</option>)}
                </select></>
              ) : (
                <span className={`px-3 py-1 rounded-full text-xs font-medium border ${PRIORITY_COLORS[project.priority]}`}><Icon name="flag" size={12} className="inline-block mr-1 -mt-0.5" />Prioridad definitiva: {PRIORITY_LABEL[project.priority] ?? project.priority}</span>
              )}
              {hasProcontArea && area ? (
                <span className={`px-3 py-1 rounded-full text-xs font-medium border ${AREA_COLORS[area] ?? 'bg-gray-100 text-gray-700 border-gray-200'}`}><Icon name="pin" size={12} className="inline-block mr-1 -mt-0.5" />{area}</span>
              ) : null}
              {project.requests?.request_type && (
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-brand-50 text-brand-700 border border-brand-200"><Icon name="tag" size={12} className="inline-block mr-1 -mt-0.5" />{project.requests.request_type}</span>
              )}
              {editMode ? (
                <input type="text" value={editData.requester_name} onChange={e => setEditData(p => ({ ...p, requester_name: e.target.value }))}
                  placeholder="Solicitante…" aria-label="Solicitante"
                  className="px-2 py-0.5 rounded-full text-xs font-medium border border-gray-300 bg-surface outline-none focus:ring-2 focus:ring-primary w-36" />
              ) : project.requests?.requester_name && project.requests.requester_name !== '—' ? (
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200"><Icon name="user" size={12} className="inline-block mr-1 -mt-0.5" />{project.requests.requester_name}</span>
              ) : null}
              {legacy && (
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-300" title="Proyecto anterior al flujo único Development">
                  Histórico {project.project_type === 'dual' ? 'Dual' : project.project_type === 'administrative' ? 'Administrative' : ''}
                </span>
              )}
              {ticket?.project_status === 'archived' && <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-200 text-gray-700"><Icon name="archive" size={12} className="inline-block mr-1 -mt-0.5" />Archivado</span>}
            </div>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="text-gray-600 hover:text-gray-900 hover:bg-gray-100 shrink-0"><Icon name="close" size={20} /></button>
        </div>

        {/* Banner de bloqueo: visible en todas las pestañas */}
        {blocked && (
          <div className="shrink-0 bg-red-700 text-white px-4 sm:px-6 py-2.5 text-sm flex flex-col sm:flex-row sm:items-center gap-x-3 gap-y-0.5">
            <span className="font-medium shrink-0 inline-flex items-center gap-1.5"><Icon name="block" size={16} />Bloqueado</span>
            <span className="break-words min-w-0 sm:flex-1">{ticket?.blocked_reason ?? project.blocked_reason}</span>
            {project.blocked_since && <span className="text-white text-xs">desde {new Date(project.blocked_since).toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short' })}</span>}
          </div>
        )}

        {/* ── TABS ── */}
        <div className="shrink-0 border-b flex px-2 sm:px-6 overflow-x-auto" role="tablist">
          {([['details', 'Detalles', 'tickets'], ['checklist', 'Checklist', 'check'], ['comments', 'Comentarios', 'comments'], ['evidence', 'Evidencias', 'file'], ['history', 'Historial', 'clock']] as [Tab, string, IconName][]).map(([id, label, icon]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
              className={`px-3 sm:px-4 py-3 font-medium text-sm border-b-2 whitespace-nowrap transition ${tab === id ? 'border-primary text-primary' : 'border-transparent text-gray-600 hover:text-gray-900'}`}>
              <ControlLabel icon={icon}>{label}</ControlLabel>
            </button>
          ))}
        </div>

        {/* ── CONTENIDO ── */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {ticketError && <p role="alert" className="text-sm text-red-700 mb-3">{ticketError} <button className="underline" onClick={() => { void reloadTicket() }}>Reintentar</button></p>}

          {tab === 'details' && (
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Descripción</h3>
                {editMode ? (
                  <textarea rows={4} value={editData.description} onChange={e => setEditData(p => ({ ...p, description: e.target.value }))} aria-label="Descripción"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary resize-none" />
                ) : <p className="text-gray-700 whitespace-pre-wrap break-words">{project.description}</p>}
              </div>

              {editMode ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {(['start_date', 'due_date'] as const).map(k => (
                    <label key={k} className="text-sm">
                      <span className="block font-semibold text-gray-900 mb-1">{k === 'start_date' ? 'Fecha de inicio' : 'Fecha objetivo (opcional)'}</span>
                      <input type="date" value={editData[k]} onChange={e => setEditData(p => ({ ...p, [k]: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary" />
                    </label>
                  ))}
                </div>
              ) : (project.start_date || project.due_date) ? (
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {project.start_date && <div><p className="text-gray-600">Inicio</p><p className="font-medium text-gray-900">{new Date(project.start_date + 'T00:00:00').toLocaleDateString('es-PE')}</p></div>}
                  {project.due_date && <div><p className="text-gray-600">Fecha objetivo</p><p className="font-medium text-gray-900">{new Date(project.due_date + 'T00:00:00').toLocaleDateString('es-PE')}</p></div>}
                </div>
              ) : null}

              {/* Flujo(s): fase, progreso de fase, progreso de checklist y responsable */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-3">{(ticket?.flows.length ?? 0) > 1 ? 'Flujos del ticket' : 'Flujo del ticket'}</h3>
                {!ticket ? <p className="text-sm text-gray-400">Cargando estado del servidor…</p> : (
                  <div className="space-y-4">
                    {ticket.flows.map(flow => {
                      const canMove = editable && active && !blocked && !isDone
                      const canAssign = editable && ticket.project_status !== 'deleted' && (!blocked || canManage)
                      const draft = assignDraft[flow.id] ?? (flow.assignee_id ?? '')
                      const dirty = draft !== (flow.assignee_id ?? '')
                      const current = flow.assignee_id ? assignableUsers.find(u => u.id === flow.assignee_id) : null
                      return (
                        <div key={flow.id} className={`rounded-lg p-4 border space-y-4 ${blocked ? 'bg-red-50/40 border-red-200' : 'bg-gray-50'}`}>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h4 className="font-medium text-gray-900"><ControlLabel icon={flow.flow_type === 'development' ? 'code' : 'tickets'}>{flow.flow_type === 'development' ? 'Development' : 'Administrative (histórico)'}</ControlLabel></h4>
                            <label className="text-sm text-gray-600 flex items-center gap-2">
                              Fase
                              <select value={flow.phase} disabled={!canMove || busy} aria-label="Mover a fase"
                                onChange={e => requestMove(flow, e.target.value as Phase)}
                                className="px-2 py-1 border border-gray-300 rounded-lg text-sm bg-surface font-medium disabled:bg-gray-100">
                                {phasesFor(flow.flow_type).map(p => <option key={p} value={p}>{PHASE_LABELS[p] ?? p}</option>)}
                              </select>
                            </label>
                          </div>
                          {editable && blocked && <p className="text-xs text-red-700">Bloqueado: no se puede cambiar de fase ni terminar hasta desbloquear.</p>}
                          {editable && isDone && <p className="text-xs text-green-800">Terminado. Para volver a trabajar en él usa «Reabrir ticket».</p>}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <div className="flex justify-between text-xs text-gray-600 mb-1">
                                <span>Progreso de fase</span>
                                <span className="font-semibold">Fase {flow.phase_index + 1} de {flow.phase_count} · {pct(flow.phase_progress_percent)}</span>
                              </div>
                              <Bar value={flow.phase_progress_percent} tone={blocked ? 'bg-red-700' : 'bg-brand-600'} />
                            </div>
                            <div>
                              <div className="flex justify-between text-xs text-gray-600 mb-1">
                                <span>Progreso del checklist</span>
                                <span className="font-semibold">
                                  {flow.checklist_total === 0 ? 'Sin tareas' : `${flow.checklist_completed}/${flow.checklist_total} · ${pct(flow.checklist_progress_percent)}`}
                                </span>
                              </div>
                              <Bar value={flow.checklist_progress_percent} tone="bg-accent-500" />
                            </div>
                          </div>
                          <div>
                            {canAssign ? <label htmlFor={`assignee-${flow.id}`} className="block text-sm font-medium text-gray-600 mb-1">Responsable principal</label> : <p className="text-sm font-medium text-gray-600 mb-1">Responsable principal</p>}
                            {canAssign ? (
                              <div className="flex flex-wrap gap-2 items-center">
                                <select value={draft} onChange={e => setAssignDraft(p => ({ ...p, [flow.id]: e.target.value }))} id={`assignee-${flow.id}`}
                                  className="flex-1 min-w-[12rem] px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm bg-surface">
                                  <option value="">— Sin responsable —</option>
                                  {assignableUsers.map(u => <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>)}
                                  {flow.assignee_id && !assignableUsers.some(u => u.id === flow.assignee_id) && <option value={flow.assignee_id}>Usuario no disponible</option>}
                                </select>
                                {dirty && (
                                  <button disabled={busy} onClick={() => {
                                    const target = draft || null
                                    if (!target && !confirm('¿Retirar el responsable principal? Quedará registrado.')) return
                                    void run(() => board.assign(project.id, target, actionKey(), flow.id), target ? 'Responsable actualizado' : 'Responsable retirado')
                                      .then(ok => { if (ok) setAssignDraft(p => { const n = { ...p }; delete n[flow.id]; return n }) })
                                  }} className="px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-semibold hover:bg-brand-700 disabled:opacity-50">
                                    {draft ? 'Reasignar' : 'Retirar'}
                                  </button>
                                )}
                              </div>
                            ) : current ? (
                              <div className="flex items-center gap-2">
                                <div className={`w-7 h-7 rounded-full ${getAvatarColor(current.full_name)} flex items-center justify-center text-white text-xs font-bold`}>{getInitials(current.full_name)}</div>
                                <p className="text-sm font-medium text-gray-800">{current.full_name} <span className="text-xs text-gray-400">({current.role})</span></p>
                              </div>
                            ) : <p className="text-sm text-gray-500 italic">{userName(flow.assignee_id) ?? 'Sin responsable'}</p>}
                            {editable && blocked && !canManage && <p className="text-xs text-gray-500 mt-1">Mientras está bloqueado, solo admin o superadmin pueden reasignar.</p>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><p className="text-gray-600">Creado</p><p className="font-medium text-gray-900">{new Date(project.created_at).toLocaleDateString('es-PE')}</p></div>
                <div><p className="text-gray-600">Última actualización</p><p className="font-medium text-gray-900">{new Date(project.updated_at).toLocaleDateString('es-PE')}</p></div>
              </div>
            </div>
          )}

          {tab === 'checklist' && (
            <div className="space-y-8">
              {(ticket?.flows ?? []).map(flow => (
                <div key={flow.id}>
                  <h3 className="font-medium text-gray-900 mb-1"><ControlLabel icon={flow.flow_type === 'development' ? 'code' : 'tickets'}>{flow.flow_type === 'development' ? 'Development' : 'Administrative (histórico)'}</ControlLabel></h3>
                  <p className="text-xs text-gray-500 mb-1">
                    Progreso del checklist (servidor): {flow.checklist_total === 0 ? 'sin tareas' : pct(flow.checklist_progress_percent)}.
                    {blocked && ' El checklist se puede actualizar aunque el ticket esté bloqueado.'}
                  </p>
                  <ChecklistSection key={`${flow.id}-${flow.phase}`} flow={{ id: flow.id, flow_type: flow.flow_type, current_phase: flow.phase } as ProjectFlow}
                    onChanged={() => { void reloadTicket(); setHistory(h => h + 1); onUpdate?.() }} />
                </div>
              ))}
            </div>
          )}

          {tab === 'comments' && <CommentsSection projectId={project.id} />}
          {tab === 'evidence' && <EvidenceSection projectId={project.id} requestId={project.request_id} editable={editable && ticket?.project_status !== 'deleted'} onChanged={() => setHistory(h => h + 1)} />}
          {tab === 'history' && (project.request_id
            ? <RequestTimeline requestId={project.request_id} projectId={project.id} catalogs={catalogs} refreshKey={history} />
            : <p className="text-sm text-gray-600">Sin historial vinculado.</p>)}
        </div>

        {/* ── FOOTER ── */}
        <div className="shrink-0 bg-gray-50 border-t px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2 flex-wrap">
            {!editMode && editable && ticket && (
              <>
                {active && !isDone && (blocked ? (
                  <>
                    <button onClick={() => { void run(() => board.unblock(project.id, actionKey()), 'Ticket desbloqueado') }} disabled={busy}
                      className="ui-button ui-button-secondary"><ControlLabel icon="check">Desbloquear</ControlLabel></button>
                    <button onClick={() => setDialog({ kind: 'block' })} disabled={busy}
                      className="ui-button ui-button-danger">Corregir motivo</button>
                  </>
                ) : (
                  <button onClick={() => setDialog({ kind: 'block' })} disabled={busy}
                    className="ui-button ui-button-danger"><ControlLabel icon="block">Bloquear</ControlLabel></button>
                ))}
                {isDone && !blocked && ticket.project_status !== 'deleted' && ticket.project_status !== 'archived' && (
                  <button onClick={() => setDialog({ kind: 'reopen' })} disabled={busy}
                    className="ui-button ui-button-secondary"><ControlLabel icon="refresh">Reabrir ticket</ControlLabel></button>
                )}
                {(ticket.project_status === 'active' || ticket.project_status === 'completed') && (
                  <button onClick={() => { if (confirm('¿Archivar este ticket? Se conserva su historial y puede restaurarse.')) void run(() => board.archive(project.id, actionKey()), 'Ticket archivado') }} disabled={busy}
                    className="ui-button ui-button-secondary"><ControlLabel icon="archive">Archivar</ControlLabel></button>
                )}
                {(ticket.project_status === 'archived' || (ticket.project_status === 'deleted' && canManage)) && (
                  <button onClick={() => { void run(() => board.restore(project.id, actionKey()), 'Ticket restaurado') }} disabled={busy}
                    className="ui-button ui-button-secondary"><ControlLabel icon="refresh">Restaurar</ControlLabel></button>
                )}
              </>
            )}
          </div>
          <div className="flex gap-2">
            {editMode ? (
              <>
                <button onClick={() => { setEditMode(false); setEditData(blank()) }} className="ui-button ui-button-secondary">Cancelar</button>
                <button onClick={() => { void handleSaveEdit() }} disabled={!editable || busy || !editData.title.trim()}
                  className="ui-button ui-button-primary">{busy ? 'Guardando…' : 'Guardar cambios'}</button>
              </>
            ) : (
              <>
                {editable && <button onClick={() => { setEditData(blank()); setEditMode(true) }} className="ui-button ui-button-secondary"><ControlLabel icon="edit">Editar</ControlLabel></button>}
                <button onClick={onClose} className="ui-button ui-button-secondary">Cerrar</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>

    {dialog?.kind === 'block' && (
      <BlockDialog initial={blocked ? ticket?.blocked_reason : null} busy={busy} onCancel={() => setDialog(null)}
        onConfirm={reason => { void run(() => board.block(project.id, reason, actionKey()), blocked ? 'Motivo actualizado' : 'Ticket bloqueado').then(ok => { if (ok) setDialog(null) }) }} />
    )}
    {dialog?.kind === 'reopen' && ticket && (
      <ReopenDialog flows={ticket.flows} busy={busy} onCancel={() => setDialog(null)}
        onConfirm={(flowId, phase, reason) => { void run(() => board.reopen(project.id, phase as Phase, reason, actionKey(), flowId), 'Ticket reabierto').then(ok => { if (ok) setDialog(null) }) }} />
    )}
    {dialog?.kind === 'done' && ticket && (
      <DoneConfirmDialog key={ticket.pending_fingerprint} title={project.title} pending={ticket.pending_items} busy={busy} onCancel={() => setDialog(null)}
        onConfirm={() => {
          const d = dialog
          void run(() => board.movePhase(project.id, d.target, d.key, { flowId: d.flowId, confirmPending: true, pendingFingerprint: ticket.pending_fingerprint }), 'Ticket terminado (Done)')
            .then(ok => { if (ok) setDialog(null) })
        }} />
    )}
    </>
  )
}
