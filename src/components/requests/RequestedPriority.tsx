import { REQUESTED_PRIORITIES, type RequestedPriorityValue } from '../../lib/client-request-data'

/** Presentación descriptiva: no asigna ni cambia la prioridad administrativa. */
export default function RequestedPriority({ value, internal = false }: { value: RequestedPriorityValue | null | undefined; internal?: boolean }) {
  return <div className="text-sm text-gray-700">
    <span className="text-xs text-gray-500">{internal ? 'Prioridad solicitada por el cliente' : 'Prioridad solicitada'}</span>
    <p className="font-medium text-brand-700">{value ? REQUESTED_PRIORITIES[value] : 'Sin prioridad solicitada registrada'}</p>
  </div>
}
