import test from 'node:test'
import assert from 'node:assert/strict'
import { MAX_ATTACHMENT_FILES, MAX_ATTACHMENT_TOTAL_BYTES, reserveTicketAttachments,
  uploadReservedTicketAttachment } from '../contracts/ticket-security-client.mjs'

function client() {
  const calls = []
  return { calls,
    async rpc(name, args) {
      calls.push(['reserve', name, args])
      return { error: null, data: args.p_files.map((item, index) => ({
        bucket: 'request-attachments', path: `request/capability-${index}`, size_bytes: item.size_bytes,
        mime_type: item.mime_type, expires_at: 'synthetic-expiry',
      })) }
    },
    storage: { from(bucket) { return {
      async upload(path, body, options) { calls.push(['upload', bucket, path, body, options]); return { error: null } },
    } } },
  }
}
const file = (size, type = 'image/jpeg') => Object.freeze({ name: type === 'image/jpeg' ? 'compressed.jpg' : 'document.pdf', size, type })
test('contract exports four files and exactly 2500000 decimal bytes', () => {
  assert.equal(MAX_ATTACHMENT_FILES, 4)
  assert.equal(MAX_ATTACHMENT_TOTAL_BYTES, 2500000)
})
test('batch sends final compressed sizes and stable keys once before parallel uploads', async () => {
  const c = client(), files = [file(1000000), file(750000), file(500000), file(250000, 'application/pdf')]
  const keys = ['one', 'two', 'three', 'four']
  const grants = await reserveTicketAttachments(c, 'request', 'private-token', files, keys)
  assert.equal(c.calls.length, 1)
  assert.equal(c.calls[0][1], 'reserve_request_attachments')
  assert.deepEqual(c.calls[0][2].p_files.map(item => item.size_bytes), [1000000, 750000, 500000, 250000])
  assert.deepEqual(c.calls[0][2].p_files.map(item => item.upload_key), keys)
  await Promise.all(grants.map((grant, index) => uploadReservedTicketAttachment(c, grant, files[index])))
  assert.equal(c.calls.filter(call => call[0] === 'upload').length, 4)
  assert.equal(c.calls.at(-1)[3], files[3]) // Document object is passed through, never transformed.
  assert.equal(c.calls.at(-1)[4].upsert, false)
})
test('excess combined bytes and fifth file fail before any RPC', async () => {
  const c = client()
  await assert.rejects(reserveTicketAttachments(c, 'request', 'token', [file(1500000), file(1000001)], ['one', 'two']))
  await assert.rejects(reserveTicketAttachments(c, 'request', 'token', Array.from({ length: 5 }, () => file(0)), ['1','2','3','4','5']))
  assert.equal(c.calls.length, 0)
})
test('image recompression after reservation is rejected before upload', async () => {
  const c = client(), before = file(200)
  const [grant] = await reserveTicketAttachments(c, 'request', 'token', [before], ['stable'])
  await assert.rejects(uploadReservedTicketAttachment(c, grant, file(199)))
  assert.equal(c.calls.some(call => call[0] === 'upload'), false)
})
test('documents retain original bytes and zero files make no network request', async () => {
  const c = client()
  assert.deepEqual(await reserveTicketAttachments(c, 'request', 'token', [], []), [])
  assert.equal(c.calls.length, 0)
  const document = new File([new Uint8Array([0,1,255,2])], 'unchanged.pdf', { type: 'application/pdf' })
  const [grant] = await reserveTicketAttachments(c, 'request', 'token', [document], ['stable'])
  await uploadReservedTicketAttachment(c, grant, document)
  const sent = c.calls.find(call => call[0] === 'upload')[3]
  assert.equal(sent, document)
  assert.deepEqual([...new Uint8Array(await sent.arrayBuffer())], [0,1,255,2])
})
