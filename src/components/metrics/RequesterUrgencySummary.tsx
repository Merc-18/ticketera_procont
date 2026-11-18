import { useEffect, useState } from 'react'
import { metrics } from '../../lib/api'
import { limaMonth, type MetricResult, type UrgencyRow } from '../../lib/metrics-adapter'
import MetricState from './MetricState'

const monthLabel = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString('es-PE', { month: 'long', year: 'numeric', timeZone: 'America/Lima' })

/**
 * Resumen discreto del historial mensual de urgencias del solicitante y su estudio, para el
 * validador. Los datos vienen del servidor (contrato de Codex); el mes es el de la solicitud.
 */
export default function RequesterUrgencySummary({ requestId, createdAt }: { requestId: string; createdAt: string }) {
  const month = limaMonth(new Date(createdAt))
  const [result, setResult] = useState<MetricResult<UrgencyRow> | null>(null)
  useEffect(() => { setResult(null); void metrics.requesterUrgency(requestId, month).then(setResult) }, [requestId, month])

  return (
    <div className="border border-gray-200 rounded-lg px-3 py-2.5 bg-white">
      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Historial de urgencias · {monthLabel(month)}</p>
      {result?.state === 'ready' ? (
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
          <span className="text-gray-800 font-medium">{result.data.requester_name}</span>
          <span className="text-gray-500">{result.data.studio_name ?? 'Sin estudio'}</span>
          <span className="text-gray-700"><strong>{result.data.total_requests}</strong> solicitudes</span>
          <span className="text-gray-700"><strong>{result.data.urgent_requests}</strong> urgentes</span>
          <span className={`font-semibold ${result.data.urgent_pct !== null && result.data.urgent_pct >= 50 ? 'text-red-700' : 'text-gray-700'}`}>
            {result.data.urgent_pct === null ? 'Sin datos suficientes' : `${Math.round(result.data.urgent_pct)}% urgentes`}
          </span>
        </div>
      ) : <MetricState result={result} compact />}
    </div>
  )
}
