// Audit metrics, evaluated inside the page. Read-only: never clicks, types or submits.
export const collect = () => {
  const parse = s => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 } }
  const hex = c => '#' + [c.r, c.g, c.b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase()
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b) }
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
  const blend = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 })
  const visible = el => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05 }
  const bgOf = el => { // effective background colour; null when an image/gradient sits behind
    const layers = []
    for (let n = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n)
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null
      const c = parse(cs.backgroundColor); if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break }
    }
    let base = { r: 255, g: 255, b: 255, a: 1 }
    for (const l of layers.reverse()) base = blend(l, base)
    return base
  }
  const text = [], small = [], readSmall = [], lowContrast = []
  let checked = 0, minRatio = 99
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el)) continue
    const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(' ').trim()
    if (!own) continue
    const cs = getComputedStyle(el), size = parseFloat(cs.fontSize), weight = +cs.fontWeight
    if (size < 13) small.push({ text: own.slice(0, 40), size })
    if (['P', 'LI', 'DD'].includes(el.tagName) && size < 16 && own.length > 40) readSmall.push({ text: own.slice(0, 50), size })
    const fg = parse(cs.color), bg = bgOf(el)
    if (!fg || !bg) continue
    const r = ratio(fg.a < 1 ? blend(fg, bg) : fg, bg); checked++
    if (r < minRatio) minRatio = r
    const large = size >= 24 || (size >= 18.66 && weight >= 700)
    if (r < (large ? 3 : 4.5)) lowContrast.push({ text: own.slice(0, 40), fg: hex(fg), bg: hex(bg), ratio: +r.toFixed(2), size })
    text.push(r)
  }
  const focusables = [...document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [role=button], [tabindex]:not([tabindex="-1"])')].filter(visible)
  const targets = focusables.map(el => { const r = el.getBoundingClientRect(); return { el, w: r.width, h: r.height, x: r.x, y: r.y } })
  const inText = el => el.tagName === 'A' && el.closest('p, li') && !el.closest('nav')
  const under24 = targets.filter(t => !inText(t.el) && (t.h < 24 || t.w < 24) && t.el.type !== 'checkbox' && t.el.type !== 'radio')
  const under44 = targets.filter(t => !inText(t.el) && t.h < 44 && t.el.type !== 'checkbox' && t.el.type !== 'radio')
  const desc = el => (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + ' "' + (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '').trim().slice(0, 30) + '"')
  const named = el => [el.getAttribute('aria-label'), el.getAttribute('aria-labelledby') && document.getElementById(el.getAttribute('aria-labelledby'))?.textContent, el.textContent, el.getAttribute('title'), el.getAttribute('alt')].some(v => v && v.trim())
  const unnamed = focusables.filter(el => ['A', 'BUTTON'].includes(el.tagName) && !named(el) && !el.querySelector('img[alt]:not([alt=""])')).map(desc)
  const fields = [...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea')].filter(visible)
  const unlabeled = fields.filter(f => !(f.id && document.querySelector(`label[for="${CSS.escape(f.id)}"]`)) && !f.closest('label') && !f.getAttribute('aria-labelledby')).map(f => desc(f) + (f.getAttribute('aria-label') ? ' (aria-label only)' : ''))
  const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(visible).map(h => +h.tagName[1])
  const skips = headings.filter((h, i) => i > 0 && h > headings[i - 1] + 1).length
  const colours = {}
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el)) continue
    const cs = getComputedStyle(el), r = el.getBoundingClientRect()
    for (const [k, v, w] of [['bg', cs.backgroundColor, r.width * r.height], ['text', cs.color, 1], ['border', cs.borderTopWidth !== '0px' ? cs.borderTopColor : '', 1]]) {
      const c = parse(v || ''); if (!c || c.a === 0) continue
      const key = k + ' ' + hex(c); colours[key] = (colours[key] || 0) + w
    }
  }
  return {
    url: location.pathname + location.search, viewport: [innerWidth, innerHeight],
    overflow: document.documentElement.scrollWidth - innerWidth,
    textChecked: checked, minContrast: +minRatio.toFixed(2), lowContrast: lowContrast.slice(0, 12), lowContrastCount: lowContrast.length,
    under13px: small.length, under13Samples: small.slice(0, 5), readingTextUnder16: readSmall.length, readingSamples: readSmall.slice(0, 4),
    targets: targets.length, targetsUnder24: under24.length, under24Samples: under24.slice(0, 6).map(t => desc(t.el) + ` ${Math.round(t.w)}x${Math.round(t.h)}`),
    targetsUnder44: under44.length, under44Samples: under44.slice(0, 6).map(t => desc(t.el) + ` ${Math.round(t.w)}x${Math.round(t.h)}`),
    unnamedControls: unnamed, unlabeledFields: unlabeled, headings, headingSkips: skips, h1Count: headings.filter(h => h === 1).length,
    colours: Object.entries(colours).sort((a, b) => b[1] - a[1]).slice(0, 40),
    inputMode: document.documentElement.dataset.input || null,
  }
}

// Tab walk: records what the focus ring looks like on each stop (no activation of anything).
export async function tabWalk(page, steps = 12) {
  const stops = []
  for (let i = 0; i < steps; i++) {
    await page.keyboard.press('Tab')
    stops.push(await page.evaluate(() => {
      const el = document.activeElement; if (!el || el === document.body) return null
      const cs = getComputedStyle(el), r = el.getBoundingClientRect()
      return { el: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + ' ' + (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24),
        outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`, shadow: cs.boxShadow !== 'none', visibleRing: (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2) || cs.boxShadow !== 'none',
        inViewport: r.top >= 0 && r.bottom <= innerHeight, transition: cs.transitionDuration }
    }))
  }
  return stops.filter(Boolean)
}
