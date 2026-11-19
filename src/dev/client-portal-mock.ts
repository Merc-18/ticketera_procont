// ⚠ DATOS FICTICIOS — uso exclusivo en pruebas (tests/client-portal.test.mjs) y en la vista
// de desarrollo aislada (VITE_CLIENT_PORTAL_MOCK=1 con `vite`, nunca en el build).
// Simula el contrato de Codex (contracts/client-access-client.mjs, M13): Edge Function
// `client-login` (login/exchange) y RPC client_* con SQLSTATE distintos (PT401 sesión, PT403 producto
// o ticket ajeno; 23514 asociación de estudio; 22023 validación). No representa clientes reales.

import type { ClientAccessTransport } from '../../contracts/client-access-client.d.mts'

const PRODUCTS = [
  { id: '00000000-0000-4000-8000-0000000000a1', name: 'Quipu', requires_subproject: false },
  { id: '00000000-0000-4000-8000-0000000000a2', name: 'Quipu_Fac', requires_subproject: true },
  { id: '00000000-0000-4000-8000-0000000000a3', name: 'Quipu_Gestion', requires_subproject: false },
  { id: '00000000-0000-4000-8000-0000000000a4', name: 'Negmin', requires_subproject: false },
  { id: '00000000-0000-4000-8000-0000000000a5', name: 'Quipu_AI', requires_subproject: false },
] as const
export const MOCK_PRODUCTS = PRODUCTS
const BINDING = { quipu: PRODUCTS[0].id, quipufac: PRODUCTS[1].id } as const

/** Empresa ficticia con estudio asociado; otra sin asociación; otra con proveedor sin contrato. */
export const MOCK_RUC = '20000000001'
export const MOCK_RUC_UNMAPPED = '20000000002'
export const MOCK_RUC_PROVIDER_PENDING = '20000000009'
export const MOCK_PASSWORD = 'demo'
const STUDIO = '00000000-0000-4000-8000-0000000000b1'
/** Códigos de entrada ficticios (64 hex, como los emite client-login). */
export const MOCK_ENTRY = { quipu: 'a'.repeat(64), quipufac: 'b'.repeat(64) } as const

type Provider = 'quipu' | 'quipufac'
interface MockSession { identity: string; provider: Provider; ruc: string; context: 'direct' | 'platform'; username?: string; revoked?: boolean }
interface MockTicket {
  identity: string; id: string; request_number: string; system_id: string; title: string; created_at: string
  status: string; general_status: string; requester_name: string; description: string
  urgent_requested: boolean; rejection_reason: string | null; files: number; bytes: number
  // Campos internos que el adaptador debe descartar si llegaran a enviarse.
  priority?: string; assigned_to?: string; studio_code?: string
}

const day = (n: number) => new Date(Date.UTC(2026, 10, n, 15, 0)).toISOString()
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const seed = (): MockTicket[] => [
  { identity: 'quipu:ana', id: uuid(9001), request_number: 'REQ26-9001', system_id: PRODUCTS[0].id, title: 'Ticket ficticio de Ana (Quipu)',
    created_at: day(12), status: 'approved', general_status: 'in_progress', requester_name: 'Ana Ficticia',
    description: 'Descripción ficticia para la vista de desarrollo.', urgent_requested: true, rejection_reason: null, files: 0, bytes: 0,
    priority: 'high', assigned_to: 'interno', studio_code: 'XX' },
  { identity: 'quipu:ana', id: uuid(9002), request_number: 'REQ26-9002', system_id: PRODUCTS[3].id, title: 'Consulta ficticia de Ana (Negmin)',
    created_at: day(15), status: 'rejected', general_status: 'rejected', requester_name: 'Ana Ficticia',
    description: 'Otra descripción ficticia.', urgent_requested: false, rejection_reason: 'Motivo público ficticio.', files: 0, bytes: 0 },
  { identity: 'quipu:luis', id: uuid(9003), request_number: 'REQ26-9003', system_id: PRODUCTS[0].id, title: 'Ticket ficticio de Luis',
    created_at: day(16), status: 'pending', general_status: 'received', requester_name: 'Luis Ficticio',
    description: 'Ticket de otro usuario de la misma empresa.', urgent_requested: false, rejection_reason: null, files: 0, bytes: 0 },
  { identity: 'quipufac:company', id: uuid(9004), request_number: 'REQ26-9004', system_id: PRODUCTS[1].id, title: 'Ticket ficticio de la cuenta QuipuFac',
    created_at: day(17), status: 'pending', general_status: 'in_review', requester_name: 'Persona Declarada Uno',
    description: 'Ticket de la cuenta empresarial.', urgent_requested: false, rejection_reason: null, files: 0, bytes: 0 },
  { identity: 'quipufac:company', id: uuid(9005), request_number: 'REQ26-9005', system_id: PRODUCTS[4].id, title: 'Otro ticket de la cuenta QuipuFac',
    created_at: day(18), status: 'approved', general_status: 'done', requester_name: 'Persona Declarada Dos',
    description: 'Mismo RUC, otro nombre declarado.', urgent_requested: false, rejection_reason: null, files: 0, bytes: 0 },
]
export const MOCK_TICKET_IDS = { ana: uuid(9001), anaRejected: uuid(9002), luis: uuid(9003), quipufac: uuid(9004) }

type RpcResult = { data: unknown; error: { code?: string; message?: string } | null }
const pg = (code: string): RpcResult => ({ data: null, error: { code, message: 'error ficticio' } })
const ok = (data: unknown): RpcResult => ({ data, error: null })
const edgeFail = (error: string) => ({ data: { error } as unknown, error: { message: 'edge error' } as unknown })

