/**
 * Identificador de versión de la compilación: AAAAMMDDHHmm en America/Lima (UTC-5).
 * Se calcula UNA vez al iniciar el build de Vite (vite.config.ts) y queda incrustado en el
 * bundle mediante `define`; el navegador nunca lo recalcula.
 */
export function formatBuildVersion(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? ''
  const version = `${get('year')}${get('month')}${get('day')}${get('hour')}${get('minute')}`
  if (!/^\d{12}$/.test(version)) throw new Error(`Versión de compilación inválida: ${version}`)
  return version
}
