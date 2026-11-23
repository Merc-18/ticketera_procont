import ControlLabel from '../ui/ControlLabel'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useDashboardData } from '../../hooks/useDashboardData'
import { toast } from '../../lib/toast'
import { useUsers } from '../../hooks/useUsers'
import { procontStudioId } from '../../lib/studio-rules'
import { useCatalogs } from '../../hooks/useCatalogs'
import { useAuth } from '../../hooks/useAuth'
import { metrics } from '../../lib/api'
import type { MetricResult, TimeAverages } from '../../lib/metrics-adapter'
import { averageLabel } from '../../lib/metrics-adapter'
import UrgencyStatsPanel from '../metrics/UrgencyStatsPanel'
import { buildCompletedExport, ExportError, type ExportClient } from '../../lib/ticket-export'
import Icon, { type IconName } from '../ui/Icon'
import { PRIORITY_LABEL, PRIORITY_BAR } from '../../lib/constants'

// ── Helpers ──────────────────────────────────────────────────────────────────

const PRIORITY_ES: Record<string, string> = { urgent: 'Urgente', high: 'Alta', medium: 'Media', low: 'Baja' }
const TYPE_ES: Record<string, string> = { development: 'Desarrollo', administrative: 'Administrativo (histórico)', dual: 'Dual (histórico)' }

