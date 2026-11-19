// Portal de clientes (Quipu / QuipuFac) sobre el contrato REAL de Codex (M13):
// contracts/client-access-client.mjs → Edge Function `client-login` y RPC `client_*`.
//
// Este módulo no reimplementa backend: envuelve `createClientAccess` y solo
// 1) valida en el navegador lo mínimo (formularios, coherencia de la sesión),
// 2) traduce los códigos del contrato a mensajes comprensibles, sin detalles internos,
// 3) distingue los códigos explícitos de sesión, producto y ticket sin consultas adicionales.
//
// Seguridad: la contraseña solo viaja en el cuerpo de `client-login`; el token de sesión
// (64 hex, capacidad de 256 bits) va en el cuerpo de las RPC, nunca en la URL; las respuestas
// se reducen a una lista blanca de campos antes de llegar a la vista.

import { createClientAccess } from '../../contracts/client-access-client.mjs'
import type {
  ClientAccessApi, ClientAccessTransport, ClientSession as BackendSession,
} from '../../contracts/client-access-client.d.mts'
import type { RpcAttempt } from './rpc-attempt.ts'
import type { SubmissionReceipt } from './operations.ts'
import { isGeneralStatus, type GeneralStatus } from './request-status.ts'

/** Tipo de autenticación (y, en el acceso desde plataforma, producto de origen). */
export type AuthType = 'quipu' | 'quipufac'
export const AUTH_TYPE_LABEL: Record<AuthType, string> = { quipu: 'Quipu', quipufac: 'QuipuFac' }
export const isAuthType = (v: unknown): v is AuthType => v === 'quipu' || v === 'quipufac'

/** Producto permitido por el servidor para la sesión (client_products). */
export interface ClientProduct { id: string; name: string }

export type ClientIdentity =
  | { kind: 'individual'; username: string; display_name: string | null }
  | { kind: 'company_account' }

export interface ClientSession {
  ruc: string
  studio_id: string | null
  /** 'required': la empresa aún no tiene estudio asociado; no puede crear tickets. */
  studio_mapping: 'resolved' | 'required'
  auth_type: AuthType
  /** null = acceso directo desde la web; proveedor = abierto desde esa plataforma (producto fijo). */
  origin: AuthType | null
  identity: ClientIdentity
  products: ClientProduct[]
  expires_at: string
}

export interface ClientTicketSummary {
  id: string
  request_number: string
  system_id: string
  title: string
  created_at: string
  status: GeneralStatus
  /** Nombre declarado en el formulario (no es una identidad verificada). */
  requester_name: string
}
export interface ClientTicketDetail extends ClientTicketSummary {
  description: string
  urgent_requested: boolean
  /** Motivo público de rechazo (solo si el estado es rechazado). */
  rejection_reason: string | null
}

export type QuipuLogin = { auth_type: 'quipu'; ruc: string; username: string; password: string }
export type QuipuFacLogin = { auth_type: 'quipufac'; ruc: string; password: string }
export type ClientLoginInput = QuipuLogin | QuipuFacLogin

export interface ClientTicketInput {
  requester_name: string; system_id: string; request_type_id: string
  title: string; description: string; urgent_requested: boolean
}
export interface AttachmentGrant { bucket: string; path: string; size_bytes: number; mime_type: string; expires_at: string }
export interface ClientDeliveryItem { file: File; uploadKey: string }
export interface ClientDeliveryResult { uploaded: string[]; failed: string[]; error: string | null }

export type ClientPortalErrorCode =
  | 'pending_contract' | 'invalid_input' | 'invalid_credentials' | 'session_expired'
  | 'invalid_launch' | 'studio_mapping_required' | 'product_unavailable' | 'unavailable' | 'invalid_response'
  | 'rate_limited'

const MESSAGES: Record<ClientPortalErrorCode, string> = {
  pending_contract: 'El ingreso todavía no está habilitado. Intenta más tarde o comunícate con Procont.',
  invalid_input: 'Revisa los datos ingresados.',
  invalid_credentials: 'No pudimos validar los datos. Revisa e inténtalo nuevamente.',
  session_expired: 'Tu sesión terminó. Ingresa nuevamente.',
  invalid_launch: 'El enlace de acceso no es válido o ya fue utilizado. Vuelve a abrir Ticketera desde tu sistema.',
  studio_mapping_required: 'Tu empresa aún no está habilitada para registrar tickets en Ticketera. El equipo de Procont debe completar su asociación; comunícate con nosotros.',
  product_unavailable: 'Ese producto no está disponible para este acceso.',
  unavailable: 'El servicio no está disponible en este momento. Intenta más tarde.',
  invalid_response: 'El servidor devolvió una respuesta no válida. Intenta nuevamente.',
  rate_limited: 'Demasiados intentos de ingreso. Espera 15 minutos e inténtalo de nuevo.',
}

