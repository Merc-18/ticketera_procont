import type { MetricResult } from '../../lib/metrics-adapter'

/** Estados no disponibles de una métrica del servidor, sin inventar valores. */
export default function MetricState({ result, compact = false }: { result: MetricResult<unknown> | null; compact?: boolean }) {
  const cls = compact ? 'text-xs' : 'text-sm'
  if (result === null) return <p className={`${cls} text-gray-400`}>Cargando…</p>
  if (result.state === 'pending_contract') {
    return <p className={`${cls} text-gray-500`}>Pendiente de integración con las métricas del servidor.</p>
  }
  if (result.state === 'error') return <p className={`${cls} text-red-700`}>{result.message}</p>
  return null
}
