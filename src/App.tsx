import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense, useState, useEffect } from 'react'
import { useAuth } from './hooks/useAuth'
import ProtectedRoute from './components/auth/ProtectedRoute'
import PublicLanding from './components/requests/PublicLanding'
import NotificationBell from './components/notifications/NotificationBell'
import BrandLogo from './components/ui/BrandLogo'
import ControlLabel from './components/ui/ControlLabel'
import type { IconName } from './components/ui/Icon'
import { loadClientHome, loadClientLaunch, loadClientWorkspace, loadClientNewTicket, loadMyTickets, loadClientTicketDetail } from './lib/client-routes'
import { usePendingCount } from './hooks/usePendingCount'
import { errorMessage } from './lib/supabase-errors'
import { toast } from './lib/toast'
import ThemeToggle from './components/ui/ThemeToggle'

// Las vistas internas se descargan al abrir su sección, sin cambiar rutas ni permisos.
const DashboardView = lazy(() => import('./components/dashboard/DashboardView'))
const loadKanbanBoard = () => import('./components/boards/KanbanBoard')
const loadBoardSelector = () => import('./components/boards/BoardSelector')
const KanbanBoard = lazy(loadKanbanBoard)
// El selector de tablero solo existe en la pestaña Boards: viaja con ella (JS por vista, Taste perf.md).
const BoardSelector = lazy(loadBoardSelector)
const preloadBoards = () => { for (const load of [loadKanbanBoard, loadBoardSelector]) load().catch(() => undefined) }
const RequestInbox = lazy(() => import('./components/requests/RequestInbox'))
const UserManagementPanel = lazy(() => import('./components/admin/UserManagementPanel'))
const WorkloadView = lazy(() => import('./components/admin/WorkloadView'))
const PapeleraView = lazy(() => import('./components/admin/PapeleraView'))
const CatalogsPanel = lazy(() => import('./components/admin/CatalogsPanel'))
// Rutas públicas secundarias y espacio del cliente: fuera del JavaScript inicial del portal (Taste perf.md).
const LoginForm = lazy(() => import('./components/auth/LoginForm'))
const ClientHome = lazy(loadClientHome)
const ClientLaunch = lazy(loadClientLaunch)
const ClientWorkspace = lazy(loadClientWorkspace)
const ClientNewTicket = lazy(loadClientNewTicket)
const MyTickets = lazy(loadMyTickets)
const ClientTicketDetail = lazy(loadClientTicketDetail)
const viewLoading = <p role="status" className="py-6 text-base text-gray-600">Cargando vista…</p>
const routeLoading = <p role="status" className="page-wrap py-12 text-base text-gray-600">Cargando…</p>

function AdminClock() {
  const [time, setTime] = useState('')
  useEffect(() => {
    const tick = () => setTime(
      new Date().toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour12: false })
    )
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="text-right hidden sm:block">
      <p className="text-sm font-mono font-semibold text-white">{time}</p>
      <p className="text-xs text-white/80 whitespace-nowrap">Lima GMT-5</p>
    </div>
  )
}

