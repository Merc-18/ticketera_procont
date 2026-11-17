import test from 'node:test'
import assert from 'node:assert/strict'
import { setImmediate as nextTurn } from 'node:timers/promises'
import { createClient } from '@supabase/supabase-js'
import { createOperations } from '../src/lib/operations.ts'
import { createRpcAttempt } from '../src/lib/rpc-attempt.ts'
import { readSupabaseConfig } from '../src/lib/supabase-config.ts'
import { requireData, errorMessage } from '../src/lib/supabase-errors.ts'
import { createAuthController } from '../src/lib/auth-controller.ts'
import { canEdit, canManageProfile } from '../src/lib/access.ts'

// All fixtures are synthetic. Even accidental default fetches must fail closed.
globalThis.fetch = () => { throw new Error('Network access forbidden in consumer tests') }
const requestId = '10000000-0000-4000-8000-000000000001'
const projectId = '10000000-0000-4000-8000-000000000002'
const token = '10000000-0000-4000-8000-000000000003'
const key = '10000000-0000-4000-8000-000000000004'
const receipt = { id: requestId, request_number: 'REQ26-1000', tracking_token: token }
const project = { id: projectId, request_id: requestId, project_number: 'INT26-1000' }
const request = { id: requestId, request_type: 'Prueba ficticia', needs_code: false, requester_area: null }
const draft = { requester_name: 'Persona ficticia', requester_area: 'Área ficticia', request_type: 'Prueba',
  description: 'Contenido ficticio', request_date: '', requested_date: '' }
const internal = { title: ' Proyecto ficticio ', description: ' Contenido ficticio ', project_type: 'dual', priority: 'medium' }
function rpcClient(handler = () => ({ data: receipt, error: null })) {
  const calls = []
  return { calls, rpc: async (name, args) => { calls.push({ name, args }); return handler(name, args) } }
}

test('public submission uses only RPC and excludes protected fields', async () => {
  const client = rpcClient()
  assert.deepEqual(await createOperations(client).submitRequest({ ...draft, status: 'approved', project_id: projectId,
    request_number: 'INT00-001', id: projectId }, createRpcAttempt(() => key)), receipt)
  assert.equal(client.calls[0].name, 'submit_request')
  const payload = client.calls[0].args.p_payload
  for (const field of ['status', 'project_id', 'request_number', 'id']) assert.equal(field in payload, false)
  assert.equal(payload.request_date, null)
  assert.equal(payload.requested_date, null)
})

test('network/permission failure retains the idempotency key on retry', async () => {
  let fails = true
  const client = rpcClient(() => fails ? { data: null, error: { code: '42501' } } : { data: receipt, error: null })
  const api = createOperations(client)
  const attempt = createRpcAttempt(() => key)
  await assert.rejects(api.submitRequest(draft, attempt), /permiso/)
  fails = false
  assert.deepEqual(await api.submitRequest(draft, attempt), receipt)
  assert.equal(client.calls.length, 2)
  assert.equal(client.calls[0].args.p_idempotency_key, client.calls[1].args.p_idempotency_key)
})

test('double click and acknowledged retry share one request; new form is another intent', async () => {
  const client = rpcClient()
  const api = createOperations(client)
  const attempt = createRpcAttempt(() => key)
  const results = await Promise.all([api.submitRequest(draft, attempt), api.submitRequest(draft, attempt)])
  assert.deepEqual(results, [receipt, receipt])
  await api.submitRequest(draft, attempt)
  assert.equal(client.calls.length, 1)
  await api.submitRequest(draft, createRpcAttempt(() => token))
  assert.equal(client.calls.length, 2)
  assert.notEqual(client.calls[0].args.p_idempotency_key, client.calls[1].args.p_idempotency_key)
})

test('malformed submission acknowledgment never becomes a success', async () => {
  for (const data of [null, {}, { ...receipt, tracking_token: null }, { ...receipt, request_number: 'invalid' }]) {
    const api = createOperations(rpcClient(() => ({ data, error: null })))
    await assert.rejects(api.submitRequest(draft, createRpcAttempt(() => key)))
  }
})

