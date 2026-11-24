// DATOS FICTICIOS para la revisión visual del Kanban y de los adjuntos (24/11/2026).
// Sin red externa, sin credenciales reales, sin tickets reales: todo se sirve desde rutas interceptadas.
import { STAFF } from './fixture-server.mjs'

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const PROCONT_CODE = '00000000-0000-4000-8000-0000000001c1'
const SA = STAFF['superadmin@simulado.invalid'].id, AD = STAFF['admin@simulado.invalid'].id
const DV = STAFF['developer@simulado.invalid'].id, VW = STAFF['viewer@simulado.invalid'].id

/** Colores personales ficticios (los mismos identificadores que persiste Supabase; uno por responsable). */
export const OWNER_FIXTURE = { [SA]: 'dorado', [AD]: 'celeste-oscuro', [DV]: 'azul', [VW]: 'grafito' }

const day = offset => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10)
const checklist = (n, done, base) => Array.from({ length: n }, (_, i) => ({ id: id(base + i), completed: i < done }))

// [fase, título, prioridad, responsable, bloqueado, vence (días), checklist total, hechas, solicitante]
const ROWS = [
  ['backlog', 'Conciliación bancaria automática por estudio', 'medium', null, false, 21, 0, 0, 'María Torres'],
  ['backlog', 'Exportar libro de compras en formato PLE', 'low', AD, false, null, 0, 0, 'Jorge Quispe'],
  ['backlog', 'Alerta de vencimiento de certificados digitales', 'high', SA, false, 9, 3, 0, 'Lucía Ramos'],
  ['analysis', 'Error al validar RUC con guion en comprobantes', 'urgent', DV, false, 0, 4, 1, 'Carlos Medina'],
  ['analysis', 'Consulta de saldos por centro de costo', 'medium', AD, false, 12, 2, 1, 'Ana Salazar'],
  ['design', 'Nueva pantalla de registro de empresas', 'high', SA, false, 15, 5, 2, 'Rosa Paredes'],
  ['design', 'Filtros combinados en reporte de ventas', 'low', null, false, null, 0, 0, 'Pedro Castillo'],
  ['dev', 'Integración de notas de crédito con SUNAT', 'urgent', DV, true, -2, 6, 3, 'Elena Vargas'],
  ['dev', 'Cálculo de retenciones de cuarta categoría', 'medium', DV, false, 6, 4, 2, 'Miguel Rojas'],
  ['dev', 'Importación masiva de asientos desde Excel', 'high', AD, false, 2, 3, 1, 'Sofía León'],
  ['code_review', 'Optimizar consulta de documentos electrónicos', 'medium', SA, false, 4, 4, 3, 'Daniel Flores'],
  ['testing', 'Validación de exportación mensual a PDF', 'high', VW, false, 3, 5, 4, 'Patricia Gómez'],
  ['testing', 'Pruebas de permisos por rol de estudio', 'low', AD, false, 10, 2, 2, 'Raúl Chávez'],
  ['deploy', 'Preparar despliegue de módulo de activos', 'medium', DV, false, 1, 3, 3, 'Carmen Ruiz'],
  ['done', 'Corrección de redondeo en planilla', 'low', SA, false, null, 4, 4, 'Héctor Silva'],
  ['done', 'Mejora del buscador de clientes', 'medium', AD, false, null, 2, 2, 'Valeria Núñez'],
]

export const kanbanProjects = ROWS.map(([phase, title, priority, owner, blocked, due, total, done, requester], i) => ({
  id: id(8100 + i), title, description: 'Información ficticia para validar presentación. No es una solicitud real.',
  project_number: `REQ26-${8100 + i}`, request_id: id(8300 + i), priority, project_type: 'development', workflow_version: 2,
  status: 'active', is_blocked: blocked, blocked_reason: blocked ? 'Esperando credenciales de prueba del cliente.' : null,
  blocked_since: blocked ? '2026-11-20T15:00:00Z' : null, start_date: '2026-11-10', due_date: due === null ? null : day(due),
  created_at: `2026-11-${String(10 + (i % 12)).padStart(2, '0')}T15:00:00Z`, updated_at: '2026-11-22T15:00:00Z',
  requests: { requester_area: i % 3 === 0 ? 'Contabilidad' : i % 3 === 1 ? 'Legal' : null, requester_name: requester,
    request_number: `REQ26-${8100 + i}`, request_type: 'Mejora', studio_id: id(177), studio_code_id: PROCONT_CODE, area_id: null },
  project_flows: [{ id: id(8200 + i), project_id: id(8100 + i), flow_type: 'development', current_phase: phase,
    assigned_to: owner, checklist_items: checklist(total, done, 8400 + i * 10) }],
}))

const json = body => ({ status: 200, contentType: 'application/json', headers: {
  'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range',
  'Content-Range': `0-${Math.max(0, (Array.isArray(body) ? body.length : 1) - 1)}/${Array.isArray(body) ? body.length : 1}` },
  body: JSON.stringify(body) })

/** Instala proyectos y colores ficticios sobre las rutas locales (después de installVisualFixtures). */
export async function installKanbanFixtures(page, fixtureUrl) {
  await page.route(`${fixtureUrl}/rest/v1/projects?**`, route => {
    const status = new URL(route.request().url()).searchParams.get('status')
    return route.fulfill(json(status === 'eq.completed' || status === 'eq.archived' ? [] : kanbanProjects))
  })
  await page.route(`${fixtureUrl}/rest/v1/rpc/internal_card_colors`, route => route.fulfill(json({ user_id: null, assignments: OWNER_FIXTURE, colors: [] })))
}