export class ClientPortalError extends Error {
  readonly code: ClientPortalErrorCode
  constructor(code: ClientPortalErrorCode, message = MESSAGES[code]) {
    super(message)
    this.name = 'ClientPortalError'
    this.code = code
  }
}
export const isClientPortalError = (e: unknown, code?: ClientPortalErrorCode): e is ClientPortalError =>
  e instanceof ClientPortalError && (code === undefined || e.code === code)

// ─── Validaciones ────────────────────────────────────────────────────────────
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const REQ = /^REQ\d{2}-\d{3,}$/
const TOKEN = /^[0-9a-f]{64}$/            // client_token_hash (M13) exige 64 hex
const ENTRY_CODE = /^[0-9a-f]{64}$/       // código de entrada de un solo uso (client-login)

export const RUC_PATTERN = /^\d{11}$/
export function validateLogin(input: ClientLoginInput): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!RUC_PATTERN.test(input.ruc.trim())) errors.ruc = 'El RUC debe tener 11 dígitos.'
  if (input.auth_type === 'quipu') {
    const user = input.username.trim()
    if (!user) errors.username = 'Ingresa tu usuario.'
    else if (user.length > 256) errors.username = 'El usuario es demasiado largo.'
  }
  if (!input.password) errors.password = 'Ingresa tu contraseña.'
  else if (input.password.length > 1024) errors.password = 'La contraseña es demasiado larga.'
  return errors
}

const text = (v: unknown, max = 20000): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max
const validDate = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v))
function fail(): never { throw new ClientPortalError('invalid_response') }

/**
 * Une `client_session_info` y `client_products` y comprueba su coherencia:
 * Quipu = usuario individual, QuipuFac = cuenta empresarial; acceso desde plataforma = como
 * máximo un producto (el de esa plataforma). Las reglas completas las aplica PostgreSQL.
 */
export function parseSession(raw: BackendSession | any, rawProducts: unknown): ClientSession {
  if (!raw || typeof raw !== 'object' || !validDate(raw.expires_at)) fail()
  const id = raw.identity, company = raw.company
  if (!id || !isAuthType(id.provider) || !company || !RUC_PATTERN.test(company.ruc ?? '')) fail()
  if (raw.entry_context !== 'direct' && raw.entry_context !== 'platform') fail()
  if (company.studio_mapping !== 'resolved' && company.studio_mapping !== 'required') fail()
  if (company.studio_mapping === 'resolved' && !UUID.test(company.studio_id ?? '')) fail()

  let identity: ClientIdentity
  if (id.provider === 'quipu') {
    if (id.kind !== 'user' || !text(id.username, 256)) fail()
    identity = { kind: 'individual', username: id.username,
      display_name: id.name_verified === true && text(id.verified_name, 300) ? id.verified_name : null }
  } else {
    if (id.kind !== 'company') fail()
    identity = { kind: 'company_account' }
  }

  if (!Array.isArray(rawProducts)) fail()
  const products: ClientProduct[] = (rawProducts as any[]).map(p => {
    if (!p || !UUID.test(p.id ?? '') || !text(p.name, 200)) fail()
    return { id: p.id, name: p.name }
  })
  if (new Set(products.map(p => p.id)).size !== products.length) fail()
  const origin: AuthType | null = raw.entry_context === 'platform' ? id.provider : null
  if (origin !== null && products.length > 1) fail()

  return { ruc: company.ruc, studio_id: company.studio_mapping === 'resolved' ? company.studio_id : null,
    studio_mapping: company.studio_mapping, auth_type: id.provider, origin, identity, products, expires_at: raw.expires_at }
}

function parseSummary(raw: any): ClientTicketSummary {
  if (!raw || !UUID.test(raw.id ?? '') || !REQ.test(raw.request_number ?? '') || !UUID.test(raw.system_id ?? '')
      || !text(raw.title, 300) || !validDate(raw.created_at) || !isGeneralStatus(raw.general_status)
      || !text(raw.requester_name, 200)) fail()
  return { id: raw.id, request_number: raw.request_number, system_id: raw.system_id, title: raw.title,
    created_at: raw.created_at, status: raw.general_status, requester_name: raw.requester_name }
}
function parseDetail(raw: any): ClientTicketDetail {
  const base = parseSummary(raw)
  if (!text(raw.description) || typeof raw.urgent_requested !== 'boolean') fail()
  return { ...base, description: raw.description, urgent_requested: raw.urgent_requested,
    rejection_reason: base.status === 'rejected' && text(raw.rejection_reason, 5000) ? raw.rejection_reason : null }
}

