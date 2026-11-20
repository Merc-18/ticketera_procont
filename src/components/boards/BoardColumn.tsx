import ControlLabel from '../ui/ControlLabel'
import { Droppable, Draggable } from '@hello-pangea/dnd'
import ProjectCard from './ProjectCard'
import type { Project, ProjectFlow, User } from '../../types/database.types'

interface Props {
  phase: {
    id: string
    title: string
    color: string
  }
  projects: Array<{ project: Project; flow: ProjectFlow }>
  onProjectClick: (item: { project: Project; flow: ProjectFlow }) => void
  users?: User[]
  onAssign?: (projectId: string, flowId: string, userId: string) => void
  /** admin/superadmin: pueden reasignar también tickets bloqueados. */
  canManage?: boolean
  selectedIds?: string[]
  onSelect?: (projectId: string) => void
}

export default function BoardColumn({ phase, projects, onProjectClick, users = [], onAssign, canManage, selectedIds, onSelect }: Props) {
  return (
    <div className="board-column flex-shrink-0 w-72">
      {/* Column Header */}
      <div className={`board-column-header ${phase.color}`}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-white text-sm">
            <ControlLabel>{phase.title}</ControlLabel>
          </h2>
          <span className="bg-white bg-opacity-30 text-white text-xs font-bold px-2 py-1 rounded">
            {projects.length}
          </span>
        </div>
      </div>

      {/* Droppable Area */}
      <Droppable droppableId={phase.id}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`board-column-body ${
              snapshot.isDraggingOver ? 'bg-brand-50 ring-2 ring-primary' : ''
            }`}
          >
            {projects.map((item, index) => (
              <Draggable
                key={item.flow.id}
                draggableId={item.flow.id}
                index={index}
                isDragDisabled={item.project.is_blocked}
              >
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                    className={snapshot.isDragging ? 'opacity-75' : ''}
                  >
                    <ProjectCard
                      project={item.project}
                      flow={item.flow}
                      onClick={() => onProjectClick(item)}
                      users={users}
                      onAssign={onAssign && (!item.project.is_blocked || canManage) ? (flowId, userId) => onAssign(item.project.id, flowId, userId) : undefined}
                      selected={selectedIds?.includes(item.project.id)}
                      onSelect={onSelect}
                    />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}

            {/* Empty state */}
            {projects.length === 0 && (
              <div className="text-center text-gray-400 text-sm py-8">
                Sin tickets
              </div>
            )}
          </div>
        )}
      </Droppable>
    </div>
  )
}