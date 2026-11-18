import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareAttachments, MAX_ATTACHMENTS, MAX_TOTAL_BYTES } from '../src/lib/attachment-prep.ts'
import { deliverAttachments } from '../src/lib/attachment-delivery.ts'
import { MAX_ATTACHMENT_FILES, MAX_ATTACHMENT_TOTAL_BYTES } from '../contracts/ticket-security-client.mjs'

const file = (name, type, size) => new File([new Uint8Array(size)], name, { type })
const compress = async (f, { quality }) => file(f.name.replace(/\.\w+$/, '.webp'), 'image/webp', Math.ceil(f.size * quality / 4))
const REQ = '10000000-0000-4000-8000-000000000001', TOKEN = '10000000-0000-4000-8000-000000000003'

// Cliente simulado con la forma de supabase-js: RPC de reserva + Storage.
function fakeClient({ rejectReserve = false, failUpload = new Set() } = {}) {
  const log = { rpc: [], uploads: [] }
  return { log,
    rpc: async (name, args) => {
      log.rpc.push({ name, args })
      if (rejectReserve) return { data: null, error: { code: '23514' } }
      return { data: args.p_files.map(f => ({ bucket: 'request-attachments', path: `${REQ}/srv-${f.upload_key}-${f.file_name}`,
        mime_type: f.mime_type, size_bytes: f.size_bytes, expires_at: '2026-11-18T20:00:00Z' })), error: null }
    },
    storage: { from: bucket => ({ upload: async (path, body, opts) => {
      log.uploads.push({ bucket, path, size: body.size, opts })
      return failUpload.has(body.name) ? { error: { message: 'x' } } : { data: { path }, error: null }
    } }) },
  }
}

test('frontend limits match the backend contract', () => {
  assert.equal(MAX_ATTACHMENTS, MAX_ATTACHMENT_FILES)
  assert.equal(MAX_TOTAL_BYTES, MAX_ATTACHMENT_TOTAL_BYTES)
})

test('compress first, then reserve the batch with the token, then upload only granted paths', async () => {
  const pdf = file('informe.pdf', 'application/pdf', 900_000)
  const prepared = await prepareAttachments([file('captura.png', 'image/png', 3_000_000), pdf], compress)
  assert.equal(prepared.ok, true)
  const items = prepared.items.map((i, n) => ({ file: i.file, uploadKey: `k${n}` }))
  const client = fakeClient()
  const out = await deliverAttachments(client, REQ, TOKEN, items)
  assert.deepEqual(out, { uploaded: ['captura.webp', 'informe.pdf'], failed: [], error: null })
  const [call] = client.log.rpc
  assert.equal(call.name, 'reserve_request_attachments')
  assert.equal(call.args.p_tracking_token, TOKEN)
  assert.deepEqual(call.args.p_files.map(f => [f.file_name, f.size_bytes, f.mime_type]),
    [['captura.webp', items[0].file.size, 'image/webp'], ['informe.pdf', 900_000, 'application/pdf']])
  assert.ok(call.args.p_files.reduce((n, f) => n + f.size_bytes, 0) <= MAX_TOTAL_BYTES)
  assert.deepEqual(client.log.uploads.map(u => u.path), [`${REQ}/srv-k0-captura.webp`, `${REQ}/srv-k1-informe.pdf`])
  assert.ok(client.log.uploads.every(u => u.opts.upsert === false && !u.path.includes(TOKEN)))
  assert.equal(client.log.uploads[1].size, 900_000)   // documento sin modificar
})

test('rejected reservation: nothing is uploaded and a clear error is returned', async () => {
  const client = fakeClient({ rejectReserve: true })
  const out = await deliverAttachments(client, REQ, TOKEN, [{ file: file('a.png', 'image/png', 10), uploadKey: 'k' }])
  assert.equal(client.log.uploads.length, 0)
  assert.deepEqual(out.failed, ['a.png']); assert.match(out.error, /No se autorizó/)
})

test('over-limit batch is refused client-side before any RPC', async () => {
  const client = fakeClient()
  const big = Array.from({ length: 5 }, (_, i) => ({ file: file(`f${i}.pdf`, 'application/pdf', 10), uploadKey: `k${i}` }))
  const out = await deliverAttachments(client, REQ, TOKEN, big)
  assert.equal(client.log.rpc.length, 0); assert.match(out.error, /Máximo 4/)
})

test('partial upload failure reports only failed files; retry reuses the same upload keys', async () => {
  const items = [{ file: file('a.pdf', 'application/pdf', 10), uploadKey: 'ka' }, { file: file('b.pdf', 'application/pdf', 10), uploadKey: 'kb' }]
  const first = await deliverAttachments(fakeClient({ failUpload: new Set(['b.pdf']) }), REQ, TOKEN, items)
  assert.deepEqual(first.failed, ['b.pdf']); assert.deepEqual(first.uploaded, ['a.pdf'])
  const retryClient = fakeClient()
  const remaining = items.filter(i => first.failed.includes(i.file.name))
  await deliverAttachments(retryClient, REQ, TOKEN, remaining)
  assert.deepEqual(retryClient.log.rpc[0].args.p_files.map(f => f.upload_key), ['kb'])
})

test('no attachments: no reservation call', async () => {
  const client = fakeClient()
  assert.deepEqual(await deliverAttachments(client, REQ, TOKEN, []), { uploaded: [], failed: [], error: null })
  assert.equal(client.log.rpc.length, 0)
})
