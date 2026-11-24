// Capturas Antes/Después con el conjunto QA-FICTICIO (24/11/2026). Solo navega y fotografía; sirve para ambas versiones.
// Uso: node tests/ui/capture-qa.mjs --stage antes|despues --out <carpeta>
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { createServer as createViteServer } from 'vite'
import { chromium } from 'playwright-core'
import { startFixtureServer, SIMULATED_PASSWORD } from './fixture-server.mjs'
import { installVisualFixtures } from './ux-fixtures.mjs'
import { installQaFixtures, qaProject } from './qa-fixtures.mjs'

const arg = n => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : null }
const STAGE = arg('stage') ?? 'despues', OUT = arg('out')
const ROOT = fileURLToPath(new URL('../..', import.meta.url))
mkdirSync(OUT, { recursive: true })
const mf = `${OUT}/../screenshots-manifest.json`
const manifest = existsSync(mf) ? JSON.parse(readFileSync(mf, 'utf8')) : { captures: [] }
manifest.captures = manifest.captures.filter(c => c.stage !== STAGE)
manifest.buildVersion = null
const fixture = await startFixtureServer()
const settings = { VITE_SUPABASE_URL: fixture.url, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_simulada_solo_pruebas', VITE_CLIENT_PORTAL_MOCK: '0', VITE_CLIENT_LOGIN_ENABLED: '1' }
Object.assign(process.env, settings)
const vite = await createViteServer({ root: ROOT, logLevel: 'error', server: { host: '127.0.0.1', port: 0, hmr: false } })
await vite.listen()
const base = `http://127.0.0.1:${vite.httpServer.address().port}`
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || undefined })

async function open(theme, viewport) {
  const context = await browser.newContext({ viewport, locale: 'es-PE' })
  await context.route('**/*', r => { const u = new URL(r.request().url()); return ['127.0.0.1', 'localhost'].includes(u.hostname) || ['data:', 'blob:'].includes(u.protocol) ? r.continue() : r.abort() })
  await context.addInitScript(t => { try { localStorage.setItem('ticketera-theme', t) } catch {} }, theme)
  const page = await context.newPage()
  await installVisualFixtures(page, fixture.url)
  await installQaFixtures(page, fixture.url)
  await page.goto(base + '/portal')
  await page.getByRole('button', { name: /Acceso del equipo de TI/ }).click()
  await page.fill('#staff-modal-email', 'superadmin@simulado.invalid')
  await page.fill('#staff-modal-password', SIMULATED_PASSWORD)
  await page.getByRole('button', { name: 'Ingresar al sistema' }).click()
  await page.locator('nav[aria-label="Secciones"]').waitFor()
  await page.waitForTimeout(600)
  return page
}
async function shot(target, file, meta, opts = {}) {
  const page = target.page ? target.page() : target
  const version = (await page.getByTestId('build-version').innerText()).trim()
  if (!/^Versión \d{12}$/.test(version)) throw new Error(`Versión de build no válida en ${file}: ${version}`)
  if (manifest.buildVersion === null) manifest.buildVersion = version
  if (version !== manifest.buildVersion) throw new Error(`La galería mezcla versiones: ${version} != ${manifest.buildVersion}`)
  const png = await target.screenshot({ path: `${OUT}/${file}`, animations: 'disabled', ...opts })
  manifest.captures.push({ stage: STAGE, file, ...meta, version, viewport: page.viewportSize(), sha256: createHash('sha256').update(png).digest('hex') })
  console.log('captura', file)
}
const tryShot = async (fn) => { try { await fn() } catch (err) { console.warn('omitida:', err.message.split('\n')[0]) } }

