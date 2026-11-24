// Ajustes de Boards, Dashboard, identidad TI y formulario (D-041 a D-046). DATOS FICTICIOS: Supabase sustituido
// por tests/ui/fixture-server.mjs y fixtures visuales; sin red externa, sin credenciales reales, sin tickets reales.
import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { createServer as createViteServer } from 'vite'
import { chromium } from 'playwright-core'
import { startFixtureServer, SIMULATED_PASSWORD, STAFF } from './fixture-server.mjs'
import { installVisualFixtures } from './ux-fixtures.mjs'
import { MOCK_RUC, MOCK_PASSWORD } from '../../src/dev/client-portal-mock.ts'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const PROCONT = '00000000-0000-4000-8000-000000000177', OTHER = '00000000-0000-4000-8000-0000000000b1'
const M17_SHOTS = process.env.M17_UI_SCREENSHOTS
const M17_CAPTURES = []
async function captureM17(page, file) {
  mkdirSync(M17_SHOTS, { recursive: true })
  const path = `${M17_SHOTS}/${file}`
  const png = await page.screenshot({ path, fullPage: true, animations: 'disabled' })
  const version = (await page.getByTestId('build-version').innerText()).trim()
  const viewport = page.viewportSize()
  M17_CAPTURES.push({ file, version, viewport, sha256: createHash('sha256').update(png).digest('hex') })
  writeFileSync(`${M17_SHOTS}/m17-area-manifest.json`, JSON.stringify({ captures: M17_CAPTURES }, null, 2) + '\n')
}
const DEV = STAFF['developer@simulado.invalid'].id
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

const send = (route, body) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) })
async function open(theme = 'light', path = '/portal', viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport, locale: 'es-PE' })
  await context.route('**/*', route => {
    const u = new URL(route.request().url())
    return ['127.0.0.1', 'localhost'].includes(u.hostname) || ['data:', 'blob:'].includes(u.protocol) ? route.continue() : route.abort()
  })
  await context.addInitScript(t => { try { localStorage.setItem('ticketera-theme', t) } catch {} }, theme)
  const page = await context.newPage()
  page.errors = []; page.on('pageerror', e => page.errors.push(e.message))
  await installVisualFixtures(page, fixture.url)
  await page.goto(base + path)
  return page
}
async function staff(page, email = 'superadmin@simulado.invalid') {
  await page.goto(base + '/portal')
  await page.getByRole('button', { name: /Acceso del equipo de TI/ }).click()
  await page.fill('#staff-modal-email', email)
  await page.fill('#staff-modal-password', SIMULATED_PASSWORD)
  await page.getByRole('button', { name: 'Ingresar al sistema' }).click()
  await page.locator('nav[aria-label="Secciones"]').waitFor()
}
const bg = loc => loc.evaluate(el => getComputedStyle(el).backgroundColor)

test('Identidad TI: «Acceso del equipo de TI» en el portal, el modal y /login; la autenticación no cambia', async () => {
  const page = await open()
  const button = page.getByRole('button', { name: 'Acceso del equipo de TI' })
  assert.equal(await button.count(), 1)
  assert.equal(await page.getByText(/Ingreso del personal/).count(), 0)
  await button.click()
  assert.equal(await page.getByRole('dialog', { name: 'Acceso del equipo de TI' }).count(), 1)
  assert.equal(await page.getByRole('button', { name: 'Cerrar acceso del equipo de TI' }).count(), 1)
  await page.getByText('Solo para el equipo de TI de Procont Business').waitFor()
  await page.goto(base + '/login')
  await page.getByText('Acceso del equipo de TI', { exact: true }).waitFor()
  await staff(page)   // mismo flujo de autenticación simulado
  await page.context().close()
})

