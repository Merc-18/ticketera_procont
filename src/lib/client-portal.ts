// Adaptador del portal de clientes (acceso Quipu / QuipuFac) — contrato de Codex (M13).
//
// ESTADO: PROVISIONAL. Los nombres de RPC/Edge Function, argumentos y formas de respuesta de
// CLIENT_PORTAL_CONTRACT son los del plan aprobado (19/11/2026) y se ajustarán SOLO en este
// archivo cuando Codex publique el contrato definitivo. Si el backend aún no existe, cada
// operación devuelve `pending_contract` y la interfaz muestra «acceso aún no habilitado»;
// nunca se inventan datos.
//
// Reglas de seguridad del lado del cliente (el servidor las vuelve a validar):
// - La contraseña solo viaja en el cuerpo de `client-login`; no se guarda ni se devuelve.
// - El token de sesión es opaco; se envía en el cuerpo de las RPC, nunca en la URL.
// - Los productos disponibles vienen del backend; el frontend no tiene una lista propia,
//   solo rechaza sesiones incoherentes con las cuatro reglas aprobadas.
// - Las respuestas se filtran por lista blanca de campos: nada interno llega a la vista.

import type { RpcAttempt } from './rpc-attempt.ts'
import type { SubmissionReceipt } from './operations.ts'
import { isGeneralStatus, type GeneralStatus } from './request-status.ts'

export const CLIENT_PORTAL_CONTRACT = {
  status: 'provisional',
  /** Edge Function: valida RUC/usuario/contraseña contra la API del tipo de ingreso. */
  login: 'client-login',
  /** RPC anon: canjea el código temporal del acceso desde plataforma. */
  exchangeLaunch: 'exchange_client_launch',
  /** RPC anon: sesión actual (empresa, identidad, origen, productos permitidos). */
  session: 'get_client_session',
  /** RPC anon: crea el ticket; empresa y estudio los deriva el servidor desde la sesión. */
  submit: 'submit_authenticated_client_request',
  /** RPC anon: tickets de la identidad autenticada. */
  list: 'list_my_client_requests',
  /** RPC anon: detalle autorizado (ajeno o inexistente → null). */
  detail: 'get_my_client_request',
  /** RPC anon: cierra la sesión. */
  logout: 'end_client_session',
} as const

/** Tipo de autenticación (y, en el acceso desde plataforma, producto de origen). */
export type AuthType = 'quipu' | 'quipufac'
export const AUTH_TYPE_LABEL: Record<AuthType, string> = { quipu: 'Quipu', quipufac: 'QuipuFac' }

/** Producto seleccionable (fila de catalog_systems devuelta por el backend). */
export interface ClientProduct { id: string; name: string; client_key: AuthType | null }

export type ClientIdentity =
  | { kind: 'individual'; username: string; display_name: string | null }
  | { kind: 'company_account' }

export interface ClientSession {
  company_name: string
  auth_type: AuthType
  /** null = acceso directo desde la web; 'quipu' | 'quipufac' = abierto desde esa plataforma. */
  origin: AuthType | null
  identity: ClientIdentity
  /** Productos permitidos para Nuevo ticket, calculados por el servidor. */
  products: ClientProduct[]
  expires_at: string
}

