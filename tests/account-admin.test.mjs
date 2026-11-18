import test from 'node:test'
import assert from 'node:assert/strict'
import { accountAdminHandler } from '../supabase/functions/_shared/account-admin.mjs'

const actor = '00000000-0000-4000-8000-000000000001'
const target = '00000000-0000-4000-8000-000000000002'
const requestId = '10000000-0000-4000-8000-000000000001'
const body = { action: 'create', request_id: requestId, email: 'fixture@example.invalid',
  full_name: 'Synthetic fixture', role: 'viewer', password: 'synthetic-test-password' }
function fixture({ jwtError = false, state = 'reserved', claimed = true, rpcError, authError = false, inviteUrl } = {}) {
  const calls = []
  const client = {
    auth: {
      async getUser(token) { calls.push(['verify', token]); return { data: { user: jwtError ? null : { id: actor, user_metadata: { role: 'superadmin' } } }, error: jwtError } },
      admin: {
        async createUser(value) { calls.push(['create', value]); return { data: { user: authError ? null : { id: target } }, error: authError ? { message: 'private-token private-password private-email' } : null } },
        async inviteUserByEmail(email, value) { calls.push(['invite', email, value]); return { data: { user: { id: target } }, error: null } },
      },
    },
    async rpc(name, args) {
      calls.push([name, args])
      return { data: name === 'admin_account_begin' ? { state, claimed, user_id: target } : target,
        error: rpcError ? { code: rpcError, message: 'private-token' } : null }
    },
  }
  const handler = accountAdminHandler({ client, allowedOrigins: ['https://fixture.invalid'], inviteRedirectUrl: inviteUrl })
  const send = (value = body, headers = {}) => handler(new Request('https://function.invalid', {
    method: 'POST', headers: { authorization: 'Bearer synthetic-jwt', 'content-type': 'application/json', ...headers }, body: JSON.stringify(value),
  }))
  return { calls, handler, send }
}

test('missing/invalid bearer cannot reach RPCs or Auth Admin API', async () => {
  const f = fixture({ jwtError: true })
  assert.equal((await f.send()).status, 401)
  assert.deepEqual(f.calls.map(x => x[0]), ['verify'])
  const g = fixture()
  assert.equal((await g.send(body, { authorization: '' })).status, 401)
  assert.equal(g.calls.length, 0)
})
test('DB denies a signed viewer despite superadmin user_metadata', async () => {
  const f = fixture({ rpcError: '42501' })
  assert.equal((await f.send()).status, 403)
  assert.equal(f.calls.some(x => x[0] === 'create'), false)
})
test('actor/activation injection and non-allowlisted origins are rejected', async () => {
  const f = fixture()
  assert.equal((await f.send({ ...body, actor_id: target })).status, 400)
  assert.equal((await f.send({ ...body, is_active: true })).status, 400)
  assert.equal((await f.send(body, { origin: 'https://untrusted.invalid' })).status, 403)
  assert.equal(f.calls.some(x => x[0] === 'admin_account_begin'), false)
})
test('successful create binds verified actor and never puts roles in Auth metadata', async () => {
  const f = fixture()
  const result = await f.send()
  assert.equal(result.status, 201)
  assert.deepEqual(await result.json(), { id: target, request_id: requestId })
  const create = f.calls.find(x => x[0] === 'create')[1]
  assert.deepEqual(create.user_metadata, { full_name: body.full_name })
  assert.equal(create.email_confirm, true)
  assert.equal(f.calls.find(x => x[0] === 'admin_account_begin')[1].p_actor_id, actor)
  assert.equal(f.calls.find(x => x[0] === 'admin_account_record')[1].p_user_id, target)
})
test('completed/recoverable jobs do not create another Auth identity', async () => {
  for (const state of ['completed', 'auth_created']) {
    const f = fixture({ state, claimed: false })
    assert.equal((await f.send()).status, 200)
    assert.equal(f.calls.some(x => x[0] === 'create'), false)
  }
})
test('uncertain reserved job requires manual review instead of duplicate creation', async () => {
  const f = fixture({ claimed: false })
  const result = await f.send()
  assert.equal(result.status, 409)
  assert.equal(f.calls.some(x => x[0] === 'create'), false)
})
test('Auth errors do not disclose upstream messages or run finalization', async () => {
  const f = fixture({ authError: true })
  const result = await f.send()
  assert.equal(result.status, 409)
  const text = await result.text()
  assert.equal(text.includes('private-'), false)
  assert.equal(f.calls.some(x => x[0] === 'admin_account_finish'), false)
})
test('invites require configured HTTPS redirect and never accept a password', async () => {
  const { password: _, ...invite } = { ...body, action: 'invite' }
  const f = fixture()
  assert.equal((await f.send(invite)).status, 503)
  assert.equal(f.calls.some(x => x[0] === 'invite'), false)
  const g = fixture({ inviteUrl: 'https://fixture.invalid/accepted' })
  assert.equal((await g.send({ ...invite, password: 'rejected' })).status, 400)
  assert.equal((await g.send(invite)).status, 201)
  assert.equal(g.calls.some(x => x[0] === 'create'), false)
})
test('short password and oversized bodies fail before account reservation', async () => {
  const f = fixture()
  assert.equal((await f.send({ ...body, password: 'short' })).status, 400)
  assert.equal((await f.send({ ...body, full_name: 'x'.repeat(20000) })).status, 413)
  assert.equal(f.calls.some(x => x[0] === 'admin_account_begin'), false)
})
test('resume uses verified actor and creates no Auth account', async () => {
  const f = fixture()
  assert.equal((await f.send({ action: 'resume', request_id: requestId })).status, 200)
  assert.deepEqual(f.calls.map(x => x[0]), ['verify', 'admin_account_finish'])
})
