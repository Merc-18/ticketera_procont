// ⚠ DATOS FICTICIOS — uso exclusivo en pruebas (tests/client-portal.test.mjs) y en la vista
// de desarrollo aislada (VITE_CLIENT_PORTAL_MOCK=1 con `vite`, nunca en el build).
// Simula el contrato provisional de CLIENT_PORTAL_CONTRACT aplicando las cuatro reglas de
// producto aprobadas. No representa clientes, empresas ni tickets reales.

import type { ClientTransport } from '../lib/client-portal.ts'

const PRODUCTS = [
  { id: '00000000-0000-4000-8000-0000000000a1', name: 'Quipu', client_key: 'quipu' },
  { id: '00000000-0000-4000-8000-0000000000a2', name: 'Quipu_Fac', client_key: 'quipufac' },
  { id: '00000000-0000-4000-8000-0000000000a3', name: 'Quipu_Gestion', client_key: null },
  { id: '00000000-0000-4000-8000-0000000000a4', name: 'Negmin', client_key: null },
  { id: '00000000-0000-4000-8000-0000000000a5', name: 'Quipu_AI', client_key: null },
] as const
export const MOCK_PRODUCTS = PRODUCTS

/** Credenciales ficticias: contraseña `demo`; RUC `20000000001` (empresa con ambos productos). */
export const MOCK_RUC = '20000000001'
export const MOCK_PASSWORD = 'demo'
/** Códigos de acceso desde plataforma ficticios. */
export const MOCK_LAUNCH = {
  quipu: 'mock-launch-quipu-0000000000000000000000000000',
  quipufac: 'mock-launch-quipufac-000000000000000000000000',
} as const

type Auth = 'quipu' | 'quipufac'
interface MockSession { principal: string; auth: Auth; origin: Auth | null; username?: string }
interface MockTicket {
  principal: string; request_number: string; product_id: string; title: string; created_at: string
  status: string; requester_name: string; request_type: string; description: string
  urgent_requested: boolean; rejection_reason: string | null
  // Campos internos que el adaptador debe descartar si llegaran a enviarse.
  priority?: string; assigned_to?: string; studio_code?: string
}

const day = (n: number) => new Date(Date.UTC(2026, 10, n, 15, 0)).toISOString()
const seed = (): MockTicket[] => [
  { principal: 'quipu:ana', request_number: 'REQ26-9001', product_id: PRODUCTS[0].id, title: 'Ticket ficticio de Ana (Quipu)',
    created_at: day(12), status: 'in_progress', requester_name: 'Ana Ficticia', request_type: 'Error / Incidencia',
    description: 'Descripción ficticia para la vista de desarrollo.', urgent_requested: true, rejection_reason: null,
    priority: 'high', assigned_to: 'interno', studio_code: 'XX' },
  { principal: 'quipu:ana', request_number: 'REQ26-9002', product_id: PRODUCTS[3].id, title: 'Consulta ficticia de Ana (Negmin)',
    created_at: day(15), status: 'rejected', requester_name: 'Ana Ficticia', request_type: 'Capacitación / Consulta',
    description: 'Otra descripción ficticia.', urgent_requested: false, rejection_reason: 'Motivo público ficticio.' },
  { principal: 'quipu:luis', request_number: 'REQ26-9003', product_id: PRODUCTS[0].id, title: 'Ticket ficticio de Luis',
    created_at: day(16), status: 'received', requester_name: 'Luis Ficticio', request_type: 'Mejora',
    description: 'Ticket de otro usuario de la misma empresa.', urgent_requested: false, rejection_reason: null },
  { principal: 'quipufac:company', request_number: 'REQ26-9004', product_id: PRODUCTS[1].id, title: 'Ticket ficticio de la cuenta QuipuFac',
    created_at: day(17), status: 'in_review', requester_name: 'Persona Declarada Uno', request_type: 'Soporte técnico',
    description: 'Ticket de la cuenta empresarial.', urgent_requested: false, rejection_reason: null },
  { principal: 'quipufac:company', request_number: 'REQ26-9005', product_id: PRODUCTS[4].id, title: 'Otro ticket de la cuenta QuipuFac',
    created_at: day(18), status: 'done', requester_name: 'Persona Declarada Dos', request_type: 'Mejora',
    description: 'Mismo RUC, otro nombre declarado.', urgent_requested: false, rejection_reason: null },
]