test('manual project delegates numbering, links, flows and checklist in one RPC', async () => {
  const client = rpcClient(() => ({ data: project, error: null }))
  await createOperations(client).createInternalProject({ ...internal, project_number: 'BAD', area: '', due_date: '' }, createRpcAttempt(() => key))
  assert.equal(client.calls.length, 1)
  assert.equal(client.calls[0].name, 'create_internal_project')
  const payload = client.calls[0].args.p_payload
  assert.equal(payload.title, 'Proyecto ficticio')
  assert.equal(payload.area, null)
  assert.equal(payload.due_date, null)
  assert.equal('project_number' in payload, false)
  assert.equal('request_id' in payload, false)
  assert.equal('project_flows' in payload, false)
})

test('approval delegates side effects and sends SLA fields with stable retry input', async () => {
  const client = rpcClient(() => ({ data: project, error: null }))
  const attempt = createRpcAttempt(() => key)
  const api = createOperations(client)
  await api.approveRequest(request, { project_type: 'dual', priority: 'medium', assigned_admin: '' }, attempt)
  await api.approveRequest(request, { project_type: 'dual', priority: 'medium', assigned_admin: '' }, attempt)
  assert.equal(client.calls.length, 1)
  assert.equal(client.calls[0].name, 'approve_request')
  assert.equal(client.calls[0].args.p_request_id, requestId)
  assert.equal(typeof client.calls[0].args.p_payload.sla_formal_days, 'number')
  assert.match(client.calls[0].args.p_payload.sla_target_date, /^\d{4}-\d{2}-\d{2}$/)
  assert.equal(client.calls[0].args.p_payload.assigned_admin, null)
})

test('low priority approval sends null SLA target; invalid approval response is rejected', async () => {
  const client = rpcClient(() => ({ data: project, error: null }))
  await createOperations(client).approveRequest(request, { project_type: 'development', priority: 'low' }, createRpcAttempt(() => key))
  assert.equal(client.calls[0].args.p_payload.sla_target_date, null)
  const invalid = createOperations(rpcClient(() => ({ data: { ...project, request_id: token }, error: null })))
  await assert.rejects(invalid.approveRequest(request, { project_type: 'development', priority: 'medium' }, createRpcAttempt(() => key)))
})

test('void RPC acknowledgments are valid; Supabase errors still reject', async () => {
  const client = rpcClient(() => ({ data: null, error: null }))
  const api = createOperations(client)
  await api.rejectRequest(requestId, ' Motivo ficticio ')
  await api.updateRequestDetails(requestId, '', ' Persona ficticia ')
  await api.adminUpdateUser(requestId, 'viewer', false)
  await api.purgeProject(projectId)
  assert.deepEqual(client.calls.map(call => call.name), ['reject_request', 'update_request_details', 'admin_update_user', 'purge_project'])
  assert.equal(client.calls[0].args.p_reason, 'Motivo ficticio')
  assert.equal(client.calls[1].args.p_area, null)
  const failed = createOperations(rpcClient(() => ({ data: null, error: { code: '42501' } })))
  await assert.rejects(failed.purgeProject(projectId), /permiso/)
  await assert.rejects(failed.adminUpdateUser(requestId, 'admin', true), /permiso/)
})

test('project type change uses its dedicated RPC', async () => {
  const client = rpcClient(() => ({ data: project, error: null }))
  await createOperations(client).changeProjectType(projectId, 'administrative')
  assert.deepEqual(client.calls[0], { name: 'change_project_type', args: { p_project_id: projectId, p_project_type: 'administrative' } })
})

