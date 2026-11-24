import ControlLabel from '../ui/ControlLabel'
import Icon, { type IconName } from '../ui/Icon'
import ScrollHint from '../ui/ScrollHint'
import { DragDropContext, DropResult } from '@hello-pangea/dnd'
import { useState, useEffect, lazy, Suspense } from 'react'
import BoardColumn from './BoardColumn'
import { preloadOnIntent } from '../../lib/client-routes'
import { useProjects } from '../../hooks/useProjects'
import { useUsers } from '../../hooks/useUsers'
import { useAuth } from '../../hooks/useAuth'
import { toast } from '../../lib/toast'
import { errorMessage } from '../../lib/supabase-errors'
import type { ProjectFlow } from '../../types/database.types'
import { useCatalogs } from '../../hooks/useCatalogs'
import { board } from '../../lib/api'
import { actionKey, needsPendingConfirmation, type BoardTicket, type Phase } from '../../lib/board'
import { DoneConfirmDialog } from '../projects/BoardDialogs'
import { procontCodeId } from '../../lib/studio-rules'
import PortfolioSelect from './PortfolioSelect'
import PrioritySelect from '../ui/PrioritySelect'
import { portfolioLabel, usePortfolios } from '../../lib/portfolios'
import OwnerColorPicker from './OwnerColorPicker'

// Vistas y modales secundarios del tablero en carga diferida (Taste perf.md: JS por vista). Se piden por
// intención (puntero, foco o toque sobre el control que los abre) para que no haya intervalo vacío.
const loadTableView = () => import('./TableView')
const loadGanttView = () => import('./GanttView')
const loadRoadmapView = () => import('./RoadmapView')
const loadProjectListView = () => import('./ProjectListView')
const loadProjectModal = () => import('../projects/ProjectModal')
const loadNewProjectModal = () => import('../projects/NewProjectModal')
const TableView = lazy(loadTableView)
const GanttView = lazy(loadGanttView)
const RoadmapView = lazy(loadRoadmapView)
const ProjectListView = lazy(loadProjectListView)
const ProjectModal = lazy(loadProjectModal)
const NewProjectModal = lazy(loadNewProjectModal)
const VIEW_LOADERS: Record<string, (() => Promise<unknown>) | undefined> = { table: loadTableView, gantt: loadGanttView, roadmap: loadRoadmapView }
const STATUS_LOADERS: Record<string, (() => Promise<unknown>) | undefined> = { completed: loadProjectListView, archived: loadProjectListView }
const noop = () => Promise.resolve()
const preloadModal = () => { loadProjectModal().catch(() => undefined) }
const viewLoading = <div role="status" className="py-12 text-center text-gray-600">Cargando vista…</div>


type BoardType = 'development' | 'administrative'
type ViewMode  = 'kanban' | 'table' | 'gantt' | 'roadmap'

interface Props {
  boardType: BoardType
  openProjectId?: string | null
  onOpenHandled?: () => void
}

const PHASES: Record<string, { id: string; title: string; icon: IconName }[]> = {
  // Flujo único definitivo (M12). Se permiten saltos y retrocesos; Done solo al llegar a esa columna.
  development: [
    { id: 'backlog', title: 'Backlog', icon: 'tickets' },
    { id: 'analysis', title: 'Analysis', icon: 'search' },
    { id: 'design', title: 'Design', icon: 'edit' },
    { id: 'dev', title: 'Development', icon: 'code' },
    { id: 'code_review', title: 'Code Review', icon: 'eye' },
    { id: 'testing', title: 'Testing', icon: 'check' },
    { id: 'deploy', title: 'Deploy', icon: 'upload' },
    { id: 'done', title: 'Done', icon: 'check' },
  ],
  // Solo proyectos históricos (no se crean nuevos Administrative/Dual).
  administrative: [
    { id: 'backlog', title: 'Backlog', icon: 'tickets' },
    { id: 'ready_to_start', title: 'Ready to Start', icon: 'flag' },
    { id: 'discovery', title: 'Discovery', icon: 'search' },
    { id: 'design', title: 'Design', icon: 'edit' },
    { id: 'build', title: 'Build', icon: 'code' },
    { id: 'uat_validation', title: 'UAT/Validation', icon: 'check' },
    { id: 'deployed', title: 'Deployed', icon: 'upload' },
  ],
}

