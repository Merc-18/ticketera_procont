/** Server-only provider adapter. Contracts require reviewed provider evidence. */
const providers = new Set(['quipu', 'quipufac'])
const rucPattern = /^\d{11}$/
const tokenPattern = /^[a-f0-9]{64}$/
class Rejected extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code }
}
const reject = (status, code) => { throw new Rejected(status, code) }
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const bounded = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max
const keys = (input, allowed) => {
  if (Object.keys(input).some(key => !allowed.includes(key))) reject(400, 'invalid_request')
}

async function jsonBody(body, limit) {
  const reader = body?.getReader()
  if (!reader) reject(400, 'invalid_json')
  let size = 0
  const chunks = []
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) { await reader.cancel(); reject(413, 'body_too_large') }
      chunks.push(value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    const value = JSON.parse(new TextDecoder().decode(bytes))
    if (!object(value)) reject(400, 'invalid_json')
    return value
  } catch (error) {
    if (error instanceof Rejected) throw error
    reject(400, 'invalid_json')
  } finally { reader.releaseLock() }
}

function pathValue(value, path) {
  if (!Array.isArray(path) || path.length < 1 || path.length > 12 ||
      path.some(key => !bounded(key, 100) || ['__proto__', 'constructor', 'prototype'].includes(key))) {
    reject(503, 'provider_contract_pending')
  }
  for (const key of path) {
    if (!object(value) || !Object.hasOwn(value, key)) return undefined
    value = value[key]
  }
  return value
}

/** Config must come from a verified provider response, never from browser input.
 * A fixture contract in tests is not evidence of either external API's format.
 */
export function validateProviderContract(contract, provider) {
  if (!object(contract) || contract.version !== 1 || contract.provider !== provider ||
      !bounded(contract.verifiedReference, 300) || !object(contract.success)) reject(503, 'provider_contract_pending')
  const matchesInput = Object.hasOwn(contract.success, 'equalsInput')
  if (matchesInput ? provider !== 'quipu' || contract.success.equalsInput !== 'username' ||
      Object.hasOwn(contract.success, 'equals') :
      !['boolean', 'string', 'number'].includes(typeof contract.success.equals)) reject(503, 'provider_contract_pending')
  pathValue({}, contract.success.path)
  pathValue({}, contract.tokenPath)
  for (const key of ['rucPath', 'subjectPath', 'namePath']) if (contract[key] !== undefined) pathValue({}, contract[key])
  if (provider === 'quipu' && !contract.subjectPath && contract.allowUsernameFallback !== true) {
    reject(503, 'provider_contract_pending')
  }
  return contract
}

export function adaptProviderResponse(provider, body, input, contract) {
  validateProviderContract(contract, provider)
  const providerToken = pathValue(body, contract.tokenPath)
  const expected = contract.success.equalsInput ? input.username : contract.success.equals
  if (contract.success.equalsInput && (!bounded(expected, 256) || !expected.trim())) reject(401, 'invalid_credentials')
  if (!object(body) || pathValue(body, contract.success.path) !== expected ||
      !bounded(providerToken, 16384) || !providerToken.trim()) reject(401, 'invalid_credentials')
  if (contract.rucPath && pathValue(body, contract.rucPath) !== input.ruc) reject(401, 'provider_identity_mismatch')
  const name = contract.namePath ? pathValue(body, contract.namePath) : null
  if (name !== null && name !== undefined && !bounded(name, 300)) reject(502, 'provider_response_invalid')
  let subject = 'company', source = 'company'
  if (provider === 'quipu') {
    if (contract.subjectPath) {
      const value = pathValue(body, contract.subjectPath)
      if (!((bounded(value, 256) && value.trim()) || (Number.isSafeInteger(value) && value >= 0))) reject(502, 'provider_response_invalid')
      subject = String(value); source = 'provider_id'
    } else { subject = input.username; source = 'username' }
  }
  // The upstream token and response are deliberately discarded, never returned or stored.
  return { p_provider: provider, p_ruc: input.ruc, p_subject: subject, p_subject_source: source,
    p_username: provider === 'quipu' ? input.username : null, p_verified_name: name?.trim() || null }
}

export async function digestToken(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}
function randomToken() {
  return [...crypto.getRandomValues(new Uint8Array(32))].map(byte => byte.toString(16).padStart(2, '0')).join('')
}
async function equalSecret(received, expected) {
  if (!bounded(expected, 4096) || expected.length < 32 || !bounded(received, 4096)) return false
  const [a, b] = await Promise.all([digestToken(received), digestToken(expected)])
  let difference = 0
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return difference === 0
}

/** All options and provider contracts are private Edge environment configuration.
 * @param {{ client: any, providerUrls?: Record<string, string | undefined>,
 * providerContracts?: Record<string, unknown>, platformSecrets?: Record<string, string | undefined>,
 * allowedOrigins?: string[], fetchImpl?: typeof fetch, now?: () => number, timeoutMs?: number }} options
 */
