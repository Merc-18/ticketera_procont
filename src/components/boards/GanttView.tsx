import { usePortfolios } from '../../lib/portfolios'
import TicketHierarchy from './TicketHierarchy'
import TicketAge from './TicketAge'
import { ticketHierarchy, EMPTY_PRODUCTS, type ProductCatalog } from '../../lib/ticket-hierarchy'
import { limaDate, ticketAgeLabel } from '../../lib/ticket-age'
import { useLimaDay } from '../../hooks/useLimaDay'
import ControlLabel from '../ui/ControlLabel'
import ScrollHint from '../ui/ScrollHint'
import type { Project, ProjectFlow } from '../../types/database.types'
import { PRIORITY_BAR, PRIORITY_DOT, PRIORITY_LABEL, PHASE_LABELS } from '../../lib/constants'
import Icon from '../ui/Icon'

interface ProjectWithRelations extends Project {
  project_flows?: ProjectFlow[]
  requests?: { requester_area: string; requester_name: string; request_type: string; system_id?: string | null; subsystem_id?: string | null; studio_code_id?: string | null } | null
}

interface Props {
  products?: ProductCatalog
  projects: ProjectWithRelations[]
  boardType: 'development' | 'administrative'
  onProjectClick: (item: { project: ProjectWithRelations; flow: ProjectFlow }) => void
  loading?: boolean
  procontCodeId?: string | null
}


function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setUTCMonth(d.getUTCMonth() + months)
  return d
}

function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

