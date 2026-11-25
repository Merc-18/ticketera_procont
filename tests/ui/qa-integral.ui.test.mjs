// QA integral 25/11/2026 — recorridos completos con el contrato compartido QA-FICTICIO
// (.agent-artifacts/qa-integral-20261125/shared/QA_FIXTURE_CONTRACT.md → tests/ui/qa-dataset.json).
// Chromium real + React real; REST simulado localmente (no es E2E contra PostgreSQL). Nunca contacta servicios reales.
import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createServer as createViteServer } from 'vite'
import { chromium } from 'playwright-core'
import { startFixtureServer, SIMULATED_PASSWORD } from './fixture-server.mjs'
import { installVisualFixtures } from './ux-fixtures.mjs'
import { installQaFixtures, QA } from './qa-fixtures.mjs'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
// Los IDs relacionales los genera el PostgreSQL desechable y se obtienen del snapshot de esa instancia.
const GESTION = QA.portfolios.find(p => p.name === 'Gestión')?.id
const OPERACIONES = QA.portfolios.find(p => p.name === 'QA-FICTICIO Operaciones')?.id
const BENEF = QA.portfolio_initiatives.find(p => p.name === 'Beneficiarios finales')?.id
const CIERRE = QA.portfolio_initiatives.find(p => p.name === 'QA-FICTICIO Cierre mensual')?.id
const PENDING_FIRST = QA.requests.find(r => r.status === 'pending')
const PENDING_SECOND = QA.requests.find(r => r.status === 'pending' && r.id !== PENDING_FIRST?.id)
assert.ok(GESTION && OPERACIONES && BENEF && CIERRE && PENDING_FIRST && PENDING_SECOND, 'snapshot QA con catálogo y dos solicitudes pendientes requeridos')
const DEVELOPER = '00000000-0000-4000-8000-0000000000c3'
let fixture, vite, browser, base
const external = []

before(async () => {
  fixture = await startFixtureServer()
  Object.assign(process.env, { VITE_SUPABASE_URL: fixture.url, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_simulada_solo_pruebas', VITE_CLIENT_PORTAL_MOCK: '0', VITE_CLIENT_LOGIN_ENABLED: '1' })
  vite = await createViteServer({ root: ROOT, logLevel: 'error', server: { host: '127.0.0.1', port: 0, hmr: false } })
  await vite.listen()
  base = `http://127.0.0.1:${vite.httpServer.address().port}`
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || undefined })
})
after(async () => {
  await browser?.close(); await vite?.close(); await fixture?.close()
  assert.deepEqual(external, [], 'ninguna solicitud externa')
})

async function open({ role = 'superadmin', viewport = { width: 1440, height: 900 }, theme = 'light' } = {}) {
  const context = await browser.newContext({ viewport, locale: 'es-PE' })
  await context.route('**/*', r => {
    const u = new URL(r.request().url())
    if (['127.0.0.1', 'localhost'].includes(u.hostname) || ['data:', 'blob:'].includes(u.protocol)) return r.continue()
    external.push(u.origin); return r.abort()
  })
  await context.addInitScript(t => { try { localStorage.setItem('ticketera-theme', t) } catch {} }, theme)
  const page = await context.newPage(); page.errors = []
  page.on('pageerror', e => page.errors.push(e.message))
  await installVisualFixtures(page, fixture.url)
  page.qa = await installQaFixtures(page, fixture.url)
  await page.goto(base + '/portal')
  await page.getByRole('button', { name: /Acceso del equipo de TI/ }).click()
  await page.fill('#staff-modal-email', `${role}@simulado.invalid`)
  await page.fill('#staff-modal-password', SIMULATED_PASSWORD)
  await page.getByRole('button', { name: 'Ingresar al sistema' }).click()
  await page.locator('nav[aria-label="Secciones"]').waitFor()
  return page
}
const noOverflow = async (page, name) => {
  const o = await page.evaluate(() => ({ w: innerWidth, sw: document.documentElement.scrollWidth }))
  assert.ok(o.sw <= o.w + 1, `${name}: desborde horizontal ${o.sw} > ${o.w}`)
}
async function toBoards(page) {
  await nav(page, 'Boards').click()
  await page.locator('.project-card').first().waitFor()
}
const nav = (page, name) => page.locator('nav[aria-label="Secciones"]').getByRole('button', { name: new RegExp(`^${name}`) })
const card = (page, title) => page.locator('.project-card').filter({ hasText: `QA-FICTICIO ${title}` }).first()

