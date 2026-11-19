import test from 'node:test'
import assert from 'node:assert/strict'
import { clientLoginHandler, adaptProviderResponse, digestToken } from '../supabase/functions/_shared/client-login.mjs'
import { createClientAccess } from '../contracts/client-access-client.mjs'
import { quipuDevelopmentContract } from '../supabase/functions/_shared/client-provider-contracts.mjs'
import { createClientPortal, productSelection } from '../src/lib/client-portal.ts'
import { readClientLoginDevOrigin } from '../src/lib/supabase-config.ts'
import { createClient } from '@supabase/supabase-js'

// Deliberately fictitious schema. It does NOT document either real provider response.
const contract = (provider, fallback = false) => ({ version: 1, provider, verifiedReference: 'synthetic fixture only',
  success: { path: ['fixture', 'accepted'], equals: true }, tokenPath: ['fixture', 'opaque'],
  rucPath: ['fixture', 'company'], namePath: ['fixture', 'name'],
  ...(provider === 'quipu' ? fallback ? { allowUsernameFallback: true } : { subjectPath: ['fixture', 'person'] } : {}) })
const ruc = '20000000001'
const credentials = provider => ({ action: 'login', provider, ruc,
  ...(provider === 'quipu' ? { username: 'SyntheticUser' } : {}), password: crypto.randomUUID() })
const upstream = () => ({ fixture: { accepted: true, opaque: crypto.randomUUID(), company: ruc, person: 'synthetic-person-id', name: 'Verified fixture' } })
const response = body => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })
const request = (body, headers = {}) => new Request('https://ticketera.example.invalid/functions/v1/client-login', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
})
function fixture(overrides = {}) {
  const calls = [], external = []
  const client = { async rpc(name, args) {
    calls.push([name, args])
    return { data: name === 'client_session_info' ? { expires_at: 'synthetic-expiration', entry_context: 'direct' } : null, error: null }
  } }
  const handler = clientLoginHandler({ client,
    providerUrls: { quipu: 'https://api-gestion-test.quipufac.com/api/users/auth', quipufac: 'https://api-dev.quipufac.com/auth/login' },
    providerContracts: { quipu: contract('quipu'), quipufac: contract('quipufac') },
    fetchImpl: async (url, options) => { external.push([url, options]); return response(upstream()) },
    ...overrides,
  })
  return { handler, calls, external }
}

for (const provider of ['quipu', 'quipufac']) {
  test(`${provider}: POST body, verified identity and separate hashed client session`, async () => {
    const f = fixture(), input = credentials(provider), result = await f.handler(request(input)), body = await result.json()
    assert.equal(result.status, 200)
    assert.match(body.session_token, /^[a-f0-9]{64}$/)
    assert.equal(f.external.length, 1)
    const [url, options] = f.external[0]
    assert.equal(url, provider === 'quipu' ? 'https://api-gestion-test.quipufac.com/api/users/auth' : 'https://api-dev.quipufac.com/auth/login')
    assert.equal(options.method, 'POST'); assert.equal(options.redirect, 'error')
    assert.deepEqual(JSON.parse(options.body), provider === 'quipu'
      ? { ruc, username: input.username, password: input.password } : { username: ruc, password: input.password })
    const [name, args] = f.calls[0]
    assert.equal(name, 'client_open_session')
    assert.equal(args.p_subject_source, provider === 'quipu' ? 'provider_id' : 'company')
    assert.equal(args.p_subject, provider === 'quipu' ? 'synthetic-person-id' : 'company')
    assert.equal(args.p_token_hash, await digestToken(body.session_token))
    assert.equal(JSON.stringify(f.calls).includes(input.password), false)
    assert.equal(JSON.stringify(body).includes(input.password), false)
    assert.equal(result.headers.get('cache-control'), 'no-store')
  })
  test(`${provider}: missing contract blocks before contacting provider`, async () => {
    const f = fixture({ providerContracts: {} }), result = await f.handler(request(credentials(provider)))
    assert.equal(result.status, 503); assert.equal((await result.json()).error, 'provider_contract_pending')
    assert.equal(f.external.length, 0); assert.equal(f.calls.length, 0)
  })
  test(`${provider}: HTTP 200 never suffices for authentication`, async () => {
    for (const body of [{}, { fixture: { accepted: true } }, { fixture: { accepted: true, opaque: '   ' } },
      { fixture: { accepted: false, opaque: crypto.randomUUID() } }]) {
      const f = fixture({ fetchImpl: async () => response(body) })
      const result = await f.handler(request(credentials(provider)))
      assert.equal(result.status, 401); assert.equal(f.calls.length, 0)
    }
  })
}