test('tracking validates number and token without table access, including counters above 999', async () => {
  const state = { request_number: receipt.request_number, status: 'approved', created_at: '2026-11-17T00:00:00Z',
    flows: [], project_status: 'active', sla_target_date: null, rejection_reason: null }
  const client = rpcClient(() => ({ data: state, error: null }))
  const api = createOperations(client)
  assert.deepEqual(await api.trackRequest(' req26-1000 ', token), state)
  assert.deepEqual(client.calls[0], { name: 'track_request', args: { p_request_number: 'REQ26-1000', p_tracking_token: token } })
  await assert.rejects(api.trackRequest('REQ26-1000', ''), /token/)
  await assert.rejects(api.trackRequest('1000', token), /número completo/)
  assert.equal(client.calls.length, 1)
  assert.equal(await createOperations(rpcClient(() => ({ data: null, error: null }))).trackRequest('REQ25-001', token), null)
  await assert.rejects(createOperations(rpcClient(() => ({ data: null, error: { code: 'PGRST202' } }))).trackRequest('REQ26-001', token), /migraciones/)
})

test('SDK transport contract uses the expected RPC URL and serialized arguments, without network', async () => {
  const calls = []
  const client = createClient('https://supabase-test.invalid', 'sb_publishable_test_only_not_a_real_key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (url, init) => {
      calls.push({ path: new URL(url).pathname, body: JSON.parse(init.body) })
      return new Response(JSON.stringify(receipt), { status: 200, headers: { 'Content-Type': 'application/json' } })
    } },
  })
  await createOperations(client).submitRequest(draft, createRpcAttempt(() => key))
  assert.equal(calls.length, 1)
  assert.equal(calls[0].path, '/rest/v1/rpc/submit_request')
  assert.equal(calls[0].body.p_idempotency_key, key)
  assert.equal(calls[0].body.p_payload.request_date, null)
})

test('zero matched writes and permission errors are not accepted as saved records', () => {
  assert.throws(() => requireData({ data: [], error: null }, 'Proyecto'), /no se confirmó/)
  assert.throws(() => requireData({ data: null, error: { code: '42501', details: token } }, 'Proyecto'), /permiso/)
  assert.equal(errorMessage({ code: '42501', details: token }).includes(token), false)
})

