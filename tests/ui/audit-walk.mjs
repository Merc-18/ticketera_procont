// Recorrido exploratorio de auditoría (25/11/2026). Navegador real + React real + datos QA-FICTICIO locales.
// Uso: node tests/ui/audit-walk.mjs --out <carpeta> [--theme light|dark] [--width 1440]
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createServer as createViteServer } from 'vite'
import { chromium } from 'playwright-core'
import { startFixtureServer, SIMULATED_PASSWORD } from './fixture-server.mjs'
import { installVisualFixtures } from './ux-fixtures.mjs'
import { installQaFixtures } from './qa-fixtures.mjs'

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d }
const OUT = arg('out'), THEME = arg('theme', 'light'), W = Number(arg('width', 1440)), H = Number(arg('height', 900))
const ROOT = fileURLToPath(new URL('../..', import.meta.url))
mkdirSync(OUT, { recursive: true })
const fixture = await startFixtureServer()
Object.assign(process.env, { VITE_SUPABASE_URL: fixture.url, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_simulada_solo_pruebas', VITE_CLIENT_PORTAL_MOCK: '0', VITE_CLIENT_LOGIN_ENABLED: '1' })
const vite = await createViteServer({ root: ROOT, logLevel: 'error', server: { host: '127.0.0.1', port: 0, hmr: false } })
await vite.listen()
const base = `http://127.0.0.1:${vite.httpServer.address().port}`
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || undefined })
const context = await browser.newContext({ viewport: { width: W, height: H }, locale: 'es-PE' })
await context.route('**/*', r => { const u = new URL(r.request().url()); return ['127.0.0.1', 'localhost'].includes(u.hostname) || ['data:', 'blob:'].includes(u.protocol) ? r.continue() : r.abort() })
await context.addInitScript(t => { try { localStorage.setItem('ticketera-theme', t) } catch {} }, THEME)
const page = await context.newPage()
const findings = []
page.on('pageerror', e => findings.push({ type: 'pageerror', msg: e.message }))
page.on('console', m => { if (m.type() === 'error') findings.push({ type: 'console', msg: m.text().slice(0, 300) }) })
await installVisualFixtures(page, fixture.url)
const qa = await installQaFixtures(page, fixture.url)
const overflow = async name => {
  const o = await page.evaluate(() => ({ w: innerWidth, sw: document.documentElement.scrollWidth,
    wide: [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1 && getComputedStyle(e).visibility !== 'hidden')
      .filter(e => !e.closest('.kanban-scroll,.table-scroll,.overflow-x-auto,[class*="scroll"]')).slice(0, 5).map(e => `${e.tagName}.${typeof e.className === 'string' ? e.className.slice(0, 60) : ''}`) }))
  if (o.sw > o.w + 1 || o.wide.length) findings.push({ type: 'overflow', name, ...o })
}
let n = 0
const shot = async (name, target = page, full = true) => { await page.waitForTimeout(250); await overflow(name); await target.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png`, animations: 'disabled', ...(target === page ? { fullPage: full } : {}) }); console.log('shot', name) }
const step = async (name, fn) => { try { await fn() } catch (e) { findings.push({ type: 'step-failed', name, msg: e.message.split('\n')[0] }); console.warn('FALLO', name, e.message.split('\n')[0]) } }

await page.goto(base + '/portal')
await step('portal', () => shot('portal'))
await step('login-ti', async () => {
  await page.getByRole('button', { name: /Acceso del equipo de TI/ }).click()
  await page.fill('#staff-modal-email', 'superadmin@simulado.invalid')
  await page.fill('#staff-modal-password', SIMULATED_PASSWORD)
  await page.getByRole('button', { name: 'Ingresar al sistema' }).click()
  await page.locator('nav[aria-label="Secciones"]').waitFor()
  await page.locator('.stat-card').first().waitFor(); await page.waitForTimeout(800)
})
await step('dashboard', () => shot('dashboard'))
await step('dashboard-export', async () => { await page.getByRole('button', { name: /Exportar/ }).click(); await shot('dashboard-exportar', page, false); await page.keyboard.press('Escape') })
await step('equipo', async () => {
  await page.locator('.dashboard-team-entry').click(); await page.waitForTimeout(800); await shot('equipo-entrada')
  for (const t of ['Usuarios', 'Carga de trabajo', 'Portafolios y proyectos']) {
    await page.getByRole('tab', { name: t }).click(); await page.waitForTimeout(800); await shot(`equipo-${t.split(' ')[0].toLowerCase()}`)
  }
  await page.getByRole('button', { name: /expand|Ver tickets|Beneficiarios finales/ }).first().click().catch(() => {})
  await page.waitForTimeout(300); await shot('equipo-portafolios-expandido')
})
await step('boards', async () => { await page.getByRole('button', { name: /^Boards/ }).click(); await page.locator('.project-card').first().waitFor(); await shot('kanban', page, false) })
await step('kanban-card', async () => { await shot('kanban-columna-analysis', page.locator('.board-column').nth(1)) })
await step('tabla', async () => { await page.getByRole('button', { name: /Tabla/ }).click(); await page.waitForTimeout(400); await shot('tabla') })
await step('gantt', async () => { await page.getByRole('button', { name: /Gantt/ }).click(); await page.waitForTimeout(400); await shot('gantt') })
await step('roadmap', async () => { await page.getByRole('button', { name: /Roadmap/ }).click(); await page.waitForTimeout(400); await shot('roadmap') })
await step('detalle', async () => {
  await page.getByRole('button', { name: /Kanban/ }).click(); await page.waitForTimeout(300)
  for (const [t, key] of [['QA-FICTICIO Quipu consulta de beneficiarios', 'beneficiarios'], ['QA-FICTICIO Histórico con checklist previo', 'historico']]) {
    const card = page.locator('.project-card').filter({ hasText: t }).first()
    if (!(await card.count())) { findings.push({ type: 'missing-card', t }); continue }
    await card.click(); const d = page.getByRole('dialog'); await d.waitFor(); await page.waitForTimeout(500)
    await shot(`detalle-${key}`, d)
    const tab = d.getByRole('tab', { name: /Checklist/ })
    if (await tab.count()) { await tab.click(); await page.waitForTimeout(400); await shot(`detalle-${key}-checklist`, d) }
    await page.keyboard.press('Escape'); await page.waitForTimeout(300)
  }
})
await step('nuevo-ticket', async () => {
  await page.getByRole('button', { name: /Nuevo ticket/ }).click(); const d = page.getByRole('dialog', { name: 'Nuevo ticket' }); await d.waitFor(); await shot('nuevo-ticket', d)
  const modes = d.getByRole('radio'); const c = await modes.count()
  for (let i = 0; i < c; i++) { await modes.nth(i).check().catch(() => modes.nth(i).click()); await page.waitForTimeout(300); await shot(`nuevo-ticket-modo-${i}`, d) }
  await page.keyboard.press('Escape')
})
await step('confirmacion', async () => {
  await page.getByRole('button', { name: /^Requests/ }).click(); await page.waitForTimeout(800); await shot('requests')
  const card = page.locator('.request-card, article, li').filter({ hasText: 'QA-FICTICIO' }).filter({ has: page.getByRole('button', { name: /Aprobar|Validar|Revisar/ }) }).first()
  await card.getByRole('button', { name: /Aprobar|Validar|Revisar/ }).first().click()
  const d = page.getByRole('dialog'); await d.waitFor(); await page.waitForTimeout(400); await shot('confirmacion', d)
})
writeFileSync(`${OUT}/findings.json`, JSON.stringify({ theme: THEME, width: W, findings, rpc: qa.log.map(l => l.name) }, null, 2))
console.log(JSON.stringify(findings, null, 1))
await browser.close(); await vite.close(); await fixture.close()
