import { Fragment, useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useUsers } from '../../hooks/useUsers'
import { PRIORITY_COLORS, PRIORITY_LABEL, PHASE_LABELS, getInitials } from '../../lib/constants'
import { avatarClass, ownerColorLabel, useOwnerColors } from '../../lib/card-colors'
import { metrics } from '../../lib/api'
import { averageLabel, type MetricResult, type TimeAverages } from '../../lib/metrics-adapter'
import Icon from '../ui/Icon'
import ControlLabel from '../ui/ControlLabel'
import { readVerifiedPages } from '../../lib/verified-pagination'
import { isOverdueDate, limaToday } from '../../lib/workload-dates'

interface FlowRow {
  id: string
  assigned_to: string | null
  flow_type: 'development' | 'administrative'
  current_phase: string
  project_id: string
  projects: { id: string; title: string; priority: 'low' | 'medium' | 'high' | 'urgent'; status: string; is_blocked: boolean; project_number: string | null; due_date: string | null } | null
}
interface Ticket { project: NonNullable<FlowRow['projects']>; phases: string[] }
interface Load { assigned: Ticket[]; active: Ticket[]; inProgress: number; pending: number; blocked: number; overdue: number; completed: number; archived: number }

/**
 * Equipo › Carga de trabajo (24/11/2026). Datos reales de los flujos con responsable principal: cada ticket cuenta
 * una vez por persona. En curso = activos fuera de Backlog; Pendientes = activos en Backlog;
 * Vencidos = activos con fecha objetivo anterior al día actual de Lima. Sin métricas inventadas; los tiempos medios vienen del
 * servidor (metrics_time_averages). Solicitantes de clientes no aparecen: solo usuarios internos.
 */