test('Quipu username fallback preserves case and never silently substitutes for a missing configured stable id', () => {
  const body = upstream()
  delete body.fixture.person
  assert.throws(() => adaptProviderResponse('quipu', body, { ruc, username: 'User' }, contract('quipu')))
  const a = adaptProviderResponse('quipu', body, { ruc, username: 'User' }, contract('quipu', true))
  const b = adaptProviderResponse('quipu', body, { ruc, username: 'user' }, contract('quipu', true))
  assert.equal(a.p_subject_source, 'username'); assert.notEqual(a.p_subject, b.p_subject)
})
test('mismatched provider company, malformed JSON, transport errors and non-JSON responses never mint a session', async () => {
  for (const fetchImpl of [async () => { throw new Error('sensitive provider diagnostic') },
    async () => response({ fixture: { ...upstream().fixture, company: '20000000002' } }),
    async () => new Response('not json', { headers: { 'Content-Type': 'application/json' } }),
    async () => new Response('provider diagnostic', { headers: { 'Content-Type': 'text/html' } })]) {
    const f = fixture({ fetchImpl }), result = await f.handler(request(credentials('quipu')))
    assert.ok(result.status >= 400); assert.equal(f.calls.length, 0)
    assert.doesNotMatch(await result.text(), /sensitive|diagnostic/)
  }
})
test('client cannot choose platform context or pass arbitrary identity claims during login', async () => {
  for (const extra of [{ entry_context: 'platform' }, { subject: 'another-person' }, { studio_id: crypto.randomUUID() }]) {
    const f = fixture(), result = await f.handler(request({ ...credentials('quipu'), ...extra }))
    assert.equal(result.status, 400); assert.equal(f.external.length, 0); assert.equal(f.calls.length, 0)
  }
})
test('platform server issues only a digest; a browser or the other platform secret cannot mint a code', async () => {
  const secret = crypto.randomUUID(), other = crypto.randomUUID()
  const body = { action: 'issue_code', provider: 'quipufac', ruc }
  const options = { platformSecrets: { quipu: other, quipufac: secret }, allowedOrigins: ['https://client.example.invalid'] }
  for (const headers of [{}, { Authorization: `Bearer ${other}` },
    { Authorization: `Bearer ${secret}`, Origin: 'https://client.example.invalid' }]) {
    const f = fixture(options), result = await f.handler(request(body, headers))
    assert.ok(result.status >= 400); assert.equal(f.calls.length, 0)
  }
  const f = fixture(options), result = await f.handler(request(body, { Authorization: `Bearer ${secret}` }))
  const grant = await result.json()
  assert.equal(result.status, 200); assert.match(grant.code, /^[a-f0-9]{64}$/)
  assert.equal(f.calls[0][0], 'client_issue_entry_code')
  assert.equal(f.calls[0][1].p_code_hash, await digestToken(grant.code))
  assert.equal(JSON.stringify(f.calls).includes(secret), false)
  assert.equal(JSON.stringify(f.calls).includes(grant.code), false)
  assert.equal(f.external.length, 0)
})
test('code exchange binds provider and sends no raw code or chosen access context to the database', async () => {
  const f = fixture(), code = crypto.getRandomValues(new Uint8Array(32)).reduce((s, n) => s + n.toString(16).padStart(2, '0'), '')
  const result = await f.handler(request({ action: 'exchange', provider: 'quipu', code }))
  assert.equal(result.status, 200)
  assert.equal(f.calls[0][0], 'client_exchange_entry_code')
  assert.equal(f.calls[0][1].p_code_hash, await digestToken(code))
  assert.equal(f.calls[0][1].p_provider, 'quipu'); assert.equal(JSON.stringify(f.calls).includes(code), false)
  assert.equal(f.external.length, 0)
})
test('bounded input, allowed origin and HTTPS endpoint restrictions run before credentials leave server', async () => {
  const f = fixture({ providerUrls: { quipu: 'http://insecure.example.invalid' } })
  assert.equal((await f.handler(request(credentials('quipu')))).status, 503)
  assert.equal(f.calls.length, 0)
  const g = fixture()
  assert.equal((await g.handler(request(credentials('quipu'), { Origin: 'https://foreign.example.invalid' }))).status, 403)
  assert.equal((await g.handler(request({ ...credentials('quipu'), padding: 'x'.repeat(17000) }))).status, 413)
  assert.equal(g.external.length, 0)
})
test('frontend transport uses client-scoped RPCs, independent tokens and legacy-compatible attachment receipt', async () => {
  const calls = [], rpc = async (name, args) => { calls.push([name, args]); return { data: null, error: null } }
  const api = createClientAccess({ rpc, functions: { async invoke(name, { body }) {
    calls.push([name, body]); return { data: { session_token: 'fixture-token', session: {} }, error: null }
  } } })
  await api.login(credentials('quipu')); await api.exchange('quipufac', 'fixture-code')
  await api.products('fixture-token'); await api.submit('fixture-token', { title: 'Fictitious' }, 'retained-key')
  await api.tickets('fixture-token', { limit: 5 }); await api.detail('fixture-token', 'fixture-id'); await api.logout('fixture-token')
  assert.deepEqual(calls.map(c => c[0]), ['client-login','client-login','client_products','client_submit_request',
    'client_list_tickets','client_ticket_detail','client_logout'])
  assert.equal(calls[3][1].p_idempotency_key, 'retained-key')
  assert.equal(calls[4][1].p_limit, 5)
})
test('frontend preserves safe Edge HTTP failure codes without reflecting private diagnostics', async () => {
  for (const [failure, expected] of [['provider_contract_pending','provider_contract_pending'],
    ['private diagnostic with sensitive data','client_login_failed']]) {
    const api = createClientAccess({ functions: { async invoke() {
      return { data: null, error: { context: new Response(JSON.stringify({ error: failure }), { status: 503 }) } }
    } } })
    await assert.rejects(api.login(credentials('quipu')), error => error.code === expected && error.message === expected)
  }
})

