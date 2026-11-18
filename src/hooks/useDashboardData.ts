import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export interface DashboardStats {
  total: number
  byStatus: { active: number; completed: number; archived: number }
  byPriority: { urgent: number; high: number; medium: number; low: number }
  byArea: Record<string, number>
  byType: { development: number; administrative: number; dual: number }
  blocked: number
  overdue: number
  // Cycle Time y Lead Time se obtienen del servidor (metrics_time_averages); sin cálculos locales.
}

export function useDashboardData(periodDays: number | null = null, areaFilter: string | null = null, typeFilter: string | null = null, studioFilter: string | null = null) {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [periodDays, areaFilter, typeFilter, studioFilter])

  // Refresh when the browser tab becomes visible again
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [periodDays, areaFilter, typeFilter, studioFilter])

  // Realtime: refresh when projects or SLA logs change
  useEffect(() => {
    const channel = supabase
      .channel(`dashboard-realtime-${String(periodDays)}-${String(areaFilter)}-${String(typeFilter)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_logs' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [periodDays, areaFilter])

  async function load() {
    setLoading(true)

    const { data: rawProjects } = await supabase
      .from('projects')
      .select('status, priority, project_type, is_blocked, due_date, requests(*)')
      .neq('status', 'deleted')

    let projects = areaFilter
      ? (rawProjects ?? []).filter(p => (p as any).requests?.requester_area === areaFilter)
      : (rawProjects ?? [])
    if (studioFilter) projects = projects.filter(p => (p as any).requests?.studio_id === studioFilter)
    if (typeFilter) {
      if (typeFilter === 'development') {
        projects = projects.filter(p => p.project_type === 'development' || p.project_type === 'dual')
      } else if (typeFilter === 'administrative') {
        projects = projects.filter(p => p.project_type === 'administrative' || p.project_type === 'dual')
      }
    }

    // ── Projects stats ──────────────────────────────────────────────
    const byStatus   = { active: 0, completed: 0, archived: 0 }
    const byPriority = { urgent: 0, high: 0, medium: 0, low: 0 }
    const byArea: Record<string, number> = {}
    const byType     = { development: 0, administrative: 0, dual: 0 }
    let blocked = 0, overdue = 0
    const today = new Date().toISOString().slice(0, 10)

    for (const p of projects) {
      byStatus[p.status as keyof typeof byStatus]++
      byPriority[p.priority as keyof typeof byPriority]++
      byType[p.project_type as keyof typeof byType]++
      if (p.is_blocked) blocked++
      if (p.due_date && p.due_date < today && p.status === 'active') overdue++
      const area = (p as any).requests?.requester_area
      if (area) byArea[area] = (byArea[area] ?? 0) + 1
    }

    setStats({
      total: projects.length,
      byStatus, byPriority, byArea, byType, blocked, overdue,
    })
    setLoading(false)
  }

  return { stats, loading, reload: load }
}
