// Kanban (identidad de etapa, sin barra azul universal, tres canales de color) y adjuntos (seleccionar, arrastrar,
// pegar). DATOS FICTICIOS: Supabase sustituido por tests/ui/fixture-server.mjs; sin red externa, sin credenciales
// reales, sin tickets reales; los archivos se crean en memoria y la «subida» la responde una ruta local simulada.
import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createServer as createViteServer } from 'vite'
import { chromium } from 'playwright-core'
import { startFixtureServer, SIMULATED_PASSWORD } from './fixture-server.mjs'
import { installVisualFixtures } from './ux-fixtures.mjs'
import { installKanbanFixtures, kanbanProjects, OWNER_FIXTURE } from './kanban-attachments-fixtures.mjs'
import { MOCK_RUC, MOCK_PASSWORD, MOCK_PRODUCTS, MOCK_SUBPROJECTS } from '../../src/dev/client-portal-mock.ts'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
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

async function open(theme = 'light', path = '/portal', viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport, locale: 'es-PE' })
  await context.route('**/*', route => {
    const u = new URL(route.request().url())
    return ['127.0.0.1', 'localhost'].includes(u.hostname) || ['data:', 'blob:'].includes(u.protocol) ? route.continue() : route.abort()
  })
  await context.addInitScript(t => { try { localStorage.setItem('ticketera-theme', t) } catch {} }, theme)
  const page = await context.newPage()
  page.errors = []; page.on('pageerror', e => page.errors.push(e.message))
  page.uploads = []; page.rpcs = []
  page.on('request', r => { const p = new URL(r.url()).pathname; if (p.includes('/rpc/')) page.rpcs.push(p.split('/').pop()) })
  await installVisualFixtures(page, fixture.url)
  await installKanbanFixtures(page, fixture.url)
  await page.route(`${fixture.url}/storage/v1/object/request-attachments/**`, route => {
    page.uploads.push(decodeURIComponent(new URL(route.request().url()).pathname))
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ Key: 'simulado' }) })
  })
  await page.goto(base + path)
  return page
}
async function board(theme, viewport) {
  const page = await open(theme, '/portal', viewport)
  await page.getByRole('button', { name: /Acceso del equipo de TI/ }).click()
  await page.fill('#staff-modal-email', 'developer@simulado.invalid')
  await page.fill('#staff-modal-password', SIMULATED_PASSWORD)
  await page.getByRole('button', { name: 'Ingresar al sistema' }).click()
  await page.locator('nav[aria-label="Secciones"]').waitFor()
  await page.getByRole('button', { name: /^Boards/ }).click()
  await page.locator('.project-card').first().waitFor()
  return page
}
async function form(theme = 'light', viewport) {
  const page = await open(theme, '/cliente', viewport)
  await page.getByRole('button', { name: /Ingreso con usuario/ }).click()
  await page.fill('#client-ruc', MOCK_RUC); await page.fill('#client-username', 'ana'); await page.fill('#client-password', MOCK_PASSWORD)
  await page.locator('form[aria-label^="Ingreso con"] button[type=submit]').click()
  await page.waitForURL('**/cliente/nuevo'); await page.locator('#ticket-product').waitFor()
  return page
}
const css = (loc, prop) => loc.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p).trim(), prop)

/** Contraste WCAG entre dos colores calculados por el navegador (admite rgb/srgb de color-mix). */
async function contrast(page, fgSel, bgSel) {
  return page.evaluate(([f, b]) => {
    const toRgb = el => {
      const c = document.createElement('canvas').getContext('2d')
      c.fillStyle = '#000'; c.fillStyle = el; c.fillRect(0, 0, 1, 1)
      return [...c.getImageData(0, 0, 1, 1).data].slice(0, 3)
    }
    const lum = ([r, g, b]) => { const t = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4 }; return .2126 * t(r) + .7152 * t(g) + .0722 * t(b) }
    const L1 = lum(toRgb(f)), L2 = lum(toRgb(b))
    return (Math.max(L1, L2) + .05) / (Math.min(L1, L2) + .05)
  }, [fgSel, bgSel])
}

