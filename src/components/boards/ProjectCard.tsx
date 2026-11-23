import Icon from '../ui/Icon'
import { useState, useRef, useEffect } from 'react'
import { canEdit } from '../../lib/access'
import type { Project, ProjectFlow, User } from '../../types/database.types'
import { getAvatarColor, getInitials, PRIORITY_COLORS, PRIORITY_LABEL, AREA_COLORS } from '../../lib/constants'

interface ProjectWithArea extends Project {
  requests?: { requester_area: string; requester_name?: string; request_number?: string } | null
}

interface Props {
  project: ProjectWithArea
  flow: ProjectFlow
  onClick: () => void
  users?: User[]
  onAssign?: (flowId: string, userId: string) => void
  selected?: boolean
  onSelect?: (projectId: string) => void
}

function getDueDateBadge(dueDate?: string | null) {
  if (!dueDate) return null
  const today = new Date().toISOString().slice(0, 10)
  const diff = Math.ceil((new Date(dueDate).getTime() - new Date(today).getTime()) / 86400000)
  if (diff < 0)  return { label: `Vencido (${Math.abs(diff)} d)`, icon: 'alert' as const, cls: 'bg-red-50 text-red-700 border border-red-200' }
  if (diff === 0) return { label: 'Vence hoy', icon: 'alert' as const, cls: 'bg-red-50 text-red-700 border border-red-200' }
  if (diff <= 3)  return { label: `Vence en ${diff} d`, icon: 'clock' as const, cls: 'bg-accent-100 text-accent-700 border border-accent-300' }
  return { label: new Date(dueDate + 'T00:00:00').toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }), icon: 'calendar' as const, cls: 'bg-gray-100 text-gray-600 border border-gray-300' }
}

export default function ProjectCard({ project, flow, onClick, users = [], onAssign, selected, onSelect }: Props) {
  const area = project.requests?.requester_area
  const requesterName = project.requests?.requester_name
  const showRequester = requesterName && requesterName !== '—'
  const requestNumber = project.requests?.request_number ?? project.project_number
  const areaColorClass = area ? (AREA_COLORS[area] ?? 'bg-gray-100 text-gray-600') : ''
  const dueBadge = getDueDateBadge(project.due_date)

  const checklistItems: Array<{ id: string; completed: boolean }> = (flow as any).checklist_items ?? []
  const checkTotal = checklistItems.length
  const checkDone  = checklistItems.filter(i => i.completed).length
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

  return (
    <div
      onClick={onClick}
      className={`project-card relative border mb-3 cursor-pointer group/card ${
        project.is_blocked ? 'bg-red-50 border-l-4 border-l-red-500' : 'bg-surface'
      } ${selected ? 'border-brand-400 ring-1 ring-brand-200' : project.is_blocked ? 'border-red-200' : 'border-gray-200'}`}
    >
      {onSelect && (
        <div
          className={`card-select absolute top-2 right-2 z-10 transition-opacity ${selected ? 'opacity-100' : 'opacity-0 group-hover/card:opacity-100'}`}
          onClick={e => { e.stopPropagation(); onSelect(project.id) }}
        >
          <input aria-label={`Seleccionar ${project.title}`} type="checkbox" checked={selected ?? false} readOnly className="w-4 h-4 cursor-pointer accent-brand-600" />
        </div>
      )}
      {/* Título + blocked */}
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-medium text-gray-900 text-base flex-1 leading-snug line-clamp-2">
          {project.title}
        </h3>
      </div>
      {project.is_blocked && (
        <p className="text-sm font-medium text-red-700 mb-2 line-clamp-2" title={project.blocked_reason || 'Bloqueado'}>
          <Icon name="block" size={14} className="inline-block mr-1 -mt-0.5" />Bloqueado{project.blocked_reason ? `: ${project.blocked_reason}` : ''}
        </p>
      )}

      {/* Badges */}
      <div className="flex flex-wrap gap-1 mb-2.5">
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium border ${PRIORITY_COLORS[project.priority]}`} title="Prioridad definitiva asignada por el personal">
          <Icon name="flag" size={12} /><span className="sr-only">Prioridad definitiva: </span>{PRIORITY_LABEL[project.priority] ?? project.priority}
        </span>
        {area && (
          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${areaColorClass}`}>
            {area}
          </span>
        )}
        {showRequester && (
          <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
            <Icon name="user" size={14} className="inline-block mr-1" />{requesterName}
          </span>
        )}
        {project.project_type === 'dual' && (
          <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 border border-gray-300" title="Proyecto histórico con dos flujos">
            Dual (histórico)
          </span>
        )}
        {dueBadge && (
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${dueBadge.cls}`}>
            <Icon name={dueBadge.icon} size={12} />{dueBadge.label}
          </span>
        )}
      </div>

      {/* Footer */}
      <div className="project-card-footer flex flex-col gap-3 text-sm text-gray-600">
        <span className="flex items-center gap-2">
          {requestNumber
            ? <span className="font-mono text-gray-600 whitespace-nowrap">{requestNumber}</span>
            : <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-xs font-medium">Interno</span>
          }
          {checkTotal > 0 && (
            <span className={`flex items-center gap-1 text-xs font-medium ${checkDone === checkTotal ? 'text-green-700' : 'text-gray-600'}`} aria-label={`Checklist ${checkDone} de ${checkTotal}`}>
              <Icon name="check" size={12} />{checkDone}/{checkTotal}
            </span>
          )}
        </span>

        <div className="flex items-center gap-1.5">
          {/* Assigned users display */}
          {assignedUsers.length > 0 ? (
            <div className="flex items-center gap-1">
              {assignedUsers.map(({ user, flowType }) => (
                <div key={user.id} className="flex items-center gap-1" title={`${user.full_name} (${flowType === 'development' ? 'Development' : 'Administrative'})`}>
                  <div className={`w-7 h-7 rounded-full ${getAvatarColor(user.full_name)} flex items-center justify-center text-white text-[13px] font-medium`}>
                    {getInitials(user.full_name)}
                  </div>
                </div>
              ))}
              {assignedUsers.length === 1 && (
                <span className="text-gray-600 truncate max-w-[96px]">{assignedUsers[0].user.full_name.split(' ')[0]}</span>
              )}
            </div>
          ) : null}

          {/* Quick assign button */}
          {onAssign && users.length > 0 && (
            <div className="relative" ref={assignRef}>
              <button
                onClick={e => { e.stopPropagation(); setShowAssign(v => !v) }}
                title="Asignar responsable"
                aria-label="Asignar responsable" aria-expanded={showAssign}
                className="assign-toggle rounded-full bg-gray-100 hover:bg-brand-100 text-gray-600 hover:text-brand-700 flex items-center justify-center transition"
              >
                <Icon name={assignedUsers.length > 0 ? 'edit' : 'plus'} size={14} />
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
                      <div className={`w-7 h-7 rounded-full ${getAvatarColor(u.full_name)} flex items-center justify-center text-white text-[13px] font-medium shrink-0`}>
                        {getInitials(u.full_name)}
                      </div>
                      {u.full_name.split(' ').slice(0, 2).join(' ')}
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
