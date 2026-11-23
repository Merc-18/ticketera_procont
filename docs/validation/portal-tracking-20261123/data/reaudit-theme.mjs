// Re-audit of the CORRECTED build (local only, never production). Real build of the working tree served by
// Vite preview against the repository's fixture server (fictitious data). External network aborted.
// Public screens (portal, login, tracking, staff modal) and private screens (client, internal panel) at
// 1920, 1440, 768, 390 and 360 px, plus 320 px overflow, hover-before-click, reduced motion, Tab walks and
// cold per-page JavaScript loads.
import { writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { preview } from 'vite'
import { chromium } from 'playwright-core'
import { collect, tabWalk } from './metrics.mjs'

const ROOT = new URL('../../../', import.meta.url).pathname
const { startFixtureServer, SIMULATED_PASSWORD } = await import(ROOT + 'tests/ui/fixture-server.mjs')
const { installVisualFixtures } = await import(ROOT + 'tests/ui/ux-fixtures.mjs')
const { MOCK_RUC, MOCK_PASSWORD, MOCK_PRODUCTS } = await import(ROOT + 'src/dev/client-portal-mock.ts')
// Tema por parámetro: THEME=light|dark. La preferencia se fija en localStorage antes de cargar, como la elige la persona.
const THEME = process.env.THEME === 'dark' ? 'dark' : 'light'
const OUT = ROOT + `.agent-artifacts/portal-tracking/reaudit-${THEME}/`, BUILD = ROOT + '.agent-artifacts/portal-tracking/reaudit-build'
mkdirSync(OUT + 'shots', { recursive: true })
const VIEWPORTS = { desktop: [1920, 1080], laptop: [1440, 900], tablet: [768, 1024], movil: [390, 844], m360: [360, 800] }
const fixture = await startFixtureServer()
const env = { VITE_SUPABASE_URL: fixture.url, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_simulada_solo_pruebas', VITE_CLIENT_PORTAL_MOCK: '0', VITE_CLIENT_LOGIN_ENABLED: '1' }
const built = spawnSync('npx', ['vite', 'build', '--outDir', BUILD, '--emptyOutDir'], { cwd: ROOT, env: { ...process.env, ...env }, encoding: 'utf8' })
if (built.status) throw new Error(built.stderr)
const server = await preview({ root: ROOT, logLevel: 'error', build: { outDir: BUILD }, preview: { host: '127.0.0.1', port: 0 } })
const base = `http://127.0.0.1:${server.httpServer.address().port}`
const browser = await chromium.launch()
const out = { kind: 'LOCAL build of the corrected tree + fixture server (fictitious data); NOT production', screens: [], manifest: [], failures: [], external: [], errors: [], nonGet: [] }
let version

async function open(vp, opts = {}) {
  const [w, h] = Array.isArray(vp) ? vp : VIEWPORTS[vp]
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'es-PE', hasTouch: w <= 768, isMobile: w <= 390, ...opts })
  await ctx.route('**/*', r => { const u = new URL(r.request().url()); if (['127.0.0.1', 'localhost'].includes(u.hostname) || ['data:', 'blob:'].includes(u.protocol)) return r.continue(); out.external.push(u.origin); return r.abort() })
  const page = await ctx.newPage()
  page.on('pageerror', e => out.errors.push(String(e).slice(0, 160)))
  await installVisualFixtures(page, fixture.url)
  await page.addInitScript(t => { try { localStorage.setItem('ticketera-theme', t) } catch {} }, THEME)
  return page
}
async function shoot(page, vp, area, screen, extra = {}) {
  await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(250)
  const m = await page.evaluate(collect)
  const file = `${THEME}-${vp}-${screen}.png`
  const png = await page.screenshot({ path: OUT + 'shots/' + file, fullPage: true, animations: 'disabled' })
  version ??= (await page.locator('[data-testid=build-version]').innerText().catch(() => '')).trim()
  out.manifest.push({ file, route: m.url, version, resolution: m.viewport.join('x'), area, screen, theme: THEME, date: new Date().toISOString(), sha256: createHash('sha256').update(png).digest('hex'), environment: 'local-fixture' })
  out.screens.push({ vp, area, screen, theme: THEME, dataTheme: await page.evaluate(() => document.documentElement.dataset.theme), ...m, ...extra })
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
  await page.goto(base + '/portal')
  await page.getByRole('button', { name: /Ingreso del personal/ }).click()
  await page.fill('#staff-modal-email', 'superadmin@simulado.invalid')
  await page.fill('#staff-modal-password', SIMULATED_PASSWORD)
  await page.getByRole('button', { name: 'Ingresar al sistema' }).click()
  await page.locator('nav[aria-label="Secciones"]').waitFor()
  await page.getByText('Cycle Time promedio', { exact: true }).waitFor()
}

