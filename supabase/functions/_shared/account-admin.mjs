const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const roles = new Set(['superadmin', 'admin', 'developer', 'viewer'])

class Rejected extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code }
}
const reject = (status, code) => { throw new Rejected(status, code) }

async function bodyJson(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) reject(415, 'json_required')
  const reader = request.body?.getReader()
  if (!reader) reject(400, 'invalid_request')
  const chunks = []; let length = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      length += value.length
      if (length > 16384) { await reader.cancel(); reject(413, 'request_too_large') }
      chunks.push(value)
    }
    const bytes = new Uint8Array(length); let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    const result = JSON.parse(new TextDecoder().decode(bytes))
    if (!result || typeof result !== 'object' || Array.isArray(result)) reject(400, 'invalid_request')
    return result
  } catch (error) {
    if (error instanceof Rejected) throw error
    reject(400, 'invalid_request')
  } finally { reader.releaseLock() }
}

/**
 * Dependencies are server-only. No bootstrap route or raw Auth responses.
 * @param {{client: any, allowedOrigins?: string[], inviteRedirectUrl?: string}} options
 */
export function accountAdminHandler({ client, allowedOrigins = [], inviteRedirectUrl }) {
  return async request => {
    const origin = request.headers.get('origin')
    const cors = { Vary: 'Origin', 'Cache-Control': 'no-store' }
    if (origin && allowedOrigins.includes(origin)) {
      cors['Access-Control-Allow-Origin'] = origin
      cors['Access-Control-Allow-Headers'] = 'authorization, apikey, content-type, x-client-info'
      cors['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
    }
    const response = (status, value) => new Response(JSON.stringify(value), {
      status, headers: { ...cors, 'Content-Type': 'application/json' },
    })
    let requestId
    async function rpc(name, args) {
      const { data, error } = await client.rpc(name, args)
      if (error) {
        if (error.code === '42501') reject(403, 'forbidden')
        if (error.code === '22023') reject(400, 'invalid_request')
        if (['23514', '23505'].includes(error.code)) reject(409, 'reconciliation_required')
        reject(503, 'backend_unavailable')
      }
      return data
    }
    try {
      if (origin && !allowedOrigins.includes(origin)) reject(403, 'origin_denied')
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
      if (request.method !== 'POST') reject(405, 'method_not_allowed')
      const bearer = request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1]
      if (!bearer || bearer.length > 8192) reject(401, 'authentication_required')
      const verified = await client.auth.getUser(bearer)
      if (verified.error || !verified.data.user?.id) reject(401, 'authentication_required')
      const actorId = verified.data.user.id // Never a body field or user_metadata role.
      const input = await bodyJson(request)
      requestId = input.request_id
      if (typeof requestId !== 'string' || !uuid.test(requestId)) reject(400, 'invalid_request')
      if (input.action === 'resume') {
        if (Object.keys(input).some(key => !['action', 'request_id'].includes(key))) reject(400, 'invalid_request')
        const id = await rpc('admin_account_finish', { p_actor_id: actorId, p_request_id: requestId })
        return response(200, { id, request_id: requestId })
      }
      const allowed = ['action', 'request_id', 'email', 'full_name', 'role', 'password']
      if (Object.keys(input).some(key => !allowed.includes(key))) reject(400, 'invalid_request')
      if (!['create', 'invite'].includes(input.action) || !roles.has(input.role)) reject(400, 'invalid_request')
      const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
      const name = typeof input.full_name === 'string' ? input.full_name.trim() : ''
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320 || !name || name.length > 200) reject(400, 'invalid_request')
      if (input.action === 'create' && (typeof input.password !== 'string' || input.password.length < 12 || input.password.length > 128)) reject(400, 'password_policy')
      if (input.action === 'invite') {
        if ('password' in input) reject(400, 'invalid_request')
        if (!inviteRedirectUrl) reject(503, 'invitation_not_configured')
        const redirect = new URL(inviteRedirectUrl)
        if (redirect.protocol !== 'https:') reject(503, 'invitation_not_configured')
      }
      const job = await rpc('admin_account_begin', { p_actor_id: actorId, p_request_id: requestId,
        p_mode: input.action, p_email: email, p_full_name: name, p_role: input.role })
      if (job.state === 'completed') return response(200, { id: job.user_id, request_id: requestId })
      if (job.state === 'auth_created') {
        const id = await rpc('admin_account_finish', { p_actor_id: actorId, p_request_id: requestId })
        return response(200, { id, request_id: requestId })
      }
      if (!job.claimed) reject(409, 'reconciliation_required')
      const created = input.action === 'create'
        ? await client.auth.admin.createUser({ email, password: input.password, email_confirm: true, user_metadata: { full_name: name } })
        : await client.auth.admin.inviteUserByEmail(email, { data: { full_name: name }, redirectTo: inviteRedirectUrl })
      if (created.error || !created.data.user?.id) reject(409, 'auth_outcome_requires_review')
      await rpc('admin_account_record', { p_actor_id: actorId, p_request_id: requestId, p_user_id: created.data.user.id })
      const id = await rpc('admin_account_finish', { p_actor_id: actorId, p_request_id: requestId })
      return response(201, { id, request_id: requestId })
    } catch (error) {
      // Never serialize exceptions, emails, passwords, tokens or Auth response bodies.
      return response(error instanceof Rejected ? error.status : 503,
        { error: error instanceof Rejected ? error.code : 'operation_requires_review',
          ...(typeof requestId === 'string' && uuid.test(requestId) ? { request_id: requestId } : {}) })
    }
  }
}
