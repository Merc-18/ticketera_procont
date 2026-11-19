import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { formatBuildVersion } from '../src/lib/build-version.ts'

test('formato exacto AAAAMMDDHHmm de 12 dígitos en America/Lima (UTC-5)', () => {
  assert.equal(formatBuildVersion(new Date('2026-11-19T22:30:00Z')), '202611191730')
  assert.match(formatBuildVersion(new Date()), /^\d{12}$/)
})

test('cambio de día y medianoche según Lima, no UTC ni la zona del equipo', () => {
  assert.equal(formatBuildVersion(new Date('2026-11-20T03:05:00Z')), '202611192205')  // aún 19/11 en Lima
  assert.equal(formatBuildVersion(new Date('2026-11-20T05:00:00Z')), '202611200000')  // medianoche en Lima
  assert.equal(formatBuildVersion(new Date('2026-01-01T04:59:59Z')), '202512312359')  // sin segundos
})

test('la versión se fija en vite.config.ts al compilar y el pie muestra solo «Versión» + 12 dígitos', () => {
  const config = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8')
  assert.match(config, /const BUILD_VERSION = formatBuildVersion\(new Date\(\)\)/)
  assert.match(config, /__BUILD_VERSION__: JSON\.stringify\(BUILD_VERSION\)/)
  const component = readFileSync(new URL('../src/components/ui/BuildVersion.tsx', import.meta.url), 'utf8')
  assert.match(component, />\s*Versión \{__BUILD_VERSION__\}\s*</)
  assert.doesNotMatch(component, /new Date|Date\.now/)   // nunca la hora del navegador
})
