// SIMULATED audit of private views: the real main build served locally against the repo's
// fixture server (fictitious data). All external network is aborted. Never touches production.
import { writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { preview } from 'vite'
import { chromium } from 'playwright-core'
import { collect, tabWalk } from './metrics.mjs'

const ROOT = new URL('../../../', import.meta.url).pathname
const { startFixtureServer, STAFF, SIMULATED_PASSWORD } = await import(ROOT + 'tests/ui/fixture-server.mjs')
const { installVisualFixtures } = await import(ROOT + 'tests/ui/ux-fixtures.mjs')
const { MOCK_RUC, MOCK_PASSWORD, MOCK_PRODUCTS } = await import(ROOT + 'src/dev/client-portal-mock.ts')
const OUT = ROOT + '.agent-artifacts/audit/sim/', BUILD = ROOT + '.agent-artifacts/audit/simbuild'
mkdirSync(OUT + 'shots', { recursive: true })
const VIEWPORTS = { desktop: [1920, 1080], laptop: [1440, 900], tablet: [768, 1024], movil: [390, 844], m360: [360, 800] }

const fixture = await startFixtureServer()
const env = { VITE_SUPABASE_URL: fixture.url, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_simulada_solo_pruebas', VITE_CLIENT_PORTAL_MOCK: '0', VITE_CLIENT_LOGIN_ENABLED: '1' }
const built = spawnSync('npx', ['vite', 'build', '--outDir', BUILD, '--emptyOutDir'], { cwd: ROOT, env: { ...process.env, ...env }, encoding: 'utf8' })
if (built.status) throw new Error(built.stderr)
const server = await preview({ root: ROOT, logLevel: 'error', build: { outDir: BUILD }, preview: { host: '127.0.0.1', port: 0 } })
const base = `http://127.0.0.1:${server.httpServer.address().port}`
const browser = await chromium.launch()
const ONLY = process.env.ONLY
const out = { kind: 'SIMULATED (local build of main + fixture server, fictitious data)', screens: [], manifest: [], failures: [], external: [], errors: [] }
let version

async function open(vp, opts = {}) {
  const [w, h] = VIEWPORTS[vp]
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'es-PE', hasTouch: w <= 768, isMobile: w <= 390, ...opts })
  await ctx.route('**/*', r => { const u = new URL(r.request().url()); if (['127.0.0.1', 'localhost'].includes(u.hostname) || ['data:', 'blob:'].includes(u.protocol)) return r.continue(); out.external.push(u.origin); return r.abort() })
  const page = await ctx.newPage()
  page.on('pageerror', e => out.errors.push(vp + ': ' + String(e).slice(0, 160)))
  await installVisualFixtures(page, fixture.url)
  await page.goto(base + '/portal')
  return page
}
async function shoot(page, vp, area, screen, extra = {}) {
  await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(200)
  const m = await page.evaluate(collect)
  const file = `${vp}-${screen}.png`
  const png = await page.screenshot({ path: OUT + 'shots/' + file, fullPage: true, animations: 'disabled' })
  version ??= (await page.locator('[data-testid=build-version]').innerText().catch(() => '')).trim()
  out.manifest.push({ file, route: m.url, version, resolution: m.viewport.join('x'), area, screen, date: new Date().toISOString(), sha256: createHash('sha256').update(png).digest('hex'), simulated: true })
  out.screens.push({ vp, area, screen, ...m, ...extra })
}
const step = async (label, fn) => { try { await fn() } catch (e) { out.failures.push(label + ': ' + String(e.message || e).split('\n')[0].slice(0, 200)) } }
async function clientLogin(page, provider) {
  await page.goto(base + '/cliente')
  await page.getByRole('button', { name: provider === 'quipu' ? /Ingreso con usuario/ : /Ingreso empresarial/ }).click()
  await page.fill('#client-ruc', MOCK_RUC)
  if (provider === 'quipu') await page.fill('#client-username', 'ana')
  await page.fill('#client-password', MOCK_PASSWORD)
  await page.locator('form[aria-label^="Ingreso con"] button[type=submit]').click()
  await page.waitForURL('**/cliente/nuevo'); await page.locator('#ticket-product').waitFor()
}
async function staff(page) {
  await page.getByRole('button', { name: /Ingreso del personal/ }).click()
  await page.fill('#staff-modal-email', 'superadmin@simulado.invalid')
  await page.fill('#staff-modal-password', SIMULATED_PASSWORD)
  await page.getByRole('button', { name: 'Ingresar al sistema' }).click()
  await page.locator('nav[aria-label="Secciones"]').waitFor()
  await page.getByText('Cycle Time promedio', { exact: true }).waitFor()
}

