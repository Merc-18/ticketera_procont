import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { useCatalogs } from '../../hooks/useCatalogs'
import { GENERAL_STATUS, isGeneralStatus, limaDateTime, type GeneralStatus } from '../../lib/request-status'
import { PHASE_LABELS } from '../../lib/constants'

interface Entry { key: string; at: string; actor: string | null; source: 'ticket' | 'proyecto'; title: string; detail?: string; status?: GeneralStatus }
type Catalogs = ReturnType<typeof useCatalogs>

const ACTION: Record<string, string> = {
  submitted: 'Solicitud recibida', review_started: 'Revisión iniciada', classified: 'Clasificación registrada',
  approved: 'Aprobada y trabajo creado', rejected: 'Rechazada', requester_corrected: 'Datos del solicitante corregidos',
  phase_changed: 'Cambio de fase', blocked: 'Bloqueado', unblocked: 'Desbloqueado',
  // activity_logs (historial del proyecto)
  created: 'Proyecto creado', sla_started: 'SLA iniciado', phase_change: 'Cambio de fase (tablero)', priority_changed: 'Prioridad cambiada',
  edited: 'Proyecto editado', due_date_changed: 'Fecha de entrega cambiada', sla_completed: 'Trabajo completado',
  assigned: 'Responsable asignado', comment: 'Comentario',
}
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
      const actor = e.actor_id ? who.get(e.actor_id) ?? 'Usuario interno' : null
      if (e.action === 'status_changed') {
        if (isGeneralStatus(d.to)) {
          last = d.to
          list.push({ key: `e${e.id}`, at: e.created_at, actor, source: 'ticket', status: d.to,
            title: `Estado: ${GENERAL_STATUS[d.to].label}`, detail: d.cause === 'baseline' ? 'Estado inicial registrado' : undefined })
        }
        continue
      }
      let detail: string | undefined
      if (e.action === 'classified') detail = [codeOf(d.studio_code_id) && `Código ${codeOf(d.studio_code_id)}`,
        nameOf(catalogs.subsystems, d.subsystem_id) && `Subproyecto ${nameOf(catalogs.subsystems, d.subsystem_id)}`,
        nameOf(catalogs.areas, d.area_id) && `Área ${nameOf(catalogs.areas, d.area_id)}`,
        nameOf(catalogs.areas, d.subarea_id) && `Subárea ${nameOf(catalogs.areas, d.subarea_id)}`].filter(Boolean).join(' · ')
      if (e.action === 'phase_changed') detail = `${FLOW[d.flow_type] ?? d.flow_type}: ${PHASE_LABELS[d.from] ?? d.from} → ${PHASE_LABELS[d.to] ?? d.to}`
      if (e.action === 'blocked') detail = `Motivo: ${d.reason || '—'}`
      if (e.action === 'unblocked') detail = `Motivo previo: ${d.reason || '—'}${d.blocked_since ? ` · Bloqueado desde ${limaDateTime(d.blocked_since)}` : ''}`
      if (e.action === 'rejected') detail = d.rejection_reason ? `Nota interna: ${d.rejection_reason}` : undefined
      list.push({ key: `e${e.id}`, at: e.created_at, actor, source: 'ticket', title: ACTION[e.action] ?? e.action, detail })
    }
    for (const l of logs.data ?? []) {
      if (['blocked', 'unblocked'].includes(l.action)) continue   // ya registrados en el servidor (request_events)
      const d = (l.details ?? {}) as Record<string, any>
      const detail = l.action === 'priority_changed' ? `${d.from} → ${d.to}` : l.action === 'due_date_changed' ? `${d.from ?? '—'} → ${d.to ?? '—'}` : undefined
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
        <h3 className="text-sm font-semibold text-brand-700 uppercase tracking-wide">Trazabilidad</h3>
        {current && <span className={`px-3 py-1 rounded-full border text-xs font-semibold ${GENERAL_STATUS[current].tone}`}>
          {GENERAL_STATUS[current].icon} {GENERAL_STATUS[current].label}</span>}
      </div>
      <p className="text-[11px] text-gray-400 font-mono break-all">ID interno: {requestId}</p>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {entries === null ? <p className="text-sm text-gray-400">Cargando…</p> : entries.length === 0 ? <p className="text-sm text-gray-400">Sin eventos registrados.</p> : (
        <ol className="border-l-2 border-brand-100 ml-2 space-y-3">
          {entries.map(e => (
            <li key={e.key} className="pl-4 relative">
              <span className={`absolute -left-[7px] top-1.5 w-3 h-3 rounded-full ${e.status ? 'bg-accent-400' : e.source === 'proyecto' ? 'bg-gray-300' : 'bg-brand-600'}`} />
              <p className="text-sm font-medium text-gray-900">{e.title}
                {e.source === 'proyecto' && <span className="ml-2 text-[10px] uppercase text-gray-400">proyecto</span>}</p>
              {e.detail && <p className="text-xs text-gray-600">{e.detail}</p>}
              <p className="text-[11px] text-gray-400">{limaDateTime(e.at)} (Lima){e.actor ? ` · ${e.actor}` : ''}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
