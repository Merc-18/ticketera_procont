// Exportación de terminados: paginación completa contra un PostgREST simulado con límites reales.
// DATOS SIMULADOS. Sin red.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  fetchDonePerformance, fetchProjects, buildCompletedExport, completedRows, ExportError, COMPLETED_HEADERS,
} from '../src/lib/ticket-export.ts'

globalThis.fetch = () => { throw new Error('Network access forbidden in export tests') }

const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const row = (n, status, extra = {}) => ({ request_id: uuid(n), request_number: `REQ26-${String(n).padStart(4, '0')}`,
  project_id: uuid(500000 + n), studio_id: null, general_status: status,
  first_started_at: status === 'done' ? '2026-11-03T15:00:00Z' : null, completed_at: status === 'done' ? '2026-11-06T15:00:00Z' : null,
  cycle_time_seconds: status === 'done' ? 259200 : null, lead_time_seconds: status === 'done' ? 432000 : null,
  metric_status: status === 'done' ? 'complete' : 'not_completed', ...extra })

/**
 * PostgREST simulado: filtros eq.*, order (si falta, orden arbitrario por petición), offset/limit con
 * max_rows=1000, count=exact sobre el resultado filtrado, fallo o mutación inyectables por página.
 */
function postgrest(dataset, { maxRows = 1000, failOnPage = null, mutateOnPage = null, projects = [] } = {}) {
  const calls = []
  let pageNo = 0
  const query = (rows, kind) => {
    const state = { filters: [], order: null, offset: 0, limit: Infinity, in: null }
    const builder = {
      eq(column, value) { state.filters.push([column, value]); return builder },
      order(column, { ascending }) { state.order = [column, ascending]; return builder },
      range(from, to) { state.offset = from; state.limit = to - from + 1; return builder },
      in(column, values) { state.in = [column, values]; return builder },
      then(resolve, reject) {
        try {
          calls.push({ kind, ...state, filters: [...state.filters] })
          if (kind === 'rpc') {
            pageNo++
            if (failOnPage === pageNo) return Promise.resolve({ data: null, error: { code: 'XX000', message: 'fallo simulado' }, count: null }).then(resolve, reject)
            if (mutateOnPage === pageNo) dataset.push(row(999999, 'done'))
          }
          let out = rows().filter(r => state.filters.every(([c, v]) => String(r[c]) === v))
          if (state.in) { const set = new Set(state.in[1]); out = out.filter(r => set.has(r[state.in[0]])) }
          const count = out.length
          out = state.order
            ? [...out].sort((a, b) => (a[state.order[0]] < b[state.order[0]] ? -1 : 1) * (state.order[1] ? 1 : -1))
            : [...out].sort(() => Math.random() - 0.5)   // sin ORDER BY el orden no está garantizado
          out = out.slice(state.offset, state.offset + Math.min(state.limit, maxRows))
          return Promise.resolve({ data: out, error: null, count }).then(resolve, reject)
        } catch (e) { return Promise.reject(e).then(resolve, reject) }
      },
    }
    return builder
  }
  return {
    calls,
    rpc: (name, args, options) => { assert.equal(name, 'get_ticket_performance'); assert.deepEqual(args, { p_studio_id: null }); assert.deepEqual(options, { count: 'exact' }); return query(() => dataset, 'rpc') },
    from: table => { assert.equal(table, 'projects'); return { select: () => query(() => projects, 'projects') } },
  }
}
const notDone = (from, n) => Array.from({ length: n }, (_, i) => row(from + i, i % 2 ? 'in_progress' : 'received'))
const done = (from, n, extra) => Array.from({ length: n }, (_, i) => row(from + i, 'done', extra))
const ids = rows => rows.map(r => r.request_id)

test('A. cero terminados → null (la interfaz informa «No hay tickets terminados»)', async () => {
  const client = postgrest(notDone(1, 1500))
  assert.equal(await buildCompletedExport(client), null)
  assert.equal(client.calls.length, 1)
  assert.deepEqual(client.calls[0].filters, [['general_status', 'done']], 'filtro en el servidor')
})

test('B. algunos terminados → exportación exacta con sus columnas', async () => {
  const data = [...notDone(1, 5), ...done(100, 3)]
  const projects = [{ id: uuid(500100), title: 'Proyecto simulado', priority: 'high', project_type: 'development', requests: { requester_area: 'Área' } }]
  const result = await buildCompletedExport(postgrest(data, { projects }))
  assert.deepEqual(result.headers, COMPLETED_HEADERS)
  assert.equal(result.rows.length, 3)
  const first = result.rows.find(r => r[0] === 'REQ26-0100')
  assert.deepEqual(first, ['REQ26-0100', 'Proyecto simulado', 'Área', 'Alta', 'Desarrollo', '2026-11-03', '2026-11-06', '3.0', '5.0', 'Completa', 'Sin producto', 'Sin subproducto', 'Sin portafolio', 'Sin proyecto específico', 'Antigüedad no disponible'])
})

test('C/D. más de 1.000 registros y terminados fuera de la primera página: ninguno se omite', async () => {
  // 1.000 no terminados con ids menores y 2 terminados después: el defecto anterior (sin filtro en
  // servidor) solo veía los 1.000 primeros y no encontraba ningún terminado.
  const data = [...notDone(1, 1000), ...done(5000, 2)]
  const client = postgrest(data)
  const result = await fetchDonePerformance(client)
  assert.deepEqual(ids(result), [uuid(5000), uuid(5001)])
})

