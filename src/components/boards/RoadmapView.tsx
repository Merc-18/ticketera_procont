import { useMemo, useState } from 'react'
import { PRIORITY_COLORS, PRIORITY_DOT, PRIORITY_LABEL } from '../../lib/constants'
import Icon from '../ui/Icon'

interface Project {
  id: string
  title: string
  priority: string
  project_type: string
  status: string
  is_blocked: boolean
  due_date: string | null
  project_number?: string
  requests?: { requester_area?: string; studio_code_id?: string | null } | null
}

interface Props {
  projects: Project[]
  onProjectClick: (p: { project: Project; flow: any }) => void
  loading?: boolean
  procontCodeId?: string | null
}

function getQuarters(year: number) {
  return [
    { label: `Q1 ${year}`, months: [0, 1, 2],  start: `${year}-01-01`, end: `${year}-03-31` },
    { label: `Q2 ${year}`, months: [3, 4, 5],  start: `${year}-04-01`, end: `${year}-06-30` },
    { label: `Q3 ${year}`, months: [6, 7, 8],  start: `${year}-07-01`, end: `${year}-09-30` },
    { label: `Q4 ${year}`, months: [9, 10, 11], start: `${year}-10-01`, end: `${year}-12-31` },
  ]
}

export default function RoadmapView({ projects, onProjectClick, loading, procontCodeId }: Props) {
  const year = new Date().getFullYear()
  const [showYear, setShowYear] = useState(year)

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 animate-pulse">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-surface rounded-xl border shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
              <div className="h-4 w-16 bg-gray-200 rounded" />
              <div className="h-5 w-6 bg-gray-200 rounded-full" />
            </div>
            <div className="p-2 space-y-1">
              {[...Array(4)].map((_, j) => (
                <div key={j} className="h-10 bg-gray-100 rounded-lg" />
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }
  const quarters = getQuarters(showYear)
  const today = new Date().toISOString().slice(0, 10)

  const projectsByQuarter = useMemo(() => {
    const map: Record<string, Project[]> = {}
    for (const q of quarters) map[q.label] = []

    const noDate: Project[] = []

    for (const p of projects) {
      const date = p.due_date   // fecha límite ordinaria; sin fechas SLA heredadas
      if (!date) { noDate.push(p); continue }
      const matched = quarters.find(q => date >= q.start && date <= q.end)
      if (matched) map[matched.label].push(p)
      // If date doesn't match any quarter in showYear, skip (outside year)
    }
    return { byQuarter: map, noDate }
  }, [projects, showYear])

  const totalInYear = quarters.reduce((s, q) => s + (projectsByQuarter.byQuarter[q.label]?.length ?? 0), 0)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => setShowYear(y => y - 1)}
          className="px-3 py-1.5 bg-surface border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition"
        >
          ← {showYear - 1}
        </button>
        <span className="text-base font-bold text-gray-900">Roadmap {showYear}</span>
        <button
          onClick={() => setShowYear(y => y + 1)}
          className="px-3 py-1.5 bg-surface border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition"
        >
          {showYear + 1} →
        </button>
        <span className="text-sm text-gray-600 ml-2">{totalInYear} proyecto{totalInYear !== 1 ? 's' : ''} con fecha límite en {showYear}</span>
      </div>

      {/* Quarter grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {quarters.map(q => {
          const qProjects = projectsByQuarter.byQuarter[q.label] ?? []
          const isPast    = q.end < today
          const isCurrent = q.start <= today && today <= q.end

          return (
            <div
              key={q.label}
              className={`roadmap-quarter overflow-hidden flex flex-col ${isCurrent ? 'ring-2 ring-primary/30' : ''}`}
            >
              {/* Quarter header */}
              <div className={`px-4 py-3 flex items-center justify-between border-b ${
                isCurrent ? 'bg-primary/5 border-primary/20' : isPast ? 'bg-gray-50' : 'bg-surface'
              }`}>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-gray-900">{q.label}</span>
                  {isCurrent && <span className="text-[10px] bg-primary text-white px-1.5 py-0.5 rounded-full font-medium">Actual</span>}
                  {isPast    && <span className="text-[10px] bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded-full font-medium">Pasado</span>}
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  qProjects.length === 0 ? 'bg-gray-100 text-gray-600' : 'bg-brand-100 text-brand-700'
                }`}>
                  {qProjects.length}
                </span>
              </div>

              {/* Projects list */}
              <div className="flex-1 divide-y divide-gray-50 overflow-y-auto max-h-72">
                {qProjects.length === 0 ? (
                  <div className="py-8 text-center text-gray-600 text-sm">Sin proyectos</div>
                ) : (
                  qProjects
                    .sort((a, b) => {
                      const dateA = a.due_date || ''
                      const dateB = b.due_date || ''
                      return dateA.localeCompare(dateB)
                    })
                    .map(p => {
                      const date    = p.due_date
                      const overdue = date && date < today && p.status === 'active'
                      return (
                        <button
                          key={p.id}
                          onClick={() => onProjectClick({ project: p, flow: (p as any).project_flows?.[0] })}
                          className="w-full text-left px-3 py-2.5 hover:bg-gray-50 transition"
                        >
                          <div className="flex items-start gap-2">
                            <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${PRIORITY_DOT[p.priority] ?? 'bg-gray-400'}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-gray-800 truncate leading-snug">{p.title}</p>
                              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                {p.is_blocked && <Icon name="block" size={13} className="text-red-700" aria-label="Bloqueado" />}
                                {overdue      && <span className="inline-flex items-center gap-1 text-[13px] text-red-700"><Icon name="alert" size={13} />Vencido</span>}
                                {date && (
                                  <span className={`text-[10px] ${overdue ? 'text-red-700 font-medium' : 'text-gray-600'}`}>
                                    {new Date(date + 'T12:00:00').toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })}
                                  </span>
                                )}
                                {p.requests?.studio_code_id === procontCodeId && procontCodeId && p.requests?.requester_area && (
                                  <span className="text-[13px] text-gray-600 truncate">{p.requests.requester_area}</span>
                                )}
                              </div>
                            </div>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${PRIORITY_COLORS[p.priority] ?? 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                              <span className="sr-only">Prioridad definitiva: </span>{PRIORITY_LABEL[p.priority] ?? p.priority}
                            </span>
                          </div>
                        </button>
                      )
                    })
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Sin fecha */}
      {projectsByQuarter.noDate.length > 0 && (
        <div className="bg-surface rounded-xl border shadow-sm p-4">
          <p className="text-sm font-semibold text-gray-500 mb-3">Sin fecha de vencimiento ({projectsByQuarter.noDate.length})</p>
          <div className="flex flex-wrap gap-2">
            {projectsByQuarter.noDate.map(p => (
              <button
                key={p.id}
                onClick={() => onProjectClick({ project: p, flow: (p as any).project_flows?.[0] })}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-100 transition"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[p.priority] ?? 'bg-gray-400'}`} />
                {p.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