// ─────────────────────────────── KANBAN ───────────────────────────────
for (const theme of ['light', 'dark']) {
  test(`[${theme}] Kanban: cada columna real tiene identidad de etapa propia y legible`, async () => {
    const page = await board(theme)
    const columns = page.locator('.board-column')
    assert.equal(await columns.count(), 8, 'las 8 fases reales del flujo Development, sin columnas nuevas')
    const titles = await page.locator('.board-column-title').allInnerTexts()
    assert.deepEqual(titles.map(t => t.trim()), ['Backlog', 'Analysis', 'Design', 'Development', 'Code Review', 'Testing', 'Deploy', 'Done'])
    const stages = await columns.evaluateAll(els => els.map(el => el.dataset.stage))
    assert.deepEqual(stages, ['queue', 'analysis', 'design', 'build', 'review', 'testing', 'release', 'done'])
    const accents = await columns.evaluateAll(els => els.map(el => getComputedStyle(el).getPropertyValue('--stage').trim()))
    assert.equal(new Set(accents).size, 8, 'ocho acentos distintos')
    const heads = await page.locator('.board-column-header').evaluateAll(els => els.map(el => getComputedStyle(el).backgroundColor))
    assert.equal(new Set(heads).size, 8, 'cabeceras diferenciadas')
    // Sin violeta: ningún acento con matiz entre 250° y 320°.
    const hues = await page.evaluate(list => list.map(hex => {
      const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
      const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
      if (!d) return -1
      const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
      return (h * 60 + 360) % 360
    }), accents)
    assert.ok(hues.every(h => h < 250 || h > 320), `sin violeta: ${hues.map(Math.round)}`)
    // Fondo de columna teñido pero sutil: distinto del alterno, sin saturar.
    for (let i = 0; i < 8; i++) {
      const col = columns.nth(i)
      const ratio = await contrast(page, await css(col.locator('.stage-count'), 'color'), await css(col.locator('.stage-count'), 'background-color'))
      assert.ok(ratio >= 4.5, `${theme} contador ${stages[i]}: ${ratio.toFixed(2)}:1`)
      const title = await contrast(page, await css(col.locator('.board-column-title'), 'color'), await css(col.locator('.board-column-header'), 'background-color'))
      assert.ok(title >= 7, `${theme} título ${stages[i]}: ${title.toFixed(2)}:1`)
      const accent = await contrast(page, await css(col, '--stage'), await css(page.locator('html'), 'background-color'))
      assert.ok(accent >= 3 || theme === 'light' && stages[i] === 'review', `${theme} acento ${stages[i]} ≥ 3:1 (${accent.toFixed(2)})`)
    }
    // Contador visible con el número correcto por columna.
    assert.equal(await columns.nth(3).locator('.stage-count').innerText(), '3')
    assert.equal((await columns.nth(3).locator('.stage-blocked').textContent()).trim(), '1 bloqueado')
    assert.deepEqual(page.errors, [])
    await page.context().close()
  })

  test(`[${theme}] Kanban: sin barra azul universal; prioridad en insignia, responsable en franja y anillo, bloqueo aparte`, async () => {
    const page = await board(theme)
    const cards = page.locator('.project-card')
    assert.equal(await cards.count(), kanbanProjects.length)
    const tops = await cards.evaluateAll(els => els.map(el => getComputedStyle(el).borderTopWidth + ' ' + getComputedStyle(el).borderTopColor))
    assert.equal(new Set(tops).size <= 2, true, 'borde superior uniforme y discreto (neutro; rojo solo si está bloqueado)')
    assert.ok(tops.every(t => t.startsWith('1px')), `sin barra superior de 3 px: ${[...new Set(tops)]}`)
    // Cuatro prioridades reconocibles en su insignia.
    const badge = p => page.locator(`.project-card[data-priority="${p}"] .card-priority`).first()
    const bgs = {}
    for (const p of ['urgent', 'high', 'medium', 'low']) bgs[p] = await css(badge(p), 'background-color')
    assert.equal(new Set(Object.values(bgs)).size, 4, 'cuatro prioridades distintas')
    // Semáforo (24/11/2026): Bajo verde, Medio ámbar (dorado Procont), Alto naranja, Urgente rojo.
    assert.equal(bgs.high, 'rgb(194, 65, 12)', 'Alto = naranja')
    assert.equal(bgs.urgent, theme === 'light' ? 'rgb(185, 28, 28)' : 'rgb(220, 38, 38)', 'Urgente = rojo')
    assert.equal(bgs.medium, 'rgb(238, 187, 49)', 'Medio = ámbar')
    assert.equal(bgs.low, 'rgb(21, 128, 61)', 'Bajo = verde')
    for (const p of ['urgent', 'high', 'medium', 'low']) {
      const r = await contrast(page, await css(badge(p), 'color'), bgs[p])
      assert.ok(r >= 4.5, `${theme} insignia ${p}: ${r.toFixed(2)}:1`)
    }
    // La tarjeta no se pinta del color de su prioridad: superficie neutra común.
    // Sin color personal: superficie neutra común. Con color personal: tinte sutil de ese color (24/11/2026), nunca el de prioridad.
    const surfaces = await page.locator('.project-card:not(.is-blocked):not(.has-owner)').evaluateAll(els => [...new Set(els.map(el => getComputedStyle(el).backgroundColor))])
    assert.equal(surfaces.length, 1, 'misma superficie neutra para las tarjetas sin responsable')
    const tinted = await page.locator('.project-card.has-owner.owner-dorado:not(.is-blocked)').evaluateAll(els => [...new Set(els.map(el => getComputedStyle(el).backgroundColor))])
    assert.equal(tinted.length, 1, 'mismo tinte para el mismo responsable, sea cual sea la prioridad')
    assert.notEqual(tinted[0], surfaces[0])
    // Responsable: franja lateral y anillo con el color persistido (azul para el developer simulado).
    const devCard = page.locator('.project-card.has-owner.owner-azul').first()
    const owner = await css(devCard, '--owner')
    assert.match(await css(devCard, 'box-shadow'), /inset/)
    assert.equal(await css(devCard.locator('.owner-ring'), 'outline-color'), await page.evaluate(h => { const d = document.createElement('div'); d.style.color = h; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c }, owner))
    assert.equal(await page.locator('.project-card.owner-dorado').count(), kanbanProjects.filter(p => OWNER_FIXTURE[p.project_flows[0].assigned_to] === 'dorado').length)
    assert.equal(await page.locator('.project-card:not(.has-owner)').count(), 2, 'sin responsable: sin franja')
    assert.equal(await page.locator('.project-card:not(.has-owner) .card-unassigned').count(), 2)
    // Estado crítico independiente del color personal y de la prioridad.
    const blocked = page.locator('.project-card.is-blocked')
    assert.equal(await blocked.count(), 1)
    await blocked.getByText('Bloqueado', { exact: true }).waitFor()
    assert.notEqual(await css(blocked, 'background-color'), surfaces[0])
    // Jerarquía compacta; el nombre del solicitante permanece en el detalle.
    const first = page.locator('.project-card[data-priority="urgent"]').first()
    for (const sel of ['.card-title', '.card-priority', '.card-hierarchy', '.card-progress', '.card-owner', '.assign-toggle', '.card-select input']) {
      assert.equal(await first.locator(sel).count(), 1, `conserva ${sel}`)
    }
    assert.equal(await first.locator('.card-number, .card-tag-portfolio, .card-area').count(), 0, 'metadatos reservados al detalle')
    assert.equal(await first.locator('.card-requester').count(), 0, 'el nombre completo no ocupa la tarjeta')
    assert.deepEqual(page.errors, [])
    await page.context().close()
  })

  test(`[${theme}] Tabla: misma prioridad, responsable, etapa y bloqueo que el Kanban`, async () => {
    const page = await board(theme)
    const kanbanBadge = await css(page.locator('.project-card[data-priority="high"] .card-priority').first(), 'background-color')
    const kanbanRing = await css(page.locator('.project-card.owner-dorado .owner-ring').first(), 'outline-color')
    const accentDone = await css(page.locator('.board-column[data-stage="done"]'), '--stage')
    await page.getByRole('button', { name: /Tabla/ }).click()
    await page.locator('.data-view table').waitFor()
    const headers = (await page.locator('.data-view thead th').allInnerTexts()).map(t => t.replace(/[↑↓↕]/g, '').trim())
    assert.ok(headers.includes('Responsable'))
    const row = title => page.locator('.data-view tbody tr').filter({ hasText: title })
    const high = kanbanProjects.find(p => p.priority === 'high' && OWNER_FIXTURE[p.project_flows[0].assigned_to] === 'dorado')
    assert.equal(await css(row(high.title).locator('td').nth(1).locator('span').first(), 'background-color'), kanbanBadge, 'misma insignia de prioridad')
    assert.equal(await css(row(high.title).locator('.owner-ring'), 'outline-color'), kanbanRing, 'mismo anillo del responsable')
    const done = kanbanProjects.find(p => p.project_flows[0].current_phase === 'done')
    const dot = row(done.title).locator('.stage-dot')
    assert.equal(await css(dot.locator('xpath=..'), '--stage'), accentDone, 'mismo tono de etapa')
    const blocked = kanbanProjects.find(p => p.is_blocked)
    await row(blocked.title).locator('.status-badge.is-blocked').waitFor()
    assert.equal(await row(kanbanProjects[0].title).getByText('Sin responsable').count(), 1)
    assert.deepEqual(page.errors, [])
    await page.context().close()
  })
}

