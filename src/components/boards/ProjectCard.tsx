import type { DraggableProvidedDragHandleProps } from '@hello-pangea/dnd'
import Icon from '../ui/Icon'
import { useState, useRef, useEffect } from 'react'
import { canEdit } from '../../lib/access'
import type { Project, ProjectFlow, User } from '../../types/database.types'
import { getInitials, PRIORITY_COLORS, PRIORITY_LABEL } from '../../lib/constants'
import { avatarClass, ownerClass, useOwnerColors } from '../../lib/card-colors'
import TicketHierarchy from './TicketHierarchy'
import TicketAge from './TicketAge'
import type { ProductCatalog } from '../../lib/ticket-hierarchy'
import { checklistCount } from '../../lib/board'

interface ProjectWithArea extends Project {
  requests?: { requester_area: string | null; requester_name?: string; request_number?: string; studio_id?: string | null; system_id?: string | null; subsystem_id?: string | null; requested_subsystem_id?: string | null; studio_code_id?: string | null } | null
}

interface Props {
  className?: string
  products?: ProductCatalog
  /** UUID del código interno exacto PROCONT. */
  procontCodeId?: string | null
  project: ProjectWithArea
  flow: ProjectFlow
  onClick: () => void
  users?: User[]
  onAssign?: (flowId: string, userId: string) => void
  selectionMode?: boolean
  dragHandleProps?: DraggableProvidedDragHandleProps | null
  selected?: boolean
  onSelect?: (projectId: string) => void
}

