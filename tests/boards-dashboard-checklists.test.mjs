// Paleta de 10 colores, tickets por estudio y checklist por fase (24/11/2026). Datos ficticios; sin red.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { OWNER_COLORS, OWNER_PALETTE, availableColors, isOfferedColor } from '../src/lib/card-palette.ts'
import { countTicketsByStudio, ticketsByStudioRows, TicketsByStudioError } from '../src/lib/tickets-by-studio.ts'
import { DEFAULT_CHECKLIST } from '../src/lib/checklist-defaults.ts'
import { missingTemplateTasks, normalizeTask, phaseTemplate } from '../src/lib/checklist-templates.ts'
import * as checklistTemplates from '../src/lib/checklist-templates.ts'
import { DEVELOPMENT_PHASES } from '../contracts/board-operations-client.mjs'

// ── Colores personales ──────────────────────────────────────────────────────
test('paleta: exactamente 10 colores únicos, todos del catálogo M17 aprobado (sin paleta nueva)', () => {
  assert.equal(OWNER_PALETTE.length, 10)
  assert.equal(new Set(OWNER_PALETTE).size, 10)
  const catalog = new Set(OWNER_COLORS.map(c => c.id))
  assert.equal(catalog.size, 24, 'los 24 identificadores se conservan para pintar asignaciones previas')
  for (const id of OWNER_PALETTE) assert.ok(catalog.has(id), id)
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
  for (const id of OWNER_PALETTE) {
    assert.match(css, new RegExp(`\\.owner-${id} \\{ --owner: #[0-9a-f]{6}; \\}`), `${id} claro`)
    assert.match(css, new RegExp(`:root\\[data-theme="dark"\\] \\.owner-${id} \\{ --owner: #[0-9a-f]{6}; \\}`), `${id} oscuro`)
  }
})

test('paleta: incluye las asignaciones reales verificadas (azul y pizarra) y los 6 colores originales', () => {
  for (const id of ['azul', 'pizarra', 'celeste', 'dorado', 'ambar', 'grafito']) assert.ok(isOfferedColor(id), id)
  assert.equal(isOfferedColor('azul-claro'), false, 'retirado: no se ofrece')
})

test('unicidad: un color asignado a otro no está disponible; el propio sí; sin capacidad → lista vacía', () => {
  const me = 'u-me', other = 'u-other'
  const free = availableColors({ [other]: 'azul', [me]: 'pizarra' }, me)
  assert.equal(free.includes('azul'), false)
  assert.equal(free.includes('pizarra'), true, 'mi propio color sigue elegible')
  assert.equal(free.length, 9)
  const full = Object.fromEntries(OWNER_PALETTE.map((c, i) => [`u${i}`, c]))
  assert.deepEqual(availableColors(full, 'u-nuevo'), [], 'con 10 asignados no hay color libre: no se repite ninguno')
})

test('M18: el servidor ofrece exactamente la misma paleta de 10, sin reasignar y sin bloquear la activación', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261124000100_limit_card_colors_and_seed_missing_checklists.sql', import.meta.url), 'utf8')
  const listed = sql.match(/SET offered = color_id = ANY\(ARRAY\[([^\]]+)\]\)/)[1].match(/'([a-z-]+)'/g).map(s => s.slice(1, -1))
  assert.deepEqual([...listed].sort(), [...OWNER_PALETTE].sort())
  assert.match(sql, /IF selected IS NULL THEN RETURN NULL; END IF;/, 'sin capacidad: perfil sin color, la activación continúa')
  assert.doesNotMatch(sql, /UPDATE public\.internal_card_preferences|DELETE FROM public\.internal_card_preferences/, 'no cambia colores de usuarios')
  assert.doesNotMatch(sql, /DROP (TABLE|COLUMN)/i)
  assert.match(sql, /^-- M18/); assert.match(sql, /\nBEGIN;\n/); assert.match(sql, /\nCOMMIT;\n$/)
})

test('M19: las 45 plantillas del servidor (3 por fase real) son idénticas a las sugerencias del frontend', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261124000200_suggested_checklists_portfolios_internal_tickets.sql', import.meta.url), 'utf8')
  const rows = [...sql.matchAll(/\('(development|administrative)','([a-z_]+)',(\d),'([^']+)'\)/g)]
  assert.equal(rows.length, 45)
  const server = {}
  for (const [, flow, phase, index, text] of rows) { (server[`${flow}/${phase}`] ??= [])[Number(index)] = text }
  const front = Object.fromEntries(Object.entries(DEFAULT_CHECKLIST).flatMap(([flow, phases]) => Object.entries(phases).map(([phase, list]) => [`${flow}/${phase}`, list])))
  assert.deepEqual(server, front)
  assert.match(sql, /CREATE OR REPLACE FUNCTION app_private\.add_flows/)
  assert.doesNotMatch(sql.slice(sql.indexOf('FUNCTION app_private.add_flows'), sql.indexOf('END $$;', sql.indexOf('FUNCTION app_private.add_flows'))), /checklist_items/, 'add_flows ya no siembra tareas')
})

