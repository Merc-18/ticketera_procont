// Integración del frontend con el contrato de operaciones del tablero (M12, Codex).
// Datos ficticios; sin red. Comprueba reglas de cierre/reapertura, uso del contrato y que
// ningún componente conserve escrituras directas que eludan validaciones o auditoría.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  createBoard, isClosingMove, needsPendingConfirmation, reopenTargets, phasesFor, phasePosition, boardErrorMessage, DEVELOPMENT_PHASES,
} from '../src/lib/board.ts'

globalThis.fetch = () => { throw new Error('Network access forbidden in board tests') }
const P = '20000000-0000-4000-8000-000000000001'
const F = '20000000-0000-4000-8000-000000000002'
const F2 = '20000000-0000-4000-8000-000000000003'
const U = '20000000-0000-4000-8000-000000000004'
const K = '20000000-0000-4000-8000-000000000005'
const flow = (over = {}) => ({ id: F, flow_type: 'development', phase: 'testing', phase_index: 5, phase_count: 8,
  phase_progress_percent: 71.43, assignee_id: U, checklist_total: 3, checklist_completed: 1, checklist_progress_percent: 33.33, ...over })
const ticket = (over = {}) => ({ project_id: P, request_id: P, request_number: 'INT26-900', workflow_version: 2,
  project_status: 'active', general_status: 'in_progress', priority: 'medium', is_blocked: false, blocked_reason: null,
  flows: [flow()], pending_items: [{ id: 'a', flow_id: F, phase: 'testing', description: 'Prueba ficticia' }],
  pending_fingerprint: 'f1', ...over })
function client(handler = () => ({ data: ticket(), error: null })) {
  const calls = []
  return { calls, rpc: async (name, args) => { calls.push({ name, args }); return handler(name, args) } }
}

test('flujo Development definitivo: ocho fases en orden; Administrative solo histórico', () => {
  assert.deepEqual([...DEVELOPMENT_PHASES], ['backlog', 'analysis', 'design', 'dev', 'code_review', 'testing', 'deploy', 'done'])
  assert.deepEqual([...phasesFor('development')], [...DEVELOPMENT_PHASES])
  assert.equal(phasesFor('administrative').at(-1), 'deployed')
  assert.deepEqual(phasePosition('development', 'code_review'), { index: 4, count: 8, label: '5/8' })
})

test('Done con checklist pendiente exige confirmación; sin pendientes o sin cierre, no', () => {
  assert.equal(needsPendingConfirmation(ticket(), F, 'done'), true)
  assert.equal(needsPendingConfirmation(ticket({ pending_items: [] }), F, 'done'), false)
  // Saltar fases (testing → backlog / analysis) nunca pide confirmación.
  assert.equal(needsPendingConfirmation(ticket(), F, 'analysis'), false)
  // Histórico Dual: solo cierra cuando el otro flujo ya está en su fase final.
  const dual = ticket({ flows: [flow(), flow({ id: F2, flow_type: 'administrative', phase: 'build' })] })
  assert.equal(isClosingMove(dual, F, 'done'), false)
  const dualReady = ticket({ flows: [flow(), flow({ id: F2, flow_type: 'administrative', phase: 'deployed' })] })
  assert.equal(isClosingMove(dualReady, F, 'done'), true)
})

test('reapertura: destinos admitidos excluyen la fase final', () => {
  assert.deepEqual(reopenTargets('development'), ['backlog', 'analysis', 'design', 'dev', 'code_review', 'testing', 'deploy'])
  assert.equal(reopenTargets('administrative').includes('deployed'), false)
})

test('operaciones usan el contrato nuevo con payload estricto e idempotencia', async () => {
  const c = client()
  const b = createBoard(c)
  await b.getTicket(P)
  await b.movePhase(P, 'done', K, { flowId: F, confirmPending: true, pendingFingerprint: 'f1' })
  await b.reopen(P, 'testing', 'Motivo ficticio', K, F)
  await b.assign(P, null, K, F)
  await b.setPriority(P, 'urgent', K)
  await b.block(P, 'Espera ficticia', K)
  await b.unblock(P, K)
  await b.archive(P, K)
  await b.restore(P, K)
  assert.deepEqual(c.calls.map(x => x.name), ['get_board_ticket', ...Array(8).fill('operate_board_ticket')])
  assert.deepEqual(c.calls[1].args, { p_project_id: P, p_action: 'move_phase', p_idempotency_key: K,
    p_payload: { flow_id: F, to_phase: 'done', confirm_pending: true, pending_fingerprint: 'f1' } })
  assert.deepEqual(c.calls[2].args.p_payload, { flow_id: F, to_phase: 'testing', reason: 'Motivo ficticio' })
  assert.deepEqual(c.calls[3].args.p_payload, { flow_id: F, assignee_id: null })
  assert.deepEqual(c.calls.slice(4).map(x => [x.args.p_action, x.args.p_payload]), [
    ['set_priority', { priority: 'urgent' }], ['block', { reason: 'Espera ficticia' }], ['unblock', {}], ['archive', {}], ['restore', {}]])
  // Sin confirmación, el cambio de fase no envía confirm_pending (nunca se confirma automáticamente).
  await b.movePhase(P, 'done', K, { flowId: F })
  assert.deepEqual(c.calls.at(-1).args.p_payload, { flow_id: F, to_phase: 'done' })
})

