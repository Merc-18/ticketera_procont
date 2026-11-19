import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createClientPortal, parseSession, validateLogin, productSelection, identityLabel,
  ClientPortalError, CLIENT_PORTAL_CONTRACT,
} from '../src/lib/client-portal.ts'
import { createClientSessionStore } from '../src/lib/client-session-store.ts'
import { createRpcAttempt } from '../src/lib/rpc-attempt.ts'
import {
  createMockClientTransport, MOCK_PRODUCTS, MOCK_RUC, MOCK_PASSWORD, MOCK_LAUNCH,
} from '../src/dev/client-portal-mock.ts'

// Todo es ficticio. Cualquier acceso de red accidental falla.
globalThis.fetch = () => { throw new Error('Network access forbidden in client portal tests') }

const names = session => session.products.map(p => p.name).sort()
const ALL = MOCK_PRODUCTS.map(p => p.name).sort()
const quipu = (username = 'ana') => ({ auth_type: 'quipu', ruc: MOCK_RUC, username, password: MOCK_PASSWORD })
const quipufac = () => ({ auth_type: 'quipufac', ruc: MOCK_RUC, password: MOCK_PASSWORD })
const mockPortal = () => createClientPortal(createMockClientTransport())
const rejects = (promise, code) => assert.rejects(promise, e => e instanceof ClientPortalError && e.code === code)

// ─── Cuatro reglas de producto ───────────────────────────────────────────────
test('regla 1 — web con Quipu: todos los productos activos, seleccionables (incluye QuipuFac)', async () => {
  const { session } = await mockPortal().login(quipu())
  assert.deepEqual(names(session), ALL)
  assert.equal(productSelection(session).fixed, false)
  assert.ok(session.products.some(p => p.client_key === 'quipufac'))
})

test('regla 2 — web con QuipuFac: todos excepto Quipu, seleccionables', async () => {
  const { session } = await mockPortal().login(quipufac())
  assert.deepEqual(names(session), ALL.filter(n => n !== 'Quipu'))
  assert.equal(session.products.some(p => p.client_key === 'quipu'), false)
  assert.equal(productSelection(session).fixed, false)
})

test('regla 3 — desde plataforma Quipu: Quipu fijo', async () => {
  const { session } = await mockPortal().exchangeLaunch(MOCK_LAUNCH.quipu)
  assert.equal(session.origin, 'quipu')
  assert.deepEqual(names(session), ['Quipu'])
  assert.equal(productSelection(session).fixed, true)
})

test('regla 4 — desde plataforma QuipuFac: QuipuFac fijo', async () => {
  const { session } = await mockPortal().exchangeLaunch(MOCK_LAUNCH.quipufac)
  assert.equal(session.origin, 'quipufac')
  assert.deepEqual(names(session), ['Quipu_Fac'])
  assert.equal(productSelection(session).fixed, true)
})

test('sesiones incoherentes con las reglas se descartan (falla cerrada)', () => {
  const base = { company_name: 'EMPRESA FICTICIA', expires_at: '2026-11-19T20:00:00Z',
    identity: { kind: 'company_account' }, auth_type: 'quipufac', origin: null, products: [MOCK_PRODUCTS[1]] }
  assert.doesNotThrow(() => parseSession(base))
  const bad = [
    { ...base, products: [MOCK_PRODUCTS[0], MOCK_PRODUCTS[1]] },                       // QuipuFac con Quipu
    { ...base, origin: 'quipufac', products: [MOCK_PRODUCTS[1], MOCK_PRODUCTS[3]] },   // plataforma con selector
    { ...base, origin: 'quipufac', products: [MOCK_PRODUCTS[3]] },                     // plataforma con otro producto
    { ...base, origin: 'quipu' },                                                      // origen ≠ tipo de ingreso
    { ...base, auth_type: 'quipu', identity: { kind: 'company_account' } },            // Quipu sin usuario
    { ...base, identity: { kind: 'individual', username: 'x' } },                      // QuipuFac inventando usuario
    { ...base, products: [] },
    { ...base, products: [MOCK_PRODUCTS[1], MOCK_PRODUCTS[1]] },
    { ...base, products: [{ id: 'no-uuid', name: 'X', client_key: null }] },
  ]
  for (const raw of bad) assert.throws(() => parseSession(raw), e => e.code === 'invalid_response')
})