const err = (code: string, message = 'error ficticio') => ({ data: null, error: { code, message } })
const ok = (data: unknown) => ({ data, error: null })

export function createMockClientTransport(): ClientTransport & { tickets: MockTicket[] } {
  const sessions = new Map<string, MockSession>()
  const tickets = seed()
  let tokenSeq = 0
  let reqSeq = 9100

  const newToken = (s: MockSession) => {
    const token = `mock-session-${String(++tokenSeq).padStart(4, '0')}-${'x'.repeat(24)}`
    sessions.set(token, s)
    return token
  }
  const products = (s: MockSession) => {
    if (s.origin) return PRODUCTS.filter(p => p.client_key === s.origin)
    return s.auth === 'quipu' ? [...PRODUCTS] : PRODUCTS.filter(p => p.client_key !== 'quipu')
  }
  const view = (s: MockSession) => ({
    company_name: 'EMPRESA FICTICIA S.A.C.', auth_type: s.auth, origin: s.origin,
    identity: s.auth === 'quipu' ? { kind: 'individual', username: s.username, display_name: s.username === 'ana' ? 'Ana Ficticia' : null }
      : { kind: 'company_account' },
    products: products(s), expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
  })
  const summary = (t: MockTicket) => ({ ...t, product_name: PRODUCTS.find(p => p.id === t.product_id)!.name })

  return {
    tickets,
    async invoke(name, body) {
      if (name !== 'client-login') return { data: null, status: 404, error: { message: 'not found' } }
      const auth = body.auth_type as Auth
      if (body.ruc !== MOCK_RUC || body.password !== MOCK_PASSWORD) return { data: null, status: 401, error: { message: 'unauthorized' } }
      if (auth === 'quipufac' && 'username' in body) return { data: null, status: 400, error: { message: 'bad request' } }
      const username = auth === 'quipu' ? String(body.username) : undefined
      const s: MockSession = { principal: auth === 'quipu' ? `quipu:${username}` : 'quipufac:company', auth, origin: null, username }
      return { data: { session_token: newToken(s), session: view(s) }, status: 200, error: null }
    },
    async rpc(name, args) {
      if (name === 'exchange_client_launch') {
        const origin = (Object.keys(MOCK_LAUNCH) as Auth[]).find(k => MOCK_LAUNCH[k] === args.p_code)
        if (!origin) return err('28000')
        const s: MockSession = origin === 'quipu'
          ? { principal: 'quipu:ana', auth: 'quipu', origin, username: 'ana' }
          : { principal: 'quipufac:company', auth: 'quipufac', origin }
        return ok({ session_token: newToken(s), session: view(s) })
      }
      const s = sessions.get(String(args.p_session_token))
      if (name === 'end_client_session') { sessions.delete(String(args.p_session_token)); return ok(null) }
      if (!s) return err('28000')
      switch (name) {
        case 'get_client_session': return ok(view(s))
        case 'list_my_client_requests':
          return ok(tickets.filter(t => t.principal === s.principal).map(summary).sort((a, b) => b.created_at.localeCompare(a.created_at)))
        case 'get_my_client_request': {
          const t = tickets.find(t => t.principal === s.principal && t.request_number === args.p_request_number)
          return ok(t ? summary(t) : null)
        }
        case 'submit_authenticated_client_request': {
          const p = args.p_payload as Record<string, any>
          if (!products(s).some(x => x.id === p.system_id)) return err('22023', 'Producto no permitido para esta sesión')
          const request_number = `REQ26-${++reqSeq}`
          tickets.push({ principal: s.principal, request_number, product_id: p.system_id, title: p.title,
            created_at: new Date().toISOString(), status: 'received', requester_name: p.requester_name,
            request_type: 'Tipo ficticio', description: p.description, urgent_requested: p.urgent_requested, rejection_reason: null })
          return ok({ id: crypto.randomUUID(), request_number, tracking_token: crypto.randomUUID() })
        }
        default: return err('PGRST202')
      }
    },
  }
}