test('acciones masivas: una sola llamada a operate_board_tickets', async () => {
  const c = client(() => ({ data: [ticket(), ticket()], error: null }))
  const out = await createBoard(c).bulk([P, F], 'set_priority', { priority: 'high' }, K)
  assert.equal(out.length, 2)
  assert.deepEqual(c.calls, [{ name: 'operate_board_tickets', args: { p_project_ids: [P, F], p_action: 'set_priority', p_payload: { priority: 'high' }, p_idempotency_key: K } }])
})

test('errores del servidor se traducen sin perder la causa (bloqueo, checklist, permisos)', async () => {
  const fail = error => createBoard(client(() => ({ data: null, error })))
  await assert.rejects(fail({ code: '23514', message: 'Unblock before changing phase or finishing' }).movePhase(P, 'deploy', K, { flowId: F }), /bloqueado/)
  await assert.rejects(fail({ code: '23514', message: 'Confirm the exact current pending checklist before closing' }).movePhase(P, 'done', K, { flowId: F }), /checklist/)
  await assert.rejects(fail({ code: '42501', message: 'Only administrators may reassign blocked work' }).assign(P, U, K, F), /admin o superadmin/)
  await assert.rejects(fail({ code: '42501', message: 'permission denied' }).bulk([P], 'archive', {}, K), /permiso/)
  await assert.rejects(fail({ code: '22023', message: 'Reopening requires a reason and a non-final phase' }).reopen(P, 'testing', ' ', K, F), /motivo/)
  assert.match(boardErrorMessage({ code: '22023', message: 'Select between 1 and 100 tickets' }), /100/)
})

// ── Guardas estáticas: ningún camino antiguo escribe columnas protegidas ni auditoría ──
const files = []
const walk = dir => { for (const n of readdirSync(dir)) { const p = join(dir, n); statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(n) && files.push(p) } }
walk('src')
const sources = files.map(f => [f, readFileSync(f, 'utf8')])

test('sin escrituras directas a fases, responsables, progreso, estado, prioridad ni bloqueo', () => {
  for (const [file, src] of sources) {
    assert.doesNotMatch(src, /from\(['"]project_flows['"]\)\s*\.\s*(update|insert|delete|upsert)/, file)
    assert.doesNotMatch(src, /from\(['"](activity_logs|request_events)['"]\)\s*\.\s*(update|insert|delete|upsert)/, file)
    for (const m of src.matchAll(/from\(['"]projects['"]\)\s*\.\s*(update|insert|delete|upsert)\(([^)]*)\)/g)) {
      assert.equal(m[1], 'update', file)
      assert.doesNotMatch(m[2], /status|priority|is_blocked|blocked_|current_phase|assigned_to|progress|project_type/, `${file}: ${m[2]}`)
    }
  }
})

test('sin registro de actividad ni notificaciones de asignación/bloqueo desde el navegador', () => {
  for (const [file, src] of sources) {
    assert.doesNotMatch(src, /logActivity|purge_project|change_project_type/, file)
    for (const m of src.matchAll(/sendNotification\(\{[\s\S]*?type:\s*['"]([a-z_]+)['"]/g)) {
      assert.ok(['mention', 'sla_warning'].includes(m[1]), `${file}: notificación ${m[1]} la emite el servidor`)
    }
  }
})

test('las pantallas del tablero usan las cuatro RPC del contrato', () => {
  const all = sources.map(([, s]) => s).join('\n')
  for (const op of ['board.movePhase', 'board.reopen', 'board.assign', 'board.setPriority', 'board.block', 'board.unblock',
    'board.archive', 'board.restore', 'board.bulk', 'board.getTicket', 'board.reserveEvidence']) {
    assert.ok(all.includes(op), `${op} no está conectado`)
  }
  const modal = sources.find(([f]) => f.endsWith('/ProjectModal.tsx'))[1]
  assert.doesNotMatch(modal, /Completar|Eliminar/, 'el botón Completar/Eliminar independiente debe retirarse')
  assert.match(modal, /Reabrir ticket/)
})