/** Producto del ticket: fijo si se abrió desde una plataforma; seleccionable en el acceso directo. */
export function productSelection(session: ClientSession) {
  return { fixed: session.origin !== null, products: session.products }
}

/** Texto de identidad para la cabecera. */
export function identityLabel(session: ClientSession) {
  return session.identity.kind === 'individual'
    ? `${session.identity.display_name ?? session.identity.username} · usuario Quipu`
    : 'Cuenta empresarial QuipuFac'
}

// ─── Códigos del contrato de Codex → errores de la interfaz ──────────────────
const code = (e: unknown) => (e as { code?: unknown })?.code
const LOGIN_ERRORS: Record<string, ClientPortalErrorCode> = {
  provider_contract_pending: 'pending_contract',
  invalid_credentials: 'invalid_credentials',
  invalid_credentials_input: 'invalid_credentials',
  provider_identity_mismatch: 'invalid_credentials',
  rate_limited: 'rate_limited',
}
function loginError(e: unknown) {
  const c = code(e)
  if (c === 'invalid_ruc') return new ClientPortalError('invalid_input', 'El RUC debe tener 11 dígitos.')
  return new ClientPortalError(typeof c === 'string' && LOGIN_ERRORS[c] ? LOGIN_ERRORS[c] : 'unavailable')
}

export interface ClientPortalOptions {
  /** Activación explícita después de validar los contratos reales. */
  enabled?: boolean
  /** Subida de un archivo a la ruta reservada (uploadReservedTicketAttachment con el cliente Supabase). */
  upload: (grant: AttachmentGrant, file: File) => Promise<unknown>
  /** Metadatos del archivo para la reserva (attachmentMetadata del adaptador de adjuntos). */
  metadata: (file: File, uploadKey: string) => { upload_key: string; file_name: string; size_bytes: number; mime_type: string }
}

