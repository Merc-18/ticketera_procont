// QA integral 25/11/2026 — Regresiones responsive detectadas con el conjunto QA-FICTICIO (tests/ui/qa-dataset.json).
// EVIDENCIA: UI real (React + Vite + Chromium) con REST simulado en rutas locales; no es E2E contra PostgreSQL.
// Auth simulado de tests/ui/fixture-server.mjs (@simulado.invalid / clave-simulada); sin red externa.
import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createServer as createViteServer } from 'vite'
import { chromium } from 'playwright-core'
import { startFixtureServer, SIMULATED_PASSWORD } from './fixture-server.mjs'
import { installVisualFixtures } from './ux-fixtures.mjs'
import { installQaFixtures, QA } from './qa-fixtures.mjs'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const PENDING_FIRST = QA.requests.find(r => r.status === 'pending')
const QA_STUDIO = QA.studios.find(s => s.id === PENDING_FIRST?.studio_id)?.name
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

async function login(width, theme = 'light') {
  const context = await browser.newContext({ viewport: { width, height: 900 }, locale: 'es-PE' })
  await context.route('**/*', r => { const u = new URL(r.request().url()); return ['127.0.0.1', 'localhost'].includes(u.hostname) || ['data:', 'blob:'].includes(u.protocol) ? r.continue() : r.abort() })
  await context.addInitScript(t => { try { localStorage.setItem('ticketera-theme', t) } catch {} }, theme)
  const page = await context.newPage()
  page.errors = []
  page.on('pageerror', e => page.errors.push(e.message))
  await installVisualFixtures(page, fixture.url)
  await installQaFixtures(page, fixture.url)
  await page.goto(base + '/portal')
  await page.getByRole('button', { name: /Acceso del equipo de TI/ }).click()
  await page.fill('#staff-modal-email', 'superadmin@simulado.invalid')
  await page.fill('#staff-modal-password', SIMULATED_PASSWORD)
  await page.getByRole('button', { name: 'Ingresar al sistema' }).click()
  await page.locator('.stat-card').first().waitFor()
  return page
}
const box = loc => loc.boundingBox()
const noPageOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)

for (const [width, theme] of [[320, 'light'], [390, 'dark']]) {
  test(`[QA ${width}px ${theme}] Dashboard, Boards, bandeja y portafolio sin encajonar texto`, async () => {
    const page = await login(width, theme)

    // Dashboard: la nota del periodo usa el ancho de la barra (antes ~170 px a 320 px).
    const toolbar = await box(page.locator('.dashboard-toolbar'))
    const note = await box(page.locator('.dashboard-filter-note'))
    assert.ok(note.width >= toolbar.width * 0.8, `nota del periodo ${note.width}px de ${toolbar.width}px`)
    const segment = await box(page.locator('.dashboard-segment'))
    assert.ok(segment.width >= toolbar.width * 0.8, 'selector de periodo a todo el ancho')
    assert.ok(await noPageOverflow(page), 'Dashboard sin scroll horizontal')

    // Boards: los cuatro modos de vista en una fila que ocupa el ancho disponible.
    await page.getByRole('button', { name: /^Boards/ }).click()
    await page.locator('.project-card').first().waitFor()
    const modes = page.locator('.board-view-modes button')
    assert.equal(await modes.count(), 4)
    const tops = await Promise.all([0, 1, 2, 3].map(async i => Math.round((await box(modes.nth(i))).y)))
    assert.equal(new Set(tops).size, 1, 'Kanban/Tabla/Gantt/Roadmap en una sola fila')
    const group = await box(page.locator('.board-view-modes'))
    const actions = await box(page.locator('.board-toolbar-actions'))
    assert.ok(group.width >= actions.width - 2, `grupo de vistas ${group.width}px de ${actions.width}px`)
    assert.ok(await noPageOverflow(page), 'Boards sin scroll horizontal')

    // Bandeja: el chip de estado queda sobre los datos y estos usan el ancho de la tarjeta (≤420 px).
    await page.getByRole('button', { name: /^Requests/ }).click()
    const card = page.locator('.request-card').filter({ hasText: PENDING_FIRST.title }).first()
    await card.waitFor()
    const header = card.locator('> div').first()
    const infoLocator = header.locator('> div').first()
    const info = await box(infoLocator)
    const infoMetrics = await infoLocator.evaluate(el => {
      const clone = el.cloneNode(true)
      Object.assign(clone.style, { position: 'fixed', visibility: 'hidden', width: 'max-content', maxWidth: 'none', whiteSpace: 'nowrap', inset: 'auto' })
      document.body.append(clone)
      const maxContent = clone.getBoundingClientRect().width
      clone.remove()
      const card = el.closest('.request-card')
      const style = getComputedStyle(card)
      return { maxContent, available: card.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) }
    })
    const chip = await box(header.locator('> span').first())
    const cardBox = await box(card)
    assert.ok(chip.y + chip.height <= info.y + 1, 'chip «Pendiente» encima de los datos')
    assert.ok(info.width + 1 >= Math.min(infoMetrics.maxContent, infoMetrics.available),
      `datos sin encajonamiento: ${info.width}px; max-content ${infoMetrics.maxContent}px; disponible ${infoMetrics.available}px (tarjeta ${cardBox.width}px)`)

    // Modal de validación: catálogo sanitizado y ficha en una columna.
    await card.getByRole('button', { name: /Aprobar/ }).click()
    const dialog = page.getByRole('dialog')
    await dialog.waitFor()
    const studio = dialog.getByText(QA_STUDIO, { exact: true }).first()
    const cols = await studio.evaluate(el => getComputedStyle(el.closest('.grid')).gridTemplateColumns.split(' ').length)
    assert.equal(cols, 1, 'ficha del solicitante en una columna')
    await page.keyboard.press('Escape')

    // Portafolio: el contador «N tickets» nunca se parte en dos líneas.
    await page.getByRole('button', { name: /^Equipo/ }).click()
    await page.getByRole('tab', { name: 'Portafolios y proyectos' }).click()
    const counts = page.locator('.portfolio-count')
    await counts.first().waitFor()
    for (const h of await counts.evaluateAll(els => els.map(e => e.getBoundingClientRect().height)))
      assert.ok(h < 24, `contador en una línea (alto ${h}px)`)
    assert.ok(await noPageOverflow(page), 'Equipo sin scroll horizontal')

    assert.deepEqual(page.errors, [])
    await page.context().close()
  })
}

test('[QA 1440px] Dashboard: «Actualizar» queda en la misma fila que Equipo y Exportar', async () => {
  const page = await login(1440)
  // La barra alinea por la base (items-end): misma fila = mismo borde inferior.
  const bottom = async name => { const b = await box(page.getByRole('button', { name }).first()); return Math.round(b.y + b.height) }
  const [team, exp, refresh] = [await bottom(/Equipo Gestión de usuarios/), await bottom(/Exportar/), await bottom(/Actualizar/)]
  assert.ok(Math.abs(team - refresh) <= 2 && Math.abs(exp - refresh) <= 2, `bordes inferiores ${team}/${exp}/${refresh}`)
  const note = await page.locator('.dashboard-filter-note').evaluate(el => getComputedStyle(el).fontSize)
  assert.equal(note, '13px', 'nota secundaria con tipografía auxiliar')
  assert.deepEqual(page.errors, [])
  await page.context().close()
})