export default function WorkloadView() {
  const { users, loading: usersLoading, error: usersError, reload: reloadUsers } = useUsers()
  const ownerColors = useOwnerColors()
  const [flows, setFlows] = useState<FlowRow[]>([])
  const [flowsLoading, setFlowsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [averages, setAverages] = useState<MetricResult<TimeAverages> | null>(null)

  const loadFlows = async () => {
    setFlowsLoading(true); setFlows([]); setError(null)
    try {
      const data = await readVerifiedPages((from, to) => supabase.from('project_flows')
        .select('id, assigned_to, flow_type, current_phase, project_id, projects!inner ( id, title, priority, status, is_blocked, project_number, due_date )', { count: 'exact' })
        .in('projects.status', ['active', 'completed', 'archived']).order('id', { ascending: true }).range(from, to))
      setFlows(data as unknown as FlowRow[])
    } catch { setError('No se pudo cargar la carga de trabajo.') }
    finally { setFlowsLoading(false) }
  }
  useEffect(() => {
    void loadFlows()
    void metrics.timeAverages({ periodDays: 90, studioId: null }).then(setAverages)
  }, [])

  if (usersLoading || flowsLoading) {
    return <div className="flex items-center justify-center h-48 text-gray-500 text-sm">Cargando carga de trabajo...</div>
  }
  if (error || usersError) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div><h2 className="text-lg font-medium text-gray-900">Carga de trabajo del equipo</h2>
            <p className="text-sm text-gray-600 mt-0.5">Tickets por responsable principal (cada ticket cuenta una vez por persona).</p></div>
          <button onClick={() => { void Promise.all([loadFlows(), reloadUsers()]) }} className="ui-button ui-button-secondary"><ControlLabel icon="refresh">Actualizar</ControlLabel></button>
        </div>
        <p role="alert" className="text-sm text-red-700">{error ?? usersError} No se muestran conteos incompletos.</p>
      </div>
    )
  }

  const byUser = new Map<string, Map<string, Ticket>>()
  const activeIds = new Set<string>(), withOwner = new Set<string>(), blockedIds = new Set<string>()
  for (const f of flows) {
    if (!f.projects) continue
    if (f.projects.status === 'active') { activeIds.add(f.project_id); if (f.projects.is_blocked) blockedIds.add(f.project_id) }
    if (!f.assigned_to) continue
    if (f.projects.status === 'active') withOwner.add(f.project_id)
    const tickets = byUser.get(f.assigned_to) ?? new Map<string, Ticket>()
    const t = tickets.get(f.project_id) ?? { project: f.projects, phases: [] }
    t.phases.push(f.current_phase)
    tickets.set(f.project_id, t)
    byUser.set(f.assigned_to, tickets)
  }
  const today = limaToday()
  const loadOf = (userId: string): Load => {
    const assigned = [...(byUser.get(userId)?.values() ?? [])]
    const active = assigned.filter(t => t.project.status === 'active')
    return { assigned, active, inProgress: active.filter(t => t.phases.some(p => p !== 'backlog')).length,
      pending: active.filter(t => t.phases.every(p => p === 'backlog')).length,
      blocked: active.filter(t => t.project.is_blocked).length,
      overdue: active.filter(t => isOverdueDate(t.project.due_date, today)).length,
      completed: assigned.filter(t => t.project.status === 'completed').length,
      archived: assigned.filter(t => t.project.status === 'archived').length }
  }
  const unassigned = [...activeIds].filter(id => !withOwner.has(id)).length
  const members = users.filter(u => u.is_active !== false && u.role !== 'viewer')
  const sample = averages?.state === 'ready' ? averages.data.cycle_sample_size ?? averages.data.completed_count : null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-medium text-gray-900">Carga de trabajo del equipo</h2>
          <p className="text-sm text-gray-600 mt-0.5">Tickets por responsable principal (cada ticket cuenta una vez por persona).</p>
        </div>
        <button onClick={() => { void loadFlows() }} className="ui-button ui-button-secondary"><ControlLabel icon="refresh">Actualizar</ControlLabel></button>
      </div>
      <div className="kpi-grid kpi-grid-5 workload-kpis">
        <Stat value={activeIds.size} label="Tickets activos" />
        <Stat value={unassigned} label="Sin responsable" />
        <Stat value={blockedIds.size} label="Bloqueados" alert />
        <Stat value={averageLabel(averages, t => t.avg_cycle_time_days)} label="Cycle Time prom. (90 días)" />
        <Stat value={averageLabel(averages, t => t.avg_lead_time_days)} label="Lead Time prom. (90 días)" />
      </div>
      {sample !== null && sample > 0 && (
        <p className="text-sm text-gray-600 -mt-3">Promedios calculados por el servidor sobre los mismos {sample} trabajos terminados.</p>
      )}

      <div className="hidden lg:block data-view overflow-hidden">
        <div role="region" aria-label="Distribución del trabajo por miembro" tabIndex={0} className="overflow-x-auto">
          <table className="w-full text-sm workload-table">
            <thead>
              <tr>
                <th scope="col">Miembro</th><th scope="col">Color personal</th>
                <th scope="col" className="num">Asignados</th><th scope="col" className="num">Activos</th><th scope="col" className="num">En curso</th>
                <th scope="col" className="num">Pendientes</th><th scope="col" className="num">Bloqueados</th><th scope="col" className="num">Vencidos</th>
                <th scope="col" className="num">Completados</th><th scope="col" className="num">Archivados</th>
                <th scope="col"><span className="sr-only">Detalle</span></th>
              </tr>
            </thead>
            <tbody>
              {members.map(user => {
                const l = loadOf(user.id)
                const color = ownerColors[user.id]
                const isOpen = expanded === user.id
                return (<Fragment key={user.id}>
                  <tr>
                    <th scope="row">
                      <span className="workload-member">
                        <span className={`card-avatar ${avatarClass(ownerColors, user.id, user.full_name)}`} aria-hidden="true">{getInitials(user.full_name)}</span>
                        <span><strong>{user.full_name}</strong><small className={`role-tag role-${user.role}`}>{user.role}</small></span>
                      </span>
                    </th>
                    <td>{color ? <span className="workload-color"><span className={`owner-swatch owner-${color}`} aria-hidden="true" />{ownerColorLabel(color)}</span> : <span className="text-gray-500">Sin color</span>}</td>
                    <td className="num">{l.assigned.length}</td><td className="num">{l.active.length}</td><td className="num">{l.inProgress}</td><td className="num">{l.pending}</td>
                    <td className={`num ${l.blocked ? 'is-alert' : ''}`}>{l.blocked}</td><td className={`num ${l.overdue ? 'is-alert' : ''}`}>{l.overdue}</td>
                    <td className="num">{l.completed}</td><td className="num">{l.archived}</td>
                    <td>{l.assigned.length > 0 && (
                      <button type="button" className="ui-button ui-button-quiet" aria-expanded={isOpen} onClick={() => setExpanded(isOpen ? null : user.id)}>
                        {isOpen ? 'Ocultar' : 'Ver tickets'}
                      </button>)}</td>
                  </tr>
                  {isOpen && (
                    <tr className="workload-detail"><td colSpan={11}>
                      <ul aria-label={`Tickets asignados de ${user.full_name}`}>
                        {l.assigned.map(({ project: p, phases }) => (
                          <li key={p.id}>
                            {p.project_number && <span className="card-number">{p.project_number}</span>}
                            <span className="portfolio-ticket-title">{p.title}</span>
                            <span className={`prio-chip ${PRIORITY_COLORS[p.priority] ?? ''}`}>{PRIORITY_LABEL[p.priority] ?? p.priority}</span>
                            <span className="text-gray-600">{phases.map(ph => PHASE_LABELS[ph] ?? ph).join(' · ')}</span>
                            {p.is_blocked && <span className="status-badge is-blocked"><Icon name="block" size={12} />Bloqueado</span>}
                            {p.status === 'active' && isOverdueDate(p.due_date, today) && <span className="status-badge is-overdue"><Icon name="alert" size={12} />Vencido</span>}
                            {p.status !== 'active' && <span className="text-xs text-gray-600">{p.status === 'completed' ? 'Completado' : 'Archivado'}</span>}
                          </li>
                        ))}
                      </ul>
                    </td></tr>
                  )}
                </Fragment>)
              })}
              {members.length === 0 && <tr><td colSpan={11} className="text-center text-gray-600 py-8">No hay miembros internos activos.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="lg:hidden workload-mobile space-y-3" aria-label="Carga de trabajo por miembro">
        {members.length === 0 && <p className="data-view p-4 text-sm text-gray-600">No hay miembros internos activos.</p>}
        {members.map(user => {
          const l = loadOf(user.id)
          const color = ownerColors[user.id]
          const isOpen = expanded === user.id
          const metrics = [
            ['Asignados', l.assigned.length], ['Activos', l.active.length], ['En curso', l.inProgress], ['Pendientes', l.pending],
            ['Bloqueados', l.blocked], ['Vencidos', l.overdue], ['Completados', l.completed], ['Archivados', l.archived],
          ] as const
          return <article key={user.id} className="data-view p-4 space-y-3" aria-label={`Carga de ${user.full_name}`}>
            <div className="flex items-center justify-between gap-3">
              <span className="workload-member">
                <span className={`card-avatar ${avatarClass(ownerColors, user.id, user.full_name)}`} aria-hidden="true">{getInitials(user.full_name)}</span>
                <span><strong>{user.full_name}</strong><small className={`role-tag role-${user.role}`}>{user.role}</small></span>
              </span>
              {color ? <span className="workload-color text-xs"><span className={`owner-swatch owner-${color}`} aria-hidden="true" />{ownerColorLabel(color)}</span>
                : <span className="text-xs text-gray-500">Sin color</span>}
            </div>
            <dl className="grid grid-cols-2 gap-2">
              {metrics.map(([label, value]) => <div key={label} className="rounded-lg border bg-surface px-3 py-2">
                <dt className="text-xs text-gray-600">{label}</dt>
                <dd className={`mt-0.5 font-mono text-base tabular-nums ${(['Bloqueados', 'Vencidos'].includes(label) && value > 0) ? 'text-red-700' : 'text-gray-900'}`}>{value}</dd>
              </div>)}
            </dl>
            {l.assigned.length > 0 && <button type="button" className="ui-button ui-button-quiet w-full" aria-expanded={isOpen}
              onClick={() => setExpanded(isOpen ? null : user.id)}>{isOpen ? 'Ocultar tickets' : 'Ver tickets asignados'}</button>}
            {isOpen && <ul className="workload-mobile-tickets" aria-label={`Tickets asignados de ${user.full_name}`}>
              {l.assigned.map(({ project: p, phases }) => <li key={p.id}>
                {p.project_number && <span className="card-number">{p.project_number}</span>}
                <span className="portfolio-ticket-title">{p.title}</span>
                <span className={`prio-chip ${PRIORITY_COLORS[p.priority] ?? ''}`}>{PRIORITY_LABEL[p.priority] ?? p.priority}</span>
                <span className="text-xs text-gray-600">{phases.map(ph => PHASE_LABELS[ph] ?? ph).join(' · ')}</span>
                {p.is_blocked && <span className="status-badge is-blocked"><Icon name="block" size={12} />Bloqueado</span>}
                {p.status === 'active' && isOverdueDate(p.due_date, today) && <span className="status-badge is-overdue"><Icon name="alert" size={12} />Vencido</span>}
                {p.status !== 'active' && <span className="text-xs text-gray-600">{p.status === 'completed' ? 'Completado' : 'Archivado'}</span>}
              </li>)}
            </ul>}
          </article>
        })}
      </div>
    </div>
  )
}

function Stat({ value, label, alert = false }: { value: number | string; label: string; alert?: boolean }) {
  return (
    <div className="stat-card">
      <div>
        <p className={`stat-value ${alert && typeof value === 'number' && value > 0 ? 'is-alert' : 'text-gray-900'}`}>{value}</p>
        <p className="text-sm text-gray-600 mt-0.5">{label}</p>
      </div>
    </div>
  )
}