test('Dashboard: sin filtros de Estudio/Área, Tickets por estudio global, Equipo y Exportar secundario', async () => {
  const page = await open()
  await page.locator('.stat-card').first().waitFor()
  const labels = await page.locator('main label').allInnerTexts()
  assert.ok(!labels.some(l => /^\s*(Estudio|Área)\s*$/.test(l)), `sin filtros: ${labels}`)
  const studios = page.getByRole('region', { name: 'Tickets por estudio' }).or(page.locator('section', { hasText: 'Tickets por estudio' })).first()
  await studios.getByText(String(QA.requests.length), { exact: true }).waitFor()   // total dinámico de solicitudes del snapshot
  await page.getByRole('button', { name: /Exportar/ }).click()
  const menu = page.getByRole('menu', { name: 'Exportar' })
  assert.deepEqual((await menu.getByRole('menuitem').allInnerTexts()).map(t => t.split('\n')[0].trim()), ['Activos CSV', 'Completados CSV'])
  await page.keyboard.press('Escape')
  assert.equal(await menu.count(), 0)
  await page.locator('.dashboard-team-entry').click()
  await page.getByRole('heading', { name: 'Equipo', level: 1 }).or(page.getByText('Gestión de usuarios y carga de trabajo del equipo').first()).first().waitFor()
  assert.deepEqual(page.errors, [])
  await page.context().close()
})

test('Equipo: carga por responsable con los 5 responsables del contrato y conteos reales', async () => {
  const page = await open()
  await nav(page, 'Equipo').click()
  await page.getByRole('tab', { name: 'Carga de trabajo' }).click()
  const table = page.locator('table.workload-table')
  await table.getByText('QA-FICTICIO Analista Dos').waitFor()   // espera los datos, no solo la tabla
  const rows = await table.locator('tbody > tr:not(.workload-detail)').evaluateAll(trs => trs.map(tr => [...tr.querySelectorAll('th, td')].map(td => td.innerText.trim())))
  const names = rows.map(r => r[0])
  for (const n of ['Admin Simulado', 'Developer Simulado', 'Superadmin Simulado', 'QA-FICTICIO Analista Uno', 'QA-FICTICIO Analista Dos']) assert.ok(names.some(x => x.includes(n)), `${n} en carga`)
  // Asignados = proyectos del snapshot cuyo flujo tiene ese responsable (activos, completados y archivados).
  for (const user of QA.users.filter(u => u.is_active)) {
    const expected = QA.projects.filter(p => ['active', 'completed', 'archived'].includes(p.status) && (p.project_flows ?? []).some(f => f.assigned_to === user.id)).length
    const row = rows.find(r => r[0].split('\n').includes(user.full_name))
    if (!expected) continue
    assert.equal(Number(row[2]), expected, `${user.full_name}: asignados`)
  }
  assert.deepEqual(page.errors, [])
  await page.context().close()
})

test('Equipo › Portafolios: Gestión → Beneficiarios finales, tickets sin proyecto e independientes consultables', async () => {
  const page = await open()
  await nav(page, 'Equipo').click()
  await page.getByRole('tab', { name: 'Portafolios y proyectos' }).click()
  await page.getByRole('button', { name: /Beneficiarios finales/ }).click()
  const benef = page.getByRole('list', { name: 'Tickets de Beneficiarios finales' })
  const expected = QA.projects.filter(p => p.initiative_id === BENEF && p.status !== 'deleted').length
  assert.equal(await benef.locator('li').count(), expected)
  await benef.getByText('QA-FICTICIO Quipu consulta de beneficiarios').waitFor()
  const directCount = QA.projects.filter(p => p.portfolio_id === GESTION && !p.initiative_id && p.status !== 'deleted').length
  if (directCount) {
    await page.getByRole('list', { name: 'Proyectos de Gestión' }).getByRole('button', { name: /Sin proyecto específico/ }).click()
    assert.equal(await page.getByRole('list', { name: /sin proyecto específico/ }).locator('li').count(), directCount)
  }
  const independent = QA.projects.filter(p => !p.portfolio_id && p.status !== 'deleted').length
  await page.getByRole('button', { name: /Tickets independientes/ }).click()
  assert.equal(await page.getByRole('list', { name: 'Tickets independientes' }).locator('li').count(), independent)
  // Gestión: Editar/Desactivar y alta de proyecto solo para administradores.
  await page.getByRole('button', { name: 'Nuevo proyecto en Gestión' }).waitFor()
  assert.deepEqual(page.errors, [])
  await page.context().close()
})

