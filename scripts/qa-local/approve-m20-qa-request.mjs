/** One-shot local-only E2E: approve one already-seeded QA request via UI → M20/PostgreSQL. */
import { chromium } from 'playwright-core'
import { readFileSync } from 'node:fs'

const base = process.env.QA_VITE_URL ?? 'http://127.0.0.1:5174'
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()
const fixture = JSON.parse(readFileSync('tests/ui/qa-dataset.json', 'utf8'))
const portfolio = fixture.portfolios.find(p => p.name === 'Gestión' && p.is_active)
const initiative = fixture.portfolio_initiatives.find(p => p.name === 'Beneficiarios finales' && p.portfolio_id === portfolio?.id && p.is_active)
const code = fixture.studio_codes.find(c => c.code === 'PROCONT' && c.is_active)
const area = fixture.areas.find(a => a.code === 'QAC' && a.studio_id === code?.studio_id && a.is_active && !a.parent_id)
let result = { environment: 'QA-FICTICIO local', database: 'PostgreSQL 17 through PostgREST', ticketTitle: 'QA-FICTICIO Quipu recibida sin revisar', ticketWrites: 0 }
try {
  if (!portfolio || !initiative || !code || !area) throw new Error('Snapshot QA lacks the confirmed portfolio/project or PROCONT/area fixture; refusing to guess UUIDs')
  const health = await (await fetch('http://127.0.0.1:54321/qa/health')).json()
  if (health.production !== false || health.environment !== 'QA-FICTICIO') throw new Error('Refusing to write outside local QA')
  await page.goto(`${base}/login`)
  await page.locator('#email').fill('superadmin@simulado.invalid')
  await page.locator('#password').fill('clave-simulada')
  await page.getByRole('button', { name: 'Iniciar Sesión' }).click()
  const nav = page.locator('nav[aria-label="Secciones"]'); await nav.waitFor()
  await nav.getByRole('button', { name: /Requests/i }).click()
  let card = page.locator('.request-card').filter({ hasText: result.ticketTitle }).first()
  if (await card.count()) {
    const pending = await card.getByText('Pendiente', { exact: true }).count()
    if (!pending) throw new Error('Request is not pending; refusing to repeat or duplicate an approval')
    const number = (await card.locator('p.font-mono').first().innerText()).trim()
    result.requestNumber = number
    await card.getByRole('button', { name: 'Aprobar' }).click()
    const dialog = page.getByRole('dialog', { name: 'Validación de solicitud' }); await dialog.waitFor()
    await dialog.locator('#validation-responsible').selectOption('00000000-0000-4000-8000-0000000000c3')
    await dialog.locator('#validation-code').selectOption(code.id)
    await dialog.locator('#validation-area').selectOption(area.id)
    await dialog.locator('#validation-portfolio').selectOption(portfolio.id)
    await dialog.locator('#validation-project').selectOption(initiative.id)
    result.selection = { portfolio: 'Gestión', initiative: 'Beneficiarios finales', priority: 'medium', assignee: 'developer ficticio' }
    result.before = `${result.ticketTitle} · ${number}`
    await page.screenshot({ path: '.agent-artifacts/qa-integral-20261125/screenshots/e2e-postgres/m20-validation-before-confirm.png', fullPage: true })
    await dialog.getByRole('button', { name: 'Aceptar y crear trabajo' }).click()
    await dialog.waitFor({ state: 'hidden', timeout: 20000 })
    result.ticketWrites = 1
  } else {
    await page.getByRole('button', { name: /Aprobadas/ }).click()
    card = page.locator('.request-card').filter({ hasText: result.ticketTitle }).first()
    await card.waitFor({ timeout: 10000 })
    result.alreadyApproved = true
    result.ticketWrites = 0
  }
  await nav.getByRole('button', { name: /Boards/i }).click()
  await page.getByRole('button', { name: 'Activos', exact: true }).waitFor()
  await page.locator('.project-card').filter({ hasText: result.ticketTitle }).waitFor({ timeout: 15000 })
  result.visibleOnBoard = true
  result.projectNumber = await page.locator('.project-card').filter({ hasText: result.ticketTitle }).locator('.card-number').innerText().catch(() => null)
  await page.screenshot({ path: '.agent-artifacts/qa-integral-20261125/screenshots/e2e-postgres/m20-created-board-card.png', fullPage: true })
} catch (error) {
  result.error = error instanceof Error ? error.message : String(error)
} finally {
  await context.close(); await browser.close()
}
console.log(JSON.stringify(result, null, 2))
if (result.error || !result.visibleOnBoard) process.exitCode = 1
