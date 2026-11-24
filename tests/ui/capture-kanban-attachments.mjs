// Capturas de evidencia Antes/Después del Kanban y de los adjuntos (24/11/2026).
// Uso: node tests/ui/capture-kanban-attachments.mjs --stage before|after --out <carpeta>
// DATOS FICTICIOS: Supabase sustituido por tests/ui/fixture-server.mjs; sin red externa ni tickets reales;
// los archivos de prueba se crean en memoria dentro del navegador y nunca salen de 127.0.0.1.
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { createServer as createViteServer } from 'vite'
import { chromium } from 'playwright-core'
import { startFixtureServer, SIMULATED_PASSWORD } from './fixture-server.mjs'
import { installVisualFixtures } from './ux-fixtures.mjs'
import { installKanbanFixtures } from './kanban-attachments-fixtures.mjs'
import { MOCK_RUC, MOCK_PASSWORD } from '../../src/dev/client-portal-mock.ts'

const arg = name => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : null }
const STAGE = arg('stage') ?? 'after'
const OUT = arg('out') ?? 'docs/validation/kanban-attachments-20261124/screenshots'
const ROOT = fileURLToPath(new URL('../..', import.meta.url))
mkdirSync(OUT, { recursive: true })
const manifestPath = `${OUT}/../screenshots-manifest.json`
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { captures: [] }
manifest.captures = manifest.captures.filter(c => c.stage !== STAGE)

const fixture = await startFixtureServer()
const settings = { VITE_SUPABASE_URL: fixture.url, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_simulada_solo_pruebas', VITE_CLIENT_PORTAL_MOCK: '0', VITE_CLIENT_LOGIN_ENABLED: '1' }
Object.assign(process.env, settings)
const vite = await createViteServer({ root: ROOT, logLevel: 'error', server: { host: '127.0.0.1', port: 0, hmr: false } })
await vite.listen()
const base = `http://127.0.0.1:${vite.httpServer.address().port}`
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || undefined })

async function open(theme, viewport, path = '/portal') {
  const context = await browser.newContext({ viewport, locale: 'es-PE', deviceScaleFactor: 1 })
  await context.route('**/*', route => {
    const u = new URL(route.request().url())
    return ['127.0.0.1', 'localhost'].includes(u.hostname) || ['data:', 'blob:'].includes(u.protocol) ? route.continue() : route.abort()
  })
  await context.addInitScript(t => { try { localStorage.setItem('ticketera-theme', t) } catch {} }, theme)
  const page = await context.newPage()
  page.errors = []; page.on('pageerror', e => page.errors.push(e.message))
  await installVisualFixtures(page, fixture.url)
  await installKanbanFixtures(page, fixture.url)
  await page.route(`${fixture.url}/storage/v1/object/request-attachments/**`, route => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ Key: 'simulado' }) }))
  await page.goto(base + path)
  return page
}
async function staff(page) {
  await page.getByRole('button', { name: /Acceso del equipo de TI/ }).click()
  await page.fill('#staff-modal-email', 'developer@simulado.invalid')
  await page.fill('#staff-modal-password', SIMULATED_PASSWORD)
  await page.getByRole('button', { name: 'Ingresar al sistema' }).click()
  await page.locator('nav[aria-label="Secciones"]').waitFor()
  await page.getByRole('button', { name: /^Boards/ }).click()
  await page.locator('.project-card').first().waitFor()
  await page.waitForTimeout(400)
}
async function client(theme, viewport) {
  const page = await open(theme, viewport, '/cliente')
  await page.getByRole('button', { name: /Ingreso con usuario/ }).click()
  await page.fill('#client-ruc', MOCK_RUC); await page.fill('#client-username', 'ana'); await page.fill('#client-password', MOCK_PASSWORD)
  await page.locator('form[aria-label^="Ingreso con"] button[type=submit]').click()
  await page.waitForURL('**/cliente/nuevo'); await page.locator('#ticket-product').waitFor()
  return page
}
async function shot(target, file, meta, opts = {}) {
  const page = target.page ? target.page() : target
  const png = await target.screenshot({ path: `${OUT}/${file}`, animations: 'disabled', ...opts })
  manifest.captures.push({ stage: STAGE, file, ...meta, viewport: page.viewportSize(), sha256: createHash('sha256').update(png).digest('hex') })
  console.log('captura', file)
}
const pre = STAGE === 'before' ? 'antes' : 'despues'

