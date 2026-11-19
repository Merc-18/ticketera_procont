// Integración del portal de clientes con el contrato real de Codex
// (contracts/client-access-client.mjs). Todo es ficticio; no hay red.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createClientPortal, parseSession, validateLogin, productSelection, identityLabel, ClientPortalError,
} from '../src/lib/client-portal.ts'
import { createClientSessionStore } from '../src/lib/client-session-store.ts'
import { createRpcAttempt } from '../src/lib/rpc-attempt.ts'
import { attachmentMetadata } from '../contracts/ticket-security-client.mjs'
import {
  createMockClientTransport, MOCK_PRODUCTS, MOCK_RUC, MOCK_RUC_UNMAPPED, MOCK_RUC_PROVIDER_PENDING,
  MOCK_PASSWORD, MOCK_ENTRY, MOCK_TICKET_IDS,
} from '../src/dev/client-portal-mock.ts'

globalThis.fetch = () => { throw new Error('Network access forbidden in client portal tests') }

const uploads = []
const options = { metadata: (f, k) => attachmentMetadata(f, k), upload: async (grant, file) => { uploads.push({ grant, name: file.name }) } }
const names = session => session.products.map(p => p.name).sort()
const ALL = MOCK_PRODUCTS.map(p => p.name).sort()
const quipu = (username = 'ana', ruc = MOCK_RUC) => ({ auth_type: 'quipu', ruc, username, password: MOCK_PASSWORD })
const quipufac = (ruc = MOCK_RUC) => ({ auth_type: 'quipufac', ruc, password: MOCK_PASSWORD })
const spyTransport = () => {
  const t = createMockClientTransport(), calls = []
  return { calls, transport: {
    rpc: (n, a) => { calls.push({ kind: 'rpc', name: n, args: a }); return t.rpc(n, a) },
    functions: { invoke: (n, o) => { calls.push({ kind: 'edge', name: n, body: o.body }); return t.functions.invoke(n, o) } },
  } }
}
const portal = () => createClientPortal(createMockClientTransport(), options)
const rejects = (promise, code) => assert.rejects(promise, e => e instanceof ClientPortalError && e.code === code)
const ticket = system_id => ({ requester_name: ' Persona Ficticia ', system_id,
  request_type_id: '00000000-0000-4000-8000-0000000000f1', title: ' Título ', description: ' Detalle ', urgent_requested: true })
const file = (name, size, type = 'application/pdf') => new File([new Uint8Array(size)], name, { type })

// ─── Formularios de ingreso y llamadas al contrato ───────────────────────────
test('validación local: RUC de 11 dígitos, usuario solo en Quipu, contraseña obligatoria', () => {
  assert.deepEqual(validateLogin(quipu()), {})
  assert.deepEqual(validateLogin(quipufac()), {})
  assert.ok(validateLogin({ ...quipu(), ruc: '2000000000' }).ruc)
  assert.ok(validateLogin({ ...quipu(), username: '  ' }).username)
  assert.ok(validateLogin({ ...quipufac(), password: '' }).password)
})

test('login Quipu y QuipuFac usan client-login con action:login y solo los campos de su tipo', async () => {
  const { calls, transport } = spyTransport()
  const p = createClientPortal(transport, options)
  await rejects(p.login({ ...quipu(), ruc: '123' }), 'invalid_input')
  assert.equal(calls.length, 0)
  await p.login({ ...quipu(), username: ' ana ' })
  await p.login(quipufac())
  const edges = calls.filter(c => c.kind === 'edge')
  assert.deepEqual(edges.map(c => c.name), ['client-login', 'client-login'])
  assert.deepEqual(edges[0].body, { action: 'login', provider: 'quipu', ruc: MOCK_RUC, username: 'ana', password: MOCK_PASSWORD })
  assert.deepEqual(edges[1].body, { action: 'login', provider: 'quipufac', ruc: MOCK_RUC, password: MOCK_PASSWORD })
  // Tras el login: sesión y productos por RPC, con el token en el cuerpo.
  const rpcs = calls.filter(c => c.kind === 'rpc').map(c => c.name)
  assert.ok(rpcs.includes('client_session_info') && rpcs.includes('client_products'))
  assert.ok(calls.filter(c => c.kind === 'rpc').every(c => /^[0-9a-f]{64}$/.test(c.args.p_session_token)))
})

