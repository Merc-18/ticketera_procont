// Galería QA integral 25/11/2026: cuatro áreas, Light/Dark, resoluciones principales. Cada captura lleva una banda
// visible (módulo · pantalla · tema · ancho · datos · versión) y una fila en el manifiesto con SHA-256.
// Uso: node tests/ui/capture-qa-integral.mjs --stage antes|despues --out <carpeta> [--only internal] [--widths 1440,390]
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { createServer as createViteServer } from 'vite'
import { chromium } from 'playwright-core'
import { startFixtureServer, SIMULATED_PASSWORD } from './fixture-server.mjs'
import { installVisualFixtures } from './ux-fixtures.mjs'
import { installQaFixtures } from './qa-fixtures.mjs'
import { MOCK_RUC, MOCK_PASSWORD } from '../../src/dev/client-portal-mock.ts'

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d }
const STAGE = arg('stage', 'despues'), OUT = arg('out'), ONLY = arg('only', 'all')
const WIDTHS = arg('widths', '1920,1440,768,390,360,320').split(',').map(Number)
const HEIGHT = { 1920: 1080, 1440: 900, 768: 1024, 390: 844, 360: 800, 320: 700 }
const ROOT = fileURLToPath(new URL('../..', import.meta.url))
mkdirSync(OUT, { recursive: true })
const mf = `${OUT}/../screenshots-manifest.json`
const manifest = existsSync(mf) ? JSON.parse(readFileSync(mf, 'utf8')) : { contract: '.agent-artifacts/qa-integral-20261125/shared/QA_FIXTURE_CONTRACT.md', captures: [] }
manifest.captures = manifest.captures.filter(c => c.stage !== STAGE)
const fixture = await startFixtureServer()
Object.assign(process.env, { VITE_SUPABASE_URL: fixture.url, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_simulada_solo_pruebas', VITE_CLIENT_PORTAL_MOCK: '0', VITE_CLIENT_LOGIN_ENABLED: '1' })
const vite = await createViteServer({ root: ROOT, logLevel: 'error', server: { host: '127.0.0.1', port: 0, hmr: false } })
await vite.listen()
const base = `http://127.0.0.1:${vite.httpServer.address().port}`
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || undefined })
const DATA_INTERNAL = 'QA-FICTICIO contrato (tests/ui/qa-dataset.json, REST simulado)'
const DATA_CLIENT = 'fixture-server.mjs + client-portal-mock (simulado, sin datos reales)'

async function open(theme, width, internal) {
  const context = await browser.newContext({ viewport: { width, height: HEIGHT[width] ?? 900 }, locale: 'es-PE' })
  await context.route('**/*', r => { const u = new URL(r.request().url()); return ['127.0.0.1', 'localhost'].includes(u.hostname) || ['data:', 'blob:'].includes(u.protocol) ? r.continue() : r.abort() })
  await context.addInitScript(t => { try { localStorage.setItem('ticketera-theme', t) } catch {} }, theme)
  const page = await context.newPage()
  await installVisualFixtures(page, fixture.url)
  if (internal) await installQaFixtures(page, fixture.url)
  page.meta = { theme, width }
  await page.goto(base + '/portal')
  return page
}
async function staff(page) {
  await page.getByRole('button', { name: /Acceso del equipo de TI/ }).click()
  await page.fill('#staff-modal-email', 'superadmin@simulado.invalid')
  await page.fill('#staff-modal-password', SIMULATED_PASSWORD)
  await page.getByRole('button', { name: 'Ingresar al sistema' }).click()
  await page.locator('nav[aria-label="Secciones"]').waitFor()
  await page.locator('.stat-card').first().waitFor(); await page.waitForTimeout(500)
}
const nav = (page, name) => page.locator('nav[aria-label="Secciones"]').getByRole('button', { name: new RegExp(`^${name}`) })

