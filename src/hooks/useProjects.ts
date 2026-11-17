import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { Project, ProjectFlow } from '../types/database.types'
import { logActivity } from './useActivityLog'
import { sendNotification } from '../lib/notifications'
import { operations } from '../lib/api'
import { errorMessage, requireData } from '../lib/supabase-errors'
import type { InternalProjectInput } from '../lib/operations'
import type { RpcAttempt } from '../lib/rpc-attempt'

type StatusFilter = 'active' | 'completed' | 'archived'

const PHASE_PROGRESS: Record<string, number> = {
  // development
  backlog: 0, design: 20, dev: 40, testing: 60, deploy: 80, done: 100,
  // administrative
  ready_to_start: 20, discovery: 40, build: 60, uat_validation: 80, deployed: 100,
}

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, _setStatusFilter] = useState<StatusFilter>(() => {
    const s = localStorage.getItem('kanban_statusFilter') as StatusFilter
    return (['active', 'completed', 'archived'] as StatusFilter[]).includes(s) ? s : 'active'
  })
  const setStatusFilter = (v: StatusFilter) => {
    localStorage.setItem('kanban_statusFilter', v)
    _setStatusFilter(v)
  }
  const [limit, setLimit] = useState(100)
  const [hasMore, setHasMore] = useState(false)

  useEffect(() => {
    loadProjects(statusFilter)
  }, [statusFilter])

  // Keep refs so realtime callbacks always use current filter & limit
  const statusFilterRef = useRef(statusFilter)
  const limitRef        = useRef(limit)
  useEffect(() => { statusFilterRef.current = statusFilter }, [statusFilter])
  useEffect(() => { limitRef.current = limit },               [limit])

  // Realtime: refresh when any project or flow changes externally
  useEffect(() => {
    const channel = supabase
      .channel('projects-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => {
        loadProjects(statusFilterRef.current, limitRef.current)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_flows' }, () => {
        loadProjects(statusFilterRef.current, limitRef.current)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const loadProjects = async (status: StatusFilter = statusFilter, currentLimit = limit) => {
    try {
      setLoading(true)
      setError(null)
      const { data, error } = await supabase
        .from('projects')
        .select(`
          *,
          project_flows (*, checklist_items(id, completed)),
          requests (requester_area, requester_name, request_type, request_number)
        `)
        .eq('status', status)
        .order('created_at', { ascending: false })
        .limit(currentLimit + 1)

      if (error) throw error
      const rows = data || []
      setHasMore(rows.length > currentLimit)
      setProjects(rows.slice(0, currentLimit))
    } catch (err: any) {
      setProjects([])
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const updateProject = async (projectId: string, updates: Partial<Project>) => {
    let saved = false
    try {
      // Leer estado actual para detectar cambios
      const current = projects.find(p => p.id === projectId)

      const { project_type, ...fields } = updates
      if (Object.keys(fields).length > 0) {
        requireData(await supabase.from('projects')
          .update({ ...fields, updated_at: new Date().toISOString() })
          .eq('id', projectId).select('id').single(), 'Proyecto')
        saved = true
      }
      if (project_type && current?.project_type !== project_type) {
        await operations.changeProjectType(projectId, project_type)
        saved = true
      }

      // Registrar actividad según qué cambió
      if (updates.status && current?.status !== updates.status) {
        await logActivity(projectId, 'status_changed', { from: current?.status, to: updates.status })

        // SLA + Lead Time al completar
        if (updates.status === 'completed') {
          const { data: slaLog } = await supabase
            .from('activity_logs')
            .select('created_at, details')
            .eq('project_id', projectId)
            .eq('action', 'sla_started')
            .order('created_at', { ascending: true })
            .limit(1)
            .single()

          if (slaLog) {
            const now = Date.now()
            const approvalDate = new Date(slaLog.created_at).getTime()

            // Restar tiempo que estuvo bloqueado (no cuenta contra el SLA)
            const { data: blockEvents } = await supabase
              .from('activity_logs')
              .select('action, created_at')
              .eq('project_id', projectId)
              .in('action', ['blocked', 'unblocked'])
              .order('created_at', { ascending: true })

            let blockedMs = 0
            let blockStart: number | null = null
            for (const ev of blockEvents ?? []) {
              if (ev.action === 'blocked') {
                blockStart = new Date(ev.created_at).getTime()
              } else if (ev.action === 'unblocked' && blockStart !== null) {
                blockedMs += new Date(ev.created_at).getTime() - blockStart
                blockStart = null
              }
            }
            const blockedDays = Math.floor(blockedMs / 86400000)
            const daysElapsed = Math.max(0, Math.ceil((now - approvalDate) / (1000 * 60 * 60 * 24)) - blockedDays)
            const dueDate = (slaLog.details as any)?.sla_target_date
            const onTime = dueDate ? new Date() <= new Date(dueDate + 'T23:59:59') : undefined

            // Lead time: desde creación del request hasta hoy
            let leadTimeDays: number | undefined
            let approvalWaitDays: number | undefined
            if (current?.request_id) {
              const { data: req } = await supabase
                .from('requests')
                .select('created_at')
                .eq('id', current.request_id)
                .single()
              if (req) {
                const requestCreated = new Date(req.created_at).getTime()
                leadTimeDays = Math.ceil((now - requestCreated) / (1000 * 60 * 60 * 24))
                approvalWaitDays = Math.ceil((approvalDate - requestCreated) / (1000 * 60 * 60 * 24))
              }
            }

            await logActivity(projectId, 'sla_completed', {
              cycle_time_days: daysElapsed,
              due_date: dueDate,
              on_time: onTime,
              ...(blockedDays > 0 && { blocked_days: blockedDays }),
              ...(leadTimeDays !== undefined && { lead_time_days: leadTimeDays }),
              ...(approvalWaitDays !== undefined && { approval_wait_days: approvalWaitDays }),
            })
          }
        }
      } else if (updates.is_blocked === true) {
        await logActivity(projectId, 'blocked', { reason: updates.blocked_reason })
        // Notify all assigned users
        const flows: any[] = (current as any)?.project_flows ?? []
        const assignedIds = [...new Set(flows.map(f => f.assigned_to).filter(Boolean) as string[])]
        for (const userId of assignedIds) {
          await sendNotification({
            userId,
            type:      'project_blocked',
            title:     'Proyecto bloqueado',
            message:   current?.title,
            projectId,
          })
        }
      } else if (updates.is_blocked === false) {
        await logActivity(projectId, 'unblocked', {})
      } else if (updates.priority && current?.priority !== updates.priority) {
        await logActivity(projectId, 'priority_changed', { from: current?.priority, to: updates.priority })
      } else if (updates.title || updates.description) {
        const changed = Object.keys(updates).filter(k => k !== 'updated_at')
        await logActivity(projectId, 'edited', { fields: changed })
      }

      // Due date change — runs independently (can co-occur with other edits)
      if ('due_date' in updates && (updates.due_date ?? null) !== (current?.due_date ?? null)) {
        await logActivity(projectId, 'due_date_changed', {
          from: current?.due_date ?? null,
          to: updates.due_date ?? null,
        })
      }

      await loadProjects()
    } catch (err: any) {
      await loadProjects()
      if (saved) throw new Error(`El proyecto se guardó total o parcialmente, pero falta completar la operación: ${errorMessage(err)}`)
      throw err
    }
  }

  const updateFlowDetails = async (flowId: string, updates: { progress?: number; assigned_to?: string }) => {
    try {
      // Find current flow for assignment logging
      let projectId: string | undefined
      let currentFlow: ProjectFlow | undefined
      for (const p of projects) {
        const flow = (p as any).project_flows?.find((f: ProjectFlow) => f.id === flowId)
        if (flow) { projectId = p.id; currentFlow = flow; break }
      }

      const { data: updatedFlow, error } = await supabase
        .from('project_flows')
        .update({ ...updates, ...('assigned_to' in updates ? { assigned_to: updates.assigned_to || null } : {}) })
        .eq('id', flowId).select('id').single()

      requireData({ data: updatedFlow, error }, 'Flujo')

      // Log assignment change
      if (projectId && currentFlow && 'assigned_to' in updates) {
        const from = currentFlow.assigned_to ?? null
        const to = updates.assigned_to ?? null
        if (from !== to) {
          await logActivity(projectId, from ? 'reassigned' : 'assigned', {
            from,
            to,
            flow_type: currentFlow.flow_type,
          })
          // Notify newly assigned user
          if (to) {
            const project = projects.find(p => p.id === projectId)
            await sendNotification({
              userId:    to,
              type:      'project_assigned',
              title:     'Proyecto asignado a vos',
              message:   project?.title,
              projectId,
            })
          }
        }
      }

      await loadProjects()
    } catch (err: any) {
      await loadProjects()
      throw err
    }
  }

  const updateProjectFlow = async (flowId: string, newPhase: string) => {
    try {
      const newProgress = PHASE_PROGRESS[newPhase] ?? 0

      // Encontrar la fase actual para registrar el cambio
      let projectId: string | undefined
      let fromPhase: string | undefined
      for (const p of projects) {
        const flow = (p as any).project_flows?.find((f: ProjectFlow) => f.id === flowId)
        if (flow) { projectId = p.id; fromPhase = flow.current_phase; break }
      }

      const { data: updatedFlow, error } = await supabase
        .from('project_flows')
        .update({ current_phase: newPhase, progress: newProgress })
        .eq('id', flowId).select('id').single()

      requireData({ data: updatedFlow, error }, 'Flujo')

      if (projectId) {
        // Calcular tiempo en la fase anterior
        const { data: lastLog } = await supabase
          .from('activity_logs')
          .select('created_at')
          .eq('project_id', projectId)
          .in('action', ['phase_changed', 'sla_started', 'created'])
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        const duration_ms = lastLog
          ? Date.now() - new Date(lastLog.created_at).getTime()
          : undefined

        await logActivity(projectId, 'phase_changed', { from: fromPhase, to: newPhase, duration_ms })
      }

      await loadProjects()
    } catch (err: any) {
      await loadProjects()
      throw err
    }
  }

  const createProject = async (data: InternalProjectInput, attempt: RpcAttempt) => {
    await operations.createInternalProject(data, attempt)
    await loadProjects()
  }

  const deleteProject = async (projectId: string) => {
    try {
      requireData(await supabase.from('projects')
        .update({ status: 'deleted', updated_at: new Date().toISOString() })
        .eq('id', projectId).select('id').single(), 'Proyecto')
      await logActivity(projectId, 'project_deleted', {})
      await loadProjects()
    } catch (err: any) {
      await loadProjects()
      throw err
    }
  }

  const loadMore = () => {
    const newLimit = limit + 100
    setLimit(newLimit)
    loadProjects(statusFilter, newLimit)
  }

  const bulkUpdateProjects = async (ids: string[], updates: Partial<Project>) => {
    try {
      const rows = requireData(await supabase.from('projects')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .in('id', ids).select('id'), 'Proyectos')
      if (rows.length !== ids.length) throw new Error('Solo se actualizaron algunos proyectos. Actualiza la vista y comprueba los permisos.')
      await loadProjects()
    } catch (err: any) {
      await loadProjects()
      throw err
    }
  }

  return {
    projects,
    loading,
    error,
    hasMore,
    loadMore,
    statusFilter,
    setStatusFilter,
    reload: () => loadProjects(statusFilter),
    updateProject,
    updateProjectFlow,
    updateFlowDetails,
    createProject,
    deleteProject,
    bulkUpdateProjects,
  }
}