function downloadCSV(filename: string, headers: string[], rows: (string | number)[][]) {
  const csv = [headers, ...rows]
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

/** Proyectos activos. Sin columnas SLA heredadas: solo la fecha límite ordinaria (due_date). */
async function exportActiveCSV() {
  const { data: projects, error } = await supabase
    .from('projects')
    .select('title, priority, project_type, status, is_blocked, due_date, created_at, requests(requester_area), project_flows(flow_type, current_phase, assigned_to)')
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  if (error) { toast.error('No se pudieron cargar los proyectos activos. Inténtalo nuevamente.'); return }
  if (!projects?.length) { toast.info('No hay proyectos activos para exportar.'); return }

  const headers = ['Proyecto', 'Área', 'Prioridad', 'Tipo', 'Bloqueado', 'Fase Dev', 'Fase Admin (histórico)', 'Fecha límite', 'Fecha creación']
  const rows = projects.map(p => {
    const flows: any[] = (p as any).project_flows ?? []
    const devFlow  = flows.find((f: any) => f.flow_type === 'development')
    const admFlow  = flows.find((f: any) => f.flow_type === 'administrative')
    return [
      p.title,
      (p as any).requests?.requester_area ?? '',
      PRIORITY_ES[p.priority] ?? p.priority,
      TYPE_ES[p.project_type] ?? p.project_type,
      p.is_blocked ? 'Sí' : 'No',
      devFlow?.current_phase ?? '',
      admFlow?.current_phase ?? '',
      p.due_date ?? '',
      (p.created_at as string)?.slice(0, 10) ?? '',
    ]
  })
  downloadCSV('proyectos-activos', headers, rows)
}

/**
 * Tickets terminados con métricas POR TICKET del servidor (get_ticket_performance, M11). Filtro
 * general_status=done en el servidor, orden por request_id y paginación completa verificada
 * (ver lib/ticket-export.ts). Si una página falla no se descarga nada.
 */
async function exportCompletedCSV() {
  let result
  try { result = await buildCompletedExport(supabase as unknown as ExportClient) }
  catch (err) {
    toast.error(err instanceof ExportError ? err.message : 'No se pudo completar la exportación. No se descargó ningún archivo.')
    return
  }
  if (!result) { toast.info('No hay tickets terminados para exportar.'); return }
  downloadCSV('tickets-terminados', result.headers, result.rows)
}

// ── Reusable components ──────────────────────────────────────────────────────

type KpiTone = 'brand' | 'success' | 'danger' | 'accent' | 'neutral'
/**
 * KPI con color funcional (Taste: «estado en visuales»): el icono va en un tinte del tono de la métrica. Una alerta
 * (`alert`) solo se colorea si hay casos: con 0 queda neutra, así el rojo significa «mira esto».
 */
function StatCard({ label, value, tone, icon, alert = false }: {
  label: string; value: number | string; tone: KpiTone; icon: IconName; alert?: boolean
}) {
  const active = alert && typeof value === 'number' && value > 0
  const resolved: KpiTone = alert ? (active ? 'danger' : 'neutral') : tone
  return (
    <div className="stat-card">
      <span className={`kpi-tile tone-${resolved}`} aria-hidden="true"><Icon name={icon} size={20} /></span>
      <div>
        <p className={`font-bold ${typeof value === 'string' && value.length > 6 ? 'text-base text-gray-500' : `stat-value ${active ? 'is-alert' : 'text-gray-900'}`}`}>{value}</p>
        <p className="text-sm text-gray-600 mt-0.5">{label}</p>
      </div>
    </div>
  )
}

function HBarChart({ title, note, items, empty }: {
  title: string
  note?: string
  items: { label: string; value: number; color: string }[]
  /** Texto cuando no hay valores: no se dibuja una gráfica vacía como si fuera información. */
  empty: string
}) {
  const max = Math.max(...items.map(i => i.value), 1)
  const hasData = items.some(i => i.value > 0)
  return (
    <section className="metric-chart" aria-label={title}>
      <h2>{title}</h2>
      {note && <p className="metric-note">{note}</p>}
      {!hasData ? <p className="metric-note metric-empty">{empty}</p> : (
        <div className="space-y-3 mt-4">
          {items.map(item => (
            <div key={item.label} className="flex items-center gap-3">
              <span className="text-sm text-gray-600 w-28 shrink-0 break-words leading-tight">{item.label}</span>
              <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                <div className={`h-full rounded-full ${item.color}`} style={{ width: `${(item.value / max) * 100}%` }} />
              </div>
              <span className="text-sm font-medium text-gray-700 min-w-[1.5rem] text-right tabular-nums">{item.value}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

const PERIOD_OPTIONS = [
  { value: 30,   label: 'Últimos 30d' },
  { value: 90,   label: 'Últimos 90d' },
  { value: null, label: 'Todo el tiempo' },
] as const

export default function DashboardView() {
  const [period, setPeriod] = useState<number | null>(null)
  const [studioFilter, setStudioFilter] = useState<string | null>(null)
  const [areaFilter, setAreaFilter] = useState<string | null>(null)
  const { studios, codes, areas } = useCatalogs('member')
  const { users } = useUsers()
  // Área solo para el estudio PROCONT (studio-rules.ts): con otro estudio se oculta y se limpia.
  const procontId = procontStudioId(codes)
  const areaApplies = !!studioFilter && studioFilter === procontId
  useEffect(() => { if (!areaApplies && areaFilter) setAreaFilter(null) }, [areaApplies, areaFilter])
  const [exporting, setExporting] = useState<'completed' | 'active' | null>(null)
  const { stats, loading, error, reload } = useDashboardData({ periodDays: period, studioId: studioFilter, areaId: areaApplies ? areaFilter : null, procontStudioId: procontId })
  const { user } = useAuth()
  const canSeeUrgency = user?.role === 'superadmin' || user?.role === 'admin'
  // Promedios del servidor (metrics_time_averages, contrato de Codex). Sin cálculos locales.
  const [averages, setAverages] = useState<MetricResult<TimeAverages> | null>(null)
  useEffect(() => { void metrics.timeAverages({ periodDays: period, studioId: studioFilter }).then(setAverages) }, [period, studioFilter])
  const procontAreas = areas.filter(a => a.studio_id === procontId && !a.parent_id)

  const handleExportCompleted = async () => {
    setExporting('completed')
    try { await exportCompletedCSV() }
    finally { setExporting(null) }
  }
  const handleExportActive = async () => {
    setExporting('active')
    try { await exportActiveCSV() }
    finally { setExporting(null) }
  }

  const studioName = studioFilter ? studios.find(s => s.id === studioFilter)?.name ?? 'Estudio' : null
  const cycleLabel = averageLabel(averages, t => t.avg_cycle_time_days)
  const leadLabel  = averageLabel(averages, t => t.avg_lead_time_days)
  const priorityItems = stats ? [
    { label: PRIORITY_LABEL.urgent, value: stats.priorityActive.urgent, color: PRIORITY_BAR.urgent },
    { label: PRIORITY_LABEL.high,   value: stats.priorityActive.high,   color: PRIORITY_BAR.high },
    { label: PRIORITY_LABEL.medium, value: stats.priorityActive.medium, color: PRIORITY_BAR.medium },
    { label: PRIORITY_LABEL.low,    value: stats.priorityActive.low,    color: PRIORITY_BAR.low },
  ] : []
  const workloadItems = (stats?.workload ?? []).slice(0, 6).map(w => ({
    label: users.find(u => u.id === w.userId)?.full_name ?? 'Usuario no disponible', value: w.count, color: 'bg-brand-600',
  }))
  const areaItems = stats ? Object.entries(stats.areas.byAreaId).sort((a, b) => b[1] - a[1]).map(([id, value]) => ({
    label: areas.find(a => a.id === id)?.name ?? 'Área no disponible', value, color: 'bg-brand-600',
  })) : []

  return (
    <div className="dashboard space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="view-title"><ControlLabel icon="chart">Dashboard</ControlLabel></h1>
          <p className="text-sm text-gray-600 mt-1">Situación operativa · {studioName ?? 'todos los estudios'}{areaApplies && areaFilter ? ` · ${procontAreas.find(a => a.id === areaFilter)?.name ?? ''}` : ''}</p>
        </div>
      </div>

      <div className="dashboard-toolbar flex items-end gap-2 flex-wrap">
        <div className="dashboard-segment flex items-center bg-gray-100 rounded-lg p-1 gap-1" role="group" aria-label="Periodo">
          {PERIOD_OPTIONS.map(opt => (
            <button key={String(opt.value)} onClick={() => setPeriod(opt.value)} aria-pressed={period === opt.value}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${period === opt.value ? 'bg-brand-100 text-brand-700' : 'text-gray-600 hover:text-brand-700'}`}>
              {opt.label}
            </button>
          ))}
        </div>
        {studios.length > 0 && (
          <label className="toolbar-field">
            <span>Estudio</span>
            <select value={studioFilter ?? ''} onChange={e => setStudioFilter(e.target.value || null)} className="ui-input toolbar-select">
              <option value="">Todos los estudios</option>
              {studios.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
            </select>
          </label>
        )}
        {areaApplies && procontAreas.length > 0 && (
          <label className="toolbar-field">
            <span>Área</span>
            <select value={areaFilter ?? ''} onChange={e => setAreaFilter(e.target.value || null)} className="ui-input toolbar-select">
              <option value="">Todas las áreas</option>
              {procontAreas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
        )}
        <button onClick={handleExportActive} disabled={exporting !== null} className="ui-button ui-button-primary">
          <ControlLabel icon={exporting === 'active' ? 'clock' : 'download'}>{exporting === 'active' ? 'Exportando…' : 'Activos CSV'}</ControlLabel>
        </button>
        <button onClick={handleExportCompleted} disabled={exporting !== null} className="ui-button ui-button-secondary">
          <ControlLabel icon={exporting === 'completed' ? 'clock' : 'download'}>{exporting === 'completed' ? 'Exportando…' : 'Completados CSV'}</ControlLabel>
        </button>
        <button onClick={() => { void reload() }} className="ui-button ui-button-secondary">
          <ControlLabel icon="refresh">Actualizar</ControlLabel>
        </button>
      </div>

      {error && <p role="alert" className="field-error">{error}</p>}
      {loading && !stats ? <p role="status" className="text-gray-600">Cargando métricas…</p> : stats && (<>
        <section className="dashboard-section" aria-labelledby="dash-requests">
          <div className="dashboard-section-head">
            <h2 id="dash-requests">Solicitudes</h2>
            <p className="metric-note">Recibidas y en revisión: estado actual de la bandeja. Aprobadas y rechazadas: de las recibidas {period ? `en los últimos ${period} días` : 'en todo el periodo'}.</p>
          </div>
          <div className="kpi-grid kpi-grid-4">
            <StatCard label="Recibidas" value={stats.requests.received} icon="inbox" tone="neutral" />
            <StatCard label="En revisión" value={stats.requests.inReview} icon="search" tone="accent" />
            <StatCard label="Aprobadas" value={stats.requests.approved} icon="tickets" tone="brand" />
            <StatCard label="Rechazadas" value={stats.requests.rejected} icon="close" tone="neutral" />
          </div>
        </section>

        <section className="dashboard-section" aria-labelledby="dash-work">
          <div className="dashboard-section-head">
            <h2 id="dash-work">Trabajo</h2>
            <p className="metric-note">Estado actual de los tickets aprobados.</p>
          </div>
          <div className="kpi-grid kpi-grid-5">
            <StatCard label="En ejecución" value={stats.work.active} icon="circle" tone="brand" />
            <StatCard label="Completados" value={stats.work.completed} icon="check" tone="success" />
            <StatCard label="Bloqueados" value={stats.work.blocked} icon="block" tone="danger" alert />
            <StatCard label="Vencidos" value={stats.work.overdue} icon="alert" tone="danger" alert />
            <StatCard label="Archivados" value={stats.work.archived} icon="archive" tone="neutral" />
          </div>
        </section>

        <section className="dashboard-section" aria-labelledby="dash-times">
          <div className="dashboard-section-head">
            <h2 id="dash-times">Tiempos</h2>
            <p className="metric-note">{averages?.state === 'ready' && averages.data.completed_count > 0
              ? `Promedios del servidor sobre los mismos ${averages.data.cycle_sample_size ?? averages.data.completed_count} trabajos terminados${averages.data.excluded_count ? ` · ${averages.data.excluded_count} excluido(s) sin cronología válida` : ''}.`
              : 'Promedios del servidor; se muestran cuando hay trabajos terminados con cronología válida.'}</p>
          </div>
          <div className="kpi-grid kpi-grid-2">
            <StatCard label="Cycle Time promedio" value={cycleLabel} icon="clock" tone="accent" />
            <StatCard label="Lead Time promedio"  value={leadLabel}  icon="clock" tone="accent" />
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <HBarChart title="Prioridad del trabajo en ejecución" items={priorityItems} empty="No hay trabajo en ejecución con los filtros elegidos." />
          <HBarChart title="Carga del equipo" note={stats.unassignedActive ? `${stats.unassignedActive} ticket(s) en ejecución sin responsable.` : 'Tickets en ejecución por responsable principal.'}
            items={workloadItems} empty="Ningún ticket en ejecución tiene responsable asignado." />
        </div>

        <div className={`grid grid-cols-1 ${canSeeUrgency ? 'lg:grid-cols-2' : ''} gap-4`}>
          {/* Urgencias por solicitante y estudio: solo usuarios internos autorizados */}
          {canSeeUrgency && <UrgencyStatsPanel studios={studios} studioId={studioFilter} />}
          {!stats.areas.applies ? (
            <section className="metric-chart" aria-label="Áreas">
              <h2>Áreas</h2>
              <p className="metric-note metric-empty">{procontId ? 'No aplica: las áreas solo se usan en el estudio PROCONT.' : 'El catálogo de estudios aún no está disponible.'}</p>
            </section>
          ) : (
            <HBarChart title={studioFilter ? 'Áreas' : 'Áreas · solo estudio PROCONT'}
              note={`Trabajo en ejecución del estudio PROCONT por área${stats.areas.withoutArea ? ` · ${stats.areas.withoutArea} sin área registrada` : ''}.`}
              items={areaItems} empty="Sin trabajo en ejecución con área registrada." />
          )}
        </div>
      </>)}
    </div>
  )
}
