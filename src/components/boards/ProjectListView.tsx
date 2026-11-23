import type { Project, ProjectFlow } from '../../types/database.types'
import { PRIORITY_COLORS, AREA_COLORS, PHASE_LABELS, PRIORITY_LABEL } from '../../lib/constants'
import Icon from '../ui/Icon'
import { checklistCount, phasePosition } from '../../lib/board'

interface ProjectWithRelations extends Project {
  project_flows?: ProjectFlow[]
  requests?: { requester_area: string; requester_name: string; request_type: string } | null
}

interface Props {
  projects: ProjectWithRelations[]
  boardType: 'development' | 'administrative'
  onProjectClick: (item: { project: ProjectWithRelations; flow: ProjectFlow }) => void
  status: 'completed' | 'archived'
}

export default function ProjectListView({ projects, boardType, onProjectClick, status }: Props) {
  const statusLabel = status === 'completed' ? 'completados' : 'archivados'
  const statusIcon = status === 'completed' ? 'check' as const : 'archive' as const

  // Filtrar proyectos que tienen el flow del tipo del board
  const items = projects
    .map(project => {
      const flow = (project.project_flows ?? []).find(f => f.flow_type === boardType)
      return flow ? { project, flow } : null
    })
    .filter(Boolean) as Array<{ project: ProjectWithRelations; flow: ProjectFlow }>

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-600">
        <Icon name={statusIcon} size={40} className="mb-3 text-gray-500" />
        <p className="text-lg font-medium">No hay proyectos {statusLabel}</p>
        <p className="text-sm mt-1">Los proyectos {statusLabel} aparecerán aquí</p>
      </div>
    )
  }

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">
        {items.length} proyecto{items.length !== 1 ? 's' : ''} {statusLabel}
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {items.map(({ project, flow }) => {
          const area = project.requests?.requester_area
          const areaColorClass = area ? (AREA_COLORS[area] ?? 'bg-gray-100 text-gray-600') : ''
          const requesterName = project.requests?.requester_name
          const showRequester = requesterName && requesterName !== '—'

          return (
            <div
              key={project.id}
              onClick={() => onProjectClick({ project, flow })}
              className="project-list-card border border-gray-200 cursor-pointer"
            >
              {/* Título */}
              <h3 className="font-medium text-gray-900 text-base mb-2 line-clamp-2">
                {project.title}
              </h3>

              {/* Descripción */}
              <p className="text-xs text-gray-500 mb-3 line-clamp-2">
                {project.description}
              </p>

              {/* Badges */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                <span className={`px-2 py-0.5 rounded text-xs font-medium border ${PRIORITY_COLORS[project.priority]}`}>
                  <span className="sr-only">Prioridad definitiva: </span>{PRIORITY_LABEL[project.priority] ?? project.priority}
                </span>
                {area && (
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${areaColorClass}`}>
                    {area}
                  </span>
                )}
                {showRequester && (
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
                    <Icon name="user" size={13} className="inline-block mr-1 -mt-0.5" />{requesterName}
                  </span>
                )}
                {project.project_type === 'dual' && (
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-brand-100 text-brand-800">
                    DUAL
                  </span>
                )}
              </div>

              {/* Última fase */}
              <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                <span>Última fase:</span>
                <span className="font-medium text-gray-700">
                  {PHASE_LABELS[flow.current_phase] ?? flow.current_phase}
                </span>
              </div>

              {/* Posición de fase y checklist (conteos; % oficial en el detalle) */}
              <div className="flex justify-between text-xs text-gray-500">
                <span>Fase {phasePosition(flow.flow_type, flow.current_phase).label}</span>
                <span>{(({ done, total }) => total ? `Checklist ${done}/${total}` : 'Sin tareas')(checklistCount(flow as any))}</span>
              </div>

              {/* Fecha */}
              <p className="text-sm text-gray-600 mt-3 flex items-center gap-1">
                <Icon name={statusIcon} size={14} />{new Date(project.updated_at).toLocaleDateString('es-PE')}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