test('Permisos: developer consulta Equipo sin Usuarios ni acciones de catálogo; viewer no ve Equipo', async () => {
  const viewer = await open({ role: 'viewer' })
  await nav(viewer, 'Dashboard').waitFor()
  assert.equal(await nav(viewer, 'Equipo').count(), 0, 'viewer: sin sección Equipo (regla vigente canSeeEquipo)')
  assert.equal(await viewer.locator('.dashboard-team-entry').count(), 0, 'viewer: sin acceso desde Dashboard')
  await viewer.context().close()
  for (const role of ['developer']) {
    const page = await open({ role })
    await nav(page, 'Equipo').click()
    const tabs = (await page.getByRole('tab').allInnerTexts()).map(t => t.trim())
    assert.ok(!tabs.includes('Usuarios'), `${role}: sin Usuarios (${tabs})`)
    assert.ok(tabs.includes('Carga de trabajo') && tabs.includes('Portafolios y proyectos'), `${role}: ${tabs}`)
    await page.getByRole('tab', { name: 'Portafolios y proyectos' }).click()
    await page.getByText('Solo lectura para tu rol.').waitFor()
    assert.equal(await page.getByRole('button', { name: /Nuevo portafolio|Editar|Desactivar|Nuevo proyecto/ }).count(), 0, `${role}: sin gestión`)
    assert.deepEqual(page.errors, [])
    await page.context().close()
  }
})

test('Tarjetas: Portafolio → Proyecto → título, REQ como metadato, sin solicitante ni nombres; Kanban y Tabla coinciden', async () => {
  const page = await open()
  await toBoards(page)
  const cards = await page.locator('.project-card').evaluateAll(els => els.map(el => ({
    order: [...el.querySelectorAll('.card-hierarchy, .card-title')].map(n => n.className.includes('card-title') ? 'title' : 'hierarchy'),
    portfolio: el.querySelector('.card-tag-portfolio')?.textContent?.trim() ?? null,
    project: el.querySelector('.card-tag-project')?.textContent?.trim() ?? null,
    none: !!el.querySelector('.card-tag-none'),
    title: el.querySelector('.card-title')?.textContent?.trim(),
    number: el.querySelector('.card-number')?.textContent?.trim(),
    text: el.innerText,
  })))
  const active = QA.projects.filter(p => p.status === 'active')
  assert.equal(cards.length, active.length)
  for (const c of cards) {
    assert.deepEqual(c.order, ['hierarchy', 'title'], `${c.title}: jerarquía antes del título`)
    const p = active.find(x => (x.project_number ?? 'Interno') === c.number && x.title === c.title)
    assert.ok(p, `tarjeta conocida ${c.title}`)
    const pf = QA.portfolios.find(x => x.id === p.portfolio_id)?.name ?? null
    const ini = QA.portfolio_initiatives.find(x => x.id === p.initiative_id)?.name ?? null
    assert.equal(c.portfolio, pf); assert.equal(c.project, ini); assert.equal(c.none, !pf)
    assert.equal(c.number, p.project_number ?? 'Interno')
    assert.ok(!c.text.includes(p.requests?.requester_name ?? '¬'), `${c.title}: sin solicitante`)
    for (const u of QA.users) assert.ok(!c.text.includes(u.full_name), `${c.title}: sin nombre de persona`)
  }
  // Etiquetas completas, sin recorte: «Beneficiarios finales» no se trunca dentro de la columna.
  const clipped = await page.locator('.card-tag .truncate').evaluateAll(els => els.filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent))
  assert.deepEqual(clipped, [], 'etiquetas de jerarquía sin recorte')
  await page.getByRole('button', { name: /Tabla/ }).click()
  await page.locator('.data-view table').waitFor()
  const rows = await page.locator('.data-view tbody tr').evaluateAll(trs => trs.map(tr => ({
    portfolio: tr.querySelector('.card-tag-portfolio')?.textContent?.replace('Portafolio: ', '').trim() ?? null,
    project: tr.querySelector('.card-tag-project')?.textContent?.replace('Proyecto: ', '').trim() ?? null,
    number: tr.querySelector('.card-number')?.textContent?.trim(), title: tr.querySelector('[title]')?.getAttribute('title') })))
  assert.equal(rows.length, cards.length)
  for (const r of rows) {
    const c = cards.find(x => x.title === r.title && x.number === r.number)
    assert.deepEqual([r.portfolio, r.project, r.number], [c.portfolio, c.project, c.number], `${r.title}: Kanban = Tabla`)
  }
  assert.deepEqual(page.errors, [])
  await page.context().close()
})

