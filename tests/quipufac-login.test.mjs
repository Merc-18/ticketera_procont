import test from 'node:test'
import assert from 'node:assert/strict'
import { clientLoginHandler, adaptProviderResponse, digestToken } from '../supabase/functions/_shared/client-login.mjs'
import { quipufacDevelopmentContract as contract, quipuDevelopmentContract } from '../supabase/functions/_shared/client-provider-contracts.mjs'
import { createClientPortal } from '../src/lib/client-portal.ts'

// Observed field names, synthetic values only. No external requests.
const url = 'https://dev.quipufac.com/auth/login'
const ruc = '20000000001'
const input = () => ({ action: 'login', provider: 'quipufac', ruc, password: crypto.randomUUID() })
const body = () => ({ username: ruc, businessRuc: ruc, businessName: 'Synthetic company', token: crypto.randomUUID() })
const json = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })
const request = value => new Request('http://localhost:8000/functions/v1/client-login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value),
})
function fixture(fetchImpl) {
  const calls = [], external = []
  const handler = clientLoginHandler({
    client: { rpc: async (name, args) => {
      calls.push([name, args])
      return { data: name === 'client_session_info' ? { entry_context: 'direct' } : null, error: null }
    } },
    providerUrls: { quipufac: url }, providerContracts: { quipufac: contract },
    fetchImpl: async (endpoint, options) => {
      external.push([endpoint, options])
      return fetchImpl ? fetchImpl() : json(body())
    },
  })
  return { handler, calls, external }
}

test('QuipuFac confirmed shape: one POST, company scope, verified company name and independent hashed session', async () => {
  const responseBody = body(), credentials = input()
  const f = fixture(() => json(responseBody))
  const result = await f.handler(request(credentials)), receipt = await result.json()
  assert.equal(result.status, 200); assert.equal(f.external.length, 1)
  assert.equal(f.external[0][0], url); assert.equal(f.external[0][1].method, 'POST')
  assert.equal(f.external[0][1].redirect, 'error')
  assert.deepEqual(JSON.parse(f.external[0][1].body), { username: ruc, password: credentials.password })
  assert.deepEqual(f.calls[0], ['client_open_session', {
    p_provider: 'quipufac', p_ruc: ruc, p_subject: 'company', p_subject_source: 'company',
    p_username: null, p_verified_name: 'Synthetic company',
    p_token_hash: await digestToken(receipt.session_token), p_expires_at: f.calls[0][1].p_expires_at,
  }])
  assert.equal(f.calls[1][0], 'client_session_info')
  assert.match(receipt.session_token, /^[a-f0-9]{64}$/)
  assert.equal(JSON.stringify([receipt, f.calls]).includes(responseBody.token), false)
  assert.equal(JSON.stringify([receipt, f.calls]).includes(credentials.password), false)
})

test('QuipuFac rejects missing, mismatched or non-string username/businessRuc before session creation', async () => {
  for (const changes of [{ username: undefined }, { username: '20000000002' }, { username: Number(ruc) },
    { businessRuc: undefined }, { businessRuc: '20000000002' }, { businessRuc: Number(ruc) }]) {
    const f = fixture(() => json({ ...body(), ...changes }))
    const result = await f.handler(request(input()))
    assert.equal(result.status, 401); assert.equal(f.calls.length, 0)
  }
})

test('QuipuFac HTTP 200 without a nonempty token cannot open a session', async () => {
  for (const token of [undefined, null, '', '  ', 123, {}]) {
    const f = fixture(() => json({ ...body(), token }))
    assert.equal((await f.handler(request(input()))).status, 401)
    assert.equal(f.calls.length, 0)
  }
})

test('QuipuFac simulated HTTP errors, malformed JSON and transport errors never expose upstream details or open sessions', async () => {
  for (const fetchImpl of [
    ...[401, 403, 422, 500].map(status => () => new Response('private provider error', { status })),
    () => new Response('private malformed JSON', { headers: { 'Content-Type': 'application/json' } }),
    () => { throw new Error('private transport error') },
  ]) {
    const f = fixture(fetchImpl), result = await f.handler(request(input()))
    assert.ok(result.status >= 400); assert.equal(f.calls.length, 0)
    assert.doesNotMatch(await result.text(), /private/)
  }
})

test('QuipuFac manifest comparison is restricted to RUC; Quipu keeps its exact-username contract', () => {
  for (const success of [
    { path: ['username'], equalsInput: 'username' },
    { path: ['username'], equalsInput: 'password' },
    { path: ['username'], equalsInput: 'ruc', equals: true },
  ]) {
    assert.throws(() => adaptProviderResponse('quipufac', body(), { ruc }, { ...contract, success }),
      error => error.code === 'provider_contract_pending')
  }
  assert.deepEqual(quipuDevelopmentContract, {
    version: 1, provider: 'quipu', verifiedReference: 'docs/validation/client-login-dev-api.json#quipu',
    success: { path: ['username'], equalsInput: 'username' }, tokenPath: ['token'], allowUsernameFallback: true,
    failure: { statuses: [400] },
  })
})

test('QuipuFac cannot supply a username, platform context or subject through the browser login', async () => {
  for (const extra of [{ username: 'another-person' }, { entry_context: 'platform' }, { subject: 'another-person' }]) {
    const f = fixture(), result = await f.handler(request({ ...input(), ...extra }))
    assert.equal(result.status, 400); assert.equal(f.calls.length, 0); assert.equal(f.external.length, 0)
  }
})

test('QuipuFac handler connects to portal company session, New-ticket products and My tickets without submitting', async () => {
  let opened
  const calls = [], products = [{ id: crypto.randomUUID(), name: 'Quipu_Fac', requires_subproject: false }, { id: crypto.randomUUID(), name: 'Negmin', requires_subproject: true }]
  const rpc = async (name, args) => {
    calls.push(name)
    if (name === 'client_open_session') { opened = args; return { data: null, error: null } }
    assert.equal(await digestToken(args.p_session_token), opened.p_token_hash)
    const data = name === 'client_session_info' ? {
      expires_at: opened.p_expires_at, entry_context: 'direct',
      identity: { provider: opened.p_provider, kind: 'company', verified_name: opened.p_verified_name, name_verified: true },
      company: { ruc: opened.p_ruc, studio_mapping: 'resolved', studio_id: '00000000-0000-4000-8000-000000000001' },
    } : name === 'client_products' ? products : name === 'client_list_tickets' ? [] : undefined
    assert.notEqual(data, undefined)
    return { data, error: null }
  }
  const handler = clientLoginHandler({ client: { rpc }, providerUrls: { quipufac: url },
    providerContracts: { quipufac: contract }, fetchImpl: async () => json(body()) })
  const portal = createClientPortal({ rpc, functions: { invoke: async (_name, options) => {
    const result = await handler(request(options.body))
    assert.equal(result.status, 200)
    return { data: await result.json(), error: null }
  } } }, { enabled: true, metadata: () => { throw new Error('No attachments expected') }, upload: async () => {} })
  const { token, session } = await portal.login({ auth_type: 'quipufac', ruc, password: crypto.randomUUID() })
  assert.equal(session.auth_type, 'quipufac'); assert.equal(session.origin, null)
  assert.equal(session.identity.kind, 'company_account'); assert.equal(session.studio_mapping, 'resolved')
  assert.deepEqual(session.products, products)
  assert.deepEqual(await portal.listMyTickets(token), [])
  assert.equal(opened.p_username, null); assert.equal(opened.p_subject, 'company')
  assert.equal(calls.includes('client_submit_request'), false)
})
