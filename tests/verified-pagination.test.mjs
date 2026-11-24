import test from 'node:test'
import assert from 'node:assert/strict'
import { readVerifiedPages, VerifiedPaginationError } from '../src/lib/verified-pagination.ts'

function source(rows, { failAt = -1, driftAt = -1, duplicateAt = -1, shortAt = -1 } = {}) {
  const calls = []
  return {
    calls,
    fetch: async (from, to) => {
      calls.push([from, to])
      const index = calls.length
      if (index === failAt) return { data: null, error: new Error('page failed'), count: rows.length }
      const data = rows.slice(from, to + 1)
      if (index === shortAt && data.length > 0) data.pop()
      if (index === duplicateAt && data.length > 0 && from > 0) data[0] = rows[from - 1]
      return { data, error: null, count: rows.length + (index === driftAt ? 1 : 0) }
    },
  }
}

const rowsOf = n => Array.from({ length: n }, (_, id) => ({ id: `id-${String(id).padStart(5, '0')}` }))

test('Dashboard paginationa todas las filas por encima de 1000 y no duplica IDs', async () => {
  const fake = source(rowsOf(2502))
  const rows = await readVerifiedPages(fake.fetch, 1000)
  assert.equal(rows.length, 2502)
  assert.equal(new Set(rows.map(row => row.id)).size, 2502)
  assert.deepEqual(fake.calls, [[0, 999], [1000, 1999], [2000, 2999]])
})

test('Dashboard falla cerrado si falla una página intermedia', async () => {
  const fake = source(rowsOf(2100), { failAt: 2 })
  await assert.rejects(readVerifiedPages(fake.fetch, 1000), VerifiedPaginationError)
})

test('Dashboard falla cerrado si cambia count entre páginas', async () => {
  const fake = source(rowsOf(2100), { driftAt: 2 })
  await assert.rejects(readVerifiedPages(fake.fetch, 1000), /cambió/)
})

test('Dashboard acepta páginas finales menores de 1000 solo cuando completan el count', async () => {
  const fake = source(rowsOf(1201))
  assert.equal((await readVerifiedPages(fake.fetch, 1000)).length, 1201)
  assert.deepEqual(fake.calls, [[0, 999], [1000, 1999]])
})

test('Dashboard rechaza una página corta antes de alcanzar el count', async () => {
  const fake = source(rowsOf(2200), { shortAt: 2 })
  await assert.rejects(readVerifiedPages(fake.fetch, 1000), /Faltan filas/)
})

test('Dashboard detecta duplicados de ID entre páginas', async () => {
  const fake = source(rowsOf(1200), { duplicateAt: 2 })
  await assert.rejects(readVerifiedPages(fake.fetch, 1000), /duplicadas/)
})
