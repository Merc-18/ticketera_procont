import { ticketAgeDays, ticketAgeLabel } from '../../lib/ticket-age'
import { useLimaDay } from '../../hooks/useLimaDay'
export default function TicketAge({ createdAt, compact = false }: { createdAt?: string | null; compact?: boolean }) {
  const today = useLimaDay()
  const label = ticketAgeLabel(createdAt, today)
  const days = ticketAgeDays(createdAt, today)
  const value = compact ? (days === null ? '—' : days === 0 ? 'Hoy' : `${days}d`) : label
  return <span className="ticket-age" title={`Antigüedad: ${label}`} aria-label={`Antigüedad: ${label}`}>{value}</span>
}