test('Área solo PROCONT: el modal de validación muestra áreas para PROCONT y no para otro estudio', async () => {
  const page = await open()
  const pending = (id, studio, title, code) => ({ id, request_number: `REQ26-${id.slice(-4)}`, title, requester_name: 'Solicitante ficticio', requester_area: 'Contabilidad', studio_code_id: code,
    request_type: 'Mejora', needs_code: true, status: 'pending', description: 'Datos ficticios.', requested_priority: 'medium', urgent_requested: false,
    studio_id: studio, system_id: '00000000-0000-4000-8000-0000000000a1', created_at: '2026-11-19T15:00:00Z', projects: null, area_id: null })
  await page.route(`${fixture.url}/rest/v1/requests?**`, route => send(route, [pending('00000000-0000-4000-8000-000000008801', PROCONT, 'Solicitud PROCONT', '00000000-0000-4000-8000-0000000001c1'), pending('00000000-0000-4000-8000-000000008802', PROCONT, 'Solicitud ARAPA', '00000000-0000-4000-8000-0000000001c2')]))
  await staff(page)
  await page.getByRole('button', { name: /^Requests/ }).click()
  const openModal = async title => {
    const card = page.locator('.request-card').filter({ hasText: title })
    await card.getByRole('button', { name: /Aprobar/ }).click()
    await page.locator('#validation-code').waitFor()
  }
  await openModal('Solicitud PROCONT')
  assert.equal(await page.locator('#validation-area').count(), 1, 'PROCONT muestra el selector de área')
  assert.deepEqual(await page.$$eval('#validation-area option', o => o.map(x => x.textContent)), ['Selecciona un área', 'CONTABILIDAD', 'LEGAL'])
  if (M17_SHOTS) {
    await captureM17(page, 'm17-procont-area.png')
  }
  await page.getByRole('dialog').getByRole('button', { name: 'Cerrar', exact: true }).first().click()
  await page.getByRole('dialog').waitFor({ state: 'detached' })
  await openModal('Solicitud ARAPA')
  assert.equal(await page.locator('#validation-area').count(), 0, 'otro código dentro del mismo estudio no muestra áreas')
  await page.getByText('Área y subárea solo aplican al código PROCONT.').waitFor()
  if (M17_SHOTS) await captureM17(page, 'm17-arapa-no-area.png')
  await page.context().close()
})

