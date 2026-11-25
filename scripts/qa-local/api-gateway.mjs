/**
 * Gateway local de QA, jamás destinado a producción.
 * Supabase Auth / client-login se simulan con cuentas reservadas .invalid; las tablas, RPC y RLS
 * de PostgreSQL pasan por PostgREST contra el PostgreSQL 17 desechable.
 * No imprime body, bearer tokens, claves ni credenciales.
 */
import { createServer } from 'node:http'
import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { readFileSync } from 'node:fs'

const secret = readFileSync(process.env.QA_JWT_SECRET_FILE, 'utf8').trim()
if (secret.length < 32) throw new Error('QA local secret file is missing or invalid')
const api = process.env.QA_POSTGREST_URL ?? 'http://127.0.0.1:54322'
const host = process.env.QA_GATEWAY_HOST ?? '127.0.0.1'
const port = Number(process.env.QA_GATEWAY_PORT ?? 54321)
const staff = new Map([
  ['superadmin@simulado.invalid', ['00000000-0000-4000-8000-0000000000c1', 'Superadmin Simulado', true]],
  ['admin@simulado.invalid', ['00000000-0000-4000-8000-0000000000c2', 'Admin Simulado', true]],
  ['developer@simulado.invalid', ['00000000-0000-4000-8000-0000000000c3', 'Developer Simulado', true]],
  ['viewer@simulado.invalid', ['00000000-0000-4000-8000-0000000000c4', 'Viewer Simulado', true]],
  ['inactive@simulado.invalid', ['00000000-0000-4000-8000-0000000000c5', 'Inactivo Simulado', false]],
  ['analista1@simulado.invalid', ['00000000-0000-4000-8000-0000000000d1', 'QA-FICTICIO Analista Uno', true]],
  ['analista2@simulado.invalid', ['00000000-0000-4000-8000-0000000000d2', 'QA-FICTICIO Analista Dos', true]],
])
const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url')
function sign(payload) {
  const head = b64({ alg: 'HS256', typ: 'JWT' })
  const body = b64(payload)
  return `${head}.${body}.${createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url')}`
}
function verify(token) {
  const parts = String(token ?? '').split('.')
  if (parts.length !== 3) return null
  const expected = createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest()
  let actual
  try { actual = Buffer.from(parts[2], 'base64url') } catch { return null }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
    return payload.exp > Math.floor(Date.now() / 1000) ? payload : null
  } catch { return null }
}
function tokenFor(role, sub, email, name) {
  const now = Math.floor(Date.now() / 1000)
  return sign({ iss: 'supabase', aud: 'authenticated', role, sub, email,
    user_metadata: { full_name: name }, app_metadata: { provider: 'email', providers: ['email'] },
    iat: now, exp: now + 3600 })
}
const now = Math.floor(Date.now() / 1000)
const anonKey = sign({ iss: 'supabase', role: 'anon', iat: now, exp: now + 86400 })
const serviceJwt = () => tokenFor('service_role', '00000000-0000-4000-8000-0000000000c1', 'qa-server@simulado.invalid', 'QA local server')
const hex = bytes => randomBytes(bytes).toString('hex')
const digest = value => createHash('sha256').update(value).digest('hex')
const readBody = req => new Promise((resolve, reject) => {
  const chunks = []; let n = 0
  req.on('data', c => { n += c.length; if (n > 3_000_000) { reject(new Error('body too large')); req.destroy(); return } chunks.push(c) })
  req.on('end', () => resolve(Buffer.concat(chunks)))
  req.on('error', reject)
})
const userFor = (id, email, name) => ({ id, email, aud: 'authenticated', role: 'authenticated',
  app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { full_name: name },
  created_at: '2026-11-25T00:00:00Z' })