test('Progreso: casos de checklist del contrato; sugerencias no cuentan y la fase es posición', async () => {
  const page = await open()
  await toBoards(page)
  const cases = [['Quipu consulta de beneficiarios', null], ['Quipu validación de RUC con guion', '0/3'], ['QuipuFac notas de crédito', '1/3'],
    ['TI pruebas de permisos', '3/3'], ['TI tablero de beneficiarios', '2/4'], ['Histórico con checklist previo', '3/18']]
  for (const [title, expected] of cases) {
    const c = card(page, title)
    const text = await c.innerText()
    if (expected) assert.match(text.replace(/\s+/g, ''), new RegExp(expected.replace('/', '\\/')), `${title}: ${expected}`)
    else assert.doesNotMatch(text, /\d+\/\d+|%/, `${title}: sin contador ni porcentaje`)
  }
  await card(page, 'Quipu consulta de beneficiarios').click()
  const dialog = page.getByRole('dialog', { name: 'Detalle del ticket' })
  await dialog.getByText('Fase actual', { exact: false }).first().waitFor()
  await dialog.getByText('Fase 1 de 8').waitFor()
  assert.equal(await dialog.getByText(/\d+(?:[.,]\d+)?\s?%/).count(), 0, 'la fase no se expresa en porcentaje')
  await dialog.getByText('Sin tareas de checklist agregadas').first().waitFor()
  await dialog.getByRole('tab', { name: /Checklist/ }).click()
  await dialog.getByText('Tareas sugeridas para Backlog').waitFor()
  assert.equal(await dialog.getByText('Sin tareas de checklist agregadas').count(), 1, 'el resumen aparece una sola vez')
  await dialog.getByRole('button', { name: 'Agregar tareas sugeridas (3)' }).waitFor()
  assert.equal(await dialog.locator('.checklist-meter, [role=progressbar]').count(), 0, 'sin barra para checklist vacío')
  assert.equal(await dialog.getByText(/0\s*\/\s*3|0\s?%/).count(), 0, 'sin 0/3 ni 0 %')
  await page.keyboard.press('Escape')
  await card(page, 'TI tablero de beneficiarios').click()
  await dialog.getByText('Fase 2 de 8').waitFor()
  await dialog.getByRole('tab', { name: /Checklist/ }).click()
  await dialog.getByText(/^2 de 4 tareas completadas/).first().waitFor()
  assert.equal(await dialog.getByText(/^2 de 4 tareas completadas/).count(), 1, 'una sola línea de resumen con tareas reales')
  assert.deepEqual(page.errors, [])
  await page.context().close()
})

test('Confirmación: Portafolio → Proyecto dependiente, validación y RPC atómica; también ticket independiente', async () => {
  const page = await open()
  await nav(page, 'Requests').click()
  const pending = page.locator('.request-card').filter({ hasText: PENDING_FIRST.title })
  await pending.getByRole('button', { name: /Aprobar/ }).click()
  const dialog = page.getByRole('dialog')
  await dialog.locator('#validation-code').waitFor()
  await dialog.locator('#validation-code').selectOption({ label: 'ARAPA' })
  await dialog.locator('#validation-responsible').selectOption(DEVELOPER)
  const confirm = dialog.getByRole('button', { name: 'Aceptar y crear trabajo' })
  // Sin elección explícita no se confirma; el proyecto exige portafolio.
  assert.equal(await confirm.isDisabled(), true)
  assert.equal(await dialog.locator('#validation-project').isDisabled(), true, 'proyecto deshabilitado sin portafolio')
  await dialog.getByText(/Portafolio/).first().waitFor()
  await dialog.locator('#validation-portfolio').selectOption(GESTION)
  const projects = await dialog.locator('#validation-project option').evaluateAll(o => o.map(x => x.value).filter(Boolean))
  assert.deepEqual(projects, [BENEF], 'solo proyectos de Gestión')
  assert.ok(!projects.includes(CIERRE))
  await dialog.locator('#validation-project').selectOption(BENEF)
  assert.equal(await confirm.isDisabled(), false)
  await confirm.click()
  await page.waitForTimeout(400)
  const call = page.qa.log.find(l => l.name === 'approve_request_with_portfolio')
  assert.ok(call, 'usa la RPC atómica M20')
  assert.deepEqual(call.args.p_portfolio, { mode: 'portfolio', portfolio_id: GESTION, initiative_id: BENEF })
  assert.equal(page.qa.log.filter(l => l.name === 'set_project_portfolio').length, 0, 'sin segunda escritura separada')

  // Ticket independiente: no envía portafolio ni proyecto.
  await page.keyboard.press('Escape').catch(() => {})
  await page.waitForTimeout(300)
  const other = page.locator('.request-card').filter({ hasText: PENDING_SECOND.title })
  await other.getByRole('button', { name: /Aprobar/ }).click()
  await dialog.locator('#validation-code').waitFor()
  await dialog.locator('#validation-code').selectOption({ index: 1 })
  if (await dialog.locator('#validation-area').count()) await dialog.locator('#validation-area').selectOption({ index: 1 })
  await dialog.locator('#validation-responsible').selectOption(DEVELOPER)
  await dialog.locator('#validation-portfolio').selectOption('independent')
  assert.equal(await dialog.locator('#validation-project').isDisabled(), true)
  await dialog.getByRole('button', { name: 'Aceptar y crear trabajo' }).click()
  await page.waitForTimeout(400)
  const second = page.qa.log.filter(l => l.name === 'approve_request_with_portfolio')[1]
  assert.deepEqual(second?.args.p_portfolio, { mode: 'independent' })
  assert.deepEqual(page.errors, [])
  await page.context().close()
})

