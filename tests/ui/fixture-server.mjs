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
const CARD_COLOR_IDS = ['azul','azul-claro','azul-oscuro','azul-acero','celeste','celeste-claro','celeste-oscuro','celeste-acero',
  'dorado','dorado-claro','dorado-oscuro','dorado-ocre','ambar','ambar-claro','ambar-oscuro','ambar-bronce',
  'grafito','grafito-claro','grafito-oscuro','grafito-humo','pizarra','pizarra-claro','pizarra-oscuro','pizarra-acero']
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
  catalog_systems: SYSTEMS, catalog_subsystems: [], studios: [{ id: '00000000-0000-4000-8000-0000000000b1', name: 'ESTUDIO SIMULADO', is_active: true },
    { id: '00000000-0000-4000-8000-000000000177', name: 'ESTUDIO PROCONT SIMULADO', is_active: true }],
  // Regla D-041: el código canónico PROCONT identifica al estudio con áreas (datos ficticios).
  areas: [{ id: '00000000-0000-4000-8000-0000000001a1', name: 'CONTABILIDAD', code: 'C000', is_active: true, parent_id: null, studio_id: '00000000-0000-4000-8000-000000000177' },
    { id: '00000000-0000-4000-8000-0000000001a2', name: 'LEGAL', code: 'L000', is_active: true, parent_id: null, studio_id: '00000000-0000-4000-8000-000000000177' }],
  request_types: REQUEST_TYPES,
  studio_codes: [{ id: '00000000-0000-4000-8000-0000000001c1', studio_id: '00000000-0000-4000-8000-000000000177', code: 'PROCONT', is_active: true },
    { id: '00000000-0000-4000-8000-0000000001c2', studio_id: '00000000-0000-4000-8000-000000000177', code: 'ARAPA', is_active: true },
    { id: '00000000-0000-4000-8000-0000000001c3', studio_id: '00000000-0000-4000-8000-000000000177', code: 'DISFARMADENT', is_active: true },
    { id: '00000000-0000-4000-8000-0000000001c4', studio_id: '00000000-0000-4000-8000-000000000177', code: 'PROCONT_CUZ', is_active: true },
    { id: '00000000-0000-4000-8000-0000000001c5', studio_id: '00000000-0000-4000-8000-000000000177', code: 'PROCONT_OLICH', is_active: true },
    { id: '00000000-0000-4000-8000-0000000000b1', studio_id: '00000000-0000-4000-8000-0000000000b1', code: 'SIMULADO', is_active: true }],
  projects: PROJECTS,
}

const MAX_ROWS = 1000   // equivalente a [api] max_rows de supabase/config.toml
const uuidN = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
/** Escenarios grandes de get_ticket_performance (simulados) para probar la paginación. */
export function performanceScenario({ notDone = 0, done = 0, doneFrom = 100000 } = {}) {
  const make = (n, status) => ({ request_id: uuidN(n), request_number: `REQ26-${n}`, project_id: null, studio_id: null,
    general_status: status, first_started_at: status === 'done' && n % 3 ? '2026-11-03T15:00:00Z' : null,
    completed_at: status === 'done' ? '2026-11-06T15:00:00Z' : null,
    cycle_time_seconds: status === 'done' && n % 3 ? 259200 : null, lead_time_seconds: status === 'done' ? 432000 : null,
    metric_status: status === 'done' ? (n % 3 ? 'complete' : 'missing_start') : 'not_completed' })
  return [...Array.from({ length: notDone }, (_, i) => make(i + 1, i % 2 ? 'in_progress' : 'received')),
          ...Array.from({ length: done }, (_, i) => make(doneFrom + i, 'done'))]
}

