import test from 'node:test'
import assert from 'node:assert/strict'
import { uploadTicketAttachment } from '../contracts/ticket-security-client.mjs'

const file = { name: 'fixture.txt', size: 8, type: 'text/plain' }
const request = 'synthetic-request'; const token = 'private-tracking-token'; const key = 'stable-upload-key'
function mock({ reserveError = false, uploadError = false } = {}) {
  const calls = []
  const client = {
    async rpc(name, args) {
      calls.push(['rpc', name, args])
      return { error: reserveError, data: reserveError ? null : {
        bucket: 'request-attachments', path: 'synthetic-request/random-capability-fixture.txt',
        mime_type: args.p_mime_type, expires_at: 'synthetic-expiration',
      } }
    },
    storage: { from(bucket) { calls.push(['bucket', bucket]); return {
      async upload(path, value, options) { calls.push(['upload', path, value, options]); return { error: uploadError } },
    } } },
  }
  return { client, calls }
}
test('tracking token is sent only to reservation RPC and upload uses returned capability path', async () => {
  const f = mock()
  await uploadTicketAttachment(f.client, request, token, file, key)
  assert.equal(f.calls[0][1], 'reserve_request_attachment')
  assert.equal(f.calls[0][2].p_tracking_token, token)
  assert.equal(f.calls[0][2].p_upload_key, key)
  const upload = f.calls.find(x => x[0] === 'upload')
  assert.equal(upload[1], 'synthetic-request/random-capability-fixture.txt')
  assert.equal(upload[1].includes(token), false)
  assert.equal(upload[3].upsert, false)
})
test('failed authorization never falls back to UUID-only upload', async () => {
  const f = mock({ reserveError: true })
  await assert.rejects(uploadTicketAttachment(f.client, request, token, file, key))
  assert.equal(f.calls.length, 1)
})
test('upload errors do not retry or disclose the token', async () => {
  const f = mock({ uploadError: true })
  await assert.rejects(uploadTicketAttachment(f.client, request, token, file, key), error => !error.message.includes(token))
  assert.equal(f.calls.filter(x => x[0] === 'upload').length, 1)
})
test('browser files without MIME use an existing approved extension mapping', async () => {
  const f = mock()
  await uploadTicketAttachment(f.client, request, token, { ...file, name: 'fixture.pdf', type: '' }, key)
  assert.equal(f.calls[0][2].p_mime_type, 'application/pdf')
})
