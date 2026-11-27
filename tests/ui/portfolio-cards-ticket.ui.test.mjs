// M19: tarjetas (tinte del color personal, avatar, semáforo), Portafolio y alta interna con paridad.
// DATOS FICTICIOS: Supabase sustituido por tests/ui/fixture-server.mjs y rutas locales; sin red externa.
import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createServer as createViteServer } from 'vite'
import { chromium } from 'playwright-core'
import { startFixtureServer, SIMULATED_PASSWORD, STAFF } from './fixture-server.mjs'
import { installVisualFixtures } from './ux-fixtures.mjs'
import { installKanbanFixtures, kanbanProjects, OWNER_FIXTURE } from './kanban-attachments-fixtures.mjs'
import { createBoardState, installBoardFixtures } from './boards-dashboard-fixtures.mjs'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SHOTS = process.env.M19_SHOTS
const STAGE = process.env.M19_STAGE ?? 'despues'
const GESTION = '00000000-0000-4000-8000-0000000000e1', BENEF = '00000000-0000-4000-8000-0000000000e2', OPS = '00000000-0000-4000-8000-0000000000e3'
const PROCONT_STUDIO = '00000000-0000-4000-8000-000000000177', PROCONT_CODE = '00000000-0000-4000-8000-0000000001c1', ARAPA_CODE = '00000000-0000-4000-8000-0000000001c2'
const PORTFOLIOS = [{ id: GESTION, name: 'Gestión', description: null, is_active: true, sort_order: 1 }, { id: OPS, name: 'Operaciones', description: null, is_active: true, sort_order: 2 }]
const INITIATIVES = [{ id: BENEF, portfolio_id: GESTION, name: 'Beneficiarios finales', description: null, is_active: true, sort_order: 1 }]
// Dos tickets del tablero pertenecen a «Gestión · Beneficiarios finales» y uno solo a «Operaciones».
Object.assign(kanbanProjects[5], { portfolio_id: GESTION, initiative_id: BENEF })
Object.assign(kanbanProjects[8], { portfolio_id: GESTION, initiative_id: BENEF })
Object.assign(kanbanProjects[11], { portfolio_id: OPS, initiative_id: null })

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

const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: {
  'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range', 'Content-Range': `0-${Math.max(0, (Array.isArray(body) ? body.length : 1) - 1)}/${Array.isArray(body) ? body.length : 1}` },
  body: JSON.stringify(body) })

async function shot(page, file, meta = {}, target = page) {
  if (!SHOTS) return
  mkdirSync(SHOTS, { recursive: true })
  const png = await target.screenshot({ path: `${SHOTS}/${file}`, animations: 'disabled' })
  const mf = `${SHOTS}/../screenshots-manifest.json`
  const manifest = existsSync(mf) ? JSON.parse(readFileSync(mf, 'utf8')) : { captures: [] }
  manifest.captures = manifest.captures.filter(c => c.file !== file)
  manifest.captures.push({ file, stage: STAGE, ...meta, viewport: page.viewportSize(), sha256: createHash('sha256').update(png).digest('hex') })
  writeFileSync(mf, JSON.stringify(manifest, null, 2) + '\n')
}