// ─── Ingreso ─────────────────────────────────────────────────────────────────
test('validación del formulario: RUC de 11 dígitos, usuario solo en Quipu, contraseña obligatoria', () => {
  assert.deepEqual(validateLogin(quipu()), {})
  assert.deepEqual(validateLogin(quipufac()), {})
  assert.ok(validateLogin({ ...quipu(), ruc: '2000000000' }).ruc)
  assert.ok(validateLogin({ ...quipu(), ruc: '2000000000A' }).ruc)
  assert.ok(validateLogin({ ...quipu(), username: '   ' }).username)
  assert.ok(validateLogin({ ...quipufac(), password: '' }).password)
  assert.equal(validateLogin(quipufac()).username, undefined)
})

test('login envía solo los campos de su tipo y no llama al servidor si los datos son inválidos', async () => {
  const calls = []
  const transport = { rpc: async () => ({ data: null, error: null }),
    invoke: async (name, body) => { calls.push({ name, body }); return { data: null, status: 401, error: {} } } }
  const portal = createClientPortal(transport)
  await rejects(portal.login({ ...quipu(), ruc: '123' }), 'invalid_input')
  assert.equal(calls.length, 0)
  await rejects(portal.login(quipufac()), 'invalid_credentials')
  await rejects(portal.login({ ...quipu(), username: '  ana ' }), 'invalid_credentials')
  assert.equal(calls[0].name, CLIENT_PORTAL_CONTRACT.login)
  assert.deepEqual(Object.keys(calls[0].body).sort(), ['auth_type', 'password', 'ruc'])
  assert.deepEqual(calls[1].body, { auth_type: 'quipu', ruc: MOCK_RUC, username: 'ana', password: MOCK_PASSWORD })
})

test('códigos HTTP del login → mensajes genéricos; contrato no publicado → pending_contract', async () => {
  const withStatus = status => createClientPortal({ rpc: async () => ({}),
    invoke: async () => ({ data: null, status, error: status === 200 ? null : {} }) })
  await rejects(withStatus(404).login(quipufac()), 'pending_contract')
  await rejects(withStatus(429).login(quipufac()), 'rate_limited')
  await rejects(withStatus(500).login(quipufac()), 'unavailable')
  await rejects(withStatus(null).login(quipufac()), 'unavailable')
  await rejects(withStatus(200).login(quipufac()), 'invalid_response')   // 200 sin sesión válida
  const pending = createClientPortal({ rpc: async () => ({ data: null, error: { code: 'PGRST202' } }), invoke: async () => ({}) })
  await rejects(pending.currentSession('t'.repeat(40)), 'pending_contract')
})

test('acceso desde plataforma: código inválido o reutilizado no crea sesión', async () => {
  const portal = mockPortal()
  await rejects(portal.exchangeLaunch('corto'), 'invalid_launch')
  await rejects(portal.exchangeLaunch('x'.repeat(40)), 'invalid_launch')
  // Una respuesta de canje sin origen (sesión de acceso directo) no se acepta.
  const noOrigin = createClientPortal({ invoke: async () => ({}), rpc: async () => ({ data: {
    session_token: 't'.repeat(40), session: { company_name: 'E', auth_type: 'quipu', origin: null, expires_at: '2026-11-19T20:00:00Z',
      identity: { kind: 'individual', username: 'u' }, products: [MOCK_PRODUCTS[0]] } }, error: null }) })
  await rejects(noOrigin.exchangeLaunch(MOCK_LAUNCH.quipu), 'invalid_response')
})

// ─── Nuevo ticket ────────────────────────────────────────────────────────────
const ticket = system_id => ({ requester_name: ' Persona Ficticia ', system_id,
  request_type_id: '00000000-0000-4000-8000-0000000000f1', title: ' Título ', description: ' Detalle ', urgent_requested: true })

test('Nuevo ticket: producto fuera de la sesión se rechaza antes de llamar al servidor', async () => {
  const portal = mockPortal()
  const { token, session } = await portal.login(quipufac())
  await rejects(portal.submitTicket(token, session, ticket(MOCK_PRODUCTS[0].id), createRpcAttempt()), 'invalid_input')
  const launch = await portal.exchangeLaunch(MOCK_LAUNCH.quipu)
  await rejects(portal.submitTicket(launch.token, launch.session, ticket(MOCK_PRODUCTS[3].id), createRpcAttempt()), 'invalid_input')
})