// ── Tickets por estudio ─────────────────────────────────────────────────────
function fakeRequests(rows, { failOn = null, countDrift = 0 } = {}) {
  const calls = []
  const client = { from(table) {
    assert.equal(table, 'requests')
    return { select(columns, opts) {
      assert.equal(columns, 'id, studio_id'); assert.deepEqual(opts, { count: 'exact' })
      const q = { filters: [], order: null, range: null,
        order(col, o) { q.order = [col, o.ascending]; return q },
        gte(col, v) { q.filters.push(r => r[col] >= v); return q },
        eq(col, v) { q.filters.push(r => r[col] === v); return q },
        range(from, to) { q.range = [from, to]; return q },
        then(resolve) {
          calls.push(q.range)
          if (failOn !== null && calls.length === failOn) return resolve({ data: null, error: { message: 'simulado' }, count: null })
          const all = rows.filter(r => q.filters.every(f => f(r))).sort((a, b) => (a.id < b.id ? -1 : 1))
          resolve({ data: all.slice(q.range[0], q.range[1] + 1), error: null, count: all.length + countDrift })
        } }
      return q
    } }
  } }
  return { client, calls }
}
const req = (n, studio, day = '2026-11-20') => ({ id: `r${String(n).padStart(5, '0')}`, studio_id: studio, created_at: `${day}T10:00:00Z` })

test('tickets por estudio: pagina más allá de 1000 filas y el total coincide con count=exact', async () => {
  const rows = [...Array.from({ length: 1500 }, (_, i) => req(i, 'A')), ...Array.from({ length: 700 }, (_, i) => req(2000 + i, 'B')), req(9000, null), req(9001, null)]
  const { client, calls } = fakeRequests(rows)
  const r = await countTicketsByStudio(client, { since: null, studioId: null })
  assert.deepEqual(r, { total: 2202, byStudio: { A: 1500, B: 700 }, withoutStudio: 2 })
  assert.deepEqual(calls, [[0, 999], [1000, 1999], [2000, 2999]], 'tres páginas ordenadas por id')
})

test('tickets por estudio: periodo y estudio se aplican en el servidor; sin estudio aparte', async () => {
  const rows = [req(1, 'A', '2026-10-01'), req(2, 'A', '2026-11-20'), req(3, 'B', '2026-11-21'), req(4, null, '2026-11-22')]
  const { client } = fakeRequests(rows)
  assert.deepEqual(await countTicketsByStudio(client, { since: '2026-11-01T00:00:00Z', studioId: null }), { total: 3, byStudio: { A: 1, B: 1 }, withoutStudio: 1 })
  assert.deepEqual(await countTicketsByStudio(client, { since: null, studioId: 'A' }), { total: 2, byStudio: { A: 2 }, withoutStudio: 0 })
})

test('tickets por estudio: si el total no se puede verificar o una página falla, error en vez de un total parcial', async () => {
  const rows = Array.from({ length: 1200 }, (_, i) => req(i, 'A'))
  await assert.rejects(countTicketsByStudio(fakeRequests(rows, { failOn: 2 }).client, { since: null, studioId: null }), TicketsByStudioError)
  await assert.rejects(countTicketsByStudio(fakeRequests(rows, { countDrift: 5 }).client, { since: null, studioId: null }), /no se pudo verificar/)
})

test('tickets por estudio: filas ordenadas de mayor a menor, nombres del catálogo y «Sin estudio asignado» al final', () => {
  const rows = ticketsByStudioRows({ total: 9, byStudio: { a: 2, b: 5, z: 1 }, withoutStudio: 1 }, id => ({ a: 'ARAPA', b: 'PROCONT' })[id])
  assert.deepEqual(rows.map(r => [r.label, r.value]), [['PROCONT', 5], ['ARAPA', 2], ['Estudio no disponible', 1], ['Sin estudio asignado', 1]])
  assert.equal(rows.reduce((n, r) => n + r.value, 0), 9, 'la suma de barras es el total')
})

// ── Checklist por fase ──────────────────────────────────────────────────────
test('sugerencias: exactamente 3 por cada fase real (8 Development, 7 Administrative), sin repetir dentro del flujo', () => {
  assert.deepEqual([...DEVELOPMENT_PHASES], ['backlog', 'analysis', 'design', 'dev', 'code_review', 'testing', 'deploy', 'done'])
  assert.deepEqual(Object.keys(DEFAULT_CHECKLIST.development).sort(), [...DEVELOPMENT_PHASES].sort())
  assert.deepEqual(Object.keys(DEFAULT_CHECKLIST.administrative).sort(), ['backlog', 'build', 'deployed', 'design', 'discovery', 'ready_to_start', 'uat_validation'])
  for (const [flow, phases] of Object.entries(DEFAULT_CHECKLIST)) {
    for (const [phase, list] of Object.entries(phases)) assert.equal(list.length, 3, `${flow}/${phase}`)
    const all = Object.values(phases).flat().map(normalizeTask)
    assert.equal(new Set(all).size, all.length, `${flow}: ninguna tarea se repite entre fases`)
  }
})

test('sin siembra automática: el módulo ya no expone funciones que materialicen tareas', () => {
  assert.equal('seedPhaseOnArrival' in checklistTemplates, false)
  assert.equal('shouldSeedOnArrival' in checklistTemplates, false)
})

test('sin duplicados: solo se sugieren las tareas que la fase no tiene (texto normalizado, tildes y espacios)', () => {
  const have = [{ description: '  definir   criterios de ACEPTACION ' }]
  const missing = missingTemplateTasks('development', 'analysis', have)
  assert.equal(missing.length, phaseTemplate('development', 'analysis').length - 1)
  assert.ok(!missing.some(t => normalizeTask(t) === 'definir criterios de aceptacion'))
})
