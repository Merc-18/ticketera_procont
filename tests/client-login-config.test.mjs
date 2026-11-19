// Configuración de proveedores de client-login: sin valores por defecto ni API de desarrollo implícitas.
import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveProviderConfig } from '../supabase/functions/_shared/client-login-config.mjs'
import { clientLoginHandler } from '../supabase/functions/_shared/client-login.mjs'
import { quipuDevelopmentContract, quipufacDevelopmentContract } from '../supabase/functions/_shared/client-provider-contracts.mjs'

globalThis.fetch = () => { throw new Error('Network access forbidden in config tests') }
const env = values => name => values[name]
const DEV = { QUIPU_AUTH_URL: 'https://api-gestion-test.quipufac.com/api/users/auth', QUIPUFAC_AUTH_URL: 'https://dev.quipufac.com/auth/login' }
const PROD_CONTRACT = { version: 1, provider: 'quipu', verifiedReference: 'revisión ficticia', success: { path: ['ok'], equals: true },
  tokenPath: ['token'], allowUsernameFallback: true }

test('sin variables: ningún proveedor configurado (antes se usaban las API de desarrollo por defecto)', () => {
  assert.deepEqual(resolveProviderConfig(env({})), {
    providerUrls: { quipu: undefined, quipufac: undefined }, providerContracts: { quipu: undefined, quipufac: undefined } })
})

test('URL de desarrollo configurada sin el permiso local explícito se descarta (URL y contrato)', () => {
  for (const contract of [undefined, 'development', JSON.stringify(PROD_CONTRACT)]) {
    const r = resolveProviderConfig(env({ ...DEV, QUIPU_AUTH_RESPONSE_CONTRACT: contract, QUIPUFAC_AUTH_RESPONSE_CONTRACT: contract }))
    assert.deepEqual(r.providerUrls, { quipu: undefined, quipufac: undefined })
    assert.deepEqual(r.providerContracts, { quipu: undefined, quipufac: undefined })
  }
  // También variantes del host de desarrollo de QuipuFac.
  const alt = resolveProviderConfig(env({ QUIPUFAC_AUTH_URL: 'https://api-dev.quipufac.com/auth/login', QUIPUFAC_AUTH_RESPONSE_CONTRACT: 'development' }))
  assert.equal(alt.providerUrls.quipufac, undefined)
})

test('solo con CLIENT_LOGIN_ALLOW_DEVELOPMENT_PROVIDERS=1 y contrato «development» explícito se usan las de desarrollo', () => {
  const local = resolveProviderConfig(env({ ...DEV, CLIENT_LOGIN_ALLOW_DEVELOPMENT_PROVIDERS: '1',
    QUIPU_AUTH_RESPONSE_CONTRACT: 'development', QUIPUFAC_AUTH_RESPONSE_CONTRACT: 'development' }))
  assert.deepEqual(local.providerUrls, { quipu: DEV.QUIPU_AUTH_URL, quipufac: DEV.QUIPUFAC_AUTH_URL })
  assert.deepEqual(local.providerContracts, { quipu: quipuDevelopmentContract, quipufac: quipufacDevelopmentContract })
  // El permiso sin contrato explícito no activa ningún contrato.
  const flagOnly = resolveProviderConfig(env({ ...DEV, CLIENT_LOGIN_ALLOW_DEVELOPMENT_PROVIDERS: '1' }))
  assert.deepEqual(flagOnly.providerContracts, { quipu: undefined, quipufac: undefined })
})

test('«development» nunca se aplica a una URL que no sea la de desarrollo exacta', () => {
  const r = resolveProviderConfig(env({ QUIPU_AUTH_URL: 'https://quipu.example.invalid/auth', QUIPU_AUTH_RESPONSE_CONTRACT: 'development',
    CLIENT_LOGIN_ALLOW_DEVELOPMENT_PROVIDERS: '1' }))
  assert.equal(r.providerUrls.quipu, 'https://quipu.example.invalid/auth')
  assert.equal(r.providerContracts.quipu, undefined)
})

test('producción: URL y contrato JSON explícitos; JSON inválido bloquea', () => {
  const ok = resolveProviderConfig(env({ QUIPU_AUTH_URL: 'https://quipu.example.invalid/auth', QUIPU_AUTH_RESPONSE_CONTRACT: JSON.stringify(PROD_CONTRACT) }))
  assert.deepEqual(ok.providerContracts.quipu, PROD_CONTRACT)
  const bad = resolveProviderConfig(env({ QUIPU_AUTH_URL: 'https://quipu.example.invalid/auth', QUIPU_AUTH_RESPONSE_CONTRACT: '{no-json' }))
  assert.equal(bad.providerContracts.quipu, undefined)
})

test('sin configuración de producción el login falla de forma segura antes de contactar proveedor o base', async () => {
  const calls = [], external = []
  const handler = clientLoginHandler({ client: { rpc: async (...a) => { calls.push(a); return { data: null, error: null } } },
    ...resolveProviderConfig(env({})), allowedOrigins: ['https://ticketera-procont.vercel.app'], throttle: true,
    fetchImpl: async (...a) => { external.push(a); throw new Error('no debe llamarse') } })
  for (const body of [{ action: 'login', provider: 'quipu', ruc: '20000000001', username: 'Ficticio', password: 'ficticia' },
                      { action: 'login', provider: 'quipufac', ruc: '20000000001', password: 'ficticia' }]) {
    const response = await handler(new Request('https://x.invalid/functions/v1/client-login', { method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://ticketera-procont.vercel.app' }, body: JSON.stringify(body) }))
    assert.equal(response.status, 503)
    assert.deepEqual(await response.json(), { error: 'provider_contract_pending' })
  }
  assert.equal(external.length, 0); assert.equal(calls.length, 0)
})