function monthsBetween(start: Date, end: Date): number {
  return Math.max(1, (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth())
}

const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function exportGanttCSV(items: Array<{ project: ProjectWithRelations; flow: ProjectFlow }>, procontCodeId: string | null | undefined, names: (p: ProjectWithRelations) => ReturnType<typeof ticketHierarchy>) {
  const PRIORITY_ES: Record<string, string> = { urgent: 'Urgente', high: 'Alta', medium: 'Media', low: 'Baja' }
  const headers = ['Ticket', 'Producto', 'Subproducto', 'Portafolio', 'Proyecto', 'Prioridad', 'Área', 'Creado en tablero (Lima)', 'Antigüedad', 'Fase']
  const rows = items.map(({ project, flow }) => [
    project.title,
    ...Object.values(names(project)),
    PRIORITY_ES[project.priority] ?? project.priority,
    project.requests?.studio_code_id === procontCodeId && procontCodeId ? project.requests?.requester_area ?? '' : '',
    limaDate(project.created_at) ?? '',
    ticketAgeLabel(project.created_at),
    PHASE_LABELS[flow.current_phase] ?? flow.current_phase,
  ])
  const csv = [headers, ...rows]
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = `tickets-gantt-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function GanttView({ projects, boardType, onProjectClick, loading, procontCodeId, products = EMPTY_PRODUCTS }: Props) {
  const portfolios = usePortfolios()
  const todayDay = useLimaDay()
  const today = new Date(`${todayDay}T12:00:00Z`)

  if (loading) {
    return (
      <div className="bg-surface rounded-xl border shadow-sm overflow-hidden animate-pulse">
        <div className="bg-gray-50 border-b h-9" />
        <div className="border-b flex h-9 items-center px-4 gap-6">
          <div className="w-48 h-3 bg-gray-200 rounded shrink-0" />
          <div className="flex flex-1 gap-3">
            {[...Array(6)].map((_, i) => <div key={i} className="flex-1 h-3 bg-gray-100 rounded" />)}
          </div>
        </div>
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex items-center border-b px-4 gap-6" style={{ minHeight: 180 }}>
            <div className="w-48 h-3 bg-gray-200 rounded shrink-0" />
            <div className="flex-1 relative h-6">
              <div
                className="absolute h-6 bg-gray-200 rounded-md"
                style={{ left: `${8 + i * 9}%`, width: `${18 + (i % 3) * 10}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    )
  }

  const items = projects
    .map(project => {
      const flow = (project.project_flows ?? []).find(f => f.flow_type === boardType)
      return flow ? { project, flow } : null
    })
    .filter(Boolean) as Array<{ project: ProjectWithRelations; flow: ProjectFlow }>

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-600">
        <Icon name="calendar" size={40} className="mb-3 text-gray-500" />
        <p className="text-lg font-medium">No hay tickets para mostrar</p>
      </div>
    )
  }

  // Calcular rango de tiempo
  const starts = items.map(({ project }) => new Date(`${limaDate(project.created_at) ?? todayDay}T12:00:00Z`))
  const ends   = items.map(() => today)

  const rangeStart = startOfMonth(new Date(Math.min(...starts.map(d => d.getTime()))))
  const rawRangeEnd = new Date(Math.max(...ends.map(d => d.getTime()), today.getTime()))
  const rangeEnd   = startOfMonth(addMonths(rawRangeEnd, 1))

  const totalMonths = monthsBetween(rangeStart, rangeEnd)
  const totalMs     = rangeEnd.getTime() - rangeStart.getTime()

  // Generate month headers
  const monthHeaders: { label: string; date: Date }[] = []
  for (let i = 0; i < totalMonths; i++) {
    const d = addMonths(rangeStart, i)
    monthHeaders.push({ label: `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`, date: d })
  }

  // Today marker position
  const todayPct = Math.min(
    100,
    Math.max(0, (today.getTime() - rangeStart.getTime()) / totalMs * 100)
  )

  const LEFT_W = 320

  return (
    <div className="data-view overflow-hidden">
      <ScrollHint>Desliza horizontalmente para recorrer el tiempo transcurrido desde la creación, sin planificación de entrega.</ScrollHint>
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 border-b bg-gray-50 text-sm text-gray-600">
        <span className="font-medium">Prioridad definitiva:</span>
        {(['urgent', 'high', 'medium', 'low'] as const).map(k => (
          <span key={k} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={`inline-block w-2.5 h-2.5 rounded-full ${PRIORITY_DOT[k]}`} />{PRIORITY_LABEL[k]}
          </span>
        ))}
        <span className="ml-auto">
          <span className="inline-block w-3 h-3 bg-accent-400 mr-1 rounded-sm" />Hoy
        </span>
      </div>

      <div role="region" aria-label="Cronograma Gantt, desplazamiento horizontal" tabIndex={0} className="overflow-x-auto">
        <div style={{ minWidth: `${LEFT_W + totalMonths * 80}px` }}>

          {/* Month headers */}
          <div className="flex border-b bg-gray-50">
            <div style={{ width: LEFT_W, minWidth: LEFT_W }} className="shrink-0 px-4 py-2 text-xs font-semibold text-gray-500 border-r">
              Ticket · tiempo observado en tablero
            </div>
            <div className="flex flex-1 relative">
              {monthHeaders.map((m, i) => (
                <div
                  key={i}
                  data-month={m.date.toISOString().slice(0, 7)}
                  style={{ width: `${(addMonths(m.date, 1).getTime() - m.date.getTime()) / totalMs * 100}%` }}
                  className="text-center text-xs text-gray-500 py-2 border-r border-gray-200 shrink-0"
                >
                  {m.label}
                </div>
              ))}
            </div>
          </div>

          {/* Rows */}
          <div className="divide-y divide-gray-100">
            {items.map(({ project, flow }) => {
              const start = new Date(`${limaDate(project.created_at) ?? todayDay}T12:00:00Z`)
              const end   = today

              const leftPct  = Math.max(0, (start.getTime() - rangeStart.getTime()) / totalMs * 100)
              const widthPct = Math.max(0.5, Math.min(100 - leftPct, (end.getTime() - start.getTime()) / totalMs * 100))

              const barColor = PRIORITY_BAR[project.priority]

              return (
                <div
                  key={project.id}
                  onClick={() => onProjectClick({ project, flow })}
                  className="flex items-center hover:bg-brand-50 cursor-pointer transition-colors group"
                  style={{ minHeight: 180 }}
                >
                  {/* Project name */}
                  <div
                    style={{ width: LEFT_W, minWidth: LEFT_W }}
                    className="shrink-0 px-4 flex items-center gap-2 border-r"
                  >
                    <div className="gantt-ticket">
                    {project.is_blocked && <Icon name="block" size={14} className="text-red-700 shrink-0" aria-label="Bloqueado" />}
                    <span aria-hidden="true" className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${PRIORITY_DOT[project.priority] ?? 'bg-gray-400'}`} />
                    <span className="text-sm font-medium text-gray-800 break-words group-hover:text-brand-700">
                      <span className="sr-only">Prioridad {PRIORITY_LABEL[project.priority]}: </span>{project.title}
                    </span>
                    <TicketAge createdAt={project.created_at} />
                    <TicketHierarchy ticket={project} products={products} />
                    </div>
                  </div>

                  {/* Timeline bar area */}
                  <div className="flex-1 relative h-full flex items-center">
                    {/* Month grid lines */}
                    {monthHeaders.map((m, i) => (
                      <div
                        key={i}
                        className="absolute top-0 bottom-0 border-r border-gray-100"
                        style={{ left: `${(addMonths(m.date, 1).getTime() - rangeStart.getTime()) / totalMs * 100}%` }}
                      />
                    ))}

                    {/* Today line */}
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-accent-400 z-10"
                      style={{ left: `${todayPct}%` }}
                    />

                    {/* Project bar */}
                    <div
                      className={`absolute h-6 rounded-md ${barColor} opacity-80 hover:opacity-100 transition-opacity flex items-center px-2 overflow-hidden`}
                      style={{ left: `${leftPct}%`, width: `${widthPct}%`, minWidth: 8 }}
                      title={`${project.title}\nCreado en tablero: ${limaDate(project.created_at)}\n${ticketAgeLabel(project.created_at, todayDay)}\nFase: ${PHASE_LABELS[flow.current_phase] ?? flow.current_phase}`}
                    >
                      <span className={`${project.priority === 'high' ? 'text-on-accent' : 'text-white'} text-xs font-medium truncate hidden sm:block`}>
                        {PHASE_LABELS[flow.current_phase] ?? flow.current_phase}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="px-4 py-3 bg-gray-50 border-t text-xs text-gray-600 flex flex-wrap gap-3 items-center justify-between">
        <span>{items.length} ticket{items.length !== 1 ? 's' : ''} · Arrastra horizontalmente para ver el timeline completo</span>
        <button
          onClick={() => exportGanttCSV(items, procontCodeId, p => ticketHierarchy(p, products, portfolios))}
          className="px-3 py-1 bg-surface border border-gray-200 text-gray-600 rounded text-xs hover:bg-gray-100 transition"
        >
          <ControlLabel icon="download">Exportar CSV</ControlLabel>
        </button>
      </div>
    </div>
  )
}
