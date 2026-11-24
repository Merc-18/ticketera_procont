// Paleta de 10, barra de Boards sin Área, Dashboard «Tickets por estudio» y checklist por fase (24/11/2026).
// DATOS FICTICIOS: Supabase sustituido por tests/ui/fixture-server.mjs y rutas locales; sin red externa.
import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createServer as createViteServer } from 'vite'
import { chromium } from 'playwright-core'
import { startFixtureServer, SIMULATED_PASSWORD, STAFF } from './fixture-server.mjs'
import { installVisualFixtures } from './ux-fixtures.mjs'
import { installKanbanFixtures, kanbanProjects, OWNER_FIXTURE } from './kanban-attachments-fixtures.mjs'
import { createBoardState, installBoardFixtures } from './boards-dashboard-fixtures.mjs'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SHOTS = process.env.BDC_SHOTS   // carpeta de capturas (opcional)
const STAGE = process.env.BDC_STAGE ?? 'despues'
const PROCONT = '00000000-0000-4000-8000-000000000177', OTHER = '00000000-0000-4000-8000-0000000000b1'
let fixture, vite, browser, base
before(async () => {
  fixture = await startFixtureServer()
  const settings = { VITE_SUPABASE_URL: fixture.url, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_simulada_solo_pruebas', VITE_CLIENT_PORTAL_MOCK: '0', VITE_CLIENT_LOGIN_ENABLED: '1' }
  Object.assign(process.env, settings)
  vite = await createViteServer({ root: ROOT, logLevel: 'error', server: { host: '127.0.0.1', port: 0, hmr: false } })
  await vite.listen()
  base = `http://127.0.0.1:${vite.httpServer.address().port}`
  for (const name of Object.keys(settings)) delete process.env[name]
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || undefined })
})
after(async () => { await browser?.close(); await vite?.close(); await fixture?.close() })

async function shot(page, file, meta = {}, target = page) {
  if (!SHOTS) return
  mkdirSync(SHOTS, { recursive: true })
  const png = await target.screenshot({ path: `${SHOTS}/${file}`, animations: 'disabled' })
  const mf = `${SHOTS}/../screenshots-manifest.json`
  const manifest = existsSync(mf) ? JSON.parse(readFileSync(mf, 'utf8')) : { captures: [] }
  manifest.captures = manifest.captures.filter(c => c.file !== file)
  manifest.captures.push({ file, stage: STAGE, ...meta, viewport: page.viewportSize(), sha256: createHash('sha256').update(png).digest('hex') })
  writeFileSync(mf, JSON.stringify(manifest, null, 2) + '\n')
}

async function open({ theme = 'light', viewport = { width: 1440, height: 900 }, email = 'superadmin@simulado.invalid', colors = OWNER_FIXTURE, requests = null, section = 'Boards' } = {}) {
  const context = await browser.newContext({ viewport, locale: 'es-PE' })
  await context.route('**/*', route => {
    const u = new URL(route.request().url())
    return ['127.0.0.1', 'localhost'].includes(u.hostname) || ['data:', 'blob:'].includes(u.protocol) ? route.continue() : route.abort()
  })
  await context.addInitScript(t => { try { localStorage.setItem('ticketera-theme', t) } catch {} }, theme)
  const page = await context.newPage()
  page.errors = []; page.on('pageerror', e => page.errors.push(e.message))
  await installVisualFixtures(page, fixture.url)
  await installKanbanFixtures(page, fixture.url)
  page.state = createBoardState()
  await installBoardFixtures(page, fixture.url, page.state, { requests })
  page.colors = { ...colors }
  await page.route(`${fixture.url}/rest/v1/rpc/internal_card_colors`, route => route.fulfill({ status: 200, contentType: 'application/json',
    headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ user_id: null, assignments: page.colors, colors: [] }) }))
  await page.route(`${fixture.url}/rest/v1/rpc/set_my_internal_card_color`, route => {
    const color = route.request().postDataJSON().p_color_id
    const me = STAFF[email].id
    if (Object.entries(page.colors).some(([u, c]) => c === color && u !== me)) return route.fulfill({ status: 409, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ code: '23505' }) })
    page.colors[me] = color
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ user_id: me, color_id: color }) })
  })
  await page.goto(base + '/portal')
  await page.getByRole('button', { name: /Acceso del equipo de TI/ }).click()
  await page.fill('#staff-modal-email', email)
  await page.fill('#staff-modal-password', SIMULATED_PASSWORD)
  await page.getByRole('button', { name: 'Ingresar al sistema' }).click()
  await page.locator('nav[aria-label="Secciones"]').waitFor()
  if (section === 'Boards') { await page.getByRole('button', { name: /^Boards/ }).click(); await page.locator('.project-card').first().waitFor() }
  return page
}
const css = (loc, prop) => loc.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p).trim(), prop)

