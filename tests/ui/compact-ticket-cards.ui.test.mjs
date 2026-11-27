// Chromium/React reales; Auth/REST locales ficticios; toda red externa bloqueada.
import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createServer } from 'vite'
import { chromium } from 'playwright-core'
import { startFixtureServer, SIMULATED_PASSWORD, STAFF } from './fixture-server.mjs'
import { installVisualFixtures } from './ux-fixtures.mjs'
import { kanbanProjects, OWNER_FIXTURE } from './kanban-attachments-fixtures.mjs'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const STAGE = process.env.CARDS_STAGE ?? 'after'
const EVIDENCE = process.env.CARDS_EVIDENCE
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const system = { id: id(9801), name: 'Quipu · Gestión contable y tributaria para empresas del estudio', is_active: true, sort_order: 1 }
const subsystem = { id: id(9802), system_id: system.id, name: 'Escritorio · Reportes consolidados de múltiples establecimientos', is_active: true }
const portfolio = { id: id(9803), name: 'Gestión corporativa · Portafolio conservado exclusivamente en detalle y administración', is_active: true, sort_order: 1 }
const initiative = { id: id(9804), portfolio_id: portfolio.id, name: 'Beneficiarios finales · Identificación y verificación de estructuras empresariales', is_active: true, sort_order: 1 }
STAFF['developer@simulado.invalid'].full_name = 'Ana María Fernández de los Andes · Desarrollo y operaciones'
STAFF['admin@simulado.invalid'].full_name = 'Marco Tupa · Administración y seguimiento de proyectos'
const rows = kanbanProjects.slice(0, 4).map((p, i) => ({
  ...structuredClone(p),
  title: ['Consulta de beneficiarios finales y documentación completa de estructuras empresariales con múltiples establecimientos relacionados', 'Consulta de beneficiarios.', 'Ticket interno sin producto ni proyecto', 'Producto sin subproducto ni proyecto'][i],
  portfolio_id: i < 2 ? portfolio.id : null, initiative_id: i < 2 ? initiative.id : null,
  created_at: i === 2 ? '2026-11-27T05:05:00Z' : '2026-10-01T03:00:00Z', due_date: '2020-01-01',
  is_blocked: i === 0, blocked_reason: i === 0 ? 'Confirmación pendiente del cliente; motivo largo disponible en el detalle.' : null,
  requests: { ...p.requests, system_id: i === 2 ? null : system.id, subsystem_id: i === 0 ? subsystem.id : null,
    requested_subsystem_id: i === 1 ? subsystem.id : null, requester_name: 'Solicitante reservado al detalle', requester_area: 'Área reservada al detalle' },
  project_flows: [{ ...p.project_flows[0], current_phase: 'backlog',
    assigned_to: i === 0 ? STAFF['developer@simulado.invalid'].id : i === 2 ? null : STAFF['admin@simulado.invalid'].id,
    checklist_items: Array.from({ length: i === 0 ? 18 : i === 1 ? 3 : 0 }, (_, n) => ({ id: id(9900 + i * 20 + n), completed: n < 3 })) }],
}))
let fixture, vite, browser, base
const captures = [], measurements = []
const json = (route, data) => route.fulfill({ status: 200, contentType: 'application/json', headers: {
  'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range',
  'Content-Range': `0-${Math.max(0, (Array.isArray(data) ? data.length : 1) - 1)}/${Array.isArray(data) ? data.length : 1}`,
}, body: JSON.stringify(data) })
before(async () => {
  fixture = await startFixtureServer()
  const env = { VITE_SUPABASE_URL: fixture.url, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_simulada_solo_pruebas', VITE_CLIENT_LOGIN_ENABLED: '1', VITE_CLIENT_PORTAL_MOCK: '0' }
  Object.assign(process.env, env)
  vite = await createServer({ root: ROOT, logLevel: 'error', server: { host: '127.0.0.1', port: 0, hmr: false } })
  await vite.listen(); base = `http://127.0.0.1:${vite.httpServer.address().port}`
  for (const k of Object.keys(env)) delete process.env[k]
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE })
})
after(async () => {
  await browser?.close(); await vite?.close(); await fixture?.close()
  if (EVIDENCE) {
    mkdirSync(EVIDENCE, { recursive: true })
    writeFileSync(`${EVIDENCE}/${STAGE}-captures.json`, JSON.stringify({ stage: STAGE, source: STAGE === 'before' ? 'main@40f582de2f314be5f2b46bbaa2f39ecfeb5eaa14' : 'verified compact-card source', environment: 'React/Chromium with local Auth/REST fixtures; not hosted E2E', captures, measurements }, null, 2) + '\n')
  }
})
async function capture(page, name, meta, target = page) {
  if (!EVIDENCE) return
  mkdirSync(`${EVIDENCE}/screenshots`, { recursive: true })
  const file = `${STAGE}-${name}.png`
  const data = await target.screenshot({ path: `${EVIDENCE}/screenshots/${file}`, fullPage: target === page, animations: 'disabled' })
  captures.push({ file, ...meta, viewport: page.viewportSize(), sha256: createHash('sha256').update(data).digest('hex') })
}
async function open(theme, width) {
  const context = await browser.newContext({ viewport: { width, height: width >= 834 ? 1100 : 844 }, locale: 'es-PE' })
  await context.route('**/*', r => ['localhost', '127.0.0.1'].includes(new URL(r.request().url()).hostname) || /^(blob|data):/.test(r.request().url()) ? r.continue() : r.abort())
  await context.addInitScript(t => localStorage.setItem('ticketera-theme', t), theme)
  const page = await context.newPage(); page.errors = []; page.on('pageerror', e => page.errors.push(e.message))
  await page.clock.setFixedTime(new Date())
  await installVisualFixtures(page, fixture.url)
  for (const [path, data] of [['catalog_systems', [system]], ['catalog_subsystems', [subsystem]], ['portfolios', [portfolio]], ['portfolio_initiatives', [initiative]]])
    await page.route(`${fixture.url}/rest/v1/${path}?**`, r => json(r, data))
  await page.route(`${fixture.url}/rest/v1/projects?**`, r => {
    const status = new URL(r.request().url()).searchParams.get('status')?.replace('eq.', '') ?? 'active'
    return json(r, rows.map(p => ({ ...p, status, project_flows: p.project_flows.map(f => ({ ...f, current_phase: status === 'active' ? 'backlog' : 'done' })) })))
  })
  await page.route(`${fixture.url}/rest/v1/rpc/internal_card_colors`, r => json(r, { assignments: OWNER_FIXTURE, colors: [] }))
  await page.route(`${fixture.url}/rest/v1/rpc/get_board_ticket`, r => {
    const p = rows.find(p => p.id === r.request().postDataJSON().p_project_id), f = p.project_flows[0]
    return json(r, { project_id: p.id, request_id: p.request_id, request_number: p.project_number, workflow_version: 2, project_status: 'active', general_status: p.is_blocked ? 'blocked' : 'in_progress', priority: p.priority, is_blocked: p.is_blocked, blocked_reason: p.blocked_reason,
      flows: [{ id: f.id, flow_type: 'development', phase: f.current_phase, phase_index: 0, phase_count: 8, phase_progress_percent: 0, assignee_id: f.assigned_to, checklist_total: f.checklist_items.length, checklist_completed: f.checklist_items.filter(x => x.completed).length, checklist_progress_percent: 0 }], pending_items: [], pending_fingerprint: 'QA' })
  })
  await page.goto(base + '/login'); await page.fill('#email', 'superadmin@simulado.invalid'); await page.fill('#password', SIMULATED_PASSWORD)
  await page.getByRole('button', { name: 'Iniciar Sesión', exact: true }).click()
  await page.locator('nav[aria-label="Secciones"]').waitFor()
  await page.getByRole('button', { name: 'Boards', exact: true }).click()
  await page.locator('.project-card').first().waitFor(); await page.waitForTimeout(200)
  return page
}
async function verifyCards(page, status) {
  const cards = page.locator('.project-card')
  assert.equal(await cards.count(), 4)
  assert.equal(await cards.locator('.card-tag-portfolio,.card-number,.card-area,.card-requester,.card-number-row,.card-tag-sep').count(), 0, 'sin filas, etiquetas ni metadatos del portafolio/número/área')
  assert.ok(!(await cards.allInnerTexts()).join(' ').includes(portfolio.name))
  for (let i = 0; i < rows.length; i++) {
    const card = cards.nth(i), text = await card.innerText()
    assert.equal(await card.locator('.card-title').getAttribute('title'), rows[i].title)
    assert.match(text, i === 0 ? /3\/18/ : i === 1 ? /3\/3/ : /0\/0/)
    assert.ok(!text.includes('Solicitante reservado al detalle') && !text.includes('Área reservada al detalle'))
    if (i < 2) {
      assert.equal(await card.locator('.card-project-line').getAttribute('title'), initiative.name)
      assert.equal(await card.locator('.card-product-line').getAttribute('title'), `${system.name} · ${subsystem.name}`)
      assert.equal(await card.locator('.card-owner-name').getAttribute('title'), STAFF[i === 0 ? 'developer@simulado.invalid' : 'admin@simulado.invalid'].full_name)
    } else {
      assert.match(text, /Sin subproducto/); assert.match(text, /Sin proyecto específico/)
      if (i === 2) { assert.match(text, /Sin producto/); assert.match(text, /Sin responsable/) }
      else assert.ok(text.includes(system.name))
    }
    if (i === 0) assert.equal(await card.locator('.card-blocked').getAttribute('title'), rows[0].blocked_reason)
  }
  const issues = await cards.evaluateAll(els => els.flatMap(card => {
    const result = [], bounds = card.getBoundingClientRect()
    if (bounds.height > 225) result.push(`height ${bounds.height}`)
    const sections = [...card.querySelectorAll('.card-title-row,.card-hierarchy,.card-status-row,.project-card-footer')].map(e => e.getBoundingClientRect())
    const footer = [...card.querySelectorAll('.card-progress,.card-owner,.assign-toggle')].map(e => e.getBoundingClientRect())
    const overlaps = (a, b) => Math.min(a.right,b.right)-Math.max(a.left,b.left)>1 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1
    for (let i=0;i<sections.length;i++) for (let j=i+1;j<sections.length;j++) if (overlaps(sections[i],sections[j])) result.push('section overlap')
    if (overlaps(footer[0],footer[1])) result.push('checklist/owner overlap')
    const ownerParts = [...card.querySelectorAll('.card-assignee > *, .card-unassigned, .assign-toggle')].map(e => e.getBoundingClientRect())
    for (let i=0;i<ownerParts.length;i++) for (let j=i+1;j<ownerParts.length;j++) if (overlaps(ownerParts[i],ownerParts[j])) result.push('owner/control overlap')
    for (const e of card.querySelectorAll('.card-title-row,.card-hierarchy,.card-status-row,.card-progress,.card-owner,.assign-toggle')) {
      const r=e.getBoundingClientRect(); if (r.left<bounds.left||r.right>bounds.right+1) result.push(`bounds ${e.className}`)
    }
    for (const e of card.querySelectorAll('.card-select,.assign-toggle')) {const r=e.getBoundingClientRect(); if(r.width<44||r.height<44)result.push('control <44px')}
    for (const e of card.querySelectorAll('.card-product-line .card-tag-product,.card-product-line .card-tag-subproduct')) if (e.getBoundingClientRect().width < 32) result.push('hidden product/subproduct')
    if (card.querySelector('.card-product-line > span[aria-hidden]').getBoundingClientRect().width < 1) result.push('hidden separator')
    const title=card.querySelector('.card-title-text'); if(title.getBoundingClientRect().height>42.1)result.push('title >2 lines')
    for(const e of card.querySelectorAll('.card-product-line,.card-project-line')) {if(e.getBoundingClientRect().height>20.1||getComputedStyle(e).textOverflow!=='ellipsis') result.push('hierarchy not single-line ellipsis')}
    return result
  }))
  assert.deepEqual(issues, [], status)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false)
}
for (const theme of ['light', 'dark']) for (const width of [320, 390, 834, 1440]) test(`${STAGE} compact cards ${theme} ${width}px: active, completed, archived`, async () => {
  const page = await open(theme, width)
  try {
    for (const [label, status] of [['Activos', 'active'], ['Completados', 'completed'], ['Archivados', 'archived']]) {
      if (status !== 'active') { await page.getByRole('button', { name: label, exact: true }).click(); await page.locator('.project-list-card').first().waitFor() }
      if (STAGE !== 'before') await verifyCards(page, status)
      measurements.push({ theme, width, status, heights: await page.locator('.project-card').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().height * 100) / 100)) })
      if (status === 'active' || theme === 'light' && width === 390) await capture(page, `${theme}-${width}-${status}`, { theme, width, status })
      if (theme === 'light' && width === 1440 && status === 'active') await capture(page, 'card-detail', { theme, width, status }, page.locator('.project-card').first())
      if (STAGE !== 'before' && status === 'active') {
        const toggle = page.locator('.project-card').first().getByRole('button', { name: 'Asignar responsable', exact: true })
        await toggle.click(); const menu = page.locator('.assign-menu'); await menu.waitFor()
        const b = await menu.boundingBox(); assert.ok(b.x >= 0 && b.x+b.width <= width+1)
        for (const button of await menu.locator('button').all()) assert.ok((await button.boundingBox()).height >= 44)
        await toggle.click()
      }
    }
    assert.deepEqual(page.errors, [])
  } finally { await page.context().close() }
})
if (STAGE !== 'before') test('Full metadata stays in detail: portfolio, project, INT/REQ, requester, area and administrative controls', async () => {
  const page = await open('light', 390)
  try {
    await page.locator('.project-card').first().click()
    const dialog=page.getByRole('dialog'); await dialog.waitFor()
    await dialog.getByText(rows[0].project_number,{exact:true}).waitFor()
    const text=await dialog.innerText()
    for(const value of [portfolio.name,initiative.name,system.name,subsystem.name,rows[0].requests.requester_name,rows[0].requests.requester_area,rows[0].blocked_reason]) assert.ok(text.includes(value),value)
    assert.equal(await dialog.locator('#project-portfolio').inputValue(),portfolio.id)
    assert.equal(await dialog.locator('#project-project').inputValue(),initiative.id)
    await capture(page,'full-ticket-detail',{theme:'light',width:390,view:'full-detail'})
    assert.deepEqual(page.errors,[])
  } finally {await page.context().close()}
})
