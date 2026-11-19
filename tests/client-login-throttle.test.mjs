// M14 · Límite de intentos de client-login. Proveedor y base de datos simulados; sin red.
import test from 'node:test'
import assert from 'node:assert/strict'
import { clientLoginHandler, digestToken } from '../supabase/functions/_shared/client-login.mjs'
import { createClientPortal, ClientPortalError } from '../src/lib/client-portal.ts'

globalThis.fetch = () => { throw new Error('Network access forbidden in throttle tests') }

// Esquema deliberadamente ficticio; no documenta la respuesta real de ningún proveedor.
const contract = provider => ({ version: 1, provider, verifiedReference: 'synthetic fixture only',
  success: { path: ['fixture', 'accepted'], equals: true }, tokenPath: ['fixture', 'opaque'],
  rucPath: ['fixture', 'company'], ...(provider === 'quipu' ? { allowUsernameFallback: true } : {}) })
const ruc = '20000000001'
const login = (provider, extra = {}) => ({ action: 'login', provider, ruc,
  ...(provider === 'quipu' ? { username: 'SyntheticUser' } : {}), password: 'synthetic-' + crypto.randomUUID(), ...extra })
const request = (body, headers = {}) => new Request('https://ticketera.example.invalid/functions/v1/client-login', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })

function fixture({ throttle = true, allowed = true, throttleError = null } = {}) {
  const calls = [], external = []
  const client = { async rpc(name, args) {
    calls.push([name, args])
    if (name === 'client_login_throttle') return throttleError ? { data: null, error: throttleError } : { data: allowed, error: null }
    return { data: name === 'client_session_info' ? { expires_at: 'synthetic', entry_context: 'direct' } : null, error: null }
  } }
  const handler = clientLoginHandler({ client, throttle,
    providerUrls: { quipu: 'https://quipu.example.invalid/auth', quipufac: 'https://quipufac.example.invalid/auth' },
    providerContracts: { quipu: contract('quipu'), quipufac: contract('quipufac') },
    fetchImpl: async (url, options) => {
      external.push([url, options])
      return new Response(JSON.stringify({ fixture: { accepted: true, opaque: 'x', company: ruc } }),
        { headers: { 'Content-Type': 'application/json' } })
    } })
  return { handler, calls, external }
}

for (const provider of ['quipu', 'quipufac']) {
  test(`${provider}: el intento se cuenta antes de contactar al proveedor`, async () => {
    const f = fixture(), input = login(provider)
    const result = await f.handler(request(input, { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))
    assert.equal(result.status, 200)
    assert.equal(f.calls[0][0], 'client_login_throttle')
    assert.equal(f.external.length, 1)
    const { p_subject_key, p_ip_key } = f.calls[0][1]
    const subject = provider === 'quipu' ? `quipu:${ruc}:SyntheticUser` : `quipufac:${ruc}`
    assert.equal(p_subject_key, await digestToken('subject:' + subject))
    assert.equal(p_ip_key, await digestToken('ip:203.0.113.7'))
    // Solo claves SHA-256: ni RUC, ni usuario, ni IP, ni contraseña en claro.
    const sent = JSON.stringify(f.calls[0][1])
    for (const raw of [ruc, 'SyntheticUser', '203.0.113.7', input.password]) assert.equal(sent.includes(raw), false)
  })

  test(`${provider}: superado el límite → 429 rate_limited, sin llamar al proveedor ni abrir sesión`, async () => {
    const f = fixture({ allowed: false }), result = await f.handler(request(login(provider)))
    assert.equal(result.status, 429)
    assert.equal(result.headers.get('retry-after'), '900')
    assert.deepEqual(await result.json(), { error: 'rate_limited' })
    assert.equal(f.external.length, 0)
    assert.deepEqual(f.calls.map(c => c[0]), ['client_login_throttle'])
  })

  test(`${provider}: contador no disponible (p. ej. M14 sin aplicar) → falla cerrada sin contactar al proveedor`, async () => {
    const f = fixture({ throttleError: { code: 'PGRST202' } }), result = await f.handler(request(login(provider)))
    assert.equal(result.status, 503)
    assert.deepEqual(await result.json(), { error: 'client_backend_unavailable' })
    assert.equal(f.external.length, 0)
  })
}

test('datos inválidos se rechazan antes de contar (no consumen el cupo)', async () => {
  const f = fixture(), result = await f.handler(request(login('quipu', { ruc: '123' })))
  assert.equal(result.status, 400)
  assert.equal(f.calls.length, 0)
})

test('canje de código de plataforma no pasa por el límite de login', async () => {
  const f = fixture({ allowed: false })
  const result = await f.handler(request({ action: 'exchange', provider: 'quipu', code: 'a'.repeat(64) }))
  assert.notEqual(result.status, 429)
  assert.equal(f.calls.some(c => c[0] === 'client_login_throttle'), false)
})

test('sin throttle explícito el handler conserva el comportamiento anterior (pruebas existentes)', async () => {
  const f = fixture({ throttle: false }), result = await f.handler(request(login('quipufac')))
  assert.equal(result.status, 200)
  assert.equal(f.calls.some(c => c[0] === 'client_login_throttle'), false)
})

test('portal: rate_limited se muestra como mensaje comprensible, no como error genérico', async () => {
  const portal = createClientPortal({ rpc: async () => ({ data: null, error: null }),
    functions: { invoke: async () => ({ data: { error: 'rate_limited' }, error: {} }) } },
    { metadata: () => ({}), upload: async () => undefined })
  await assert.rejects(portal.login({ auth_type: 'quipufac', ruc, password: 'x' }),
    e => e instanceof ClientPortalError && e.code === 'rate_limited' && /15 minutos/.test(e.message))
})