async function open({ theme = 'light', viewport = { width: 1440, height: 900 }, email = 'superadmin@simulado.invalid' } = {}) {
  const context = await browser.newContext({ viewport, locale: 'es-PE' })
  await context.route('**/*', route => {
    const u = new URL(route.request().url())
    return ['127.0.0.1', 'localhost'].includes(u.hostname) || ['data:', 'blob:'].includes(u.protocol) ? route.continue() : route.abort()
  })
  await context.addInitScript(t => { try { localStorage.setItem('ticketera-theme', t) } catch {} }, theme)
  const page = await context.newPage()
  page.errors = []; page.on('pageerror', e => page.errors.push(e.message))
  page.rpc = []; page.uploads = []
  await installVisualFixtures(page, fixture.url)
  await installKanbanFixtures(page, fixture.url)
  page.state = createBoardState()
  await installBoardFixtures(page, fixture.url, page.state)
  await page.route(`${fixture.url}/rest/v1/portfolios?**`, route => json(route, PORTFOLIOS))
  await page.route(`${fixture.url}/rest/v1/portfolio_initiatives?**`, route => json(route, INITIATIVES))
  await page.route(`${fixture.url}/rest/v1/rpc/internal_card_colors`, route => json(route, { user_id: null, assignments: OWNER_FIXTURE, colors: [] }))
  for (const name of ['set_project_portfolio', 'save_portfolio', 'save_portfolio_initiative', 'create_internal_ticket', 'reserve_board_evidence']) {
    await page.route(`${fixture.url}/rest/v1/rpc/${name}`, route => {
      const args = route.request().postDataJSON(); page.rpc.push({ name, args })
      if (name === 'create_internal_ticket') return json(route, { project: { ...kanbanProjects[0], id: kanbanProjects[0].id }, request_number: args.p_payload.mode === 'client' ? 'REQ26-9990' : 'INT26-9990', request_id: kanbanProjects[0].request_id })
      if (name === 'reserve_board_evidence') return json(route, { bucket: 'request-attachments', path: `${kanbanProjects[0].request_id}/${args.p_upload_key}-${args.p_file_name}`, size_bytes: args.p_size_bytes, mime_type: args.p_mime_type, expires_at: new Date(Date.now() + 600000).toISOString() })
      if (name === 'set_project_portfolio') return json(route, { project_id: args.p_project_id, portfolio_id: args.p_portfolio_id, initiative_id: args.p_initiative_id })
      return json(route, { id: '00000000-0000-4000-8000-0000000000f9', ...(args.p_payload ?? {}) })
    })
  }
  await page.route(`${fixture.url}/storage/v1/object/request-attachments/**`, route => {
    page.uploads.push(new URL(route.request().url()).pathname)
    return json(route, { Key: 'simulado' })
  })
  await page.goto(base + '/portal')
  await page.getByRole('button', { name: /Acceso del equipo de TI/ }).click()
  await page.fill('#staff-modal-email', email)
  await page.fill('#staff-modal-password', SIMULATED_PASSWORD)
  await page.getByRole('button', { name: 'Ingresar al sistema' }).click()
  await page.locator('nav[aria-label="Secciones"]').waitFor()
  await page.getByRole('button', { name: /^Boards/ }).click()
  await page.locator('.project-card').first().waitFor()
  await page.waitForFunction(() => document.querySelector('.card-hierarchy'))
  return page
}
const css = (loc, prop) => loc.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p).trim(), prop)
const contrast = (page, a, b) => page.evaluate(([f, bg]) => {
  const rgb = c => { const x = document.createElement('canvas').getContext('2d'); x.fillStyle = '#000'; x.fillStyle = c; x.fillRect(0, 0, 1, 1); return [...x.getImageData(0, 0, 1, 1).data].slice(0, 3) }
  const L = ([r, g, b]) => { const t = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4 }; return .2126 * t(r) + .7152 * t(g) + .0722 * t(b) }
  const x = L(rgb(f)), y = L(rgb(bg)); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05)
}, [a, b])

// ─────────────────────────────── TARJETAS ───────────────────────────────
for (const theme of ['light', 'dark']) {
  test(`[${theme}] Tarjeta: fondo con tinte sutil del color personal, avatar con ese color y semáforo de prioridad legible`, async () => {
    const page = await open({ theme })
    const neutral = await css(page.locator('.project-card:not(.has-owner):not(.is-blocked)').first(), 'background-color')
    const owners = [...new Set(Object.values(OWNER_FIXTURE))]
    const tints = []
    for (const color of owners) {
      const card = page.locator(`.project-card.has-owner.owner-${color}:not(.is-blocked)`).first()
      if (!await card.count()) continue
      const bg = await css(card, 'background-color'); tints.push(bg)
      assert.notEqual(bg, neutral, `${color}: tinte distinto del neutro`)
      for (const sel of ['.card-title', '.card-product-line', '.card-project-line', '.card-owner-name']) {
        if (!await card.locator(sel).count()) continue
        const r = await contrast(page, await css(card.locator(sel).first(), 'color'), bg)
        assert.ok(r >= 4.5, `${theme} ${color} ${sel}: ${r.toFixed(2)}:1`)
      }
      const avatar = card.locator('.card-avatar.owner-ring').first()
      const ownerColor = await css(card, '--owner')
      const expected = await page.evaluate(h => { const d = document.createElement('div'); d.style.color = h; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c }, ownerColor)
      assert.equal(await css(avatar, 'background-color'), expected, `${color}: el avatar usa el color personal`)
      assert.equal(await css(avatar, 'outline-color'), expected, `${color}: el aro coincide`)
      const r = await contrast(page, await css(avatar, 'color'), await css(avatar, 'background-color'))
      assert.ok(r >= 4.5, `${theme} ${color} iniciales: ${r.toFixed(2)}:1`)
    }
    assert.equal(new Set(tints).size, tints.length, 'cada responsable tiene su tinte')
    for (const p of ['urgent', 'high', 'medium', 'low']) {
      const b = page.locator(`.project-card[data-priority="${p}"] .card-priority`).first()
      const r = await contrast(page, await css(b, 'color'), await css(b, 'background-color'))
      assert.ok(r >= 4.5, `${theme} prioridad ${p}: ${r.toFixed(2)}:1`)
    }
    await shot(page, `${STAGE}-kanban-tarjetas-${theme}-1440.png`, { theme, view: 'kanban-cards' })
    await page.locator('.board-column[data-stage="build"]').scrollIntoViewIfNeeded()
    await shot(page, `${STAGE}-columna-development-${theme}.png`, { theme, view: 'kanban-column' }, page.locator('.board-column[data-stage="build"]'))
    assert.deepEqual(page.errors, [])
    await page.context().close()
  })
}

