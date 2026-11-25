/**
 * End-to-end client form test against local Vite + gateway + real PostgreSQL/PostgREST.
 * Provider Auth is simulated by the local QA gateway. Creates one synthetic QA-FICTICIO
 * request in the disposable local database only; never accepts a non-loopback target.
 */
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'

const base = new URL(process.env.QA_VITE_URL ?? 'http://127.0.0.1:5176')
const gateway = new URL(process.env.QA_GATEWAY_URL ?? 'http://127.0.0.1:54321')
for (const url of [base, gateway]) if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
  throw new Error('QA client form test must use loopback only')
const healthResponse = await fetch(new URL('/qa/health', gateway), { redirect: 'error' })
assert.equal(healthResponse.status, 200)
const health = await healthResponse.json()
assert.equal(health.environment, 'QA-FICTICIO')
assert.equal(health.database, 'PostgreSQL 17 local')
assert.equal(health.production, false)

const shots = process.env.QA_SCREENSHOTS ?? '.agent-artifacts/qa-integral-20261125/screenshots/subproject-ui-persistence'
mkdirSync(shots, { recursive: true })
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-PE' })
const page = await context.newPage()
const errors = []
page.on('pageerror', error => errors.push(error.message))
const title = `QA-FICTICIO subproject UI ${new Date().toISOString()}`
let sessionToken = null

try {
  await page.goto(new URL('/cliente', base).toString(), { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /Quipu/ }).first().click()
  await page.locator('#client-ruc').fill('20999999901')
  await page.locator('#client-username').fill('qaficticio')
  await page.locator('#client-password').fill('clave-simulada')
  const loginResponse = page.waitForResponse(response => {
    const url = new URL(response.url())
    return url.port === gateway.port && url.pathname === '/functions/v1/client-login' && response.request().method() === 'POST'
  }, { timeout: 10000 })
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click()
  const login = await loginResponse
  assert.equal(login.status(), 200, 'Quipu QA identity accepted by isolated gateway')
  const loginBody = await login.json()
  sessionToken = loginBody.session_token
  assert.ok(sessionToken)
  await page.getByRole('heading', { name: 'Nuevo ticket' }).waitFor({ timeout: 15000 })

  const product = page.locator('#ticket-product')
  await product.selectOption({ label: 'Quipu_Fac' })
  await page.waitForFunction(() => [...document.querySelectorAll('#ticket-subproject option')].some(o => o.textContent === 'Web'))
  const quipuFacOptions = await page.locator('#ticket-subproject option').allInnerTexts()
  assert.ok(quipuFacOptions.includes('Android') && quipuFacOptions.includes('Escritorio') && quipuFacOptions.includes('Web'))
  const quipuFacId = await product.inputValue()

  await product.selectOption({ label: 'Quipu' })
  await page.waitForFunction(() => [...document.querySelectorAll('#ticket-subproject option')].some(o => o.textContent === 'Escritorio'))
  assert.equal(await page.locator('#ticket-subproject').inputValue(), '', 'changing product clears old subproject selection')
  const quipuOptions = await page.locator('#ticket-subproject option').allInnerTexts()
  assert.deepEqual(quipuOptions.filter(x => x && !x.startsWith('Selecciona')), ['Escritorio'], 'Quipu shows only its own subproject')
  const quipuId = await product.inputValue()
  assert.notEqual(quipuId, quipuFacId)

  await product.selectOption({ label: 'Quipu_Fac' })
  await page.waitForFunction(() => [...document.querySelectorAll('#ticket-subproject option')].some(o => o.textContent === 'Web'))
  await page.locator('#ticket-subproject').selectOption({ label: 'Web' })
  const subsystem = await page.locator('#ticket-subproject').inputValue()
  assert.ok(subsystem)
  await page.locator('#ticket-type').selectOption({ index: 1 })
  await page.locator('#ticket-title').fill(title)
  await page.locator('#ticket-description').fill('Prueba ficticia de selector dependiente y persistencia del subproyecto en QA local.')
  await page.screenshot({ path: `${shots}/form-selected.png`, fullPage: true })

  const submitResponse = page.waitForResponse(response => {
    const url = new URL(response.url())
    return url.port === gateway.port && url.pathname === '/rest/v1/rpc/client_submit_request' && response.request().method() === 'POST'
  }, { timeout: 15000 })
  await page.getByRole('button', { name: 'Enviar solicitud', exact: true }).click()
  const submit = await submitResponse
  assert.equal(submit.status(), 200, 'M13 authenticated create RPC accepted the request')
  const receipt = await page.getByText(/^REQ\d{2}-\d{3}$/).innerText()
  await page.getByRole('heading', { name: '¡Solicitud enviada!' }).waitFor()
  await page.screenshot({ path: `${shots}/receipt.png`, fullPage: true })

  // Query the persisted row using an isolated synthetic internal QA account; token is memory-only.
  const staffLoginResponse = await fetch(new URL('/auth/v1/token', gateway), {
    method: 'POST', redirect: 'error', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'superadmin@simulado.invalid', password: 'clave-simulada' }),
  })
  assert.equal(staffLoginResponse.status, 200)
  const staffLogin = await staffLoginResponse.json()
  const query = new URL('/rest/v1/requests', gateway)
  query.searchParams.set('select', 'id,title,system_id,requested_subsystem_id,request_number')
  query.searchParams.set('title', `eq.${title}`)
  const storedResponse = await fetch(query, { redirect: 'error', headers: { authorization: `Bearer ${staffLogin.access_token}` } })
  assert.equal(storedResponse.status, 200)
  const rows = await storedResponse.json()
  assert.equal(rows.length, 1, 'one request row persisted in local PostgreSQL')
  assert.equal(rows[0].system_id, quipuFacId, 'stored product matches selected product')
  assert.equal(rows[0].requested_subsystem_id, subsystem, 'stored subproject matches selected subproject')
  assert.equal(rows[0].request_number, receipt, 'receipt REQ equals persisted REQ')
  await fetch(new URL('/auth/v1/logout', gateway), { method: 'POST', redirect: 'error', headers: { authorization: `Bearer ${staffLogin.access_token}` } })

  await page.getByRole('button', { name: 'Salir', exact: true }).click()
  await page.getByRole('button', { name: /Quipu/ }).first().waitFor({ timeout: 10000 })
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({
    result: 'PASS', environment: 'QA-FICTICIO local', database: 'PostgreSQL 17 via PostgREST',
    providerAuth: 'simulated local gateway', createRpc: 'client_submit_request HTTP 200',
    productSwitchClearsSubproject: true, selectedOptionsBelongToProduct: true,
    persistedProductAndSubprojectMatch: true, requestNumber: receipt,
    syntheticTitle: title, browserErrors: errors.length, fixtureData: 'one QA-FICTICIO request retained locally', screenshots: shots,
  }))
} finally {
  if (sessionToken) {
    await fetch(new URL('/functions/v1/client-login', gateway), {
      method: 'POST', redirect: 'error', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'logout', session_token: sessionToken }),
    }).catch(() => undefined)
  }
  await context.close()
  await browser.close()
}
