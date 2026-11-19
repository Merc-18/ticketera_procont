// Pruebas de interfaz: React renderizado en Chromium real, rutas reales del servidor Vite.
// DATOS SIMULADOS: el portal de clientes usa su simulador (VITE_CLIENT_PORTAL_MOCK=1, banner
// «DATOS FICTICIOS») y Supabase se sustituye por tests/ui/fixture-server.mjs. Sin red externa,
// sin proyecto real y sin crear tickets reales.
//
// Ejecutar: npm run test:ui   (CHROMIUM_EXECUTABLE opcional; UI_SCREENSHOTS=<dir> guarda capturas)
import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer as createNetServer } from 'node:net'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createServer as createViteServer } from 'vite'
import { chromium } from 'playwright-core'
import { startFixtureServer, STAFF, SIMULATED_PASSWORD } from './fixture-server.mjs'
import { MOCK_RUC, MOCK_PASSWORD } from '../../src/dev/client-portal-mock.ts'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const VIEWPORTS = { escritorio: { width: 1366, height: 900 }, movil: { width: 390, height: 844 } }
const SHOTS = process.env.UI_SCREENSHOTS
const MOCK_IDS = { luisTicket: '00000000-0000-4000-8000-000000009003' }
let fixture, viteMock, viteOff, browser

const freePort = () => new Promise(resolve => {
  const s = createNetServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)) })
})
async function startVite(env) {
  Object.assign(process.env, env)
  const port = await freePort()
  const server = await createViteServer({ root: ROOT, logLevel: 'error', server: { host: '127.0.0.1', port, strictPort: true, hmr: false } })
  await server.listen()
  for (const key of Object.keys(env)) delete process.env[key]
  return { server, url: `http://127.0.0.1:${port}` }
}

before(async () => {
  fixture = await startFixtureServer()
  const common = { VITE_SUPABASE_URL: fixture.url, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_simulada_solo_pruebas' }
  viteMock = await startVite({ ...common, VITE_CLIENT_PORTAL_MOCK: '1' })
  viteOff = await startVite({ ...common, VITE_CLIENT_PORTAL_MOCK: '0', VITE_CLIENT_LOGIN_ENABLED: '0' })
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || undefined })
  if (SHOTS) mkdirSync(SHOTS, { recursive: true })
})
after(async () => {
  await browser?.close(); await viteMock?.server.close(); await viteOff?.server.close(); await fixture?.close()
})

async function open(base, path, viewport) {
  const context = await browser.newContext({ viewport, acceptDownloads: true })
  const page = await context.newPage()
  page.errors = []
  page.on('pageerror', e => page.errors.push(e.message))
  page.on('console', m => {
    // Realtime (WebSocket) no existe en el servidor simulado; no es un error de la aplicación.
    if (m.type() === 'error' && !/websocket|realtime|Failed to load resource/i.test(m.text())) page.errors.push(m.text())
  })
  await page.goto(base + path)
  return page
}
const path = page => { const u = new URL(page.url()); return u.pathname + u.search }
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }) }
const done = async page => { assert.deepEqual(page.errors, []); await page.context().close() }
async function clientLogin(page, type, username = 'ana') {
  await page.getByRole('button', { name: type === 'quipu' ? /Ingreso con usuario/ : /Ingreso empresarial/ }).click()
  await page.fill('#client-ruc', MOCK_RUC)
  if (type === 'quipu') await page.fill('#client-username', username)
  await page.fill('#client-password', MOCK_PASSWORD)
  await page.locator('form[aria-label^="Ingreso con"] button[type=submit]').click()
}
const inputIds = page => page.$$eval('form[aria-label^="Ingreso con"] input', inputs => inputs.map(i => i.id))
const productOptions = page => page.$$eval('#ticket-product option', o => o.map(x => x.textContent).filter(t => !t.startsWith('Selecciona')))