// ─────────────────────────────── PORTAFOLIO ───────────────────────────────
test('Portafolio: ausente en tarjeta, filtros administrativos, Tabla y búsqueda conservados', async () => {
  const page = await open()
  const cards = await page.locator('.project-card').evaluateAll(els => els.map(el => ({ portfolio: el.querySelector('.card-tag-portfolio')?.textContent?.trim() ?? null, project: el.querySelector('.card-tag-project')?.textContent?.trim() ?? null })))
  assert.ok(cards.every(x => x.portfolio === null), 'el portafolio no se renderiza en tarjetas')
  assert.ok(cards.some(x => x.project === 'Beneficiarios finales'))
  assert.ok(cards.some(x => x.project === 'Sin proyecto específico'))
  const filter = page.locator('.board-toolbar label').filter({ hasText: /^Portafolio/ }).locator('select')
  await filter.selectOption(`i:${BENEF}`)
  assert.equal(await page.locator('.project-card').count(), 2)
  await filter.selectOption(`p:${OPS}`)
  assert.equal(await page.locator('.project-card').count(), 1)
  await filter.selectOption('')
  assert.equal(await page.locator('.project-card').count(), kanbanProjects.length - 3, 'sin portafolio')
  await filter.selectOption('all')
  await page.locator('.board-toolbar input[type=search], input[type=search]').first().fill('beneficiarios')
  assert.equal(await page.locator('.project-card').count(), 2, 'la búsqueda encuentra por portafolio')
  await page.locator('input[type=search]').first().fill('')
  await page.getByRole('button', { name: /Tabla/ }).click()
  await page.locator('.data-view table').waitFor()   // la vista Tabla se carga en diferido
  const headers = (await page.locator('.data-view thead th').allInnerTexts()).map(t => t.replace(/[↑↓↕]/g, '').trim())
  // 25/11/2026: la Tabla usa la misma jerarquía que la tarjeta en la primera columna (Portafolio → Proyecto → Título).
  assert.ok(headers.includes('Ticket y jerarquía'))
  const row = page.locator('.data-view tbody tr').filter({ hasText: kanbanProjects[5].title })
  const cell = row.locator('td').first()
  assert.equal(await cell.locator('.card-tag-portfolio').textContent(), 'Gestión', 'valor completo en definición Portafolio')
  assert.equal(await cell.locator('.card-tag-project').textContent(), 'Beneficiarios finales')
  assert.deepEqual(page.errors, [])
  await page.context().close()
})

