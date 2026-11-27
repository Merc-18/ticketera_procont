import ProjectCard from './ProjectCard'
import type { ProductCatalog } from '../../lib/ticket-hierarchy'
import type { Project, ProjectFlow, User } from '../../types/database.types'
import Icon from '../ui/Icon'

interface ProjectWithRelations extends Project {
  project_flows?: ProjectFlow[]
  requests?: { requester_area: string; requester_name: string; request_type: string; system_id?: string | null; subsystem_id?: string | null; studio_code_id?: string | null } | null
}

interface Props {
  products?: ProductCatalog
  users?: User[]
  projects: ProjectWithRelations[]
  boardType: 'development' | 'administrative'
  onProjectClick: (item: { project: ProjectWithRelations; flow: ProjectFlow }) => void
  status: 'completed' | 'archived'
  procontCodeId?: string | null
}

export default function ProjectListView({ projects, boardType, onProjectClick, status, procontCodeId, products, users = [] }: Props) {
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
        <p className="text-lg font-medium">No hay tickets {statusLabel}</p>
        <p className="text-sm mt-1">Los tickets {statusLabel} aparecerán aquí</p>
      </div>
    )
  }

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">
        {items.length} ticket{items.length !== 1 ? 's' : ''} {statusLabel}
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {items.map(({ project, flow }) => <ProjectCard key={project.id} className="project-list-card"
          project={project} flow={flow} users={users} products={products} procontCodeId={procontCodeId}
          onClick={() => onProjectClick({ project, flow })} />)}
      </div>
    </div>
  )
}