// ─────────────────────────────── COLORES ───────────────────────────────
for (const theme of ['light', 'dark']) {
  test(`[${theme}] Mi color: 10 opciones, asignación actual conservada, ocupados no elegibles; Kanban y Tabla coherentes`, async () => {
    const page = await open({ theme, email: 'developer@simulado.invalid' })
    await page.getByRole('button', { name: 'Mi color de tarjeta' }).click()
    const panel = page.getByRole('dialog', { name: 'Mi color de tarjeta' })
    const radios = panel.getByRole('radio')
    assert.equal(await radios.count(), 10, 'máximo 10 colores')
    // Espera a que llegue la asignación compartida (internal_card_colors) antes de comprobarla.
    await page.waitForFunction(() => [...document.querySelectorAll('#owner-color-panel input[type=radio]')].some(r => r.checked))
    assert.equal(await panel.getByRole('radio', { name: 'Azul Procont', exact: true }).isChecked(), true, 'conserva su color (azul)')
    assert.equal(await panel.getByRole('radio', { name: /^Dorado \(asignado/ }).isDisabled(), true, 'el de otro miembro no se ofrece')
    for (const retired of ['Azul claro', 'Grafito humo', 'Pizarra oscuro']) assert.equal(await panel.getByRole('radio', { name: retired, exact: true }).count(), 0, `${retired} retirado`)
    await shot(page, `${STAGE}-mi-color-10-${theme}.png`, { theme, view: 'owner-picker' })
    await panel.getByRole('radio', { name: 'Ámbar bronce', exact: true }).click()
    await page.locator('.project-card.owner-ambar-bronce').first().waitFor()
    const ring = await css(page.locator('.project-card.owner-ambar-bronce .owner-ring').first(), 'outline-color')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: /Tabla/ }).click()
    await page.locator('.data-view td.has-owner.owner-ambar-bronce').first().waitFor()
    assert.equal(await css(page.locator('.data-view .owner-ring.owner-ambar-bronce').first(), 'outline-color'), ring, 'mismo color en Kanban y Tabla')
    assert.deepEqual(page.errors, [])
    await page.context().close()
  })
}

test('Mi color: un color retirado se conserva y se informa; con los 10 ocupados no se repite ninguno', async () => {
  const dev = STAFF['developer@simulado.invalid'].id
  let page = await open({ email: 'developer@simulado.invalid', colors: { [dev]: 'azul-claro' } })
  await page.locator('.project-card.owner-azul-claro').first().waitFor()   // se sigue pintando
  await page.getByRole('button', { name: 'Mi color de tarjeta' }).click()
  await page.getByText(/Tu color actual \(Azul claro\) ya no forma parte de la paleta de 10/).waitFor()
  assert.equal(await page.getByRole('dialog').getByRole('radio', { checked: true }).count(), 0)
  await page.context().close()
  const ten = ['azul', 'celeste', 'dorado', 'ambar', 'grafito', 'pizarra', 'dorado-claro', 'ambar-bronce', 'celeste-oscuro', 'pizarra-acero']
  page = await open({ email: 'developer@simulado.invalid', colors: Object.fromEntries(ten.map((c, i) => [`00000000-0000-4000-8000-0000000099${String(i).padStart(2, '0')}`, c])) })
  await page.getByRole('button', { name: 'Mi color de tarjeta' }).click()
  await page.getByText('Los 10 colores ya están asignados a otros miembros. No se repiten colores: pide a un administrador liberar uno.').waitFor()
  const radios = page.getByRole('dialog').getByRole('radio')
  for (let i = 0; i < 10; i++) assert.equal(await radios.nth(i).isDisabled(), true)
  await page.context().close()
})

