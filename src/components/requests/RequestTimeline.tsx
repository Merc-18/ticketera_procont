import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { useCatalogs } from '../../hooks/useCatalogs'
import { GENERAL_STATUS, isGeneralStatus, limaDateTime, type GeneralStatus } from '../../lib/request-status'
import { PHASE_LABELS, PRIORITY_LABEL } from '../../lib/constants'
import Icon from '../ui/Icon'

interface Entry { key: string; at: string; actor: string | null; source: 'ticket' | 'proyecto'; title: string; detail?: string; status?: GeneralStatus; tone?: 'block' | 'done' | 'reopen' }
type Catalogs = ReturnType<typeof useCatalogs>

const ACTION: Record<string, string> = {
  submitted: 'Solicitud recibida', review_started: 'Revisión iniciada', classified: 'Clasificación registrada',
  approved: 'Aprobada y trabajo creado', rejected: 'Rechazada', requester_corrected: 'Datos del solicitante corregidos',
  phase_changed: 'Cambio de fase', blocked: 'Bloqueado', unblocked: 'Desbloqueado',
  // Operaciones del tablero (M12, auditoría del servidor)
  block_reason_changed: 'Motivo de bloqueo corregido', assigned: 'Responsable asignado', reassigned: 'Responsable reasignado',
  unassigned: 'Responsable retirado', priority_changed: 'Prioridad cambiada', checklist_added: 'Tarea agregada al checklist',
  checklist_updated: 'Tarea del checklist actualizada', checklist_deleted: 'Tarea eliminada del checklist',
  completed: 'Ticket terminado (Done)', reopened: 'Ticket reabierto', archived: 'Archivado', restored: 'Restaurado',
  bulk_updated: 'Operación masiva', evidence_reserved: 'Evidencia reservada', evidence_uploaded: 'Evidencia subida',
  // activity_logs (historial del proyecto)
  created: 'Proyecto creado', sla_started: 'SLA iniciado (histórico)', phase_change: 'Cambio de fase (tablero)',
  edited: 'Proyecto editado', due_date_changed: 'Fecha de entrega cambiada', sla_completed: 'Trabajo completado (histórico)',
  comment: 'Comentario', comment_added: 'Comentario agregado', status_changed: 'Estado del proyecto cambiado', project_deleted: 'Proyecto eliminado', project_restored: 'Proyecto restaurado',
}
const PRIORITY: Record<string, string> = PRIORITY_LABEL
const ROLE: Record<string, string> = { superadmin: 'superadmin', admin: 'admin', developer: 'developer', viewer: 'viewer' }
const phase = (p?: string) => (p ? PHASE_LABELS[p] ?? p : '—')
const FLOW: Record<string, string> = { development: 'Desarrollo', administrative: 'Administrativo' }

/**
 * Línea de tiempo interna del ticket (solo miembros; RLS). Combina request_events (estados generales,
 * revisión, clasificación, decisiones, fases y bloqueos registrados en el servidor) con activity_logs
 * del proyecto asociado. Identificador estable: UUID interno de la solicitud (nunca el token).
 */
