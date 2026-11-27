import { ticketAgeLabel } from '../../lib/ticket-age'
import { useLimaDay } from '../../hooks/useLimaDay'
export default function TicketAge({ createdAt }: { createdAt?: string | null }) {
  const today = useLimaDay()
  return <span className="ticket-age" aria-label={`Antigüedad: ${ticketAgeLabel(createdAt, today)}`}>{ticketAgeLabel(createdAt, today)}</span>
}