test('E. varias páginas de terminados (2.500): sin duplicados ni pérdidas', async () => {
  const data = [...notDone(1, 1200), ...done(10000, 2500)]
  const client = postgrest(data)
  const result = await fetchDonePerformance(client)
  assert.equal(result.length, 2500)
  assert.equal(new Set(ids(result)).size, 2500)
  assert.deepEqual(ids(result).sort(), ids(done(10000, 2500)).sort())
  assert.deepEqual(client.calls.filter(c => c.kind === 'rpc').map(c => [c.offset, c.limit]), [[0, 1000], [1000, 1000], [2000, 1000]])
})

test('E bis. si el servidor recorta la página por debajo de lo pedido, se sigue pidiendo hasta el total', async () => {
  const client = postgrest(done(1, 2300), { maxRows: 400 })
  const result = await fetchDonePerformance(client)
  assert.equal(result.length, 2300)
  assert.equal(new Set(ids(result)).size, 2300)
  assert.equal(client.calls.filter(c => c.kind === 'rpc').length, 6)
})

test('F. error en la segunda página → ExportError, sin filas parciales', async () => {
  const client = postgrest(done(1, 1500), { failOnPage: 2 })
  await assert.rejects(buildCompletedExport(client), e => e instanceof ExportError && /página 2/.test(e.message))
  assert.equal(client.calls.some(c => c.kind === 'projects'), false, 'no se continúa tras el fallo')
})

test('F bis. el total cambia entre páginas → error explícito, nunca CSV mezclado', async () => {
  await assert.rejects(fetchDonePerformance(postgrest(done(1, 1500), { mutateOnPage: 2 })),
    e => e instanceof ExportError && /cambiaron/.test(e.message))
})

test('G. null en Cycle/Lead y fechas desconocidas permanecen vacíos con su motivo', () => {
  const rows = completedRows([
    row(1, 'done', { first_started_at: null, cycle_time_seconds: null, metric_status: 'missing_start' }),
    row(2, 'done', { completed_at: null, cycle_time_seconds: null, lead_time_seconds: null, metric_status: 'missing_completion' }),
  ], new Map())
  const byReq = Object.fromEntries(rows.map(r => [r[0], r]))
  assert.deepEqual(byReq['REQ26-0001'].slice(5, 10), ['', '2026-11-06', '', '5.0', 'Sin inicio de trabajo registrado'])
  assert.deepEqual(byReq['REQ26-0002'].slice(5, 10), ['2026-11-03', '', '', '', 'Sin finalización registrada'])
  assert.equal(rows.flat().includes('0') || rows.flat().includes('0.0'), false, 'nunca cero inventado')
})

test('H. orden estable y determinista: request_id ascendente en cada página y offsets contiguos', async () => {
  const client = postgrest([...notDone(1, 300), ...done(1000, 2100)])
  const first = await fetchDonePerformance(client)
  const second = await fetchDonePerformance(postgrest([...notDone(1, 300), ...done(1000, 2100)].reverse()))
  assert.deepEqual(ids(first), ids(second), 'mismo resultado aunque el almacenamiento cambie de orden')
  for (const c of client.calls) assert.deepEqual(c.order, ['request_id', true])
  assert.deepEqual(ids(first), [...ids(first)].sort())
})

test('H bis. sin ORDER BY la paginación por offset duplicaría o perdería filas (control del simulador)', async () => {
  // Demuestra que el simulador es realista: el mismo recorrido sin orden produce resultados distintos.
  const data = done(1, 2500)
  const sim = postgrest(data)
  const unordered = []
  for (let offset = 0; offset < 2500; offset += 1000) {
    const page = await sim.rpc('get_ticket_performance', { p_studio_id: null }, { count: 'exact' }).eq('general_status', 'done').range(offset, offset + 999)
    unordered.push(...page.data)
  }
  assert.notEqual(new Set(ids(unordered)).size, 2500)
})

test('proyectos por lotes acotados: nunca una consulta sujeta al límite de filas', async () => {
  const projects = Array.from({ length: 2500 }, (_, i) => ({ id: uuid(500000 + i), title: `P${i}`, priority: 'low', project_type: 'development' }))
  const client = postgrest([], { projects })
  const byId = await fetchProjects(client, projects.map(p => p.id))
  assert.equal(byId.size, 2500)
  assert.ok(client.calls.every(c => c.in[1].length <= 100))
})

test('integración: 3.201 terminados y proyectos completos, cuatro páginas y 33 lotes', async () => {
  const finished = done(10000, 3201)
  const projects = finished.map(r => ({ id: r.project_id, title: `Proyecto ${r.request_number}`,
    priority: 'medium', project_type: 'development', requests: { requester_area: 'Área ficticia' } }))
  const client = postgrest([...notDone(1, 1200), ...finished], { projects })
  const result = await buildCompletedExport(client)
  assert.equal(result.rows.length, 3201)
  assert.equal(new Set(result.rows.map(r => r[0])).size, 3201)
  assert.ok(result.rows.every(r => r[1].startsWith('Proyecto REQ') && r[2] === 'Área ficticia'))
  assert.deepEqual(client.calls.filter(c => c.kind === 'rpc').map(c => c.offset), [0, 1000, 2000, 3000])
  const batches = client.calls.filter(c => c.kind === 'projects')
  assert.equal(batches.length, 33)
  assert.ok(batches.every(c => c.in[1].length <= 100))
})
