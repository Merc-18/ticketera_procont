import test from 'node:test'
import assert from 'node:assert/strict'
import { createTicketMetrics } from '../contracts/ticket-metrics-client.mjs'

test('empty performance and missing averages remain empty/null', async () => {
  const calls = []
  const adapter = createTicketMetrics({ async rpc(name, args) {
    calls.push([name, args])
    return { data: name === 'get_ticket_performance' ? [] : {
      avg_cycle_time_seconds: null, avg_lead_time_seconds: null, cycle_sample_size: 0, lead_sample_size: 0,
    }, error: null }
  } })
  assert.deepEqual(await adapter.performance(), [])
  assert.equal((await adapter.summary()).avg_cycle_time_seconds, null)
  assert.deepEqual(calls[0], ['get_ticket_performance', { p_studio_id: null }])
})

test('monthly query sends canonical studio UUID and month, with no inferred priority or identity', async () => {
  const calls = []
  const client = createTicketMetrics({ async rpc(name, args) { calls.push([name, args]); return { data: { requesters: [] }, error: null } } })
  await client.requesterUrgencyMonth('2026-11-01', 'synthetic-studio')
  assert.deepEqual(calls, [['get_requester_urgency_month', { p_month: '2026-11-01', p_studio_id: 'synthetic-studio' }]])
})

test('rejected/null queries stop without exposing backend details or retrying', async () => {
  let calls = 0
  for (const result of [{ data: null, error: { message: 'private requester secret' } }, { data: null, error: null }]) {
    const client = createTicketMetrics({ async rpc() { calls++; return result } })
    await assert.rejects(client.summary(), error => !error.message.includes('secret'))
  }
  assert.equal(calls, 2)
})