export function clientLoginHandler({ client, providerUrls = {}, providerContracts = {}, platformSecrets = {},
  allowedOrigins = [], fetchImpl = fetch, now = () => Date.now(), timeoutMs = 10000 }) {
  return async request => {
    const origin = request.headers.get('origin')
    const cors = { Vary: 'Origin', 'Cache-Control': 'no-store', 'Content-Type': 'application/json' }
    if (origin && allowedOrigins.includes(origin)) {
      cors['Access-Control-Allow-Origin'] = origin
      cors['Access-Control-Allow-Headers'] = 'authorization, apikey, content-type, x-client-info'
      cors['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
    }
    const reply = (status, data) => new Response(JSON.stringify(data), { status, headers: cors })
    async function rpc(name, args) {
      const { data, error } = await client.rpc(name, args)
      if (error) {
        if (['PT401', '42501'].includes(error.code)) reject(401, 'client_authentication_required')
        if (error.code === '22023') reject(400, 'invalid_request')
        reject(503, 'client_backend_unavailable')
      }
      return data
    }
    async function sessionReply(token) {
      const session = await rpc('client_session_info', { p_session_token: token })
      return reply(200, { session_token: token, session })
    }
    try {
      if (origin && !allowedOrigins.includes(origin)) reject(403, 'origin_denied')
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
      if (request.method !== 'POST') reject(405, 'method_not_allowed')
      if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) reject(415, 'json_required')
      const input = await jsonBody(request.body, 16384)
      const provider = input.provider
      if (!providers.has(provider)) reject(400, 'invalid_provider')
      if (input.action === 'exchange') {
        keys(input, ['action', 'provider', 'code'])
        if (!tokenPattern.test(input.code ?? '')) reject(400, 'invalid_entry_code')
        const token = randomToken()
        await rpc('client_exchange_entry_code', { p_provider: provider, p_code_hash: await digestToken(input.code),
          p_token_hash: await digestToken(token), p_expires_at: new Date(now() + 8 * 3600000).toISOString() })
        return await sessionReply(token)
      }
      if (input.action === 'issue_code') {
        keys(input, ['action', 'provider', 'ruc', 'subject', 'subject_source', 'username', 'verified_name'])
        // Browser requests are never producers, even when they know an existing client token.
        if (origin) reject(403, 'platform_server_required')
        const bearer = request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1]
        if (!await equalSecret(bearer, platformSecrets[provider])) reject(401, 'platform_authentication_required')
        if (typeof input.ruc !== 'string' || !rucPattern.test(input.ruc)) reject(400, 'invalid_ruc')
        if (provider === 'quipu' && (!bounded(input.subject, 256) || !bounded(input.username, 256) ||
            !['provider_id', 'username'].includes(input.subject_source) ||
            (input.subject_source === 'username' && input.subject !== input.username))) reject(400, 'invalid_identity')
        if (provider === 'quipufac' && ['subject', 'subject_source', 'username'].some(key => input[key] !== undefined)) reject(400, 'invalid_identity')
        if (input.verified_name !== undefined && !bounded(input.verified_name, 300)) reject(400, 'invalid_identity')
        const code = randomToken(), expires = new Date(now() + 60000).toISOString()
        await rpc('client_issue_entry_code', { p_provider: provider, p_ruc: input.ruc,
          p_subject: provider === 'quipu' ? input.subject : 'company',
          p_subject_source: provider === 'quipu' ? input.subject_source : 'company',
          p_username: provider === 'quipu' ? input.username : null, p_verified_name: input.verified_name?.trim() || null,
          p_code_hash: await digestToken(code), p_expires_at: expires })
        return reply(200, { code, provider, expires_at: expires })
      }
      if (input.action !== 'login') reject(400, 'invalid_action')
      keys(input, ['action', 'provider', 'ruc', 'username', 'password'])
      if (typeof input.ruc !== 'string' || !rucPattern.test(input.ruc)) reject(400, 'invalid_ruc')
      if (!bounded(input.password, 4096) || (provider === 'quipu' &&
          (!bounded(input.username, 256) || input.username !== input.username.trim())) ||
          (provider === 'quipufac' && input.username !== undefined)) reject(400, 'invalid_credentials_input')
      const contract = validateProviderContract(providerContracts[provider], provider)
      let url
      try { url = new URL(providerUrls[provider]) } catch { reject(503, 'provider_configuration_required') }
      if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search) reject(503, 'provider_configuration_required')
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      let identity
      try {
        const body = provider === 'quipu' ? { ruc: input.ruc, username: input.username, password: input.password }
          : { username: input.ruc, password: input.password }
        const upstream = await fetchImpl(url.toString(), { method: 'POST', redirect: 'error', signal: controller.signal,
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) })
        if (upstream.status === 401 || upstream.status === 403) reject(401, 'invalid_credentials')
        if (!upstream.ok) reject(502, 'provider_unavailable')
        if (!upstream.headers.get('content-type')?.toLowerCase().includes('application/json')) reject(502, 'provider_response_invalid')
        let response
        try { response = await jsonBody(upstream.body, 65536) }
        catch { reject(502, 'provider_response_invalid') }
        identity = adaptProviderResponse(provider, response, input, contract)
      } catch (error) {
        if (error instanceof Rejected) throw error
        reject(502, 'provider_unavailable')
      } finally { clearTimeout(timer); delete input.password }
      const token = randomToken()
      await rpc('client_open_session', { ...identity, p_token_hash: await digestToken(token),
        p_expires_at: new Date(now() + 8 * 3600000).toISOString() })
      return await sessionReply(token)
    } catch (error) {
      // Never serialize exception messages, upstream bodies, credentials or tokens.
      if (error instanceof Rejected) return reply(error.status, { error: error.code })
      return reply(503, { error: 'client_backend_unavailable' })
    }
  }
}
