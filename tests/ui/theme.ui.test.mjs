// Tema claro/oscuro: selector, persistencia, ausencia de destello y movimiento (Taste + Emil).
// DATOS FICTICIOS: Supabase sustituido por tests/ui/fixture-server.mjs y fixtures visuales; sin red externa,
// sin credenciales reales y sin crear tickets.
import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createServer as createViteServer } from 'vite'
import { chromium } from 'playwright-core'
import { startFixtureServer, SIMULATED_PASSWORD } from './fixture-server.mjs'
import { installVisualFixtures } from './ux-fixtures.mjs'
import { MOCK_RUC, MOCK_PASSWORD } from '../../src/dev/client-portal-mock.ts'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const KEY = 'ticketera-theme'
const LIGHT_BG = 'rgb(226, 232, 240)', DARK_BG = 'rgb(11, 15, 22)'
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

/** Contexto nuevo (almacenamiento vacío) con espía de View Transitions y del primer estado pintable. */
async function open(path = '/portal', { viewport = { width: 1440, height: 900 }, reducedMotion } = {}) {
  const context = await browser.newContext({ viewport, locale: 'es-PE', reducedMotion })
  await context.route('**/*', route => {
    const u = new URL(route.request().url())
    return ['127.0.0.1', 'localhost'].includes(u.hostname) || ['data:', 'blob:'].includes(u.protocol) ? route.continue() : route.abort()
  })
  await context.addInitScript(() => {
    window.__vt = 0
    const original = document.startViewTransition?.bind(document)
    if (original) document.startViewTransition = cb => { window.__vt++; return original(cb) }
    // Estado en DOMContentLoaded: CSS cargado (bloqueante) y React aún sin pintar la aplicación.
    document.addEventListener('DOMContentLoaded', () => {
      window.__first = { theme: document.documentElement.dataset.theme, bg: getComputedStyle(document.documentElement).backgroundColor, root: document.getElementById('root')?.childElementCount ?? -1 }
    })
  })
  const page = await context.newPage()
  page.errors = []
  page.on('pageerror', e => page.errors.push(e.message))
  await installVisualFixtures(page, fixture.url)
  await page.goto(base + path)
  return page
}
const theme = page => page.evaluate(() => document.documentElement.dataset.theme)
const stored = page => page.evaluate(k => localStorage.getItem(k), KEY)
const bg = page => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)
const pressed = (page, label, scope = page) => scope.getByRole('button', { name: label, exact: true }).first().getAttribute('aria-pressed')
const toggle = page => page.getByRole('group', { name: 'Apariencia' }).first()

test('claro por defecto: sin preferencia guardada no se cambia el tema', async () => {
  const page = await open()
  assert.equal(await theme(page), 'light')
  assert.equal(await stored(page), null, 'nada se guarda hasta que la persona elige')
  assert.equal(await bg(page), LIGHT_BG)
  await toggle(page).waitFor()
  assert.equal(await pressed(page, 'Modo claro'), 'true')
  assert.equal(await pressed(page, 'Modo oscuro'), 'false')
  // Un valor inválido también cae en claro.
  await page.evaluate(k => localStorage.setItem(k, 'sepia'), KEY)
  await page.reload()
  assert.equal(await theme(page), 'light')
  await page.context().close()
})

test('selector accesible: grupo con nombre, Lucide Sun/Moon, tooltip, 44 px y foco visible', async () => {
  const page = await open()
  const group = toggle(page)
  const buttons = group.getByRole('button')
  assert.equal(await buttons.count(), 2)
  for (const [label] of [['Modo claro'], ['Modo oscuro']]) {
    const b = group.getByRole('button', { name: label, exact: true })
    assert.equal(await b.getAttribute('title'), label, 'tooltip nativo')
    const box = await b.boundingBox()
    assert.ok(box.width >= 44 && box.height >= 44, `${label}: ${box.width}x${box.height}`)
    assert.equal(await b.locator('svg').count(), 1, 'icono, sin emoji')
  }
  // Teclado: Tab hasta el selector y anillo visible.
  for (let i = 0; i < 6 && !(await page.evaluate(() => document.activeElement?.closest('[aria-label="Apariencia"]'))); i++) await page.keyboard.press('Tab')
  const ring = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return { style: s.outlineStyle, width: s.outlineWidth } })
  assert.deepEqual(ring, { style: 'solid', width: '2px' })
  await page.context().close()
})

test('puntero: un único fundido de página (View Transition); se guarda solo la palabra del tema', async () => {
  const page = await open()
  await page.mouse.move(5, 5)
  await toggle(page).getByRole('button', { name: 'Modo oscuro' }).click()
  await page.waitForFunction(() => !document.documentElement.hasAttribute('data-theme-switching'))
  assert.equal(await theme(page), 'dark')
  assert.equal(await page.evaluate(() => window.__vt), 1, 'una sola transición para toda la página')
  assert.equal(await stored(page), 'dark')
  assert.equal(await bg(page), DARK_BG)
  assert.equal(await page.evaluate(() => document.querySelector('meta[name="theme-color"]').content), '#0B0F16')
  assert.equal(await pressed(page, 'Modo oscuro'), 'true')
  // Lo único que se guarda del tema es la palabra; nada de sesión.
  assert.ok(['light', 'dark'].includes(await stored(page)))
  assert.deepEqual(page.errors, [])
  await page.context().close()
})

