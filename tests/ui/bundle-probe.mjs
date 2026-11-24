// Misma métrica de Taste scripts/perf.mjs: Script y sum(decoded || encoded).
// Network.dataReceived.dataLength son bytes decodificados; no se suma el total emitido.
export async function observeScripts(page) {
  const session = await page.context().newCDPSession(page)
  const requests = new Map()
  await session.send('Network.enable')
  await session.send('Network.setCacheDisabled', { cacheDisabled: true })
  session.on('Network.requestWillBeSent', ({ requestId, request, type }) => {
    requests.set(requestId, { url: request.url, type, decoded: 0, encoded: 0, status: 0, canceled: false, failed: false })
  })
  session.on('Network.dataReceived', ({ requestId, dataLength }) => {
    const row = requests.get(requestId)
    if (row) row.decoded += dataLength
  })
  session.on('Network.responseReceived', ({ requestId, response }) => {
    const row = requests.get(requestId)
    if (row) row.status = response.status
  })
  session.on('Network.loadingFinished', ({ requestId, encodedDataLength }) => {
    const row = requests.get(requestId)
    if (row) row.encoded = encodedDataLength
  })
  session.on('Network.loadingFailed', ({ requestId, canceled }) => {
    const row = requests.get(requestId)
    if (row) { row.failed = true; row.canceled = canceled === true }
  })
  return {
    reset() { requests.clear() },
    async snapshot(label) {
      await page.waitForLoadState('networkidle')
      const scripts = [...requests.values()].filter(r => r.type === 'Script' && !/^(data|blob|chrome):/.test(r.url))
      const bytes = scripts.reduce((sum, r) => sum + (r.decoded || r.encoded), 0)
      const kib = Math.round(bytes / 102.4) / 10 // redondeo exacto de Taste
      return { label, bytes, kib, verdict: kib > 900 ? 'FAIL' : kib > 450 ? 'WARN' : 'PASS', scripts }
    },
  }
}
