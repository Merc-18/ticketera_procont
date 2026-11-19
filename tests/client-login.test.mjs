import test from 'node:test'
import assert from 'node:assert/strict'
import { clientLoginHandler, adaptProviderResponse, digestToken } from '../supabase/functions/_shared/client-login.mjs'
import { createClientAccess } from '../contracts/client-access-client.mjs'

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