for (const theme of ['light', 'dark']) {
  test(`[${theme}] Boards: prioridades con relleno y acento propios; Bajo en contorno; el filtro marca su color`, async () => {
    const page = await open(theme)
    await staff(page)
    await page.getByRole('button', { name: /^Boards/ }).click()
    await page.locator('.project-card').first().waitFor()
    const badge = p => page.locator(`.project-card[data-priority="${p}"] [title="Prioridad definitiva asignada por el personal"]`).first()
    const medium = await bg(badge('medium')), high = await bg(badge('high')), low = await bg(badge('low'))
    assert.equal(new Set([medium, high, low]).size, 3, 'tres prioridades distintas')
    assert.equal(high, 'rgb(238, 187, 49)', 'Alto = dorado Procont')
    const topWidth = p => page.locator(`.project-card[data-priority="${p}"]`).first().evaluate(el => getComputedStyle(el).borderTopWidth)
    assert.equal(await topWidth('medium'), '3px'); assert.equal(await topWidth('high'), '3px'); assert.equal(await topWidth('low'), '1px')
    // Prioridad ≠ estado: el azul de «Medio» (relleno) no es el tinte de «Trabajo en proceso».
    assert.notEqual(medium, theme === 'light' ? 'rgb(219, 234, 254)' : 'rgb(23, 43, 92)')
    await page.locator('label').filter({ hasText: 'Prioridad' }).locator('select').first().selectOption('high')
    assert.match(await page.locator('select.prio-filter-high').evaluate(el => getComputedStyle(el).boxShadow), /238, 187, 49/)
    assert.deepEqual(page.errors, [])
    await page.context().close()
  })

  test(`[${theme}] Color personal: el responsable elige su color, persiste, aplica a Kanban y Tabla y no tapa prioridad`, async () => {
    const page = await open(theme)
    await staff(page, 'developer@simulado.invalid')
    await page.getByRole('button', { name: /^Boards/ }).click()
    await page.locator('.project-card').first().waitFor()
    await page.getByRole('button', { name: 'Mi color de tarjeta' }).click()
    const panel = page.getByRole('dialog', { name: 'Mi color de tarjeta' })
    const originalPalette = theme === 'light'
      ? { azul: 'rgb(30, 58, 138)', celeste: 'rgb(96, 165, 250)', dorado: 'rgb(238, 187, 49)', ambar: 'rgb(161, 98, 7)', grafito: 'rgb(55, 65, 81)', pizarra: 'rgb(148, 163, 184)' }
      : { azul: 'rgb(59, 130, 246)', celeste: 'rgb(147, 197, 253)', dorado: 'rgb(238, 187, 49)', ambar: 'rgb(202, 138, 4)', grafito: 'rgb(203, 213, 225)', pizarra: 'rgb(100, 116, 139)' }
    for (const [id, color] of Object.entries(originalPalette)) {
      assert.equal(await panel.locator(`.owner-swatch.owner-${id}`).first().evaluate(el => getComputedStyle(el).backgroundColor), color, `${theme}: color aprobado original ${id}`)
    }
    await panel.getByRole('radio', { name: 'Ámbar', exact: true }).click()
    await new Promise(resolve => setTimeout(resolve, 500))
    assert.equal(await panel.locator('.owner-preview.owner-ambar').count(), 1, 'vista previa')
    const card = page.locator('.project-card.has-owner').first()
    await card.waitFor()
    assert.match(await card.evaluate(el => getComputedStyle(el).boxShadow), /inset/, 'franja lateral')
    assert.equal(await card.evaluate(el => getComputedStyle(el).borderTopWidth), '3px', 'la prioridad conserva su acento')
    assert.equal(await page.evaluate(() => localStorage.getItem('ticketera-owner-colors')), null, 'Supabase es la fuente de verdad; no se persiste en localStorage')
    assert.ok(fixture.log.some(item => item.path.endsWith('/rpc/set_my_internal_card_color') && JSON.parse(item.body).p_color_id === 'ambar'), 'la preferencia se guardó mediante la RPC autenticada')
    await page.keyboard.press('Escape')
    await page.reload(); await page.locator('nav[aria-label="Secciones"]').waitFor()
    await page.getByRole('button', { name: /^Boards/ }).click()
    await page.locator('.project-card.has-owner.owner-ambar').first().waitFor()
    await page.getByRole('button', { name: /Tabla/ }).click()
    await page.locator('.data-view td.has-owner.owner-ambar').first().waitFor()
    const otherPage = await open(theme)
    await staff(otherPage, 'admin@simulado.invalid')
    await otherPage.getByRole('button', { name: /^Boards/ }).click()
    await otherPage.locator('.project-card').first().waitFor()
    const picker = otherPage.getByRole('button', { name: 'Mi color de tarjeta' })
    await picker.waitFor()
    await picker.click()
    const dialog = otherPage.getByRole('dialog', { name: 'Mi color de tarjeta' })
    await dialog.waitFor()
    const assigned = dialog.getByRole('radio', { name: /^Ámbar \(asignado/ })
    assert.equal(await assigned.isDisabled(), true, 'el resto del equipo ve el color compartido como no disponible')
    await otherPage.context().close()
    await page.context().close()
  })
}

test('Color personal: el espacio del cliente no ofrece el selector', async () => {
  const page = await open('light', '/cliente')
  await page.getByRole('button', { name: /Ingreso con usuario/ }).click()
  await page.fill('#client-ruc', MOCK_RUC); await page.fill('#client-username', 'ana'); await page.fill('#client-password', MOCK_PASSWORD)
  await page.locator('form[aria-label^="Ingreso con"] button[type=submit]').click()
  await page.waitForURL('**/cliente/nuevo')
  assert.equal(await page.getByRole('button', { name: 'Mi color de tarjeta' }).count(), 0)
  await page.getByRole('link', { name: /Mis tickets/ }).first().click()
  assert.equal(await page.getByRole('button', { name: 'Mi color de tarjeta' }).count(), 0)
  await page.context().close()
})

test('Kanban: el filtro de área solo aplica a PROCONT y se limpia al cambiar a otro estudio', async () => {
  const page = await open()
  await staff(page)
  await page.getByRole('button', { name: /^Boards/ }).click()
  await page.locator('.project-card').first().waitFor()
  const boardArea = page.getByLabel('Área · código interno PROCONT')
  await boardArea.waitFor()
  await boardArea.selectOption('Contabilidad')
  const studio = page.locator('label').filter({ hasText: /^Estudio/ }).locator('select')
  await studio.selectOption(OTHER)
  assert.equal(await page.locator('label').filter({ hasText: /^Área/ }).count(), 0, 'otro estudio: sin filtro de área')
  await studio.selectOption(PROCONT)
  const areaSelect = page.getByLabel('Área · código interno PROCONT')
  assert.equal(await areaSelect.inputValue(), 'all', 'la selección anterior se limpió')
  await page.context().close()
})

test('Dashboard: sin «Por Tipo»; secciones con datos reales; áreas solo PROCONT; urgencias compactas por prioridad solicitada', async () => {
  const page = await open('light', '/portal', { width: 1440, height: 900 })
  const month = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit' }).format(new Date())
  await page.route(`${fixture.url}/rest/v1/requests?**`, route => {
    const url = route.request().url()
    if (url.includes('requested_priority=eq.urgent')) return send(route, [
      { requester_name: 'Solicitante urgente ficticio', studio_id: PROCONT, created_at: `${month}-10T15:00:00.000Z`, requested_priority: 'urgent' },
      { requester_name: 'Solicitante urgente ficticio', studio_id: PROCONT, created_at: `${month}-11T15:00:00.000Z`, requested_priority: 'urgent' }])
    return route.fallback()
  })
  await staff(page)
  await page.getByRole('heading', { name: 'Solicitudes', level: 2, exact: true }).waitFor()
  for (const text of ['Por Tipo', 'Administrative', 'Dual', 'Estado de proyectos']) assert.equal(await page.getByText(text, { exact: true }).count(), 0, `sin «${text}»`)
  for (const h of ['Solicitudes', 'Trabajo', 'Tiempos', 'Prioridad del trabajo en ejecución', 'Carga del equipo', 'Urgencias solicitadas']) await page.getByRole('heading', { name: h, level: 2, exact: true }).waitFor()
  // Cifras de los fixtures: 2 recibidas, 0 en revisión, 1 aprobada, 1 rechazada; 8 en ejecución, 1 bloqueado.
  const kpi = label => page.locator('.stat-card').filter({ hasText: label }).locator('.stat-value')
  assert.deepEqual([await kpi('Recibidas').innerText(), await kpi('En revisión').innerText(), await kpi('Aprobadas').innerText(), await kpi('Rechazadas').innerText()], ['2', '0', '1', '1'])
  assert.deepEqual([await kpi('En ejecución').innerText(), await kpi('Bloqueados').innerText()], ['8', '1'])
  assert.match(await kpi('Bloqueados').getAttribute('class'), /is-alert/)
  // Urgencias: lista por prioridad solicitada; el histórico va aparte y no se suma.
  const urgency = page.locator('section.urgency-panel')
  await urgency.getByText('Solicitante urgente ficticio').waitFor()
  assert.equal(await urgency.locator('.urgency-count').first().innerText(), '2')
  await urgency.getByText(/Histórico · casilla anterior/).waitFor()
  const box = await urgency.boundingBox()
  assert.ok(box.height < 420, `bloque compacto: ${box.height}px`)
  // Áreas: todos los estudios → «solo estudio PROCONT»; otro estudio → «No aplica»; PROCONT → filtro de área.
  await page.getByRole('heading', { name: 'Áreas · código PROCONT' }).waitFor()
  const studio = page.locator('.dashboard-toolbar label').filter({ hasText: 'Estudio' }).locator('select')
  await studio.selectOption(OTHER)
  await page.getByText('No aplica: las áreas solo se usan con el código interno PROCONT.').waitFor()
  assert.equal(await page.locator('.dashboard-toolbar label').filter({ hasText: /^Área/ }).count(), 0)
  await studio.selectOption(PROCONT)
  const area = page.locator('.dashboard-toolbar label').filter({ hasText: /^Área/ }).locator('select')
  assert.deepEqual(await area.locator('option').allTextContents(), ['Todas las áreas', 'CONTABILIDAD', 'LEGAL'])
  await area.selectOption({ label: 'LEGAL' })
  await studio.selectOption(OTHER)
  assert.equal(await page.locator('.dashboard-toolbar label').filter({ hasText: /^Área/ }).count(), 0, 'cambiar de estudio limpia y oculta el área')
  assert.deepEqual(page.errors, [])
  await page.context().close()
})