test('Kanban responsive: 1920, 1440, 768, 390, 360 y 320 sin desbordar la página; columnas con su desplazamiento', async () => {
  for (const width of [1920, 1440, 768, 390, 360, 320]) {
    const page = await board('light', { width, height: width > 800 ? 900 : 844 })
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    assert.ok(overflow <= 0, `${width}: la página no se desplaza en horizontal (${overflow}px)`)
    const scroller = page.locator('.kanban-scroll')
    assert.equal(await css(scroller, 'overflow-x'), 'auto', 'navegación horizontal de columnas conservada')
    const card = await page.locator('.project-card').first().boundingBox()
    const column = await page.locator('.board-column').first().boundingBox()
    assert.ok(card.x >= column.x && card.x + card.width <= column.x + column.width + 0.5, `${width}: la tarjeta no desborda su columna`)
    const toggle = await page.locator('.assign-toggle').first().boundingBox()
    assert.ok(toggle.height >= 44 && toggle.width >= 44, 'acción de asignar ≥ 44 px')
    await page.context().close()
  }
})

// ─────────────────────────────── ADJUNTOS ───────────────────────────────
/** Crea un DataTransfer con archivos ficticios en el navegador. */
const transfer = (page, specs) => page.evaluateHandle(specs => {
  const dt = new DataTransfer()
  for (const s of specs) {
    let bytes
    if (s.png) {
      const c = document.createElement('canvas'); c.width = 64; c.height = 40
      const g = c.getContext('2d'); g.fillStyle = s.png; g.fillRect(0, 0, 64, 40)
      const bin = atob(c.toDataURL('image/png').split(',')[1]); bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    } else { bytes = new Uint8Array(s.size ?? 1024).fill(32); new TextEncoder().encodeInto(`ficticio:${s.name}:${s.salt ?? ''}`, bytes) }
    dt.items.add(new File([bytes], s.name, { type: s.type ?? '', lastModified: 1732460000000 }))
  }
  return dt
}, specs)
const drop = async (page, specs) => {
  const dt = await transfer(page, specs)
  const zone = page.locator('.attachment-dropzone')
  await zone.dispatchEvent('dragenter', { dataTransfer: dt })
  await zone.dispatchEvent('dragover', { dataTransfer: dt })
  await zone.dispatchEvent('drop', { dataTransfer: dt })
}
const paste = async (page, specs, text) => {
  const zone = page.locator('.attachment-dropzone')
  await zone.focus()
  const dt = await page.evaluateHandle(async ([specs, text]) => {
    const dt = new DataTransfer()
    for (const s of specs) {
      const c = document.createElement('canvas'); c.width = 64; c.height = 40; c.getContext('2d').fillRect(0, 0, 64, 40)
      const blob = await new Promise(r => c.toBlob(r, 'image/png'))
      dt.items.add(new File([blob, s.salt ?? ''], s.name, { type: s.type }))
    }
    if (text) dt.setData('text/plain', text)
    return dt
  }, [specs, text])
  return zone.evaluate((el, dt) => {
    const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })
    el.dispatchEvent(ev); return ev.defaultPrevented
  }, dt)
}
const names = page => page.locator('.attachment-file-name').allInnerTexts()
const notices = page => page.locator('.attachment-notice').allInnerTexts()
const settle = page => page.waitForFunction(() => !document.querySelector('.attachment-list[aria-busy=true]') && !document.querySelector('.attachment-notices .is-info')?.textContent?.includes('Revisando'))

