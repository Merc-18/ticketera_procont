/** Ticket age uses immutable board creation, never request/flow creation, assignment or last update. */
export function limaDate(value: string | Date = new Date()): string | null {
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const part = (key: string) => parts.find(p => p.type === key)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}
export const limaToday = (now = new Date()) => limaDate(now)!
const ordinal = (day: string) => Date.parse(`${day}T00:00:00Z`) / 86_400_000
/** Calendar days in Lima, not rounded 24-hour periods. Unknown dates never become invented ages. */
export function ticketAgeDays(createdAt?: string | null, today = limaToday()): number | null {
  if (!createdAt) return null
  const created = limaDate(createdAt)
  if (!created || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return null
  const days = ordinal(today) - ordinal(created)
  return Number.isFinite(days) ? Math.max(0, days) : null
}
export function ticketAgeLabel(createdAt?: string | null, today = limaToday()): string {
  const days = ticketAgeDays(createdAt, today)
  return days === null ? 'Antigüedad no disponible' : days === 0 ? 'Hoy' : days === 1 ? '1 día en tablero' : `${days} días en tablero`
}
export function averageTicketAge(tickets: { created_at?: string | null }[], today = limaToday()): number | null {
  const ages = tickets.map(t => ticketAgeDays(t.created_at, today)).filter((n): n is number => n !== null)
  return ages.length ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : null
}
