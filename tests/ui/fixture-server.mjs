// ⚠ SERVIDOR SIMULADO para pruebas de interfaz. Imita las rutas REST/Auth de Supabase que usa el
// frontend, con DATOS FICTICIOS en memoria. Nunca contacta al proyecto real ni crea tickets reales.
import { createServer } from 'node:http'

const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url')
const fakeJwt = (sub, email) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({
  sub, email, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.firma-simulada`

export const SIMULATED_PASSWORD = 'clave-simulada'
export const STAFF = {
  'superadmin@simulado.invalid': { id: '00000000-0000-4000-8000-0000000000c1', role: 'superadmin', full_name: 'Superadmin Simulado' },
  'admin@simulado.invalid': { id: '00000000-0000-4000-8000-0000000000c2', role: 'admin', full_name: 'Admin Simulado' },
  'developer@simulado.invalid': { id: '00000000-0000-4000-8000-0000000000c3', role: 'developer', full_name: 'Developer Simulado' },
  'viewer@simulado.invalid': { id: '00000000-0000-4000-8000-0000000000c4', role: 'viewer', full_name: 'Viewer Simulado' },
}

const SYSTEMS = ['Quipu', 'Quipu_Fac', 'Quipu_Gestion', 'Negmin', 'Quipu_AI'].map((name, i) => ({
  id: `00000000-0000-4000-8000-0000000000a${i + 1}`, name, requires_subproject: false, sort_order: i, is_active: true }))
const REQUEST_TYPES = ['Error / Incidencia', 'Mejora', 'Soporte técnico'].map((name, i) => ({
  id: `00000000-0000-4000-8000-0000000000f${i + 1}`, name, sort_order: i, is_active: true }))
// Proyectos ficticios: uno activo con fecha SLA heredada próxima (para comprobar que no dispara
// alertas) y dos terminados para la exportación por ticket.
const SOON = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
const PROJECTS = [
  { id: '00000000-0000-4000-8000-0000000000d1', title: 'Proyecto activo simulado', priority: 'high', project_type: 'development',
    status: 'active', is_blocked: false, due_date: '2026-12-15', sla_target_date: SOON, created_at: '2026-11-10T15:00:00Z',
    updated_at: '2026-11-19T15:00:00Z', requests: { requester_area: 'Área simulada' },
    project_flows: [{ flow_type: 'development', current_phase: 'dev', assigned_to: STAFF['developer@simulado.invalid'].id }] },
  { id: '00000000-0000-4000-8000-0000000000d2', title: 'Proyecto terminado completo', priority: 'medium', project_type: 'development',
    status: 'completed', is_blocked: false, due_date: null, created_at: '2026-11-01T15:00:00Z', updated_at: '2026-11-19T20:00:00Z',
    requests: { requester_area: 'Área simulada' }, project_flows: [] },
  { id: '00000000-0000-4000-8000-0000000000d3', title: 'Proyecto terminado sin inicio', priority: 'low', project_type: 'administrative',
    status: 'completed', is_blocked: false, due_date: null, created_at: '2026-11-02T15:00:00Z', updated_at: '2026-11-19T20:00:00Z',
    requests: { requester_area: '' }, project_flows: [] },
]
// Métricas por ticket simuladas con la forma de get_ticket_performance (M11).
const PERFORMANCE = [
  { request_id: '00000000-0000-4000-8000-0000000000e2', request_number: 'REQ26-9201', project_id: PROJECTS[1].id, studio_id: null,
    general_status: 'done', first_started_at: '2026-11-03T15:00:00Z', completed_at: '2026-11-06T15:00:00Z',
    cycle_time_seconds: 259200, lead_time_seconds: 432000, metric_status: 'complete' },
  { request_id: '00000000-0000-4000-8000-0000000000e3', request_number: 'REQ26-9202', project_id: PROJECTS[2].id, studio_id: null,
    general_status: 'done', first_started_at: null, completed_at: '2026-11-05T15:00:00Z',
    cycle_time_seconds: null, lead_time_seconds: 345600, metric_status: 'missing_start' },
  { request_id: '00000000-0000-4000-8000-0000000000e4', request_number: 'REQ26-9203', project_id: PROJECTS[0].id, studio_id: null,
    general_status: 'in_progress', first_started_at: '2026-11-11T15:00:00Z', completed_at: null,
    cycle_time_seconds: null, lead_time_seconds: null, metric_status: 'not_completed' },
]
const TABLES = {
  catalog_systems: SYSTEMS, catalog_subsystems: [], studios: [{ id: '00000000-0000-4000-8000-0000000000b1', name: 'ESTUDIO SIMULADO', is_active: true }],
  areas: [], request_types: REQUEST_TYPES, studio_codes: [], projects: PROJECTS,
}

export async function startFixtureServer() {
  const log = []
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://fixture')
    let body = ''
    for await (const chunk of req) body += chunk
    log.push({ method: req.method, path: url.pathname, query: url.search, body })
    const send = (status, data, headers = {}) => {
      res.writeHead(status, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,HEAD,OPTIONS', 'Access-Control-Expose-Headers': 'Content-Range',
        'Content-Type': 'application/json', 'Content-Range': '0-0/0', ...headers })
      res.end(data === undefined ? '' : JSON.stringify(data))
    }
    if (req.method === 'OPTIONS') return send(204)

    // ── Auth (personal interno) ──
    if (url.pathname === '/auth/v1/token') {
      const { email, password } = JSON.parse(body || '{}')
      const staff = STAFF[email]
      if (!staff || password !== SIMULATED_PASSWORD) return send(400, { error: 'invalid_grant', error_description: 'Invalid login credentials' })
      const user = { id: staff.id, email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-11-01T00:00:00Z' }
      return send(200, { access_token: fakeJwt(staff.id, email), token_type: 'bearer', expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'refresco-simulado', user })
    }
    if (url.pathname === '/auth/v1/logout') return send(204)
    if (url.pathname === '/auth/v1/user') return send(401, { message: 'simulado' })

    // ── RPC ──
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const name = url.pathname.slice('/rest/v1/rpc/'.length)
      if (name === 'track_request_status') {
        const { p_request_number } = JSON.parse(body || '{}')
        return send(200, p_request_number === 'REQ26-9201' ? { request_number: 'REQ26-9201', status: 'in_progress' } : null)
      }
      if (name === 'get_ticket_performance') return send(200, PERFORMANCE)
      return send(404, { code: 'PGRST202', message: 'función simulada no disponible' })
    }

    // ── Tablas ──
    if (url.pathname.startsWith('/rest/v1/')) {
      const table = url.pathname.slice('/rest/v1/'.length)
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(201, [])
      if (table === 'users') {
        const id = url.searchParams.get('id')?.replace(/^eq\./, '')
        const entry = Object.entries(STAFF).find(([, s]) => s.id === id)
        const row = entry ? { ...entry[1], email: entry[0], is_active: true, created_at: '2026-11-01T00:00:00Z' } : null
        const single = (req.headers.accept ?? '').includes('vnd.pgrst.object')
        return id ? send(200, single ? row : row ? [row] : []) : send(200, Object.entries(STAFF).map(([email, s]) => ({ ...s, email, is_active: true })))
      }
      let rows = TABLES[table] ?? []
      const status = url.searchParams.get('status')
      if (status?.startsWith('eq.')) rows = rows.filter(r => r.status === status.slice(3))
      const ids = url.searchParams.get('id')
      if (ids?.startsWith('in.(')) { const set = new Set(ids.slice(4, -1).split(',')); rows = rows.filter(r => set.has(r.id)) }
      return send(200, req.method === 'HEAD' ? undefined : rows, { 'Content-Range': `0-${Math.max(rows.length - 1, 0)}/${rows.length}` })
    }
    send(404, { message: 'ruta simulada inexistente' })
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  return { url: `http://127.0.0.1:${server.address().port}`, log, close: () => new Promise(r => server.close(r)) }
}