test('Portafolio: el detalle asocia un ticket a una iniciativa con la RPC auditada; el catálogo se gestiona desde «Portafolios»', async () => {
  const page = await open()
  await page.locator('.project-card').filter({ hasText: kanbanProjects[0].title }).click()
  const dialog = page.getByRole('dialog')
  await dialog.locator('#project-portfolio').selectOption(GESTION)
  await dialog.locator('#project-project').selectOption(BENEF)
  await shot(page, `${STAGE}-detalle-portafolio.png`, { theme: 'light', view: 'project-portfolio' }, dialog)
  await dialog.getByRole('button', { name: 'Guardar portafolio' }).click()
  await page.getByText('Portafolio actualizado').waitFor()
  assert.deepEqual(page.rpc.find(r => r.name === 'set_project_portfolio').args, { p_project_id: kanbanProjects[0].id, p_portfolio_id: GESTION, p_initiative_id: BENEF })
  await dialog.getByRole('button', { name: 'Cerrar' }).first().click()
  await page.getByRole('button', { name: /^Equipo/ }).click()
  await page.getByRole('tab', { name: 'Portafolios y proyectos' }).click()
  const manager = page.locator('.portfolio-panel')
  await manager.getByText('Beneficiarios finales').waitFor()
  await shot(page, `${STAGE}-portafolios-gestion.png`, { theme: 'light', view: 'portfolio-manager' }, manager)
  await manager.getByRole('button', { name: 'Nuevo portafolio' }).click()
  await manager.locator('#pf-name').fill('Finanzas')
  await manager.getByRole('button', { name: 'Guardar' }).click()
  await page.getByText('Portafolio creado').waitFor()
  assert.deepEqual(page.rpc.find(r => r.name === 'save_portfolio').args, { p_payload: { name: 'Finanzas', description: null } })
  await page.context().close()
})

test('Portafolio: un developer ve el filtro pero no el botón de gestión del catálogo', async () => {
  const page = await open({ email: 'developer@simulado.invalid' })
  assert.equal(await page.locator('.board-toolbar label').filter({ hasText: /^Portafolio/ }).count(), 1)
  await page.getByRole('button', { name: /^Equipo/ }).click()
  assert.equal(await page.getByRole('tab', { name: 'Portafolios y proyectos' }).count(), 1, 'el catálogo se consulta desde Equipo')
  await page.getByRole('tab', { name: 'Portafolios y proyectos' }).click()
  assert.equal(await page.getByRole('button', { name: 'Nuevo portafolio' }).count(), 0, 'developer consulta, admin gestiona')
  await page.context().close()
})