const STATUS_OPTIONS: { value: 'active' | 'completed' | 'archived'; label: string; icon: IconName }[] = [
  { value: 'active',    label: 'Activos',     icon: 'circle' },
  { value: 'completed', label: 'Completados', icon: 'check' },
  { value: 'archived',  label: 'Archivados',  icon: 'archive' },
]


const VIEW_MODES: { value: ViewMode; label: string; icon: IconName }[] = [
  { value: 'kanban',  label: 'Kanban',  icon: 'board' },
  { value: 'table',   label: 'Tabla',   icon: 'table' },
  { value: 'gantt',   label: 'Gantt',   icon: 'calendar' },
  { value: 'roadmap', label: 'Roadmap', icon: 'flag' },
]

export default function KanbanBoard({ boardType, openProjectId, onOpenHandled }: Props) {
  const { projects, loading, error, hasMore, loadMore, statusFilter, setStatusFilter, moveFlow, assignFlow, updateProject, createTicket, reload, bulkUpdate } = useProjects()
  const { activeUsers } = useUsers()
  const { user: currentUser } = useAuth()
  const role = currentUser?.role ?? 'viewer'
  const canEdit    = role === 'superadmin' || role === 'admin' || role === 'developer'
  const canManage  = role === 'superadmin' || role === 'admin'
  const [selectedProject, setSelectedProject] = useState<{ project: any; flow: ProjectFlow } | null>(null)
  const [showNewModal, setShowNewModal] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  // Cierre por arrastre con tareas pendientes: requiere confirmación explícita.
  const [pendingClose, setPendingClose] = useState<{ ticket: BoardTicket; flowId: string; title: string; key: string } | null>(null)
  const [closing, setClosing] = useState(false)
  const [priorityFilter, setPriorityFilter] = useState(() => localStorage.getItem('kanban_priorityFilter') || 'all')
  const [studioFilter, setStudioFilter]     = useState(() => localStorage.getItem('kanban_studioFilter') || 'all')
  // Portafolio: 'all' | '' (sin portafolio) | 'p:<id>' | 'i:<id>' (M19).
  const [portfolioFilter, setPortfolioFilter] = useState(() => localStorage.getItem('kanban_portfolioFilter') ?? 'all')
  const portfolioCatalog = usePortfolios()
  const { studios, codes } = useCatalogs('member')
  // El área solo se muestra (tarjeta, tabla, búsqueda) en solicitudes del código interno exacto PROCONT.
  const canonicalProcontCodeId = procontCodeId(codes)
  const [userFilter, setUserFilter]         = useState(() => localStorage.getItem('kanban_userFilter') || 'all')
  const [myProjectsOnly, setMyProjectsOnly] = useState(() => localStorage.getItem('kanban_myProjectsOnly') === 'true')
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const v = localStorage.getItem('kanban_viewMode') as ViewMode
    return (['kanban', 'table', 'gantt', 'roadmap'] as ViewMode[]).includes(v) ? v : 'kanban'
  })

  useEffect(() => { localStorage.setItem('kanban_priorityFilter', priorityFilter) }, [priorityFilter])
  // 24/11/2026: Boards ya no filtra por área. Se retira el filtro guardado para que no oculte tarjetas en silencio.
  useEffect(() => { try { localStorage.removeItem('kanban_areaFilter') } catch { /* almacenamiento no disponible */ } }, [])
  useEffect(() => { localStorage.setItem('kanban_studioFilter', studioFilter) },     [studioFilter])
  useEffect(() => { localStorage.setItem('kanban_portfolioFilter', portfolioFilter) }, [portfolioFilter])
  // Un filtro guardado que apunta a un portafolio o iniciativa que ya no existe no debe ocultar tarjetas.
  useEffect(() => {
    if (!portfolioCatalog.loaded || portfolioFilter === 'all' || portfolioFilter === '') return
    const id = portfolioFilter.slice(2)
    const exists = portfolioFilter.startsWith('p:') ? portfolioCatalog.portfolios.some(p => p.id === id) : portfolioCatalog.initiatives.some(i => i.id === id)
    if (!exists) setPortfolioFilter('all')
  }, [portfolioCatalog, portfolioFilter])
  useEffect(() => { localStorage.setItem('kanban_userFilter', userFilter) },         [userFilter])
  useEffect(() => { localStorage.setItem('kanban_myProjectsOnly', String(myProjectsOnly)) }, [myProjectsOnly])
  useEffect(() => { localStorage.setItem('kanban_viewMode', viewMode) },              [viewMode])
  useEffect(() => { setSelectedIds([]) }, [statusFilter])

  // Sincronizar selectedProject con datos frescos después de cada reload
  useEffect(() => {
    if (selectedProject) {
      const fresh = projects.find(p => p.id === selectedProject.project.id)
      if (fresh) {
        setSelectedProject(prev => prev ? { ...prev, project: fresh } : null)
      }
    }
  }, [projects])

  // Abrir proyecto al hacer clic en una notificación
  useEffect(() => {
    if (!openProjectId || !projects.length) return
    const project = projects.find(p => p.id === openProjectId)
    if (project) {
      const flow = (project as any).project_flows?.[0] ?? null
      setSelectedProject({ project, flow })
      onOpenHandled?.()
    }
  }, [openProjectId, projects])

  const phases = PHASES[boardType]
  const filteredProjects = projects.filter(project => {
    if (priorityFilter !== 'all' && project.priority !== priorityFilter) return false
    const req = (project as any).requests
    // Solo se presenta/filtra el área de solicitudes clasificadas con el código exacto PROCONT.
    const area = req?.studio_code_id === canonicalProcontCodeId && canonicalProcontCodeId ? req?.requester_area : null
    if (studioFilter !== 'all' && (project as any).requests?.studio_id !== studioFilter) return false
    if (portfolioFilter !== 'all') {
      if (portfolioFilter === '' && project.portfolio_id) return false
      if (portfolioFilter.startsWith('p:') && project.portfolio_id !== portfolioFilter.slice(2)) return false
      if (portfolioFilter.startsWith('i:') && project.initiative_id !== portfolioFilter.slice(2)) return false
    }

    // Filtro por responsable / usuario
    if (canManage) {
      if (userFilter === 'me' && currentUser) {
        const flows: any[] = (project as any).project_flows ?? []
        if (!flows.some(f => f.assigned_to === currentUser.id)) return false
      } else if (userFilter !== 'all') {
        const flows: any[] = (project as any).project_flows ?? []
        if (!flows.some(f => f.assigned_to === userFilter)) return false
      }
    } else {
      if (myProjectsOnly && currentUser) {
        const flows: any[] = (project as any).project_flows ?? []
        if (!flows.some(f => f.assigned_to === currentUser.id)) return false
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      const titleMatch = project.title?.toLowerCase().includes(q)
      const numMatch   = (project as any).project_number?.toLowerCase().includes(q)
      const areaMatch  = area?.toLowerCase().includes(q)
      const portfolioMatch = portfolioLabel(portfolioCatalog, project.portfolio_id, project.initiative_id)?.toLowerCase().includes(q)
      if (!titleMatch && !numMatch && !areaMatch && !portfolioMatch) return false
    }
    return true
  })

  const getProjectsByPhase = (phaseId: string) => {
    return filteredProjects
      .map((project) => {
        const flow = ((project as any).project_flows as ProjectFlow[] || []).find(
          (f) => f.flow_type === boardType && f.current_phase === phaseId
        )
        return flow ? { project, flow } : null
      })
      .filter(Boolean) as Array<{ project: any; flow: ProjectFlow }>
  }

  const handleDragEnd = async (result: DropResult) => {
    if (!canEdit) return
    const { destination, source, draggableId } = result
    if (!destination || destination.droppableId === source.droppableId) return
    const item = projects.flatMap(p => ((p as any).project_flows as ProjectFlow[] ?? []).map(f => ({ p, f }))).find(x => x.f.id === draggableId)
    if (!item) return
    if (item.p.is_blocked) { toast.error('El ticket está bloqueado: desbloquéalo antes de cambiar de fase.'); return }
    const target = destination.droppableId as Phase
    try {
      if (target === 'done' || target === 'deployed') {
        // Snapshot del servidor: si cerrar deja tareas pendientes, se pide confirmación.
        const ticket = await board.getTicket(item.p.id)
        if (needsPendingConfirmation(ticket, draggableId, target)) { setPendingClose({ ticket, flowId: draggableId, title: item.p.title, key: actionKey() }); return }
      }
      await moveFlow(item.p.id, draggableId, target)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const confirmClose = async () => {
    if (!pendingClose) return
    setClosing(true)
    const { ticket, flowId, key } = pendingClose
    const target = ticket.flows.find(f => f.id === flowId)?.flow_type === 'administrative' ? 'deployed' : 'done'
    try {
      await moveFlow(ticket.project_id, flowId, target, { confirmPending: true, pendingFingerprint: ticket.pending_fingerprint }, key)
      toast.success('Ticket terminado (Done)')
      setPendingClose(null)
    } catch (error) {
      toast.error(errorMessage(error))
      // La lista pudo cambiar: volver a mostrar la vigente.
      try { const fresh = await board.getTicket(ticket.project_id); setPendingClose(p => p && { ...p, ticket: fresh }) } catch { setPendingClose(null) }
    } finally { setClosing(false) }
  }

  const hasFilters = priorityFilter !== 'all' || portfolioFilter !== 'all' || studioFilter !== 'all' || (canManage ? userFilter !== 'all' : myProjectsOnly) || searchQuery.trim() !== ''
  const filteredCount = filteredProjects.length
  const totalCount = projects.length

  if (error) return <div role="alert" className="text-red-700 p-4">{error} <button className="underline" onClick={reload}>Reintentar</button></div>

  // Skeleton en la carga inicial (sin proyectos aún)
  if (loading && projects.length === 0) {
    return (
      <>
        <div className="flex items-center gap-4 mb-4">
          <div>
            <div className="h-7 w-56 bg-gray-200 rounded animate-pulse mb-1" />
            <div className="h-3 w-64 bg-gray-100 rounded animate-pulse" />
          </div>
          <div className="h-10 w-72 bg-gray-100 rounded-lg animate-pulse" />
        </div>
        <div className="flex items-center gap-2 mb-4">
          {[1, 2, 3].map(i => <div key={i} className="h-8 w-24 bg-gray-100 rounded-full animate-pulse" />)}
          <div className="ml-auto h-8 w-36 bg-gray-200 rounded-lg animate-pulse" />
        </div>
        <div className="kanban-scroll flex gap-4 overflow-x-auto pb-4">
          {phases.map((phase, ci) => (
            <div key={phase.id} className="flex-shrink-0 w-72">
              <div className="rounded-t-lg p-3 bg-gray-100">
                <div className="h-4 w-28 bg-white/40 rounded" />
              </div>
              <div className="bg-gray-50 rounded-b-lg p-3 space-y-3 min-h-[200px]">
                {Array.from({ length: ci < 2 ? 3 : ci < 4 ? 2 : 1 }).map((_, j) => (
                  <div key={j} className="bg-surface rounded-lg border border-gray-100 p-3.5 animate-pulse">
                    <div className="h-3 bg-gray-200 rounded mb-2 w-4/5" />
                    <div className="h-3 bg-gray-100 rounded mb-3 w-3/5" />
                    <div className="flex gap-1 mb-2.5">
                      <div className="h-4 bg-gray-200 rounded w-12" />
                      <div className="h-4 bg-gray-100 rounded w-8" />
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="h-3 bg-gray-100 rounded w-16" />
                      <div className="h-5 w-5 bg-gray-200 rounded-full" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </>
    )
  }

  const boardTitle = boardType === 'development' ? 'Board Development' : 'Administrative (histórico)'

  return (
    <>
      {/* Header: título + buscador */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 mb-4">
        <div>
          <h1 className="view-title"><ControlLabel icon={boardType === 'development' ? 'code' : 'tickets'}>{boardTitle}</ControlLabel></h1>
          <p className="text-gray-600 text-sm mt-0.5">
            {boardType === 'development'
              ? 'Arrastra los tickets entre fases (se pueden saltar fases). Terminado solo al llegar a Done.'
              : 'Proyectos anteriores al flujo único Development. Se conservan con sus datos e historial.'}
          </p>
        </div>
        <label className="toolbar-field w-full sm:w-72">
          <span>Buscar</span>
          <input
            type="search"
            placeholder="Título, número o área"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="ui-input"
          />
        </label>
      </div>

      {/* Barra de Boards (24/11/2026): fila 1 = estado, vistas y acción principal; fila 2 = filtros y color personal.
          Sin filtro de área: el área solo existe para el código interno exacto PROCONT y se clasifica en sus formularios. */}
      <div className="board-toolbar mb-4">
        <div className="board-toolbar-row">
          <div role="group" aria-label="Estado de los proyectos" className="segmented">
            {STATUS_OPTIONS.map(opt => (
              <button
                key={opt.value}
                aria-pressed={statusFilter === opt.value}
                onClick={() => setStatusFilter(opt.value)}
                {...preloadOnIntent(STATUS_LOADERS[opt.value] ?? noop)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${statusFilter === opt.value ? 'bg-brand-100 text-brand-700' : 'text-gray-600 hover:text-brand-700'}`}
              >
                <ControlLabel icon={opt.icon}>{opt.label}</ControlLabel>
              </button>
            ))}
          </div>
          <div className="board-toolbar-actions">
            <div role="group" aria-label="Vista del tablero" className="board-view-modes segmented">
              {VIEW_MODES.map(vm => (
                <button
                  key={vm.value}
                  aria-pressed={viewMode === vm.value}
                  onClick={() => setViewMode(vm.value)}
                  {...preloadOnIntent(VIEW_LOADERS[vm.value] ?? noop)}
                  title={vm.label}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${viewMode === vm.value ? 'bg-brand-100 text-brand-700' : 'text-gray-600 hover:text-brand-700'}`}
                >
                  <ControlLabel icon={vm.icon}>{vm.label}</ControlLabel>
                </button>
              ))}
            </div>
            {canManage && boardType === 'development' && (
              <button
                onClick={() => setShowNewModal(true)}
                {...preloadOnIntent(loadNewProjectModal)}
                className="ui-button ui-button-primary board-new-project"
              >
                <ControlLabel icon="plus">Nuevo ticket</ControlLabel>
              </button>
            )}
          </div>
        </div>

        <div className="board-toolbar-row board-toolbar-filters">
          {statusFilter === 'active' && (
            <div role="group" aria-label="Filtros del tablero" className="board-filter-group">
              <div className="toolbar-field board-filter-priority">
                <PrioritySelect id="board-priority-filter" label="Prioridad" value={priorityFilter} onChange={setPriorityFilter}
                  extraOptions={[{ value: 'all', label: 'Todas' }]} />
              </div>

              {studios.length > 0 && (
                <label className="toolbar-field board-filter-studio">
                  <span>Estudio</span>
                  <select
                    value={studioFilter}
                    onChange={e => setStudioFilter(e.target.value)}
                    className="ui-input toolbar-select"
                  >
                    <option value="all">Todos</option>
                    {studios.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
                  </select>
                </label>
              )}

              {portfolioCatalog.portfolios.length > 0 && (
                <label className="toolbar-field board-filter-portfolio">
                  <span>Portafolio</span>
                  <PortfolioSelect value={portfolioFilter} onChange={setPortfolioFilter} className="ui-input toolbar-select"
                    extraOptions={[{ value: 'all', label: 'Todos' }]} />
                </label>
              )}

              {canManage ? (
                <label className="toolbar-field board-filter-owner">
                  <span>Responsable</span>
                  <select
                    value={userFilter}
                    onChange={e => setUserFilter(e.target.value)}
                    className="ui-input toolbar-select"
                  >
                    <option value="all">Todos</option>
                    <option value="me">Mis proyectos</option>
                    <optgroup label="Filtrar por Usuario">
                      {activeUsers.map(u => (
                        <option key={u.id} value={u.id}>
                          {u.full_name} ({u.role})
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </label>
              ) : (
                <button
                  aria-pressed={myProjectsOnly}
                  onClick={() => setMyProjectsOnly(v => !v)}
                  className={`ui-button board-mine ${myProjectsOnly ? 'is-on' : ''}`}
                >
                  <ControlLabel icon="user">Mis proyectos</ControlLabel>
                </button>
              )}

              {hasFilters && (
                <div className="board-filter-reset">
                  <button
                    onClick={() => { setPriorityFilter('all'); setPortfolioFilter('all'); setStudioFilter('all'); setUserFilter('all'); setMyProjectsOnly(false); setSearchQuery('') }}
                    className="ui-button ui-button-quiet"
                  >
                    <ControlLabel icon="close">Limpiar filtros</ControlLabel>
                  </button>
                  <span className="text-sm text-gray-600 tabular-nums" aria-live="polite">{filteredCount} de {totalCount}</span>
                </div>
              )}
            </div>
          )}
          {/* Color personal de tarjeta (usuarios internos; el panel no es accesible para clientes) */}
          {currentUser && <div className="board-toolbar-color">
            <OwnerColorPicker userId={currentUser.id} userName={currentUser.full_name} />
          </div>}

        </div>
      </div>

      {/* Tarjetas y filas abren el modal del proyecto: se precarga al acercarse (delegación, sin caja). */}
      <div className="contents" onPointerOver={preloadModal} onFocusCapture={preloadModal} onTouchStartCapture={preloadModal}>
      <Suspense fallback={viewLoading}>
      {/* ── VISTA TABLA ── */}
      {viewMode === 'table' && (
        <TableView
          projects={filteredProjects as any}
          boardType={boardType}
          procontCodeId={canonicalProcontCodeId}
          onProjectClick={setSelectedProject}
          loading={loading}
          users={activeUsers}
        />
      )}

      {/* ── VISTA GANTT ── */}
      {viewMode === 'gantt' && (
        <GanttView
          projects={filteredProjects as any}
          boardType={boardType}
          procontCodeId={canonicalProcontCodeId}
          onProjectClick={setSelectedProject}
          loading={loading}
        />
      )}

      {/* ── VISTA ROADMAP ── */}
      {viewMode === 'roadmap' && (
        <RoadmapView
          projects={filteredProjects as any}
          procontCodeId={canonicalProcontCodeId}
          onProjectClick={setSelectedProject}
          loading={loading}
        />
      )}

      {/* ── KANBAN: sin resultados con filtros activos ── */}
      {viewMode === 'kanban' && statusFilter === 'active' && filteredProjects.length === 0 && hasFilters && (
        <div className="flex flex-col items-center justify-center h-64 text-gray-600">
          <Icon name="search" size={40} className="mb-3 text-gray-500" />
          <p className="text-base font-medium text-gray-500">Sin proyectos con los filtros aplicados</p>
          <button
            onClick={() => { setPriorityFilter('all'); setPortfolioFilter('all'); setStudioFilter('all'); setMyProjectsOnly(false); setSearchQuery('') }}
            className="mt-3 text-sm text-primary hover:underline"
          >
            Limpiar filtros
          </button>
        </div>
      )}

      {/* ── VISTA KANBAN ── */}
      {viewMode === 'kanban' && statusFilter === 'active' && !(filteredProjects.length === 0 && hasFilters) && (
        <DragDropContext onDragEnd={handleDragEnd}>
          <ScrollHint>Desliza horizontalmente para ver todas las fases del tablero.</ScrollHint>
          <div role="region" aria-label="Tablero Kanban, desplazamiento horizontal" tabIndex={0} className="kanban-scroll flex gap-4 overflow-x-auto pb-4">
            {phases.map((phase) => (
              <BoardColumn
                key={phase.id}
                phase={phase}
                projects={getProjectsByPhase(phase.id)}
                onProjectClick={setSelectedProject}
                users={activeUsers}
                onAssign={(projectId, flowId, userId) => { void assignFlow(projectId, flowId, userId).then(() => toast.success('Responsable actualizado')).catch(err => toast.error(errorMessage(err))) }}
                canManage={canManage}
                selectedIds={canEdit ? selectedIds : []}
                onSelect={canEdit ? (id => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])) : undefined}
                procontCodeId={canonicalProcontCodeId}
              />
            ))}
          </div>
        </DragDropContext>
      )}

      {/* Completados / Archivados en modo kanban */}
      {viewMode === 'kanban' && (statusFilter === 'completed' || statusFilter === 'archived') && (
        <ProjectListView
          projects={projects as any}
          boardType={boardType}
          onProjectClick={setSelectedProject}
          status={statusFilter}
          procontCodeId={canonicalProcontCodeId}
        />
      )}

      </Suspense>
      </div>

      {/* Cargar más */}
      {hasMore && (
        <div className="flex justify-center mt-4">
          <button
            onClick={loadMore}
            className="px-6 py-2 bg-surface border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition shadow-sm"
          >
            Cargar más proyectos...
          </button>
        </div>
      )}

      {/* ── BULK ACTION BAR ── */}
      {canEdit && selectedIds.length > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-surface border border-gray-200 shadow-2xl rounded-2xl px-4 py-3 flex flex-wrap items-center justify-center gap-3 w-max max-w-[calc(100vw-2rem)]">
          <span role="status" className="text-sm font-medium text-gray-700">
            {selectedIds.length} seleccionado{selectedIds.length !== 1 ? 's' : ''}
          </span>
          {selectedIds.length > 100 && <span className="text-xs text-red-700">Máximo 100 por operación</span>}
          <div className="h-5 w-px bg-gray-300" aria-hidden="true" />
          <PrioritySelect id="bulk-priority" label="Prioridad definitiva" value={'' as string} disabled={selectedIds.length > 100}
            className="prio-select-inline" extraOptions={[{ value: '', label: 'Elegir…' }]}
            onChange={async val => {
              if (!val) return
              try {
                await bulkUpdate(selectedIds, 'set_priority', { priority: val as any })
                setSelectedIds([])
                toast.success(`Prioridad actualizada en ${selectedIds.length} proyecto${selectedIds.length !== 1 ? 's' : ''}`)
              } catch (err) { toast.error(errorMessage(err)) }
            }} />
          <button
            disabled={selectedIds.length > 100}
            onClick={async () => {
              const count = selectedIds.length
              if (!confirm(`¿Archivar ${count} ticket(s)? Se conserva su historial y pueden restaurarse.`)) return
              try {
                await bulkUpdate(selectedIds, 'archive', {})
                setSelectedIds([])
                toast.success(`${count} proyecto${count !== 1 ? 's' : ''} archivado${count !== 1 ? 's' : ''}`)
              } catch (err) { toast.error(errorMessage(err)) }
            }}
            className="ui-button ui-button-secondary"
          >
            <ControlLabel icon="archive">Archivar</ControlLabel>
          </button>
          <button
            onClick={() => setSelectedIds([])}
            className="ui-button ui-button-secondary"
          >
            Cancelar
          </button>
        </div>
      )}

      {/* Project Modal */}
      {selectedProject && (
        <Suspense fallback={null}><ProjectModal
          project={selectedProject.project}
          flows={(selectedProject.project as any).project_flows || []}
          onClose={() => setSelectedProject(null)}
          onUpdate={reload}
          updateProject={updateProject}
        /></Suspense>
      )}

      {pendingClose && (
        <DoneConfirmDialog key={pendingClose.ticket.pending_fingerprint} title={pendingClose.title} pending={pendingClose.ticket.pending_items}
          busy={closing} onCancel={() => setPendingClose(null)} onConfirm={() => { void confirmClose() }} />
      )}

      {/* New Project Modal */}
      {showNewModal && (
        <Suspense fallback={null}><NewProjectModal
          onClose={() => setShowNewModal(false)}
          onCreate={createTicket}
        /></Suspense>
      )}
    </>
  )
}
