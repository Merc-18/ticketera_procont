/** Read-only browser smoke against Vite + local gateway + PostgreSQL 17/PostgREST. */
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const base = process.env.QA_VITE_URL ?? 'http://127.0.0.1:5174'
const out = process.env.QA_SCREENSHOTS ?? '.agent-artifacts/qa-integral-20261125/screenshots/e2e-postgres'
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-PE' })
const page = await context.newPage()
const errors = [], failedApiResponses = []
page.on('pageerror', error => errors.push(`pageerror:${error.message}`))
page.on('console', message => {
  if (message.type() === 'error' && !/WebSocket connection.*realtime\/v1\/websocket/.test(message.text())) errors.push(`console:${message.text()}`)
})
page.on('response', response => {
  const url = new URL(response.url())
  if (url.port === '54321' && response.status() >= 400 && !url.pathname.startsWith('/realtime/'))
    failedApiResponses.push({ status: response.status(), path: url.pathname })
})
const evidence = {
  environment: 'QA-FICTICIO local', api: 'PostgREST → PostgreSQL 17', actions: [],
  unsupported: ['Supabase Realtime WebSocket is not provided by the local gateway; REST/RPC reads are live.'],
  errors, failedApiResponses,
}
try {
  const health = await (await fetch('http://127.0.0.1:54321/qa/health')).json()
  if (health.production !== false || health.database !== 'PostgreSQL 17 local') throw new Error('QA gateway is not isolated local PostgreSQL')
  evidence.actions.push('health: isolated local gateway')
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' })
  await page.locator('#email').fill('superadmin@simulado.invalid')
  await page.locator('#password').fill('clave-simulada')
  await page.getByRole('button', { name: 'Iniciar Sesión' }).click()
  const nav = page.locator('nav[aria-label="Secciones"]')
  await nav.waitFor({ timeout: 15000 })
  evidence.actions.push('auth: simulated local Auth, active profile loaded from PostgreSQL')

  await page.locator('.stat-card').first().waitFor({ timeout: 20000 })
  await page.waitForTimeout(500)
  const dashboardText = await page.locator('main').innerText()
  evidence.dashboardHasMetrics = !dashboardText.includes('Cargando vista...')
  evidence.dashboardHasStudyBreakdown = dashboardText.includes('Tickets por estudio')
  evidence.dashboardHasTeamEntry = dashboardText.includes('Gestión de usuarios y carga de trabajo del equipo')
  await page.screenshot({ path: `${out}/dashboard.png`, fullPage: true })
  evidence.actions.push(`dashboard: live data; metrics=${evidence.dashboardHasMetrics}; studyBreakdown=${evidence.dashboardHasStudyBreakdown}`)

  const boards = nav.getByRole('button', { name: /Boards/i })
  await boards.click()
  await page.locator('.project-card').first().waitFor({ timeout: 20000 })
  evidence.projectCardsOnBoard = await page.locator('.project-card').count()
  evidence.qaLabelVisible = (await page.locator('main').innerText()).includes('QA-FICTICIO')
  await page.screenshot({ path: `${out}/boards.png`, fullPage: true })
  evidence.actions.push(`Boards: ${evidence.projectCardsOnBoard} rendered cards from live database`)
  await page.getByRole('button', { name: /Tabla/i }).click()
  await page.locator('.data-view table').waitFor({ timeout: 10000 })
  await page.screenshot({ path: `${out}/tabla.png`, fullPage: true })
  evidence.actions.push('Table: rendered from live database')

  for (const label of ['Requests', 'Equipo']) {
    const button = nav.getByRole('button', { name: new RegExp(label, 'i') })
    if (!(await button.count())) { evidence.actions.push(`${label}: navigation item missing`); continue }
    await button.first().click(); await page.waitForTimeout(700)
    if (label === 'Equipo') {
      const tabNames = await page.getByRole('tab').allInnerTexts()
      evidence.teamTabs = tabNames
      for (const name of tabNames) {
        await page.getByRole('tab', { name }).click(); await page.waitForTimeout(450)
        const slug = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')
        await page.screenshot({ path: `${out}/equipo-${slug}.png`, fullPage: true })
      }
    } else await page.screenshot({ path: `${out}/${label.toLowerCase()}.png`, fullPage: true })
    evidence.actions.push(`${label}: opened and captured`)
  }
  evidence.actions.push(`QA-FICTICIO label visible=${evidence.qaLabelVisible}`)
} catch (error) {
  evidence.fatal = error instanceof Error ? error.message : String(error)
} finally {
  writeFileSync(`${out}/result.json`, JSON.stringify(evidence, null, 2) + '\n')
  await context.close(); await browser.close()
}
console.log(JSON.stringify(evidence, null, 2))
if (evidence.fatal || errors.length || failedApiResponses.length || !evidence.dashboardHasMetrics || !evidence.dashboardHasStudyBreakdown || !evidence.projectCardsOnBoard) process.exitCode = 1
