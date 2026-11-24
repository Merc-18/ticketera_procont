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
import XLSX from 'xlsx'
import { startFixtureServer, performanceScenario, STAFF, SIMULATED_PASSWORD } from './fixture-server.mjs'
import { MOCK_RUC, MOCK_PASSWORD } from '../../src/dev/client-portal-mock.ts'
import { formatBuildVersion } from '../../src/lib/build-version.ts'

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

let versionWindow = []
before(async () => {
  fixture = await startFixtureServer()
  versionWindow.push(formatBuildVersion(new Date()))
  const common = { VITE_SUPABASE_URL: fixture.url, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_simulada_solo_pruebas' }
  viteMock = await startVite({ ...common, VITE_CLIENT_PORTAL_MOCK: '1' })
  viteOff = await startVite({ ...common, VITE_CLIENT_PORTAL_MOCK: '0', VITE_CLIENT_LOGIN_ENABLED: '0' })
  versionWindow.push(formatBuildVersion(new Date()))   // la versión se fija al cargar la configuración de Vite
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
  test(`[${label}] 1. /portal muestra dos accesos públicos e ingreso del personal`, async () => {
    const page = await open(viteMock.url, '/portal', viewport)
    for (const name of [/Nueva Solicitud/, /Acceso del equipo de TI/]) {
      assert.equal(await page.getByRole('button', { name }).count(), 1, String(name))
    }
    // «Rastrear Solicitud» ya no navega: contiene el formulario de seguimiento público.
    assert.equal(await page.getByRole('heading', { name: 'Rastrear Solicitud' }).count(), 1)
    assert.equal(await page.locator('#seguimiento #tracking-number').count(), 1)
    assert.equal(await page.getByRole('button', { name: /Mis tickets/ }).count(), 0)
    assert.equal(await page.locator('.portal-option').count(), 2)
    await shot(page, `${label}-01-portal`); await done(page)
  })

  test(`[${label}] 2. Nueva Solicitud navega a /cliente (selección Quipu/QuipuFac)`, async () => {
    const page = await open(viteMock.url, '/portal', viewport)
    await page.getByRole('button', { name: /Nueva Solicitud/ }).click()
    await page.waitForURL('**/cliente')
    // /cliente se descarga al abrirse (carga diferida): se espera su contenido antes de comprobarlo.
    await page.getByRole('heading', { name: '¿Qué producto utilizas para ingresar?' }).waitFor()
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
    await cards.first().waitFor()
    assert.equal(await cards.count(), 2)
    for (let i = 0; i < 2; i++) {
      assert.equal(await cards.nth(i).isDisabled(), true)
      assert.equal(await cards.nth(i).evaluate(el => getComputedStyle(el).cursor), 'not-allowed')
      assert.match(await cards.nth(i).textContent(), /No disponible/)
    }
    assert.match(await page.getByRole('status').filter({ hasText: /todavía no está habilitado/ }).first().textContent(), /todavía no está habilitado/)
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
    // El acceso directo a la ruta privada sigue protegido, sin tarjeta pública.
    const pub = await open(viteMock.url, '/portal', viewport)
    assert.equal(await pub.getByRole('button', { name: /Mis tickets/ }).count(), 0)
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

  test(`[${label}] 11. Rastrear Solicitud es público, ocurre en el portal y muestra solo número y estado`, async () => {
    const page = await open(viteMock.url, '/portal', viewport)
    await page.locator('#tracking-number').fill('REQ26-9201')
    await page.locator('#seguimiento form button[type=submit]').click()
    await page.getByText('REQ26-9201').first().waitFor()
    await page.getByText('Trabajo en proceso').first().waitFor()
    const call = fixture.log.findLast(r => r.path.endsWith('/rpc/track_request_status'))
    assert.deepEqual(JSON.parse(call.body), { p_request_number: 'REQ26-9201' })
    assert.equal(path(page), '/portal', 'sin navegar a otra pantalla')
    await shot(page, `${label}-11-rastrear`); await done(page)
  })
}

const TABS = {
  viewer: ['Dashboard', 'Boards', 'Requests'],
  developer: ['Dashboard', 'Boards', 'Requests', 'Equipo'],
  admin: ['Dashboard', 'Boards', 'Requests', 'Equipo'],
  superadmin: ['Dashboard', 'Boards', 'Requests', 'Equipo'],
}
const EQUIPO = { developer: ['Carga de trabajo'], admin: ['Carga de trabajo', 'Usuarios', 'Papelera'],
  superadmin: ['Carga de trabajo', 'Usuarios', 'Papelera', 'Catálogos'] }
async function staffLogin(page, role) {
  await page.getByRole('button', { name: /Acceso del equipo de TI/ }).click()
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
        await page.getByRole('button', { name: 'Equipo' }).click()
        for (const sub of ['Carga de trabajo', 'Usuarios', 'Papelera', 'Catálogos']) {
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
    await login.locator('input[type=password]').waitFor()   // ruta con carga diferida
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

// ── Exportación de terminados: paginación completa contra PostgREST simulado (max_rows=1000) ──
async function exportCompleted(page) {
  let download = null
  page.on('download', d => { download = d })
  await page.getByRole('button', { name: /Completados CSV/ }).click()
  await page.getByRole('button', { name: /Completados CSV/ }).waitFor({ timeout: 30000 })   // termina «Exportando...»
  await page.waitForTimeout(800)
  if (!download) return { csv: null, text: await page.locator('body').textContent() }
  const csv = readFileSync(await download.path(), 'utf8').replace(/^\uFEFF/, '').split('\n').map(l => JSON.parse(`[${l}]`))
  return { csv, text: '' }
}
async function adminDashboard() {
  const page = await open(viteMock.url, '/portal', VIEWPORTS.escritorio)
  await staffLogin(page, 'admin')
  return page
}
const rpcCalls = since => fixture.log.slice(since).filter(r => r.method === 'POST' && r.path.endsWith('/rpc/get_ticket_performance'))

test('13A. Cero terminados (1.500 registros sin terminar): mensaje correcto y sin descarga', async () => {
  fixture.setPerformance(performanceScenario({ notDone: 1500 }))
  try {
    const page = await adminDashboard()
    const { csv, text } = await exportCompleted(page)
    assert.equal(csv, null); assert.match(text, /No hay tickets terminados para exportar/)
    await done(page)
  } finally { fixture.setPerformance(null) }
})

test('13C/D. Más de 1.000 registros con terminados fuera de la primera página: no se omiten', async () => {
  fixture.setPerformance(performanceScenario({ notDone: 1000, done: 2 }))
  try {
    const page = await adminDashboard()
    const since = fixture.log.length
    const { csv } = await exportCompleted(page)
    assert.ok(csv, 'debe descargarse el CSV')
    assert.deepEqual(csv.slice(1).map(r => r[0]).sort(), ['REQ26-100000', 'REQ26-100001'])
    for (const call of rpcCalls(since)) assert.equal(new URL('http://x' + call.path + call.query).searchParams.get('general_status'), 'eq.done')
    await done(page)
  } finally { fixture.setPerformance(null) }
})

test('13E/G/H. 1.200 sin terminar + 2.500 terminados: tres páginas ordenadas, sin duplicados ni pérdidas; null intactos', async () => {
  fixture.setPerformance(performanceScenario({ notDone: 1200, done: 2500 }))
  try {
    const page = await adminDashboard()
    const since = fixture.log.length
    const { csv } = await exportCompleted(page)
    const numbers = csv.slice(1).map(r => r[0])
    assert.equal(numbers.length, 2500); assert.equal(new Set(numbers).size, 2500)
    const calls = rpcCalls(since).map(c => new URL('http://x' + c.path + c.query).searchParams)
    assert.deepEqual(calls.map(q => [q.get('order'), q.get('offset'), q.get('limit')]),
      [['request_id.asc', '0', '1000'], ['request_id.asc', '1000', '1000'], ['request_id.asc', '2000', '1000']])
    const missingStart = csv.find(r => r[9] === 'Sin inicio de trabajo registrado')
    assert.deepEqual([missingStart[5], missingStart[7]], ['', ''], 'inicio y Cycle desconocidos quedan vacíos')
    await done(page)
  } finally { fixture.setPerformance(null) }
})

test('13F. Error en la segunda página: no se descarga un CSV parcial y se informa el error', async () => {
  fixture.setPerformance(performanceScenario({ done: 2500 }), { failOnPage: 2 })
  try {
    const page = await adminDashboard()
    const { csv, text } = await exportCompleted(page)
    assert.equal(csv, null, 'sin descarga parcial')
    assert.match(text, /página 2/)
    await done(page)
  } finally { fixture.setPerformance(null) }
})

for (const [label, viewport] of Object.entries(VIEWPORTS)) {
  test(`[${label}] integración: formulario crea Quipu y QuipuFac con adjunto simulado y separa Mis tickets`, async () => {
    const page = await open(viteMock.url, '/portal', viewport)
    await page.getByRole('button', { name: /Nueva Solicitud/ }).click()
    await page.waitForURL('**/cliente')
    let quipuReq
    for (const provider of ['quipu', 'quipufac']) {
      await clientLogin(page, provider)
      await page.waitForURL('**/cliente/nuevo')
      await page.locator('#ticket-product').waitFor()
      if (provider === 'quipufac') assert.equal((await productOptions(page)).includes('Quipu'), false)
      if (provider === 'quipufac') await page.fill('#ticket-requester', 'Persona ficticia integrada')
      await page.selectOption('#ticket-product', { label: provider === 'quipu' ? 'Quipu' : 'Quipu_Fac' })
      if (provider === 'quipufac') {
        await page.locator('#ticket-subproject option[value="00000000-0000-4000-8000-000000008002"]').waitFor({ state: 'attached' })
        await page.selectOption('#ticket-subproject', '00000000-0000-4000-8000-000000008002')
      }
      await page.selectOption('#ticket-type', { label: 'Mejora' })
      await page.fill('#ticket-title', `Prueba de formulario ${provider}`)
      await page.fill('#ticket-description', 'Datos ficticios del simulador local; sin tickets remotos.')
      await page.locator('input[type=file]').setInputFiles({ name: 'fixture.pdf', mimeType: 'application/pdf', buffer: Buffer.from('synthetic fixture') })
      await page.getByRole('button', { name: 'Enviar solicitud', exact: true }).click()
      await page.getByRole('heading', { name: '¡Solicitud enviada!' }).waitFor()
      const number = (await page.getByText(/^REQ\d{2}-\d{3,}$/).first().textContent()).trim()
      await page.getByRole('button', { name: 'Ver Mis tickets', exact: true }).click()
      await page.getByRole('heading', { name: 'Mis tickets' }).waitFor()
      await page.locator('main a:visible', { hasText: number }).first().waitFor()
      if (provider === 'quipu') quipuReq = number
      else assert.equal(await page.getByText(quipuReq, { exact: true }).count(), 0)
      await page.getByRole('button', { name: 'Salir', exact: true }).click()
      await page.waitForURL(/\/cliente(\?|$)/)
    }
    await done(page)
  })
}

test('integración: Planner procesa Excel real y conserva payload/acuse de la RPC interna', async () => {
  const page = await adminDashboard()
  let submitted
  await page.route('**/rest/v1/rpc/submit_request', async route => {
    submitted = route.request().postDataJSON()
    await route.fulfill({ status: 200, contentType: 'application/json', headers: {
      'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*',
    }, body: JSON.stringify({ id: '00000000-0000-4000-8000-000000009501', request_number: 'REQ26-9501',
      tracking_token: '00000000-0000-4000-8000-000000009502' }) })
  })
  await page.getByRole('button', { name: 'Requests', exact: true }).click()
  await page.getByRole('button', { name: /Importar Planner/ }).click()
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet([{ 'Task Name': 'Solicitud Planner integrada',
    'Bucket Name': 'Otro', 'Created By': 'Operador ficticio', Description: 'Fixture local', 'Due date': '2026-12-01' }]), 'Planner')
  await page.locator('input[type=file]').setInputFiles({ name: 'planner-fixture.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) })
  await page.getByText('Solicitud Planner integrada', { exact: true }).waitFor()
  // Planner no conoce aún el código interno del estudio; M17 impide asociar áreas en este intake.
  assert.equal(await page.getByRole('combobox').filter({ has: page.getByRole('option', { name: 'CONTABILIDAD' }) }).count(), 0)
  await page.getByRole('button', { name: 'Importar 1 solicitud', exact: true }).click()
  await page.getByRole('heading', { name: '1 solicitudes confirmadas' }).waitFor()
  assert.equal(submitted.p_payload.requester_name, 'Operador ficticio')
  assert.equal(Object.hasOwn(submitted.p_payload, 'requester_area'), false)
  assert.equal(submitted.p_payload.requested_date, '2026-12-01')
  assert.equal(submitted.p_payload.origin, 'Interno')
  assert.match(submitted.p_idempotency_key, /^[0-9a-f-]{36}$/)
  await done(page)
})

// ── Versión de la compilación al pie de todas las pantallas ──
async function footerCheck(page, label) {
  const footer = page.getByTestId('build-version')
  await footer.waitFor()
  const text = await footer.textContent()
  assert.match(text, /^Versión \d{12}$/, `${label}: formato exacto`)
  assert.ok(versionWindow.includes(text.slice(8)), `${label}: versión de la compilación (${text})`)
  const box = await footer.boundingBox()
  const overlaps = await page.$$eval('button, input, select, textarea, table, a', (els, f) => els
    .filter(el => !el.closest('[data-testid="build-version"]'))
    .map(el => el.getBoundingClientRect()).filter(r => r.width && r.height)
    .filter(r => r.left < f.x + f.width && r.right > f.x && r.top + window.scrollY < f.y + f.height && r.bottom + window.scrollY > f.y).length,
    { x: box.x, y: box.y + await page.evaluate(() => window.scrollY), width: box.width, height: box.height })
  assert.equal(overlaps, 0, `${label}: el pie no se superpone`)
  return text
}
for (const [label, viewport] of Object.entries(VIEWPORTS)) {
  test(`[${label}] Versión de la compilación visible y estable en todas las pantallas`, async () => {
    const seen = new Set()
    const page = await open(viteMock.url, '/portal', viewport)
    seen.add(await footerCheck(page, 'portal'))
    await page.reload(); seen.add(await footerCheck(page, 'portal tras recargar'))
    await page.getByRole('button', { name: /Nueva Solicitud/ }).click(); await page.waitForURL('**/cliente')
    await page.getByRole('button', { name: /Ingreso con usuario/ }).click(); seen.add(await footerCheck(page, 'login Quipu'))
    await page.getByRole('button', { name: /Cambiar tipo/ }).click()
    await page.getByRole('button', { name: /Ingreso empresarial/ }).click(); seen.add(await footerCheck(page, 'login QuipuFac'))
    await page.getByRole('button', { name: /Cambiar tipo/ }).click()
    await clientLogin(page, 'quipu'); await page.waitForURL('**/cliente/nuevo'); await page.locator('#ticket-product').waitFor()
    seen.add(await footerCheck(page, 'Nuevo ticket'))
    await page.getByRole('link', { name: /Mis tickets/ }).click(); await page.locator('main a:visible', { hasText: 'REQ26-9001' }).first().waitFor()
    seen.add(await footerCheck(page, 'Mis tickets'))
    await page.goto(viteMock.url + '/tracking'); await page.waitForURL('**/portal#seguimiento'); seen.add(await footerCheck(page, 'Seguimiento público (enlace antiguo)'))
    await page.goto(viteMock.url + '/login'); seen.add(await footerCheck(page, 'Login del personal'))
    await page.goto(viteMock.url + '/portal'); await staffLogin(page, 'superadmin'); seen.add(await footerCheck(page, 'Panel interno'))
    await page.reload(); await page.locator('nav[aria-label="Secciones"]').waitFor(); seen.add(await footerCheck(page, 'Panel tras recargar'))
    if (SHOTS) { await page.getByTestId('build-version').scrollIntoViewIfNeeded(); await shot(page, `${label}-15-version-panel`) }
    assert.equal(seen.size, 1, 'la misma versión en todas las pantallas y tras recargar')
    await done(page)
  })
}
