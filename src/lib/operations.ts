import type { Project, Request, User } from '../types/database.types.ts'
import type { RpcAttempt } from './rpc-attempt.ts'
import { requireData, requireSuccess } from './supabase-errors.ts'
import { isGeneralStatus, type GeneralStatus } from './request-status.ts'

export interface RpcClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: any; error: unknown }>
}
export interface SubmissionReceipt { id: string; request_number: string; tracking_token: string }
/** Clasificación del ticket por catálogos (estudio, proyecto/subproyecto, área/subárea). */
export interface RequestClassification {
  studio_id: string; system_id: string; subsystem_id?: string | null; area_id?: string | null; subarea_id?: string | null
}
/** Seguimiento público (migración 20261118000600): solo número REQ y estado general. */
export interface PublicTracking {
  request_number: string
  status: GeneralStatus
}
/** Datos que envía el cliente (formulario público definitivo). */
export interface ClientRequestInput {
  requester_name: string; studio_id: string; system_id: string; request_type_id: string
  title: string; description: string; urgent_requested: boolean
}
/** Clasificación interna fijada por el validador. */
export interface InternalClassification {
  studio_code_id: string; subsystem_id?: string | null; area_id?: string | null; subarea_id?: string | null
}
/** Proyectos nuevos (M12): solo Development, con responsable principal obligatorio y sin SLA. */
export type InternalProjectInput = Pick<Project, 'title' | 'description' | 'priority'> & {
  assigned_dev: string; start_date?: string; due_date?: string; area?: string; requester_name?: string
}
export interface ApprovalInput {
  priority: Project['priority']; assigned_dev: string; title?: string; start_date?: string; due_date?: string
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
    async submitRequest(data: Partial<Request>, attempt: RpcAttempt, classification?: RequestClassification) {
      const payload = {
        requester_name: data.requester_name?.trim(), requester_email: nullable(data.requester_email),
        requester_area: data.requester_area?.trim(), request_type: data.request_type,
        origin: data.origin, data_system_involved: data.data_system_involved,
        description: data.description?.trim(), observations: data.observations,
        request_date: nullable(data.request_date), requested_date: nullable(data.requested_date), needs_code: data.needs_code,
      }
      const rpc = classification ? 'submit_classified_request' : 'submit_request'
      const args = classification
        ? { p_payload: { ...payload, requester_area: undefined }, p_classification: {
            studio_id: classification.studio_id, system_id: classification.system_id,
            subsystem_id: classification.subsystem_id || null, area_id: classification.area_id || null,
            subarea_id: classification.subarea_id || null } }
        : { p_payload: payload }
      return attempt.run(rpc, args, async args => {
        const receipt = await value<SubmissionReceipt>(rpc, args)
        if (!uuidPattern.test(receipt.id) || !uuidPattern.test(receipt.tracking_token) || !/^REQ\d{2}-\d{3,}$/.test(receipt.request_number)) {
          throw new Error('No se recibió una constancia válida. Reintenta sin cambiar los datos de la solicitud.')
        }
        return receipt
      })
    },
    async submitClientRequest(data: ClientRequestInput, attempt: RpcAttempt) {
      const payload = { requester_name: data.requester_name, studio_id: data.studio_id, system_id: data.system_id,
        request_type_id: data.request_type_id, title: data.title.trim(), description: data.description.trim(),
        urgent_requested: data.urgent_requested }
      return attempt.run('submit_client_request', { p_payload: payload }, async args => {
        const receipt = await value<SubmissionReceipt>('submit_client_request', args)
        if (!uuidPattern.test(receipt.id) || !uuidPattern.test(receipt.tracking_token) || !/^REQ\d{2}-\d{3,}$/.test(receipt.request_number)) {
          throw new Error('No se recibió una constancia válida. Reintenta sin cambiar los datos de la solicitud.')
        }
        return receipt
      })
    },
    classifyRequest: (id: string, c: InternalClassification) => command('classify_request', { p_request_id: id,
      p_classification: { studio_code_id: c.studio_code_id, subsystem_id: c.subsystem_id || null,
        area_id: c.area_id || null, subarea_id: c.subarea_id || null } }),
    async createInternalProject(data: InternalProjectInput, attempt: RpcAttempt) {
      if (!uuidPattern.test(data.assigned_dev ?? '')) throw new Error('Selecciona el responsable principal.')
      const payload = { title: data.title.trim(), description: data.description.trim(), project_type: 'development',
        priority: data.priority, start_date: nullable(data.start_date), due_date: nullable(data.due_date),
        sla_target_date: null, area: nullable(data.area), requester_name: nullable(data.requester_name),
        assigned_dev: data.assigned_dev }
      return attempt.run('create_internal_project', { p_payload: payload }, async args => {
        const project = await value<Project>('create_internal_project', args)
        if (!uuidPattern.test(project.id) || !project.request_id) throw new Error('No se confirmó el proyecto. Reintenta con los mismos datos.')
        return project
      })
    },
    async approveRequest(request: Request, data: ApprovalInput, attempt: RpcAttempt) {
      // Sin plazos ni fórmulas SLA heredados: el SLA de Procont está pendiente de configuración.
      // Flujo único Development con un responsable principal (M12); assigned_admin no crea otro flujo.
      if (!uuidPattern.test(data.assigned_dev ?? '')) throw new Error('Selecciona el responsable principal.')
      const payload = { project_type: 'development', priority: data.priority,
        title: data.title?.trim() || request.title || request.request_type,
        start_date: nullable(data.start_date), due_date: nullable(data.due_date),
        sla_target_date: null, sla_formal_days: null, assigned_dev: data.assigned_dev, assigned_admin: null }
      return attempt.run('approve_request', { p_request_id: request.id, p_payload: payload }, async args => {
        const project = await value<Project>('approve_request', args)
        if (!uuidPattern.test(project.id) || project.request_id !== request.id) throw new Error('No se confirmó la aprobación. Actualiza la bandeja.')
        return project
      })
    },
    /** Rechazo (migración 20261118000500): motivo público para el solicitante y notas internas opcionales. */
    rejectRequest: (id: string, publicReason: string, internalNotes?: string) => internalNotes?.trim()
      ? command('reject_request_with_notes', { p_request_id: id, p_public_reason: publicReason.trim(), p_internal_notes: internalNotes.trim() })
      : command('reject_request', { p_request_id: id, p_reason: publicReason.trim() }),
    assignStudioCode: (id: string, codeId: string) => command('assign_request_studio_code', { p_request_id: id, p_studio_code_id: codeId }),
    updateRequestDetails: (id: string, area: string, name: string) => command('update_request_details', {
      p_request_id: id, p_area: nullable(area), p_requester_name: name.trim(),
    }),
    adminUpdateUser: (id: string, role: User['role'], active: boolean) => command('admin_update_user', {
      p_user_id: id, p_role: role, p_is_active: active,
    }),
    /** Seguimiento público solo con el número REQ (sin token). Respuesta mínima y con límite de frecuencia. */
    async trackRequest(number: string): Promise<PublicTracking | null> {
      const normalized = number.trim().toUpperCase()
      if (!/^REQ\d{2}-\d{3,}$/.test(normalized)) throw new Error('Ingresa el número completo de solicitud, por ejemplo REQ26-001.')
      const result = await client.rpc('track_request_status', { p_request_number: normalized })
      requireSuccess(result)
      if (result.data === null) return null
      if (result.data?.rate_limited) throw new Error('Demasiadas consultas seguidas. Espera un minuto e inténtalo de nuevo.')
      const data = result.data as PublicTracking
      if (!isGeneralStatus(data.status)) throw new Error('El seguimiento no devolvió un estado válido. Intenta nuevamente.')
      return { request_number: data.request_number, status: data.status }
    },
    /** Inicio de revisión por el validador (idempotente): estado general «En revisión». */
    startRequestReview: (id: string) => command('start_request_review', { p_request_id: id }),
  }
}
