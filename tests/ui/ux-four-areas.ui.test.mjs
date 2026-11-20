// Chromium real + React real; todos los servicios y datos son simulados localmente.
import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createServer as createViteServer, preview } from 'vite'
import { chromium } from 'playwright-core'
import { startFixtureServer, STAFF, SIMULATED_PASSWORD } from './fixture-server.mjs'
import { installVisualFixtures, PHASES } from './ux-fixtures.mjs'
import { MOCK_RUC, MOCK_PASSWORD } from '../../src/dev/client-portal-mock.ts'
import { observeScripts } from './bundle-probe.mjs'
import * as XLSX from 'xlsx' // solo Node: genera el archivo ficticio para probar el parser del navegador.

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SHOTS = process.env.UI_UX_SCREENSHOTS
const BUILD_DIR = process.env.UI_UX_BUILD_DIR
const EVIDENCE = process.env.UI_UX_EVIDENCE
const SIZES = { desktop: { width: 1440, height: 900 }, laptop: { width: 1366, height: 768 }, tablet: { width: 768, height: 1024 }, movil: { width: 390, height: 844 } }
let fixture, vite, browser, base
const network = []
const captures = []
const bundleMeasures = []
let galleryVersion
const sha256 = data => createHash('sha256').update(data).digest('hex')
const sourceDigest = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
  ? sourceDigest(`${dir}/${entry.name}`)
  : [{ path: `${dir}/${entry.name}`.slice(ROOT.length), sha256: sha256(readFileSync(`${dir}/${entry.name}`)) }])
