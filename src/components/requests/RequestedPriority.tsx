import { REQUESTED_PRIORITIES, type RequestedPriorityValue } from '../../lib/client-request-data'
import { PRIORITY_COLORS } from '../../lib/constants'

/** Presentación descriptiva: no asigna ni cambia la prioridad administrativa. */
export default function RequestedPriority({ value, internal = false }: { value: RequestedPriorityValue | null | undefined; internal?: boolean }) {
  return <div className="text-sm text-gray-700">
    <span className="text-xs text-gray-500">{internal ? 'Prioridad solicitada por el cliente' : 'Prioridad solicitada'}</span>
    <p>{value
      ? <span className={`inline-flex items-center px-2 py-0.5 rounded text-[13px] font-medium ${PRIORITY_COLORS[value]}`}>{REQUESTED_PRIORITIES[value]}</span>
      : <span className="font-medium text-gray-700">Sin prioridad solicitada registrada</span>}</p>
  </div>
}
