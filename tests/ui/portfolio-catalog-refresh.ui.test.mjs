// Regression: portfolio catalog polling is shared, focus-aware, recoverable and does not discard a saved filter.
// REST/Auth remain deterministic fixtures; this test exercises the real React hook and browser event lifecycle.
import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createServer as createViteServer } from 'vite'
import { chromium } from 'playwright-core'
import { startFixtureServer, SIMULATED_PASSWORD } from './fixture-server.mjs'
import { installVisualFixtures } from './ux-fixtures.mjs'
import { installKanbanFixtures, kanbanProjects, OWNER_FIXTURE } from './kanban-attachments-fixtures.mjs'
import { createBoardState, installBoardFixtures } from './boards-dashboard-fixtures.mjs'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const PORTFOLIO_ID = '00000000-0000-4000-8000-0000000000e1'
const NEW_PORTFOLIO_ID = '00000000-0000-4000-8000-0000000000e4'
const INITIATIVE_ID = '00000000-0000-4000-8000-0000000000e2'
let fixture, vite, browser, base
let catalogs, failures, counts

before(async () => {
  fixture = await startFixtureServer()
  const settings = { VITE_SUPABASE_URL: fixture.url, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_simulada_solo_pruebas', VITE_CLIENT_LOGIN_ENABLED: '1' }
  Object.assign(process.env, settings)
  vite = await createViteServer({ root: ROOT, logLevel: 'error', server: { host: '127.0.0.1', port: 0, hmr: false } })
  await vite.listen()
  base = `http://127.0.0.1:${vite.httpServer.address().port}`
  for (const name of Object.keys(settings)) delete process.env[name]
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || undefined })
})

after(async () => { await browser?.close(); await vite?.close(); await fixture?.close() })

const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: {
  'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range',
  'Content-Range': `0-${Math.max(0, (Array.isArray(body) ? body.length : 1) - 1)}/${Array.isArray(body) ? body.length : 1}` }, body: JSON.stringify(body) })