let builtSources
before(async () => {
  fixture = await startFixtureServer()
  const settings = { VITE_SUPABASE_URL: fixture.url, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_simulada_solo_pruebas', VITE_CLIENT_PORTAL_MOCK: BUILD_DIR ? '0' : '1', VITE_CLIENT_LOGIN_ENABLED: '1' }
  if (BUILD_DIR) {
    builtSources = sourceDigest(`${ROOT}/src`)
    const built = spawnSync('npm', ['run', 'build', '--', '--outDir', BUILD_DIR, '--manifest'], { cwd: ROOT, env: { ...process.env, ...settings }, encoding: 'utf8' })
    if (EVIDENCE) { mkdirSync(EVIDENCE, { recursive: true }); writeFileSync(`${EVIDENCE}/build.log`, built.stdout + built.stderr) }
    assert.equal(built.status, 0, built.stdout + built.stderr)
    vite = await preview({ root: ROOT, logLevel: 'error', build: { outDir: BUILD_DIR }, preview: { host: '127.0.0.1', port: 0 } })
  } else {
    Object.assign(process.env, settings)
    vite = await createViteServer({ root: ROOT, logLevel: 'error', server: { host: '127.0.0.1', port: 0, hmr: false } })
    await vite.listen()
  }
  base = `http://127.0.0.1:${vite.httpServer.address().port}`
  for (const name of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_CLIENT_PORTAL_MOCK', 'VITE_CLIENT_LOGIN_ENABLED']) delete process.env[name]
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || undefined })
  if (SHOTS) mkdirSync(SHOTS, { recursive: true })
})
after(async () => {
  await browser?.close(); await vite?.close(); await fixture?.close()
  assert.deepEqual(network, [], 'ninguna solicitud externa')
  if (EVIDENCE && BUILD_DIR) {
    const assets = readdirSync(`${BUILD_DIR}/assets`).filter(n => /\.(js|css)$/.test(n)).map(name => {
      const data = readFileSync(`${BUILD_DIR}/assets/${name}`)
      return { name, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') }
    })
    assert.deepEqual(sourceDigest(`${ROOT}/src`), builtSources, 'código fuente sin cambios durante el build y las capturas')
    writeFileSync(`${EVIDENCE}/gallery-manifest.json`, JSON.stringify({ version: galleryVersion, buildDir: BUILD_DIR, buildMode: 'production', sources: builtSources, assets, captures, externalRequests: network }, null, 2) + '\n')
    writeFileSync(`${EVIDENCE}/browser-bundle.json`, JSON.stringify({ metric: 'Taste: sum Script Network.dataReceived.dataLength || encodedDataLength; cache disabled; after scroll/idle', limitsKiB: { warn: 450, fail: 900 }, measures: bundleMeasures }, null, 2) + '\n')
  }
})
async function open(viewport, observe) {
  const context = await browser.newContext({ viewport, locale: 'es-PE', hasTouch: viewport.width <= 768, isMobile: viewport.width === 390 })
  await context.route('**/*', route => {
    const u = new URL(route.request().url())
    if (['127.0.0.1', 'localhost'].includes(u.hostname) || ['data:', 'blob:'].includes(u.protocol)) return route.continue()
    network.push(u.origin); return route.abort()
  })
  const page = await context.newPage(); page.errors = []
  if (BUILD_DIR) await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const note = document.createElement('aside')
      note.setAttribute('aria-label', 'Datos ficticios de prueba')
      note.textContent = 'ENTORNO LOCAL · DATOS FICTICIOS · servicios simulados'
      note.style.cssText = 'background:#b91c1c;color:#fff;text-align:center;padding:6px 12px;font:13px sans-serif'
      document.body.prepend(note)
    })
  })
  page.on('pageerror', error => page.errors.push(error.message))
  if (observe) await observe(page)
  await installVisualFixtures(page, fixture.url)
  await page.goto(base + '/portal')
  return page
}
async function capture(page, name) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(80)
  const overflow = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }))
  assert.ok(overflow.content <= page.viewportSize().width + 1 && overflow.width <= page.viewportSize().width + 1, `${name}: overflow ${JSON.stringify(overflow)}`)
  const unnamed = await page.locator('button:visible').evaluateAll(nodes => nodes.filter(el => ![el.textContent, el.getAttribute('aria-label'), el.getAttribute('title')].some(v => v?.trim())).length)
  assert.equal(unnamed, 0, `${name}: botones identificados`)
  assert.deepEqual(page.errors, [], `${name}: sin errores React`)
  const footer = page.getByTestId('build-version')
  const version = (await footer.innerText()).trim()
  assert.match(version, /^Versión \d{12}$/)
  galleryVersion ??= version
  assert.equal(version, galleryVersion, `${name}: mismo build`)
  // Siempre se conserva el pie real de la aplicación en la captura completa.
  await page.evaluate(() => window.scrollTo(0, 0))
  const footerRect = await footer.evaluate(el => { const r = el.getBoundingClientRect(); return { top: r.top + scrollY, bottom: r.bottom + scrollY } })
  if (SHOTS) {
    const png = await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true, animations: 'disabled' })
    assert.equal(png.readUInt32BE(16), page.viewportSize().width, `${name}: ancho real de la captura`)
    assert.ok(png.readUInt32BE(20) >= Math.floor(footerRect.bottom), `${name}: el pie nativo queda dentro de la imagen`)
  }
  captures.push({ name, version, viewport: page.viewportSize(), footerRect, sha256: SHOTS ? sha256(readFileSync(`${SHOTS}/${name}.png`)) : null })
}
async function login(page, provider) {
  await page.getByRole('button', { name: provider === 'quipu' ? /Ingreso con usuario/ : /Ingreso empresarial/ }).click()
  await page.fill('#client-ruc', MOCK_RUC)
  if (provider === 'quipu') await page.fill('#client-username', 'ana')
  await page.fill('#client-password', MOCK_PASSWORD)
  await page.locator('form[aria-label^="Ingreso con"] button[type=submit]').click()
  await page.waitForURL('**/cliente/nuevo'); await page.locator('#ticket-product').waitFor()
}
async function staff(page) {
  await page.goto(base + '/portal')
  await page.getByRole('button', { name: /Ingreso del personal/ }).click()
  await page.fill('#staff-modal-email', 'superadmin@simulado.invalid')
  await page.fill('#staff-modal-password', SIMULATED_PASSWORD)
  await page.getByRole('button', { name: 'Ingresar al sistema' }).click()
  await page.locator('nav[aria-label="Secciones"]').waitFor()
  await page.getByText('Cycle Time promedio', { exact: true }).waitFor()
}
for (const [size, viewport] of Object.entries(SIZES)) {
  test(`[UX ${size}] carga de ambos ingresos sin cambiar su comportamiento`, { skip: !BUILD_DIR }, async () => {
    for (const provider of ['quipu', 'quipufac']) {
      const page = await open(viewport)
      await page.goto(base + '/cliente')
      await page.getByRole('button', { name: provider === 'quipu' ? /Ingreso con usuario/ : /Ingreso empresarial/ }).click()
      let release
      const pending = new Promise(resolve => { release = resolve })
      const hold = async route => { await pending; await route.fallback() }
      await page.route(`${fixture.url}/functions/v1/client-login`, hold)
      // En modo Vite el simulador vive en el navegador; el estado demorado por HTTP se
      // comprueba contra el build, que utiliza el transporte normal de producción.
      await page.fill('#client-ruc', MOCK_RUC)
      if (provider === 'quipu') await page.fill('#client-username', 'ana')
      await page.fill('#client-password', MOCK_PASSWORD)
      await page.locator('form[aria-label^="Ingreso con"] button[type=submit]').click()
      try {
        await page.getByRole('button', { name: 'Validando…', exact: true }).waitFor()
        assert.equal(await page.locator('#client-password').isDisabled(), true)
        await capture(page, `${size}-17-${provider}-cargando`)
      } finally { release() }
      await page.waitForURL('**/cliente/nuevo'); await page.locator('#ticket-product').waitFor()
      await page.context().close()
    }
  })
  test(`[UX ${size}] portal, proveedores y accesibilidad de ingreso`, async () => {
    const page = await open(viewport)
    await capture(page, `${size}-01-portal`)
    await page.keyboard.press('Tab')
    assert.equal(await page.locator(':focus').textContent(), 'Saltar al contenido')
    await page.keyboard.press('Enter')
    assert.equal(await page.locator(':focus').getAttribute('id'), 'main-content')
    await page.getByRole('button', { name: /Ingreso del personal/ }).click()
    assert.equal(await page.getByRole('dialog').count(), 1)
    await capture(page, `${size}-02-modal-personal`)
    await page.keyboard.press('Escape')
    assert.equal(await page.getByRole('dialog').count(), 0)
    assert.match(await page.locator(':focus').textContent(), /Ingreso del personal/)
    await page.getByRole('button', { name: /Nueva Solicitud/ }).click()
    for (const provider of ['quipu', 'quipufac']) {
      await page.getByRole('button', { name: provider === 'quipu' ? /Ingreso con usuario/ : /Ingreso empresarial/ }).click()
      await capture(page, `${size}-03-${provider}-normal`)
      await page.fill('#client-password', 'solo-presentacion-local')
      await page.getByRole('button', { name: 'Mostrar contraseña', exact: true }).click()
      assert.equal(await page.locator('#client-password').getAttribute('type'), 'text')
      assert.equal(await page.locator('#client-password').inputValue(), 'solo-presentacion-local')
      await page.getByRole('button', { name: 'Ocultar contraseña', exact: true }).click()
      assert.equal(await page.locator('#client-password').getAttribute('type'), 'password')
      await page.locator('form[aria-label^="Ingreso con"] button[type=submit]').click()
      assert.equal(await page.locator('#client-ruc').getAttribute('aria-invalid'), 'true')
      await capture(page, `${size}-03-${provider}-validacion`)
      await page.getByRole('button', { name: /Cambiar tipo/ }).click()
    }
    await page.context().close()
  })
  test(`[UX ${size}] nuevo ticket, adjuntos, lista privada, detalle y seguimiento`, async () => {
    const page = await open(viewport)
    await page.goto(base + '/cliente'); await login(page, 'quipu')
    await page.locator('input[type=file]').setInputFiles({ name: 'documento-ficticio.pdf', mimeType: 'application/pdf', buffer: Buffer.from('datos ficticios locales') })
    await page.getByRole('button', { name: 'Quitar documento-ficticio.pdf' }).waitFor()
    await capture(page, `${size}-04-nuevo-ticket-adjunto`)
    await page.getByRole('button', { name: 'Quitar documento-ficticio.pdf' }).click()
    assert.equal(await page.getByText('documento-ficticio.pdf', { exact: true }).count(), 0)
    await page.getByRole('link', { name: /Mis tickets/ }).click()
    await page.locator('main a:visible', { hasText: 'REQ26-9001' }).first().waitFor()
    await capture(page, `${size}-05-mis-tickets`)
    await page.locator('main a:visible', { hasText: 'REQ26-9001' }).first().click()
    await page.getByText('Descripción', { exact: true }).waitFor()
    await capture(page, `${size}-06-detalle`)
    await page.goto(base + '/tracking'); await page.locator('#tracking-number').fill('REQ26-9201')
    await page.locator('form button[type=submit]').click(); await page.getByText('Trabajo en proceso').first().waitFor()
    await capture(page, `${size}-07-seguimiento-publico`)
    assert.equal(await page.getByText('Descripción', { exact: true }).count(), 0)
    assert.equal(await page.locator('main ol').count(), 0, 'sin recorrido inferido ni historial público')
    const result = await page.getByTestId('public-tracking-result').innerText()
    assert.match(result, /REQ26-9201/); assert.match(result, /Trabajo en proceso/)
    assert.doesNotMatch(result, /Backlog|En revisión|Solicitud recibida|Terminado|Responsable|Descripción/)
    await page.context().close()
  })
  test(`[UX ${size}] panel Enterprise, bandeja, ocho fases y las cuatro vistas`, async () => {
    const page = await open(viewport); await staff(page)
    await capture(page, `${size}-08-dashboard`)
    await page.getByRole('button', { name: /^Requests/ }).click()
    await page.getByText('Ajuste de formato de comprobante', { exact: true }).waitFor()
    await capture(page, `${size}-09-bandeja`)
    await page.getByRole('button', { name: /^Boards/ }).click()
    await page.locator('.board-column').first().waitFor()
    assert.equal(await page.locator('.board-column').count(), 8)
    await capture(page, `${size}-10-kanban`)
    if (viewport.width < 768) assert.equal(await page.getByText('Desliza horizontalmente para ver todas las fases del tablero.').isVisible(), true)
    // Cada columna está completa dentro de una región desplazable; el documento no desborda.
    const titles = await page.locator('.board-column-header h2').allTextContents()
    assert.deepEqual(titles.map(t => t.replace(/^[^A-Za-z]+/u, '').trim()), ['Backlog', 'Analysis', 'Design', 'Development', 'Code Review', 'Testing', 'Deploy', 'Done'])
    await page.locator('.kanban-scroll').evaluate(el => { el.scrollLeft = el.scrollWidth })
    await capture(page, `${size}-11-kanban-done`)
    for (const [name, screenshot] of [['Tabla', '12-tabla'], ['Gantt', '13-gantt'], ['Roadmap', '14-roadmap']]) {
      await page.getByRole('button', { name: new RegExp(name) }).click()
      await page.waitForTimeout(80)
      await capture(page, `${size}-${screenshot}`)
    }
    await page.getByRole('button', { name: /Kanban/ }).click()
    await page.locator('.kanban-scroll').evaluate(el => { el.scrollLeft = 0 })
    await page.getByText('Revisión del reporte de ventas', { exact: true }).click()
    await page.getByRole('dialog', { name: 'Detalle del ticket' }).waitFor()
    await page.getByText(/42[.,]86%/).first().waitFor()
    const dialog = page.getByRole('dialog', { name: 'Detalle del ticket' })
    for (let i = 0; i < 24; i++) {
      await page.keyboard.press('Tab')
      assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true, 'Tab conserva foco en el modal')
    }
    await capture(page, `${size}-15-modal-ticket`)
    await page.keyboard.press('Escape')
    assert.equal(await page.getByRole('dialog').count(), 0)
    await page.context().close()
  })
}