test('observed Quipu development shape opens an exact-username session and discards the upstream token', async () => {
  const input = credentials('quipu'), providerToken = crypto.randomUUID()
  const f = fixture({ providerContracts: { quipu: quipuDevelopmentContract },
    fetchImpl: async () => response({ username: input.username, token: providerToken }) })
  const result = await f.handler(request(input)), receipt = await result.json()
  assert.equal(result.status, 200)
  const [name, args] = f.calls[0]
  assert.equal(name, 'client_open_session')
  assert.equal(args.p_provider, 'quipu'); assert.equal(args.p_ruc, input.ruc)
  assert.equal(args.p_subject, input.username); assert.equal(args.p_subject_source, 'username')
  assert.equal(args.p_username, input.username); assert.equal(args.p_verified_name, null)
  assert.equal(args.p_token_hash, await digestToken(receipt.session_token))
  assert.equal(f.calls[1][0], 'client_session_info')
  assert.equal(JSON.stringify([f.calls, receipt]).includes(providerToken), false)
  assert.equal(JSON.stringify([f.calls, receipt]).includes(input.password), false)
})

test('observed Quipu shape rejects wrong-case/missing username or missing/blank token before opening a session', async () => {
  const input = credentials('quipu')
  for (const body of [{ username: input.username.toLowerCase(), token: crypto.randomUUID() },
    { token: crypto.randomUUID() }, { username: input.username },
    { username: input.username, token: '  ' }, { username: input.username, token: null }, {}]) {
    const f = fixture({ providerContracts: { quipu: quipuDevelopmentContract }, fetchImpl: async () => response(body) })
    const result = await f.handler(request(input))
    assert.equal(result.status, 401); assert.equal(f.calls.length, 0)
  }
})

test('input comparison cannot select arbitrary input fields, another provider, or ambiguous success rules', async () => {
  const body = { username: 'SyntheticUser', token: crypto.randomUUID() }
  for (const invalid of [
    { ...quipuDevelopmentContract, success: { path: ['username'], equalsInput: 'password' } },
    { ...quipuDevelopmentContract, success: { path: ['username'], equalsInput: 'username', equals: true } },
    { ...quipuDevelopmentContract, provider: 'quipufac' },
  ]) {
    assert.throws(() => adaptProviderResponse(invalid.provider, body,
      { ruc, username: 'SyntheticUser' }, invalid), error => error.code === 'provider_contract_pending')
  }
  assert.throws(() => adaptProviderResponse('quipu', body, { ruc }, quipuDevelopmentContract),
    error => error.code === 'invalid_credentials')
})

test('Quipu development contract preserves safe errors and never authenticates from an upstream HTTP error', async () => {
  for (const [status, expected] of [[401, 401], [403, 401], [422, 502], [500, 502]]) {
    const f = fixture({ providerContracts: { quipu: quipuDevelopmentContract },
      fetchImpl: async () => new Response('private upstream error', { status }) })
    const result = await f.handler(request(credentials('quipu')))
    assert.equal(result.status, expected); assert.equal(f.calls.length, 0)
    assert.doesNotMatch(await result.text(), /private|upstream/)
  }
})