test('teclado: el cambio no se anima (Emil) y es inmediato', async () => {
  const page = await open()
  const dark = toggle(page).getByRole('button', { name: 'Modo oscuro' })
  await dark.focus()
  await page.keyboard.press('Enter')
  assert.equal(await theme(page), 'dark')
  assert.equal(await page.evaluate(() => window.__vt), 0, 'sin View Transition con teclado')
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Enter')
  assert.equal(await theme(page), 'light')
  await page.context().close()
})

test('movimiento reducido: el fundido se conserva solo como opacidad breve (120 ms)', async () => {
  const page = await open('/portal', { reducedMotion: 'reduce' })
  const durations = await page.evaluate(() => {
    const out = []
    const walk = rules => { for (const r of rules) { if (r.cssRules) walk(r.cssRules); if (r.selectorText?.includes('::view-transition-old(root)')) out.push({ media: r.parentRule?.conditionText ?? null, duration: r.style.animationDuration }) } }
    for (const sheet of document.styleSheets) { try { walk(sheet.cssRules) } catch { /* hoja externa */ } }
    return out
  })
  assert.ok(durations.some(d => d.media === null && d.duration === '200ms'), JSON.stringify(durations))
  assert.ok(durations.some(d => /reduce/.test(d.media ?? '') && d.duration === '120ms'), JSON.stringify(durations))
  await toggle(page).getByRole('button', { name: 'Modo oscuro' }).click()
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark')
  await page.context().close()
})

test('persistencia sin destello: navegar, recargar y las rutas públicas abren ya en oscuro', async () => {
  const page = await open()
  await toggle(page).getByRole('button', { name: 'Modo oscuro' }).click()
  for (const path of ['/cliente', '/tracking', '/login', '/portal']) {
    await page.goto(base + path)
    const first = await page.evaluate(() => window.__first)
    assert.equal(first.theme, 'dark', `${path}: tema aplicado antes de React`)
    assert.equal(first.bg, DARK_BG, `${path}: primer pintado oscuro`)
    await toggle(page).waitFor()
    assert.equal(await pressed(page, 'Modo oscuro'), 'true', `${path}: selector visible y activo`)
  }
  await page.reload()
  assert.equal((await page.evaluate(() => window.__first)).bg, DARK_BG)
  await page.context().close()
})

test('sesión del cliente (fixtures): el tema se mantiene al entrar, navegar y salir', async () => {
  const page = await open('/cliente')
  await toggle(page).getByRole('button', { name: 'Modo oscuro' }).click()
  await page.getByRole('button', { name: /Ingreso con usuario/ }).click()
  await page.fill('#client-ruc', MOCK_RUC)
  await page.fill('#client-username', 'ana')
  await page.fill('#client-password', MOCK_PASSWORD)
  await page.locator('form[aria-label^="Ingreso con"] button[type=submit]').click()
  await page.waitForURL('**/cliente/nuevo'); await page.locator('#ticket-product').waitFor()
  assert.equal(await theme(page), 'dark')
  assert.equal(await pressed(page, 'Modo oscuro', page.locator('.workspace-header')), 'true')
  await page.getByRole('link', { name: /Mis tickets/ }).first().click()
  assert.equal(await theme(page), 'dark')
  assert.equal(await page.evaluate(k => Object.keys(localStorage).filter(x => x === k).length, KEY), 1)
  await page.getByRole('button', { name: 'Salir', exact: true }).click()
  await page.waitForURL(url => !url.pathname.startsWith('/cliente/'))
  assert.equal(await theme(page), 'dark', 'cerrar sesión no borra la preferencia')
  assert.equal(await stored(page), 'dark')
  await page.context().close()
})

test('panel interno (fixtures): selector en la banda, se mantiene al entrar y al cerrar sesión', async () => {
  const page = await open()
  await toggle(page).getByRole('button', { name: 'Modo oscuro' }).click()
  await page.getByRole('button', { name: /Ingreso del personal/ }).click()
  await page.fill('#staff-modal-email', 'superadmin@simulado.invalid')
  await page.fill('#staff-modal-password', SIMULATED_PASSWORD)
  await page.getByRole('button', { name: 'Ingresar al sistema' }).click()
  await page.locator('nav[aria-label="Secciones"]').waitFor()
  assert.equal(await theme(page), 'dark')
  const band = page.locator('.enterprise-header .theme-toggle.on-band')
  assert.equal(await band.count(), 1)
  assert.equal(await band.getByRole('button', { name: 'Modo oscuro' }).getAttribute('aria-pressed'), 'true')
  // Cambiar a claro desde el panel y comprobar que la banda conserva su color oficial.
  await band.getByRole('button', { name: 'Modo claro' }).click()
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light')
  assert.equal(await page.locator('.brand-band').first().evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(1, 37, 123)')
  await band.getByRole('button', { name: 'Modo oscuro' }).click()
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark')
  await page.getByRole('button', { name: 'Cerrar Sesión' }).click()
  await page.getByRole('button', { name: /Ingreso del personal/ }).waitFor()
  assert.equal(await theme(page), 'dark', 'cerrar sesión no borra la preferencia')
  await page.context().close()
})