for (const [label, viewport] of Object.entries(VIEWPORTS)) {
  test(`[${label}] 1. /portal muestra Nueva Solicitud, Mis tickets, Rastrear y el ingreso del personal`, async () => {
    const page = await open(viteMock.url, '/portal', viewport)
    for (const name of [/Nueva Solicitud/, /Mis tickets/, /Rastrear Solicitud/, /Ingreso del personal/]) {
      assert.equal(await page.getByRole('button', { name }).count(), 1, String(name))
    }
    await shot(page, `${label}-01-portal`); await done(page)
  })

  test(`[${label}] 2. Nueva Solicitud navega a /cliente (selección Quipu/QuipuFac)`, async () => {
    const page = await open(viteMock.url, '/portal', viewport)
    await page.getByRole('button', { name: /Nueva Solicitud/ }).click()
    await page.waitForURL('**/cliente')
    assert.equal(await page.getByRole('heading', { name: '¿Qué producto utilizas para ingresar?' }).count(), 1)
    assert.equal(await page.getByRole('link', { name: /Inicio/ }).count(), 1, 'regreso a la página principal')
    await shot(page, `${label}-02-cliente`); await done(page)
  })

  test(`[${label}] 3. /request no abre el formulario público y redirige al ingreso`, async () => {
    const before = fixture.log.length
    const page = await open(viteMock.url, '/request', viewport)
    await page.waitForURL('**/cliente')
    assert.equal(await page.getByText('Estudio', { exact: false }).count(), 0)
    assert.equal(await page.locator('#ticket-requester').count(), 0)
    assert.equal(fixture.log.slice(before).some(r => r.path.endsWith('/rpc/submit_client_request')), false)
    await done(page)
  })

  test(`[${label}] 4-5. Quipu pide RUC, usuario y contraseña; QuipuFac solo RUC y contraseña`, async () => {
    const page = await open(viteMock.url, '/cliente', viewport)
    await page.getByRole('button', { name: /Ingreso con usuario/ }).click()
    assert.deepEqual(await inputIds(page), ['client-ruc', 'client-username', 'client-password'])
    await shot(page, `${label}-04-quipu`)
    await page.getByRole('button', { name: /Cambiar tipo/ }).click()
    await page.getByRole('button', { name: /Ingreso empresarial/ }).click()
    assert.deepEqual(await inputIds(page), ['client-ruc', 'client-password'])
    await shot(page, `${label}-05-quipufac`); await done(page)
  })

  test(`[${label}] 6. Login desactivado: estado inequívocamente no operativo`, async () => {
    const page = await open(viteOff.url, '/cliente', viewport)
    const cards = page.locator('[aria-label="Tipo de ingreso"] button')
    assert.equal(await cards.count(), 2)
    for (let i = 0; i < 2; i++) {
      assert.equal(await cards.nth(i).isDisabled(), true)
      assert.equal(await cards.nth(i).evaluate(el => getComputedStyle(el).cursor), 'not-allowed')
      assert.match(await cards.nth(i).textContent(), /No disponible/)
    }
    assert.match(await page.getByRole('status').first().textContent(), /todavía no está habilitado/)
    await cards.first().click({ force: true })
    assert.equal(await page.locator('#client-password').count(), 0, 'no aparece formulario')
    // La entrada principal sigue llevando a la selección deshabilitada, nunca al formulario anónimo.
    await page.goto(viteOff.url + '/request'); await page.waitForURL('**/cliente')
    await shot(page, `${label}-06-login-desactivado`); await done(page)
  })

  test(`[${label}] 7. Login válido conduce a /cliente/nuevo con productos de la sesión; Salir cierra`, async () => {
    const page = await open(viteMock.url, '/cliente', viewport)
    await clientLogin(page, 'quipu')
    await page.waitForURL('**/cliente/nuevo')
    await page.getByRole('heading', { name: 'Nuevo ticket' }).waitFor()
    await page.locator('#ticket-product').waitFor()
    assert.deepEqual(await productOptions(page), ['Quipu', 'Quipu_Fac', 'Quipu_Gestion', 'Negmin', 'Quipu_AI'])
    await shot(page, `${label}-07-nuevo-ticket-quipu`)
    await page.getByRole('button', { name: 'Salir' }).click(); await page.waitForURL(/\/cliente(\?|$)/)
    await clientLogin(page, 'quipufac'); await page.waitForURL('**/cliente/nuevo')
    await page.locator('#ticket-product').waitFor()
    assert.deepEqual(await productOptions(page), ['Quipu_Fac', 'Quipu_Gestion', 'Negmin', 'Quipu_AI'], 'QuipuFac sin Quipu')
    await done(page)
  })

  test(`[${label}] 8-9. Sin sesión no se entra a /cliente/nuevo ni a /cliente/tickets; tras ingresar vuelve al destino`, async () => {
    const page = await open(viteMock.url, '/cliente/nuevo', viewport)
    await page.waitForURL('**/cliente?ir=nuevo')
    await page.goto(viteMock.url + '/cliente/tickets'); await page.waitForURL('**/cliente?ir=tickets')
    assert.match(await page.locator('main p').first().textContent(), /consultar tus tickets/)
    await clientLogin(page, 'quipu'); await page.waitForURL('**/cliente/tickets')
    await page.getByRole('heading', { name: 'Mis tickets' }).waitFor()
    // Desde la página pública, «Mis tickets» conduce al mismo ingreso.
    const pub = await open(viteMock.url, '/portal', viewport)
    await pub.getByRole('button', { name: /Mis tickets/ }).click(); await pub.waitForURL('**/cliente?ir=tickets')
    await done(pub); await done(page)
  })

  test(`[${label}] 10. Mis tickets y detalle: solo la identidad autenticada; ajeno no visible`, async () => {
    const page = await open(viteMock.url, '/cliente', viewport)
    await clientLogin(page, 'quipu', 'ana'); await page.waitForURL('**/cliente/nuevo')
    await page.getByRole('link', { name: /Mis tickets/ }).click(); await page.waitForURL('**/cliente/tickets')
    await page.locator('main a:visible', { hasText: 'REQ26-9001' }).first().waitFor()
    const text = await page.locator('main').textContent()
    assert.match(text, /REQ26-9001/); assert.match(text, /REQ26-9002/); assert.doesNotMatch(text, /REQ26-9003/)
    await shot(page, `${label}-10-mis-tickets`)
    await page.locator('main a:visible', { hasText: 'REQ26-9001' }).first().click()   // tabla o tarjeta según ancho
    await page.getByText('Descripción', { exact: true }).waitFor()
    await page.evaluate(id => { history.pushState({}, '', `/cliente/tickets/${id}`); dispatchEvent(new PopStateEvent('popstate')) }, MOCK_IDS.luisTicket)
    await page.getByText('No encontramos ese ticket entre los tuyos.').waitFor()
    assert.equal(path(page), `/cliente/tickets/${MOCK_IDS.luisTicket}`, 'la sesión se conserva')
    await done(page)
  })

  test(`[${label}] 11. Rastrear Solicitud es público y muestra solo número y estado`, async () => {
    const page = await open(viteMock.url, '/portal', viewport)
    await page.getByRole('button', { name: /Rastrear Solicitud/ }).click(); await page.waitForURL('**/tracking')
    await page.locator('input').first().fill('REQ26-9201')
    await page.locator('form button[type=submit]').click()
    await page.getByText('REQ26-9201').first().waitFor()
    await page.getByText('Trabajo en proceso').first().waitFor()
    const call = fixture.log.findLast(r => r.path.endsWith('/rpc/track_request_status'))
    assert.deepEqual(JSON.parse(call.body), { p_request_number: 'REQ26-9201' })
    await shot(page, `${label}-11-rastrear`); await done(page)
  })
}