export default function ProjectCard({ project, flow, onClick, users = [], onAssign, selected, onSelect, selectionMode = false, dragHandleProps, products, className = '' }: Props) {
  const ownerColors = useOwnerColors()
  const owner = ownerClass(ownerColors, flow.assigned_to)

  // Solo tareas incorporadas; las sugerencias y las heredadas de la siembra anterior no cuentan (checklist-progress.ts).
  const { done: checkDone, total: checkTotal } = checklistCount(flow as any)
  const [showAssign, setShowAssign] = useState(false)
  const assignRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showAssign) return
    const handler = (e: MouseEvent) => {
      if (assignRef.current && !assignRef.current.contains(e.target as Node)) {
        setShowAssign(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showAssign])

  // Collect all assigned users across all flows (for dual projects, show both)
  const allFlows: Array<{ assigned_to: string | null; flow_type: string }> =
    (project as any).project_flows ?? [flow]
  const assignedUsers = allFlows
    .filter(f => f.assigned_to)
    .map(f => ({ user: users.find(u => u.id === f.assigned_to), flowType: f.flow_type }))
    .filter((x): x is { user: NonNullable<typeof x.user>; flowType: string } => Boolean(x.user))
    .filter((x, i, arr) => arr.findIndex(y => y.user.id === x.user.id) === i)

  const owners = assignedUsers.length
  const activate = () => selectionMode && onSelect ? onSelect(project.id) : onClick()
  return (
    <div
      {...dragHandleProps}
      role="button"
      tabIndex={0}
      aria-label={`${selectionMode ? 'Seleccionar' : 'Abrir'} ${project.title}`}
      aria-pressed={selectionMode ? !!selected : undefined}
      aria-describedby={selectionMode ? 'kanban-selection-help' : dragHandleProps?.['aria-describedby']}
      onClick={activate}
      onKeyDown={e => {
        if (e.target !== e.currentTarget) return
        // Space keeps the existing keyboard drag in normal Kanban mode.
        if (e.key === 'Enter' || (e.key === ' ' && !dragHandleProps)) {
          e.preventDefault(); e.stopPropagation(); activate()
        }
      }}
      data-ticket-id={project.id}
      data-priority={project.priority}
      data-blocked={project.is_blocked ? 'true' : undefined}
      className={`project-card ${className} relative cursor-pointer group/card prio-${project.priority} ${owner ? `has-owner ${owner}` : ''} ${
        project.is_blocked ? 'is-blocked' : ''} ${selected ? 'is-selected' : ''}`}
    >
      <div className="card-title-row">
        <h3 className="card-title" title={project.title}>
          <span className="card-title-text">{project.title}</span>
          {project.is_blocked && <span className="card-blocked" title={project.blocked_reason || 'Bloqueado'}>
            <Icon name="block" size={16} aria-hidden="true" /><span className="sr-only">Bloqueado</span>
          </span>}
        </h3>
      </div>
      <TicketHierarchy ticket={project} products={products} compact />
      <div className="card-status-row">
        <span className={`card-badge card-priority border ${PRIORITY_COLORS[project.priority]}`} title="Prioridad definitiva asignada por el personal">
          <Icon name="flag" size={12} /><span className="sr-only">Prioridad definitiva: </span>{PRIORITY_LABEL[project.priority] ?? project.priority}
        </span>
        <TicketAge createdAt={project.created_at} compact />
      </div>
      <div className="project-card-footer">
        <div className={`card-progress ${checkTotal > 0 && checkDone === checkTotal ? 'is-complete' : ''}`} aria-label={`Checklist ${checkDone} de ${checkTotal}`}>
          <span className="sr-only">{checkTotal ? 'Checklist' : 'Sin checklist'}</span>
          <span className="card-progress-track" aria-hidden="true"><span className="card-progress-fill" style={{ transform: `scaleX(${checkTotal ? checkDone / checkTotal : 0})` }} /></span>
          <span className="card-progress-label">{checkDone}/{checkTotal}</span>
        </div>

        <div className="card-owner">
          {/* Responsables asignados (anillo = color personal persistido en Supabase) */}
          {owners > 0 ? (
            <div className="card-avatars">
                {assignedUsers.map(({ user }) => (
                  <div key={user.id} role="img" aria-label={`Responsable: ${user.full_name}`} title={user.full_name}
                    className={`card-avatar ${avatarClass(ownerColors, user.id, user.full_name)}`}>
                    {getInitials(user.full_name)}
                  </div>
                ))}
            </div>
          ) : (
            <span className="card-avatar-empty" role="img" aria-label="Sin responsable" title="Sin responsable" />
          )}

          {/* Quick assign button */}
          {!selectionMode && onAssign && users.length > 0 && (
            <div className="relative" ref={assignRef}>
              <button
                onClick={e => { e.stopPropagation(); setShowAssign(v => !v) }}
                title="Asignar responsable"
                aria-label="Asignar responsable" aria-expanded={showAssign}
                className="assign-toggle"
              >
                <Icon name={owners > 0 ? 'edit' : 'plus'} size={12} />
              </button>

              {showAssign && (
                <div
                  className="assign-menu absolute bottom-7 right-0 bg-surface border border-gray-200 rounded-lg shadow-lg z-20 py-1 min-w-[160px]"
                  onClick={e => e.stopPropagation()}
                >
                  <p className="px-3 py-1 text-[13px] text-gray-600 font-medium border-b border-gray-200 mb-1">
                    Asignar responsable
                  </p>
                  {users.filter(canEdit).map(u => (
                    <button
                      key={u.id}
                      onClick={() => { onAssign(flow.id, u.id); setShowAssign(false) }}
                      className={`w-full text-left px-3 py-2 min-h-[44px] text-sm text-gray-800 hover:bg-brand-50 flex items-center gap-2 transition ${
                        flow.assigned_to === u.id ? 'bg-brand-50 text-brand-700 font-medium' : ''
                      }`}
                    >
                      <div className={`w-7 h-7 rounded-full ${avatarClass(ownerColors, u.id, u.full_name)} flex items-center justify-center text-white text-[13px] font-medium shrink-0`}>
                        {getInitials(u.full_name)}
                      </div>
                      {u.full_name}
                      {flow.assigned_to === u.id && <Icon name="check" size={14} className="ml-auto" aria-label="Asignado" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