test('UX motion: hover, pulsación, teclado y reduced-motion no alteran el contenido', async () => {
  const page = await open(SIZES.desktop)
  const card = page.locator('.portal-option').first()
  await card.hover(); await page.waitForTimeout(170)
  assert.match(await card.evaluate(el => getComputedStyle(el).transform), /-2\)/)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForTimeout(100)
  assert.equal(await card.evaluate(el => getComputedStyle(el).transform), 'none')
  await page.keyboard.press('Tab')
  assert.equal(await page.evaluate(() => document.documentElement.dataset.input), 'keyboard')
  assert.equal(await card.evaluate(el => getComputedStyle(el).transitionDuration), '0s')
  assert.equal(await card.isVisible(), true)
  await page.context().close()
})

test('UX Kanban: arrastre real y cancelación no envían una operación de negocio', async () => {
  const page = await open(SIZES.desktop); await staff(page)
  await page.getByRole('button', { name: /^Boards/ }).click()
  const handle = page.locator('[data-rfd-draggable-id]').first()
  await handle.waitFor(); await handle.scrollIntoViewIfNeeded()
  const box = await handle.boundingBox()
  const before = fixture.log.filter(r => r.path.includes('/rpc/operate_board')).length
  await page.mouse.move(box.x + box.width / 2, box.y + 28)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 45, box.y + 48, { steps: 8 })
  await page.waitForTimeout(160)
  assert.notEqual(await handle.evaluate(el => getComputedStyle(el).transform), 'none', 'el arrastre conserva la transformación de DnD')
  await capture(page, 'desktop-16-arrastre')
  await page.keyboard.press('Escape'); await page.mouse.up()
  assert.equal(fixture.log.filter(r => r.path.includes('/rpc/operate_board')).length, before)
  await page.context().close()
})