export interface ClientTicketSummary {
  request_number: string
  product_name: string
  title: string
  created_at: string
  status: GeneralStatus
  /** Nombre declarado en el formulario (no es una identidad verificada). */
  requester_name: string
}
export interface ClientTicketDetail extends ClientTicketSummary {
  request_type: string | null
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

export type ClientPortalErrorCode =
  | 'pending_contract' | 'invalid_input' | 'invalid_credentials' | 'rate_limited'
  | 'session_expired' | 'invalid_launch' | 'unavailable' | 'invalid_response'

const MESSAGES: Record<ClientPortalErrorCode, string> = {
  pending_contract: 'El acceso de clientes aún no está habilitado. Intenta más tarde.',
  invalid_input: 'Revisa los datos ingresados.',
  invalid_credentials: 'No pudimos validar los datos. Revisa e inténtalo nuevamente.',
  rate_limited: 'Demasiados intentos seguidos. Espera unos minutos e inténtalo de nuevo.',
  session_expired: 'Tu sesión terminó. Ingresa nuevamente.',
  invalid_launch: 'El enlace de acceso no es válido o ya fue utilizado. Vuelve a abrir Ticketera desde tu sistema.',
  unavailable: 'El servicio no está disponible en este momento. Intenta más tarde.',
  invalid_response: 'El servidor devolvió una respuesta no válida. Intenta nuevamente.',
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

/** Transporte inyectable: Supabase en la app, simulado en pruebas. */
export interface ClientTransport {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: any; error: unknown }>
  /** Edge Function. `status` = código HTTP, o null si no hubo respuesta (red). */
  invoke(name: string, body: Record<string, unknown>): Promise<{ data: any; status: number | null; error: unknown }>
}

// ─── Validaciones ────────────────────────────────────────────────────────────
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const REQ = /^REQ\d{2}-\d{3,}$/
const TOKEN = /^[A-Za-z0-9._~-]{32,512}$/
const LAUNCH_CODE = /^[A-Za-z0-9_-]{32,256}$/
const AUTH_TYPES: readonly AuthType[] = ['quipu', 'quipufac']

export const RUC_PATTERN = /^\d{11}$/
export function validateLogin(input: ClientLoginInput): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!RUC_PATTERN.test(input.ruc.trim())) errors.ruc = 'El RUC debe tener 11 dígitos.'
  if (input.auth_type === 'quipu') {
    const user = input.username.trim()
    if (!user) errors.username = 'Ingresa tu usuario.'
    else if (user.length > 100) errors.username = 'El usuario es demasiado largo.'
  }
  if (!input.password) errors.password = 'Ingresa tu contraseña.'
  else if (input.password.length > 256) errors.password = 'La contraseña es demasiado larga.'
  return errors
}

const text = (v: unknown, max = 20000): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max
const isAuthType = (v: unknown): v is AuthType => typeof v === 'string' && (AUTH_TYPES as readonly string[]).includes(v)
const validDate = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v))
function fail(): never { throw new ClientPortalError('invalid_response') }

/**
 * Normaliza la sesión y comprueba que sea coherente con las cuatro reglas aprobadas:
 * - Desde plataforma Quipu/QuipuFac: exactamente un producto, el de esa plataforma (fijo).
 * - Ingreso con QuipuFac: nunca incluye Quipu.
 * - Quipu identifica a un usuario; QuipuFac a la cuenta empresarial.
 * Si algo no cuadra se descarta la sesión entera (falla cerrada).
 */
export function parseSession(raw: any): ClientSession {
  if (!raw || typeof raw !== 'object') fail()
  if (!text(raw.company_name, 300) || !isAuthType(raw.auth_type) || !validDate(raw.expires_at)) fail()
  const origin = raw.origin ?? null
  if (origin !== null && !isAuthType(origin)) fail()

  let identity: ClientIdentity
  const id = raw.identity
  if (raw.auth_type === 'quipu') {
    if (id?.kind !== 'individual' || !text(id.username, 100)) fail()
    identity = { kind: 'individual', username: id.username, display_name: text(id.display_name, 200) ? id.display_name : null }
  } else {
    if (id?.kind !== 'company_account') fail()
    identity = { kind: 'company_account' }
  }

  if (!Array.isArray(raw.products) || raw.products.length === 0) fail()
  const products: ClientProduct[] = raw.products.map((p: any) => {
    if (!p || !UUID.test(p.id ?? '') || !text(p.name, 200)) fail()
    const key = p.client_key ?? null
    if (key !== null && !isAuthType(key)) fail()
    return { id: p.id, name: p.name, client_key: key }
  })
  if (new Set(products.map(p => p.id)).size !== products.length) fail()

  if (origin !== null) {
    if (origin !== raw.auth_type) fail()
    if (products.length !== 1 || products[0].client_key !== origin) fail()
  }
  if (raw.auth_type === 'quipufac' && products.some(p => p.client_key === 'quipu')) fail()

  return { company_name: raw.company_name, auth_type: raw.auth_type, origin, identity, products, expires_at: raw.expires_at }
}

