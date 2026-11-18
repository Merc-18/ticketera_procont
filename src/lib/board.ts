// Operaciones del tablero (migración 20261118000800_board_operations, Codex).
// Reutiliza el adaptador contracts/board-operations-client.mjs: el frontend no escribe fases,
// responsables, prioridad, estado, bloqueo, progreso ni auditoría; todo pasa por las RPC
// get_board_ticket, operate_board_ticket, operate_board_tickets y reserve_board_evidence.
import { createBoardOperations, DEVELOPMENT_PHASES } from '../../contracts/board-operations-client.mjs'
import type {
  BoardTicket, BoardFlow, PendingItem, Phase, Priority, EvidenceGrant, BoardRpcClient,
} from '../../contracts/board-operations-client.d.mts'
import { errorMessage } from './supabase-errors.ts'

export type { BoardTicket, BoardFlow, PendingItem, Phase, Priority, EvidenceGrant }
export { DEVELOPMENT_PHASES }

/** Flujo Administrative: solo histórico (proyectos anteriores a M12). */
export const ADMINISTRATIVE_PHASES = ['backlog', 'ready_to_start', 'discovery', 'design', 'build', 'uat_validation', 'deployed'] as const

export const phasesFor = (flowType: string): readonly string[] =>
  flowType === 'administrative' ? ADMINISTRATIVE_PHASES : DEVELOPMENT_PHASES
export const finalPhase = (flowType: string) => (flowType === 'administrative' ? 'deployed' : 'done')

/** Destinos de reapertura admitidos por el servidor: cualquier fase válida del flujo excepto la final. */
export const reopenTargets = (flowType: string) => phasesFor(flowType).filter(p => p !== finalPhase(flowType))

/**
 * ¿Mover este flujo a `target` cierra el ticket? Solo si es la fase final y los demás flujos
 * (históricos Dual) ya están en su fase final. Es la misma condición que aplica el servidor.
 */
export function isClosingMove(ticket: Pick<BoardTicket, 'flows'>, flowId: string, target: string) {
  const flow = ticket.flows.find(f => f.id === flowId)
  if (!flow || target !== finalPhase(flow.flow_type)) return false
  return ticket.flows.every(f => f.id === flowId || f.phase === finalPhase(f.flow_type))
}

/** Cierre que exige confirmación explícita: hay tareas pendientes del checklist. */
export const needsPendingConfirmation = (ticket: BoardTicket, flowId: string, target: string) =>
  isClosingMove(ticket, flowId, target) && ticket.pending_items.length > 0

// Mensajes del servidor (RAISE) traducidos; el resto se resuelve por código SQLSTATE.
const SERVER_MESSAGES: [RegExp, string][] = [
  [/Unblock before changing phase/i, 'El ticket está bloqueado: desbloquéalo antes de cambiar de fase o terminarlo.'],
  [/Blocked work cannot change phase/i, 'El ticket está bloqueado: desbloquéalo antes de cambiar de fase o terminarlo.'],
  [/Confirm the exact current pending checklist/i, 'El checklist cambió o falta confirmar las tareas pendientes. Revisa la lista y confirma de nuevo.'],
  [/Only administrators may reassign blocked/i, 'Mientras el ticket está bloqueado solo admin o superadmin pueden reasignarlo.'],
  [/Finished work requires explicit reopening/i, 'El ticket está terminado. Usa «Reabrir ticket» e indica el motivo.'],
  [/Reopening requires a reason/i, 'Para reabrir indica un motivo y una fase distinta de Done.'],
  [/Only finished work can be reopened/i, 'Solo se puede reabrir un ticket terminado.'],
  [/Only active work can move/i, 'Solo los tickets activos pueden cambiar de fase. Restaura o reabre el ticket primero.'],
  [/Blocking reason required/i, 'Indica el motivo del bloqueo.'],
  [/Only unfinished active work can be blocked/i, 'Solo se pueden bloquear tickets activos no terminados.'],
  [/Restore archived\/deleted work first/i, 'Restaura el ticket antes de operar con él.'],
  [/Select between 1 and 100/i, 'Selecciona entre 1 y 100 tickets por operación.'],
  [/Some selected tickets are unavailable/i, 'Algunos tickets seleccionados ya no están disponibles. Actualiza la vista.'],
  [/Ticket is not archived or deleted/i, 'El ticket no está archivado.'],
  [/Specify one flow/i, 'Indica el flujo del ticket.'],
  [/Invalid target phase/i, 'La fase elegida no es válida para este flujo.'],
  [/Evidence reservation unavailable|Attachment count or combined byte limit/i, 'Se alcanzó el límite de evidencias del ticket (4 archivos / 2,5 MB) o la reserva venció.'],
  [/Ticket unavailable/i, 'El ticket no está disponible o no tienes acceso.'],
]

export function boardErrorMessage(error: unknown): string {
  const message = error && typeof error === 'object' && 'message' in error ? String((error as any).message) : ''
  for (const [pattern, text] of SERVER_MESSAGES) if (pattern.test(message)) return text
  return errorMessage(error)
}

/**
 * Envuelve el cliente para conservar el error real de la RPC (el adaptador de Codex lanza un
 * mensaje genérico) y traducirlo sin exponer detalles internos.
 */
export function createBoard(client: BoardRpcClient) {
  let last: unknown = null
  const tracking: BoardRpcClient = {
    rpc: (name, args) => Promise.resolve(client.rpc(name, args)).then(r => { last = r.error ?? null; return r }),
  }
  const ops = createBoardOperations(tracking)
  const wrap = <A extends unknown[], R>(fn: (...args: A) => Promise<R>) => async (...args: A): Promise<R> => {
    last = null
    try { return await fn(...args) }
    catch (err) { throw new Error(last ? boardErrorMessage(last) : boardErrorMessage(err)) }
  }
  return {
    getTicket: wrap(ops.getTicket),
    movePhase: wrap(ops.movePhase),
    reopen: wrap(ops.reopen),
    assign: wrap(ops.assign),
    setPriority: wrap(ops.setPriority),
    block: wrap(ops.block),
    unblock: wrap(ops.unblock),
    archive: wrap(ops.archive),
    restore: wrap(ops.restore),
    bulk: wrap(ops.bulk),
    reserveEvidence: wrap(ops.reserveEvidence),
  }
}
export type Board = ReturnType<typeof createBoard>

/** Una UUID por acción del usuario (los reintentos de la misma acción reutilizan la suya). */
export const actionKey = () => crypto.randomUUID()

/** Porcentaje del servidor con formato; null → sin dato (nunca un cero ficticio). */
export const pct = (value: number | null | undefined) =>
  value == null ? null : `${Number(value).toLocaleString('es-PE', { maximumFractionDigits: 2 })}%`

/** Posición ordinal de la fase (dato, no porcentaje): el porcentaje oficial lo da el snapshot del servidor. */
export function phasePosition(flowType: string, phase: string) {
  const list = phasesFor(flowType)
  const index = list.indexOf(phase)
  return { index, count: list.length, label: index < 0 ? '—' : `${index + 1}/${list.length}` }
}
/** Conteo del checklist cargado con el flujo (sin porcentaje calculado en el navegador). */
export function checklistCount(flow: { checklist_items?: { completed: boolean }[] }) {
  const items = flow.checklist_items ?? []
  return { done: items.filter(i => i.completed).length, total: items.length }
}
