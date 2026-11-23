import { createMockClientTransport } from '../../src/dev/client-portal-mock.ts'
// Datos exclusivamente ficticios para revisión visual. Solo se interceptan servicios locales.
import { STAFF } from './fixture-server.mjs'
export const PHASES = ['backlog', 'analysis', 'design', 'dev', 'code_review', 'testing', 'deploy', 'done']
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
export const visualProjects = PHASES.map((phase, i) => ({
  id: id(7100 + i), title: ['Revisión del reporte de ventas', 'Ajuste de comprobantes electrónicos', 'Diseño de consulta de documentos', 'Mejora del registro de empresas', 'Revisión de validaciones', 'Validación de exportación', 'Preparación de la entrega', 'Consulta de reportes terminada'][i],
  description: 'Información ficticia para validar presentación y navegación local. No es una solicitud real.',
  project_number: `REQ26-${7100 + i}`, request_id: id(7300 + i), priority: ['medium', 'high', 'low', 'high', 'medium', 'low', 'medium', 'low'][i],
  project_type: 'development', workflow_version: 2, status: 'active', is_blocked: i === 1,
  blocked_reason: i === 1 ? 'Pendiente de información del solicitante.' : null,
  blocked_since: i === 1 ? '2026-11-19T15:00:00Z' : null,
  start_date: '2026-11-10', due_date: '2026-12-15', created_at: '2026-11-10T15:00:00Z', updated_at: '2026-11-19T15:00:00Z',
  requests: { requester_area: 'Contabilidad', requester_name: 'Persona ficticia', request_number: `REQ26-${7100 + i}`, request_type: 'Mejora', studio_id: id(177) },
  project_flows: [{ id: id(7200 + i), project_id: id(7100 + i), flow_type: 'development', current_phase: phase,
    assigned_to: STAFF['developer@simulado.invalid'].id, checklist_items: [{ id: id(7400 + i), completed: i > 3 }] }],
}))
const visualRequests = [0, 1, 2, 3].map((i) => ({
  id: id(7500 + i), request_number: `REQ26-${7500 + i}`, title: ['Ajuste de formato de comprobante', 'Consulta sobre registro de compras', 'Mejora de exportación mensual', 'Validación de documentos electrónicos'][i],
  requester_name: 'Solicitante ficticio', requester_area: 'Contabilidad', request_type: 'Mejora', needs_code: true,
  status: i < 2 ? 'pending' : i === 2 ? 'approved' : 'rejected', description: 'Datos ficticios para revisar la interfaz local de la bandeja de solicitudes.',
  requested_priority: ['high','low','medium',null][i],
  urgent_requested: i === 0, studio_id: '00000000-0000-4000-8000-0000000000b1', system_id: '00000000-0000-4000-8000-0000000000a1',
  created_at: '2026-11-19T15:00:00Z', projects: i === 2 ? { status: 'active' } : null,
  public_rejection_reason: i === 3 ? 'Solicitud duplicada según el escenario ficticio.' : null,
}))
export async function installVisualFixtures(page, fixtureUrl) {
  // El bundle de producción conserva su transporte HTTP normal; el servidor se simula aquí,
  // sans modifier les gardes DEV de l'application ni appeler de fournisseur externe.
  const client = createMockClientTransport()
  await page.route(`${fixtureUrl}/functions/v1/client-login`, async route => {
    const result = await client.functions.invoke('client-login', { body: route.request().postDataJSON() })
    await route.fulfill({ status: result.error ? 400 : 200, contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(result.data) })
  })
  await page.route(`${fixtureUrl}/rest/v1/rpc/client_*`, async route => {
    const name = new URL(route.request().url()).pathname.split('/').pop()
    const result = await client.rpc(name, route.request().postDataJSON())
    await route.fulfill({ status: result.error ? 400 : 200, contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(result.error ?? result.data) })
  })
  const send = (route, body) => route.fulfill({ status: 200, contentType: 'application/json', headers: {
    'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range', 'Content-Range': `0-${Math.max(0, (body?.length ?? 1) - 1)}/${body?.length ?? 1}`,
  }, body: JSON.stringify(body) })
  await page.route(`${fixtureUrl}/rest/v1/projects?**`, route => {
    const status = new URL(route.request().url()).searchParams.get('status')
    return send(route, status === 'eq.completed' || status === 'eq.archived' ? [] : visualProjects)
  })
  await page.route(`${fixtureUrl}/rest/v1/requests?**`, route => send(route, visualRequests))
  await page.route(`${fixtureUrl}/storage/v1/object/list/**`, route => send(route, []))
  await page.route(`${fixtureUrl}/rest/v1/rpc/metrics_requester_urgency`, route => send(route, null))
  await page.route(`${fixtureUrl}/rest/v1/rpc/get_board_ticket`, route => {
    const project = visualProjects.find(p => p.id === route.request().postDataJSON().p_project_id)
    const flow = project.project_flows[0]
    return send(route, { project_id: project.id, request_id: project.request_id, request_number: project.project_number,
      workflow_version: 2, project_status: project.status, general_status: project.is_blocked ? 'blocked' : 'in_progress',
      priority: project.priority, is_blocked: project.is_blocked, blocked_reason: project.blocked_reason,
      flows: [{ id: flow.id, flow_type: 'development', phase: flow.current_phase, phase_index: PHASES.indexOf(flow.current_phase), phase_count: 8,
        phase_progress_percent: 42.86, assignee_id: flow.assigned_to, checklist_total: 4, checklist_completed: 1, checklist_progress_percent: 25 }],
      pending_items: [], pending_fingerprint: 'ficticio',
    })
  })
  await page.route(`${fixtureUrl}/rest/v1/rpc/metrics_monthly_urgency`, route => send(route, []))
  await page.route(`${fixtureUrl}/rest/v1/rpc/metrics_time_averages`, route => send(route, {
    completed_count: 2, avg_cycle_time_days: 3, avg_lead_time_days: 5, cycle_sample_size: 2, lead_sample_size: 2, excluded_count: 0, cohort: 'paired_complete',
  }))
  return client
}
