// Escribe solo el archivo .env.local ignorado por Git para conectar Vite al PostgREST QA.
import { createHmac } from 'node:crypto'
import { chmodSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
const secretPath = resolve(process.env.QA_JWT_SECRET_FILE ?? '.agent-artifacts/qa-integral-20261125/runtime/qa-jwt-secret')
const secret = readFileSync(secretPath, 'utf8').trim()
const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url')
const h = b64({ alg: 'HS256', typ: 'JWT' }), p = b64({ iss: 'supabase', role: 'anon', iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+86400 })
const token = `${h}.${p}.${createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url')}`
const envPath = resolve('.env.local')
const browserHost = process.env.QA_BROWSER_HOST ?? 'localhost'
writeFileSync(envPath, `VITE_SUPABASE_URL=http://${browserHost}:54321\nVITE_SUPABASE_PUBLISHABLE_KEY=${token}\nVITE_CLIENT_LOGIN_ENABLED=1\nVITE_CLIENT_PORTAL_MOCK=0\n`)
chmodSync(envPath, 0o600)
console.log('Wrote ignored local QA Vite configuration; key is a disposable anon-role JWT and is not printed.')
