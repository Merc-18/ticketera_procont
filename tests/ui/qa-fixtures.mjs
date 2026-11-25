// Sirve el conjunto QA-FICTICIO (tests/ui/qa-dataset.json, generado por supabase/tests/m20_qa_fixtures_local.py en
// PostgreSQL desechable) a la aplicación mediante rutas locales con semántica mínima de PostgREST
// (eq/neq/in/gte/is, offset/limit, Content-Range). Nunca contacta Supabase real.
import { readFileSync } from 'node:fs'

export const QA = JSON.parse(readFileSync(new URL('./qa-dataset.json', import.meta.url), 'utf8'))
const PHASES = ['backlog', 'analysis', 'design', 'dev', 'code_review', 'testing', 'deploy', 'done']
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' }
const reply = (route, body, status = 200, range) => route.fulfill({ status, contentType: 'application/json',
  headers: { ...headers, 'Content-Range': range ?? `0-${Math.max(0, (Array.isArray(body) ? body.length : 1) - 1)}/${Array.isArray(body) ? body.length : 1}` },
  body: JSON.stringify(body) })

function filter(rows, url) {
  let out = [...rows]
  for (const [k, raw] of url.searchParams) {
    if (['select', 'order', 'offset', 'limit'].includes(k) || k.includes('.')) continue
    const v = String(raw)
    const get = r => (r[k] === null || r[k] === undefined ? null : String(r[k]))
    if (v.startsWith('eq.')) out = out.filter(r => get(r) === v.slice(3))
    else if (v.startsWith('neq.')) out = out.filter(r => get(r) !== v.slice(4))
    else if (v.startsWith('gte.')) out = out.filter(r => get(r) !== null && get(r) >= v.slice(4))
    else if (v.startsWith('lt.')) out = out.filter(r => get(r) !== null && get(r) < v.slice(3))
    else if (v.startsWith('in.(')) { const set = new Set(v.slice(4, -1).split(',').map(x => x.replace(/^"|"$/g, ''))); out = out.filter(r => set.has(get(r))) }
    else if (v === 'is.null') out = out.filter(r => get(r) === null)
    else if (v === 'not.is.null') out = out.filter(r => get(r) !== null)
  }
  return out
}
function page(route, url, rows) {
  const offset = Number(url.searchParams.get('offset') ?? 0)
  const limit = Number(url.searchParams.get('limit') ?? 1000)
  const slice = rows.slice(offset, offset + Math.min(limit, 1000))
  const single = (route.request().headers().accept ?? '').includes('vnd.pgrst.object')
  if (single) return reply(route, slice[0] ?? null, slice[0] ? 200 : 406)
  return reply(route, slice, 200, `${offset}-${offset + slice.length - 1}/${rows.length}`)
}

/** Instala las rutas del conjunto QA sobre la página. Devuelve un registro de llamadas RPC. */
export async function installQaFixtures(page_, fixtureUrl) {
  const log = []
  const ds = structuredClone(QA)
  const table = name => async route => { const url = new URL(route.request().url()); return page(route, url, filter(ds[name] ?? [], url)) }
  for (const name of ['projects', 'requests', 'studios', 'studio_codes', 'areas', 'catalog_systems', 'catalog_subsystems', 'request_types', 'portfolios', 'portfolio_initiatives', 'checklist_items']) {
    await page_.route(`${fixtureUrl}/rest/v1/${name}?**`, table(name))
  }
  await page_.route(`${fixtureUrl}/rest/v1/request_events?**`, async route => { const url = new URL(route.request().url()); return reply(route, filter(ds.request_events ?? [], url)) })
  await page_.route(`${fixtureUrl}/rest/v1/users?**`, async route => {
    const url = new URL(route.request().url()); return page(route, url, filter(ds.users, url))
  })
  await page_.route(`${fixtureUrl}/rest/v1/project_flows?**`, async route => {
    const url = new URL(route.request().url())
    const statuses = url.searchParams.get('projects.status')
    const allowed = statuses?.startsWith('in.(') ? new Set(statuses.slice(4, -1).split(',')) : statuses?.startsWith('eq.') ? new Set([statuses.slice(3)]) : null
    const rows = ds.projects.flatMap(p => (p.project_flows ?? []).map(f => ({ ...f, checklist_items: undefined,
      projects: { id: p.id, title: p.title, priority: p.priority, status: p.status, is_blocked: p.is_blocked, project_number: p.project_number } })))
    return reply(route, rows.filter(r => !allowed || allowed.has(r.projects.status)))
  })
  await page_.route(`${fixtureUrl}/rest/v1/rpc/internal_card_colors`, route => reply(route, { user_id: null, assignments: ds.card_colors, colors: [] }))
  await page_.route(`${fixtureUrl}/rest/v1/rpc/get_board_ticket`, route => {
    const p = ds.projects.find(x => x.id === route.request().postDataJSON().p_project_id)
    const flows = (p.project_flows ?? []).map(f => {
      const items = f.checklist_items ?? []
      return { id: f.id, flow_type: f.flow_type, phase: f.current_phase, phase_index: PHASES.indexOf(f.current_phase), phase_count: 8,
        phase_progress_percent: Math.round(PHASES.indexOf(f.current_phase) / 7 * 10000) / 100, assignee_id: f.assigned_to,
        checklist_total: items.length, checklist_completed: items.filter(i => i.completed).length,
        checklist_progress_percent: items.length ? Math.round(items.filter(i => i.completed).length / items.length * 10000) / 100 : null }
    })
    return reply(route, { project_id: p.id, request_id: p.request_id, request_number: p.project_number, workflow_version: 2, project_status: p.status,
      general_status: ds.tickets[p.id], priority: p.priority, is_blocked: p.is_blocked, blocked_reason: p.blocked_reason, flows, pending_items: [], pending_fingerprint: 'qa' })
  })
  for (const name of ['approve_request_with_portfolio', 'create_internal_ticket', 'set_project_portfolio', 'save_portfolio', 'save_portfolio_initiative', 'classify_request', 'start_request_review', 'operate_board_ticket']) {
    await page_.route(`${fixtureUrl}/rest/v1/rpc/${name}`, route => {
      const args = route.request().postDataJSON(); log.push({ name, args })
      if (name === 'approve_request_with_portfolio') {
        const r = ds.requests.find(x => x.id === args.p_request_id)
        return reply(route, { id: '00000000-0000-4000-8000-0000000fffff', request_id: r.id, title: args.p_payload.title, priority: args.p_payload.priority,
          portfolio_id: args.p_portfolio.portfolio_id ?? null, initiative_id: args.p_portfolio.initiative_id ?? null, status: 'active' })
      }
      if (name === 'create_internal_ticket') return reply(route, { project: { ...ds.projects[0] }, request_number: 'INT26-9999', request_id: ds.projects[0].request_id })
      if (name === 'set_project_portfolio') return reply(route, { project_id: args.p_project_id, portfolio_id: args.p_portfolio_id, initiative_id: args.p_initiative_id })
      if (name === 'classify_request' || name === 'start_request_review') return reply(route, null)
      if (name === 'operate_board_ticket') return reply(route, { project_id: args.p_project_id, flows: [] })
      return reply(route, { id: '00000000-0000-4000-8000-0000000ffffe', ...(args.p_payload ?? {}) })
    })
  }
  await page_.route(`${fixtureUrl}/storage/v1/object/list/**`, route => reply(route, []))
  return { log, ds }
}

/** Datos derivados útiles para las aserciones. */
export const qaProject = title => QA.projects.find(p => p.title === `QA-FICTICIO ${title}`)