async function shot(page, area, screen, data, { target, full = true } = {}) {
  await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(200)
  const version = (await page.getByTestId('build-version').innerText().catch(() => '')).trim()
  const label = `QA-FICTICIO · ${area} · ${screen} · ${page.meta.theme === 'dark' ? 'Dark' : 'Light'} · ${page.meta.width}px · ${version || 'Versión no visible'}`
  await page.evaluate(text => {
    let el = document.getElementById('qa-evidence-band')
    if (!el) { el = document.createElement('div'); el.id = 'qa-evidence-band'; el.setAttribute('aria-hidden', 'true'); document.body.prepend(el) }
    el.textContent = text
    el.style.cssText = 'background:#b91c1c;color:#fff;font:12px/1.4 monospace;padding:4px 8px;text-align:center;word-break:break-word'
  }, label)
  const file = `${STAGE}-${area.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${screen.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-')}-${page.meta.theme}-${page.meta.width}.png`
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  // Las capturas de un elemento (modal, columna) no incluyen la banda; su identificación queda en nombre y manifiesto.
  const buffer = target ? await target.screenshot({ animations: 'disabled' }) : await page.screenshot({ fullPage: full, animations: 'disabled' })
  writeFileSync(`${OUT}/${file}`, buffer)
  manifest.captures.push({ stage: STAGE, file, area, screen, theme: page.meta.theme, width: page.meta.width, data, version, horizontalOverflowPx: Math.max(0, overflow), sha256: createHash('sha256').update(buffer).digest('hex') })
  console.log('captura', file)
}
const tryStep = async (name, fn) => { try { await fn() } catch (e) { console.warn('omitida', name, e.message.split('\n')[0]); manifest.captures.push({ stage: STAGE, skipped: name, reason: e.message.split('\n')[0] }) } }