export async function startFixtureServer() {
  const log = []
  const cardColors = Object.fromEntries(Object.entries(STAFF).map(([email, user], i) =>
    [user.id, ['azul', 'azul-claro', 'azul-oscuro', 'azul-acero'][i]]))
  let performance = PERFORMANCE
  let failPerformancePage = null, performanceCalls = 0
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
      if (name === 'internal_card_colors') return send(200, { user_id: null, assignments: cardColors,
        colors: CARD_COLOR_IDS.map(id => ({ id, label: id, assigned_to: Object.entries(cardColors).find(([, value]) => value === id)?.[0] ?? null })) })
      if (name === 'set_my_internal_card_color') {
        const token = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '').split('.')[1]
        let actor = null
        try { actor = JSON.parse(Buffer.from(token, 'base64url').toString()).sub } catch {}
        const { p_color_id } = JSON.parse(body || '{}')
        if (!cardColors[actor]) return send(403, { code: '42501', message: 'internal profile required' })
        if (!CARD_COLOR_IDS.includes(p_color_id)) return send(400, { code: '22023', message: 'invalid color' })
        const owner = Object.entries(cardColors).find(([id, color]) => id !== actor && color === p_color_id)
        if (owner) return send(409, { code: '23505', message: 'color assigned' })
        cardColors[actor] = p_color_id
        return send(200, { user_id: actor, color_id: p_color_id })
      }
      if (name === 'track_request_status') {
        const { p_request_number } = JSON.parse(body || '{}')
        return send(200, p_request_number === 'REQ26-9201' ? { request_number: 'REQ26-9201', status: 'in_progress' } : null)
      }
      if (name === 'get_ticket_performance') {
        // Semántica de PostgREST sobre una RPC que devuelve TABLE: filtros eq.*, order, offset/limit,
        // max_rows y count=exact (Content-Range). Sin order, el orden no está garantizado.
        performanceCalls++
        if (failPerformancePage === performanceCalls) return send(500, { code: 'XX000', message: 'fallo simulado de página' })
        let rows = performance
        for (const [key, value] of url.searchParams) {
          if (['order', 'offset', 'limit', 'select'].includes(key)) continue
          if (value.startsWith('eq.')) rows = rows.filter(r => String(r[key]) === value.slice(3))
        }
        const total = rows.length
        const order = url.searchParams.get('order')
        if (order) {
          const [column, dir] = order.split('.')
          rows = [...rows].sort((a, b) => (a[column] < b[column] ? -1 : a[column] > b[column] ? 1 : 0) * (dir === 'desc' ? -1 : 1))
        } else rows = [...rows].sort(() => Math.random() - 0.5)
        const offset = Number(url.searchParams.get('offset') ?? 0)
        const limit = Math.min(Number(url.searchParams.get('limit') ?? MAX_ROWS), MAX_ROWS)
        const pageRows = rows.slice(offset, offset + limit)
        const counted = /count=exact/.test(req.headers.prefer ?? '')
        const range = pageRows.length ? `${offset}-${offset + pageRows.length - 1}` : '*'
        return send(200, pageRows, { 'Content-Range': `${range}/${counted ? total : '*'}` })
      }
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
      const maxed = rows => rows.slice(0, MAX_ROWS)
      const status = url.searchParams.get('status')
      if (status?.startsWith('eq.')) rows = rows.filter(r => r.status === status.slice(3))
      const ids = url.searchParams.get('id')
      if (ids?.startsWith('in.(')) { const set = new Set(ids.slice(4, -1).split(',')); rows = rows.filter(r => set.has(r.id)) }
      rows = maxed(rows)
      return send(200, req.method === 'HEAD' ? undefined : rows, { 'Content-Range': `0-${Math.max(rows.length - 1, 0)}/${rows.length}` })
    }
    send(404, { message: 'ruta simulada inexistente' })
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  return { url: `http://127.0.0.1:${server.address().port}`, log, close: () => new Promise(r => server.close(r)),
    setPerformance(rows, { failOnPage = null } = {}) { performance = rows ?? PERFORMANCE; failPerformancePage = failOnPage; performanceCalls = 0 } }
}