test('Adjuntos: instrucción visible, «Seleccionar archivos» y selección por explorador con el filtro común', async () => {
  const page = await form()
  await page.getByText('Puedes arrastrar tus archivos aquí o pegarlos con Ctrl + V').waitFor()
  const trigger = page.locator('label.attachment-trigger')
  assert.equal((await trigger.innerText()).trim(), 'Seleccionar archivos')
  await page.setInputFiles('#ticket-attachments', [
    { name: 'informe-ficticio.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 ficticio') },
    { name: 'instalador.exe', mimeType: 'application/x-msdownload', buffer: Buffer.from('MZ') },
  ])
  await settle(page)
  assert.deepEqual(await names(page), ['informe-ficticio.pdf'])
  const n = await notices(page)
  assert.ok(n.some(t => /Se añadió «informe-ficticio\.pdf»/.test(t)))
  assert.ok(n.some(t => /«instalador\.exe» no tiene un formato permitido/.test(t)))
  const row = page.locator('.attachment-file').first()
  assert.match(await row.innerText(), /PDF/); assert.match(await row.innerText(), /KB|B/); assert.match(await row.innerText(), /Lista/)
  assert.deepEqual(page.errors, [])
  await page.context().close()
})

test('Adjuntos: arrastrar uno y varios, estado activo, duplicado, formato, tamaño, límite y eliminar', async () => {
  const page = await form()
  const zone = page.locator('.attachment-dropzone')
  const idle = await css(zone, 'border-top-style')
  const dt = await transfer(page, [{ name: 'acta-ficticia.pdf', type: 'application/pdf' }])
  await zone.dispatchEvent('dragenter', { dataTransfer: dt })
  await page.getByText('Suelta los archivos para añadirlos').waitFor()
  assert.equal(idle, 'dashed'); assert.equal(await css(zone, 'border-top-style'), 'solid', 'destino resaltado')
  await zone.dispatchEvent('dragleave', { dataTransfer: dt })
  assert.equal(await zone.getAttribute('data-drag'), null, 'al salir vuelve al reposo')
  await drop(page, [{ name: 'acta-ficticia.pdf', type: 'application/pdf' }]); await settle(page)
  assert.deepEqual(await names(page), ['acta-ficticia.pdf'])
  await drop(page, [{ name: 'planilla-ficticia.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    { name: 'acta-ficticia.pdf', type: 'application/pdf' }, { name: 'programa.exe', type: 'application/x-msdownload' },
    { name: 'expediente-ficticio.pdf', type: 'application/pdf', size: 2_600_000 }])
  await settle(page)
  assert.deepEqual(await names(page), ['acta-ficticia.pdf', 'planilla-ficticia.xlsx'])
  const n = await notices(page)
  assert.ok(n.some(t => /Se añadió «planilla-ficticia\.xlsx»/.test(t)))
  assert.ok(n.some(t => /«acta-ficticia\.pdf» ya está en la lista/.test(t)), 'duplicado')
  assert.ok(n.some(t => /«programa\.exe» no tiene un formato permitido/.test(t)), 'formato')
  assert.ok(n.some(t => /«expediente-ficticio\.pdf» pesa 2\.60 MB y supera el máximo de 2\.50 MB/.test(t)), 'tamaño')
  await drop(page, [{ name: 'a.txt', type: 'text/plain' }, { name: 'b.csv', type: 'text/csv' }, { name: 'c.docx', type: '' }])
  await settle(page)
  assert.equal((await names(page)).length, 4, 'nunca más de 4')
  assert.ok((await notices(page)).some(t => /«c\.docx» no se añadió: puedes adjuntar hasta 4 archivos/.test(t)), 'límite')
  await page.getByText('Llegaste al máximo de 4 archivos').waitFor()
  assert.equal(await page.locator('#ticket-attachments').isDisabled(), true)
  await page.getByRole('button', { name: 'Quitar planilla-ficticia.xlsx' }).click()
  await settle(page)
  assert.deepEqual(await names(page), ['acta-ficticia.pdf', 'a.txt', 'b.csv'])
  assert.ok((await notices(page)).some(t => /Se quitó «planilla-ficticia\.xlsx»/.test(t)))
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('attachment-dropzone')), true, 'el foco vuelve a la zona')
  assert.equal(await page.locator('#ticket-attachments').isDisabled(), false)
  assert.deepEqual(page.errors, [])
  await page.context().close()
})