test('environment configuration accepts publishable and anon keys, rejects privileged or incomplete config', () => {
  const config = { VITE_SUPABASE_URL: 'https://supabase-test.invalid', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_only_not_a_real_key' }
  assert.equal(readSupabaseConfig(config).url, 'https://supabase-test.invalid')
  const jwt = role => [Buffer.from('{}').toString('base64url'), Buffer.from(JSON.stringify({ role })).toString('base64url'), 'test-only'].join('.')
  assert.equal(readSupabaseConfig({ VITE_SUPABASE_URL: config.VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY: jwt('anon') }).key, jwt('anon'))
  for (const env of [{}, { ...config, VITE_SUPABASE_PUBLISHABLE_KEY: '' }, { ...config, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_TEST_ONLY' },
    { ...config, VITE_SUPABASE_PUBLISHABLE_KEY: jwt('service_role') }, { ...config, VITE_SUPABASE_URL: 'http://supabase-test.invalid' },
    { ...config, VITE_SUPABASE_URL: 'https://user:password@supabase-test.invalid' }, { ...config, VITE_SUPABASE_URL: 'https://<project>.supabase.co' }]) {
    assert.throws(() => readSupabaseConfig(env))
  }
})

const active = { id: requestId, role: 'developer', is_active: true, full_name: 'Persona ficticia' }
function authFixture(profile = active) {
  let callback
  let profileReads = 0
  let signOuts = 0
  const session = { user: { id: requestId } }
  let result = () => Promise.resolve({ data: profile, error: null })
  const client = {
    from: name => {
      assert.equal(name, 'users')
      return { select: () => ({ eq: () => ({ maybeSingle: () => { profileReads++; return result() } }) }) }
    },
    auth: {
      onAuthStateChange: listener => { callback = listener; return { data: { subscription: { unsubscribe() {} } } } },
      getSession: async () => ({ data: { session: null }, error: null }),
      signInWithPassword: async () => { callback?.('SIGNED_IN', session); return { data: { session }, error: null } },
      signOut: async () => { signOuts++; callback?.('SIGNED_OUT', null); return { error: null } },
    },
  }
  return { client, session, emit: (event, value) => callback(event, value),
    setProfileResult: fn => { result = fn }, reads: () => profileReads, signOuts: () => signOuts }
}

test('shared auth controller subscribes once and accepts only an active known profile', async () => {
  const fixture = authFixture()
  const controller = createAuthController(fixture.client)
  const unsubscribe = controller.subscribe(() => {})
  controller.subscribe(() => {})
  await nextTurn()
  await controller.signIn('person@example.invalid', 'test-only-not-a-real-password')
  assert.equal(controller.getSnapshot().user.id, requestId)
  assert.equal(fixture.reads(), 1)
  await controller.signOut()
  assert.equal(controller.getSnapshot().user, null)
  unsubscribe()
})

test('missing, inactive or unknown-role profiles reject login and close the session', async () => {
  for (const profile of [null, { ...active, is_active: false }, { ...active, role: 'unexpected' }]) {
    const fixture = authFixture(profile)
    const controller = createAuthController(fixture.client)
    controller.subscribe(() => {})
    await nextTurn()
    await assert.rejects(controller.signIn('person@example.invalid', 'test-only'), /perfil activo/)
    assert.equal(controller.getSnapshot().user, null)
    assert.equal(fixture.signOuts(), 1)
  }
})

test('late profile read and queued sign-in cannot resurrect a signed-out session', async () => {
  const fixture = authFixture()
  const controller = createAuthController(fixture.client)
  controller.subscribe(() => {})
  await nextTurn()
  let resolve
  fixture.setProfileResult(() => new Promise(done => { resolve = done }))
  fixture.emit('SIGNED_IN', fixture.session)
  await nextTurn()
  fixture.emit('SIGNED_OUT', null)
  resolve({ data: active, error: null })
  await nextTurn()
  assert.equal(controller.getSnapshot().user, null)
  fixture.emit('SIGNED_IN', fixture.session)
  fixture.emit('SIGNED_OUT', null)
  await nextTurn()
  assert.equal(controller.getSnapshot().user, null)
})

test('consumer role guards distinguish viewers, inactive profiles and administrative targets', () => {
  assert.equal(canEdit(active), true)
  assert.equal(canEdit({ ...active, role: 'viewer' }), false)
  assert.equal(canEdit({ ...active, is_active: false }), false)
  const admin = { ...active, role: 'admin' }
  assert.equal(canManageProfile(admin, active), true)
  assert.equal(canManageProfile(admin, admin), false)
  assert.equal(canManageProfile({ ...active, role: 'superadmin' }, admin), true)
})

test('a late initial session failure cannot overwrite a newer signed-in profile', async () => {
  const fixture = authFixture()
  let rejectInitial
  fixture.client.auth.getSession = () => new Promise((_resolve, reject) => { rejectInitial = reject })
  const controller = createAuthController(fixture.client)
  controller.subscribe(() => {})
  await controller.signIn('person@example.invalid', 'test-only')
  rejectInitial(new Error('Initial read failed'))
  await nextTurn()
  assert.equal(controller.getSnapshot().user.id, requestId)
  assert.equal(controller.getSnapshot().error, null)
})

test('same-user token refresh preserves forms while revalidation still rejects a revoked profile', async () => {
  const fixture = authFixture()
  const controller = createAuthController(fixture.client)
  controller.subscribe(() => {})
  await nextTurn()
  await controller.signIn('person@example.invalid', 'test-only')
  let resolve
  fixture.setProfileResult(() => new Promise(done => { resolve = done }))
  fixture.emit('TOKEN_REFRESHED', fixture.session)
  await nextTurn()
  assert.equal(controller.getSnapshot().user.id, requestId)
  assert.equal(controller.getSnapshot().loading, false)
  resolve({ data: null, error: null })
  await nextTurn()
  assert.equal(controller.getSnapshot().user, null)
  assert.match(controller.getSnapshot().error, /perfil activo/)
})