const TABS = {
  viewer: ['📈 Dashboard', '📊 Boards', '📬 Requests'],
  developer: ['📈 Dashboard', '📊 Boards', '📬 Requests', '👥 Equipo'],
  admin: ['📈 Dashboard', '📊 Boards', '📬 Requests', '👥 Equipo'],
  superadmin: ['📈 Dashboard', '📊 Boards', '📬 Requests', '👥 Equipo'],
}
const EQUIPO = { developer: ['📊 Carga de Trabajo'], admin: ['📊 Carga de Trabajo', '🔑 Usuarios', '🗑 Papelera'],
  superadmin: ['📊 Carga de Trabajo', '🔑 Usuarios', '🗑 Papelera', '🗂 Catálogos'] }
async function staffLogin(page, role) {
  await page.getByRole('button', { name: /Ingreso del personal/ }).click()
  await page.fill('input[type=email]', Object.keys(STAFF).find(e => STAFF[e].role === role))
  await page.fill('input[type=password]', SIMULATED_PASSWORD)
  await page.getByRole('button', { name: /Ingresar al sistema/ }).click()
  await page.locator('nav[aria-label="Secciones"]').waitFor()
}

for (const [label, viewport] of Object.entries(VIEWPORTS)) {
  test(`[${label}] 12. Acceso interno independiente: cuatro roles con sus pestañas aprobadas`, async () => {
    for (const role of ['viewer', 'developer', 'admin', 'superadmin']) {
      const page = await open(viteMock.url, '/portal', viewport)
      await staffLogin(page, role)
      assert.equal(path(page), '/')
      const tabs = await page.$$eval('nav[aria-label="Secciones"] button', b => b.map(x => x.textContent.trim().replace(/\d+$/, '').trim()))
      assert.deepEqual(tabs, TABS[role], role)
      if (EQUIPO[role]) {
        await page.getByRole('button', { name: '👥 Equipo' }).click()
        for (const sub of ['📊 Carga de Trabajo', '🔑 Usuarios', '🗑 Papelera', '🗂 Catálogos']) {
          assert.equal(await page.getByRole('button', { name: sub }).count(), EQUIPO[role].includes(sub) ? 1 : 0, `${role} ${sub}`)
        }
      }
      if (role === 'superadmin') await shot(page, `${label}-12-personal-superadmin`)
      // El personal no comparte sesión con el portal de clientes.
      assert.equal(await page.evaluate(() => sessionStorage.getItem('ticketera.client.session')), null)
      await page.getByRole('button', { name: 'Cerrar Sesión' }).click(); await page.waitForURL('**/portal')
      await done(page)
    }
    const login = await open(viteMock.url, '/login', viewport)
    assert.equal(await login.locator('input[type=password]').count(), 1, '/login sigue disponible')
    await done(login)
  })
}

