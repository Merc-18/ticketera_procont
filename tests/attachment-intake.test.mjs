// Filtro único de entrada de adjuntos (explorador, arrastre y portapapeles). Archivos ficticios en memoria.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ATTACHMENT_ACCEPT, ATTACHMENT_MIME_TYPES, checkFile, clipboardFiles, dragHasFiles, mimeOf, namePastedImage, screenIncoming, canPreview,
} from '../src/lib/attachment-intake.ts'
import { MAX_ATTACHMENTS, MAX_TOTAL_BYTES, MAX_SOURCE_IMAGE_BYTES } from '../src/lib/attachment-prep.ts'
import { attachmentMetadata, MAX_ATTACHMENT_FILES, MAX_ATTACHMENT_TOTAL_BYTES } from '../contracts/ticket-security-client.mjs'

const file = (name, type, size = 16, fill = name) => {
  const bytes = new Uint8Array(size); new TextEncoder().encodeInto(fill, bytes)
  return new File([bytes], name, { type })
}

test('los límites siguen siendo los del contrato (4 archivos, 2.500.000 bytes) y no se inventan nuevos', () => {
  assert.equal(MAX_ATTACHMENTS, MAX_ATTACHMENT_FILES)
  assert.equal(MAX_TOTAL_BYTES, MAX_ATTACHMENT_TOTAL_BYTES)
  assert.equal(ATTACHMENT_ACCEPT, '.png,.jpg,.jpeg,.webp,.gif,.pdf,.txt,.csv,.xlsx,.xls,.docx,.doc')
  // Mismos 11 MIME que allowed_mime_types del bucket (migración 20261118000400).
  assert.deepEqual([...ATTACHMENT_MIME_TYPES].sort(), ['application/msword', 'application/pdf', 'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/gif', 'image/jpeg', 'image/png', 'image/webp', 'text/csv', 'text/plain'])
})

test('el MIME se resuelve igual que el adaptador de reservas cuando el navegador no lo informa', () => {
  for (const name of ['a.docx', 'b.xlsx', 'c.doc', 'd.xls', 'e.csv', 'f.pdf', 'g.JPG']) {
    const f = file(name, '')
    assert.equal(mimeOf(f), attachmentMetadata(f, 'k').mime_type)
  }
  assert.equal(mimeOf(file('g.JPG', '')), 'image/jpeg')
})

test('formato no permitido: por extensión o por MIME declarado; sin extensión (carpetas) tampoco', () => {
  assert.equal(checkFile(file('instalador.exe', 'application/x-msdownload')).code, 'format')
  assert.equal(checkFile(file('falso.pdf', 'application/x-msdownload')).code, 'format')
  assert.equal(checkFile(file('carpeta', '')).code, 'format')
  assert.equal(checkFile(file('imagen.bmp', 'image/bmp')).code, 'format')
  assert.equal(checkFile(file('informe.pdf', 'application/pdf')), null)
  assert.equal(checkFile(file('Notas.TXT', '')), null)
})

test('tamaño: documento > 2.500.000 bytes se rechaza; imagen grande se acepta para comprimir hasta el máximo de origen', () => {
  assert.equal(checkFile(file('grande.pdf', 'application/pdf', MAX_TOTAL_BYTES + 1)).code, 'size')
  assert.equal(checkFile(file('justo.pdf', 'application/pdf', MAX_TOTAL_BYTES)), null)
  assert.equal(checkFile(file('animada.gif', 'image/gif', MAX_TOTAL_BYTES + 1)).code, 'size', 'GIF no se comprime')
  assert.equal(checkFile(file('captura.png', 'image/png', MAX_TOTAL_BYTES * 2)), null)
  const huge = { name: 'enorme.png', type: 'image/png', size: MAX_SOURCE_IMAGE_BYTES + 1 }
  assert.equal(checkFile(huge).code, 'size')
})

