/** Read-only verification after the one authorized local M20 approval. */
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()
const result = { environment: 'QA-FICTICIO local', ticketWrites: 0, expected: ['QA-FICTICIO Quipu recibida sin revisar', 'Gestión', 'Beneficiarios finales', 'REQ26-003'] }
try {
  const health = await (await fetch('http://127.0.0.1:54321/qa/health')).json()
  if (health.production !== false) throw new Error('Not a local QA environment')
  await page.goto('http://127.0.0.1:5174/login')
  await page.locator('#email').fill('superadmin@simulado.invalid')
  await page.locator('#password').fill('clave-simulada')
  await page.getByRole('button', { name: 'Iniciar Sesión' }).click()
  const nav = page.locator('nav[aria-label="Secciones"]'); await nav.waitFor()
  await nav.getByRole('button', { name: /Boards/i }).click()
  const card = page.locator('.project-card').filter({ hasText: result.expected[0] }).first()
  await card.waitFor({ timeout: 20000 })
  const text = await card.innerText()
  result.cardText = text
  result.checks = Object.fromEntries(result.expected.map(s => [s, text.includes(s)]))
  result.passed = Object.values(result.checks).every(Boolean)
  mkdirSync('.agent-artifacts/qa-integral-20261125/screenshots/e2e-postgres', { recursive: true })
  await page.screenshot({ path: '.agent-artifacts/qa-integral-20261125/screenshots/e2e-postgres/m20-created-board-card.png', fullPage: true })
} catch (error) { result.error = error instanceof Error ? error.message : String(error) }
finally { await context.close(); await browser.close() }
console.log(JSON.stringify(result, null, 2))
if (result.error || !result.passed) process.exitCode = 1
