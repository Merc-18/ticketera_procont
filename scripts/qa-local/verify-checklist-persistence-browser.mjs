/**
 * Verifies checklist persistence through the real React UI and local PostgreSQL/PostgREST.
 * Auth is simulated by the QA gateway. This script refuses non-loopback targets.
 */
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'

const base = new URL(process.env.QA_VITE_URL ?? 'http://127.0.0.1:5176')
const gateway = new URL(process.env.QA_GATEWAY_URL ?? 'http://127.0.0.1:54321')
for (const url of [base, gateway]) {
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('QA browser test must use loopback only')
}
const healthResponse = await fetch(new URL('/qa/health', gateway), { redirect: 'error' })
assert.equal(healthResponse.status, 200)
const health = await healthResponse.json()
assert.equal(health.environment, 'QA-FICTICIO')
assert.equal(health.database, 'PostgreSQL 17 local')
assert.equal(health.production, false)

const shots = process.env.QA_SCREENSHOTS ?? '.agent-artifacts/qa-integral-20261125/screenshots/checklist-persistence'
mkdirSync(shots, { recursive: true })
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-PE' })
const page = await context.newPage()
const errors = []
page.on('pageerror', error => errors.push(error.message))
page.on('response', response => {
  const url = new URL(response.url())
  if (url.port === gateway.port && url.pathname === '/rest/v1/checklist_items' && response.request().method() === 'PATCH' && response.status() >= 400)
    errors.push(`checklist PATCH HTTP ${response.status()}`)
})

const login = async () => {
  await page.goto(new URL('/login', base).toString(), { waitUntil: 'networkidle' })
  await page.locator('#email').fill('superadmin@simulado.invalid')
  await page.locator('#password').fill('clave-simulada')
  await page.getByRole('button', { name: 'Iniciar Sesión' }).click()
  await page.locator('nav[aria-label="Secciones"]').waitFor({ timeout: 15000 })
}
const openChecklist = async () => {
  const nav = page.locator('nav[aria-label="Secciones"]')
  await nav.getByRole('button', { name: /Boards/i }).click()
  const card = page.locator('.project-card').filter({ hasText: 'QA-FICTICIO TI tablero de beneficiarios' }).first()
  await card.waitFor({ timeout: 15000 })
  await card.click()
  const dialog = page.getByRole('dialog', { name: 'Detalle del ticket' })
  await dialog.waitFor()
  await dialog.getByRole('tab', { name: /Checklist/ }).click()
  await dialog.locator('input[type="checkbox"]').first().waitFor({ timeout: 10000 })
  return dialog
}

let initialChecked
let restoreNeeded = false
let persistedAcrossReload = false
try {
  await login()
  let dialog = await openChecklist()
  let checkbox = dialog.locator('input[type="checkbox"]').first()
  initialChecked = await checkbox.isChecked()
  await page.screenshot({ path: `${shots}/before.png`, fullPage: true })

  const updateResponse = page.waitForResponse(response => {
    const url = new URL(response.url())
    return url.port === gateway.port && url.pathname === '/rest/v1/checklist_items' && response.request().method() === 'PATCH'
  }, { timeout: 10000 })
  await checkbox.click()
  const response = await updateResponse
  assert.equal(response.status(), 200, 'checklist update was accepted by local PostgREST')
  restoreNeeded = true
  await page.waitForFunction(expected => document.querySelector('[role="dialog"] input[type="checkbox"]')?.checked === expected,
    !initialChecked)

  await page.reload({ waitUntil: 'networkidle' })
  await page.locator('nav[aria-label="Secciones"]').waitFor({ timeout: 15000 })
  dialog = await openChecklist()
  checkbox = dialog.locator('input[type="checkbox"]').first()
  assert.equal(await checkbox.isChecked(), !initialChecked, 'fresh UI query after page reload returns persisted state')
  persistedAcrossReload = true
  await page.screenshot({ path: `${shots}/after-reload.png`, fullPage: true })

  await checkbox.click()
  await page.waitForFunction(expected => document.querySelector('[role="dialog"] input[type="checkbox"]')?.checked === expected,
    initialChecked)
  restoreNeeded = false
  await page.reload({ waitUntil: 'networkidle' })
  await page.locator('nav[aria-label="Secciones"]').waitFor({ timeout: 15000 })
  dialog = await openChecklist()
  assert.equal(await dialog.locator('input[type="checkbox"]').first().isChecked(), initialChecked,
    'QA fixture restored to its original checklist state')
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({
    result: 'PASS', environment: 'QA-FICTICIO local', database: 'PostgreSQL 17 via PostgREST',
    authentication: 'simulated local Auth', persistenceAcrossReload: persistedAcrossReload,
    fixtureRestored: true, browserErrors: errors.length, screenshots: shots,
  }))
} finally {
  // Best-effort fixture restoration if an assertion fails after the one local QA write.
  if (restoreNeeded && initialChecked !== undefined) {
    try {
      if (!page.isClosed()) {
        const current = page.getByRole('dialog', { name: 'Detalle del ticket' }).locator('input[type="checkbox"]').first()
        if (await current.count() && await current.isChecked() !== initialChecked) {
          await current.click()
          await page.waitForFunction(expected => document.querySelector('[role="dialog"] input[type="checkbox"]')?.checked === expected,
            initialChecked, { timeout: 5000 })
        }
      }
    } catch { /* the script reports failure; avoid hiding the original error */ }
  }
  await context.close()
  await browser.close()
}