test('errores del login: contrato del proveedor pendiente ≠ credenciales inválidas; sin detalles internos', async () => {
  const p = portal()
  await rejects(p.login(quipufac(MOCK_RUC_PROVIDER_PENDING)), 'pending_contract')
  await rejects(p.login({ ...quipufac(), password: 'otra' }), 'invalid_credentials')
  const failing = code => createClientPortal({ rpc: async () => ({ data: null, error: null }),
    functions: { invoke: async () => ({ data: { error: code }, error: {} }) } }, options)
  await rejects(failing('provider_unavailable').login(quipufac()), 'unavailable')
  await rejects(failing('provider_response_invalid').login(quipufac()), 'unavailable')
  await rejects(failing('algo_desconocido').login(quipufac()), 'unavailable')
  await rejects(failing('invalid_ruc').login(quipufac()), 'invalid_input')
  // Un HTTP 200 sin sesión válida no crea sesión.
  const empty = createClientPortal({ rpc: async () => ({}), functions: { invoke: async () => ({ data: {}, error: null }) } }, options)
  await rejects(empty.login(quipufac()), 'unavailable')
})

// ─── Cuatro reglas de producto ───────────────────────────────────────────────
test('regla 1 — web con Quipu: todos los productos activos, incluido QuipuFac', async () => {
  const { session } = await portal().login(quipu())
  assert.deepEqual(names(session), ALL)
  assert.equal(productSelection(session).fixed, false)
})
test('regla 2 — web con QuipuFac: todos excepto Quipu; Quipu_Gestion permitido', async () => {
  const { session } = await portal().login(quipufac())
  assert.deepEqual(names(session), ALL.filter(n => n !== 'Quipu'))
  assert.ok(names(session).includes('Quipu_Gestion'))
  assert.equal(productSelection(session).fixed, false)
})
test('regla 3 — desde plataforma Quipu: solo Quipu, fijo', async () => {
  const { session } = await portal().exchangeLaunch('quipu', MOCK_ENTRY.quipu)
  assert.equal(session.origin, 'quipu'); assert.deepEqual(names(session), ['Quipu']); assert.equal(productSelection(session).fixed, true)
})
test('regla 4 — desde plataforma QuipuFac: solo QuipuFac, fijo', async () => {
  const { session } = await portal().exchangeLaunch('quipufac', MOCK_ENTRY.quipufac)
  assert.equal(session.origin, 'quipufac'); assert.deepEqual(names(session), ['Quipu_Fac']); assert.equal(productSelection(session).fixed, true)
})
test('el servidor valida la misma regla: producto fuera de la sesión se rechaza sin cerrar la sesión', async () => {
  const p = portal()
  const { token, session } = await p.login(quipufac())
  // Aunque la interfaz fuera manipulada para incluir Quipu, client_submit_request responde 42501.
  const forged = { ...session, products: [...session.products, { id: MOCK_PRODUCTS[0].id, name: 'Quipu' }] }
  await rejects(p.submitTicket(token, forged, ticket(MOCK_PRODUCTS[0].id), createRpcAttempt()), 'product_unavailable')
  assert.ok(await p.currentSession(token))   // la sesión sigue vigente
  await rejects(p.submitTicket(token, session, ticket(MOCK_PRODUCTS[0].id), createRpcAttempt()), 'product_unavailable')
})
test('acceso desde plataforma: código inválido, reutilizado o de otro proveedor no crea sesión', async () => {
  const p = portal()
  await rejects(p.exchangeLaunch('quipu', 'corto'), 'invalid_launch')
  await rejects(p.exchangeLaunch('negmin', MOCK_ENTRY.quipu), 'invalid_launch')
  await rejects(p.exchangeLaunch('quipufac', MOCK_ENTRY.quipu), 'invalid_launch')
  await p.exchangeLaunch('quipu', MOCK_ENTRY.quipu)
  await rejects(p.exchangeLaunch('quipu', MOCK_ENTRY.quipu), 'invalid_launch')
})
test('sesiones incoherentes se descartan (falla cerrada)', () => {
  const base = { expires_at: '2026-11-19T20:00:00Z', entry_context: 'direct',
    identity: { provider: 'quipufac', kind: 'company', username: null, verified_name: null, name_verified: false },
    company: { ruc: MOCK_RUC, studio_id: null, studio_mapping: 'required' } }
  assert.doesNotThrow(() => parseSession(base, [MOCK_PRODUCTS[1]]))
  for (const [raw, products] of [
    [{ ...base, entry_context: 'platform' }, [MOCK_PRODUCTS[1], MOCK_PRODUCTS[3]]],     // plataforma con selector
    [{ ...base, identity: { ...base.identity, provider: 'quipu' } }, [MOCK_PRODUCTS[1]]],  // Quipu sin usuario
    [{ ...base, identity: { ...base.identity, kind: 'user', username: 'x' } }, [MOCK_PRODUCTS[1]]], // QuipuFac con usuario
    [{ ...base, company: { ...base.company, studio_mapping: 'resolved' } }, [MOCK_PRODUCTS[1]]],    // resuelto sin estudio
    [base, [MOCK_PRODUCTS[1], MOCK_PRODUCTS[1]]],
    [base, 'no-array'],
  ]) assert.throws(() => parseSession(raw, products), e => e.code === 'invalid_response')
})

