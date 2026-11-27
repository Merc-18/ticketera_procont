import Icon from '../ui/Icon'
import { useState, useRef, useEffect } from 'react'
import { canEdit } from '../../lib/access'
import type { Project, ProjectFlow, User } from '../../types/database.types'
import { getInitials, PRIORITY_COLORS, PRIORITY_LABEL, AREA_COLORS } from '../../lib/constants'
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
  selected?: boolean
  onSelect?: (projectId: string) => void
}

export default function ProjectCard({ project, flow, onClick, users = [], onAssign, selected, onSelect, procontCodeId, products, className = '' }: Props) {
  const area = project.requests?.studio_code_id === procontCodeId && procontCodeId ? project.requests?.requester_area : null
  const ownerColors = useOwnerColors()
  const owner = ownerClass(ownerColors, flow.assigned_to)
  const requestNumber = project.requests?.request_number ?? project.project_number
  const areaColorClass = area ? (AREA_COLORS[area] ?? 'bg-gray-100 text-gray-600') : ''

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
  return (
    <div
      onClick={onClick}
      data-priority={project.priority}
      data-blocked={project.is_blocked ? 'true' : undefined}
      className={`project-card ${className} relative cursor-pointer group/card prio-${project.priority} ${owner ? `has-owner ${owner}` : ''} ${
        project.is_blocked ? 'is-blocked' : ''} ${selected ? 'is-selected' : ''}`}
    >
      <div className="card-number-row">
        <span className="card-number">{requestNumber ?? 'Interno'}</span>
        {onSelect && <label className="card-select" onClick={e => e.stopPropagation()}>
          <input aria-label={`Seleccionar ${project.title}`} type="checkbox" checked={selected ?? false} onChange={() => onSelect(project.id)} />
        </label>}
      </div>
      <h3 className="card-title">{project.title}</h3>
      <TicketHierarchy ticket={project} products={products} />

      {/* Estado crítico: indicador semántico propio, independiente de prioridad y responsable */}
      {project.is_blocked && (
        <p className="card-blocked line-clamp-2" title={project.blocked_reason || 'Bloqueado'}>
          <Icon name="block" size={14} className="shrink-0" aria-hidden="true" /><span><strong>Bloqueado</strong>{project.blocked_reason ? `: ${project.blocked_reason}` : ''}</span>
        </p>
      )}

      {/* Insignias: la prioridad es la única con relleno de color */}
      <div className="card-badges">
        <span className={`card-badge card-priority border ${PRIORITY_COLORS[project.priority]}`} title="Prioridad definitiva asignada por el personal">
          <Icon name="flag" size={12} /><span className="sr-only">Prioridad definitiva: </span>{PRIORITY_LABEL[project.priority] ?? project.priority}
        </span>
        {area && (
          <span className={`card-badge card-area ${areaColorClass}`}>
            {area}
          </span>
        )}
        {project.project_type === 'dual' && (
          <span className="card-badge bg-gray-100 text-gray-700 border border-gray-300" title="Proyecto histórico con dos flujos">
            Dual (histórico)
          </span>
        )}

      </div>

      {/* Pie: antigüedad neutral, progreso REAL del checklist y responsable (avatar con su color) */}
      <div className="project-card-footer">
        <TicketAge createdAt={project.created_at} />
        <div className={`card-progress ${checkTotal > 0 && checkDone === checkTotal ? 'is-complete' : ''}`} aria-label={`Checklist ${checkDone} de ${checkTotal}`}>
          <span className="card-progress-caption">{checkTotal ? 'Checklist' : 'Sin checklist'}</span>
          <span className="card-progress-track" aria-hidden="true"><span className="card-progress-fill" style={{ transform: `scaleX(${checkTotal ? checkDone / checkTotal : 0})` }} /></span>
          <span className="card-progress-label">{checkDone}/{checkTotal}</span>
        </div>

        <div className="card-owner">
          {/* Responsables asignados (anillo = color personal persistido en Supabase) */}
          {owners > 0 ? (
            <div className="card-avatars">
                {assignedUsers.map(({ user, flowType }) => (
                  <div className="card-assignee" key={user.id}><div role="img" aria-label={`Responsable: ${user.full_name}`} title={`${user.full_name} (${flowType === 'development' ? 'Development' : 'Administrative'})`}
                    className={`card-avatar ${avatarClass(ownerColors, user.id, user.full_name)}`}>
                    {getInitials(user.full_name)}
                  </div><span className="card-owner-name">{user.full_name}</span></div>
                ))}
              </div>
          ) : (
            <span className="card-unassigned"><span className="card-avatar-empty" aria-hidden="true" />Sin responsable</span>
          )}

          {/* Quick assign button */}
          {onAssign && users.length > 0 && (
            <div className="relative" ref={assignRef}>
              <button
                onClick={e => { e.stopPropagation(); setShowAssign(v => !v) }}
                title="Asignar responsable"
                aria-label="Asignar responsable" aria-expanded={showAssign}
                className="assign-toggle"
              >
                <Icon name={owners > 0 ? 'edit' : 'plus'} size={14} />
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