export function createClientPortal(transport: ClientAccessTransport, options: ClientPortalOptions) {
  const api: ClientAccessApi = createClientAccess(transport)

  const requireToken = (token: string) => { if (!TOKEN.test(token)) throw new ClientPortalError('session_expired') }

  /** Error RPC genérico: sesión → session_expired; validación → invalid_input; resto → unavailable. */
  function rpcError(e: unknown) {
    const c = code(e)
    if (c === 'client_authentication_required') return new ClientPortalError('session_expired')
    if (c === 'client_product_unavailable') return new ClientPortalError('product_unavailable')
    if (c === 'studio_mapping_required') return new ClientPortalError('studio_mapping_required')
    if (c === 'invalid_request' || c === 'client_request_rejected') return new ClientPortalError('invalid_input')
    return new ClientPortalError('unavailable')
  }
  async function loadSession(token: string) {
    try {
      const [session, products] = await Promise.all([api.session(token), api.products(token)])
      return parseSession(session, products)
    } catch (e) {
      if (e instanceof ClientPortalError) throw e
      throw rpcError(e)
    }
  }

  return {
    /** Acceso directo: Quipu (RUC + usuario + contraseña) o QuipuFac (RUC + contraseña). */
    async login(input: ClientLoginInput) {
      if (options.enabled === false) throw new ClientPortalError('pending_contract')
      const errors = validateLogin(input)
      if (Object.keys(errors).length) throw new ClientPortalError('invalid_input', Object.values(errors)[0])
      let receipt
      try {
        receipt = await api.login(input.auth_type === 'quipu'
          ? { provider: 'quipu', ruc: input.ruc.trim(), username: input.username.trim(), password: input.password }
          : { provider: 'quipufac', ruc: input.ruc.trim(), password: input.password })
      } catch (e) { throw loginError(e) }
      if (!TOKEN.test(receipt?.session_token ?? '')) fail()
      const session = await loadSession(receipt.session_token)
      if (session.auth_type !== input.auth_type || session.origin !== null || session.ruc !== input.ruc.trim()) fail()
      return { token: receipt.session_token, session }
    },

    /** Acceso desde plataforma: canjea el código de un solo uso. La sesión queda con producto fijo. */
    async exchangeLaunch(provider: string, entryCode: string) {
      if (options.enabled === false) throw new ClientPortalError('pending_contract')
      if (!isAuthType(provider) || !ENTRY_CODE.test(entryCode)) throw new ClientPortalError('invalid_launch')
      let receipt
      try { receipt = await api.exchange(provider, entryCode) }
      catch (e) {
        const c = code(e)
        if (c === 'invalid_entry_code' || c === 'client_authentication_required' || c === 'invalid_request' || c === 'invalid_provider')
          throw new ClientPortalError('invalid_launch')
        throw new ClientPortalError('unavailable')
      }
      if (!TOKEN.test(receipt?.session_token ?? '')) fail()
      const session = await loadSession(receipt.session_token)
      if (session.origin !== provider) fail()
      return { token: receipt.session_token, session }
    },

    async currentSession(token: string) {
      requireToken(token)
      return loadSession(token)
    },

    /** Crea el ticket (client_submit_request reutiliza submit_client_request). Estudio y empresa los fija el servidor. */
    async submitTicket(token: string, session: ClientSession, input: ClientTicketInput, attempt: RpcAttempt): Promise<SubmissionReceipt> {
      requireToken(token)
      if (session.studio_mapping === 'required') throw new ClientPortalError('studio_mapping_required')
      if (!session.products.some(p => p.id === input.system_id)) throw new ClientPortalError('product_unavailable')
      if (!input.requester_name.trim()) throw new ClientPortalError('invalid_input', 'Ingresa el nombre del solicitante.')
      if (!input.title.trim() || !input.description.trim()) throw new ClientPortalError('invalid_input', 'Completa el título y la descripción.')
      if (!UUID.test(input.request_type_id)) throw new ClientPortalError('invalid_input', 'Selecciona el tipo de solicitud.')
      const payload = { requester_name: input.requester_name.trim(), system_id: input.system_id,
        request_type_id: input.request_type_id, title: input.title.trim(), description: input.description.trim(),
        urgent_requested: input.urgent_requested }
      return attempt.run('client_submit_request', { p_session_token: token, p_payload: payload }, async args => {
        let receipt
        try { receipt = await api.submit(token, payload, String(args.p_idempotency_key)) }
        catch (e) { throw rpcError(e) }
        if (!receipt || !UUID.test(receipt.id ?? '') || !UUID.test(receipt.tracking_token ?? '') || !REQ.test(receipt.request_number ?? '')) {
          throw new Error('No se recibió una constancia válida. Reintenta sin cambiar los datos de la solicitud.')
        }
        return { id: receipt.id, request_number: receipt.request_number, tracking_token: receipt.tracking_token }
      })
    },

    /**
     * Adjuntos del ticket propio: reserva atómica del lote con la sesión (client_reserve_attachments,
     * mismos límites 4 archivos / 2.500.000 bytes) y subida a las rutas asignadas por el servidor.
     */
    async deliverAttachments(token: string, requestId: string, items: ClientDeliveryItem[]): Promise<ClientDeliveryResult> {
      if (items.length === 0) return { uploaded: [], failed: [], error: null }
      let grants: AttachmentGrant[]
      try {
        requireToken(token)
        grants = await api.reserveAttachments(token, requestId, items.map(i => options.metadata(i.file, i.uploadKey)))
        if (!Array.isArray(grants) || grants.length !== items.length) fail()
      } catch (e) {
        const expired = code(e) === 'client_authentication_required' || isClientPortalError(e, 'session_expired')
        const message = expired ? MESSAGES.session_expired
          : code(e) === 'client_ticket_unavailable' ? 'El ticket ya no está disponible para este acceso.'
          : code(e) === 'client_request_forbidden' ? 'La ventana para adjuntar archivos a este ticket ya no está disponible.'
          : 'No se autorizaron los adjuntos. Revisa la cantidad y el tamaño de los archivos.'
        return { uploaded: [], failed: items.map(i => i.file.name), error: message }
      }
      const uploaded: string[] = [], failed: string[] = []
      for (const [index, grant] of grants.entries()) {
        const file = items[index].file
        try { await options.upload(grant, file); uploaded.push(file.name) } catch { failed.push(file.name) }
      }
      return { uploaded, failed, error: failed.length ? 'Algunos adjuntos no se pudieron subir.' : null }
    },

    async listMyTickets(token: string): Promise<ClientTicketSummary[]> {
      requireToken(token)
      let data
      try { data = await api.tickets(token, { limit: 100, offset: 0 }) } catch (e) { throw rpcError(e) }
      if (!Array.isArray(data)) fail()
      return data.map(parseSummary)
    },

    /** Detalle autorizado por UUID. Ajeno o inexistente → null (misma respuesta en ambos casos). */
    async ticketDetail(token: string, requestId: string): Promise<ClientTicketDetail | null> {
      requireToken(token)
      if (!UUID.test(requestId)) return null
      let data
      try { data = await api.detail(token, requestId) }
      catch (e) {
        if (code(e) === 'client_ticket_unavailable') return null
        throw rpcError(e)
      }
      return parseDetail(data)
    },

    /** Revoca la sesión en el servidor (idempotente). Los errores no impiden limpiar la sesión local. */
    async logout(token: string) {
      if (!TOKEN.test(token)) return
      try { await api.logout(token) } catch { /* se limpia igual */ }
    },
  }
}
export type ClientPortal = ReturnType<typeof createClientPortal>