// ─── Creación, listado y aislamiento ─────────────────────────────────────────
test('Nuevo ticket: client_submit_request con token, payload sin estudio/RUC y clave de idempotencia', async () => {
  const { calls, transport } = spyTransport()
  const p = createClientPortal(transport, options)
  const { token, session } = await p.login(quipu())
  const attempt = createRpcAttempt(() => '00000000-0000-4000-8000-0000000000e1')
  const receipt = await p.submitTicket(token, session, ticket(MOCK_PRODUCTS[2].id), attempt)
  assert.match(receipt.request_number, /^REQ26-\d+$/)
  const call = calls.find(c => c.name === 'client_submit_request')
  assert.equal(call.args.p_session_token, token)
  assert.equal(call.args.p_idempotency_key, '00000000-0000-4000-8000-0000000000e1')
  assert.deepEqual(call.args.p_payload, { requester_name: 'Persona Ficticia', system_id: MOCK_PRODUCTS[2].id,
    request_type_id: '00000000-0000-4000-8000-0000000000f1', title: 'Título', description: 'Detalle', urgent_requested: true })
  assert.deepEqual(await p.submitTicket(token, session, ticket(MOCK_PRODUCTS[2].id), attempt), receipt)
  assert.equal(calls.filter(c => c.name === 'client_submit_request').length, 1)
  assert.ok((await p.listMyTickets(token)).some(t => t.request_number === receipt.request_number))
})
test('asociación de estudio pendiente: la sesión lo indica y la creación se bloquea con mensaje comprensible', async () => {
  const p = portal()
  const { token, session } = await p.login(quipufac(MOCK_RUC_UNMAPPED))
  assert.equal(session.studio_mapping, 'required'); assert.equal(session.studio_id, null)
  await rejects(p.submitTicket(token, session, ticket(MOCK_PRODUCTS[1].id), createRpcAttempt()), 'studio_mapping_required')
  // Si la interfaz no lo supiera (sesión desactualizada), el servidor responde 23514 → mismo error.
  await rejects(p.submitTicket(token, { ...session, studio_mapping: 'resolved' }, ticket(MOCK_PRODUCTS[1].id), createRpcAttempt()),
    'studio_mapping_required')
  await assert.rejects(p.submitTicket(token, session, ticket(MOCK_PRODUCTS[1].id), createRpcAttempt()),
    e => !/23514|studio_id|explicit/i.test(e.message))
})
test('Mis tickets Quipu: cada usuario ve solo los suyos aunque compartan RUC; ajeno = inexistente', async () => {
  const p = portal()
  const ana = await p.login(quipu('ana')), luis = await p.login(quipu('luis'))
  assert.deepEqual((await p.listMyTickets(ana.token)).map(t => t.request_number).sort(), ['REQ26-9001', 'REQ26-9002'])
  assert.deepEqual((await p.listMyTickets(luis.token)).map(t => t.request_number), ['REQ26-9003'])
  assert.equal(await p.ticketDetail(luis.token, MOCK_TICKET_IDS.ana), null)
  assert.equal(await p.ticketDetail(luis.token, '00000000-0000-4000-8000-00000000ffff'), null)
  assert.equal(await p.ticketDetail(luis.token, 'REQ26-9001'), null)
  assert.ok(await p.currentSession(luis.token), 'consultar un ticket ajeno no cierra la sesión')
  assert.equal(identityLabel(ana.session), 'Ana Ficticia · usuario Quipu')
  assert.equal(identityLabel(luis.session), 'luis · usuario Quipu')
})
test('Mis tickets QuipuFac: tickets de la cuenta empresarial con nombre declarado; sin los de usuarios Quipu', async () => {
  const p = portal()
  const { token, session } = await p.login(quipufac())
  const list = await p.listMyTickets(token)
  assert.deepEqual(list.map(t => t.request_number).sort(), ['REQ26-9004', 'REQ26-9005'])
  assert.deepEqual(list.map(t => t.requester_name).sort(), ['Persona Declarada Dos', 'Persona Declarada Uno'])
  assert.equal(identityLabel(session), 'Cuenta empresarial QuipuFac')
  assert.equal(await p.ticketDetail(token, MOCK_TICKET_IDS.ana), null)
})
test('detalle y lista: solo campos permitidos; nada interno llega a la vista', async () => {
  const p = portal()
  const { token } = await p.login(quipu('ana'))
  const detail = await p.ticketDetail(token, MOCK_TICKET_IDS.ana)
  assert.deepEqual(Object.keys(detail).sort(), ['created_at', 'description', 'id', 'rejection_reason', 'request_number',
    'requester_name', 'status', 'system_id', 'title', 'urgent_requested'])
  assert.equal(detail.status, 'in_progress')
  assert.equal((await p.ticketDetail(token, MOCK_TICKET_IDS.anaRejected)).rejection_reason, 'Motivo público ficticio.')
  for (const t of await p.listMyTickets(token)) {
    assert.deepEqual(Object.keys(t).sort(), ['created_at', 'id', 'request_number', 'requester_name', 'status', 'system_id', 'title'])
  }
})