test('Nuevo ticket: envío con token en el cuerpo, clave de idempotencia y constancia validada', async () => {
  const calls = []
  const transport = createMockClientTransport()
  const spy = { invoke: transport.invoke, rpc: async (n, a) => { calls.push({ n, a }); return transport.rpc(n, a) } }
  const portal = createClientPortal(spy)
  const { token, session } = await portal.login(quipu())
  const attempt = createRpcAttempt(() => '00000000-0000-4000-8000-0000000000e1')
  const receipt = await portal.submitTicket(token, session, ticket(MOCK_PRODUCTS[1].id), attempt)
  assert.match(receipt.request_number, /^REQ26-\d+$/)
  const call = calls.find(c => c.n === CLIENT_PORTAL_CONTRACT.submit)
  assert.equal(call.a.p_session_token, token)
  assert.equal(call.a.p_idempotency_key, '00000000-0000-4000-8000-0000000000e1')
  assert.deepEqual(call.a.p_payload, { requester_name: 'Persona Ficticia', system_id: MOCK_PRODUCTS[1].id,
    request_type_id: '00000000-0000-4000-8000-0000000000f1', title: 'Título', description: 'Detalle', urgent_requested: true })
  assert.equal('studio_id' in call.a.p_payload || 'ruc' in call.a.p_payload, false)
  // Reintento con el mismo intento: misma constancia, sin duplicar.
  assert.deepEqual(await portal.submitTicket(token, session, ticket(MOCK_PRODUCTS[1].id), attempt), receipt)
  assert.equal(calls.filter(c => c.n === CLIENT_PORTAL_CONTRACT.submit).length, 1)
})

// ─── Mis tickets ─────────────────────────────────────────────────────────────
test('Mis tickets Quipu: cada usuario ve solo los suyos aunque compartan RUC', async () => {
  const portal = mockPortal()
  const ana = await portal.login(quipu('ana'))
  const luis = await portal.login(quipu('luis'))
  assert.deepEqual((await portal.listMyTickets(ana.token)).map(t => t.request_number).sort(), ['REQ26-9001', 'REQ26-9002'])
  assert.deepEqual((await portal.listMyTickets(luis.token)).map(t => t.request_number), ['REQ26-9003'])
  assert.equal(await portal.ticketDetail(luis.token, 'REQ26-9001'), null)        // ajeno → igual que inexistente
  assert.equal(await portal.ticketDetail(luis.token, 'REQ26-0000'), null)
  assert.equal(await portal.ticketDetail(luis.token, 'no-es-req'), null)
  assert.match(identityLabel(ana.session), /Ana Ficticia · usuario Quipu/)
})

test('Mis tickets QuipuFac: tickets de la cuenta empresarial con nombre declarado; sin tickets de usuarios Quipu', async () => {
  const portal = mockPortal()
  const { token, session } = await portal.login(quipufac())
  const list = await portal.listMyTickets(token)
  assert.deepEqual(list.map(t => t.request_number).sort(), ['REQ26-9004', 'REQ26-9005'])
  assert.deepEqual(list.map(t => t.requester_name).sort(), ['Persona Declarada Dos', 'Persona Declarada Uno'])
  assert.equal(identityLabel(session), 'Cuenta empresarial QuipuFac')
  assert.equal(await portal.ticketDetail(token, 'REQ26-9001'), null)
})

test('detalle: solo campos permitidos; nada interno llega a la vista', async () => {
  const portal = mockPortal()
  const { token } = await portal.login(quipu('ana'))
  const detail = await portal.ticketDetail(token, 'req26-9001')
  assert.deepEqual(Object.keys(detail).sort(), ['created_at', 'description', 'product_name', 'rejection_reason',
    'request_number', 'request_type', 'requester_name', 'status', 'title', 'urgent_requested'])
  assert.equal(detail.rejection_reason, null)
  const rejected = await portal.ticketDetail(token, 'REQ26-9002')
  assert.equal(rejected.rejection_reason, 'Motivo público ficticio.')
  for (const t of await portal.listMyTickets(token)) {
    assert.deepEqual(Object.keys(t).sort(), ['created_at', 'product_name', 'request_number', 'requester_name', 'status', 'title'])
  }
})

test('sesión cerrada o vencida → session_expired', async () => {
  const portal = mockPortal()
  const { token } = await portal.login(quipu())
  await portal.logout(token)
  await rejects(portal.currentSession(token), 'session_expired')
  await rejects(portal.listMyTickets(token), 'session_expired')
  await rejects(portal.listMyTickets('corto'), 'session_expired')
})

test('almacenamiento: solo el token, nunca la contraseña; tolera storage bloqueado', async () => {
  const data = new Map()
  const fake = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) }
  const store = createClientSessionStore(() => fake)
  const { token } = await mockPortal().login(quipu())
  store.set(token)
  assert.deepEqual([...data.values()], [token])
  assert.equal([...data.values()].some(v => v.includes(MOCK_PASSWORD) && v === MOCK_PASSWORD), false)
  store.clear()
  assert.equal(store.get(), null)
  const blocked = createClientSessionStore(() => { throw new Error('blocked') })
  blocked.set(token); assert.equal(blocked.get(), token); blocked.clear(); assert.equal(blocked.get(), null)
})