function parseSummary(raw: any): ClientTicketSummary {
  if (!raw || !REQ.test(raw.request_number ?? '') || !text(raw.product_name, 200) || !text(raw.title, 300)
      || !validDate(raw.created_at) || !isGeneralStatus(raw.status) || !text(raw.requester_name, 200)) fail()
  return { request_number: raw.request_number, product_name: raw.product_name, title: raw.title,
    created_at: raw.created_at, status: raw.status, requester_name: raw.requester_name }
}
function parseDetail(raw: any): ClientTicketDetail {
  const base = parseSummary(raw)
  if (!text(raw.description) || typeof raw.urgent_requested !== 'boolean') fail()
  return { ...base, request_type: text(raw.request_type, 1000) ? raw.request_type : null,
    description: raw.description, urgent_requested: raw.urgent_requested,
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

// ─── Errores del servidor ────────────────────────────────────────────────────
// PROVISIONAL: códigos SQLSTATE esperados del contrato de Codex.
//   PGRST202 / 42883 → RPC no publicada · 28000 → sesión inválida o vencida
//   22023 / 23514    → validación (el mensaje del servidor es apto para el usuario)
function rpcError(error: unknown, fallback: ClientPortalErrorCode): ClientPortalError {
  const e = (error ?? {}) as { code?: string; message?: string }
  if (e.code === 'PGRST202' || e.code === '42883') return new ClientPortalError('pending_contract')
  if (e.code === '28000') return new ClientPortalError('session_expired')
  if ((e.code === '22023' || e.code === '23514') && typeof e.message === 'string' && e.message.length <= 300)
    return new ClientPortalError('invalid_input', e.message)
  return new ClientPortalError(fallback)
}

function parseAuthResult(data: any) {
  if (!data || typeof data.session_token !== 'string' || !TOKEN.test(data.session_token)) fail()
  return { token: data.session_token as string, session: parseSession(data.session) }
}

export function createClientPortal(transport: ClientTransport) {
  async function call(name: string, args: Record<string, unknown>, fallback: ClientPortalErrorCode = 'unavailable') {
    let result
    try { result = await transport.rpc(name, args) } catch { throw new ClientPortalError('unavailable') }
    if (result.error) throw rpcError(result.error, fallback)
    return result.data
  }
  const requireToken = (token: string) => {
    if (!TOKEN.test(token)) throw new ClientPortalError('session_expired')
  }

  return {
    /** Acceso directo: Quipu (RUC + usuario + contraseña) o QuipuFac (RUC + contraseña). */
    async login(input: ClientLoginInput) {
      const errors = validateLogin(input)
      if (Object.keys(errors).length) throw new ClientPortalError('invalid_input', Object.values(errors)[0])
      const body = input.auth_type === 'quipu'
        ? { auth_type: 'quipu', ruc: input.ruc.trim(), username: input.username.trim(), password: input.password }
        : { auth_type: 'quipufac', ruc: input.ruc.trim(), password: input.password }
      let response
      try { response = await transport.invoke(CLIENT_PORTAL_CONTRACT.login, body) } catch { throw new ClientPortalError('unavailable') }
      const { status, data, error } = response
      if (status === 404) throw new ClientPortalError('pending_contract')
      if (status === 400 || status === 401 || status === 403) throw new ClientPortalError('invalid_credentials')
      if (status === 429) throw new ClientPortalError('rate_limited')
      if (error || status === null || status >= 300) throw new ClientPortalError('unavailable')
      return parseAuthResult(data)
    },

    /** Acceso desde plataforma: canjea el código temporal (un solo uso). La sesión queda con producto fijo. */
    async exchangeLaunch(code: string) {
      if (!LAUNCH_CODE.test(code)) throw new ClientPortalError('invalid_launch')
      let data
      try { data = await call(CLIENT_PORTAL_CONTRACT.exchangeLaunch, { p_code: code }, 'invalid_launch') }
      catch (err) {
        // Código vencido, usado o rechazado: siempre «enlace no válido» (no hay sesión que «termine»).
        if (isClientPortalError(err, 'pending_contract') || isClientPortalError(err, 'unavailable')) throw err
        throw new ClientPortalError('invalid_launch')
      }
      if (data === null) throw new ClientPortalError('invalid_launch')
      const result = parseAuthResult(data)
      if (result.session.origin === null) fail()
      return result
    },

    async currentSession(token: string) {
      requireToken(token)
      const data = await call(CLIENT_PORTAL_CONTRACT.session, { p_session_token: token })
      if (data === null) throw new ClientPortalError('session_expired')
      return parseSession(data)
    },

    /** Crea el ticket. El producto debe estar entre los permitidos por la sesión (el servidor lo revalida). */
    async submitTicket(token: string, session: ClientSession, input: ClientTicketInput, attempt: RpcAttempt): Promise<SubmissionReceipt> {
      requireToken(token)
      if (!session.products.some(p => p.id === input.system_id)) throw new ClientPortalError('invalid_input', 'Selecciona un producto disponible.')
      if (!input.requester_name.trim()) throw new ClientPortalError('invalid_input', 'Ingresa el nombre del solicitante.')
      if (!input.title.trim() || !input.description.trim()) throw new ClientPortalError('invalid_input', 'Completa el título y la descripción.')
      if (!UUID.test(input.request_type_id)) throw new ClientPortalError('invalid_input', 'Selecciona el tipo de solicitud.')
      const payload = { requester_name: input.requester_name.trim(), system_id: input.system_id,
        request_type_id: input.request_type_id, title: input.title.trim(), description: input.description.trim(),
        urgent_requested: input.urgent_requested }
      return attempt.run(CLIENT_PORTAL_CONTRACT.submit, { p_session_token: token, p_payload: payload }, async args => {
        const receipt = await call(CLIENT_PORTAL_CONTRACT.submit, args)
        if (!receipt || !UUID.test(receipt.id ?? '') || !UUID.test(receipt.tracking_token ?? '') || !REQ.test(receipt.request_number ?? '')) {
          throw new Error('No se recibió una constancia válida. Reintenta sin cambiar los datos de la solicitud.')
        }
        return { id: receipt.id, request_number: receipt.request_number, tracking_token: receipt.tracking_token }
      })
    },

    async listMyTickets(token: string): Promise<ClientTicketSummary[]> {
      requireToken(token)
      const data = await call(CLIENT_PORTAL_CONTRACT.list, { p_session_token: token })
      if (!Array.isArray(data)) fail()
      return (data as unknown[]).map(parseSummary)
    },

    /** Detalle autorizado. Ajeno o inexistente → null (misma respuesta en ambos casos). */
    async ticketDetail(token: string, requestNumber: string): Promise<ClientTicketDetail | null> {
      requireToken(token)
      const normalized = requestNumber.trim().toUpperCase()
      if (!REQ.test(normalized)) return null
      const data = await call(CLIENT_PORTAL_CONTRACT.detail, { p_session_token: token, p_request_number: normalized })
      return data === null ? null : parseDetail(data)
    },

    /** Cierra la sesión en el servidor. Los errores no impiden limpiar la sesión local. */
    async logout(token: string) {
      if (!TOKEN.test(token)) return
      try { await transport.rpc(CLIENT_PORTAL_CONTRACT.logout, { p_session_token: token }) } catch { /* se limpia igual */ }
    },
  }
}
export type ClientPortal = ReturnType<typeof createClientPortal>
