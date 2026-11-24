import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useUsers } from '../../hooks/useUsers'
import type { User } from '../../types/database.types'
import { PRIORITY_COLORS, PRIORITY_LABEL, PHASE_LABELS, getInitials } from '../../lib/constants'
import { avatarClass, useOwnerColors } from '../../lib/card-colors'
import { metrics } from '../../lib/api'
import { averageLabel, type MetricResult, type TimeAverages } from '../../lib/metrics-adapter'
import Icon from '../ui/Icon'
import ControlLabel from '../ui/ControlLabel'

interface FlowRow {
  id: string
  assigned_to: string | null
  flow_type: 'development' | 'administrative'
  current_phase: string
  project_id: string
  projects: { id: string; title: string; priority: 'low' | 'medium' | 'high' | 'urgent'; status: string; is_blocked: boolean; project_number: string | null } | null
}
interface Ticket { project: NonNullable<FlowRow['projects']>; phases: string[] }

/**
 * Carga de trabajo: tickets activos por responsable. Cada ticket cuenta una sola vez por persona
 * (los históricos Dual con dos flujos no se duplican). Sin «Cumplimiento SLA» ni fechas máximas:
 * los plazos de Procont no están definidos. Cycle Time y Lead Time vienen de la métrica aprobada
 * del servidor (metrics_time_averages, cohorte común), no de cálculos del navegador.
 */
