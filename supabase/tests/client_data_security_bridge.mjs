// Optional real SQL bridge for Agent 2's exact adapter, read only.
// Invoked only by client_data_security_local.py while its disposable server lives.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const f = JSON.parse(readFileSync(0, 'utf8'))
const files = ['src/lib/client-portal.ts', 'src/lib/client-request-data.ts', 'src/lib/rpc-attempt.ts',
  'src/lib/request-status.ts', 'contracts/client-access-client.mjs', 'contracts/client-access-client.d.mts']
const hashes = () => Object.fromEntries(files.map(p => [p, createHash('sha256').update(readFileSync(resolve(f.frontend, p))).digest('hex')]))
const before = hashes()
globalThis.fetch = () => { throw new Error('No external HTTP or provider login in SQL bridge') }
const { createClientPortal } = await import(pathToFileURL(resolve(f.frontend, files[0])))
const { createRpcAttempt } = await import(pathToFileURL(resolve(f.frontend, 'src/lib/rpc-attempt.ts')))
const { REQUESTED_PRIORITIES } = await import(pathToFileURL(resolve(f.frontend, 'src/lib/client-request-data.ts')))
const signatures = {
  client_session_info: { p_session_token: 'text' }, client_products: { p_session_token: 'text' },
  client_subprojects: { p_session_token: 'text', p_system_id: 'uuid' },
  client_submit_request: { p_session_token: 'text', p_payload: 'jsonb', p_idempotency_key: 'uuid' },
  client_list_tickets: { p_session_token: 'text', p_limit: 'integer', p_offset: 'integer' },
  client_ticket_detail: { p_session_token: 'text', p_request_id: 'uuid' }, client_logout: { p_session_token: 'text' },
}
const quote = value => "'" + String(value).replaceAll("'", "''") + "'"
const transport = {
  async rpc(name, args) {
    assert(Object.hasOwn(signatures, name))
    const spec = signatures[name]
    assert(Object.keys(args).every(k => Object.hasOwn(spec, k)))
    const params = Object.entries(args).map(([k, v]) => `${k} => ${v === null ? 'NULL' : quote(spec[k] === 'jsonb' ? JSON.stringify(v) : v)}::${spec[k]}`)
    try {
      const result = execFileSync(f.psql[0], f.psql.slice(1), {
        input: `SET ROLE anon; SET request.jwt.claim.sub=''; SELECT public.${name}(${params.join(',')});`,
        encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
      }).trim()
      return { data: result ? JSON.parse(result) : null, error: null }
    } catch (error) {
      const code = String(error.stderr).match(/ERROR:\s+([A-Z0-9]{5}):/)?.[1]
      assert(code, 'SQL transport failed without safe SQLSTATE')
      return { data: null, error: { code } }
    }
  },
  functions: { invoke() { throw new Error('External login is not part of this bridge') } },
}
const api = createClientPortal(transport, {
  upload() { throw new Error('No remote Storage') }, metadata() { throw new Error('No browser file') },
})
assert.deepEqual(REQUESTED_PRIORITIES, { low: 'Bajo', medium: 'Medio', high: 'Alto', urgent: 'Urgente' })
const a = await api.currentSession(f.a), fac = await api.currentSession(f.fac)
assert.equal(a.identity.username, 'Alpha')
assert.equal(fac.identity.kind, 'company_account')
assert(!fac.products.some(p => p.id === f.quipuProduct))
assert((await api.subprojects(f.fac, f.facProduct)).some(p => p.id === f.child && p.system_id === f.facProduct))
const input = { requester_name: 'Ignored untrusted manual value', system_id: f.other, subsystem_id: null,
  request_type_id: f.type, title: 'SQL bridge fictitious request', description: 'Disposable contract evidence',
  requested_priority: 'urgent', urgent_requested: false }
const ticket = await api.submitTicket(f.a, a, input, createRpcAttempt())
const own = await api.ticketDetail(f.a, ticket.id)
assert.equal(own.requester_name, 'Alpha')
assert.equal(own.requested_priority, 'urgent')
assert.equal(own.urgent_requested, false)
assert.equal(own.requester_name_source, 'username')
assert.equal(await api.ticketDetail(f.b, ticket.id), null)
assert.equal((await api.currentSession(f.b)).identity.username, 'alpha')
const all = []
for (let offset = 0; offset <= 120; offset += 40) all.push(...await api.listMyTickets(f.b, { limit: 40, offset }))
assert.equal(all.length, 106)
assert.equal(new Set(all.map(t => t.id)).size, 106)
assert(!all.some(t => t.id === ticket.id))
const declared = { ...input, requester_name: 'Declared bridge creator', system_id: f.facProduct,
  subsystem_id: f.child, requested_priority: 'high', urgent_requested: true }
const business = await api.submitTicket(f.fac, fac, declared, createRpcAttempt())
const shared = await api.ticketDetail(f.sameFac, business.id)
assert.equal(shared.requester_name, 'Declared bridge creator')
assert.equal(shared.requested_priority, 'high')
assert.equal(shared.urgent_requested, true)
assert.equal(shared.requested_subsystem_id, f.child)
assert((await api.listMyTickets(f.sameFac)).some(t => t.id === business.id && t.requester_name === 'Declared bridge creator'))
assert.equal(await api.ticketDetail(f.otherFac, business.id), null)
assert.equal(await api.ticketDetail(f.a, business.id), null)
await api.logout(f.logout)
await assert.rejects(api.listMyTickets(f.logout), e => e.code === 'session_expired')
assert.deepEqual(hashes(), before, 'Consumer source changed during SQL bridge')
console.log(JSON.stringify({ passed: true, source_sha256: before,
  capabilities_logged: false, http_requests: false, real_sql: true, simulated_rpc_responses: false }))
