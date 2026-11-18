import { useEffect, useRef, useState } from 'react'
import type { Request, User } from '../../types/database.types'
import type { useCatalogs } from '../../hooks/useCatalogs'
import { operations } from '../../lib/api'
import { createRpcAttempt } from '../../lib/rpc-attempt'
import { errorMessage } from '../../lib/supabase-errors'
import { listRequestAttachments } from '../../lib/attachments'
import { toast } from '../../lib/toast'

type Catalogs = ReturnType<typeof useCatalogs>
type Mode = 'view' | 'approve' | 'reject'
type Priority = 'low' | 'medium' | 'high' | 'urgent'
type BoardType = 'development' | 'administrative' | 'dual'

const PRIORITIES: [Priority, string][] = [['low', 'Baja'], ['medium', 'Media'], ['high', 'Alta'], ['urgent', 'Urgente']]
const BOARDS: [BoardType, string][] = [['development', '💻 Desarrollo'], ['administrative', '📋 Administrativo'], ['dual', '🔀 Ambos']]
const input = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none bg-white'

interface Props {
  request: Request
  initialMode: Mode
  canManage: boolean
  catalogs: Catalogs
  users: User[]
  onApprove: (id: string, data: { title: string; project_type: BoardType; priority: Priority; assigned_dev?: string; assigned_admin?: string },
    attempt: ReturnType<typeof createRpcAttempt>) => Promise<void>
  onReject: (id: string, reason: string) => Promise<void>
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
  const [board, setBoard] = useState<BoardType>('development')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [files, setFiles] = useState<{ name: string; url: string | null }[] | null>(null)
  const attempt = useRef(createRpcAttempt())

  useEffect(() => { void listRequestAttachments(r.id).then(setFiles) }, [r.id])

  const name = (list: { id: string; name: string }[], id?: string | null) => (id ? list.find(x => x.id === id)?.name : undefined)
  const classified = !!r.studio_id
  const system = catalogs.systems.find(s => s.id === r.system_id)
  const subs = catalogs.subsystems.filter(s => s.system_id === r.system_id)
  const studioAreas = catalogs.areas.filter(a => a.studio_id === r.studio_id && !a.parent_id && r.studio_id)
  const subareas = catalogs.areas.filter(a => a.parent_id === area && area)
  const codes = catalogs.codes.filter(c => c.studio_id === r.studio_id)
  const requiresSub = !!system?.requires_subproject && subs.length > 0
  const urgent = r.urgent_requested || !!r.observations?.startsWith('🔴 URGENTE')