// ─────────────────────────────── BARRA DE BOARDS ───────────────────────────────
for (const theme of ['light', 'dark']) {
  test(`[${theme}] Barra de Boards: sin Área, filtros vigentes y dos filas compactas`, async () => {
    const page = await open({ theme })
    const bar = page.locator('.board-toolbar')
    assert.equal(await bar.locator('label').filter({ hasText: /^Área/ }).count(), 0)
    await bar.locator('label').filter({ hasText: /^Estudio/ }).waitFor()   // el catálogo de estudios llega aparte
    assert.deepEqual((await bar.locator('.prio-select-label, .toolbar-field > span').allInnerTexts()).map(t => t.trim()), ['Prioridad', 'Estudio', 'Responsable'])
    for (const name of ['Activos', 'Completados', 'Archivados', 'Nuevo ticket', 'Kanban', 'Tabla', 'Gantt', 'Roadmap', 'Mi color de tarjeta']) {
      assert.equal(await bar.getByRole('button', { name, exact: false }).first().isVisible(), true, name)
    }
    const box = await bar.boundingBox()
    assert.ok(box.height <= 170, `barra compacta: ${Math.round(box.height)}px`)
    // «Nuevo ticket» y las vistas en la misma fila
    const np = await bar.getByRole('button', { name: /Nuevo ticket/ }).boundingBox()
    const vm = await bar.locator('.board-view-modes').boundingBox()
    assert.ok(Math.abs((np.y + np.height / 2) - (vm.y + vm.height / 2)) < 4, 'alineados')
    await shot(page, `${STAGE}-boards-barra-${theme}-1440.png`, { theme, view: 'boards-toolbar' }, bar)
    // Prioridad, Estudio y Responsable siguen filtrando
    await bar.getByRole('button', { name: /Prioridad/ }).click()
    await page.getByRole('option', { name: 'Urgente' }).click()
    assert.equal(await page.locator('.project-card').count(), kanbanProjects.filter(p => p.priority === 'urgent').length)
    await bar.getByRole('button', { name: /Limpiar filtros/ }).click()
    await bar.locator('label').filter({ hasText: /^Estudio/ }).locator('select').selectOption(OTHER)
    assert.equal(await page.locator('.project-card').count(), 0)
    await bar.locator('label').filter({ hasText: /^Estudio/ }).locator('select').selectOption(PROCONT)
    await bar.locator('label').filter({ hasText: /^Responsable/ }).locator('select').selectOption(STAFF['admin@simulado.invalid'].id)
    assert.equal(await page.locator('.project-card').count(), kanbanProjects.filter(p => p.project_flows[0].assigned_to === STAFF['admin@simulado.invalid'].id).length)
    assert.deepEqual(page.errors, [])
    await page.context().close()
  })
}

test('Barra de Boards responsive: 1920, 1440, 768, 390, 360 y 320 sin desbordar y con objetivos de 44 px', async () => {
  for (const width of [1920, 1440, 768, 390, 360, 320]) {
    const page = await open({ viewport: { width, height: width > 800 ? 900 : 844 } })
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    assert.ok(overflow <= 0, `${width}: sin desplazamiento horizontal (${overflow}px)`)
    const bar = page.locator('.board-toolbar')
    const barBox = await bar.boundingBox()
    for (const el of await bar.locator('button:visible, select:visible').all()) {
      const b = await el.boundingBox()
      assert.ok(b.height >= 44 - 0.5, `${width}: control ≥ 44 px (${b.height})`)
      assert.ok(b.x >= barBox.x - 0.5 && b.x + b.width <= barBox.x + barBox.width + 0.5, `${width}: control dentro de la barra`)
    }
    // Ningún texto de botón se sale de su botón ni se superpone al vecino.
    const clipped = await bar.locator('button:visible').evaluateAll(els => els.filter(b => b.scrollWidth > b.clientWidth + 1).map(b => b.textContent))
    assert.deepEqual(clipped, [], `${width}: etiquetas sin recorte`)
    if ([1920, 1440, 390, 320].includes(width)) await shot(page, `${STAGE}-boards-barra-light-${width}.png`, { theme: 'light', view: 'boards-toolbar-responsive' }, bar)
    await page.context().close()
  }
})

