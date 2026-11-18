import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareAttachments, attachmentManifest, MAX_TOTAL_BYTES, isCompressibleImage } from '../src/lib/attachment-prep.ts'

const file = (name, type, size) => new File([new Uint8Array(size)], name, { type })
// Compresor simulado: reduce según el nivel (más pérdida → más pequeño); registra llamadas.
const fake = (factorByQuality = q => q / 3) => {
  const calls = []
  const fn = async (f, level) => { calls.push([f.name, level.quality]); return file(f.name.replace(/\.\w+$/, '.webp'), 'image/webp', Math.ceil(f.size * factorByQuality(level.quality))) }
  return Object.assign(fn, { calls })
}

test('under the limit: nothing is compressed', async () => {
  const c = fake()
  const r = await prepareAttachments([file('a.png', 'image/png', 800_000), file('b.pdf', 'application/pdf', 900_000)], c)
  assert.equal(r.ok, true); assert.equal(c.calls.length, 0); assert.equal(r.totalBytes, 1_700_000)
  assert.ok(r.items.every(i => !i.compressed))
})

test('over the limit: only images are compressed, documents untouched', async () => {
  const pdf = file('informe.pdf', 'application/pdf', 1_200_000)
  const c = fake()
  const r = await prepareAttachments([file('captura.png', 'image/png', 3_000_000), pdf], c)
  assert.equal(r.ok, true); assert.ok(r.totalBytes <= MAX_TOTAL_BYTES)
  assert.equal(r.items[1].file, pdf); assert.equal(r.items[1].compressed, false)
  assert.equal(r.items[0].compressed, true); assert.equal(r.items[0].originalSize, 3_000_000)
  assert.ok(c.calls.every(([n]) => n === 'captura.png'))
})

test('stops at the least lossy level that fits', async () => {
  const c = fake(q => (q >= 0.85 ? 0.95 : 0.3))
  const r = await prepareAttachments([file('x.jpg', 'image/jpeg', 3_000_000)], c)
  assert.equal(r.ok, true)
  assert.deepEqual([...new Set(c.calls.map(([, q]) => q))], [0.9, 0.85, 0.8])
})

test('more than 4 files rejected before any compression', async () => {
  const c = fake()
  const r = await prepareAttachments(Array.from({ length: 5 }, (_, i) => file(`f${i}.png`, 'image/png', 10)), c)
  assert.equal(r.ok, false); assert.match(r.error, /hasta 4/); assert.equal(c.calls.length, 0)
})

test('documents alone over the limit: clear error, no compression', async () => {
  const c = fake()
  const r = await prepareAttachments([file('a.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 2_600_000), file('b.png', 'image/png', 100)], c)
  assert.equal(r.ok, false); assert.match(r.error, /no se comprimen/); assert.equal(c.calls.length, 0)
})

test('compression insufficient: blocked with clear message', async () => {
  const c = fake(() => 0.99)
  const r = await prepareAttachments([file('a.png', 'image/png', 2_000_000), file('b.png', 'image/png', 2_000_000)], c)
  assert.equal(r.ok, false); assert.match(r.error, /Aun comprimiendo/); assert.ok(r.totalBytes > MAX_TOTAL_BYTES)
})

test('compressor that grows or fails keeps the original', async () => {
  const grow = async f => file(f.name, f.type, f.size * 2)
  const r = await prepareAttachments([file('a.png', 'image/png', 3_000_000)], grow)
  assert.equal(r.ok, false); assert.equal(r.items[0].compressed, false)
  const boom = async () => { throw new Error('decode') }
  const r2 = await prepareAttachments([file('a.png', 'image/png', 3_000_000)], boom)
  assert.equal(r2.ok, false); assert.equal(r2.items[0].file.size, 3_000_000)
})

test('GIF is not recompressed; manifest exposes final name/size/type', async () => {
  assert.equal(isCompressibleImage('image/gif'), false)
  const c = fake()
  const r = await prepareAttachments([file('anim.gif', 'image/gif', 2_000_000), file('s.png', 'image/png', 1_000_000)], c)
  assert.equal(r.ok, true); assert.equal(r.items[0].compressed, false)
  assert.deepEqual(attachmentManifest(r.items).map(m => m.name), ['anim.gif', 's.webp'])
})
