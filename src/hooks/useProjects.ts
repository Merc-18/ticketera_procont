import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { Project } from '../types/database.types'
import { operations, board } from '../lib/api'
import { actionKey, type Phase, type Priority } from '../lib/board'
import { errorMessage, requireData } from '../lib/supabase-errors'
import type { InternalProjectInput, InternalTicketInput } from '../lib/operations'
import type { RpcAttempt } from '../lib/rpc-attempt'

type StatusFilter = 'active' | 'completed' | 'archived'

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
          project_flows (*, checklist_items(id, completed, created_at)),
          requests (*)
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

  /**
   * Edición de datos descriptivos (título y descripción). Fase, responsable, prioridad,
   * estado y bloqueo NO se escriben aquí: usan las RPC del tablero (lib/board.ts), que auditan
   * en el servidor. El navegador no inserta activity_logs ni notificaciones de estas operaciones.
   */
  const updateProject = async (projectId: string, updates: Pick<Partial<Project>, 'title' | 'description'>) => {
    try {
      const { title, description } = updates
      requireData(await supabase.from('projects')
        .update({ title, description, updated_at: new Date().toISOString() })
        .eq('id', projectId).select('id').single(), 'Proyecto')
    } finally {
      await loadProjects()
    }
  }

  /** Cambio de fase (arrastre o selector). El cierre con pendientes exige confirmación explícita. */
  const moveFlow = async (projectId: string, flowId: string, phase: Phase, options: { confirmPending?: boolean; pendingFingerprint?: string } = {}, key: string = actionKey()) => {
    try { return await board.movePhase(projectId, phase, key, { flowId, ...options }) }
    finally { await loadProjects() }
  }

  /** Reasignación del responsable principal (null = retiro explícito). */
  const assignFlow = async (projectId: string, flowId: string, assigneeId: string | null) => {
    try { return await board.assign(projectId, assigneeId, actionKey(), flowId) }
    finally { await loadProjects() }
  }

  /** Alta interna con paridad (M19): devuelve el ticket y su número para subir evidencias y confirmar. */
  const createTicket = async (data: InternalTicketInput, attempt: RpcAttempt) => {
    try { return await operations.createInternalTicket(data, attempt) }
    finally { await loadProjects() }
  }

  const createProject = async (data: InternalProjectInput, attempt: RpcAttempt) => {
    await operations.createInternalProject(data, attempt)
    await loadProjects()
  }

  const loadMore = () => {
    const newLimit = limit + 100
    setLimit(newLimit)
    loadProjects(statusFilter, newLimit)
  }

  /** Acciones masivas (prioridad/archivado): una transacción, sin cambios parciales, 1–100 tickets. */
  const bulkUpdate = async (ids: string[], action: 'set_priority' | 'archive', payload: { priority: Priority } | Record<string, never>) => {
    try { return await board.bulk(ids, action, payload, actionKey()) }
    finally { await loadProjects() }
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
    moveFlow,
    assignFlow,
    createProject,
    createTicket,
    bulkUpdate,
  }
}