for (const vp of Object.keys(VIEWPORTS)) {
  // Quipu
  if (!ONLY || ONLY === 'quipu') await step(vp + ' quipu', async () => {
    const page = await open(vp); await clientLogin(page, 'quipu')
    await shoot(page, vp, 'Cliente', '20-quipu-nuevo-ticket')
    if (vp === 'laptop' || vp === 'movil') out[`tab-nuevo-${vp}`] = await tabWalk(page, 14)
    await page.selectOption('#ticket-product', MOCK_PRODUCTS[1].id)
    await page.waitForFunction(() => !document.querySelector('#ticket-subproject-help')?.textContent.includes('Cargando'))
    await shoot(page, vp, 'Cliente', '21-quipu-subproyectos')
    await page.getByRole('link', { name: 'Mis tickets', exact: true }).first().click()
    await page.locator('main a:visible', { hasText: 'REQ26-9001' }).first().waitFor()
    await shoot(page, vp, 'Cliente', '22-quipu-mis-tickets')
    await page.locator('main a:visible', { hasText: 'REQ26-9001' }).first().click()
    await page.waitForURL('**/cliente/tickets/**'); await page.waitForTimeout(300)
    await shoot(page, vp, 'Cliente', '23-detalle-propio')
    await page.context().close()
  })
  // QuipuFac
  if (!ONLY || ONLY === 'quipufac') await step(vp + ' quipufac', async () => {
    const page = await open(vp); await clientLogin(page, 'quipufac')
    await shoot(page, vp, 'Cliente', '24-quipufac-nuevo-ticket')
    const submit = page.locator('.ticket-form button[type=submit]')
    const disabledWithoutProduct = await submit.isDisabled()
    const firstProduct = await page.locator('#ticket-product option:not([value=""])').first().getAttribute('value')
    await page.selectOption('#ticket-product', firstProduct)
    await page.waitForFunction(() => !document.querySelector('#ticket-subproject-help')?.textContent.includes('Cargando'))
    await submit.click(); await page.waitForTimeout(400)
    const focused = await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName)
    await shoot(page, vp, 'Cliente', '25-quipufac-validacion-vacia', { disabledWithoutProduct, focusedAfterSubmit: focused,
      alerts: await page.locator('[role=alert]').allInnerTexts(), invalidFields: await page.locator('[aria-invalid=true]').count() })
    await page.getByRole('link', { name: 'Mis tickets', exact: true }).first().click()
    await page.waitForTimeout(800)
    await shoot(page, vp, 'Cliente', '26-quipufac-mis-tickets-empresa')
    await page.context().close()
  })
  // Staff
  if (!ONLY || ONLY === 'staff') await step(vp + ' staff', async () => {
    const page = await open(vp); await staff(page)
    await shoot(page, vp, 'Panel interno', '30-dashboard')
    await page.getByRole('button', { name: /^Requests/ }).click()
    await page.locator('.request-card').first().waitFor()
    await shoot(page, vp, 'Panel interno', '31-bandeja')
    const card = page.locator('.request-card').filter({ hasText: 'REQ26-7500' })
    await card.getByRole('button', { name: /Aprobar/ }).click()
    const dialog = page.getByRole('dialog', { name: 'Validación de solicitud' }); await dialog.waitFor()
    const modalMotion = await dialog.evaluate(el => { const p = el.closest('.modal-panel') || el.querySelector('.modal-panel') || el; const cs = getComputedStyle(p); return { input: document.documentElement.dataset.input, transition: cs.transition.slice(0, 120) } })
    await shoot(page, vp, 'Panel interno', '32-modal-validacion', { modalMotion })
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: /^Boards/ }).click(); await page.locator('.board-column').first().waitFor()
    await shoot(page, vp, 'Panel interno', '33-kanban')
    for (const [name, id] of [['Tabla', '34-tabla'], ['Gantt', '35-gantt'], ['Roadmap', '36-roadmap']]) {
      await page.getByRole('button', { name: new RegExp(name) }).click(); await page.waitForTimeout(250)
      await shoot(page, vp, 'Panel interno', id)
    }
    await page.getByRole('button', { name: /Kanban/ }).click(); await page.locator('.board-column').first().waitFor()
    await page.getByText('Revisión del reporte de ventas', { exact: true }).click()
    await page.getByRole('dialog', { name: 'Detalle del ticket' }).waitFor(); await page.waitForTimeout(300)
    await shoot(page, vp, 'Panel interno', '37-modal-ticket')
    await page.context().close()
  })
}
// Reduced motion on an internal modal (opacity kept? movement removed?).
if (!ONLY) await step('reduced-motion modal', async () => {
  const page = await open('laptop', { reducedMotion: 'reduce' }); await staff(page)
  await page.getByRole('button', { name: /^Requests/ }).click(); await page.locator('.request-card').first().waitFor()
  await page.locator('.request-card').filter({ hasText: 'REQ26-7500' }).getByRole('button', { name: /Aprobar/ }).click()
  const d = page.getByRole('dialog', { name: 'Validación de solicitud' }); await d.waitFor()
  out.reducedMotionModal = await page.locator('.modal-panel').first().evaluate(el => getComputedStyle(el).transition)
  await page.context().close()
})
out.version = version
writeFileSync(OUT + (ONLY ? `results-${ONLY}.json` : 'results.json'), JSON.stringify(out, null, 1))
writeFileSync(OUT + (ONLY ? `manifest-${ONLY}.json` : 'manifest.json'), JSON.stringify({ kind: out.kind, version, captures: out.manifest }, null, 1))
console.log(JSON.stringify({ version, screens: out.screens.length, failures: out.failures, external: [...new Set(out.external)], errors: out.errors.slice(0, 5) }))
await browser.close(); await server.close(); await fixture.close()