// ─────────────────────────────── NUEVO TICKET ───────────────────────────────
async function newTicket(page) {
  await page.getByRole('button', { name: /Nuevo ticket/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Nuevo ticket' })
  await dialog.waitFor()
  await dialog.locator('#nt-studio option').nth(1).waitFor({ state: 'attached' })
  return dialog
}

for (const theme of ['light', 'dark']) {
  test(`[${theme}] Nuevo ticket (originado por cliente): campos obligatorios, área solo con código exacto PROCONT, adjunto y payload completo`, async () => {
    const page = await open({ theme })
    const dialog = await newTicket(page)
    await shot(page, `${STAGE}-nuevo-ticket-cliente-${theme}.png`, { theme, view: 'new-ticket-client' }, dialog)
    await dialog.getByRole('button', { name: 'Crear ticket' }).click()
    await dialog.getByRole('alert').getByText(/Completa: Título, Descripción, Responsable principal, Solicitante, Estudio, Código interno, Producto, Tipo de solicitud/).waitFor()
    assert.equal(page.rpc.filter(r => r.name === 'create_internal_ticket').length, 0)
    await dialog.locator('#nt-title').fill('Error al emitir guía ficticia')
    await dialog.locator('#nt-description').fill('Detalle ficticio registrado por TI.')
    await dialog.locator('#nt-requester').fill('Cliente ficticio')
    await dialog.locator('#nt-type').selectOption({ label: 'Mejora' })
    await dialog.locator('#nt-requested-priority').click()
    await page.getByRole('option', { name: 'Urgente' }).click()
    await dialog.locator('#nt-studio').selectOption(PROCONT_STUDIO)
    await dialog.locator('#nt-code').selectOption(PROCONT_CODE)
    await dialog.locator('#nt-area').waitFor()
    await dialog.locator('#nt-system').selectOption({ index: 1 })
    await dialog.locator('#nt-assignee').selectOption(STAFF['developer@simulado.invalid'].id)
    await dialog.locator('#nt-priority').click()
    await page.getByRole('option', { name: 'Alto' }).click()
    await dialog.locator('#nt-phase').selectOption('analysis')
    await dialog.locator('#nt-portfolio').selectOption(GESTION)
    await dialog.locator('#nt-project').selectOption(BENEF)
    await dialog.getByRole('button', { name: 'Crear ticket' }).click()
    await dialog.getByRole('alert').getByText('Completa: Área.').waitFor()
    // Otro código del mismo estudio: el área desaparece y no se envía.
    await dialog.locator('#nt-code').selectOption(ARAPA_CODE)
    await dialog.getByText('Área y subárea solo aplican al código interno PROCONT.').waitFor()
    assert.equal(await dialog.locator('#nt-area').count(), 0)
    await dialog.locator('#ticket-attachments').setInputFiles([{ name: 'captura-ficticia.png', mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a', 'hex') }])
    await dialog.locator('.attachment-file').waitFor()
    await dialog.getByRole('button', { name: 'Crear ticket' }).click()
    await page.getByText('Ticket REQ26-9990 creado con 1 adjunto(s).').waitFor()
    const sent = page.rpc.find(r => r.name === 'create_internal_ticket').args.p_payload
    assert.deepEqual(Object.keys(sent).sort(), ['assigned_dev', 'description', 'initial_phase', 'initiative_id', 'mode', 'portfolio_id', 'priority', 'request_type_id',
      'requested_priority', 'requester_name', 'studio_code_id', 'studio_id', 'system_id', 'title'].sort())
    assert.equal(sent.mode, 'client'); assert.equal(sent.studio_code_id, ARAPA_CODE); assert.equal(sent.requested_priority, 'urgent'); assert.equal(sent.priority, 'high')
    assert.equal(sent.portfolio_id, GESTION); assert.equal(sent.initiative_id, BENEF); assert.equal(sent.initial_phase, 'analysis')
    assert.equal(page.rpc.filter(r => r.name === 'reserve_board_evidence').length, 1)
    assert.equal(page.uploads.length, 1)
    assert.equal(await page.getByRole('dialog', { name: 'Nuevo ticket' }).count(), 0, 'el formulario se cierra')
    assert.deepEqual(page.errors, [])
    await page.context().close()
  })
}

test('Nuevo ticket (interno u operativo): sin datos de cliente; solicitante opcional; payload mínimo correcto', async () => {
  const page = await open()
  const dialog = await newTicket(page)
  await dialog.getByLabel('Interno u operativo').check()
  for (const id of ['#nt-studio', '#nt-code', '#nt-system', '#nt-type', '#nt-requested-priority', '#nt-email']) assert.equal(await dialog.locator(id).count(), 0, id)
  await shot(page, `${STAGE}-nuevo-ticket-interno.png`, { theme: 'light', view: 'new-ticket-internal' }, dialog)
  await dialog.locator('#nt-title').fill('Actualizar certificados del servidor')
  await dialog.locator('#nt-description').fill('Tarea operativa ficticia.')
  await dialog.locator('#nt-assignee').selectOption(STAFF['admin@simulado.invalid'].id)
  await dialog.locator('#nt-portfolio').selectOption('independent')
  await dialog.getByRole('button', { name: 'Crear ticket' }).click()
  await page.getByText('Ticket INT26-9990 creado.').waitFor()
  const sent = page.rpc.find(r => r.name === 'create_internal_ticket').args.p_payload
  assert.deepEqual(sent, { mode: 'internal', title: 'Actualizar certificados del servidor', description: 'Tarea operativa ficticia.', priority: 'medium', assigned_dev: STAFF['admin@simulado.invalid'].id })
  await page.context().close()
})

test('Responsive: barra con Portafolio y formulario «Nuevo ticket» sin desbordes a 1440, 768, 390 y 320', async () => {
  for (const width of [1440, 768, 390, 320]) {
    const page = await open({ viewport: { width, height: width > 800 ? 900 : 844 } })
    let overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    assert.ok(overflow <= 0, `${width}: tablero sin desplazamiento horizontal (${overflow}px)`)
    const dialog = await newTicket(page)
    overflow = await dialog.evaluate(el => el.scrollWidth - el.clientWidth)
    assert.ok(overflow <= 1, `${width}: formulario sin desbordes (${overflow}px)`)
    for (const el of await dialog.locator('select:visible, input:not([type=radio]):not([type=file]):visible, button:visible').all()) {
      const b = await el.boundingBox(); if (b) assert.ok(b.height >= 40, `${width}: control alto ≥ 40px (${b.height})`)
    }
    if (width === 390) await shot(page, `${STAGE}-nuevo-ticket-390.png`, { theme: 'light', view: 'new-ticket-mobile' }, dialog)
    await page.context().close()
  }
})
