// Capturas Antes/Después: barra de Boards, «Mi color», Dashboard y checklist (24/11/2026).
// Uso: node tests/ui/capture-boards-dashboard.mjs --stage antes|despues --out <carpeta>. DATOS FICTICIOS, solo 127.0.0.1.
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { createServer as createViteServer } from 'vite'
import { chromium } from 'playwright-core'
import { startFixtureServer, SIMULATED_PASSWORD } from './fixture-server.mjs'
import { installVisualFixtures } from './ux-fixtures.mjs'
import { installKanbanFixtures, kanbanProjects, OWNER_FIXTURE } from './kanban-attachments-fixtures.mjs'
import { createBoardState, installBoardFixtures } from './boards-dashboard-fixtures.mjs'

const arg = n => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : null }
const STAGE = arg('stage') ?? 'despues', OUT = arg('out')
const ROOT = fileURLToPath(new URL('../..', import.meta.url))
mkdirSync(OUT, { recursive: true })
const mf = `${OUT}/../screenshots-manifest.json`
const manifest = existsSync(mf) ? JSON.parse(readFileSync(mf, 'utf8')) : { captures: [] }
manifest.captures = manifest.captures.filter(c => c.stage !== STAGE || c.view?.startsWith('test:'))

const fixture = await startFixtureServer()
const settings = { VITE_SUPABASE_URL: fixture.url, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_simulada_solo_pruebas', VITE_CLIENT_PORTAL_MOCK: '0', VITE_CLIENT_LOGIN_ENABLED: '1' }
Object.assign(process.env, settings)
const vite = await createViteServer({ root: ROOT, logLevel: 'error', server: { host: '127.0.0.1', port: 0, hmr: false } })
await vite.listen()
const base = `http://127.0.0.1:${vite.httpServer.address().port}`
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || undefined })
const PROCONT = '00000000-0000-4000-8000-000000000177', OTHER = '00000000-0000-4000-8000-0000000000b1'
const recent = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10)
const requests = [...Array.from({ length: 23 }, (_, i) => ({ id: `r-a-${String(i).padStart(4, '0')}`, studio_id: PROCONT, created_at: `${recent}T15:00:00Z` })),
  ...Array.from({ length: 9 }, (_, i) => ({ id: `r-b-${String(i).padStart(4, '0')}`, studio_id: OTHER, created_at: `${recent}T15:00:00Z` })),
  { id: 'r-c-0001', studio_id: null, created_at: `${recent}T15:00:00Z` }, { id: 'r-c-0002', studio_id: null, created_at: `${recent}T15:00:00Z` }]

async function open(theme, viewport, section = 'Boards') {
  const context = await browser.newContext({ viewport, locale: 'es-PE' })
  await context.route('**/*', r => { const u = new URL(r.request().url()); return ['127.0.0.1', 'localhost'].includes(u.hostname) || ['data:', 'blob:'].includes(u.protocol) ? r.continue() : r.abort() })
  await context.addInitScript(t => { try { localStorage.setItem('ticketera-theme', t) } catch {} }, theme)
  const page = await context.newPage()
  await installVisualFixtures(page, fixture.url)
  await installKanbanFixtures(page, fixture.url)
  await installBoardFixtures(page, fixture.url, createBoardState(), { requests })
  await page.route(`${fixture.url}/rest/v1/rpc/internal_card_colors`, r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ user_id: null, assignments: OWNER_FIXTURE, colors: [] }) }))
  await page.goto(base + '/portal')
  await page.getByRole('button', { name: /Acceso del equipo de TI/ }).click()
  await page.fill('#staff-modal-email', 'superadmin@simulado.invalid')
  await page.fill('#staff-modal-password', SIMULATED_PASSWORD)
  await page.getByRole('button', { name: 'Ingresar al sistema' }).click()
  await page.locator('nav[aria-label="Secciones"]').waitFor()
  if (section === 'Boards') { await page.getByRole('button', { name: /^Boards/ }).click(); await page.locator('.project-card').first().waitFor() }
  await page.waitForTimeout(400)
  return page
}
async function shot(target, file, meta, opts = {}) {
  const page = target.page ? target.page() : target
  const png = await target.screenshot({ path: `${OUT}/${file}`, animations: 'disabled', ...opts })
  manifest.captures.push({ stage: STAGE, file, ...meta, viewport: page.viewportSize(), sha256: createHash('sha256').update(png).digest('hex') })
  console.log('captura', file)
}

for (const theme of ['light', 'dark']) {
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1440, height: 900 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 360, height: 780 }, { width: 320, height: 700 }]) {
    const page = await open(theme, viewport)
    await shot(page.locator('.board-toolbar'), `${STAGE}-barra-boards-${theme}-${viewport.width}.png`, { theme, view: 'boards-toolbar' })
    if (viewport.width === 1440) {
      await shot(page, `${STAGE}-boards-${theme}-1440.png`, { theme, view: 'boards-page' })
      await page.getByRole('button', { name: 'Mi color de tarjeta' }).click()
      await page.getByRole('dialog', { name: 'Mi color de tarjeta' }).waitFor()
      await shot(page.getByRole('dialog', { name: 'Mi color de tarjeta' }), `${STAGE}-mi-color-${theme}.png`, { theme, view: 'owner-picker' })
      await page.keyboard.press('Escape')
      await page.locator('.project-card').filter({ hasText: kanbanProjects[3].title }).click()
      await page.getByRole('dialog').getByRole('tab', { name: /Checklist/ }).click()
      await page.waitForTimeout(500)
      await shot(page.getByRole('dialog'), `${STAGE}-checklist-analysis-${theme}.png`, { theme, view: 'checklist' })
    }
    await page.context().close()
  }
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const page = await open(theme, viewport, 'Dashboard')
    await page.getByRole('heading', { name: 'Carga del equipo' }).waitFor()
    await page.waitForTimeout(500)
    const block = page.locator('section.studio-tickets, section.metric-chart:has(h2:text-matches("Áreas"))').first()
    await block.scrollIntoViewIfNeeded()
    await shot(block, `${STAGE}-dashboard-bloque-${theme}-${viewport.width}.png`, { theme, view: 'dashboard-block' })
    if (viewport.width === 1440) await shot(page, `${STAGE}-dashboard-${theme}-1440-completo.png`, { theme, view: 'dashboard-page' }, { fullPage: true })
    await page.context().close()
  }
}
writeFileSync(mf, JSON.stringify(manifest, null, 2) + '\n')
await browser.close(); await vite.close(); await fixture.close()
