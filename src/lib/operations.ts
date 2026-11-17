import type { Project, Request, User } from '../types/database.types.ts'
import type { RpcAttempt } from './rpc-attempt.ts'
import { requireData, requireSuccess } from './supabase-errors.ts'
import { calcSlaFormalDays, calcTargetDate } from './sla-config.ts'

export interface RpcClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: any; error: unknown }>
}
export interface SubmissionReceipt { id: string; request_number: string; tracking_token: string }
export interface PublicTracking {
  request_number: string
  status: Request['status']
  created_at: string
  rejection_reason: string | null
  project_status: Project['status'] | null
  sla_target_date: string | null
  flows: { flow_type: string; current_phase: string; progress: number }[]
}
export type InternalProjectInput = Pick<Project, 'title' | 'description' | 'project_type' | 'priority'> & {
  start_date?: string; due_date?: string; area?: string; requester_name?: string
}
export interface ApprovalInput {
  project_type: Project['project_type']; priority: Project['priority']; title?: string
  start_date?: string; due_date?: string; assigned_dev?: string; assigned_admin?: string
}
const nullable = (value: string | undefined | null) => value?.trim() || null
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function createOperations(client: RpcClient) {
  async function value<T>(name: string, args: Record<string, unknown>): Promise<T> {
    return requireData(await client.rpc(name, args), 'La operación') as T
  }
  async function command(name: string, args: Record<string, unknown>) {
    requireSuccess(await client.rpc(name, args))
  }
  return {
    async submitRequest(data: Partial<Request>, attempt: RpcAttempt) {
      const payload = {
        requester_name: data.requester_name?.trim(), requester_email: nullable(data.requester_email),
        requester_area: data.requester_area?.trim(), request_type: data.request_type,
        origin: data.origin, data_system_involved: data.data_system_involved,
        description: data.description?.trim(), observations: data.observations,
        request_date: nullable(data.request_date), requested_date: nullable(data.requested_date), needs_code: data.needs_code,
      }
      return attempt.run('submit_request', { p_payload: payload }, async args => {
        const receipt = await value<SubmissionReceipt>('submit_request', args)
        if (!uuidPattern.test(receipt.id) || !uuidPattern.test(receipt.tracking_token) || !/^REQ\d{2}-\d{3,}$/.test(receipt.request_number)) {
          throw new Error('No se recibió una constancia válida. Reintenta sin cambiar los datos de la solicitud.')
        }
        return receipt
      })
    },
    async createInternalProject(data: InternalProjectInput, attempt: RpcAttempt) {
      const payload = { title: data.title.trim(), description: data.description.trim(), project_type: data.project_type,
        priority: data.priority, start_date: nullable(data.start_date), due_date: nullable(data.due_date),
        sla_target_date: nullable(data.due_date), area: nullable(data.area), requester_name: nullable(data.requester_name) }
      return attempt.run('create_internal_project', { p_payload: payload }, async args => {
        const project = await value<Project>('create_internal_project', args)
        if (!uuidPattern.test(project.id) || !project.request_id) throw new Error('No se confirmó el proyecto. Reintenta con los mismos datos.')
        return project
      })
    },
    async approveRequest(request: Request, data: ApprovalInput, attempt: RpcAttempt) {
      const days = calcSlaFormalDays(request.request_type, request.needs_code)
      const payload = { project_type: data.project_type, priority: data.priority,
        title: data.title?.trim() || `${request.request_type} - ${request.requester_area ?? ''}`,
        start_date: nullable(data.start_date), due_date: nullable(data.due_date),
        sla_target_date: calcTargetDate(days, data.priority, attempt.startedAt), sla_formal_days: days,
        assigned_dev: nullable(data.assigned_dev), assigned_admin: nullable(data.assigned_admin) }
      return attempt.run('approve_request', { p_request_id: request.id, p_payload: payload }, async args => {
        const project = await value<Project>('approve_request', args)
        if (!uuidPattern.test(project.id) || project.request_id !== request.id) throw new Error('No se confirmó la aprobación. Actualiza la bandeja.')
        return project
      })
    },
    rejectRequest: (id: string, reason: string) => command('reject_request', { p_request_id: id, p_reason: reason.trim() }),
    changeProjectType: (id: string, type: Project['project_type']) => value<Project | Project[]>('change_project_type', { p_project_id: id, p_project_type: type }),
    updateRequestDetails: (id: string, area: string, name: string) => command('update_request_details', {
      p_request_id: id, p_area: nullable(area), p_requester_name: name.trim(),
    }),
    adminUpdateUser: (id: string, role: User['role'], active: boolean) => command('admin_update_user', {
      p_user_id: id, p_role: role, p_is_active: active,
    }),
    purgeProject: (id: string) => command('purge_project', { p_project_id: id }),
    async trackRequest(number: string, token: string): Promise<PublicTracking | null> {
      const normalized = number.trim().toUpperCase()
      if (!/^(REQ|INT)\d{2}-\d{3,}$/.test(normalized) || !uuidPattern.test(token.trim())) {
        throw new Error('Ingresa el número completo de solicitud y un token de seguimiento válido.')
      }
      const result = await client.rpc('track_request', { p_request_number: normalized, p_tracking_token: token.trim() })
      requireSuccess(result)
      if (result.data === null) return null
      const data = result.data as PublicTracking
      if (!['pending', 'approved', 'rejected'].includes(data.status) || !Array.isArray(data.flows) || !data.created_at) {
        throw new Error('El seguimiento no devolvió un estado válido. Intenta nuevamente.')
      }
      return data
    },
  }
}
