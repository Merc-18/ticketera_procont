// Seguimiento público integrado en la tarjeta «Rastrear Solicitud» de /portal (claro y oscuro).
// DATOS FICTICIOS: Supabase sustituido por tests/ui/fixture-server.mjs (REQ26-9201 → «Trabajo en proceso»;
// cualquier otro número → sin resultado). Sin red externa, sin credenciales reales, sin tickets reales.
import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createServer as createViteServer } from 'vite'
import { chromium } from 'playwright-core'
import { startFixtureServer } from './fixture-server.mjs'
import { installVisualFixtures } from './ux-fixtures.mjs'
import { MOCK_RUC, MOCK_PASSWORD } from '../../src/dev/client-portal-mock.ts'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const RPC = '/rest/v1/rpc/track_request_status'
const PREFIX = `REQ${new Date().getFullYear().toString().slice(2)}-`
let fixture, vite, browser, base

before(async () => {
  fixture = await startFixtureServer()
  const settings = { VITE_SUPABASE_URL: fixture.url, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_simulada_solo_pruebas', VITE_CLIENT_PORTAL_MOCK: '0', VITE_CLIENT_LOGIN_ENABLED: '1' }
  Object.assign(process.env, settings)
  vite = await createViteServer({ root: ROOT, logLevel: 'error', server: { host: '127.0.0.1', port: 0, hmr: false } })
  await vite.listen()
  base = `http://127.0.0.1:${vite.httpServer.address().port}`
  for (const name of Object.keys(settings)) delete process.env[name]
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || undefined })
})
after(async () => { await browser?.close(); await vite?.close(); await fixture?.close() })

async function open(theme, path = '/portal', viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport, locale: 'es-PE', hasTouch: viewport.width <= 768 })
  await context.route('**/*', route => {
    const u = new URL(route.request().url())
    return ['127.0.0.1', 'localhost'].includes(u.hostname) || ['data:', 'blob:'].includes(u.protocol) ? route.continue() : route.abort()
  })
  await context.addInitScript(t => { try { localStorage.setItem('ticketera-theme', t) } catch {} }, theme)
  const page = await context.newPage()
  page.errors = []; page.rpc = []; page.navigations = []
  page.on('pageerror', e => page.errors.push(e.message))
  page.on('request', r => { if (r.url().endsWith(RPC)) page.rpc.push(r.postDataJSON()) })
  page.on('framenavigated', f => { if (f === page.mainFrame()) page.navigations.push(new URL(f.url()).pathname) })
  await installVisualFixtures(page, fixture.url)
  await page.goto(base + path)
  if (path !== '/cliente') await page.locator('#tracking-number').waitFor()
  return page
}
const card = page => page.locator('#seguimiento')
const search = async (page, value, how = 'button') => {
  await page.fill('#tracking-number', value)
  if (how === 'enter') await page.locator('#tracking-number').press('Enter')
  else await card(page).getByRole('button', { name: /Buscar/ }).click()
}