test('UX métricas: ausencia de registros, contrato no disponible y error son estados distintos', async () => {
  const page = await open(SIZES.desktop); await staff(page)
  await page.getByText(/^Sin datos suficientes para /).waitFor()
  await capture(page, 'desktop-18-metricas-sin-registros')
  const selector = page.locator('section').filter({ has: page.getByText('Solicitudes urgentes por solicitante y estudio', { exact: true }) }).locator('select')
  const months = await selector.locator('option').evaluateAll(o => o.map(v => v.value))
  await page.route(`${fixture.url}/rest/v1/rpc/metrics_monthly_urgency`, route => route.fulfill({ status: 404, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ code: 'PGRST202', message: 'función ficticia no publicada' }) }))
  await selector.selectOption(months[1])
  await page.getByText('Las métricas no están disponibles en este momento.', { exact: true }).waitFor()
  assert.equal(await page.getByText(/^Sin datos suficientes para /).count(), 0)
  await capture(page, 'desktop-19-metricas-no-disponibles')
  await page.route(`${fixture.url}/rest/v1/rpc/metrics_monthly_urgency`, route => route.fulfill({ status: 500, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ code: 'XX000', message: 'fallo ficticio' }) }))
  await selector.selectOption(months[2])
  await page.getByRole('alert').filter({ hasText: 'No se pudieron obtener las métricas del servidor.' }).waitFor()
  await capture(page, 'desktop-20-metricas-error')
  await page.context().close()
})