test('Quipu observed contract connects handler to portal session, new-ticket products and My tickets without submitting', async () => {
  // Provider values and RPC storage are synthetic. Exercises the real handler and portal together.
  let opened
  const calls = []
  const products = [{ id: crypto.randomUUID(), name: 'Quipu' }, { id: crypto.randomUUID(), name: 'Quipu_Fac' }]
  const rpc = async (name, args) => {
    calls.push(name)
    if (name === 'client_open_session') { opened = args; return { data: null, error: null } }
    assert.ok(opened)
    assert.equal(await digestToken(args.p_session_token), opened.p_token_hash)
    const data = name === 'client_session_info' ? {
      expires_at: opened.p_expires_at, entry_context: 'direct',
      identity: { provider: opened.p_provider, kind: 'user', username: opened.p_username, name_verified: false },
      company: { ruc: opened.p_ruc, studio_mapping: 'resolved', studio_id: '00000000-0000-4000-8000-000000000001' },
    } : name === 'client_products' ? products : name === 'client_list_tickets' ? [] : undefined
    assert.notEqual(data, undefined, `Unexpected RPC: ${name}`)
    return { data, error: null }
  }
  const handler = clientLoginHandler({ client: { rpc }, providerContracts: { quipu: quipuDevelopmentContract },
    providerUrls: { quipu: 'https://api-gestion-test.quipufac.com/api/users/auth' },
    fetchImpl: async (_url, options) => response({ username: JSON.parse(options.body).username, token: crypto.randomUUID() }) })
  const portal = createClientPortal({ rpc, functions: { async invoke(name, options) {
    assert.equal(name, 'client-login')
    const result = await handler(request(options.body))
    assert.equal(result.status, 200)
    return { data: await result.json(), error: null }
  } } }, { enabled: true, metadata: () => { throw new Error('No attachments expected') }, upload: async () => {} })
  const { token, session } = await portal.login({ auth_type: 'quipu', ruc, username: 'SyntheticUser', password: crypto.randomUUID() })
  assert.equal(session.auth_type, 'quipu'); assert.equal(session.origin, null)
  assert.equal(session.identity.kind, 'individual'); assert.equal(session.studio_mapping, 'resolved')
  assert.equal(session.identity.username, 'SyntheticUser')
  assert.deepEqual(session.products, products); assert.equal(productSelection(session).fixed, false)
  assert.deepEqual(await portal.currentSession(token), session)
  assert.deepEqual(await portal.listMyTickets(token), [])
  assert.equal(calls.filter(name => name === 'client_open_session').length, 1)
  assert.ok(calls.includes('client_list_tickets')); assert.equal(calls.includes('client_submit_request'), false)
})

test('local development login accepts loopback origins and rejects external hosts or embedded credentials', () => {
  assert.equal(readClientLoginDevOrigin({}), null)
  for (const origin of ['http://localhost:8000', 'http://127.0.0.1:8000', 'http://[::1]:8000']) {
    assert.equal(readClientLoginDevOrigin({ VITE_CLIENT_LOGIN_DEV_ORIGIN: origin }), origin)
  }
  for (const origin of ['https://external.example.invalid', 'http://localhost.evil.invalid',
    'http://localhost:8000/path', 'http://private@localhost:8000', 'http://localhost:8000?secret=x',
    'http://localhost:8000#secret', 'file:///tmp/login', 'invalid']) {
    assert.throws(() => readClientLoginDevOrigin({ VITE_CLIENT_LOGIN_DEV_ORIGIN: origin }))
  }
})

test('existing Supabase function client can invoke the localhost handler without a staff Auth session', async () => {
  const calls = []
  const local = createClient('http://localhost:8000', 'sb_publishable_synthetickey123456', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (url, options) => {
      calls.push([url, options])
      return response({ session_token: 'synthetic-session', session: {} })
    } },
  })
  const input = credentials('quipu')
  const { data, error } = await local.functions.invoke('client-login', { body: input })
  assert.equal(error, null); assert.equal(data.session_token, 'synthetic-session')
  assert.equal(calls.length, 1); assert.equal(calls[0][0], 'http://localhost:8000/functions/v1/client-login')
  assert.deepEqual(JSON.parse(calls[0][1].body), input)
})
