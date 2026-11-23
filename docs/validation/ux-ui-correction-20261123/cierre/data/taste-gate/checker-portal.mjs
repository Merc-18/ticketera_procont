import { preview, build } from 'vite'
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
const label = process.argv[2]
const here = new URL('./', import.meta.url).pathname
const root = new URL('../../', import.meta.url).pathname
const S = root + '.agent-artifacts/audit/skills/taste/taste-skill-main/skills/taste-skill/scripts/consistency.mjs'
const outDir = `.agent-artifacts/taste-gate/site-${label}`
process.chdir(root)
Object.assign(process.env, { VITE_SUPABASE_URL: 'http://127.0.0.1:9', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_gate_local_only' })
await build({ root, logLevel: 'error', build: { outDir: root + outDir, emptyOutDir: true } })
const server = await preview({ root, logLevel: 'error', build: { outDir }, preview: { host: '127.0.0.1', port: 0 } })
const base = `http://127.0.0.1:${server.httpServer.address().port}`
const r = await new Promise(resolve => { let out = ''; const c = spawn('node', [S, base + '/portal', '--widths', '1440,390', '--page', 'software', '--profile', '.taste-skill/chrome-extra',
  '--category', 'Mesa de solicitudes de Procont Business', '--primary', 'Nueva Solicitud', '--out', `.taste-skill/portal-${label}`],
  { cwd: here, env: process.env }); c.stdout.on('data', d => { out += d }); c.stderr.on('data', d => { out += d })
  const timer = setTimeout(() => c.kill('SIGKILL'), 580000); c.on('close', status => { clearTimeout(timer); resolve({ status, out }) }) })
writeFileSync(here + `checker-portal-${label}.log`, r.out)
console.log('exit', r.status)
await server.close()