// ─────────────────────────────── DASHBOARD ───────────────────────────────
const reqRow = (n, studio, day) => ({ id: `00000000-0000-4000-9000-${String(n).padStart(12, '0')}`, studio_id: studio, created_at: `${day}T15:00:00.000Z` })
function dashboardRequests() {
  const recent = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10)
  return [
    ...Array.from({ length: 1150 }, (_, i) => reqRow(i, PROCONT, recent)),         // > 1000: exige paginar
    ...Array.from({ length: 40 }, (_, i) => reqRow(5000 + i, OTHER, recent)),
    ...Array.from({ length: 7 }, (_, i) => reqRow(6000 + i, null, recent)),
    ...Array.from({ length: 300 }, (_, i) => reqRow(7000 + i, OTHER, '2025-01-15')),  // fuera de 30/90 días
  ]
}
for (const theme of ['light', 'dark']) {
  test(`[${theme}] Dashboard: «Tickets por estudio» sustituye a Áreas; conteo paginado exacto, periodo y sin estudio`, async () => {
    const page = await open({ theme, section: 'Dashboard', requests: dashboardRequests() })
    const panel = page.locator('section.studio-tickets')
    await panel.getByRole('heading', { name: 'Tickets por estudio' }).waitFor()
    assert.equal(await page.getByRole('heading', { name: /Áreas · código PROCONT/ }).count(), 0)
    assert.equal(await page.getByText(/Sin trabajo en ejecución con área registrada/).count(), 0)
    const read = async () => ({ total: (await panel.locator('.studio-tickets-total .tabular-nums').innerText()).trim(),
      rows: await panel.locator('li').evaluateAll(els => els.map(li => [li.querySelector('.studio-tickets-name').textContent, li.querySelector('.studio-tickets-value').firstChild.textContent])) })
    let r = await read()
    assert.equal(r.total, '1497', 'todo el tiempo: 1150 + 340 + 7')
    assert.deepEqual(r.rows, [['ESTUDIO PROCONT SIMULADO', '1150'], ['ESTUDIO SIMULADO', '340'], ['Sin estudio asignado', '7']])
    assert.ok(page.state.log.filter(l => l.requestsPage).length >= 2, 'se leyó más de una página')
    await shot(page, `${STAGE}-dashboard-tickets-estudio-${theme}-1440.png`, { theme, view: 'dashboard-studio' }, panel)
    await page.getByRole('button', { name: 'Últimos 30d' }).click()
    await page.waitForFunction(() => document.querySelector('.studio-tickets-total .tabular-nums')?.textContent?.trim() === '1197')
    r = await read()
    assert.deepEqual(r.rows, [['ESTUDIO PROCONT SIMULADO', '1150'], ['ESTUDIO SIMULADO', '40'], ['Sin estudio asignado', '7']])
    assert.ok(page.state.log.some(l => l.since?.startsWith('gte.')), 'el periodo se filtra en el servidor')
    const sum = r.rows.reduce((n, [, v]) => n + Number(v), 0)
    assert.equal(sum, 1197, 'sin duplicados: la suma es el total')
    // Barra proporcional: la mayor ocupa toda la pista.
    const scale = await panel.locator('li').first().locator('.studio-tickets-bar > span').evaluate(el => getComputedStyle(el).transform)
    assert.equal(scale, 'matrix(1, 0, 0, 1, 0, 0)')
    assert.deepEqual(page.errors, [])
    await page.context().close()
  })
}

// ─────────────────────────────── CHECKLIST ───────────────────────────────
async function openCard(page, title) {
  await page.locator('.project-card').filter({ hasText: title }).click()
  await page.getByRole('dialog').waitFor()
  await page.getByRole('dialog').getByRole('tab', { name: /Checklist/ }).click()
}
const analysisCard = () => kanbanProjects[3]

for (const theme of ['light', 'dark']) {
  test(`[${theme}] Checklist: tarjeta existente en Analysis sin tareas → sugerencias y alta explícita sin tocar lo completado`, async () => {
    const page = await open({ theme })
    await openCard(page, analysisCard().title)
    const box = page.locator('.checklist-suggested')
    await box.getByText('Tareas sugeridas para Analysis').waitFor()
    assert.equal(await box.locator('li').count(), 3, 'exactamente 3 sugerencias')
    assert.equal(page.state.log.filter(l => l.method === 'POST').length, 0, 'nada se guarda sin acción explícita')
    await shot(page, `${STAGE}-checklist-sugerido-${theme}.png`, { theme, view: 'checklist-suggested' }, page.getByRole('dialog'))
    await box.getByRole('button', { name: 'Agregar tareas sugeridas (3)' }).click()
    await page.locator('.checklist-suggested').waitFor({ state: 'detached' })
    const posts = page.state.log.filter(l => l.method === 'POST')
    assert.equal(posts.length, 1, 'una sola inserción')
    assert.deepEqual(posts[0].rows.map(r => [r.phase, r.completed]), Array(3).fill(['analysis', false]))
    const backlog = page.state.items.filter(i => i.phase === 'backlog' && i.project_flow_id === page.state.analysisFlow)
    assert.equal(backlog.length, 3); assert.ok(backlog.every(i => i.completed), 'Backlog sigue completo')
    await shot(page, `${STAGE}-checklist-agregado-${theme}.png`, { theme, view: 'checklist-added' }, page.getByRole('dialog'))
    assert.deepEqual(page.errors, [])
    await page.context().close()
  })
}

