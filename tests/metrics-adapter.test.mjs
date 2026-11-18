import test from 'node:test'
import assert from 'node:assert/strict'
import { createMetricsAdapter, METRICS_CONTRACT, limaMonth } from '../src/lib/metrics-adapter.ts'

const client = response => { const calls = []; return { calls, rpc: async (name, args) => { calls.push({ name, args }); return response } } }
const row = { requester_name: 'Persona ficticia', studio_id: '10000000-0000-4000-8000-000000000001', studio_name: 'ESTUDIO FICTICIO',
  month: '2026-11', total_requests: 8, urgent_requests: 3, urgent_pct: 37.5 }

test('contract not yet published (PGRST202 / 42883) → pending_contract, never invented data', async () => {
  for (const code of ['PGRST202', '42883']) {
    const m = createMetricsAdapter(client({ data: null, error: { code } }))
    assert.deepEqual(await m.requesterUrgency('r', '2026-11'), { state: 'pending_contract' })
    assert.deepEqual(await m.monthlyUrgency('2026-11'), { state: 'pending_contract' })
    assert.deepEqual(await m.timeAverages({ periodDays: null, studioId: null }), { state: 'pending_contract' })
  }
})

test('valid server rows are passed through unchanged, with the expected RPC arguments', async () => {
  const c = client({ data: row, error: null })
  assert.deepEqual(await createMetricsAdapter(c).requesterUrgency('req-uuid', '2026-11'), { state: 'ready', data: row })
  assert.deepEqual(c.calls[0], { name: METRICS_CONTRACT.requesterUrgency, args: { p_request_id: 'req-uuid', p_month: '2026-11' } })
  const list = client({ data: [row, { ...row, requester_name: 'Otra', total_requests: 0, urgent_requests: 0, urgent_pct: null }], error: null })
  const r = await createMetricsAdapter(list).monthlyUrgency('2026-11')
  assert.equal(r.state, 'ready'); assert.equal(r.data.length, 2)
  const avg = client({ data: { completed_count: 0, avg_cycle_time_days: null, avg_lead_time_days: null }, error: null })
  assert.equal((await createMetricsAdapter(avg).timeAverages({ periodDays: 30, studioId: null })).state, 'ready')
  assert.deepEqual(avg.calls[0].args, { p_period_days: 30, p_studio_id: null })
})

test('incoherent responses are rejected instead of displayed', async () => {
  const bad = [
    { ...row, urgent_requests: 9 },            // más urgentes que solicitudes
    { ...row, urgent_pct: 140 },               // porcentaje fuera de rango
    { ...row, urgent_pct: null },              // null con solicitudes > 0
    { ...row, month: '2026-13' },
    { ...row, total_requests: -1 },
    { ...row, total_requests: 2.5 },
  ]
  for (const data of bad) assert.equal((await createMetricsAdapter(client({ data, error: null })).requesterUrgency('r', '2026-11')).state, 'error')
  assert.equal((await createMetricsAdapter(client({ data: { completed_count: 1, avg_cycle_time_days: -2, avg_lead_time_days: 1 }, error: null })).timeAverages({ periodDays: null, studioId: null })).state, 'error')
  assert.equal((await createMetricsAdapter(client({ data: [row, { foo: 1 }], error: null })).monthlyUrgency('2026-11')).state, 'error')
})

test('requester urgency null (no study / not REQ) is a valid «no data» answer', async () => {
  assert.deepEqual(await createMetricsAdapter(client({ data: null, error: null })).requesterUrgency('r', '2026-11'), { state: 'ready', data: null })
  assert.equal((await createMetricsAdapter(client({ data: null, error: null })).monthlyUrgency('2026-11')).state, 'error')
})

test('time averages accept server sample sizes', async () => {
  const data = { completed_count: 3, avg_cycle_time_days: 1.25, avg_lead_time_days: 2.5, cycle_sample_size: 2, lead_sample_size: 3 }
  assert.deepEqual(await createMetricsAdapter(client({ data, error: null })).timeAverages({ periodDays: null, studioId: null }), { state: 'ready', data })
  assert.equal((await createMetricsAdapter(client({ data: { ...data, cycle_sample_size: -1 }, error: null })).timeAverages({ periodDays: null, studioId: null })).state, 'error')
})

test('other server errors and network failures → error state', async () => {
  assert.equal((await createMetricsAdapter(client({ data: null, error: { code: '42501' } })).monthlyUrgency('2026-11')).state, 'error')
  const throwing = { rpc: async () => { throw new Error('network') } }
  assert.equal((await createMetricsAdapter(throwing).monthlyUrgency('2026-11')).state, 'error')
})

test('Lima month boundary', () => {
  assert.equal(limaMonth(new Date('2026-12-01T03:00:00Z')), '2026-11')   // 22:00 del 30/11 en Lima
  assert.equal(limaMonth(new Date('2026-12-01T06:00:00Z')), '2026-12')
})
