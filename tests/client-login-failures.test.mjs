// Respuestas de credenciales rechazadas verificadas el 19/11/2026 (solo estado y nombres de campos):
// Quipu → HTTP 400 (cuerpo texto JSON); QuipuFac → HTTP 500 {success:false, message}. Sin red.
import test from 'node:test'
import assert from 'node:assert/strict'
import { clientLoginHandler, validateProviderContract } from '../supabase/functions/_shared/client-login.mjs'
import { quipuDevelopmentContract, quipufacDevelopmentContract } from '../supabase/functions/_shared/client-provider-contracts.mjs'

globalThis.fetch = () => { throw new Error('Network access forbidden') }
const json = (status, body, type = 'application/json') => new Response(body === undefined ? '' : JSON.stringify(body), { status, headers: { 'Content-Type': type } })
function attempt(provider, upstream, contract) {
  const calls = []
  const handler = clientLoginHandler({ client: { rpc: async (n, a) => { calls.push(n); return { data: n === 'client_login_throttle' ? true : null, error: null } } },
    providerUrls: { quipu: 'https://quipu.example.invalid/auth', quipufac: 'https://quipufac.example.invalid/auth' },
    providerContracts: { quipu: contract ?? quipuDevelopmentContract, quipufac: contract ?? quipufacDevelopmentContract },
    throttle: true, fetchImpl: async () => upstream })
  const body = provider === 'quipu' ? { action: 'login', provider, ruc: '20000000001', username: 'Ficticio', password: 'incorrecta' }
    : { action: 'login', provider, ruc: '20000000001', password: 'incorrecta' }
  return handler(new Request('https://x.invalid/functions/v1/client-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }))
    .then(async r => ({ status: r.status, body: await r.json(), calls }))
}

test('Quipu: clave incorrecta (HTTP 400) → invalid_credentials, sin sesión', async () => {
  const r = await attempt('quipu', json(400, 'Credenciales ficticias'))
  assert.deepEqual([r.status, r.body], [401, { error: 'invalid_credentials' }])
  assert.equal(r.calls.includes('client_open_session'), false)
})

test('QuipuFac: clave incorrecta (HTTP 500 con success:false) → invalid_credentials, sin sesión', async () => {
  const r = await attempt('quipufac', json(500, { success: false, message: 'mensaje ficticio' }))
  assert.deepEqual([r.status, r.body], [401, { error: 'invalid_credentials' }])
  assert.equal(r.calls.includes('client_open_session'), false)
})

test('QuipuFac: un 500 real sin el marcador declarado sigue siendo proveedor no disponible', async () => {
  for (const upstream of [json(500, { error: 'otro' }), json(500, { success: true }), json(500, undefined, 'text/html'), json(502, { success: false })]) {
    const r = await attempt('quipufac', upstream)
    assert.deepEqual([r.status, r.body], [502, { error: 'provider_unavailable' }])
  }
})

test('Quipu: estados no declarados (500, 404) siguen siendo proveedor no disponible', async () => {
  for (const status of [500, 404]) {
    const r = await attempt('quipu', json(status, 'x'))
    assert.deepEqual([r.status, r.body], [502, { error: 'provider_unavailable' }])
  }
})

test('sin regla de fallo en el contrato, el comportamiento anterior no cambia (400 → no disponible)', async () => {
  const { failure: _f, ...withoutFailure } = quipuDevelopmentContract
  const r = await attempt('quipu', json(400, 'x'), withoutFailure)
  assert.deepEqual([r.status, r.body], [502, { error: 'provider_unavailable' }])
})

test('reglas de fallo inválidas bloquean el contrato (falla cerrada)', () => {
  for (const failure of [{}, { statuses: [] }, { statuses: [200] }, { statuses: [401] }, { statuses: ['400'] },
    { statuses: [500], path: ['success'] }, { statuses: [500], equals: false }, { statuses: [500], path: [], equals: false }]) {
    assert.throws(() => validateProviderContract({ ...quipufacDevelopmentContract, failure }, 'quipufac'),
      e => e.code === 'provider_contract_pending', JSON.stringify(failure))
  }
})
