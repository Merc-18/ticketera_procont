/** Read-only customer login/list/detail smoke; provider credentials are synthetic and local-only. */
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const base = process.env.QA_VITE_URL ?? 'http://127.0.0.1:5174'
const out = process.env.QA_SCREENSHOTS ?? '.agent-artifacts/qa-integral-20261125/screenshots/customer-e2e'
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE })
const result = { environment: 'QA-FICTICIO local', database: 'PostgREST → PostgreSQL 17', ticketWrites: 0, clientSessionsOpened: 0, providers: {} }
try {
  const health = await (await fetch('http://127.0.0.1:54321/qa/health')).json()
  if (health.production !== false) throw new Error('Gateway is not isolated from production')
  for (const provider of ['quipu', 'quipufac']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-PE' })
    const page = await context.newPage(), errors = []
    page.on('pageerror', e => errors.push(e.message))
    page.on('console', m => { if (m.type() === 'error' && !/WebSocket connection.*realtime\/v1\/websocket/.test(m.text())) errors.push(m.text()) })
    const r = { errors }
    await page.goto(`${base}/cliente`)
    await page.getByRole('button', { name: provider === 'quipu' ? /Quipu.*Ingreso con usuario/ : /QuipuFac.*Ingreso empresarial/ }).click()
    await page.locator('#client-ruc').fill(provider === 'quipu' ? '20999999901' : '20999999902')
    if (provider === 'quipu') await page.locator('#client-username').fill('qaficticio')
    await page.locator('#client-password').fill('clave-simulada')
    await page.getByRole('button', { name: 'Ingresar' }).click()
    await page.waitForURL('**/cliente/nuevo', { timeout: 15000 })
    result.clientSessionsOpened++
    r.login = 'session opened by client-login QA gateway and client_open_session PostgreSQL RPC'
    await page.getByRole('link', { name: /Mis tickets/i }).click()
    await page.waitForURL('**/cliente/tickets', { timeout: 15000 })
    await page.getByRole('heading', { name: 'Mis tickets' }).waitFor({ timeout: 15000 })
    await page.waitForTimeout(350)
    const body = await page.locator('main').innerText()
    r.listVisible = body.includes('QA-FICTICIO')
    r.ticketCountVisible = (await page.locator('main tbody tr').count()) || (await page.locator('main article').count())
    await page.screenshot({ path: `${out}/${provider}-my-tickets.png`, fullPage: true })
    const detail = page.locator('main .ticket-mobile-card').first()
    if (await detail.count()) {
      await detail.click(); await page.waitForURL('**/cliente/tickets/**')
      await page.locator('main').waitFor()
      r.ownDetailOpened = true
      await page.screenshot({ path: `${out}/${provider}-ticket-detail.png`, fullPage: true })
    } else r.ownDetailOpened = false
    r.noBrowserErrors = errors.length === 0
    result.providers[provider] = r
    await context.close()
  }
} catch (e) {
  result.error = e instanceof Error ? e.message : String(e)
} finally {
  writeFileSync(`${out}/result.json`, JSON.stringify(result, null, 2) + '\n')
  await browser.close()
}
console.log(JSON.stringify(result, null, 2))
if (result.error || Object.values(result.providers).some(p => p.errors?.length || !p.login || !p.listVisible || !p.ownDetailOpened)) process.exitCode = 1
