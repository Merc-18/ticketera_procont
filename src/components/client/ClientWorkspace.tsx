import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import BrandLogo from '../ui/BrandLogo'
import { clientPortal } from '../../lib/client-portal-api'
import { clientSessionStore } from '../../lib/client-session-store'
import {
  AUTH_TYPE_LABEL, identityLabel, isClientPortalError, type ClientSession,
} from '../../lib/client-portal'
import MockBanner from './MockBanner'
import { useCatalogs } from '../../hooks/useCatalogs'

interface ClientContextValue {
  session: ClientSession
  token: string
  /** Trata errores comunes: sesión vencida → vuelve al ingreso. Devuelve el mensaje a mostrar. */
  handleError: (err: unknown) => string
  /** Nombre visible del producto (catálogo público activo); '—' si no está disponible. */
  productName: (systemId: string) => string
}
const ClientContext = createContext<ClientContextValue | null>(null)

export function useClientSession() {
  const value = useContext(ClientContext)
  if (!value) throw new Error('useClientSession fuera del espacio del cliente')
  return value
}

/** Espacio autenticado del cliente: cabecera con empresa e identidad, Nuevo ticket y Mis tickets. */
export default function ClientWorkspace() {
  const navigate = useNavigate()
  // Sin sesión: ingreso Quipu/QuipuFac y, tras autenticarse, volver al destino pedido.
  const destination = useLocation().pathname.startsWith('/cliente/tickets') ? 'tickets' : 'nuevo'
  const loginPath = `/cliente?ir=${destination}`
  const [token] = useState(() => clientSessionStore.get())
  const [session, setSession] = useState<ClientSession | null>(null)
  const [error, setError] = useState<string | null>(null)
  const catalogs = useCatalogs('public')

  const expire = useCallback((notice: string) => {
    clientSessionStore.clear()
    navigate(loginPath, { replace: true, state: { notice } })
  }, [navigate, loginPath])

  useEffect(() => {
    if (!token) { navigate(loginPath, { replace: true }); return }
    let alive = true
    clientPortal.currentSession(token)
      .then(s => { if (alive) setSession(s) })
      .catch(err => {
        if (!alive) return
        if (isClientPortalError(err, 'session_expired')) expire(err.message)
        else setError(err instanceof Error ? err.message : 'No se pudo cargar tu sesión.')
      })
    return () => { alive = false }
  }, [token, navigate, expire])

  const handleError = useCallback((err: unknown) => {
    if (isClientPortalError(err, 'session_expired')) { expire(err.message); return err.message }
    return err instanceof Error ? err.message : 'Ocurrió un error inesperado.'
  }, [expire])

  const logout = async () => {
    if (token) await clientPortal.logout(token)
    clientSessionStore.clear()
    navigate('/cliente', { replace: true })
  }

  if (!token) return null
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-700 via-brand-800 to-brand-950 flex items-center justify-center p-4">
        <div role="alert" className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 text-center border-t-4 border-accent-400">
          <p className="text-gray-700 mb-6">{error}</p>
          <button onClick={() => { clientSessionStore.clear(); navigate('/cliente', { replace: true }) }}
            className="w-full bg-accent-400 hover:bg-accent-300 text-gray-900 py-3 rounded-lg font-bold transition">
            Volver al ingreso
          </button>
        </div>
      </div>
    )
  }
  if (!session) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-gray-400">Cargando tu espacio…</div>
  }

  const studioName = catalogs.studios.find(s => s.id === session.studio_id)?.name
  const companyLabel = studioName ?? `RUC ${session.ruc}`
  const productName = (id: string) =>
    session.products.find(p => p.id === id)?.name ?? catalogs.systems.find(s => s.id === id)?.name ?? '—'
  const tab = ({ isActive }: { isActive: boolean }) =>
    `px-4 py-2 rounded-md font-medium text-sm transition ${isActive ? 'bg-brand-700 text-white shadow-sm' : 'text-gray-600 hover:text-brand-700 hover:bg-white'}`

  return (
    <div className="min-h-screen bg-slate-50">
      <MockBanner />
      <header className="sticky top-0 z-10 shadow-md">
        <div className="bg-brand-700 border-b-4 border-accent-400">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
            <BrandLogo tone="light" size={40} className="hidden sm:flex" />
            <BrandLogo tone="light" size={36} showName={false} className="sm:hidden" />
            <div className="flex items-center gap-3 min-w-0">
              <div className="text-right min-w-0">
                <p className="font-semibold text-white leading-tight truncate" title={companyLabel}>{companyLabel}</p>
                <p className="text-xs text-accent-300 truncate">{identityLabel(session)}</p>
              </div>
              <button onClick={() => void logout()}
                className="shrink-0 px-3 sm:px-4 py-2 bg-white/10 text-white border border-white/30 rounded-lg hover:bg-white/20 transition text-sm font-medium">
                Salir
              </button>
            </div>
          </div>
        </div>
        <nav className="bg-white border-b border-gray-200" aria-label="Secciones del cliente">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
              <NavLink to="/cliente/nuevo" className={tab}>📝 Nuevo ticket</NavLink>
              <NavLink to="/cliente/tickets" className={tab}>📋 Mis tickets</NavLink>
            </div>
            {session.origin && (
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-accent-50 text-accent-700 border border-accent-200">
                Ingreso desde {AUTH_TYPE_LABEL[session.origin]}
              </span>
            )}
          </div>
        </nav>
      </header>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <ClientContext.Provider value={{ session, token, handleError, productName }}>
          <Outlet />
        </ClientContext.Provider>
      </main>
    </div>
  )
}