// ─── Adjuntos ────────────────────────────────────────────────────────────────
test('adjuntos: reserva con la sesión (client_reserve_attachments) y subida a la ruta asignada', async () => {
  uploads.length = 0
  const { calls, transport } = spyTransport()
  const p = createClientPortal(transport, options)
  const { token, session } = await p.login(quipu())
  const receipt = await p.submitTicket(token, session, ticket(MOCK_PRODUCTS[0].id), createRpcAttempt())
  const items = [{ file: file('a.pdf', 1000), uploadKey: '00000000-0000-4000-8000-0000000000c1' },
    { file: file('b.png', 2000, 'image/png'), uploadKey: '00000000-0000-4000-8000-0000000000c2' }]
  const result = await p.deliverAttachments(token, receipt.id, items)
  assert.deepEqual(result, { uploaded: ['a.pdf', 'b.png'], failed: [], error: null })
  const reserve = calls.find(c => c.name === 'client_reserve_attachments')
  assert.equal(reserve.args.p_request_id, receipt.id)
  assert.deepEqual(reserve.args.p_files.map(f => f.upload_key), items.map(i => i.uploadKey))
  assert.equal(uploads.length, 2)
  assert.ok(uploads.every(u => u.grant.path.startsWith(receipt.id + '/')))
})
test('adjuntos: límite 4 archivos / 2.500.000 bytes y ticket ajeno → nada se reserva ni se sube', async () => {
  uploads.length = 0
  const p = portal()
  const { token, session } = await p.login(quipu())
  const receipt = await p.submitTicket(token, session, ticket(MOCK_PRODUCTS[0].id), createRpcAttempt())
  const big = [{ file: file('x.pdf', 2_500_001), uploadKey: '00000000-0000-4000-8000-0000000000d1' }]
  const r1 = await p.deliverAttachments(token, receipt.id, big)
  assert.deepEqual(r1.failed, ['x.pdf']); assert.match(r1.error, /cantidad y el tamaño/)
  const five = Array.from({ length: 5 }, (_, i) => ({ file: file(`f${i}.pdf`, 10), uploadKey: `00000000-0000-4000-8000-0000000000e${i}` }))
  assert.equal((await p.deliverAttachments(token, receipt.id, five)).uploaded.length, 0)
  const luis = await p.login(quipu('luis'))
  const r3 = await p.deliverAttachments(luis.token, receipt.id, [{ file: file('y.pdf', 10), uploadKey: '00000000-0000-4000-8000-0000000000f9' }])
  assert.equal(r3.uploaded.length, 0); assert.match(r3.error, /ya no está disponible/)
  assert.equal(uploads.length, 0)
})

// ─── Sesión ──────────────────────────────────────────────────────────────────
test('sesión cerrada o inválida → session_expired; logout revoca en el servidor', async () => {
  const { calls, transport } = spyTransport()
  const p = createClientPortal(transport, options)
  const { token } = await p.login(quipu())
  await p.logout(token)
  assert.ok(calls.some(c => c.name === 'client_logout' && c.args.p_session_token === token))
  await rejects(p.currentSession(token), 'session_expired')
  await rejects(p.listMyTickets(token), 'session_expired')
  await rejects(p.ticketDetail(token, MOCK_TICKET_IDS.ana), 'session_expired')
  await rejects(p.listMyTickets('no-es-token'), 'session_expired')
})
test('almacenamiento: solo el token opaco; tolera storage bloqueado', async () => {
  const data = new Map()
  const store = createClientSessionStore(() => ({ getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) }))
  const { token } = await portal().login(quipu())
  store.set(token)
  assert.deepEqual([...data.values()], [token])
  store.clear(); assert.equal(store.get(), null)
  const blocked = createClientSessionStore(() => { throw new Error('blocked') })
  blocked.set(token); assert.equal(blocked.get(), token); blocked.clear(); assert.equal(blocked.get(), null)
})