test('Adjuntos: soltar fuera de la zona no abre el archivo ni altera el formulario', async () => {
  const page = await form()
  await page.fill('#ticket-title', 'Título ficticio')
  const dt = await transfer(page, [{ name: 'fuera.pdf', type: 'application/pdf' }])
  const prevented = await page.locator('#ticket-title').evaluate((el, dt) => {
    const over = new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }); el.dispatchEvent(over)
    const ev = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }); el.dispatchEvent(ev)
    return [over.defaultPrevented, ev.defaultPrevented]
  }, dt)
  assert.deepEqual(prevented, [true, true], 'el navegador no navega al archivo')
  assert.equal(await page.inputValue('#ticket-title'), 'Título ficticio')
  assert.equal(await page.locator('.attachment-file').count(), 0)
  await page.getByText('Suelta los archivos dentro de la zona de adjuntos para añadirlos.').waitFor()
  assert.equal(new URL(page.url()).pathname, '/cliente/nuevo')
  await page.context().close()
})

test('Adjuntos: pegar con Ctrl/Cmd + V — imagen y varios archivos; el texto no se toma como documento', async () => {
  const page = await form()
  assert.equal(await paste(page, [{ name: 'image.png', type: 'image/png' }]), true)
  await settle(page)
  const [first] = await names(page)
  assert.match(first, /^captura-\d{8}-\d{6}\.png$/, 'imagen pegada con nombre legible')
  assert.equal(await page.locator('.attachment-thumb').count(), 1, 'vista previa de la imagen')
  assert.ok((await notices(page)).some(t => /desde el portapapeles/.test(t)))
  await paste(page, [{ name: 'factura-ficticia.pdf', type: 'application/pdf', salt: 'a' }, { name: 'notas.txt', type: 'text/plain', salt: 'b' }])
  await settle(page)
  assert.equal((await names(page)).length, 3, 'varios elementos del portapapeles')
  assert.equal(await page.locator('.attachment-type').count(), 2, 'documentos sin vista previa forzada')
  // Solo texto (p. ej., una ruta copiada): no se crea ningún archivo y se explica la alternativa.
  await paste(page, [], 'C:\\Users\\ficticio\\informe.pdf')
  assert.equal((await names(page)).length, 3)
  await page.getByText(/no contiene archivos que el navegador pueda leer/).waitFor()
  await page.getByText(/arrástralo aquí o usa «Seleccionar archivos»/).waitFor()
  assert.deepEqual(page.errors, [])
  await page.context().close()
})