for (const vp of Object.keys(VIEWPORTS)) {
  await step(vp + ' public', async () => {
    const page = await open(vp)
    await page.goto(base + '/portal', { waitUntil: 'networkidle' }); await page.waitForTimeout(1300)
    await shoot(page, vp, 'Portal', '01-portal')
    if (vp === 'laptop' || vp === 'movil') out[`tab-portal-${vp}`] = await tabWalk(page, 6)
    await page.goto(base + '/cliente'); const cards = page.locator('[aria-label="Tipo de ingreso"] button'); await cards.first().waitFor()
    await shoot(page, vp, 'Ingreso', '02-seleccion')
    await cards.nth(0).click(); await page.locator('#client-ruc').waitFor()
    await shoot(page, vp, 'Ingreso', '03-quipu')
    if (vp === 'laptop' || vp === 'movil') out[`tab-quipu-${vp}`] = await tabWalk(page, 10)
    await page.locator('form[aria-label^="Ingreso con"] button[type=submit]').click(); await page.waitForTimeout(300)
    await shoot(page, vp, 'Ingreso', '03b-quipu-validacion-vacia', { alerts: await page.locator('[role=alert]').allInnerTexts() })
    await cards.nth(1).click(); await page.waitForTimeout(300)
    await shoot(page, vp, 'Ingreso', '04-quipufac')
    // Seguimiento público integrado en el portal: resultado encontrado y sin resultado, sin salir de /portal.
    await page.goto(base + '/portal'); await page.fill('#tracking-number', 'REQ26-9201'); await page.locator('#seguimiento form button[type=submit]').click()
    await page.getByTestId('public-tracking-result').waitFor()
    await shoot(page, vp, 'Portal', '05-seguimiento-portal')
    await page.fill('#tracking-number', '9999'); await page.locator('#tracking-number').press('Enter'); await page.getByText(/No encontramos la solicitud/).waitFor()
    await shoot(page, vp, 'Portal', '05b-seguimiento-sin-resultado')
    await page.goto(base + '/portal'); await page.getByRole('button', { name: /Ingreso del personal/ }).click(); await page.waitForTimeout(400)
    await shoot(page, vp, 'Panel interno', '06-ingreso-personal-modal')
    await page.context().close()
  })
  await step(vp + ' quipu', async () => {
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
    await page.locator('.ticket-detail').waitFor()
    await shoot(page, vp, 'Cliente', '23-detalle-propio')
    await page.context().close()
  })
  await step(vp + ' quipufac', async () => {
    const page = await open(vp); await clientLogin(page, 'quipufac')
    await shoot(page, vp, 'Cliente', '24-quipufac-nuevo-ticket')
    const submit = page.locator('.ticket-form button[type=submit]')
    const disabledWithoutProduct = await submit.isDisabled()
    await submit.click(); await page.waitForTimeout(400)
    const focused = await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName)
    await shoot(page, vp, 'Cliente', '25-quipufac-validacion-vacia', { disabledWithoutProduct, focusedAfterSubmit: focused,
      fieldErrors: await page.locator('.field-error').allInnerTexts(), invalidFields: await page.locator('[aria-invalid=true]').count(),
      status: await page.locator('form p[role=status]').innerText().catch(() => '') })
    await page.getByRole('link', { name: 'Mis tickets', exact: true }).first().click()
    await page.locator('main a:visible').first().waitFor()
    await shoot(page, vp, 'Cliente', '26-quipufac-mis-tickets-empresa')
    await page.context().close()
  })
  await step(vp + ' staff', async () => {
    const page = await open(vp); await staff(page)
    await shoot(page, vp, 'Panel interno', '30-dashboard')
    await page.getByRole('button', { name: /^Requests/ }).click(); await page.locator('.request-card').first().waitFor()
    await shoot(page, vp, 'Panel interno', '31-bandeja')
    await page.locator('.request-card').filter({ hasText: 'REQ26-7500' }).getByRole('button', { name: /Aprobar/ }).click()
    const dialog = page.getByRole('dialog', { name: 'Validación de solicitud' }); await dialog.waitFor(); await page.waitForTimeout(300)
    await shoot(page, vp, 'Panel interno', '32-modal-validacion')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: /^Boards/ }).click(); await page.locator('.board-column').first().waitFor()
    await shoot(page, vp, 'Panel interno', '33-kanban')
    for (const [name, id] of [['Tabla', '34-tabla'], ['Gantt', '35-gantt'], ['Roadmap', '36-roadmap']]) {
      await page.getByRole('button', { name: new RegExp(name) }).click(); await page.waitForTimeout(300)
      await shoot(page, vp, 'Panel interno', id)
    }
    await page.getByRole('button', { name: /Kanban/ }).click(); await page.locator('.board-column').first().waitFor()
    await page.getByText('Revisión del reporte de ventas', { exact: true }).click()
    await page.getByRole('dialog', { name: 'Detalle del ticket' }).waitFor(); await page.waitForTimeout(300)
    await shoot(page, vp, 'Panel interno', '37-modal-ticket')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Equipo', exact: true }).click(); await page.waitForTimeout(800)
    await shoot(page, vp, 'Panel interno', '38-equipo')
    await page.context().close()
  })
}
// 320 px overflow on every public route and two private ones.
await step('320', async () => {
  out.overflow320 = {}
  // Además de medir, se guarda una captura por ruta a 320 px (tema y versión en el manifiesto).
  const snap = async (pg, area, screen) => {
    await pg.evaluate(() => document.fonts.ready); await pg.waitForTimeout(250)
    const file = `${THEME}-w320-${screen}.png`
    const png = await pg.screenshot({ path: OUT + 'shots/' + file, fullPage: true, animations: 'disabled' })
    out.manifest.push({ file, route: new URL(pg.url()).pathname, version, resolution: '320x640', area, screen, theme: THEME, date: new Date().toISOString(), sha256: createHash('sha256').update(png).digest('hex'), environment: 'local-fixture' })
  }
  const page = await open([320, 640])
  for (const [route, area, screen] of [['/portal', 'Portal', '01-portal'], ['/cliente', 'Ingreso', '02-seleccion'], ['/portal#seguimiento', 'Portal', '05-seguimiento-portal']]) { await page.goto(base + route); if (route.endsWith('#seguimiento')) { await page.fill('#tracking-number', 'REQ26-9201'); await page.locator('#seguimiento form button[type=submit]').click(); await page.getByTestId('public-tracking-result').waitFor() } await page.waitForTimeout(600); out.overflow320[route] = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth); await snap(page, area, screen) }
  await clientLogin(page, 'quipu'); out.overflow320['/cliente/nuevo'] = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth); await snap(page, 'Cliente', '20-quipu-nuevo-ticket')
  await page.context().close()
  const s = await open([320, 640]); await staff(s); out.overflow320['/ (dashboard)'] = await s.evaluate(() => document.documentElement.scrollWidth - innerWidth); await snap(s, 'Panel', '30-dashboard')
  await s.getByRole('button', { name: /^Boards/ }).click(); await s.locator('.board-column').first().waitFor(); out.overflow320['/ (kanban)'] = await s.evaluate(() => document.documentElement.scrollWidth - innerWidth); await snap(s, 'Panel', '33-kanban')
  await s.context().close()
})
// Hover before any click; press scale; reduced motion keeps colour/opacity.
await step('motion', async () => {
  const page = await open('laptop'); await page.goto(base + '/portal', { waitUntil: 'networkidle' })
  const card = page.locator('.portal-option').first()
  const read = () => card.evaluate(el => { const cs = getComputedStyle(el); return { input: document.documentElement.dataset.input ?? null, duration: cs.transitionDuration, property: cs.transitionProperty, transform: cs.transform } })
  await page.mouse.move(5, 5); await card.hover(); await page.waitForTimeout(400)
  const hoverBeforeClick = await read()
  const btn = page.getByRole('button', { name: /Ingreso del personal/ })
  const box = await btn.boundingBox(); await page.mouse.move(box.x + 10, box.y + 10); await page.mouse.down(); await page.waitForTimeout(150)
  const pressed = await btn.evaluate(el => getComputedStyle(el).transform); await page.mouse.up()
  out.motion = { hoverBeforeClick, pressedTransform: pressed }
  await page.context().close()
  const r = await open('laptop', { reducedMotion: 'reduce' }); await r.goto(base + '/portal', { waitUntil: 'networkidle' })
  await r.mouse.move(5, 5); const rc = r.locator('.portal-option').first(); await rc.hover(); await r.waitForTimeout(300)
  out.reducedMotion = await rc.evaluate(el => { const cs = getComputedStyle(el); return { transform: cs.transform, property: cs.transitionProperty, duration: cs.transitionDuration } })
  await r.context().close()
})
// Cold, per-page JavaScript loads (Taste perf.md measures a page load): portal, /cliente/nuevo with a session, /tracking.
await step('perf', async () => {
  out.perf = {}
  const measure = async (label, url, before) => {
    const page = await open('laptop')
    if (before) await before(page)
    const cdp = await page.context().newCDPSession(page); await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
    await page.addInitScript(() => { window.__cls = 0; new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value }).observe({ type: 'layout-shift', buffered: true }) })
    await page.goto(base + url, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500)
    out.perf[label] = await page.evaluate(() => { const res = performance.getEntriesByType('resource')
      const js = res.filter(r => r.name.endsWith('.js')); return { jsKiB: +(js.reduce((s, r) => s + r.decodedBodySize, 0) / 1024).toFixed(1), scripts: js.map(r => r.name.split('/').pop()), cls: +window.__cls.toFixed(4),
        fcpMs: Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0) } })
    await page.context().close()
  }
  await measure('portal', '/portal')
  await measure('tracking', '/tracking')
  await measure('cliente-nuevo (sesión, carga directa)', '/cliente/nuevo', async page => { await clientLogin(page, 'quipu') })
})
out.version = version
writeFileSync(OUT + 'results.json', JSON.stringify(out, null, 1))
writeFileSync(OUT + 'manifest.json', JSON.stringify({ kind: out.kind, version, captures: out.manifest }, null, 1))
console.log(JSON.stringify({ version, screens: out.screens.length, failures: out.failures, external: [...new Set(out.external)], errors: out.errors.slice(0, 5) }))
await browser.close(); await server.close(); await fixture.close()
