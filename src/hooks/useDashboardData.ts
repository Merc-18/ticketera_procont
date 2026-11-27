import { averageTicketAge } from '../lib/ticket-age'
import { useLimaDay } from './useLimaDay'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { countTicketsByStudio, type TicketsByStudio, type TicketsClient } from '../lib/tickets-by-studio'
import { readVerifiedPages } from '../lib/verified-pagination'

/**
 * Datos del Dashboard (reestructuración D-045). Solo lecturas que el panel interno ya tenía permitidas por RLS
 * (projects con sus flujos, requests, request_events); sin RPC nuevas, sin cifras inventadas.
 *
 * - Solicitudes: estado actual de la bandeja (recibidas / en revisión) y resultado de las recibidas en el periodo.
 *   «En revisión» = pendiente con evento `review_started` o `classified` (misma regla que el seguimiento público).
 * - Trabajo: estado actual de los proyectos (en ejecución, bloqueados y antigüedad real) y totales completados/archivados.
 * - Prioridad: solo trabajo en ejecución.
 * - Carga: tickets en ejecución por responsable (flujos con assigned_to).
 * - Tickets por estudio (24/11/2026, sustituye al bloque de áreas): solicitudes del periodo por `studio_id`,
 *   paginadas y verificadas con count=exact (lib/tickets-by-studio.ts). El área no interviene.
 * La clasificación por tipo (development / administrative / dual) ya no forma parte del Dashboard.
 */
export interface DashboardStats {
  requests: { received: number; inReview: number; approved: number; rejected: number; inPeriod: number }
  work: { active: number; completed: number; archived: number; blocked: number; averageAgeDays: number | null }
  priorityActive: { urgent: number; high: number; medium: number; low: number }
  workload: { userId: string; count: number }[]
  unassignedActive: number
  /** null si el conteo no se pudo verificar (el error va en ticketsError, sin bloquear el resto). */
  ticketsByStudio: TicketsByStudio | null
  ticketsError: string | null
}

interface Filters { periodDays: number | null; studioId: string | null; areaId: string | null; procontStudioId: string | null; procontCodeId: string | null }

type ReqRow = { id: string; status: 'pending' | 'approved' | 'rejected'; created_at: string; studio_id: string | null; studio_code_id: string | null; area_id: string | null }
type ProjRow = { id: string; status: string; priority: keyof DashboardStats['priorityActive']; is_blocked: boolean; created_at: string; requests: { studio_id: string | null; studio_code_id: string | null; area_id: string | null }[] | null; project_flows: { assigned_to: string | null }[] | null }

const chunk = <T,>(list: T[], size: number) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size))