test('duplicados por contenido (mismo nombre o distinto) y dentro del mismo lote; la lista existente no cambia', async () => {
  const a = file('informe.pdf', 'application/pdf', 64, 'contenido-A')
  const again = file('informe.pdf', 'application/pdf', 64, 'contenido-A')
  const renamed = file('copia.pdf', 'application/pdf', 64, 'contenido-A')
  const other = file('informe.pdf', 'application/pdf', 64, 'contenido-B')
  const existing = [a]
  const r = await screenIncoming(existing, [again, renamed, other, file('x.txt', 'text/plain', 8, 'x'), file('y.txt', 'text/plain', 8, 'x')])
  assert.deepEqual(r.accepted.map(f => f.name), ['informe.pdf', 'x.txt'])
  assert.equal(r.accepted[0], other)
  assert.deepEqual(r.rejected.map(x => x.code), ['duplicate', 'duplicate', 'duplicate'])
  assert.match(r.rejected[0].message, /ya está en la lista/)
  assert.match(r.rejected[1].message, /mismo contenido que «informe\.pdf»/)
  assert.deepEqual(existing, [a])
})

test('límite de cantidad: nunca se superan 4 archivos y se explica cuál quedó fuera', async () => {
  const existing = [1, 2, 3].map(i => file(`f${i}.txt`, 'text/plain', 8, `f${i}`))
  const r = await screenIncoming(existing, [file('g.txt', 'text/plain', 8, 'g'), file('h.txt', 'text/plain', 8, 'h')])
  assert.deepEqual(r.accepted.map(f => f.name), ['g.txt'])
  assert.equal(r.rejected[0].code, 'limit'); assert.match(r.rejected[0].message, /hasta 4 archivos/)
})

test('orden de revisión: formato y tamaño antes que cantidad (un archivo inválido no ocupa cupo)', async () => {
  const existing = [1, 2, 3].map(i => file(`f${i}.txt`, 'text/plain', 8, `f${i}`))
  const r = await screenIncoming(existing, [file('malo.exe', ''), file('bueno.csv', 'text/csv', 8, 'ok')])
  assert.deepEqual(r.accepted.map(f => f.name), ['bueno.csv'])
  assert.deepEqual(r.rejected.map(x => x.code), ['format'])
})

test('imagen pegada sin nombre propio recibe un nombre legible; un archivo con nombre lo conserva', () => {
  const when = new Date(2026, 10, 24, 9, 5, 7)
  const pasted = namePastedImage(file('image.png', 'image/png'), when)
  assert.equal(pasted.name, 'captura-20261124-090507.png'); assert.equal(pasted.type, 'image/png')
  assert.equal(namePastedImage(file('image.png', 'image/png'), when, 1).name, 'captura-20261124-090507-2.png')
  const named = file('factura.pdf', 'application/pdf')
  assert.equal(namePastedImage(named, when), named)
})

test('portapapeles: solo archivos reales (files o items de tipo file); el texto nunca se convierte en documento', () => {
  const f = file('a.pdf', 'application/pdf')
  assert.deepEqual(clipboardFiles({ files: [f], items: [] }), [f])
  assert.deepEqual(clipboardFiles({ files: [], items: [{ kind: 'file', getAsFile: () => f }, { kind: 'string', getAsFile: () => null }] }), [f])
  assert.deepEqual(clipboardFiles({ files: [], items: [{ kind: 'string', getAsFile: () => null }] }), [])
  assert.deepEqual(clipboardFiles(null), [])
})

test('arrastre: solo se activa con archivos (no con texto ni con tarjetas del tablero)', () => {
  assert.equal(dragHasFiles({ types: ['Files'] }), true)
  assert.equal(dragHasFiles({ types: ['text/plain'] }), false)
  assert.equal(dragHasFiles(null), false)
})

test('vista previa solo para imágenes que el navegador muestra', () => {
  assert.equal(canPreview(file('a.png', 'image/png')), true)
  assert.equal(canPreview(file('a.pdf', 'application/pdf')), false)
  assert.equal(canPreview(file('a.docx', '')), false)
})
