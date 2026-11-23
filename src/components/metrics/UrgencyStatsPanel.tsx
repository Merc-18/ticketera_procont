import { useEffect, useMemo, useState } from 'react'
import { metrics } from '../../lib/api'
import { limaMonth, type MetricResult, type UrgencyRow } from '../../lib/metrics-adapter'
import MetricState from './MetricState'

const lastMonths = (n: number) => {
  const out: string[] = []; const d = new Date()
  for (let i = 0; i < n; i++) { out.push(limaMonth(new Date(d.getFullYear(), d.getMonth() - i, 15))) }
  return out
}
const monthLabel = (m: string) => {
  const t = new Date(`${m}-15T12:00:00Z`).toLocaleDateString('es-PE', { month: 'long', year: 'numeric', timeZone: 'America/Lima' })
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/**
 * Estadísticas mensuales de solicitudes urgentes por solicitante y estudio (solo usuarios internos
 * autorizados). Datos exclusivamente del servidor (contrato de Codex); sin cálculos locales.
 */
export default function UrgencyStatsPanel() {
  const months = useMemo(() => lastMonths(6), [])
  const [month, setMonth] = useState(months[0])
  const [result, setResult] = useState<MetricResult<UrgencyRow[]> | null>(null)
  useEffect(() => { setResult(null); void metrics.monthlyUrgency(month).then(setResult) }, [month])

  const rows = result?.state === 'ready'
    ? [...result.data].sort((a, b) => b.urgent_requests - a.urgent_requests || b.total_requests - a.total_requests) : []

  return (
    <section className="bg-white rounded-xl border p-5 shadow-sm space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-800 text-base">Solicitudes urgentes por solicitante y estudio</h2>
          <p className="text-sm text-gray-600">Urgencia solicitada por el cliente · uso interno</p>
        </div>
        <label className="toolbar-field">
          <span>Mes</span>
          <select value={month} onChange={e => setMonth(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-primary">
            {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </label>
      </div>
      {result?.state !== 'ready' ? <MetricState result={result} /> : rows.length === 0 ? (
        <p className="text-sm text-gray-600">Sin datos suficientes para {monthLabel(month)}.</p>
      ) : (
        <>
        {/* Móvil: tarjetas compactas */}
        <ul className="sm:hidden divide-y divide-gray-100">
          {rows.map(r => (
            <li key={`m-${r.requester_name}|${r.studio_id ?? ''}`} className="py-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{r.requester_name}</p>
                  <p className="text-xs text-gray-500 truncate">{r.studio_name ?? 'Sin estudio'}</p>
                </div>
                <p className={`text-sm font-semibold tabular-nums ${r.urgent_pct !== null && r.urgent_pct >= 50 ? 'text-red-700' : 'text-gray-800'}`}>
                  {r.urgent_pct === null ? '—' : `${Math.round(r.urgent_pct)}%`}</p>
              </div>
              <p className="text-xs text-gray-600 mt-0.5"><strong>{r.urgent_requests}</strong> urgentes de <strong>{r.total_requests}</strong> solicitudes</p>
            </li>
          ))}
        </ul>
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b">
                <th className="py-2 pr-3 font-semibold">Solicitante</th>
                <th className="py-2 pr-3 font-semibold">Estudio</th>
                <th className="py-2 pr-3 font-semibold text-right">Solicitudes</th>
                <th className="py-2 pr-3 font-semibold text-right">Urgentes</th>
                <th className="py-2 font-semibold text-right">% urgentes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(r => (
                <tr key={`${r.requester_name}|${r.studio_id ?? ''}`}>
                  <td className="py-2 pr-3 text-gray-900">{r.requester_name}</td>
                  <td className="py-2 pr-3 text-gray-600">{r.studio_name ?? 'Sin estudio'}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{r.total_requests}</td>
                  <td className="py-2 pr-3 text-right tabular-nums font-semibold">{r.urgent_requests}</td>
                  <td className="py-2 text-right">
                    {r.urgent_pct === null ? <span className="text-gray-500">—</span> : (
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden hidden sm:block">
                          <div className={`h-full ${r.urgent_pct >= 50 ? 'bg-red-700' : 'bg-accent-400'}`} style={{ width: `${r.urgent_pct}%` }} />
                        </div>
                        <span className="tabular-nums">{Math.round(r.urgent_pct)}%</span>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </section>
  )
}