test('Nuevo ticket interno: campos agrupados, Portafolio → Proyecto dependiente y payload con IDs del contrato', async () => {
  const page = await open()
  await toBoards(page)
  await page.getByRole('button', { name: /Nuevo ticket/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Nuevo ticket' })
  await dialog.getByText('Interno u operativo').click()
  assert.equal(await dialog.getByText('Solicitante (cliente)').count(), 0, 'sin datos de cliente en modo interno')
  await dialog.locator('#nt-title').fill('QA-FICTICIO Alta interna de prueba')
  await dialog.locator('#nt-description').fill('QA-FICTICIO: verificación local de la jerarquía.')
  await dialog.locator('#nt-assignee').selectOption(DEVELOPER)
  await dialog.locator('#nt-portfolio').selectOption(OPERACIONES)
  assert.deepEqual(await dialog.locator('#nt-project option').evaluateAll(o => o.map(x => x.value).filter(Boolean)), [CIERRE])
  await dialog.locator('#nt-project').selectOption(CIERRE)
  await dialog.getByRole('button', { name: 'Crear ticket' }).click()
  await page.waitForTimeout(500)
  const call = page.qa.log.find(l => l.name === 'create_internal_ticket')
  assert.ok(call, 'crea por la RPC existente')
  assert.equal(call.args.p_payload.mode, 'internal')
  assert.equal(call.args.p_payload.portfolio_id, OPERACIONES)
  assert.equal(call.args.p_payload.initiative_id, CIERRE)
  assert.equal(call.args.p_payload.requester_email, undefined)
  assert.deepEqual(page.errors, [])
  await page.context().close()
})

for (const theme of ['light', 'dark']) {
  test(`[${theme}] Responsive 1920/1440/768/390/360/320: Dashboard, Equipo, Boards, Tabla y Requests sin desborde`, async () => {
    for (const viewport of [{ width: 1920, height: 1080 }, { width: 1440, height: 900 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 360, height: 800 }, { width: 320, height: 700 }]) {
      const page = await open({ viewport, theme })
      const w = viewport.width
      await page.locator('.stat-card').first().waitFor()
      await noOverflow(page, `dashboard ${w}`)
      await nav(page, 'Equipo').click()
      for (const tab of ['Usuarios', 'Carga de trabajo', 'Portafolios y proyectos']) {
        await page.getByRole('tab', { name: tab }).click(); await page.waitForTimeout(250)
        await noOverflow(page, `equipo ${tab} ${w}`)
      }
      // Usuarios: acciones alcanzables (visibles y dentro del viewport) en cualquier ancho.
      await page.getByRole('tab', { name: 'Usuarios' }).click()
      const edit = page.getByRole('button', { name: 'Editar' }).first()
      await edit.waitFor()
      const box = await edit.boundingBox()
      assert.ok(box && box.x >= 0 && box.x + box.width <= w + 1, `Usuarios ${w}: «Editar» alcanzable`)
      await toBoards(page)
      await noOverflow(page, `kanban ${w}`)
      await page.getByRole('button', { name: /Tabla/ }).click(); await page.locator('.data-view table').waitFor()
      await noOverflow(page, `tabla ${w}`)
      await nav(page, 'Requests').click(); await page.locator('.request-card').first().waitFor()
      await noOverflow(page, `requests ${w}`)
      assert.deepEqual(page.errors, [])
      await page.context().close()
    }
  })
}