const json = (res, status, value, headers = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-QA-Environment': 'local-postgresql17', ...headers })
  res.end(JSON.stringify(value))
}
function cors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*')
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,POST,PATCH,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'authorization, apikey, content-type, prefer, range, content-profile, accept-profile, x-client-info, x-upsert, x-supabase-api-version')
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, X-QA-Environment')
}
async function rpc(name, args, jwt = serviceJwt()) {
  const response = await fetch(`${api}/rpc/${name}`, { method: 'POST', headers: {
    apikey: anonKey, authorization: `Bearer ${jwt}`, 'content-type': 'application/json', 'accept-profile': 'public', 'content-profile': 'public',
  }, body: JSON.stringify(args) })
  const text = await response.text()
  let value
  try { value = text ? JSON.parse(text) : null } catch { value = null }
  if (!response.ok) throw Object.assign(new Error('local database RPC failed'), { status: response.status, value })
  return value
}
const server = createServer(async (req, res) => {
  cors(req, res)
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end() }
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`)
  if (url.pathname === '/qa/health') return json(res, 200, { environment: 'QA-FICTICIO', database: 'PostgreSQL 17 local', provider_authentication: 'simulated', production: false })

  if (url.pathname === '/auth/v1/token' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)).toString() || '{}')
    const account = staff.get(String(body.email ?? '').toLowerCase())
    if (body.password !== 'clave-simulada' || !account || !account[2])
      return json(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials' })
    const [id, name] = account, email = String(body.email).toLowerCase(), token = tokenFor('authenticated', id, email, name)
    const expires = Math.floor(Date.now() / 1000) + 3600
    return json(res, 200, { access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: expires,
      refresh_token: `qa-${hex(24)}`, user: userFor(id, email, name) })
  }
  if (url.pathname === '/auth/v1/user' && req.method === 'GET') {
    const claims = verify(String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, ''))
    const account = claims && staff.get(String(claims.email ?? '').toLowerCase())
    if (!claims || !account || !account[2] || claims.sub !== account[0]) return json(res, 401, { message: 'Invalid token' })
    return json(res, 200, userFor(account[0], String(claims.email).toLowerCase(), account[1]))
  }
  if (url.pathname === '/auth/v1/logout') { res.writeHead(204); return res.end() }
  if (url.pathname === '/auth/v1/refresh') return json(res, 400, { error: 'session_not_refreshable_in_local_qa' })

  if (url.pathname === '/functions/v1/client-login' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)).toString() || '{}')
    if (body.action === 'logout') {
      try { await rpc('client_logout', { p_session_token: body.session_token }) } catch {}
      return json(res, 200, { success: true })
    }
    if (body.action !== 'login') return json(res, 400, { error: 'invalid_request' })
    const provider = body.provider
    const valid = provider === 'quipu'
      ? body.ruc === '20999999901' && body.username === 'qaficticio' && body.password === 'clave-simulada'
      : provider === 'quipufac' && body.ruc === '20999999902' && body.password === 'clave-simulada'
    if (!valid) return json(res, 401, { error: 'invalid_credentials' })
    const token = hex(32), username = provider === 'quipu' ? String(body.username) : null
    const identity = {
      p_provider: provider, p_ruc: String(body.ruc), p_subject: username ?? 'company',
      p_subject_source: provider === 'quipu' ? 'username' : 'company', p_username: username,
      p_verified_name: null, p_token_hash: digest(token), p_expires_at: new Date(Date.now() + 8 * 3600_000).toISOString(),
    }
    try {
      const allowed = await rpc('client_login_throttle', { p_subject_key: digest(`subject:${provider}:${body.ruc}:${username ?? ''}`), p_ip_key: digest('ip:local-qa') })
      if (allowed !== true) return json(res, 429, { error: 'rate_limited' }, { 'Retry-After': '900' })
      await rpc('client_open_session', identity)
      const session = await rpc('client_session_info', { p_session_token: token })
      return json(res, 200, { session_token: token, session })
    } catch (error) {
      console.error(`QA client-login database error: http=${error.status ?? 0} code=${error.value?.code ?? 'unknown'}`)
      return json(res, error.status ?? 503, error.status === 429 ? { error: 'rate_limited' } : { error: 'client_backend_unavailable' })
    }
  }

  // The REST/RPC surface below is PostgREST backed by the disposable PostgreSQL cluster.
  const headers = new Headers()
  for (const name of ['authorization', 'apikey', 'content-type', 'accept', 'prefer', 'range', 'content-profile', 'accept-profile', 'x-client-info', 'x-supabase-api-version']) {
    if (req.headers[name]) headers.set(name, req.headers[name])
  }
  let body
  if (!['GET', 'HEAD'].includes(req.method)) body = await readBody(req)
  try {
    const restPath = url.pathname.startsWith('/rest/v1/') ? url.pathname.slice('/rest/v1'.length) + url.search : req.url
    const upstream = await fetch(`${api}${restPath}`, { method: req.method, headers, body: body?.length ? body : undefined })
    res.statusCode = upstream.status
    for (const [key, value] of upstream.headers) if (!['connection', 'transfer-encoding', 'content-encoding'].includes(key.toLowerCase())) res.setHeader(key, value)
    res.setHeader('X-QA-Environment', 'local-postgresql17')
    res.end(Buffer.from(await upstream.arrayBuffer()))
  } catch {
    return json(res, 503, { code: 'QA_DATABASE_UNAVAILABLE', message: 'PostgreSQL local no disponible' })
  }
})
server.listen(port, host, () => console.log(`QA local gateway listening at http://${host}:${port}; no request bodies or tokens are logged`))
