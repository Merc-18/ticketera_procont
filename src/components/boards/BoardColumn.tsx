import ControlLabel from '../ui/ControlLabel'
import type { IconName } from '../ui/Icon'
import { Droppable, Draggable } from '@hello-pangea/dnd'
import ProjectCard from './ProjectCard'
import { stageTone } from '../../lib/board-stages'
import type { Project, ProjectFlow, User } from '../../types/database.types'

interface Props {
  phase: {
    id: string
    title: string
    icon: IconName
  }
  projects: Array<{ project: Project; flow: ProjectFlow }>
  onProjectClick: (item: { project: Project; flow: ProjectFlow }) => void
  users?: User[]
  onAssign?: (projectId: string, flowId: string, userId: string) => void
  /** admin/superadmin: pueden reasignar también tickets bloqueados. */
  canManage?: boolean
  selectedIds?: string[]
  onSelect?: (projectId: string) => void
  procontCodeId?: string | null
}

/**
 * Columna del Kanban. La ETAPA tiene identidad propia (data-stage → fondo teñido sutil, acento superior,
 * icono y contador en su tono); las tarjetas quedan neutras para que prioridad y responsable se lean aparte.
 */
export default function BoardColumn({ phase, projects, onProjectClick, users = [], onAssign, canManage, selectedIds, onSelect, procontCodeId }: Props) {
  const blocked = projects.filter(p => p.project.is_blocked).length
  return (
    <section className="board-column flex-shrink-0 w-72" data-stage={stageTone(phase.id)} aria-label={`${phase.title}: ${projects.length} tickets`}>
      {/* Column Header */}
      <div className="board-column-header">
        <h2 className="board-column-title">
          <ControlLabel icon={phase.icon}>{phase.title}</ControlLabel>
        </h2>
        <span className="stage-meta">
          {blocked > 0 && (
            <span className="stage-blocked" title={`${blocked} bloqueado${blocked === 1 ? '' : 's'}`}>
              <span aria-hidden="true" className="stage-blocked-dot" />{blocked}<span className="sr-only"> bloqueado{blocked === 1 ? '' : 's'}</span>
            </span>
          )}
          <span className="stage-count" aria-label={`${projects.length} tickets`}>{projects.length}</span>
        </span>
      </div>

      {/* Droppable Area */}
      <Droppable droppableId={phase.id}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`board-column-body ${snapshot.isDraggingOver ? 'is-over' : ''}`}
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
                    className={snapshot.isDragging ? 'is-dragging' : ''}
                  >
                    <ProjectCard
                      project={item.project}
                      flow={item.flow}
                      onClick={() => onProjectClick(item)}
                      users={users}
                      onAssign={onAssign && (!item.project.is_blocked || canManage) ? (flowId, userId) => onAssign(item.project.id, flowId, userId) : undefined}
                      selected={selectedIds?.includes(item.project.id)}
                      onSelect={onSelect}
                      procontCodeId={procontCodeId}
                    />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}

            {/* Empty state */}
            {projects.length === 0 && (
              <div className="stage-empty">Sin tickets</div>
            )}
          </div>
        )}
      </Droppable>
    </section>
  )
}