  const missing = (() => {
    if (!classified) return null
    if (!code) return 'Selecciona el código interno del estudio.'
    if (mode === 'approve' && studioAreas.length > 0 && !area) return 'Selecciona el área (obligatoria para este estudio).'
    if (mode === 'approve' && requiresSub && !subsystem) return 'Selecciona el subproyecto.'
    if (mode === 'approve' && !responsible) return 'Selecciona el responsable.'
    if (mode === 'reject' && !reason.trim()) return 'Indica el motivo del rechazo.'
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
        await onApprove(r.id, { title: r.title || r.request_type, project_type: board, priority,
          assigned_dev: responsible, assigned_admin: responsible }, attempt.current)
        toast.success('Solicitud aceptada y trabajo creado en el tablero')
      } else {
        await onReject(r.id, reason)
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-3xl w-full max-h-[92vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b bg-brand-700 rounded-t-xl">
          <div>
            <p className="font-mono text-accent-300 text-sm">{r.request_number}</p>
            <h2 className="text-lg font-bold text-white">{r.title || r.request_type}</h2>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white text-2xl leading-none">✕</button>
        </div>

        <div className="p-6 space-y-6">
          {/* Información original del solicitante */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-brand-700 uppercase tracking-wide">Solicitud del cliente</h3>
            {urgent && <p className="inline-block px-3 py-1 bg-red-100 text-red-700 border border-red-200 rounded-full text-xs font-bold">🔴 Atención urgente solicitada</p>}
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
              {files === null ? <p className="text-sm text-gray-400">Cargando...</p>
                : files.length === 0 ? <p className="text-sm text-gray-400">Sin adjuntos</p>
                : <ul className="flex flex-wrap gap-2">{files.map(f => (
                    <li key={f.name}>{f.url
                      ? <a href={f.url} target="_blank" rel="noreferrer" className="inline-block px-3 py-1 bg-brand-50 text-brand-700 rounded-lg text-xs font-medium hover:bg-brand-100">📎 {f.name}</a>
                      : <span className="text-xs text-gray-500">📎 {f.name}</span>}</li>))}</ul>}
            </div>
          </section>

          {/* Clasificación interna */}
          {classified && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-brand-700 uppercase tracking-wide">Clasificación interna</h3>
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
                    <label className="block text-xs font-medium text-gray-600 mb-1">Código interno del estudio *</label>
                    <select value={code} onChange={e => setCode(e.target.value)} className={`${input} font-mono`}>
                      <option value="">Selecciona un código</option>
                      {codes.map(c => <option key={c.id} value={c.id}>{c.code}</option>)}
                    </select>
                  </div>
                  {subs.length > 0 && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Subproyecto {requiresSub && mode === 'approve' ? '*' : ''}</label>
                      <select value={subsystem} onChange={e => setSubsystem(e.target.value)} className={input}>
                        <option value="">Sin subproyecto</option>
                        {subs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                  )}
                  {studioAreas.length > 0 ? (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Área {mode === 'approve' ? '*' : ''}</label>
                        <select value={area} onChange={e => { setArea(e.target.value); setSubarea('') }} className={input}>
                          <option value="">Selecciona un área</option>
                          {studioAreas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                      </div>
                      {subareas.length > 0 && (
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Subárea (opcional)</label>
                          <select value={subarea} onChange={e => setSubarea(e.target.value)} className={input}>
                            <option value="">Sin subárea</option>
                            {subareas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                          </select>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-gray-400 self-end pb-2">Área y subárea no aplican a este estudio.</p>
                  )}
                </div>
              )}
            </section>
          )}

          {/* Decisión */}
          {decided ? (
            <section className={`rounded-lg p-4 border ${r.status === 'approved' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <p className="text-sm font-semibold">{r.status === 'approved' ? '✅ Aceptada — trabajo creado en el tablero' : '❌ Rechazada'}</p>
              {r.rejection_reason && <p className="text-sm text-red-800 mt-1 whitespace-pre-wrap">{r.rejection_reason}</p>}
              {r.classified_at && <p className="text-xs text-gray-500 mt-1">Clasificada el {new Date(r.classified_at).toLocaleString('es-PE')}</p>}
            </section>
          ) : canManage ? (
            <section className="space-y-4">
              <div className="flex gap-2">
                <button onClick={() => setMode('approve')} className={`flex-1 py-2 rounded-lg text-sm font-semibold border-2 transition ${mode === 'approve' ? 'border-green-500 bg-green-50 text-green-800' : 'border-gray-200 text-gray-500'}`}>✓ Aceptar</button>
                <button onClick={() => setMode('reject')} className={`flex-1 py-2 rounded-lg text-sm font-semibold border-2 transition ${mode === 'reject' ? 'border-red-500 bg-red-50 text-red-800' : 'border-gray-200 text-gray-500'}`}>✕ Rechazar</button>
              </div>

              {mode === 'approve' ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Responsable *</label>
                    <select value={responsible} onChange={e => setResponsible(e.target.value)} className={input}>
                      <option value="">Selecciona</option>
                      {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Prioridad definitiva *</label>
                    <select value={priority} onChange={e => setPriority(e.target.value as Priority)} className={input}>
                      {PRIORITIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Tablero *</label>
                    <select value={board} onChange={e => setBoard(e.target.value as BoardType)} className={input}>
                      {BOARDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div className="sm:col-span-3 bg-gray-50 border border-dashed rounded-lg px-3 py-2 text-xs text-gray-600">
                    <strong>SLA interno:</strong> Pendiente de configuración. Los plazos de Procont aún no están definidos; no se asigna fecha.
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Motivo del rechazo *</label>
                  <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} maxLength={5000}
                    placeholder="Este motivo será visible para el solicitante en el seguimiento"
                    className={`${input} resize-none`} />
                </div>
              )}

              {missing && <p className="text-xs text-amber-700">{missing}</p>}
              <div className="flex gap-3">
                <button onClick={onClose} className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-lg font-semibold hover:bg-gray-200">Cancelar</button>
                <button onClick={() => void decide()} disabled={busy || !!missing}
                  className={`flex-1 py-2.5 rounded-lg font-semibold text-white disabled:opacity-50 ${mode === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}>
                  {busy ? 'Guardando...' : mode === 'approve' ? 'Aceptar y crear trabajo' : 'Confirmar rechazo'}
                </button>
              </div>
            </section>
          ) : (
            <p className="text-sm text-gray-500">Pendiente de validación por un administrador.</p>
          )}
        </div>
      </div>
    </div>
  )
}