async function waitCounts(expected) {
  const end = Date.now() + 5000
  while (Date.now() < end) {
    if (counts.portfolios === expected.portfolios && counts.initiatives === expected.initiatives) return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  assert.deepEqual(counts, expected, 'catalog queries should settle to the expected shared count')
}

test('shared portfolio catalog refreshes, recovers, preserves filters and cleans up across logout/login', async () => {
  catalogs = {
    portfolios: [{ id: PORTFOLIO_ID, name: 'Gestión', description: null, is_active: true, sort_order: 1 }],
    initiatives: [{ id: INITIATIVE_ID, portfolio_id: PORTFOLIO_ID, name: 'Beneficiarios finales', description: null, is_active: true, sort_order: 1 }],
  }
  failures = { portfolios: false, initiatives: false }
  counts = { portfolios: 0, initiatives: 0 }
  Object.assign(kanbanProjects[4], { portfolio_id: PORTFOLIO_ID, initiative_id: INITIATIVE_ID })
  Object.assign(kanbanProjects[5], { portfolio_id: PORTFOLIO_ID, initiative_id: INITIATIVE_ID })
  Object.assign(kanbanProjects[6], { portfolio_id: NEW_PORTFOLIO_ID, initiative_id: null })

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-PE' })
  await context.route('**/*', route => {
    const url = new URL(route.request().url())
    return ['127.0.0.1', 'localhost'].includes(url.hostname) || ['data:', 'blob:'].includes(url.protocol) ? route.continue() : route.abort()
  })
  await context.addInitScript(() => { try { localStorage.setItem('ticketera-theme', 'light') } catch {} })
  const page = await context.newPage()
  // Freeze browser time so the production 30-second interval can be exercised without a 30-second test delay.
  await page.clock.install({ time: new Date() })
  page.errors = []
  page.on('pageerror', error => page.errors.push(error.message))
  await installVisualFixtures(page, fixture.url)
  await installKanbanFixtures(page, fixture.url)
  const state = createBoardState()
  await installBoardFixtures(page, fixture.url, state)
  await page.route(`${fixture.url}/rest/v1/portfolios?**`, async route => {
    counts.portfolios++
    if (failures.portfolios) return json(route, { code: 'XX000', message: 'error de red de prueba' }, 503)
    return json(route, catalogs.portfolios)
  })
  await page.route(`${fixture.url}/rest/v1/portfolio_initiatives?**`, async route => {
    counts.initiatives++
    if (failures.initiatives) return json(route, { code: 'XX000', message: 'error de red de prueba' }, 503)
    return json(route, catalogs.initiatives)
  })
  await page.route(`${fixture.url}/rest/v1/rpc/internal_card_colors`, route => json(route, { user_id: null, assignments: OWNER_FIXTURE, colors: [] }))

  const enterBoards = async () => {
    await page.getByRole('button', { name: /Acceso del equipo de TI/ }).click()
    await page.fill('#staff-modal-email', 'superadmin@simulado.invalid')
    await page.fill('#staff-modal-password', SIMULATED_PASSWORD)
    await page.getByRole('button', { name: 'Ingresar al sistema' }).click()
    await page.locator('nav[aria-label="Secciones"]').waitFor()
    await page.getByRole('button', { name: /^Boards/ }).click()
    await page.locator('.project-card').first().waitFor()
    await page.locator('.card-hierarchy').first().waitFor()
  }
  const forceRefresh = () => page.evaluate(() => {
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))
  })

  try {
    await page.goto(base + '/portal')
    await enterBoards()
    await waitCounts({ portfolios: 1, initiatives: 1 })
    const label = page.locator('.card-project-line').filter({ hasText: 'Beneficiarios finales' }).first()
    await label.waitFor()

    // One pair of REST reads is shared by the Board and its many ProjectCard subscribers.
    catalogs.portfolios = [{ ...catalogs.portfolios[0], name: 'Gestión renovada' }]
    await page.clock.fastForward(30_000)
    await page.locator('.board-toolbar option').filter({ hasText: 'Gestión renovada' }).first().waitFor({ state: 'attached' })
    assert.deepEqual(counts, { portfolios: 2, initiatives: 2 }, '30-second refresh is a single shared pair of queries')

    // Hidden tabs pause interval polling; focus + visibility wakeup coalesce into one pair.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await page.clock.fastForward(30_000)
    assert.deepEqual(counts, { portfolios: 2, initiatives: 2 }, 'a hidden tab does not poll')
    catalogs.portfolios = [{ ...catalogs.portfolios[0], name: 'Gestión al volver' }]
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
      window.dispatchEvent(new Event('focus'))
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await page.locator('.board-toolbar option').filter({ hasText: 'Gestión al volver' }).first().waitFor({ state: 'attached' })
    assert.deepEqual(counts, { portfolios: 3, initiatives: 3 }, 'focus and visibilitychange do not duplicate the shared read')

    // A transient network failure preserves the last good catalog; the next focus recovers.
    failures.portfolios = true
    await forceRefresh()
    await waitCounts({ portfolios: 4, initiatives: 4 })
    await page.locator('.board-toolbar option').filter({ hasText: 'Gestión al volver' }).first().waitFor({ state: 'attached' })
    failures.portfolios = false
    catalogs.portfolios = [{ ...catalogs.portfolios[0], name: 'Gestión recuperada' }]
    await forceRefresh()
    await page.locator('.board-toolbar option').filter({ hasText: 'Gestión recuperada' }).first().waitFor({ state: 'attached' })
    assert.deepEqual(counts, { portfolios: 5, initiatives: 5 }, 'recovery performs one pair of reads and updates labels')

    await page.getByRole('button', { name: 'Cerrar Sesión' }).click()
    await page.getByRole('button', { name: /Acceso del equipo de TI/ }).waitFor()
    const afterLogout = { ...counts }
    await page.clock.fastForward(60_000)
    assert.deepEqual(counts, afterLogout, 'last subscriber logout clears the interval and event listeners')

    // Simulate a valid persisted filter not present in the old in-memory snapshot, now present remotely.
    await page.evaluate(id => localStorage.setItem('kanban_portfolioFilter', `p:${id}`), NEW_PORTFOLIO_ID)
    catalogs.portfolios = [
      ...catalogs.portfolios,
      { id: NEW_PORTFOLIO_ID, name: 'Operaciones QA', description: null, is_active: true, sort_order: 2 },
    ]
    await enterBoards()
    await waitCounts({ portfolios: afterLogout.portfolios + 1, initiatives: afterLogout.initiatives + 1 })
    const portfolioFilter = page.locator('.board-toolbar label').filter({ hasText: /^Portafolio/ }).locator('select')
    assert.equal(await portfolioFilter.inputValue(), `p:${NEW_PORTFOLIO_ID}`, 'revalidation preserves a filter valid in the refreshed catalog')
    assert.equal(await page.locator('.project-card').count(), 1, 'the refreshed filter retains its associated ticket')
    assert.deepEqual(page.errors, [])
  } finally {
    await context.close()
  }
})