test('UX seguimiento: cada respuesta pública muestra exclusivamente su número y estado actual', async () => {
  const page = await open(SIZES.desktop)
  await page.goto(base + '/tracking')
  for (const status of ['received', 'in_review', 'approved_backlog', 'in_progress', 'done', 'blocked', 'rejected']) {
    await page.route(`${fixture.url}/rest/v1/rpc/track_request_status`, route => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ request_number: 'REQ26-9201', status }) }))
    await page.fill('#tracking-number', 'REQ26-9201')
    await page.locator('form button[type=submit]').click()
    const result = page.getByTestId('public-tracking-result')
    await result.waitFor()
    assert.equal(await result.locator('span').count(), 1, `${status}: un solo estado`)
    assert.equal(await page.locator('main ol').count(), 0)
    assert.equal(await page.getByText(/Se reanudará automáticamente/).count(), 0)
  }
  await page.context().close()
})

for (const size of ['desktop', 'movil']) {
  test(`[UX ${size}] presupuesto real y carga diferida de vistas internas y Planner`, { skip: !BUILD_DIR }, async () => {
    const manifest = JSON.parse(readFileSync(`${BUILD_DIR}/.vite/manifest.json`, 'utf8'))
    const plannerFile = manifest['src/components/requests/PlannerImportModal.tsx'].file
    const dashboardFile = manifest['src/components/dashboard/DashboardView.tsx'].file
    const boardFile = manifest['src/components/boards/KanbanBoard.tsx'].file
    let probe
    const page = await open(SIZES[size], async page => { probe = await observeScripts(page) })
    const sample = async label => {
      const result = await probe.snapshot(`${size}:${label}`)
      bundleMeasures.push(result)
      assert.notEqual(result.verdict, 'FAIL', `${result.label}: ${result.bytes} bytes JS cargados`)
      assert.ok(result.scripts.every(s => s.status === 200), 'scripts sin errores')
      return result
    }
    const contains = (result, file) => result.scripts.some(s => new URL(s.url).pathname === `/${file}`)
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    const portal = await sample('portal-inicial-tras-scroll')
    for (const deferred of [plannerFile, dashboardFile, boardFile]) assert.equal(contains(portal, deferred), false)
    await page.getByRole('button', { name: /Nueva Solicitud/ }).click()
    await login(page, 'quipu')
    const client = await sample('cliente-autenticado')
    assert.equal(contains(client, plannerFile), false)
    await page.context().close()

    const internal = await open(SIZES[size], async page => { probe = await observeScripts(page) })
    probe.reset() // staff() realiza una navegación completa: medir esa carga, no sumar dos documentos.
    await staff(internal)
    const dashboard = await sample('dashboard')
    assert.equal(contains(dashboard, dashboardFile), true)
    assert.equal(contains(dashboard, boardFile), false)
    assert.equal(contains(dashboard, plannerFile), false)
    await internal.getByRole('button', { name: /^Requests/ }).click()
    const trigger = internal.getByRole('button', { name: /Importar Planner/ })
    await trigger.waitFor()
    const inbox = await sample('bandeja-antes-de-importar')
    assert.equal(contains(inbox, plannerFile), false)
    // Retener el chunk verifica feedback, teclado, cancelación y descarga posterior real.
    let release
    const pending = new Promise(resolve => { release = resolve })
    await internal.route(`**/${plannerFile}`, async route => { await pending; await route.continue() })
    await trigger.click()
    try {
      await internal.getByRole('status').filter({ hasText: 'Cargando importador de Planner…' }).waitFor()
      await capture(internal, `${size}-21-planner-cargando`)
      await internal.keyboard.press('Tab')
      assert.equal(await internal.getByRole('dialog').evaluate(el => el.contains(document.activeElement)), true)
      await internal.keyboard.press('Escape')
      assert.equal(await internal.getByRole('dialog').count(), 0)
      assert.match(await internal.locator(':focus').innerText(), /Importar Planner/)
    } finally { release() }
    await trigger.click()
    await internal.getByRole('dialog', { name: 'Importar desde Planner' }).getByText('Arrastra el Excel aquí', { exact: true }).waitFor()
    await capture(internal, `${size}-22-planner-disponible`)
    const previousCreations = fixture.log.filter(r => /\/rpc\/submit_(classified_)?request$/.test(r.path)).length
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{ 'Task Name': 'Fila ficticia de Planner', 'Created By': 'Persona ficticia', Description: 'Datos locales para comprobar XLSX compilado; no se enviarán.' }]), 'Tasks')
    await internal.locator('input[type=file]').setInputFiles({ name: 'planner-ficticio.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) })
    await internal.getByText('Fila ficticia de Planner', { exact: true }).waitFor()
    assert.equal(fixture.log.filter(r => /\/rpc\/submit_(classified_)?request$/.test(r.path)).length, previousCreations, 'leer Excel no crea solicitudes')
    await capture(internal, `${size}-23-planner-excel-leido`)
    const importing = await sample('importador-abierto')
    assert.equal(contains(importing, plannerFile), true)
    await internal.keyboard.press('Escape')
    await internal.context().close()

    const board = await open(SIZES[size], async page => { probe = await observeScripts(page) })
    probe.reset()
    await staff(board)
    await board.getByRole('button', { name: /^Boards/ }).click()
    await board.locator('.board-column').first().waitFor()
    await board.locator('.kanban-scroll').evaluate(el => { el.scrollLeft = el.scrollWidth })
    const kanban = await sample('kanban')
    assert.equal(contains(kanban, boardFile), true)
    assert.equal(contains(kanban, plannerFile), false)
    const workloadFile = manifest['src/components/admin/WorkloadView.tsx'].file
    let releaseWorkload
    const workloadPending = new Promise(resolve => { releaseWorkload = resolve })
    await board.route(`**/${workloadFile}`, async route => { await workloadPending; await route.continue() })
    await board.getByRole('button', { name: 'Equipo', exact: true }).click()
    try {
      await board.getByRole('status').filter({ hasText: 'Cargando vista…' }).waitFor()
      assert.equal(await board.getByRole('button', { name: 'Carga de Trabajo', exact: true }).isVisible(), true, 'la navegación permanece visible durante la descarga')
      assert.equal(await board.getByRole('button', { name: 'Usuarios', exact: true }).isVisible(), true)
      await capture(board, `${size}-24-equipo-cargando`)
    } finally { releaseWorkload() }
    await board.getByRole('heading', { name: 'Carga de Trabajo del Equipo', exact: true }).waitFor()
    await board.context().close()
  })
}