function Dashboard() {
  const { user, signOut } = useAuth()
  const [currentBoard, setCurrentBoard] = useState<'development' | 'administrative'>('development')
  const [currentTab, setCurrentTab]   = useState<'dashboard' | 'boards' | 'requests' | 'equipo'>('dashboard')
  const [adminSubTab, setAdminSubTab] = useState<'usuarios' | 'carga' | 'papelera' | 'areas'>('carga')
  const [openProjectId, setOpenProjectId] = useState<string | null>(null)
  const isAdminOrSuperAdmin = user?.role === 'admin' || user?.role === 'superadmin'
  const isSuperAdmin = user?.role === 'superadmin'
  const canSeeEquipo = isAdminOrSuperAdmin || user?.role === 'developer'
  const pendingCount = usePendingCount(isAdminOrSuperAdmin)

  return (
    <div className="enterprise">
      {/* Header */}
      <header className="enterprise-header">
        {/* Barra corporativa */}
        <div className="brand-band border-b-4 border-accent-400">
          <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <BrandLogo tone="light" size={40} />

            <div className="flex items-center gap-3 sm:gap-4">
              {/* Reloj + Campana */}
              {canSeeEquipo && <AdminClock />}
              <ThemeToggle onBand />
              <NotificationBell
                buttonClassName="text-white/80 hover:text-accent-300 hover:bg-white/10"
                onProjectClick={(projectId) => {
                  setCurrentTab('boards')
                  setOpenProjectId(projectId)
                }}
              />

              {/* User Info */}
              <div className="text-right hidden md:block">
                <p className="font-semibold text-white leading-tight">{user?.full_name}</p>
                <p className="text-xs text-accent-300 capitalize">{user?.role}</p>
              </div>
              <button
                onClick={() => { void signOut().catch(err => toast.error(errorMessage(err))) }}
                className="px-3 sm:px-4 py-2 bg-white/10 text-white border border-white/30 rounded-lg hover:bg-white/20 transition text-sm font-medium whitespace-nowrap"
              >
                Cerrar Sesión
              </button>
            </div>
          </div>
        </div>

        {/* Navegación */}
        <nav className="bg-surface border-b border-gray-200" aria-label="Secciones">
          <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-3">
            <div className="enterprise-tabs flex flex-wrap gap-1 bg-gray-100 p-1 rounded-lg">
              {([
                ['dashboard', 'Dashboard', 'chart'],
                ['boards', 'Boards', 'board'],
                ['requests', 'Requests', 'inbox'],
                ...(canSeeEquipo ? [['equipo', 'Equipo', 'team']] : []),
              ] as [typeof currentTab, string, IconName][]).map(([tab, label, icon]) => (
                <button
                  key={tab}
                  onClick={() => setCurrentTab(tab)}
                  {...(tab === 'boards' ? { onPointerEnter: preloadBoards, onFocus: preloadBoards, onTouchStart: preloadBoards } : {})}
                  aria-current={currentTab === tab ? 'page' : undefined}
                  className={`px-3 sm:px-4 py-2 rounded-md font-medium text-sm transition flex items-center gap-1.5 ${
                    currentTab === tab
                      ? 'bg-brand-700 text-white shadow-sm'
                      : 'text-gray-600 hover:text-brand-700 hover:bg-surface'
                  }`}
                >
                  <ControlLabel icon={icon}>{label}</ControlLabel>
                  {tab === 'requests' && pendingCount > 0 && (
                    <span aria-label={`${pendingCount} pendientes`} className="min-w-[22px] h-[22px] bg-accent-400 text-on-accent text-[13px] font-medium rounded-full flex items-center justify-center px-1.5 leading-none">
                      {pendingCount > 9 ? '9+' : pendingCount}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Board Selector (solo si está en boards) */}
            {currentTab === 'boards' && (
              <Suspense fallback={null}>
                <BoardSelector
                  currentBoard={currentBoard}
                  onChange={setCurrentBoard}
                />
              </Suspense>
            )}
          </div>
        </nav>
      </header>

      {/* Main Content */}
      <main id="main-content" tabIndex={-1} className="enterprise-main max-w-[1600px] mx-auto px-4 sm:px-6">
        {currentTab === 'dashboard' && <Suspense fallback={viewLoading}><DashboardView /></Suspense>}

        {currentTab === 'boards' && (
          <Suspense fallback={viewLoading}>
          <KanbanBoard
            boardType={currentBoard}
            openProjectId={openProjectId}
            onOpenHandled={() => setOpenProjectId(null)}
          />
          </Suspense>
        )}

        {currentTab === 'requests' && (
          <>
            <div className="mb-6">
              <h1 className="view-title">
                <ControlLabel icon="inbox">Bandeja de solicitudes</ControlLabel>
              </h1>
              <p className="text-gray-600 text-sm mt-1">
                Revisa y gestiona las solicitudes pendientes
              </p>
            </div>
            <Suspense fallback={viewLoading}><RequestInbox /></Suspense>
          </>
        )}

        {currentTab === 'equipo' && canSeeEquipo && (
          <>
            <div className="mb-6">
              <h1 className="view-title"><ControlLabel icon="team">Equipo</ControlLabel></h1>
              <p className="text-gray-600 text-sm mt-1">
                Gestión de usuarios y carga de trabajo del equipo
              </p>
            </div>

            {/* Sub-tabs */}
            <div className="flex flex-wrap gap-1 bg-gray-100 p-1 rounded-lg w-fit mb-6">
              <button
                onClick={() => setAdminSubTab('carga')}
                className={`px-4 py-2 rounded-md font-medium text-sm transition ${
                  adminSubTab === 'carga'
                    ? 'bg-surface text-primary shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <ControlLabel icon="chart">Carga de trabajo</ControlLabel>
              </button>
              {isAdminOrSuperAdmin && (
                <button
                  onClick={() => setAdminSubTab('usuarios')}
                  className={`px-4 py-2 rounded-md font-medium text-sm transition ${
                    adminSubTab === 'usuarios'
                      ? 'bg-surface text-primary shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <ControlLabel icon="key">Usuarios</ControlLabel>
                </button>
              )}

              {isAdminOrSuperAdmin && (
                <button
                  onClick={() => setAdminSubTab('papelera')}
                  className={`px-4 py-2 rounded-md font-medium text-sm transition ${
                    adminSubTab === 'papelera'
                      ? 'bg-surface text-primary shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <ControlLabel icon="trash">Papelera</ControlLabel>
                </button>
              )}

              {isSuperAdmin && (
                <button
                  onClick={() => setAdminSubTab('areas')}
                  className={`px-4 py-2 rounded-md font-medium text-sm transition ${
                    adminSubTab === 'areas'
                      ? 'bg-surface text-primary shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <ControlLabel icon="tickets">Catálogos</ControlLabel>
                </button>
              )}
            </div>

            <Suspense fallback={viewLoading}>
            {adminSubTab === 'carga'    && <WorkloadView />}
            {adminSubTab === 'usuarios' && <UserManagementPanel />}

            {adminSubTab === 'papelera' && <PapeleraView />}
            {adminSubTab === 'areas' && isSuperAdmin && <CatalogsPanel />}
            </Suspense>
          </>
        )}
      </main>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={routeLoading}>
      <Routes>
        <Route path="/login" element={<LoginForm />} />
        <Route path="/portal" element={<PublicLanding />} />
        {/* Recorrido anónimo retirado: Nueva Solicitud exige ingreso Quipu/QuipuFac. */}
        <Route path="/request" element={<Navigate to="/cliente" replace />} />
        {/* Pantalla de seguimiento retirada: los enlaces antiguos llegan al formulario integrado del portal. */}
        <Route path="/tracking" element={<Navigate to="/portal#seguimiento" replace />} />
        {/* Portal de clientes Quipu/QuipuFac (sesión propia, separada del personal interno). */}
        <Route path="/cliente" element={<ClientHome />} />
        <Route path="/cliente/acceso/:provider" element={<ClientLaunch />} />
        <Route element={<ClientWorkspace />}>
          <Route path="/cliente/nuevo" element={<ClientNewTicket />} />
          <Route path="/cliente/tickets" element={<MyTickets />} />
          <Route path="/cliente/tickets/:id" element={<ClientTicketDetail />} />
        </Route>
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/portal" replace />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default App
