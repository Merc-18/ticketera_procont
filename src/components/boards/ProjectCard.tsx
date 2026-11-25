import Icon from '../ui/Icon'
import { useState, useRef, useEffect } from 'react'
import { canEdit } from '../../lib/access'
import type { Project, ProjectFlow, User } from '../../types/database.types'
import { getInitials, PRIORITY_COLORS, PRIORITY_LABEL, AREA_COLORS } from '../../lib/constants'
import { avatarClass, ownerClass, useOwnerColors } from '../../lib/card-colors'
import { usePortfolios } from '../../lib/portfolios'
import { checklistCount } from '../../lib/board'

interface ProjectWithArea extends Project {
  requests?: { requester_area: string | null; requester_name?: string; request_number?: string; studio_id?: string | null; studio_code_id?: string | null } | null
}

interface Props {
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

function getDueDateBadge(dueDate?: string | null) {
  if (!dueDate) return null
  const today = new Date().toISOString().slice(0, 10)
  const diff = Math.ceil((new Date(dueDate).getTime() - new Date(today).getTime()) / 86400000)
  if (diff < 0)  return { label: `Vencido (${Math.abs(diff)} d)`, icon: 'alert' as const, cls: 'bg-red-50 text-red-700 border border-red-200' }
  if (diff === 0) return { label: 'Vence hoy', icon: 'alert' as const, cls: 'bg-red-50 text-red-700 border border-red-200' }
  if (diff <= 3)  return { label: `Vence en ${diff} d`, icon: 'clock' as const, cls: 'bg-accent-100 text-accent-700 border border-accent-300' }
  return { label: new Date(dueDate + 'T00:00:00').toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }), icon: 'calendar' as const, cls: 'bg-gray-100 text-gray-600 border border-gray-300' }
}

export default function ProjectCard({ project, flow, onClick, users = [], onAssign, selected, onSelect, procontCodeId }: Props) {
  const area = project.requests?.studio_code_id === procontCodeId && procontCodeId ? project.requests?.requester_area : null
  const ownerColors = useOwnerColors()
  const catalog = usePortfolios()
  const portfolioName = catalog.portfolios.find(p => p.id === project.portfolio_id)?.name ?? null
  const initiativeName = catalog.initiatives.find(i => i.id === project.initiative_id)?.name ?? null
  const owner = ownerClass(ownerColors, flow.assigned_to)
  const requestNumber = project.requests?.request_number ?? project.project_number
  const areaColorClass = area ? (AREA_COLORS[area] ?? 'bg-gray-100 text-gray-600') : ''
  const dueBadge = getDueDateBadge(project.due_date)

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
      className={`project-card relative cursor-pointer group/card prio-${project.priority} ${owner ? `has-owner ${owner}` : ''} ${
        project.is_blocked ? 'is-blocked' : ''} ${selected ? 'is-selected' : ''}`}
    >
      {onSelect && (
        <div
          className={`card-select absolute z-10 transition-opacity ${selected ? 'opacity-100' : 'opacity-0 group-hover/card:opacity-100'}`}
          onClick={e => { e.stopPropagation(); onSelect(project.id) }}
        >
          <input aria-label={`Seleccionar ${project.title}`} type="checkbox" checked={selected ?? false} readOnly className="w-4 h-4 cursor-pointer accent-brand-600" />
        </div>
      )}

      {/* Jerarquía: Portafolio → Proyecto/Iniciativa → título (24/11/2026). Sin nombres de personas en la tarjeta. */}
      <p className="card-hierarchy" aria-label={portfolioName ? `Portafolio ${portfolioName}${initiativeName ? `, proyecto ${initiativeName}` : ''}` : 'Sin portafolio'}>
        {portfolioName ? (<>
          <span className="card-tag card-tag-portfolio" title={`Portafolio: ${portfolioName}`}><Icon name="layers" size={12} aria-hidden="true" /><span className="truncate">{portfolioName}</span></span>
          {initiativeName && <span className="card-tag-group"><Icon name="arrow" size={12} className="card-tag-sep" aria-hidden="true" /><span className="card-tag card-tag-project" title={`Proyecto: ${initiativeName}`}><span className="truncate">{initiativeName}</span></span></span>}
        </>) : <span className="card-tag card-tag-none">Sin portafolio</span>}
      </p>

      {/* Título: elemento principal */}
      <h3 className="card-title line-clamp-2">{project.title}</h3>

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
        {dueBadge && (
          <span className={`card-badge ${dueBadge.cls}`}>
            <Icon name={dueBadge.icon} size={12} />{dueBadge.label}
          </span>
        )}
      </div>

      {/* Pie: número REQ (metadato secundario), progreso REAL del checklist y responsable (avatar con su color) */}
      <div className="project-card-footer">
        <span className="card-foot-meta">
        {requestNumber
          ? <span className="card-number">{requestNumber}</span>
          : <span className="card-internal">Interno</span>}
        {checkTotal > 0 && (
          <span className={`card-progress ${checkDone === checkTotal ? 'is-complete' : ''}`} aria-label={`Checklist ${checkDone} de ${checkTotal}`}>
            <span className="card-progress-track" aria-hidden="true">
              <span className="card-progress-fill" style={{ transform: `scaleX(${checkDone / checkTotal})` }} />
            </span>
            <span aria-hidden="true" className="card-progress-label"><Icon name="check" size={12} />{checkDone}/{checkTotal}</span>
          </span>
        )}
        </span>

        <div className="card-owner">
          {/* Responsables asignados (anillo = color personal persistido en Supabase) */}
          {owners > 0 ? (
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="card-avatars">
                {assignedUsers.map(({ user, flowType }) => (
                  <div key={user.id} role="img" aria-label={`Responsable: ${user.full_name}`} title={`${user.full_name} (${flowType === 'development' ? 'Development' : 'Administrative'})`}
                    className={`card-avatar ${avatarClass(ownerColors, user.id, user.full_name)}`}>
                    {getInitials(user.full_name)}
                  </div>
                ))}
              </div>
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
