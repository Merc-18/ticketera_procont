import { build } from 'vite'
import { writeFileSync } from 'node:fs'
const ROOT = new URL('../../', import.meta.url).pathname
const out = {}
await build({ root: ROOT, logLevel: 'error', build: { outDir: ROOT + '.agent-artifacts/perf-close/build-' + (process.argv[2]||'a'), emptyOutDir: true, write: true },
  plugins: [{ name: 'size-map', generateBundle(_, bundle) {
    for (const [file, c] of Object.entries(bundle)) if (c.type === 'chunk') {
      const mods = {}
      for (const [id, m] of Object.entries(c.modules)) { const k = id.includes('node_modules') ? 'npm:' + id.split('node_modules/').pop().split('/').slice(0, id.split('node_modules/').pop().startsWith('@') ? 2 : 1).join('/') : id.replace(ROOT, ''); mods[k] = (mods[k] || 0) + m.renderedLength }
      out[file] = { total: c.code.length, dynamicImports: c.dynamicImports, mods: Object.entries(mods).sort((a, b) => b[1] - a[1]) }
    } } }] })
writeFileSync(ROOT + '.agent-artifacts/perf-close/modules-' + (process.argv[2]||'a') + '.json', JSON.stringify(out, null, 1))
for (const [f, c] of Object.entries(out)) if (c.total > 20000) { console.log('==', f, (c.total/1024).toFixed(1)); for (const [m, s] of c.mods.slice(0, 14)) console.log('   ', (s/1024).toFixed(1), m) }
