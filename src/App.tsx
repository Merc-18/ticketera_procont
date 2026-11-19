import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useAuth } from './hooks/useAuth'
import LoginForm from './components/auth/LoginForm'
import ProtectedRoute from './components/auth/ProtectedRoute'
import KanbanBoard from './components/boards/KanbanBoard'
import BoardSelector from './components/boards/BoardSelector'
import DashboardView from './components/dashboard/DashboardView'
import RequestTracking from './components/requests/RequestTracking'
import PublicLanding from './components/requests/PublicLanding'
import RequestInbox from './components/requests/RequestInbox'
import UserManagementPanel from './components/admin/UserManagementPanel'
import WorkloadView from './components/admin/WorkloadView'

import PapeleraView from './components/admin/PapeleraView'
import CatalogsPanel from './components/admin/CatalogsPanel'
import ClientHome from './components/client/ClientHome'
import ClientLaunch from './components/client/ClientLaunch'
import ClientWorkspace from './components/client/ClientWorkspace'
import ClientNewTicket from './components/client/ClientNewTicket'
import MyTickets from './components/client/MyTickets'
import ClientTicketDetail from './components/client/ClientTicketDetail'
import NotificationBell from './components/notifications/NotificationBell'
import BrandLogo from './components/ui/BrandLogo'
import { usePendingCount } from './hooks/usePendingCount'
import { errorMessage } from './lib/supabase-errors'
import { toast } from './lib/toast'

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
      <p className="text-xs text-white/60 whitespace-nowrap">Lima GMT-5</p>
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
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-10 shadow-md">
        {/* Barra corporativa */}
        <div className="bg-brand-700 border-b-4 border-accent-400">
          <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
            <BrandLogo tone="light" size={40} />

            <div className="flex items-center gap-3 sm:gap-4">
              {/* Reloj + Campana */}
              {canSeeEquipo && <AdminClock />}
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
        <nav className="bg-white border-b border-gray-200" aria-label="Secciones">
          <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1 bg-gray-100 p-1 rounded-lg">
              {([
                ['dashboard', '📈 Dashboard'],
                ['boards', '📊 Boards'],
                ['requests', '📬 Requests'],
                ...(canSeeEquipo ? [['equipo', '👥 Equipo']] : []),
              ] as [typeof currentTab, string][]).map(([tab, label]) => (
                <button
                  key={tab}
                  onClick={() => setCurrentTab(tab)}
                  aria-current={currentTab === tab ? 'page' : undefined}
                  className={`px-3 sm:px-4 py-2 rounded-md font-medium text-sm transition flex items-center gap-1.5 ${
                    currentTab === tab
                      ? 'bg-brand-700 text-white shadow-sm'
                      : 'text-gray-600 hover:text-brand-700 hover:bg-white'
                  }`}
                >
                  {label}
                  {tab === 'requests' && pendingCount > 0 && (
                    <span className="min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
                      {pendingCount > 9 ? '9+' : pendingCount}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Board Selector (solo si está en boards) */}
            {currentTab === 'boards' && (
              <BoardSelector
                currentBoard={currentBoard}
                onChange={setCurrentBoard}
              />
            )}
          </div>
        </nav>
      </header>

      {/* Main Content */}
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6">
        {currentTab === 'dashboard' && <DashboardView />}

        {currentTab === 'boards' && (
          <KanbanBoard
            boardType={currentBoard}
            openProjectId={openProjectId}
            onOpenHandled={() => setOpenProjectId(null)}
          />
        )}

        {currentTab === 'requests' && (
          <>
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-brand-700">
                📬 Inbox de Solicitudes
              </h2>
              <p className="text-gray-600 text-sm mt-1">
                Revisa y gestiona las solicitudes pendientes
              </p>
            </div>
            <RequestInbox />
          </>
        )}

        {currentTab === 'equipo' && canSeeEquipo && (
          <>
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-brand-700">👥 Equipo</h2>
              <p className="text-gray-600 text-sm mt-1">
                Gestión de usuarios y carga de trabajo del equipo
              </p>
            </div>

            {/* Sub-tabs */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit mb-6">
              <button
                onClick={() => setAdminSubTab('carga')}
                className={`px-4 py-2 rounded-md font-medium text-sm transition ${
                  adminSubTab === 'carga'
                    ? 'bg-white text-primary shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                📊 Carga de Trabajo
              </button>
              {isAdminOrSuperAdmin && (
                <button
                  onClick={() => setAdminSubTab('usuarios')}
                  className={`px-4 py-2 rounded-md font-medium text-sm transition ${
                    adminSubTab === 'usuarios'
                      ? 'bg-white text-primary shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  🔑 Usuarios
                </button>
              )}

              {isAdminOrSuperAdmin && (
                <button
                  onClick={() => setAdminSubTab('papelera')}
                  className={`px-4 py-2 rounded-md font-medium text-sm transition ${
                    adminSubTab === 'papelera'
                      ? 'bg-white text-primary shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  🗑 Papelera
                </button>
              )}

              {isSuperAdmin && (
                <button
                  onClick={() => setAdminSubTab('areas')}
                  className={`px-4 py-2 rounded-md font-medium text-sm transition ${
                    adminSubTab === 'areas'
                      ? 'bg-white text-primary shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  🗂 Catálogos
                </button>
              )}
            </div>

            {adminSubTab === 'carga'    && <WorkloadView />}
            {adminSubTab === 'usuarios' && <UserManagementPanel />}

            {adminSubTab === 'papelera' && <PapeleraView />}
            {adminSubTab === 'areas' && isSuperAdmin && <CatalogsPanel />}
          </>
        )}
      </div>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginForm />} />
        <Route path="/portal" element={<PublicLanding />} />
        {/* Recorrido anónimo retirado: Nueva Solicitud exige ingreso Quipu/QuipuFac. */}
        <Route path="/request" element={<Navigate to="/cliente" replace />} />
        <Route path="/tracking" element={<RequestTracking />} />
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
    </BrowserRouter>
  )
}

export default App
