import { useEffect, useMemo, useState } from 'react'
import { metrics } from '../../lib/api'
import { supabase } from '../../lib/supabase'
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
/** Límites del mes en Lima (UTC−5, sin horario de verano) en ISO UTC. */
const monthRange = (m: string) => {
  const [y, mo] = m.split('-').map(Number)
  const next = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`
  return { from: `${m}-01T05:00:00.000Z`, to: `${next}-01T05:00:00.000Z` }
}

type UrgentRow = { requester_name: string; studio_id: string | null; created_at: string; requested_priority: string | null }

/**
 * Urgencias solicitadas (compacto, D-045). Dos fuentes que NO se suman:
 *  1. Prioridad «Urgente» elegida por el cliente (`requests.requested_priority`), fuente para las solicitudes nuevas.
 *  2. Casilla anterior «atención urgente» (`urgent_requested`), solo histórico, vía metrics_monthly_urgency (M11).
 * Solo usuarios internos autorizados. Respeta el filtro de estudio del Dashboard.
 */
export default function UrgencyStatsPanel({ studios, studioId }: { studios: { id: string; name: string }[]; studioId: string | null }) {
  const months = useMemo(() => lastMonths(6), [])
  const [month, setMonth] = useState(months[0])
  const [urgent, setUrgent] = useState<UrgentRow[] | null>(null)
  const [urgentError, setUrgentError] = useState(false)
  const [history, setHistory] = useState<MetricResult<UrgencyRow[]> | null>(null)

  useEffect(() => {
    let current = true
    const { from, to } = monthRange(month)
    setUrgent(null); setUrgentError(false); setHistory(null)
    void supabase.from('requests').select('requester_name, studio_id, created_at, requested_priority')
      .eq('requested_priority', 'urgent').gte('created_at', from).lt('created_at', to)
      .then(({ data, error }) => {
        if (!current) return
        if (error) { setUrgentError(true); return }
        // Defensa: se vuelve a filtrar en el cliente por prioridad y mes.
        setUrgent(((data ?? []) as UrgentRow[]).filter(r => r.requested_priority === 'urgent' && r.created_at >= from && r.created_at < to))
      })
    void metrics.monthlyUrgency(month).then(r => { if (current) setHistory(r) })
    return () => { current = false }
  }, [month])

  const scoped = (urgent ?? []).filter(r => !studioId || r.studio_id === studioId)
  const groups = new Map<string, { name: string; studio: string; count: number }>()
  for (const r of scoped) {
    const key = `${r.requester_name.trim().toLowerCase()}|${r.studio_id ?? ''}`
    const studio = studios.find(s => s.id === r.studio_id)?.name ?? 'Sin estudio'
    const g = groups.get(key) ?? { name: r.requester_name.trim(), studio, count: 0 }
    g.count++; groups.set(key, g)
  }
  const top = [...groups.values()].sort((a, b) => b.count - a.count).slice(0, 5)
  const historicRows = history?.state === 'ready' ? history.data.filter(r => !studioId || r.studio_id === studioId) : []
  const historicTotal = historicRows.reduce((n, r) => n + r.urgent_requests, 0)

  return (
    <section className="metric-chart urgency-panel" aria-labelledby="urgency-title">
      <div className="urgency-head">
        <div>
          <h2 id="urgency-title">Urgencias solicitadas</h2>
          <p className="metric-note">Prioridad «Urgente» elegida por el cliente · uso interno</p>
        </div>
        <label className="toolbar-field">
          <span>Mes</span>
          <select value={month} onChange={e => setMonth(e.target.value)} className="ui-input toolbar-select">
            {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </label>
      </div>
      {urgentError ? <p role="alert" className="metric-note">No se pudieron cargar las solicitudes urgentes.</p>
        : urgent === null ? <p role="status" className="metric-note">Cargando…</p>
        : top.length === 0 ? <p className="metric-note">Sin solicitudes con prioridad Urgente en {monthLabel(month)}.</p>
        : (
          <ol className="urgency-list">
            {top.map(g => (
              <li key={`${g.name}|${g.studio}`}>
                <span className="min-w-0"><b>{g.name}</b><span className="metric-note">{g.studio}</span></span>
                <span className="urgency-count">{g.count}</span>
              </li>
            ))}
            {groups.size > top.length && <li className="metric-note">y {groups.size - top.length} solicitante(s) más · {scoped.length} en total</li>}
          </ol>
        )}
      <div className="urgency-history">
        <p className="metric-note"><b>Histórico · casilla anterior</b> (no se suma a lo anterior)</p>
        {history?.state !== 'ready' ? <MetricState result={history} />
          : historicRows.length === 0 ? <p className="metric-note">Sin datos suficientes para {monthLabel(month)}.</p>
          : <p className="metric-note">{historicTotal} solicitud(es) marcadas como urgentes con la casilla anterior en {monthLabel(month)}.</p>}
      </div>
    </section>
  )
}