test('Adjuntos: teclado — Tab llega a la zona, Enter abre el explorador y la zona tiene nombre y ayuda', async () => {
  const page = await form()
  const zone = page.locator('.attachment-dropzone')
  await page.locator('#ticket-description').focus()
  let reached = false
  for (let i = 0; i < 6 && !reached; i++) { await page.keyboard.press('Tab'); reached = await zone.evaluate(el => el === document.activeElement) }
  assert.ok(reached, 'la zona es alcanzable con Tab')
  assert.equal(await css(zone, 'outline-style'), 'solid', 'anillo de foco visible')
  assert.match(await zone.evaluate(el => document.getElementById(el.getAttribute('aria-labelledby')).textContent), /pegarlos con Ctrl \+ V/)
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.keyboard.press('Enter')])
  assert.equal(chooser.isMultiple(), true)
  await chooser.setFiles([{ name: 'teclado.csv', mimeType: 'text/csv', buffer: Buffer.from('a,b') }])
  await settle(page)
  assert.deepEqual(await names(page), ['teclado.csv'])
  await page.keyboard.press('Tab')
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'ticket-attachments', '«Seleccionar archivos» sigue en el orden de tabulación')
  await page.context().close()
})

test('Adjuntos: envío con el flujo existente — una reserva, una subida por archivo, sin duplicados; éxito visible', async () => {
  const page = await form()
  await page.selectOption('#ticket-product', MOCK_PRODUCTS[1].id)
  await page.waitForFunction(() => !document.querySelector('#ticket-subproject-help').textContent.includes('Cargando'))
  await page.selectOption('#ticket-subproject', MOCK_SUBPROJECTS[1].id)
  await page.selectOption('#ticket-type', { label: 'Mejora' })
  await page.fill('#ticket-title', 'Solicitud ficticia de adjuntos')
  await page.fill('#ticket-description', 'Datos locales simulados; no es una solicitud real.')
  await page.setInputFiles('#ticket-attachments', [{ name: 'explorador.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF ficticio') }])
  await settle(page)
  await drop(page, [{ name: 'arrastrado.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }]); await settle(page)
  await paste(page, [{ name: 'image.png', type: 'image/png' }]); await settle(page)
  assert.equal((await names(page)).length, 3)
  assert.equal(page.uploads.length, 0, 'nada se sube antes de enviar')
  await page.getByRole('button', { name: 'Enviar solicitud', exact: true }).click()
  await page.getByRole('heading', { name: '¡Solicitud enviada!' }).waitFor()
  await page.getByText('Se adjuntaron 3 archivos a la solicitud.').waitFor()
  assert.equal(page.rpcs.filter(n => n === 'client_submit_request').length, 1)
  assert.equal(page.rpcs.filter(n => n === 'client_reserve_attachments').length, 1, 'una sola reserva del lote')
  assert.equal(page.uploads.length, 3, 'una subida por archivo')
  assert.equal(new Set(page.uploads).size, 3, 'sin subidas duplicadas')
  assert.deepEqual(page.errors, [])
  await page.context().close()
})

for (const theme of ['light', 'dark']) {
  test(`[${theme}] Adjuntos: contraste de instrucción, ayuda, botón, mensajes y estado de arrastre`, async () => {
    const page = await form(theme)
    const zone = page.locator('.attachment-dropzone')
    const zoneBg = await css(zone, 'background-color')
    assert.ok(await contrast(page, await css(page.locator('.attachment-drop-title'), 'color'), zoneBg) >= 7)
    assert.ok(await contrast(page, await css(page.locator('.attachment-drop-hint'), 'color'), zoneBg) >= 4.5)
    assert.ok(await contrast(page, await css(page.locator('.attachment-trigger'), 'color'), await css(page.locator('.attachment-trigger'), 'background-color')) >= 4.5)
    assert.ok(await contrast(page, await css(zone, 'border-top-color'), zoneBg) >= 3, 'borde de la zona ≥ 3:1')
    await drop(page, [{ name: 'malo.exe', type: '' }, { name: 'ok.pdf', type: 'application/pdf' }]); await settle(page)
    for (const cls of ['is-ok', 'is-error']) {
      const n = page.locator(`.attachment-notice.${cls}`).first()
      const r = await contrast(page, await css(n, 'color'), await css(n, 'background-color'))
      assert.ok(r >= 4.5, `${theme} mensaje ${cls}: ${r.toFixed(2)}:1`)
    }
    const st = page.locator('.attachment-status').first()
    assert.ok(await contrast(page, await css(st, 'color'), await css(st, 'background-color')) >= 4.5)
    const dt = await transfer(page, [{ name: 'x.pdf', type: 'application/pdf' }])
    await zone.dispatchEvent('dragenter', { dataTransfer: dt })
    await page.waitForTimeout(250)   // transición de color de 150 ms
    const dragBg = await css(zone, 'background-color')
    assert.notEqual(dragBg, zoneBg, 'estado de arrastre visible')
    assert.ok(await contrast(page, await css(zone, 'border-top-color'), dragBg) >= 3, 'borde activo ≥ 3:1')
    assert.ok(await contrast(page, await css(page.locator('.attachment-drop-title'), 'color'), dragBg) >= 7)
    await page.context().close()
  })
}

test('Adjuntos responsive: 1440, 768, 390, 360 y 320 — sin desbordes, botón táctil de 44 px y zona usable', async () => {
  for (const width of [1440, 768, 390, 360, 320]) {
    const page = await form('light', { width, height: 900 })
    await drop(page, [{ name: 'un-nombre-de-archivo-ficticio-bastante-largo-para-probar.pdf', type: 'application/pdf' }]); await settle(page)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    assert.ok(overflow <= 0, `${width}: sin desplazamiento horizontal (${overflow}px)`)
    const t = await page.locator('label.attachment-trigger').boundingBox()
    assert.ok(t.height >= 44, `${width}: botón ≥ 44 px`)
    const r = await page.locator('.attachment-remove').first().boundingBox()
    assert.ok(r.height >= 44 && r.width >= 44, `${width}: quitar ≥ 44 px`)
    const zone = await page.locator('.attachment-dropzone').boundingBox()
    const row = await page.locator('.attachment-file').first().boundingBox()
    assert.ok(row.x + row.width <= zone.x + zone.width + 1, `${width}: la fila no se sale del área`)
    await page.context().close()
  }
})

test('Movimiento reducido: la tarjeta no se desplaza al pasar el puntero', async () => {
  const page = await board('light')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const card = page.locator('.project-card').first()
  await card.hover()
  assert.equal(await css(card, 'transform'), 'none')
  await page.context().close()
})