export function createMockClientTransport(): ClientAccessTransport & { tickets: MockTicket[] } {
  const sessions = new Map<string, MockSession>()
  const tickets = seed()
  const usedCodes = new Set<string>()
  let seq = 0, reqSeq = 9100

  const newToken = (s: MockSession) => {
    const token = (++seq).toString(16).padStart(64, 'c')
    sessions.set(token, s)
    return token
  }
  const products = (s: MockSession) => s.context === 'platform'
    ? PRODUCTS.filter(p => p.id === BINDING[s.provider])
    : s.provider === 'quipu' ? [...PRODUCTS] : PRODUCTS.filter(p => p.id !== BINDING.quipu)
  const info = (s: MockSession) => ({
    expires_at: new Date(Date.now() + 8 * 3600_000).toISOString(), entry_context: s.context,
    identity: { id: uuid(1), provider: s.provider, kind: s.provider === 'quipu' ? 'user' : 'company',
      username: s.username ?? null, subject_source: s.provider === 'quipu' ? 'username' : 'company',
      verified_name: s.username === 'ana' ? 'Ana Ficticia' : null, name_verified: s.username === 'ana' },
    company: { ruc: s.ruc, studio_id: s.ruc === MOCK_RUC ? STUDIO : null, studio_mapping: s.ruc === MOCK_RUC ? 'resolved' : 'required' },
  })
  const summary = (t: MockTicket) => {
    const { identity: _i, description: _d, urgent_requested: _u, rejection_reason: _r, files: _f, bytes: _b, ...rest } = t
    return rest
  }

  return {
    tickets,
    functions: {
      async invoke(name: string, { body }: { body: Record<string, unknown> }) {
        if (name !== 'client-login') return edgeFail('client_backend_unavailable')
        const provider = body.provider as Provider
        if (provider !== 'quipu' && provider !== 'quipufac') return edgeFail('invalid_provider')
        if (body.action === 'exchange') {
          const code = String(body.code)
          if (code !== MOCK_ENTRY[provider] || usedCodes.has(code)) return edgeFail('client_authentication_required')
          usedCodes.add(code)
          const s: MockSession = provider === 'quipu'
            ? { identity: 'quipu:ana', provider, ruc: MOCK_RUC, context: 'platform', username: 'ana' }
            : { identity: 'quipufac:company', provider, ruc: MOCK_RUC, context: 'platform' }
          return { data: { session_token: newToken(s), session: info(s) }, error: null }
        }
        if (body.action !== 'login') return edgeFail('invalid_request')
        const ruc = String(body.ruc)
        if (!/^\d{11}$/.test(ruc)) return edgeFail('invalid_ruc')
        if (provider === 'quipufac' && 'username' in body) return edgeFail('invalid_request')
        if (ruc === MOCK_RUC_PROVIDER_PENDING) return edgeFail('provider_contract_pending')
        if (body.password !== MOCK_PASSWORD) return edgeFail('invalid_credentials')
        const username = provider === 'quipu' ? String(body.username) : undefined
        const s: MockSession = { identity: provider === 'quipu' ? `quipu:${username}` : 'quipufac:company',
          provider, ruc, context: 'direct', username }
        return { data: { session_token: newToken(s), session: info(s) }, error: null }
      },
    },
    async rpc(name: string, args: Record<string, unknown>): Promise<RpcResult> {
      const token = String(args.p_session_token ?? '')
      if (!/^[0-9a-f]{64}$/.test(token)) return pg('PT401')
      if (name === 'client_logout') { const s = sessions.get(token); if (s) s.revoked = true; return ok(null) }
      const s = sessions.get(token)
      if (!s || s.revoked) return pg('PT401')
      const own = (id: unknown) => tickets.find(t => t.identity === s.identity && t.id === id)
      switch (name) {
        case 'client_session_info': return ok(info(s))
        case 'client_products': return ok(products(s))
        case 'client_list_tickets':
          return ok(tickets.filter(t => t.identity === s.identity).sort((a, b) => b.created_at.localeCompare(a.created_at)).map(summary))
        case 'client_ticket_detail': {
          const t = own(args.p_request_id)
          return t ? ok({ ...summary(t), description: t.description, urgent_requested: t.urgent_requested,
            rejection_reason: t.status === 'rejected' ? t.rejection_reason : null, timeline: [] }) : pg('PT404')
        }
        case 'client_submit_request': {
          const p = args.p_payload as Record<string, any>
          if (!products(s).some(x => x.id === p.system_id)) return pg('PT403')
          if (s.ruc !== MOCK_RUC) return pg('23514')
          const id = crypto.randomUUID(), request_number = `REQ26-${++reqSeq}`
          tickets.push({ identity: s.identity, id, request_number, system_id: p.system_id, title: p.title,
            created_at: new Date().toISOString(), status: 'pending', general_status: 'received', requester_name: p.requester_name,
            description: p.description, urgent_requested: !!p.urgent_requested, rejection_reason: null, files: 0, bytes: 0 })
          return ok({ id, request_number, tracking_token: crypto.randomUUID() })
        }
        case 'client_reserve_attachments': {
          const t = own(args.p_request_id)
          if (!t) return pg('PT404')
          const files = args.p_files as { upload_key: string; file_name: string; size_bytes: number; mime_type: string }[]
          const bytes = files.reduce((n, f) => n + f.size_bytes, 0)
          if (t.files + files.length > 4 || t.bytes + bytes > 2_500_000) return pg('23514')
          t.files += files.length; t.bytes += bytes
          return ok(files.map(f => ({ bucket: 'request-attachments', path: `${t.id}/${f.upload_key}-${f.file_name}`,
            size_bytes: f.size_bytes, mime_type: f.mime_type, expires_at: new Date(Date.now() + 600_000).toISOString() })))
        }
        default: return pg('PGRST202')
      }
    },
  }
}