export function useDashboardData({ periodDays, studioId, areaId, procontStudioId, procontCodeId }: Filters) {
  const today = useLimaDay()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null); setStats(null)
    let projectsData: ProjRow[], requestsData: ReqRow[]
    try {
      ;[projectsData, requestsData] = await Promise.all([
        readVerifiedPages((from, to) => supabase.from('projects').select(
          'id, status, priority, is_blocked, created_at, requests(studio_id, studio_code_id, area_id), project_flows(assigned_to)', { count: 'exact' })
          .neq('status', 'deleted').order('id', { ascending: true }).range(from, to)),
        readVerifiedPages((from, to) => supabase.from('requests').select(
          'id, status, created_at, studio_id, studio_code_id, area_id', { count: 'exact' })
          .order('id', { ascending: true }).range(from, to)),
      ]) as unknown as [ProjRow[], ReqRow[]]
    } catch {
      setError('No se pudieron cargar todas las métricas. No se muestran totales parciales. Usa «Actualizar» para reintentar.')
      setLoading(false); return
    }

    const areaApplies = !!procontCodeId && (!studioId || studioId === procontStudioId)
    const inScope = (sid: string | null | undefined, codeId: string | null | undefined, aid: string | null | undefined) =>
      (!studioId || sid === studioId) && (!areaId || (areaApplies && codeId === procontCodeId && aid === areaId))

    // ── Solicitudes ─────────────────────────────────────────────────────────────
    const since = periodDays ? Date.now() - periodDays * 86_400_000 : null
    const reqs = requestsData.filter(r => inScope(r.studio_id, r.studio_code_id, r.area_id))
    const pending = reqs.filter(r => r.status === 'pending')
    const reviewed = new Set<string>()
    for (const ids of chunk(pending.map(r => r.id), 100)) {
      if (!ids.length) continue
      const { data, error: err } = await supabase.from('request_events').select('request_id')
        .in('request_id', ids).in('action', ['review_started', 'classified'])
      if (err) { setError('No se pudo determinar qué solicitudes están en revisión.'); setLoading(false); return }
      for (const e of (data ?? []) as { request_id: string }[]) reviewed.add(e.request_id)
    }
    const period = since ? reqs.filter(r => new Date(r.created_at).getTime() >= since) : reqs
    const requestsStats = {
      received: pending.filter(r => !reviewed.has(r.id)).length,
      inReview: pending.filter(r => reviewed.has(r.id)).length,
      approved: period.filter(r => r.status === 'approved').length,
      rejected: period.filter(r => r.status === 'rejected').length,
      inPeriod: period.length,
    }

    // ── Trabajo ─────────────────────────────────────────────────────────────────
    const projs = projectsData.filter(p => {
      const request = p.requests?.[0]
      return inScope(request?.studio_id, request?.studio_code_id, request?.area_id)
    })
    const active = projs.filter(p => p.status === 'active')
    const priorityActive = { urgent: 0, high: 0, medium: 0, low: 0 }
    for (const p of active) if (p.priority in priorityActive) priorityActive[p.priority]++
    const work = {
      active: active.length,
      completed: projs.filter(p => p.status === 'completed').length,
      archived: projs.filter(p => p.status === 'archived').length,
      blocked: active.filter(p => p.is_blocked).length,
      averageAgeDays: averageTicketAge(active, today),
    }

    // ── Carga del equipo (tickets en ejecución por responsable) ────────────────
    const perUser = new Map<string, Set<string>>()
    const withOwner = new Set<string>()
    for (const p of active) for (const f of p.project_flows ?? []) {
      if (!f.assigned_to) continue
      withOwner.add(p.id)
      perUser.set(f.assigned_to, (perUser.get(f.assigned_to) ?? new Set()).add(p.id))
    }
    const workload = [...perUser].map(([userId, set]) => ({ userId, count: set.size })).sort((a, b) => b.count - a.count)

    // ── Tickets por estudio (periodo + estudio; nunca área) ────────────────────
    let ticketsByStudio: TicketsByStudio | null = null, ticketsError: string | null = null
    try {
      ticketsByStudio = await countTicketsByStudio(supabase as unknown as TicketsClient,
        { since: since ? new Date(since).toISOString() : null, studioId })
    } catch (err) { ticketsError = err instanceof Error ? err.message : 'No se pudieron contar los tickets por estudio.' }

    setStats({
      requests: requestsStats, work, priorityActive, workload,
      unassignedActive: active.filter(p => !withOwner.has(p.id)).length,
      ticketsByStudio, ticketsError,
    })
    setLoading(false)
  }, [periodDays, studioId, areaId, procontStudioId, procontCodeId, today])

  useEffect(() => { void load() }, [load])

  // Al volver a la pestaña y ante cambios en proyectos, solicitudes o eventos: recargar.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', onVisible)
    const channel = supabase.channel(`dashboard-${String(periodDays)}-${String(studioId)}-${String(areaId)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => { void load() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requests' }, () => { void load() })
      .subscribe()
    return () => { document.removeEventListener('visibilitychange', onVisible); void supabase.removeChannel(channel) }
  }, [load, periodDays, studioId, areaId])

  return { stats, loading, error, reload: load }
}