test('13. Exportaciones sin métricas SLA ficticias; datos por ticket del servidor y ausencias explícitas', async () => {
  const page = await open(viteMock.url, '/portal', VIEWPORTS.escritorio)
  await staffLogin(page, 'admin')
  const csvOf = async name => {
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name }).click()])
    return readFileSync(await download.path(), 'utf8').replace(/^﻿/, '').split('\n').map(l => JSON.parse(`[${l}]`))
  }
  const completed = await csvOf(/Completados CSV/)
  assert.deepEqual(completed[0], ['Número', 'Proyecto', 'Área', 'Prioridad', 'Tipo', 'Inicio de trabajo', 'Finalización',
    'Cycle Time (d)', 'Lead Time (d)', 'Estado de la métrica'])
  assert.equal(completed.length, 3, 'solo los tickets terminados (no el que está en proceso)')
  const byReq = Object.fromEntries(completed.slice(1).map(r => [r[0], r]))
  assert.deepEqual(byReq['REQ26-9201'].slice(5), ['2026-11-03', '2026-11-06', '3.0', '5.0', 'Completa'])
  assert.deepEqual(byReq['REQ26-9202'].slice(5), ['', '2026-11-05', '', '4.0', 'Sin inicio de trabajo registrado'],
    'sin inicio: celda vacía, nunca cero')
  const active = await csvOf(/Activos CSV/)
  assert.ok(active[0].includes('Fecha límite'))
  for (const csv of [completed, active]) assert.equal(csv[0].some(h => /SLA|A Tiempo/i.test(h)), false)
  assert.equal(fixture.log.some(r => r.path === '/rest/v1/activity_logs' && r.query.includes('sla_completed')), false)
  await done(page)
})

test('14. No se disparan alertas SLA heredadas (sin inserciones de notificaciones al cargar el tablero)', async () => {
  assert.equal(existsSync(`${ROOT}/src/hooks/useSlaWarnings.ts`), false)
  const before = fixture.log.length
  const page = await open(viteMock.url, '/portal', VIEWPORTS.escritorio)
  await staffLogin(page, 'admin')   // proyecto simulado con sla_target_date heredada para mañana
  await page.waitForTimeout(1500)
  const inserts = fixture.log.slice(before).filter(r => r.path === '/rest/v1/notifications' && r.method === 'POST')
  assert.deepEqual(inserts, [])
  await done(page)
})
