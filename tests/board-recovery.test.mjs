import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createBoard } from '../src/lib/board.ts'
import { deliverBoardEvidence } from '../src/lib/attachment-delivery.ts'

globalThis.fetch = () => { throw new Error('No network in recovery tests') }
const fileA = new File(['document A'], 'fixture-a.pdf', { type: 'application/pdf' })
const fileB = new File(['document B'], 'fixture-b.pdf', { type: 'application/pdf' })
const items = [{ file: fileA, uploadKey: 'key-a' }, { file: fileB, uploadKey: 'key-b' }]
function storage(upload, list = async () => ({ data: [], error: null })) {
  return { storage: { from() { return { upload, list } } } }
}
const grant = (file, key) => ({ bucket: 'request-attachments', path: `fixture/${key}-${file.name}`,
  size_bytes: file.size, mime_type: file.type || 'application/pdf', expires_at: 'synthetic-expiration' })

test('Done retry preserves its operation key through Kanban after a lost reply', async () => {
  const seen = []
  let committed = false
  const api = createBoard({ async rpc(_name, args) {
    seen.push(args.p_idempotency_key)
    if (!committed) { committed = true; throw new Error('lost reply') }
    return { data: { project_status: 'completed' }, error: null }
  } })
  await assert.rejects(api.movePhase('ticket', 'done', 'retained-key', { confirmPending: true, pendingFingerprint: 'revision' }))
  assert.equal((await api.movePhase('ticket', 'done', 'retained-key', { confirmPending: true, pendingFingerprint: 'revision' })).project_status, 'completed')
  assert.deepEqual(seen, ['retained-key', 'retained-key'])
  const kanban = readFileSync('src/components/boards/KanbanBoard.tsx', 'utf8')
  const hook = readFileSync('src/hooks/useProjects.ts', 'utf8')
  assert.match(kanban, /const \{ ticket, flowId, key \} = pendingClose/)
  assert.match(kanban, /pendingFingerprint: ticket\.pending_fingerprint \}, key\)/)
  assert.match(hook, /board\.movePhase\(projectId, phase, key,/)
  // Preserve Claude's existing acknowledgement reset when the pending list changes.
  assert.match(kanban, /DoneConfirmDialog key=\{pendingClose\.ticket\.pending_fingerprint\}/)
})

test('concurrent snapshot and mutation errors retain each call’s own cause', async () => {
  const api = createBoard({ async rpc(name) {
    return { data: null, error: name === 'get_board_ticket'
      ? { code: '42501', message: 'permission denied' }
      : { code: '23514', message: 'Unblock before changing phase or finishing' } }
  } })
  const [snapshot, movement] = await Promise.allSettled([api.getTicket('ticket'), api.movePhase('ticket', 'testing', 'key')])
  assert.equal(snapshot.status, 'rejected'); assert.match(snapshot.reason.message, /permiso/)
  assert.equal(movement.status, 'rejected'); assert.match(movement.reason.message, /bloqueado/)
})

test('partial evidence retry skips delivered keys and retries only the pending file', async () => {
  const uploads = [], reservations = []
  let failB = true
  const client = storage(async (_path, file) => { uploads.push(file); return { error: file === fileB && failB ? {} : null } })
  const reserve = async (file, key) => { reservations.push(key); return grant(file, key) }
  const partial = await deliverBoardEvidence(client, reserve, items)
  assert.deepEqual(partial.uploadedKeys, ['key-a']); assert.deepEqual(partial.failed, [fileB.name])
  failB = false
  const retry = await deliverBoardEvidence(client, reserve, items, new Set(partial.uploadedKeys))
  assert.deepEqual(retry.failed, []); assert.deepEqual(retry.uploaded, [fileB.name])
  assert.deepEqual(reservations, ['key-a', 'key-b', 'key-b'])
  assert.deepEqual(uploads, [fileA, fileB, fileB])
  assert.deepEqual(retry.uploadedKeys, ['key-a', 'key-b'])
})

test('a lost upload acknowledgement is resolved by exact stored path, size and MIME without overwrite', async () => {
  const client = storage(async (_path, file, options) => {
    assert.equal(file, fileA); assert.equal(options.upsert, false)
    return { error: { message: 'duplicate object after lost reply' } }
  }, async (prefix, options) => {
    assert.equal(prefix, 'fixture'); assert.equal(options.search, `key-a-${fileA.name}`)
    return { data: [{ name: options.search, metadata: { size: fileA.size, mimetype: fileA.type } }], error: null }
  })
  const result = await deliverBoardEvidence(client, async (file, key) => grant(file, key), [items[0]])
  assert.deepEqual(result.uploadedKeys, ['key-a']); assert.deepEqual(result.failed, [])
})

test('an unrelated/mismatched stored object or failed lookup never becomes an acknowledged upload', async () => {
  for (const listed of [
    { data: [{ name: `key-a-${fileA.name}`, metadata: { size: 99, mimetype: fileA.type } }], error: null },
    { data: [{ name: 'other-object', metadata: { size: fileA.size, mimetype: fileA.type } }], error: null },
    { data: null, error: { message: 'private storage error' } },
  ]) {
    const client = storage(async () => ({ error: {} }), async () => listed)
    const result = await deliverBoardEvidence(client, async (file, key) => grant(file, key), [items[0]])
    assert.deepEqual(result.uploadedKeys, []); assert.deepEqual(result.failed, [fileA.name])
    assert.equal(result.error.includes('private'), false)
  }
})

test('a document without browser MIME uses the shared extension mapping without changing its bytes', async () => {
  const document = new File(['unchanged document'], 'fixture.PDF', { type: '' })
  let reservedMime
  const api = createBoard({ async rpc(name, args) {
    assert.equal(name, 'reserve_board_evidence'); reservedMime = args.p_mime_type
    return { data: grant(document, args.p_upload_key), error: null }
  } })
  const original = new Uint8Array(await document.arrayBuffer())
  const client = storage(async (_path, file, options) => {
    assert.equal(file, document); assert.equal(options.contentType, 'application/pdf')
    assert.deepEqual(new Uint8Array(await file.arrayBuffer()), original)
    return { error: null }
  })
  const result = await deliverBoardEvidence(client, (file, key) => api.reserveEvidence('ticket', file, key), [{ file: document, uploadKey: 'doc-key' }])
  assert.equal(reservedMime, 'application/pdf'); assert.deepEqual(result.failed, [])
})
