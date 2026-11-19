export type ClientProvider = 'quipu' | 'quipufac'
/** PT401=session; PT403=product; PT404=foreign/missing ticket; 42501=other permission/window. */
export type ClientAccessResourceError = 'client_authentication_required' | 'client_product_unavailable'
  | 'client_ticket_unavailable' | 'client_request_forbidden'
export type ClientLoginInput =
  | { provider: 'quipu'; ruc: string; username: string; password: string }
  | { provider: 'quipufac'; ruc: string; password: string }
export interface ClientSession {
  expires_at: string
  entry_context: 'direct' | 'platform'
  identity: {
    id: string; provider: ClientProvider; kind: 'user' | 'company'; username: string | null
    subject_source: 'provider_id' | 'username' | 'company'
    verified_name: string | null; name_verified: boolean
  }
  company: { ruc: string; studio_id: string | null; studio_mapping: 'resolved' | 'required' }
}
export interface ClientSessionReceipt { session_token: string; session: ClientSession }
export interface ClientProduct { id: string; name: string; requires_subproject: boolean }
export interface ClientSubmitPayload {
  requester_name: string
  system_id: string
  request_type_id: string
  title: string
  description: string
  urgent_requested?: boolean
}
export interface ClientRequestReceipt { id: string; request_number: string; tracking_token: string }
export interface ClientAttachmentInput { upload_key: string; file_name: string; size_bytes: number; mime_type: string }
export interface ClientAttachmentGrant { bucket: string; path: string; size_bytes: number; mime_type: string; expires_at: string }
export type ClientGeneralStatus = 'received' | 'in_review' | 'approved_backlog' | 'in_progress' | 'done' | 'blocked' | 'rejected'
export interface ClientTicket {
  id: string; request_number: string; title: string; created_at: string
  status: 'pending' | 'approved' | 'rejected'; general_status: ClientGeneralStatus
  system_id: string; requester_name: string; requester_name_verified: false
}
export interface ClientTicketDetail extends ClientTicket {
  description: string; urgent_requested: boolean; rejection_reason: string | null
  timeline: Array<{ action: string; created_at: string; general_status: ClientGeneralStatus | null }>
}
export interface ClientAccessApi {
  login(input: ClientLoginInput): Promise<ClientSessionReceipt>
  exchange(provider: ClientProvider, code: string): Promise<ClientSessionReceipt>
  session(token: string): Promise<ClientSession>
  products(token: string): Promise<ClientProduct[]>
  submit(token: string, payload: ClientSubmitPayload, key: string): Promise<ClientRequestReceipt>
  tickets(token: string, options?: { limit?: number; offset?: number }): Promise<ClientTicket[]>
  detail(token: string, requestId: string): Promise<ClientTicketDetail>
  reserveAttachments(token: string, requestId: string, files: ClientAttachmentInput[]): Promise<ClientAttachmentGrant[]>
  logout(token: string): Promise<void>
}
export interface ClientAccessTransport {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string } | null }>
  functions: { invoke(name: string, options: { body: Record<string, unknown> }): Promise<{ data: unknown; error: unknown }> }
}
export function createClientAccess(client: ClientAccessTransport): ClientAccessApi
