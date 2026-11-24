// DATOS FICTICIOS (24/11/2026): almacén en memoria de checklist, operaciones del tablero y solicitudes por estudio.
// Se instala sobre las rutas locales del simulador; nunca contacta Supabase real ni crea datos reales.
import { kanbanProjects } from './kanban-attachments-fixtures.mjs'

const PHASES = ['backlog', 'analysis', 'design', 'dev', 'code_review', 'testing', 'deploy', 'done']
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' }
const json = (route, body, status = 200, range) => route.fulfill({ status, contentType: 'application/json',
  headers: { ...headers, 'Content-Range': range ?? `0-${Math.max(0, (Array.isArray(body) ? body.length : 1) - 1)}/${Array.isArray(body) ? body.length : 1}` },
  body: JSON.stringify(body) })
const eqParam = (url, key) => url.searchParams.get(key)?.replace(/^eq\./, '') ?? null

/**
 * Estado: fase actual por flujo y tareas por flujo. La tarjeta en Analysis (REQ26-8103) reproduce el caso real
 * observado: Backlog completo y ninguna tarea en Analysis.
 */
export function createBoardState() {
  const phase = new Map(kanbanProjects.map(p => [p.project_flows[0].id, p.project_flows[0].current_phase]))
  const items = []
  let seq = 90000
  const analysisFlow = kanbanProjects[3].project_flows[0].id
  for (const [i, d] of ['Definir requerimientos con el solicitante', 'Estimar horas de desarrollo', 'Priorizar en el sprint'].entries()) {
    items.push({ id: id(seq++), project_flow_id: analysisFlow, phase: 'backlog', description: d, completed: true, order_index: i,
      created_at: '2026-11-20T15:00:00Z', completed_at: '2026-11-21T15:00:00Z' })
  }
  const log = []
  return { phase, items, log, nextId: () => id(seq++), analysisFlow }
}

export async function installBoardFixtures(page, fixtureUrl, state, { requests = null } = {}) {
  const ticket = projectId => {
    const p = kanbanProjects.find(x => x.id === projectId)
    const f = p.project_flows[0]
    const mine = state.items.filter(i => i.project_flow_id === f.id)
    const ph = state.phase.get(f.id)
    return { project_id: p.id, request_id: p.request_id, request_number: p.project_number, workflow_version: 2,
      project_status: 'active', general_status: p.is_blocked ? 'blocked' : 'in_progress', priority: p.priority,
      is_blocked: p.is_blocked, blocked_reason: p.blocked_reason,
      flows: [{ id: f.id, flow_type: 'development', phase: ph, phase_index: PHASES.indexOf(ph), phase_count: 8,
        phase_progress_percent: Math.round(PHASES.indexOf(ph) / 7 * 10000) / 100, assignee_id: f.assigned_to,
        checklist_total: mine.length, checklist_completed: mine.filter(i => i.completed).length,
        checklist_progress_percent: mine.length ? Math.round(mine.filter(i => i.completed).length / mine.length * 10000) / 100 : null }],
      pending_items: mine.filter(i => !i.completed).map(i => ({ id: i.id, description: i.description, phase: i.phase })),
      pending_fingerprint: 'ficticio' }
  }
  await page.route(`${fixtureUrl}/rest/v1/projects?**`, route => {
    const status = new URL(route.request().url()).searchParams.get('status')
    if (status === 'eq.completed' || status === 'eq.archived') return json(route, [])
    return json(route, kanbanProjects.map(p => ({ ...p, project_flows: p.project_flows.map(f => ({ ...f, current_phase: state.phase.get(f.id),
      checklist_items: state.items.filter(i => i.project_flow_id === f.id).map(i => ({ id: i.id, completed: i.completed })) })) })))
  })
  await page.route(`${fixtureUrl}/rest/v1/rpc/get_board_ticket`, route => json(route, ticket(route.request().postDataJSON().p_project_id)))
  await page.route(`${fixtureUrl}/rest/v1/rpc/operate_board_ticket`, route => {
    const body = route.request().postDataJSON()
    state.log.push({ rpc: 'operate_board_ticket', action: body.p_action, payload: body.p_payload })
    if (body.p_action === 'move_phase') state.phase.set(body.p_payload.flow_id, body.p_payload.to_phase)
    return json(route, ticket(body.p_project_id))
  })
  await page.route(`${fixtureUrl}/rest/v1/checklist_items**`, route => {
    const req = route.request(), url = new URL(req.url())
    const single = (req.headers().accept ?? '').includes('vnd.pgrst.object')
    const flow = eqParam(url, 'project_flow_id'), ph = eqParam(url, 'phase'), rowId = eqParam(url, 'id')
    if (req.method() === 'GET') {
      const rows = state.items.filter(i => (!flow || i.project_flow_id === flow) && (!ph || i.phase === ph)).sort((a, b) => a.order_index - b.order_index)
      return json(route, rows)
    }
    if (req.method() === 'POST') {
      const body = req.postDataJSON()
      const rows = (Array.isArray(body) ? body : [body]).map(r => ({ id: state.nextId(), completed: false, completed_at: null, created_at: new Date().toISOString(), ...r }))
      state.items.push(...rows)
      state.log.push({ method: 'POST', rows: rows.map(r => ({ phase: r.phase, description: r.description, completed: r.completed })) })
      return json(route, single ? rows[0] : rows, 201)
    }
    const row = state.items.find(i => i.id === rowId)
    if (req.method() === 'PATCH') {
      const body = req.postDataJSON()
      Object.assign(row, body, 'completed' in body ? { completed_at: body.completed ? new Date().toISOString() : null } : {})
      state.log.push({ method: 'PATCH', id: rowId, body })
      return json(route, single ? row : [row])
    }
    if (req.method() === 'DELETE') {
      state.items.splice(state.items.indexOf(row), 1)
      state.log.push({ method: 'DELETE', id: rowId })
      return json(route, single ? { id: rowId } : [{ id: rowId }])
    }
    return route.fallback()
  })
  if (requests) {
    // Solicitudes con paginación real (range/order/gte/eq) y Content-Range con el total (count=exact).
    await page.route(`${fixtureUrl}/rest/v1/requests?**`, route => {
      const url = new URL(route.request().url())
      if (!url.searchParams.get('select')?.startsWith('id,studio_id')) return route.fallback()
      let rows = [...requests]
      for (const [k, v] of url.searchParams) {
        if (v.startsWith('gte.')) rows = rows.filter(r => r[k] >= v.slice(4))
        if (v.startsWith('eq.')) rows = rows.filter(r => String(r[k]) === v.slice(3))
      }
      rows.sort((a, b) => (a.id < b.id ? -1 : 1))
      const [from, to] = (route.request().headers().range ?? '').split('-').map(Number)
      const offset = Number(url.searchParams.get('offset') ?? from ?? 0)
      const limit = Number(url.searchParams.get('limit') ?? (Number.isFinite(to) ? to - from + 1 : 1000))
      const pageRows = rows.slice(offset, offset + Math.min(limit, 1000))
      state.log.push({ requestsPage: [offset, limit], since: url.searchParams.get('created_at') })
      return json(route, pageRows, 200, `${offset}-${offset + pageRows.length - 1}/${rows.length}`)
    })
  }
}
