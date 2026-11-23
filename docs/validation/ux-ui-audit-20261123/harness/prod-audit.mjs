// Production audit of public routes. Navigation and UI toggles only: no credentials, no form submission.
import { chromium } from 'playwright-core'
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { collect, tabWalk } from './metrics.mjs'

const BASE = 'https://ticketera-procont.vercel.app'
const OUT = new URL('../prod/', import.meta.url).pathname
mkdirSync(OUT + 'shots', { recursive: true })
const VIEWPORTS = { desktop: [1920, 1080], laptop: [1440, 900], tablet: [768, 1024], movil: [390, 844], m360: [360, 800] }
const browser = await chromium.launch()
const results = { base: BASE, at: new Date().toISOString(), screens: [], manifest: [], nonGet: [], errors: [] }
let version = null

async function newPage(vp, opts = {}) {
  const [w, h] = VIEWPORTS[vp] || vp
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'es-PE', hasTouch: w <= 768, isMobile: w <= 390, ...opts })
  const page = await ctx.newPage()
  page.on('request', r => { if (!['GET', 'OPTIONS', 'HEAD'].includes(r.method())) results.nonGet.push(r.method() + ' ' + r.url()) })
  page.on('pageerror', e => results.errors.push(String(e).slice(0, 200)))
  return page
}
async function shoot(page, vp, area, screen) {
  await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(150)
  const m = await page.evaluate(collect)
  const file = `${vp}-${screen}.png`
  const png = await page.screenshot({ path: OUT + 'shots/' + file, fullPage: true, animations: 'disabled' })
  version ??= (await page.locator('[data-testid=build-version]').innerText().catch(() => '')).trim()
  results.manifest.push({ file, route: m.url, version, resolution: m.viewport.join('x'), area, screen, date: new Date().toISOString(), sha256: createHash('sha256').update(png).digest('hex') })
  results.screens.push({ vp, area, screen, ...m })
  return m
}

for (const vp of Object.keys(VIEWPORTS)) {
  let page = await newPage(vp)
  await page.goto(BASE + '/portal', { waitUntil: 'networkidle' })
  await shoot(page, vp, 'Portal', '01-portal')
  if (vp === 'laptop' || vp === 'movil') results[`tab-portal-${vp}`] = await tabWalk(page, 6)
  await page.goto(BASE + '/cliente', { waitUntil: 'networkidle' })
  await shoot(page, vp, 'Ingreso', '02-seleccion')
  const cards = page.locator('[aria-label="Tipo de ingreso"] button')
  await cards.nth(0).click(); await page.waitForTimeout(300)
  await shoot(page, vp, 'Ingreso', '03-quipu')
  if (vp === 'laptop' || vp === 'movil') results[`tab-quipu-${vp}`] = await tabWalk(page, 10)
  const toggle = page.locator('.password-toggle').first()
  if (await toggle.count()) {
    const before = await page.locator('#client-password').getAttribute('type'); const label1 = await toggle.getAttribute('aria-label')
    await toggle.click(); const after = await page.locator('#client-password').getAttribute('type'); const label2 = await toggle.getAttribute('aria-label')
    results[`password-toggle-${vp}`] = { before, after, label1, label2, pressed: await toggle.getAttribute('aria-pressed') }
    await toggle.click()
  }
  await cards.nth(1).click(); await page.waitForTimeout(300)
  await shoot(page, vp, 'Ingreso', '04-quipufac')
  await page.goto(BASE + '/tracking', { waitUntil: 'networkidle' })
  await shoot(page, vp, 'Cliente', '05-seguimiento-publico')
  await page.goto(BASE + '/portal', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /Ingreso del personal/ }).click(); await page.waitForTimeout(400)
  await shoot(page, vp, 'Panel interno', '06-ingreso-personal-modal')
  if (vp === 'laptop') {
    const dialog = page.getByRole('dialog')
    const trap = []
    for (let i = 0; i < 10; i++) { await page.keyboard.press('Tab'); trap.push(await dialog.evaluate(el => el.contains(document.activeElement)).catch(() => null)) }
    await page.keyboard.press('Escape'); await page.waitForTimeout(200)
    results.staffModal = { focusTrapped: trap, closesWithEscape: (await page.getByRole('dialog').count()) === 0, role: await page.locator('[role=dialog]').count() }
  }
  await page.context().close()
}

