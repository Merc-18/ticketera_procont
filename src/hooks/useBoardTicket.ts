import { useCallback, useEffect, useState } from 'react'
import { board } from '../lib/api'
import type { BoardTicket } from '../lib/board'

/** Snapshot autoritativo del ticket (get_board_ticket): estado general, progresos y pendientes. */
export function useBoardTicket(projectId: string) {
  const [ticket, setTicket] = useState<BoardTicket | null>(null)
  const [error, setError] = useState<string | null>(null)
  const reload = useCallback(async () => {
    try { setTicket(await board.getTicket(projectId)); setError(null) }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo cargar el ticket.') }
  }, [projectId])
  useEffect(() => { void reload() }, [reload])
  return { ticket, setTicket, error, reload }
}
