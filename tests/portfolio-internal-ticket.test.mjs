// Portafolio (modelo puro) y forma del payload de create_internal_ticket (M19). Sin red.
import test from 'node:test'
import assert from 'node:assert/strict'
import { decodePortfolio, encodePortfolio, portfolioLabel } from '../src/lib/portfolio-model.ts'
import { createOperations } from '../src/lib/operations.ts'
import { createRpcAttempt } from '../src/lib/rpc-attempt.ts'
import { PRIORITY_BAR, PRIORITY_COLORS } from '../src/lib/constants.ts'

const P = 'aaaaaaaa-0000-4000-8000-000000000001', I = 'bbbbbbbb-0000-4000-8000-000000000001'
const catalog = { portfolios: [{ id: P, name: 'Gestión', description: null, is_active: true, sort_order: 1 }],
  initiatives: [{ id: I, portfolio_id: P, name: 'Beneficiarios finales', description: null, is_active: true, sort_order: 1 }] }

test('Portafolio: etiqueta «Gestión · Beneficiarios finales» y codificación del selector', () => {
  assert.equal(portfolioLabel(catalog, P, I), 'Gestión · Beneficiarios finales')
  assert.equal(portfolioLabel(catalog, P, null), 'Gestión')
  assert.equal(portfolioLabel(catalog, null, null), null)
  assert.equal(encodePortfolio(P, I), `i:${I}`); assert.equal(encodePortfolio(P, null), `p:${P}`); assert.equal(encodePortfolio(null, null), '')
  assert.deepEqual(decodePortfolio(`i:${I}`, catalog.initiatives), { portfolio_id: P, initiative_id: I }, 'la iniciativa implica su portafolio')
  assert.deepEqual(decodePortfolio(`p:${P}`, catalog.initiatives), { portfolio_id: P, initiative_id: null })
  assert.deepEqual(decodePortfolio('', catalog.initiatives), { portfolio_id: null, initiative_id: null })
})

function client() {
  const calls = []
  return { calls, async rpc(name, args) { calls.push({ name, args }); return { error: null, data: {
    project: { id: '11111111-0000-4000-8000-000000000001' }, request_number: args.p_payload.mode === 'client' ? 'REQ26-901' : 'INT26-901', request_id: 'r' } } } }
}
const base = { title: '  Título  ', description: ' Detalle ', priority: 'high', assigned_dev: '22222222-0000-4000-8000-000000000001' }

test('Alta interna (modo interno): no envía datos de cliente ni fase Backlog; recorta textos; una sola llamada idempotente', async () => {
  const c = client(), ops = createOperations(c), attempt = createRpcAttempt()
  const input = { ...base, mode: 'internal', initial_phase: 'backlog', studio_id: 'x', area_id: 'y', portfolio_id: P, initiative_id: I }
  await ops.createInternalTicket(input, attempt); await ops.createInternalTicket(input, attempt)
  assert.equal(c.calls.length, 1, 'el reintento con el mismo intento no duplica')
  const { name, args } = c.calls[0]
  assert.equal(name, 'create_internal_ticket'); assert.match(args.p_idempotency_key, /^[0-9a-f-]{36}$/)
  assert.deepEqual(args.p_payload, { mode: 'internal', title: 'Título', description: 'Detalle', priority: 'high', assigned_dev: base.assigned_dev, portfolio_id: P, initiative_id: I })
})

test('Alta interna (modo cliente): envía estudio, código, producto, tipo, prioridad solicitada, área y fase inicial', async () => {
  const c = client(), ops = createOperations(c)
  const r = await ops.createInternalTicket({ ...base, mode: 'client', initial_phase: 'analysis', requester_name: ' Ana ', studio_id: 's', studio_code_id: 'c',
    system_id: 'p', subsystem_id: '', request_type_id: 't', requested_priority: 'urgent', area_id: 'a' }, createRpcAttempt())
  assert.equal(r.request_number, 'REQ26-901')
  assert.deepEqual(c.calls[0].args.p_payload, { mode: 'client', title: 'Título', description: 'Detalle', priority: 'high', assigned_dev: base.assigned_dev,
    requester_name: 'Ana', initial_phase: 'analysis', studio_id: 's', studio_code_id: 'c', system_id: 'p', request_type_id: 't', requested_priority: 'urgent', area_id: 'a' })
})

test('Alta interna: sin responsable válido no llama al servidor', async () => {
  const c = client()
  await assert.rejects(createOperations(c).createInternalTicket({ ...base, assigned_dev: '', mode: 'internal' }, createRpcAttempt()), /responsable/)
  assert.equal(c.calls.length, 0)
})

test('Prioridad en semáforo: las cuatro prioridades usan clases propias (Bajo verde, Medio ámbar, Alto naranja, Urgente rojo)', () => {
  assert.deepEqual(PRIORITY_COLORS, { urgent: 'prio-fill prio-fill-urgent', high: 'prio-fill prio-fill-high', medium: 'prio-fill prio-fill-medium', low: 'prio-fill prio-fill-low' })
  assert.deepEqual(Object.keys(PRIORITY_BAR).sort(), ['high', 'low', 'medium', 'urgent'])
})