test('Checklist: edición manual, eliminación y alta conservan el resto de tareas', async () => {
  const page = await open()
  await openCard(page, analysisCard().title)
  await page.getByRole('button', { name: 'Agregar tareas sugeridas (3)' }).click()
  await page.locator('.checklist-suggested').waitFor({ state: 'detached' })
  const first = page.state.items.find(i => i.phase === 'analysis')
  await page.getByRole('button', { name: `Editar tarea: ${first.description}` }).click()
  await page.getByLabel('Editar tarea', { exact: true }).fill('Revisar el requerimiento con Finanzas')
  await page.getByRole('button', { name: 'Guardar' }).click()
  await page.getByText('Revisar el requerimiento con Finanzas').waitFor()
  assert.deepEqual(page.state.log.find(l => l.method === 'PATCH').body, { description: 'Revisar el requerimiento con Finanzas' }, 'solo cambia el texto')
  const last = page.state.items.filter(i => i.phase === 'analysis').at(-1)
  await page.getByRole('button', { name: `Eliminar tarea: ${last.description}` }).click()
  await page.waitForFunction(() => document.querySelectorAll('[aria-label^="Eliminar tarea"]').length === 2)   // solo la fase abierta
  assert.equal(page.state.items.filter(i => i.phase === 'analysis').length, 2)
  assert.equal(page.state.items.filter(i => i.phase === 'backlog' && i.completed).length, 3)
  await page.context().close()
})

test('Checklist: cambiar de fase NO materializa tareas; cada fase vacía sugiere 3 y se agregan solo con la acción explícita', async () => {
  const page = await open()
  const card = kanbanProjects[0]   // Backlog, sin tareas en ninguna fase
  const flow = card.project_flows[0].id
  const dialog = page.getByRole('dialog')
  await page.locator('.project-card').filter({ hasText: card.title }).click()
  await dialog.waitFor()
  const move = async phase => {
    await dialog.getByRole('tab', { name: /Detalles/ }).click()
    await dialog.getByLabel('Mover a fase').selectOption(phase)
    await page.waitForFunction(p => document.querySelector('[role=dialog] select[aria-label="Mover a fase"]')?.value === p, phase)
    await dialog.getByRole('tab', { name: /Checklist/ }).click()
  }
  const count = phase => page.state.items.filter(i => i.project_flow_id === flow && i.phase === phase)
  await move('analysis')
  await dialog.getByText('Tareas sugeridas para Analysis').waitFor()
  assert.equal(count('analysis').length, 0, 'el cambio de fase no inserta nada')
  assert.equal(page.state.log.filter(l => l.method === 'POST').length, 0)
  await dialog.getByRole('button', { name: 'Agregar tareas sugeridas (3)' }).click()
  await page.waitForFunction(() => document.querySelectorAll('[aria-label^="Eliminar tarea"]').length === 3)
  assert.equal(count('analysis').length, 3); assert.ok(count('analysis').every(i => !i.completed))
  await dialog.getByRole('checkbox').first().click()   // controlado: cambia tras confirmar el servidor
  await page.waitForFunction(() => document.querySelector('[role=dialog] input[type=checkbox]')?.checked)
  await move('design')
  await dialog.getByText('Tareas sugeridas para Design').waitFor()
  assert.equal(count('design').length, 0)
  await move('analysis')
  await page.waitForTimeout(300)
  assert.equal(count('analysis').length, 3, 'sin duplicados al volver')
  assert.equal(count('analysis').filter(i => i.completed).length, 1, 'la completada sigue completada')
  assert.equal(page.state.log.filter(l => l.method === 'POST').length, 1, 'solo la inserción explícita')
  await shot(page, `${STAGE}-checklist-cambio-fase.png`, { theme: 'light', view: 'checklist-phase-change' }, dialog)
  await page.context().close()
})