for (const theme of ['light', 'dark']) {
  test(`[${theme}] portal: dos tarjetas; «Rastrear Solicitud» contiene icono, título, texto, campo y Buscar`, async () => {
    const page = await open(theme)
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), theme)
    assert.equal(await page.locator('.portal-options > .portal-option').count(), 2)
    assert.equal(await page.getByRole('button', { name: /Nueva Solicitud/ }).count(), 1)
    const c = card(page)
    assert.equal(await c.getByRole('heading', { level: 2, name: 'Rastrear Solicitud' }).count(), 1)
    assert.equal(await c.locator('.icon-tile svg').count(), 1)
    assert.equal(await c.getByLabel('Número de solicitud').count(), 1, 'etiqueta visible asociada')
    assert.equal(await c.getByRole('button', { name: 'Buscar' }).count(), 1)
    // Estado inicial: sin resultado, sin error y sin consultas.
    assert.equal(await page.getByTestId('public-tracking-result').count(), 0)
    assert.equal(await page.getByRole('alert').count(), 0)
    assert.equal(page.rpc.length, 0)
    await page.context().close()
  })

  test(`[${theme}] vacío y formato inválido: error bajo el campo, foco y ninguna consulta`, async () => {
    const page = await open(theme)
    await card(page).getByRole('button', { name: 'Buscar' }).click()
    const input = page.locator('#tracking-number')
    assert.equal(await input.getAttribute('aria-invalid'), 'true')
    assert.match(await page.locator('#tracking-field-error').innerText(), /Escribe el número/)
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'tracking-number')
    await search(page, 'ABC-1')
    assert.match(await page.locator('#tracking-field-error').innerText(), /Revisa el formato/)
    assert.equal(page.rpc.length, 0, 'sin consultas para entradas inválidas')
    // Escribir limpia el error y no consulta mientras se escribe.
    await input.fill(''); await input.type('REQ26-92', { delay: 20 })
    assert.equal(await input.getAttribute('aria-invalid'), null)
    assert.equal(page.rpc.length, 0, 'sin consultas automáticas al escribir')
    await page.context().close()
  })

  test(`[${theme}] encontrado (botón) y sucesiva (Enter): solo número y estado; sin navegar`, async () => {
    const page = await open(theme)
    await search(page, 'REQ26-9201')
    const result = page.getByTestId('public-tracking-result')
    await result.waitFor()
    assert.deepEqual(page.rpc.at(-1), { p_request_number: 'REQ26-9201' }, 'contrato público existente, sin parámetros nuevos')
    const text = (await result.innerText()).replace(/\s+/g, ' ').trim()
    assert.match(text, /^REQ26-9201 Trabajo en proceso$/, `solo REQ y estado: «${text}»`)
    const cardText = await card(page).innerText()
    for (const hidden of [/Solicitante/, /RUC/, /Usuario/i, /Empresa/, /Producto/, /Subproyecto/, /Descripción/, /Prioridad/, /Urgen/, /Adjunto/, /Comentario/, /Historial/, /Responsable/])
      assert.doesNotMatch(cardText, hidden, `no se muestra ${hidden}`)
    assert.equal(await page.locator('#seguimiento ol').count(), 0, 'sin recorrido ni historial')
    // Segunda consulta con Enter: reemplaza el resultado anterior.
    await search(page, '9999', 'enter')
    await card(page).getByText(`No encontramos la solicitud ${PREFIX}9999`).waitFor()
    assert.equal(await result.count(), 0, 'el resultado anterior desaparece')
    assert.deepEqual(page.rpc.at(-1), { p_request_number: `${PREFIX}9999` }, 'solo dígitos → prefijo del año')
    assert.equal(new URL(page.url()).pathname, '/portal')
    assert.ok(page.navigations.every(p => p === '/portal'), `sin navegación: ${page.navigations}`)
    assert.deepEqual(page.errors, [])
    await page.context().close()
  })

  test(`[${theme}] cargando, error de servicio y reintento`, async () => {
    const page = await open(theme)
    let release, fail = true
    const held = new Promise(r => { release = r })
    await page.route(`**${RPC}`, async route => {
      await held
      if (fail) return route.fulfill({ status: 500, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ code: 'XX000', message: 'fallo simulado' }) })
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ request_number: 'REQ26-9201', status: 'done' }) })
    })
    await search(page, 'REQ26-9201')
    const button = card(page).getByRole('button', { name: /Buscando/ })
    await button.waitFor()
    assert.equal(await button.isDisabled(), true, 'sin envíos duplicados mientras carga')
    assert.equal(await page.locator('#seguimiento form').getAttribute('aria-busy'), 'true')
    await card(page).getByText('Buscando REQ26-9201…').waitFor()
    release()
    const alert = card(page).getByRole('alert')
    await alert.waitFor()
    assert.match(await alert.innerText(), /No pudimos consultar el estado/)
    fail = false
    await alert.getByRole('button', { name: 'Reintentar' }).click()
    await page.getByTestId('public-tracking-result').getByText('Terminado').waitFor()
    assert.equal(await card(page).getByRole('alert').count(), 0)
    assert.equal(new URL(page.url()).pathname, '/portal')
    await page.context().close()
  })

  test(`[${theme}] enlace antiguo /tracking → /portal#seguimiento con el foco en el campo`, async () => {
    const page = await open(theme, '/tracking')
    await page.waitForURL(url => url.pathname === '/portal' && url.hash === '#seguimiento')
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'tracking-number')
    assert.equal(await page.locator('#tracking-number').count(), 1, 'un solo formulario, sin duplicar')
    await page.context().close()
  })
}

test('/cliente: ya no repite el formulario; enlaza al seguimiento del portal', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  await installVisualFixtures(page, fixture.url)
  await page.goto(base + '/cliente')
  await page.getByRole('button', { name: /Ingreso con usuario/ }).waitFor()
  assert.equal(await page.locator('#public-req').count(), 0)
  assert.equal(await page.getByText('Consultar estado de un ticket').count(), 0)
  await page.getByRole('link', { name: /Rastréala en el portal/ }).click()
  await page.waitForURL(url => url.pathname === '/portal' && url.hash === '#seguimiento')
  await context.close()
})

test('Mis tickets autenticado (fixtures) conserva el detalle completo; el seguimiento público no lo sustituye', async () => {
  const page = await open('light', '/cliente')
  await page.getByRole('button', { name: /Ingreso con usuario/ }).click()
  await page.fill('#client-ruc', MOCK_RUC)
  await page.fill('#client-username', 'ana')
  await page.fill('#client-password', MOCK_PASSWORD)
  await page.locator('form[aria-label^="Ingreso con"] button[type=submit]').click()
  await page.waitForURL('**/cliente/nuevo')
  await page.getByRole('link', { name: /Mis tickets/ }).first().click()
  await page.locator('main a:visible', { hasText: 'REQ26-9001' }).first().click()
  for (const label of ['Producto', 'Solicitante', 'Subproyecto solicitado', 'Prioridad solicitada', 'Descripción'])
    await page.getByText(label, { exact: true }).first().waitFor()
  await page.context().close()
})
