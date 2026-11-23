// Lee las variables de tema del CSS compilado (dist) y mide contrastes WCAG de los pares de uso real.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
const dist = 'dist/assets/'
const css = readFileSync(dist + readdirSync(dist).find(f => /^index-.*\.css$/.test(f)), 'utf8')
const block = sel => {
  const out = {}
  const re = new RegExp(sel.replace(/[[\]()"=]/g, m => '\\' + m) + '\\{([^}]*)\\}', 'g')
  for (const m of css.matchAll(re)) for (const d of m[1].split(';')) { const i = d.indexOf(':'); if (i > 0) out[d.slice(0, i).trim()] = d.slice(i + 1).trim() }
  return out
}
const light = block(':root'), dark = { ...light, ...block(':root[data-theme="dark"]'), ...block(':root[data-theme=dark]') }
const toRgb = v => {
  if (!v) return null
  if (v.startsWith('#')) { let h = v.slice(1); if (h.length === 3) h = [...h].map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) }
  const p = v.split(/\s+/).map(Number); return p.length === 3 && p.every(n => !isNaN(n)) ? p : null
}
const hex = rgb => '#' + rgb.map(n => n.toString(16).padStart(2, '0')).join('').toUpperCase()
const lum = ([r, g, b]) => [r, g, b].map(c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0)
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05) }
const get = (t, name) => toRgb((t === 'light' ? light : dark)[name])
// Pares de uso real: [nombre, primer plano, fondo, mínimo]
const P = [
  ['Texto principal / página', '--p-ink', '--p-bg', 4.5], ['Texto principal / superficie', '--p-ink', '--p-surface', 4.5],
  ['Texto secundario / superficie', '--p-ink-2', '--p-surface', 4.5], ['Texto atenuado / superficie', '--p-muted', '--p-surface', 4.5],
  ['Texto atenuado / página', '--p-muted', '--p-bg', 4.5], ['Meta / superficie', '--p-meta', '--p-surface', 4.5], ['Meta / elevada', '--p-meta', '--p-elevated', 4.5],
  ['Placeholder (meta) / campo', '--p-meta', '--p-elevated', 4.5], ['Acción como texto / superficie', '--p-action', '--p-surface', 4.5],
  ['Acción como texto / tinte', '--p-action', '--p-tint', 4.5], ['Botón primario: texto / relleno', '--p-action-ink', '--p-action-fill', 4.5],
  ['Botón primario hover: texto / relleno', '--p-action-ink', '--p-action-fill-hover', 4.5], ['Peligro sólido: texto / relleno', '--danger-fill-ink', '--danger-fill', 4.5],
  ['Error (texto) / superficie', '--danger', '--p-surface', 4.5], ['Error (texto) / tinte de error', '--danger', '--danger-bg', 4.5],
  ['Aviso: texto / tinte', '--warning-ink', '--warning-bg', 4.5], ['Éxito (texto) / superficie', '--success', '--p-surface', 4.5],
  ['Borde de campo / campo (1.4.11)', '--field-line', '--p-elevated', 3], ['Borde de campo / superficie (1.4.11)', '--field-line', '--p-surface', 3],
  ['Foco / página (1.4.11)', '--p-focus', '--p-bg', 3], ['Foco / superficie (1.4.11)', '--p-focus', '--p-surface', 3],
  ['Relleno primario / página (Taste 3:1)', '--p-action-fill', '--p-bg', 3], ['Dorado / superficie (informativo: siempre con etiqueta)', '--gold', '--p-surface', 1],
  ['Superficie / página (escalón)', '--p-surface', '--p-bg', 1], ['Texto blanco / banda', '--p-action-ink', '--p-band', 4.5],
]
// Escalas por rol (insignias tinte + texto + borde, rellenos con texto blanco)
const S = []
for (const f of ['gray', 'brand', 'red', 'green', 'yellow', 'accent']) {
  const txt = f === 'gray' ? ['700', '100'] : f === 'accent' ? ['700', '100'] : f === 'yellow' ? ['800', '50'] : ['700', '50']
  S.push([`Insignia ${f}: text-${f}-${txt[0]} / bg-${f}-${txt[1]}`, `--tx-${f}-${txt[0]}`, `--bg-${f}-${txt[1]}`, 4.5])
}
for (const [f, s] of [['gray', '500'], ['gray', '600'], ['gray', '400'], ['brand', '700'], ['green', '800'], ['red', '700'], ['yellow', '800']]) S.push([`text-${f}-${s} / superficie`, `--tx-${f}-${s}`, '--p-surface', 4.5])
for (const [f, s] of [['brand', '600'], ['brand', '700'], ['red', '700'], ['green', '700'], ['avatar', '1'], ['avatar', '2'], ['avatar', '3'], ['avatar', '4'], ['avatar', '5'], ['gray', '800'], ['gray', '400']]) S.push([`text-white / bg-${f}-${s}`, '#F8FAFC', `--bg-${f}-${s}`, 4.5])
for (const [f, s] of [['brand', '600'], ['red', '700'], ['gray', '400'], ['gray', '500'], ['green', '700']]) S.push([`Barra/punto bg-${f}-${s} / superficie (1.4.11)`, `--bg-${f}-${s}`, '--p-surface', 3])
S.push(['Barra dorada bg-accent-400 / superficie (informativo: barra con etiqueta y número)', '--bg-accent-400', '--p-surface', 1])
S.push(['text-on-accent / bg-accent-400', '#0F172A', '--bg-accent-400', 4.5])
// Corrección de color (23/11/2026): tonos funcionales de KPI, chips sólidos y escalones de profundidad.
S.push(['KPI azul: icono --p-action / --p-tint (1.4.11)', '--p-action', '--p-tint', 3])
S.push(['KPI verde: icono --success / --success-bg (1.4.11)', '--success', '--success-bg', 3])
S.push(['KPI rojo: icono --danger / --danger-bg (1.4.11)', '--danger', '--danger-bg', 3])
S.push(['KPI dorado: icono --gold-ink / --p-accent-tint (1.4.11)', '--gold-ink', '--p-accent-tint', 3])
S.push(['KPI neutro: icono --p-muted / --p-alt (1.4.11)', '--p-muted', '--p-alt', 3])
S.push(['Cifra en alerta --danger / superficie', '--danger', '--p-surface', 4.5])
S.push(['Urgente sólido: text-white / bg-red-700', '#F8FAFC', '--bg-red-700', 4.5])
S.push(['Estado en revisión: text-accent-700 / bg-accent-100', '--tx-accent-700', '--bg-accent-100', 4.5])
S.push(['Estado en proceso: text-brand-700 / bg-brand-100', '--tx-brand-700', '--bg-brand-100', 4.5])
S.push(['Estado aprobada (contorno): text-brand-700 / superficie', '--tx-brand-700', '--p-surface', 4.5])
S.push(['Estado rechazada (contorno): text-red-700 / superficie', '--tx-red-700', '--p-surface', 4.5])
S.push(['Texto en estado vacío --p-ink-2 / --p-alt', '--p-ink-2', '--p-alt', 4.5])
S.push(['Texto atenuado / alterno (filtros)', '--p-muted', '--p-alt', 4.5])
S.push(['Escalón tarjeta Kanban (elevada) / columna (alterno)', '--p-elevated', '--p-alt', 1])
S.push(['Escalón superficie / alterno', '--p-surface', '--p-alt', 1])
const rows = [...P, ...S].map(([name, fg, bgv, min]) => {
  const r = {}
  for (const t of ['light', 'dark']) {
    const a = fg.startsWith('#') ? toRgb(fg) : get(t, fg), b = get(t, bgv)
    const surf = b ?? (bgv === '--p-surface' ? get(t, '--p-surface') : null)
    r[t] = a && surf ? { fg: hex(a), bg: hex(surf), ratio: Math.round(ratio(a, surf) * 100) / 100 } : null
  }
  return { name, fg, bg: bgv, min, ...r, pass: ['light', 'dark'].every(t => !r[t] || r[t].ratio >= min) }
})
const tokens = Object.keys(light).filter(k => k.startsWith('--p-') || ['--gold-ink', '--success-bg', '--elevated', '--gold', '--line', '--field-line', '--success', '--danger', '--danger-bg', '--warning-bg', '--warning-ink', '--danger-fill', '--danger-fill-ink', '--surface'].includes(k))
  .map(k => ({ token: k, light: light[k], dark: dark[k] }))
const roleVars = Object.keys(light).filter(k => /^--(bg|tx|bd)-/.test(k)).map(k => ({ token: k, light: hex(toRgb(light[k])), dark: hex(toRgb(dark[k])) }))
writeFileSync('.agent-artifacts/color-distribution/contrast-measurements.json', JSON.stringify({ source: 'CSS compilado ' + readdirSync(dist).find(f => /^index-.*\.css$/.test(f)), pairs: rows, tokens, roleVars }, null, 1))
const fails = rows.filter(r => !r.pass)
console.log('pares', rows.length, 'fallan', fails.length); for (const f of fails) console.log('FAIL', f.name, JSON.stringify(f.light), JSON.stringify(f.dark))
console.log('role vars', roleVars.length, 'semantic tokens', tokens.length)