for (const theme of ['light', 'dark']) {
  // ── Kanban: tablero completo a 1920, columnas de cerca y tabla ──
  const page = await open(theme, { width: 1920, height: 1080 })
  await staff(page)
  await shot(page, `${pre}-kanban-${theme}-1920.png`, { theme, view: 'kanban' })
  const scroller = page.locator('.kanban-scroll')
  const columns = page.locator('.board-column')
  const names = ['backlog', 'analysis', 'design', 'development', 'code-review', 'testing', 'deploy', 'done']
  for (let i = 0; i < await columns.count(); i++) {
    await columns.nth(i).scrollIntoViewIfNeeded()
    await shot(columns.nth(i), `${pre}-columna-${names[i]}-${theme}.png`, { theme, view: 'column', column: names[i] })
  }
  if (STAGE !== 'before') {
    await columns.nth(3).scrollIntoViewIfNeeded()
    await columns.nth(3).locator('.project-card').nth(1).hover()
    await page.waitForTimeout(250)
    await shot(columns.nth(3), `despues-tarjeta-hover-${theme}.png`, { theme, view: 'card-hover' })
    await page.mouse.move(0, 0)
  }
  await scroller.evaluate(el => { el.scrollLeft = el.scrollWidth })
  await page.waitForTimeout(150)
  await shot(page, `${pre}-kanban-${theme}-1920-columnas-restantes.png`, { theme, view: 'kanban-scrolled' })
  await scroller.evaluate(el => { el.scrollLeft = 0 })
  await page.getByRole('button', { name: /Tabla/ }).click()
  await page.locator('.data-view table').waitFor()
  await shot(page, `${pre}-tabla-${theme}-1920.png`, { theme, view: 'table' })
  await page.context().close()

  // ── Kanban responsive ──
  for (const viewport of [{ width: 1440, height: 900 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 360, height: 780 }, { width: 320, height: 640 }]) {
    const p = await open(theme, viewport)
    await staff(p)
    await shot(p, `${pre}-kanban-${theme}-${viewport.width}.png`, { theme, view: 'kanban-responsive' })
    if (viewport.width < 1000) {
      await p.evaluate(() => document.querySelector('.kanban-scroll').scrollIntoView({ block: 'start' }))
      await p.waitForTimeout(150)
      await shot(p, `${pre}-kanban-${theme}-${viewport.width}-tarjetas.png`, { theme, view: 'kanban-responsive-cards' })
    }
    await p.context().close()
  }

  // ── Formulario: zona de adjuntos vacía ──
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const p = await client(theme, viewport)
    const zone = p.locator('.attachment-picker')
    await zone.scrollIntoViewIfNeeded()
    await shot(zone, `${pre}-adjuntos-vacio-${theme}-${viewport.width}.png`, { theme, view: 'attachments-empty' })
    await p.context().close()
  }
  if (STAGE !== 'before') await captureAttachmentStates(theme)
}

/** Estados de interacción de la zona de adjuntos (solo Después; archivos ficticios creados en el navegador). */
async function captureAttachmentStates(theme) {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 640 }]) {
    const p = await client(theme, viewport)
    const zone = p.locator('.attachment-picker')
    await zone.scrollIntoViewIfNeeded()
    const w = viewport.width
    const make = (specs) => p.evaluateHandle(specs => {
      const dt = new DataTransfer()
      for (const s of specs) {
        let blob
        if (s.png) {
          const c = document.createElement('canvas'); c.width = 320; c.height = 200
          const g = c.getContext('2d'); g.fillStyle = s.png; g.fillRect(0, 0, 320, 200); g.fillStyle = '#F8FAFC'; g.font = '28px sans-serif'; g.fillText('Captura ficticia', 60, 110)
          const bin = atob(c.toDataURL('image/png').split(',')[1]); const bytes = new Uint8Array(bin.length)
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
          blob = bytes
        } else { blob = new Uint8Array(s.size ?? 2048).fill(65); new TextEncoder().encodeInto(`ficticio:${s.name}`, blob) }
        dt.items.add(new File([blob], s.name, { type: s.type, lastModified: 1732460000000 }))
      }
      return dt
    }, specs)
    const area = p.locator('.attachment-dropzone')
    // Drag activo
    const dtDrag = await make([{ name: 'informe-ficticio.pdf', type: 'application/pdf' }])
    await area.dispatchEvent('dragenter', { dataTransfer: dtDrag })
    await area.dispatchEvent('dragover', { dataTransfer: dtDrag })
    await p.waitForTimeout(250)
    await shot(zone, `despues-adjuntos-drag-activo-${theme}-${w}.png`, { theme, view: 'attachments-drag' })
    await area.dispatchEvent('drop', { dataTransfer: dtDrag })
    // Pegado de una imagen (portapapeles) y de un documento
    await area.focus()
    const dtPaste = await make([{ name: 'image.png', type: 'image/png', png: '#1E3A8A' }])
    await area.evaluate((el, dt) => el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })), dtPaste)
    await p.locator('.attachment-file').nth(1).waitFor()
    await p.waitForTimeout(300)
    await shot(zone, `despues-adjuntos-portapapeles-${theme}-${w}.png`, { theme, view: 'attachments-paste' })
    // Varios archivos + duplicado + formato no permitido
    const dtMany = await make([{ name: 'planilla-ficticia.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      { name: 'informe-ficticio.pdf', type: 'application/pdf' }, { name: 'instalador.exe', type: 'application/x-msdownload' }])
    await area.dispatchEvent('drop', { dataTransfer: dtMany })
    await p.locator('.attachment-notices').waitFor()
    await p.waitForTimeout(250)
    await shot(zone, `despues-adjuntos-archivos-y-errores-${theme}-${w}.png`, { theme, view: 'attachments-errors' })
    // Límite de cantidad
    const dtLimit = await make([{ name: 'acta-ficticia.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      { name: 'notas-ficticias.txt', type: 'text/plain' }])
    await area.dispatchEvent('drop', { dataTransfer: dtLimit })
    await p.waitForTimeout(250)
    await shot(zone, `despues-adjuntos-limite-${theme}-${w}.png`, { theme, view: 'attachments-limit' })
    // Tamaño excedido (documento > 2.500.000 bytes): se vacía y se intenta de nuevo
    for (let i = await p.locator('.attachment-file').count(); i > 0; i--) await p.locator('.attachment-file button').first().click()
    const dtBig = await make([{ name: 'expediente-ficticio.pdf', type: 'application/pdf', size: 2_600_000 }])
    await area.dispatchEvent('drop', { dataTransfer: dtBig })
    await p.waitForTimeout(250)
    await shot(zone, `despues-adjuntos-tamano-excedido-${theme}-${w}.png`, { theme, view: 'attachments-size' })
    if (p.errors.length) console.warn('errores de página', p.errors)
    await p.context().close()
  }
}

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
await browser.close(); await vite.close(); await fixture.close()
for (const name of Object.keys(settings)) delete process.env[name]