export default function WorkloadView() {
  const { users, loading: usersLoading } = useUsers()
  const [flows, setFlows] = useState<FlowRow[]>([])
  const [flowsLoading, setFlowsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [averages, setAverages] = useState<MetricResult<TimeAverages> | null>(null)

  const loadFlows = async () => {
    setFlowsLoading(true)
    try {
      const { data, error } = await supabase.from('project_flows')
        .select('id, assigned_to, flow_type, current_phase, project_id, projects!inner ( id, title, priority, status, is_blocked, project_number )')
        .eq('projects.status', 'active')
      if (error) throw error
      setFlows((data as unknown as FlowRow[]) || []); setError(null)
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

  // Tickets únicos por responsable (un ticket con dos flujos del mismo responsable cuenta una vez).
  const byUser = new Map<string, Map<string, Ticket>>()
  const allActive = new Set<string>()
  const withOwner = new Set<string>()
  for (const f of flows) {
    if (!f.projects) continue
    allActive.add(f.project_id)
    if (!f.assigned_to) continue
    withOwner.add(f.project_id)
    const tickets = byUser.get(f.assigned_to) ?? new Map<string, Ticket>()
    const t = tickets.get(f.project_id) ?? { project: f.projects, phases: [] }
    t.phases.push(f.current_phase)
    tickets.set(f.project_id, t)
    byUser.set(f.assigned_to, tickets)
  }
  const unassigned = [...allActive].filter(id => !withOwner.has(id)).length
  const blocked = new Set(flows.filter(f => f.projects?.is_blocked).map(f => f.project_id)).size
  const activeUsers = users.filter(u => u.is_active !== false && u.role !== 'viewer')
  const sample = averages?.state === 'ready' ? averages.data.cycle_sample_size ?? averages.data.completed_count : null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Carga de trabajo del equipo</h2>
          <p className="text-sm text-gray-500 mt-0.5">Tickets activos por responsable principal (cada ticket cuenta una vez)</p>
        </div>
        <button onClick={() => { void loadFlows() }}
          className="px-3 py-1.5 bg-surface border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition shadow-sm"><ControlLabel icon="refresh">Actualizar</ControlLabel></button>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat value={allActive.size} label="Tickets activos" tone="border-brand-500" />
        <Stat value={unassigned} label="Sin responsable" tone="border-gray-400" />
        <Stat value={blocked} label="Bloqueados" tone="border-red-500" />
        <Stat value={averageLabel(averages, t => t.avg_cycle_time_days)} label="Cycle Time prom. (90 días)" tone="border-accent-400" />
        <Stat value={averageLabel(averages, t => t.avg_lead_time_days)} label="Lead Time prom. (90 días)" tone="border-accent-400" />
      </div>
      {sample !== null && sample > 0 && (
        <p className="text-xs text-gray-500 -mt-3">Promedios del equipo calculados por el servidor sobre los mismos {sample} trabajos terminados.</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
        {activeUsers.map(user => (
          <UserCard key={user.id} user={user} tickets={[...(byUser.get(user.id)?.values() ?? [])]}
            isExpanded={expanded === user.id} onToggle={() => setExpanded(expanded === user.id ? null : user.id)} />
        ))}
        {activeUsers.length === 0 && (
          <div className="col-span-full py-16 text-center text-gray-400 bg-surface rounded-xl border">
            <p className="font-medium">No hay responsables activos</p>
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ value, label, tone }: { value: number | string; label: string; tone: string }) {
  return (
    <div className={`bg-surface rounded-xl border-l-4 ${tone} p-4 shadow-sm`}>
      <p className="text-xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  )
}

const ROLE_BADGE: Record<string, string> = {
  superadmin: 'bg-accent-100 text-accent-800', admin: 'bg-red-100 text-red-700', developer: 'bg-brand-100 text-brand-700',
}

function UserCard({ user, tickets, isExpanded, onToggle }: { user: User; tickets: Ticket[]; isExpanded: boolean; onToggle: () => void }) {
  const ownerColors = useOwnerColors()
  const blockedCount = tickets.filter(t => t.project.is_blocked).length
  const byPhase = new Map<string, number>()
  for (const t of tickets) for (const ph of new Set(t.phases)) byPhase.set(ph, (byPhase.get(ph) ?? 0) + 1)
  return (
    <div className="bg-surface rounded-xl border shadow-sm overflow-hidden">
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-full ${avatarClass(ownerColors, user.id, user.full_name)} flex items-center justify-center text-white text-sm font-bold shrink-0`}>
            {getInitials(user.full_name)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-gray-900 text-sm">{user.full_name}</span>
              <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${ROLE_BADGE[user.role] ?? ''}`}>{user.role}</span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5 truncate">{user.email}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xl font-bold text-gray-900">{tickets.length}</p>
            <p className="text-xs text-gray-400">ticket{tickets.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        {byPhase.size > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {[...byPhase].map(([ph, n]) => (
              <span key={ph} className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">{PHASE_LABELS[ph] ?? ph}: {n}</span>
            ))}
          </div>
        )}
        {blockedCount > 0 && (
          <span className="inline-block mt-2 px-2 py-0.5 bg-red-50 text-red-700 text-xs rounded-full border border-red-200">
            <Icon name="block" size={14} className="inline-block mr-1 -mt-0.5" />{blockedCount} bloqueado{blockedCount !== 1 ? 's' : ''}
          </span>
        )}
        {tickets.length > 0 && (
          <button onClick={onToggle}
            className="mt-3 w-full text-xs text-gray-500 hover:text-primary flex items-center justify-center gap-1 py-1 rounded hover:bg-gray-50 transition">
            {isExpanded ? '▲ Ocultar tickets' : '▼ Ver tickets'}
          </button>
        )}
      </div>
      {isExpanded && tickets.length > 0 && (
        <div className="border-t divide-y">
          {tickets.map(({ project: p, phases }) => (
            <div key={p.id} className="px-4 py-3">
              <p className="text-sm font-medium text-gray-800 truncate">{p.title}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {p.project_number && <span className="text-xs font-mono text-gray-500">{p.project_number}</span>}
                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${PRIORITY_COLORS[p.priority] ?? ''}`}>{PRIORITY_LABEL[p.priority] ?? p.priority}</span>
                <span className="text-xs text-gray-500">{phases.map(ph => PHASE_LABELS[ph] ?? ph).join(' · ')}</span>
                {p.is_blocked && <span className="text-xs text-red-700 font-medium inline-flex items-center gap-1"><Icon name="block" size={12} />Bloqueado</span>}
              </div>
            </div>
          ))}
        </div>
      )}
      {tickets.length === 0 && <div className="px-4 pb-4 text-xs text-gray-400 italic">Sin tickets activos asignados</div>}
    </div>
  )
}