export default function RequestTimeline({ requestId, projectId, catalogs, refreshKey }: {
  requestId: string; projectId?: string | null; catalogs: Catalogs; refreshKey?: number
}) {
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [current, setCurrent] = useState<GeneralStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  const nameOf = (list: { id: string; name: string }[], id?: unknown) => (typeof id === 'string' ? list.find(x => x.id === id)?.name : undefined)
  const codeOf = (id?: unknown) => catalogs.codes.find(c => c.id === id)?.code

  const load = useCallback(async () => {
    const [ev, logs, users] = await Promise.all([
      supabase.from('request_events').select('id,action,details,actor_id,created_at').eq('request_id', requestId).order('id'),
      projectId ? supabase.from('activity_logs').select('id,action,details,user_id,created_at').eq('project_id', projectId).order('created_at')
        : Promise.resolve({ data: [], error: null }),
      supabase.from('users').select('id,full_name'),
    ])
    if (ev.error) { setError('No se pudo cargar la trazabilidad.'); return }
    const who = new Map((users.data ?? []).map(u => [u.id as string, u.full_name as string]))
    const list: Entry[] = []
    let last: GeneralStatus | null = null
    for (const e of ev.data ?? []) {
      const d = (e.details ?? {}) as Record<string, any>
      // Nombre y rol del actor al momento de actuar (snapshot del servidor); si no, el perfil actual.
      const actorName = d.actor_name ?? (e.actor_id ? who.get(e.actor_id) ?? 'Usuario interno' : null)
      const actor = actorName && d.actor_role ? `${actorName} (${ROLE[d.actor_role] ?? d.actor_role})` : actorName
      const person = (id?: string | null) => (id ? who.get(id) ?? 'Usuario no disponible' : 'Sin responsable')
      if (e.action === 'status_changed') {
        if (isGeneralStatus(d.to)) {
          last = d.to
          list.push({ key: `e${e.id}`, at: e.created_at, actor, source: 'ticket', status: d.to,
            title: `Estado: ${GENERAL_STATUS[d.to].label}`, detail: d.cause === 'baseline' ? 'Estado inicial registrado' : undefined })
        }
        continue
      }
      let detail: string | undefined
      if (e.action === 'classified') {
        const isProcont = codeOf(d.studio_code_id) === 'PROCONT'
        detail = [codeOf(d.studio_code_id) && `Código ${codeOf(d.studio_code_id)}`,
          nameOf(catalogs.subsystems, d.subsystem_id) && `Subproyecto ${nameOf(catalogs.subsystems, d.subsystem_id)}`,
          isProcont && nameOf(catalogs.areas, d.area_id) && `Área ${nameOf(catalogs.areas, d.area_id)}`,
          isProcont && nameOf(catalogs.areas, d.subarea_id) && `Subárea ${nameOf(catalogs.areas, d.subarea_id)}`].filter(Boolean).join(' · ')
      }
      if (e.action === 'phase_changed') detail = `${d.flow_type ? `${FLOW[d.flow_type] ?? d.flow_type}: ` : ''}${phase(d.from)} → ${phase(d.to)}`
      if (e.action === 'blocked') detail = `Motivo: ${d.reason || '—'}`
      if (e.action === 'unblocked') detail = `Motivo previo: ${d.reason || '—'}${d.blocked_since ? ` · Bloqueado desde ${limaDateTime(d.blocked_since)}` : ''}`
      if (e.action === 'block_reason_changed') detail = `Antes: ${d.previous_reason || '—'} → Ahora: ${d.reason || '—'}`
      if (e.action === 'rejected') detail = d.rejection_reason ? `Nota interna: ${d.rejection_reason}` : undefined
      if (['assigned', 'reassigned', 'unassigned'].includes(e.action)) detail = `${person(d.previous_assignee)} → ${person(d.new_assignee)}`
      if (e.action === 'priority_changed') detail = `${d.from ? PRIORITY[d.from] ?? d.from : 'Inicial'} → ${PRIORITY[d.to] ?? d.to}`
      if (e.action.startsWith('checklist_')) {
        const prev = d.previous ?? {}, next = d.new ?? {}
        const item = next.description ?? prev.description ?? ''
        detail = e.action === 'checklist_updated' && prev.completed !== next.completed
          ? `«${item}» · ${next.completed ? 'marcada como completada' : 'marcada como pendiente'}`
          : e.action === 'checklist_updated' && prev.description !== next.description
            ? `«${prev.description}» → «${next.description}»`
            : `«${item}»${next.phase || prev.phase ? ` · fase ${phase(next.phase ?? prev.phase)}` : ''}`
      }
      if (e.action === 'completed') {
        const pend = Array.isArray(d.pending_items) ? d.pending_items : []
        detail = `${phase(d.from_phase)} → ${phase(d.to_phase)}` + (d.pending_confirmed
          ? ` · Confirmado con ${pend.length} tarea(s) pendiente(s): ${pend.map((i: any) => i.description).join('; ')}` : ' · Sin tareas pendientes')
      }
      if (e.action === 'reopened') detail = `${phase(d.from_phase)} → ${phase(d.to_phase)} · Motivo: ${d.reason || '—'}`
      if (e.action === 'archived' || e.action === 'restored') detail = d.from_status && d.to_status ? `${d.from_status} → ${d.to_status}` : undefined
      if (e.action === 'bulk_updated') detail = d.action === 'set_priority' ? 'Cambio masivo de prioridad' : d.action === 'archive' ? 'Archivado masivo' : d.action
      if (e.action.startsWith('evidence_')) detail = `${d.file_name ?? ''}${d.size_bytes != null ? ` · ${Math.round(Number(d.size_bytes) / 1024)} KB` : ''}`
      const tone = e.action === 'blocked' || e.action === 'block_reason_changed' ? 'block' : e.action === 'completed' ? 'done' : e.action === 'reopened' ? 'reopen' : undefined
      list.push({ key: `e${e.id}`, at: e.created_at, actor, source: 'ticket', title: ACTION[e.action] ?? e.action, detail, tone })
    }
    for (const l of logs.data ?? []) {
      // Registro anterior del proyecto (solo lectura). Bloqueos ya constan en request_events.
      if (['blocked', 'unblocked'].includes(l.action)) continue
      const d = (l.details ?? {}) as Record<string, any>
      const detail = l.action === 'priority_changed' ? `${PRIORITY[d.from] ?? d.from} → ${PRIORITY[d.to] ?? d.to}`
        : l.action === 'due_date_changed' ? `${d.from ?? '—'} → ${d.to ?? '—'}`
        : ['phase_changed', 'phase_change'].includes(l.action) ? `${phase(d.from)} → ${phase(d.to)}`
        : ['assigned', 'reassigned'].includes(l.action) ? `${d.from ? who.get(d.from) ?? '—' : 'Sin responsable'} → ${d.to ? who.get(d.to) ?? '—' : '—'}`
        : l.action === 'status_changed' ? `${d.from ?? '—'} → ${d.to ?? '—'}` : undefined
      list.push({ key: `a${l.id}`, at: l.created_at, actor: l.user_id ? who.get(l.user_id) ?? 'Usuario interno' : null,
        source: 'proyecto', title: ACTION[l.action] ?? l.action, detail })
    }
    list.sort((a, b) => a.at.localeCompare(b.at))
    setEntries(list); setCurrent(last); setError(null)
  }, [requestId, projectId, catalogs.codes, catalogs.areas, catalogs.subsystems])

  useEffect(() => { void load() }, [load, refreshKey])

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-brand-700">Historial inmutable</h3>
        {current && <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-medium ${GENERAL_STATUS[current].tone}`}>
          <Icon name={GENERAL_STATUS[current].icon} size={12} />{GENERAL_STATUS[current].label}</span>}
      </div>
      <p className="text-[13px] text-gray-600">Registro generado por el servidor; no admite edición ni borrado. Horas de Perú (Lima).</p>
      <p className="text-[13px] text-gray-600 font-mono break-all">ID interno: {requestId}</p>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {entries === null ? <p role="status" className="text-sm text-gray-600">Cargando…</p> : entries.length === 0 ? <p className="text-sm text-gray-600">Sin eventos registrados.</p> : (
        <ol className="border-l-2 border-brand-100 ml-2 space-y-3">
          {entries.map(e => (
            <li key={e.key} className="pl-4 relative">
              <span className={`absolute -left-[7px] top-1.5 w-3 h-3 rounded-full ${e.tone === 'block' ? 'bg-red-700' : e.tone === 'done' ? 'bg-green-700' : e.tone === 'reopen' ? 'bg-yellow-100' : e.status ? 'bg-accent-400' : e.source === 'proyecto' ? 'bg-gray-300' : 'bg-brand-600'}`} />
              <p className="text-sm font-medium text-gray-900">{e.title}
                {e.source === 'proyecto' && <span className="ml-2 text-[13px] text-gray-600">registro anterior</span>}</p>
              {e.detail && <p className="text-xs text-gray-600 break-words">{e.detail}</p>}
              <p className="text-[13px] text-gray-600">{limaDateTime(e.at)} (Lima){e.actor ? ` · ${e.actor}` : ''}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