for (const theme of ['light', 'dark']) {
  for (const width of WIDTHS) {
    const primary = [1440, 390].includes(width)
    if (ONLY === 'all') {
      // A · Portal y B · Ingreso
      const page = await open(theme, width, false)
      await shot(page, 'A Portal', 'Inicio dos tarjetas', DATA_CLIENT)
      await tryStep('seguimiento', async () => {
        await page.locator('#tracking-number').fill('REQ26-9201')
        await page.locator('#seguimiento form button[type=submit]').click(); await page.getByText('Trabajo en proceso').first().waitFor()
        await shot(page, 'A Portal', 'Seguimiento integrado', DATA_CLIENT)
      })
      if (primary) {
        await page.getByRole('button', { name: /Acceso del equipo de TI/ }).click()
        await page.getByRole('button', { name: 'Ingresar al sistema' }).click()
        await shot(page, 'B Ingreso', 'Equipo TI validacion', DATA_CLIENT)
        await page.keyboard.press('Escape')
        await page.getByRole('button', { name: /Nueva Solicitud/ }).click()
        for (const [provider, rx] of [['Quipu', /Ingreso con usuario/], ['QuipuFac', /Ingreso empresarial/]]) {
          await page.getByRole('button', { name: rx }).click()
          await page.locator('form[aria-label^="Ingreso con"] button[type=submit]').click()
          await shot(page, 'B Ingreso', `${provider} validacion`, DATA_CLIENT)
          await page.getByRole('button', { name: /Cambiar tipo/ }).click()
        }
        // C · Espacio del cliente
        await page.goto(base + '/cliente')
        await page.getByRole('button', { name: /Ingreso con usuario/ }).click()
        await page.fill('#client-ruc', MOCK_RUC); await page.fill('#client-username', 'ana'); await page.fill('#client-password', MOCK_PASSWORD)
        await page.locator('form[aria-label^="Ingreso con"] button[type=submit]').click()
        await page.waitForURL('**/cliente/nuevo'); await page.locator('#ticket-product').waitFor()
        await page.locator('input[type=file]').setInputFiles([{ name: 'qa-ficticio-captura.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGOQs+oiCTGMahjVMHw1AAC7R+IB7fUXEAAAAABJRU5ErkJggg==', 'base64') }, { name: 'qa-ficticio-documento.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 QA-FICTICIO') }])
        await page.waitForTimeout(400)
        await shot(page, 'C Cliente', 'Nuevo ticket con adjuntos', DATA_CLIENT)
        await page.getByRole('link', { name: /Mis tickets/ }).click()
        await page.locator('main a:visible', { hasText: 'REQ26-9001' }).first().waitFor()
        await shot(page, 'C Cliente', 'Mis tickets', DATA_CLIENT)
        await page.locator('main a:visible', { hasText: 'REQ26-9001' }).first().click()
        await page.getByText('Descripción', { exact: true }).waitFor()
        await shot(page, 'C Cliente', 'Detalle y seguimiento', DATA_CLIENT)
      }
      await page.context().close()
    }
    // D · Panel interno con el dataset del contrato
    const page = await open(theme, width, true)
    await staff(page)
    await shot(page, 'D Panel', 'Dashboard', DATA_INTERNAL)
    await nav(page, 'Equipo').click(); await page.waitForTimeout(500)
    for (const tab of ['Usuarios', 'Carga de trabajo', 'Portafolios y proyectos']) {
      await page.getByRole('tab', { name: tab }).click(); await page.waitForTimeout(500)
      if (tab === 'Portafolios y proyectos') await page.getByRole('button', { name: /Beneficiarios finales/ }).click().catch(() => {})
      await shot(page, 'D Panel', `Equipo ${tab}`, DATA_INTERNAL)
    }
    await nav(page, 'Boards').click(); await page.locator('.project-card').first().waitFor(); await page.waitForTimeout(400)
    await shot(page, 'D Panel', 'Kanban', DATA_INTERNAL, { full: false })
    if (primary) await shot(page, 'D Panel', 'Kanban columna Analysis', DATA_INTERNAL, { target: page.locator('.board-column').nth(1) })
    for (const view of ['Tabla', 'Gantt', 'Roadmap']) {
      await page.getByRole('button', { name: new RegExp(view) }).click(); await page.waitForTimeout(500)
      await shot(page, 'D Panel', view, DATA_INTERNAL)
    }
    await page.getByRole('button', { name: /Kanban/ }).click(); await page.waitForTimeout(300)
    if (primary) {
      for (const [title, screen] of [['QA-FICTICIO Quipu consulta de beneficiarios', 'Detalle checklist vacio'], ['QA-FICTICIO TI tablero de beneficiarios', 'Detalle checklist 2 de 4']]) {
        await tryStep(screen, async () => {
          await page.locator('.project-card').filter({ hasText: title }).first().click()
          const d = page.getByRole('dialog', { name: 'Detalle del ticket' }); await d.waitFor(); await page.waitForTimeout(400)
          await shot(page, 'D Panel', `${screen} progreso`, DATA_INTERNAL, { target: d })
          await d.getByRole('tab', { name: /Checklist/ }).click(); await page.waitForTimeout(500)
          await shot(page, 'D Panel', screen, DATA_INTERNAL, { target: d })
          await page.keyboard.press('Escape'); await page.waitForTimeout(300)
        })
      }
      await tryStep('nuevo ticket', async () => {
        await page.getByRole('button', { name: /Nuevo ticket/ }).click()
        const d = page.getByRole('dialog', { name: 'Nuevo ticket' }); await d.waitFor()
        await shot(page, 'D Panel', 'Nuevo ticket cliente', DATA_INTERNAL, { target: d })
        await d.getByText('Interno u operativo').click()
        await d.locator('#nt-portfolio').selectOption({ label: 'Gestión' }); await d.locator('#nt-project').selectOption({ label: 'Beneficiarios finales' })
        await shot(page, 'D Panel', 'Nuevo ticket interno', DATA_INTERNAL, { target: d })
        await page.keyboard.press('Escape'); await page.waitForTimeout(300)
      })
      await tryStep('confirmacion', async () => {
        await nav(page, 'Requests').click(); await page.locator('.request-card').first().waitFor()
        await shot(page, 'D Panel', 'Requests', DATA_INTERNAL)
        await page.locator('.request-card').filter({ hasText: 'QA-FICTICIO Quipu recibida sin revisar' }).getByRole('button', { name: /Aprobar/ }).click()
        const d = page.getByRole('dialog'); await d.locator('#validation-code').waitFor()
        await d.locator('#validation-code').selectOption({ label: 'ARAPA' })
        await d.locator('#validation-portfolio').selectOption({ label: 'Gestión' })
        await d.locator('#validation-project').selectOption({ label: 'Beneficiarios finales' })
        await d.locator('#validation-portfolio').scrollIntoViewIfNeeded(); await page.waitForTimeout(200)
        await shot(page, 'D Panel', 'Confirmacion portafolio', DATA_INTERNAL, { target: d.locator('.modal-panel, [class*=modal]').first().or(d) })
      })
    }
    await page.context().close()
  }
}
writeFileSync(mf, JSON.stringify(manifest, null, 2) + '\n')
await browser.close(); await vite.close(); await fixture.close()
