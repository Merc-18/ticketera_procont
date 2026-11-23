import ControlLabel from '../ui/ControlLabel'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useDashboardData } from '../../hooks/useDashboardData'
import { toast } from '../../lib/toast'
import { useAreas } from '../../hooks/useAreas'
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

function HBarChart({ title, items }: {
  title: string
  items: { label: string; value: number; color: string }[]
}) {
  const max = Math.max(...items.map(i => i.value), 1)
  return (
    <div className="metric-chart">
      <h2 className="font-semibold text-gray-800 mb-4 text-base">{title}</h2>
      <div className="space-y-3">
        {items.map(item => (
          <div key={item.label} className="flex items-center gap-3">
            <span className="text-sm text-gray-600 w-28 shrink-0 break-words leading-tight">{item.label}</span>
            <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
              <div
                className={`h-full rounded-full ${item.color}`}
                style={{ width: `${(item.value / max) * 100}%` }}
              />
            </div>
            <span className="text-sm font-medium text-gray-700 min-w-[1.5rem] text-right tabular-nums">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const PERIOD_OPTIONS = [
  { value: 30,   label: 'Últimos 30d' },
  { value: 90,   label: 'Últimos 90d' },
  { value: null, label: 'Todo el tiempo' },
] as const

const TYPE_VIEW_OPTIONS = [
  { value: null,             label: 'Global',         icon: 'layers' },
  { value: 'development',    label: 'Development',    icon: 'code' },
  { value: 'administrative', label: 'Administrative', icon: 'tickets' },
] as const satisfies readonly { value: string | null; label: string; icon: IconName }[]

export default function DashboardView() {
  const [period, setPeriod] = useState<number | null>(null)
  const [areaFilter, setAreaFilter] = useState<string | null>(null)
  const [studioFilter, setStudioFilter] = useState<string | null>(null)
  const { studios } = useCatalogs('member')
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [exporting, setExporting] = useState<'completed' | 'active' | null>(null)
  const { stats, loading, reload } = useDashboardData(period, areaFilter, typeFilter, studioFilter)
  const { user } = useAuth()
  const canSeeUrgency = user?.role === 'superadmin' || user?.role === 'admin'
  // Promedios del servidor (metrics_time_averages, contrato de Codex). Sin cálculos locales.
  const [averages, setAverages] = useState<MetricResult<TimeAverages> | null>(null)
  useEffect(() => { void metrics.timeAverages({ periodDays: period, studioId: studioFilter }).then(setAverages) }, [period, studioFilter])
  // Opciones del filtro: áreas activas de Supabase + áreas presentes en los datos
  const { activeNames } = useAreas()
  const seenAreas = useRef(new Set<string>())
  Object.keys(stats?.byArea ?? {}).forEach(a => seenAreas.current.add(a))
  const areaOptions = Array.from(new Set([...activeNames, ...seenAreas.current, ...(areaFilter ? [areaFilter] : [])])).sort()

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Cargando métricas...</p>
        </div>
      </div>
    )
  }

  if (!stats) return null

  const priorityItems = [
    { label: PRIORITY_LABEL.urgent, value: stats.byPriority.urgent, color: PRIORITY_BAR.urgent },
    { label: PRIORITY_LABEL.high,   value: stats.byPriority.high,   color: PRIORITY_BAR.high },
    { label: PRIORITY_LABEL.medium, value: stats.byPriority.medium, color: PRIORITY_BAR.medium },
    { label: PRIORITY_LABEL.low,    value: stats.byPriority.low,    color: PRIORITY_BAR.low },
  ]

  const typeItems = [
    { label: 'Development',    value: stats.byType.development,   color: 'bg-brand-600' },
    { label: 'Administrative', value: stats.byType.administrative, color: 'bg-gray-500' },
    { label: 'Dual',           value: stats.byType.dual,          color: 'bg-accent-400' },
  ]

  const areaItems = Object.entries(stats.byArea)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], i) => {
      const colors = ['bg-brand-600', 'bg-brand-500', 'bg-accent-400', 'bg-gray-500', 'bg-brand-800']
      return { label, value, color: colors[i % colors.length] }
    })

  const cycleLabel = averageLabel(averages, t => t.avg_cycle_time_days)
  const leadLabel  = averageLabel(averages, t => t.avg_lead_time_days)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="view-title"><ControlLabel icon="chart">Dashboard</ControlLabel></h1>
          <p className="text-sm text-gray-600 mt-1">
            {typeFilter === 'development' ? 'Vista: solo proyectos de Development' : typeFilter === 'administrative' ? 'Vista: solo proyectos Administrativos' : 'Vista global — todos los proyectos'}
          </p>
        </div>
        <div className="dashboard-toolbar flex items-center gap-2 flex-wrap">
          {/* Filtro de período */}
          <div className="dashboard-segment flex items-center bg-gray-100 rounded-lg p-1 gap-1">
            {PERIOD_OPTIONS.map(opt => (
              <button
                key={String(opt.value)}
                onClick={() => setPeriod(opt.value)}
                aria-pressed={period === opt.value}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
                  period === opt.value
                    ? 'bg-brand-100 text-brand-700'
                    : 'text-gray-600 hover:text-brand-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Filtro por tipo (vista) */}
          <div className="dashboard-segment flex items-center bg-gray-100 rounded-lg p-1 gap-1">
            {TYPE_VIEW_OPTIONS.map(opt => (
              <button
                key={String(opt.value)}
                onClick={() => setTypeFilter(opt.value)}
                aria-pressed={typeFilter === opt.value}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
                  typeFilter === opt.value
                    ? 'bg-brand-100 text-brand-700'
                    : 'text-gray-600 hover:text-brand-700'
                }`}
              >
                <ControlLabel icon={opt.icon}>{opt.label}</ControlLabel>
              </button>
            ))}
          </div>

          {/* Filtro de área */}
          <label className="toolbar-field">
          <span>Área</span>
          <select
            value={areaFilter ?? ''}
            onChange={e => setAreaFilter(e.target.value || null)}
            className={`px-3 py-2 border rounded-lg text-sm outline-none transition cursor-pointer ${
              areaFilter ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-gray-200 bg-surface text-gray-600'
            }`}
          >
            <option value="">Todas las áreas</option>
            {areaOptions.map(area => (
              <option key={area} value={area}>{area}</option>
            ))}
          </select>
          </label>

            {/* Filtro por Estudio (independiente del área) */}
            {studios.length > 0 && (
              <label className="toolbar-field">
              <span>Estudio</span>
              <select
                value={studioFilter ?? ''}
                onChange={e => setStudioFilter(e.target.value || null)}
                className={`px-3 py-2 border rounded-lg text-sm outline-none transition cursor-pointer ${studioFilter ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-gray-200 bg-surface text-gray-600'}`}
              >
                <option value="">Todos los estudios</option>
                {studios.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
              </select>
              </label>
            )}

          <button
            onClick={handleExportActive}
            disabled={exporting !== null}
            className="ui-button ui-button-primary"
          >
            <ControlLabel icon={exporting === 'active' ? 'clock' : 'download'}>{exporting === 'active' ? 'Exportando…' : 'Activos CSV'}</ControlLabel>
          </button>
          <button
            onClick={handleExportCompleted}
            disabled={exporting !== null}
            className="ui-button ui-button-secondary"
          >
            <ControlLabel icon={exporting === 'completed' ? 'clock' : 'download'}>{exporting === 'completed' ? 'Exportando…' : 'Completados CSV'}</ControlLabel>
          </button>
          <button
            onClick={reload}
            className="ui-button ui-button-secondary"
          >
            <ControlLabel icon="refresh">Actualizar</ControlLabel>
          </button>
        </div>
      </div>

      {/* Stat Cards — proyectos (siempre todo el tiempo) */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard label="Total"       value={stats.total}             icon="chart" tone="brand" />
        <StatCard label="Activos"     value={stats.byStatus.active}   icon="circle" tone="brand" />
        <StatCard label="Completados" value={stats.byStatus.completed} icon="check" tone="success" />
        <StatCard label="Archivados"  value={stats.byStatus.archived}  icon="archive" tone="neutral" />
        <StatCard label="Bloqueados"  value={stats.blocked}            icon="block" tone="danger" alert />
        <StatCard label="Vencidos"    value={stats.overdue}            icon="alert" tone="danger" alert />
      </div>

      {/* Métricas de tiempo (sin «Cumplimiento SLA»: los plazos de Procont aún no están configurados) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard label="Cycle Time promedio" value={cycleLabel} icon="clock" tone="accent" />
        <StatCard label="Lead Time promedio"  value={leadLabel}  icon="clock" tone="accent" />
        {averages?.state === 'ready' && averages.data.completed_count > 0 && (
          <p className="sm:col-span-2 text-sm text-gray-600 -mt-2">
            Ambos promedios sobre los mismos {averages.data.cycle_sample_size ?? averages.data.completed_count} trabajos terminados
            {averages.data.excluded_count ? ` · ${averages.data.excluded_count} terminado(s) excluido(s) por no tener inicio o cronología válida` : ''}.
          </p>
        )}
      </div>

      {/* Charts — distribución */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <HBarChart title="Por Prioridad" items={priorityItems} />
        <HBarChart title="Por Tipo"      items={typeItems} />
        {areaItems.length > 0
          ? <HBarChart title="Por Área" items={areaItems} />
          : (
            <div className="bg-surface rounded-xl border p-5 shadow-sm flex items-center justify-center text-gray-400 text-sm">
              Sin datos de área disponibles
            </div>
          )
        }
      </div>

      {/* Urgencias por solicitante y estudio: solo usuarios internos autorizados */}
      {canSeeUrgency && <UrgencyStatsPanel />}

      {/* Status breakdown */}
      <div className="metric-chart">
        <h2 className="font-semibold text-gray-800 mb-4 text-base">Estado de proyectos</h2>
        <div className="flex gap-4 flex-wrap">
          {[
            { label: 'Activos',     value: stats.byStatus.active,    pct: stats.total ? Math.round(stats.byStatus.active / stats.total * 100) : 0,    bg: 'bg-brand-50',   text: 'text-brand-700',   bar: 'bg-brand-600' },
            { label: 'Completados', value: stats.byStatus.completed,  pct: stats.total ? Math.round(stats.byStatus.completed / stats.total * 100) : 0,  bg: 'bg-green-100', text: 'text-green-800', bar: 'bg-green-700' },
            { label: 'Archivados',  value: stats.byStatus.archived,   pct: stats.total ? Math.round(stats.byStatus.archived / stats.total * 100) : 0,   bg: 'bg-gray-100',    text: 'text-gray-700',    bar: 'bg-gray-500' },
          ].map(s => (
            <div key={s.label} className={`flex-1 min-w-[140px] rounded-lg p-4 ${s.bg}`}>
              <p className={`text-2xl font-bold ${s.text}`}>{s.value}</p>
              <p className={`text-sm ${s.text} font-medium`}>{s.label}</p>
              <div className="mt-2 bg-surface rounded-full h-2">
                <div className={`h-2 rounded-full ${s.bar}`} style={{ width: `${s.pct}%` }} />
              </div>
              <p className={`text-sm mt-1 ${s.text}`}>{s.pct}% del total</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
