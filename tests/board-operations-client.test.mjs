import test from 'node:test'
import assert from 'node:assert/strict'
import { createBoardOperations, DEVELOPMENT_PHASES } from '../contracts/board-operations-client.mjs'
function fixture(result = { data: {}, error: null }) {
  const calls = []
  const api = createBoardOperations({ async rpc(name, args) { calls.push([name, args]); return result } })
  return { api, calls }
}
test('new creation and approval use only Development, explicit principal, Medium default and no generated deadlines', async () => {
  const { api, calls } = fixture()
  const data = { title: 'Synthetic', description: 'Fixture', assigneeId: 'editor' }
  await api.createInternal(data, 'stable-key')
  await api.approve('request', data, 'another-key')
  for (const [, args] of calls) {
    assert.equal(args.p_payload.project_type, 'development')
    assert.equal(args.p_payload.assigned_dev, 'editor')
    assert.equal(args.p_payload.priority, 'medium')
    assert.equal('sla_target_date' in args.p_payload || 'due_date' in args.p_payload, false)
  }
  assert.deepEqual(DEVELOPMENT_PHASES, ['backlog','analysis','design','dev','code_review','testing','deploy','done'])
})
test('Done confirmation carries exact pending fingerprint and stable key; never writes legacy progress', async () => {
  const { api, calls } = fixture()
  await api.movePhase('ticket', 'done', 'same-key', { confirmPending: true, pendingFingerprint: 'revision-hash' })
  assert.deepEqual(calls[0], ['operate_board_ticket', { p_project_id: 'ticket', p_action: 'move_phase',
    p_payload: { to_phase: 'done', confirm_pending: true, pending_fingerprint: 'revision-hash' }, p_idempotency_key: 'same-key' }])
})
test('reopening requires an explicit reason payload; legacy flow selection remains supported', async () => {
  const { api, calls } = fixture()
  await api.reopen('ticket', 'design', 'Synthetic reason', 'stable-key', 'legacy-flow')
  assert.deepEqual(calls[0][1].p_payload, { flow_id: 'legacy-flow', to_phase: 'design', reason: 'Synthetic reason' })
})
test('assignment removal is explicit null and bulk has one server transaction command', async () => {
  const { api, calls } = fixture()
  await api.assign('ticket', null, 'withdraw-key')
  await api.bulk(['a', 'b'], 'archive', {}, 'batch-key')
  assert.equal(calls[0][1].p_payload.assignee_id, null)
  assert.equal(calls[1][0], 'operate_board_tickets')
  assert.equal(calls[1][1].p_idempotency_key, 'batch-key')
})
test('internal evidence reservation uses authenticated project contract without tracking/service secrets', async () => {
  const { api, calls } = fixture()
  await api.reserveEvidence('ticket', { name: 'fixture.pdf', size: 20, type: 'application/pdf' }, 'upload-key')
  assert.deepEqual(calls[0], ['reserve_board_evidence', { p_project_id: 'ticket', p_upload_key: 'upload-key',
    p_file_name: 'fixture.pdf', p_size_bytes: 20, p_mime_type: 'application/pdf' }])
})
test('errors never expose raw backend detail, retry or fall back to direct table writes', async () => {
  const { api, calls } = fixture({ data: null, error: { detail: 'private secret actor' } })
  await assert.rejects(api.block('ticket', 'Synthetic reason', 'key'), error => !error.message.includes('secret'))
  assert.equal(calls.length, 1)
})