for (const theme of ['light', 'dark']) {
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1440, height: 900 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 360, height: 780 }, { width: 320, height: 700 }]) {
    const w = viewport.width, main = [1440].includes(w)
    const page = await open(theme, viewport)
    await page.locator('.stat-card').first().waitFor()
    await page.waitForTimeout(400)
    await shot(page, `${STAGE}-dashboard-${theme}-${w}.png`, { theme, view: 'dashboard' }, { fullPage: main })
    if (main) {
      await page.getByRole('button', { name: /Exportar/ }).click()
      await shot(page.getByRole('menu', { name: 'Exportar' }), `${STAGE}-dashboard-exportar-${theme}.png`, { theme, view: 'dashboard-export' })
      await page.keyboard.press('Escape')
    }
    await page.getByRole('button', { name: /^Boards/ }).click()
    await page.locator('.project-card').first().waitFor(); await page.waitForTimeout(400)
    await shot(page, `${STAGE}-kanban-${theme}-${w}.png`, { theme, view: 'kanban' })
    await page.getByRole('button', { name: /Gantt/ }).click()
    await page.locator('[aria-label="Cronograma Gantt, desplazamiento horizontal"]').waitFor()
    await shot(page, `${STAGE}-gantt-${theme}-${w}.png`, { theme, view: 'gantt' }, { fullPage: main })
    await page.getByRole('button', { name: /Roadmap/ }).click()
    await page.locator('.roadmap-quarter').first().waitFor()
    await shot(page, `${STAGE}-roadmap-${theme}-${w}.png`, { theme, view: 'roadmap' }, { fullPage: main })
    await page.getByRole('button', { name: /Kanban/ }).click()
    await page.getByRole('button', { name: /Nuevo ticket/ }).click()
    const newTicket = page.getByRole('dialog', { name: 'Nuevo ticket' })
    await newTicket.waitFor()
    await shot(newTicket, `${STAGE}-nuevo-ticket-${theme}-${w}.png`, { theme, view: 'new-ticket' })
    await page.keyboard.press('Escape')
    if (main) {
      await shot(page.locator('.board-column').nth(1), `${STAGE}-columna-analysis-${theme}.png`, { theme, view: 'column' })
      await page.locator('.project-card').filter({ hasText: qaProject('Histórico con checklist previo').title }).click()
      await page.getByRole('dialog').waitFor(); await page.waitForTimeout(500)
      await shot(page.getByRole('dialog'), `${STAGE}-detalle-progreso-${theme}.png`, { theme, view: 'detail-progress' })
      await tryShot(async () => {
        await page.getByRole('dialog').getByRole('tab', { name: /Checklist/ }).click(); await page.waitForTimeout(400)
        await shot(page.getByRole('dialog'), `${STAGE}-detalle-checklist-historico-${theme}.png`, { theme, view: 'detail-checklist' })
      })
      await page.keyboard.press('Escape'); await page.waitForTimeout(300)
      await tryShot(async () => {
        await page.locator('.project-card').filter({ hasText: qaProject('Quipu consulta de beneficiarios').title }).click()
        await page.getByRole('dialog').waitFor(); await page.waitForTimeout(500)
        await shot(page.getByRole('dialog'), `${STAGE}-detalle-sin-tareas-${theme}.png`, { theme, view: 'detail-empty' })
        await page.keyboard.press('Escape'); await page.waitForTimeout(300)
      })
      await page.getByRole('button', { name: /Tabla/ }).click(); await page.locator('.data-view table').waitFor(); await page.waitForTimeout(300)
      await shot(page, `${STAGE}-tabla-${theme}.png`, { theme, view: 'table' })
      await page.getByRole('button', { name: /Kanban/ }).click()
      await page.getByRole('button', { name: /^Requests/ }).click(); await page.waitForTimeout(600)
      await tryShot(async () => {
        await page.locator('.request-card').filter({ hasText: 'QA-FICTICIO Quipu recibida sin revisar' }).getByRole('button', { name: /Aprobar/ }).click()
        await page.getByRole('dialog').waitFor(); await page.waitForTimeout(500)
        await shot(page.getByRole('dialog'), `${STAGE}-confirmar-solicitud-${theme}.png`, { theme, view: 'approve' })
        await page.keyboard.press('Escape'); await page.waitForTimeout(300)
      })
      await tryShot(async () => {
        await page.getByRole('button', { name: /^Equipo/ }).click(); await page.waitForTimeout(600)
        await shot(page, `${STAGE}-equipo-${theme}.png`, { theme, view: 'team' }, { fullPage: true })
        const tabs = await page.getByRole('tab').allInnerTexts().catch(() => [])
        if (tabs.some(x => x.includes('Usuarios'))) {
          await page.getByRole('tab', { name: 'Usuarios' }).click(); await page.waitForTimeout(500)
          await shot(page, `${STAGE}-equipo-usuarios-${theme}.png`, { theme, view: 'team-users' }, { fullPage: true })
        }
        for (const t of ['Carga de trabajo', 'Portafolios y proyectos']) {
          if (!tabs.some(x => x.includes(t))) continue
          await page.getByRole('tab', { name: t }).click(); await page.waitForTimeout(600)
          await shot(page, `${STAGE}-equipo-${t.includes('Carga') ? 'carga' : 'portafolios'}-${theme}.png`, { theme, view: 'team' }, { fullPage: true })
        }
      })
    }
    await page.context().close()
  }
}
writeFileSync(mf, JSON.stringify(manifest, null, 2) + '\n')
await browser.close(); await vite.close(); await fixture.close()