// 320 px: anything past the screen (Taste walks 320; WCAG 1.4.10 reflow).
for (const route of ['/portal', '/cliente', '/tracking']) {
  const page = await newPage([320, 640]); await page.goto(BASE + route, { waitUntil: 'networkidle' })
  if (route === '/cliente') { await page.locator('[aria-label="Tipo de ingreso"] button').nth(0).click(); await page.waitForTimeout(200) }
  results[`overflow320${route}`] = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  await page.context().close()
}

// Hover before the first pointerdown (InteractionMode starts in "keyboard") and after it.
{
  const page = await newPage('laptop'); await page.goto(BASE + '/portal', { waitUntil: 'networkidle' })
  const card = page.locator('.portal-option').first()
  const read = () => card.evaluate(el => { const cs = getComputedStyle(el); return { input: document.documentElement.dataset.input, duration: cs.transitionDuration, property: cs.transitionProperty, transform: cs.transform } })
  const restBefore = await read(); await card.hover(); await page.waitForTimeout(400)
  const hoverBefore = await read()
  await page.mouse.move(5, 5); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(200)
  await card.hover(); await page.waitForTimeout(400)
  const hoverAfter = await read()
  const btn = page.getByRole('button', { name: /Ingreso del personal/ })
  const btnStyle = await btn.evaluate(el => { const cs = getComputedStyle(el); return { className: el.className, duration: cs.transitionDuration, property: cs.transitionProperty, timing: cs.transitionTimingFunction } })
  results.hover = { restBefore, hoverBeforeFirstPointer: hoverBefore, hoverAfterPointer: hoverAfter, staffButton: btnStyle }
  await page.context().close()
}
// Reduced motion.
{
  const page = await newPage('laptop', { reducedMotion: 'reduce' }); await page.goto(BASE + '/portal', { waitUntil: 'networkidle' })
  await page.mouse.move(5, 5); await page.mouse.down(); await page.mouse.up()
  const card = page.locator('.portal-option').first(); await card.hover(); await page.waitForTimeout(300)
  results.reducedMotion = await card.evaluate(el => { const cs = getComputedStyle(el); return { transform: cs.transform, duration: cs.transitionDuration, property: cs.transitionProperty } })
  await page.context().close()
}
// Loading experience (cold load, cache disabled) at 1440 and 390.
for (const vp of ['laptop', 'movil']) {
  const page = await newPage(vp)
  const cdp = await page.context().newCDPSession(page); await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
  await page.addInitScript(() => { window.__cls = 0; window.__lcp = 0
    new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value }).observe({ type: 'layout-shift', buffered: true })
    new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lcp = e.startTime }).observe({ type: 'largest-contentful-paint', buffered: true }) })
  await page.goto(BASE + '/portal', { waitUntil: 'networkidle' }); await page.waitForTimeout(1500)
  results[`load-${vp}`] = await page.evaluate(() => {
    const res = performance.getEntriesByType('resource'), nav = performance.getEntriesByType('navigation')[0]
    const sum = (f, k) => res.filter(f).reduce((s, r) => s + (r[k] || 0), 0)
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime
    return { requests: res.length + 1, transferKiB: +((sum(() => true, 'transferSize') + nav.transferSize) / 1024).toFixed(1),
      jsDecodedKiB: +(sum(r => r.initiatorType === 'script' || r.name.endsWith('.js'), 'decodedBodySize') / 1024).toFixed(1),
      cssDecodedKiB: +(sum(r => r.name.endsWith('.css'), 'decodedBodySize') / 1024).toFixed(1),
      fonts: res.filter(r => /\.(woff2?|ttf|otf)$/.test(r.name)).map(r => r.name.split('/').pop() + ' ' + (r.decodedBodySize / 1024).toFixed(1) + 'KiB'),
      images: res.filter(r => /\.(png|jpe?g|webp|avif|svg)$/.test(r.name)).map(r => r.name.split('/').pop() + ' ' + (r.decodedBodySize / 1024).toFixed(1) + 'KiB'),
      fcpMs: Math.round(fcp), lcpMs: Math.round(window.__lcp), cls: +window.__cls.toFixed(4), domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd) }
  })
  await page.context().close()
}
results.version = version
writeFileSync(OUT + 'results.json', JSON.stringify(results, null, 1))
writeFileSync(OUT + 'manifest.json', JSON.stringify({ version, base: BASE, captures: results.manifest }, null, 1))
console.log(JSON.stringify({ version, screens: results.screens.length, nonGet: results.nonGet, errors: results.errors }))
await browser.close()
