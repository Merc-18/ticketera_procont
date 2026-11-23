import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import Icon from '../ui/Icon'
import PasswordField from '../ui/PasswordField'
import BrandLogo from '../ui/BrandLogo'
import MockBanner from './MockBanner'
import { BRAND } from '../../theme/brand'
import { clientPortal, CLIENT_PORTAL_LOGIN_ENABLED } from '../../lib/client-portal-api'
import { clientSessionStore } from '../../lib/client-session-store'
import { validateLogin, type AuthType, type ClientLoginInput } from '../../lib/client-portal'
import { operations } from '../../lib/api'
import type { PublicTracking } from '../../lib/operations'
import { GENERAL_STATUS } from '../../lib/request-status'
import { errorMessage } from '../../lib/supabase-errors'
import { preloadClientArea } from '../../lib/client-routes'

const CARDS: { type: AuthType; title: string; subtitle: string; detail: string }[] = [
  { type: 'quipu', title: 'Quipu', subtitle: 'Ingreso con usuario', detail: 'RUC, usuario y contraseña' },
  { type: 'quipufac', title: 'QuipuFac', subtitle: 'Ingreso empresarial', detail: 'RUC y contraseña' },
]
const field = 'ui-input focus:ring-2 focus:ring-primary'

/**
 * Página pública del cliente: selección del TIPO DE AUTENTICACIÓN (Quipu o QuipuFac), formulario
 * correspondiente y búsqueda general por número REQ (solo número y estado).
 */
export default function ClientHome() {
  // Rendimiento percibido: el espacio del cliente se descarga mientras se completan las credenciales.
  useEffect(() => { preloadClientArea() }, [])
  const navigate = useNavigate()
  const notice = (useLocation().state as { notice?: string } | null)?.notice ?? null
  // Destino tras el ingreso: Nuevo ticket (por defecto) o Mis tickets (lista blanca, nunca una URL libre).
  const goToTickets = useSearchParams()[0].get('ir') === 'tickets'
  const destination = goToTickets ? '/cliente/tickets' : '/cliente/nuevo'
  const [type, setType] = useState<AuthType | null>(null)
  const [hasSession] = useState(() => clientSessionStore.get() !== null)

  return (
    <div className="app-surface">
      <MockBanner />
      <nav className="public-nav">
        <div className="wrap page-wrap">
        <div className="flex items-center gap-4 min-w-0">
          <BrandLogo size={40} />
        </div>
        <div className="flex items-center gap-2 shrink-0">
        <Link to="/portal" className="ui-button ui-button-quiet">
          ← Inicio
        </Link>
        {hasSession && CLIENT_PORTAL_LOGIN_ENABLED && (
          <button onClick={() => navigate(destination)}
            className="ui-button ui-button-secondary">
            Ir a mi espacio →
          </button>
        )}
        </div>
        </div>
      </nav>

      <main id="main-content" tabIndex={-1} className="wrap page-wrap client-main">
        <div>
          <div className="portal-heading">
            <h1 className="text-brand-700">¿Qué producto utilizas para ingresar?</h1>

            <p className="text-gray-600">
              {goToTickets ? 'Ingresa para consultar tus tickets.' : 'Elige cómo inicias sesión. Luego podrás registrar y consultar tus tickets.'}
            </p>
          </div>

          {notice && (
            <p role="status" className="mb-6 bg-accent-50 border border-accent-300 text-gray-800 px-4 py-3 rounded-lg text-sm text-center">{notice}</p>
          )}
          {!CLIENT_PORTAL_LOGIN_ENABLED && (
            <div role="status" className="mb-6 bg-white rounded-lg p-4 text-center text-gray-800 border-l-4 border-accent-400">
              <p className="font-semibold">El ingreso de clientes todavía no está habilitado.</p>
              <p className="text-sm text-gray-600 mt-1">Por ahora no es posible registrar ni consultar tickets con Quipu o QuipuFac. El seguimiento por número REQ sigue disponible más abajo.</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6" role="group" aria-label="Tipo de ingreso">
            {CARDS.map(card => {
              const selected = type === card.type
              return (
                <button key={card.type} type="button" disabled={!CLIENT_PORTAL_LOGIN_ENABLED} aria-pressed={selected} onClick={() => setType(card.type)}
                  className="provider-card">
                  <span className="icon-tile"><Icon name={card.type === 'quipu' ? 'user' : 'building'} size={24} /></span>
                  <div className="min-w-0">
                    <h2>{card.title}</h2>
                    <span className="block font-medium text-gray-800">{card.subtitle}</span>
                    <span className="block text-sm text-gray-600 mt-1">{card.detail}</span>
                    {!CLIENT_PORTAL_LOGIN_ENABLED && <span className="block text-sm text-gray-600 mt-2">No disponible</span>}
                  </div>
                  <span className="provider-indicator" aria-hidden="true">{selected && <Icon name="check" size={16} />}</span>
                </button>
              )
            })}
          </div>

          {type && CLIENT_PORTAL_LOGIN_ENABLED && <LoginForm key={type} type={type} onChange={() => setType(null)}
            onSuccess={() => navigate(destination)} />}

          <PublicSearch />

          <p className="public-footer">© {new Date().getFullYear()} {BRAND.company}</p>
        </div>
      </main>
    </div>
  )
}

function LoginForm({ type, onChange, onSuccess }: { type: AuthType; onChange: () => void; onSuccess: () => void }) {
  const [ruc, setRuc] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const input = (): ClientLoginInput => type === 'quipu'
    ? { auth_type: 'quipu', ruc, username, password }
    : { auth_type: 'quipufac', ruc, password }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const found = validateLogin(input())
    setErrors(found)
    if (Object.keys(found).length) return
    setLoading(true)
    try {
      const { token } = await clientPortal.login(input())
      clientSessionStore.set(token)
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos validar los datos.')
    } finally {
      setPassword('')   // la contraseña no permanece en memoria de la vista
      setLoading(false)
    }
  }

  const fieldError = (name: string) => errors[name]
    ? <p id={`${name}-error`} className="text-xs text-red-700 mt-1">{errors[name]}</p> : null
  const label = type === 'quipu' ? 'Quipu' : 'QuipuFac'

  return (
    <form onSubmit={submit} noValidate aria-label={`Ingreso con ${label}`}
      className="client-login-form">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h2 className="text-xl font-bold text-brand-700">
          {type === 'quipu' ? 'Ingreso con usuario Quipu' : 'Ingreso empresarial QuipuFac'}
        </h2>
        <button type="button" onClick={onChange} className="ui-button ui-button-quiet !px-0">
          ← Cambiar tipo
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="client-ruc" className="block text-sm font-medium text-gray-700 mb-1.5">RUC</label>
          <input id="client-ruc" inputMode="numeric" autoComplete="organization" maxLength={11} value={ruc}
            placeholder="11 dígitos" aria-invalid={!!errors.ruc} aria-describedby={errors.ruc ? 'ruc-error' : undefined}
            onChange={e => setRuc(e.target.value.replace(/\D/g, ''))} disabled={loading}
            className={`${field} ${errors.ruc ? 'border-red-400' : ''}`} />
          {fieldError('ruc')}
        </div>
        {type === 'quipu' && (
          <div>
            <label htmlFor="client-username" className="block text-sm font-medium text-gray-700 mb-1.5">Usuario</label>
            <input id="client-username" autoComplete="username" maxLength={100} value={username}
              aria-invalid={!!errors.username} aria-describedby={errors.username ? 'username-error' : undefined}
              onChange={e => setUsername(e.target.value)} disabled={loading}
              className={`${field} ${errors.username ? 'border-red-400' : ''}`} />
            {fieldError('username')}
          </div>
        )}
        <div>
          <label htmlFor="client-password" className="block text-sm font-medium text-gray-700 mb-1.5">Contraseña</label>
          <PasswordField id="client-password" autoComplete="current-password" maxLength={256} value={password}
            aria-invalid={!!errors.password} aria-describedby={errors.password ? 'password-error' : undefined}
            onChange={e => setPassword(e.target.value)} disabled={loading}
            className={`${field} ${errors.password ? 'border-red-400' : ''}`} />
          {fieldError('password')}
        </div>
      </div>

      {error && <p role="alert" className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</p>}

      <button type="submit" disabled={loading}
        className="ui-button ui-button-primary mt-6 w-full">
        {loading ? 'Validando…' : 'Ingresar'}
      </button>
      <p className="mt-3 text-xs text-gray-500 text-center">Usa las mismas credenciales de {label}.</p>
    </form>
  )
}

const CURRENT_PREFIX = `REQ${new Date().getFullYear().toString().slice(2)}-`

/** Búsqueda general pública: solo número y estado general (track_request_status). */
function PublicSearch() {
  const [value, setValue] = useState('')
  const [result, setResult] = useState<PublicTracking | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const search = async (e: React.FormEvent) => {
    e.preventDefault()
    setResult(null); setNotFound(false); setError(null)
    if (!value.trim()) { setError('Escribe el número REQ del ticket.'); return }
    setLoading(true)
    try {
      const raw = value.trim()
      const full = /^\d+$/.test(raw) ? `${CURRENT_PREFIX}${raw.padStart(3, '0')}` : raw.toUpperCase()
      const found = await operations.trackRequest(full)
      if (found) setResult(found); else setNotFound(true)
    } catch (err) {
      setError(errorMessage(err))
    } finally { setLoading(false) }
  }
  const status = result ? GENERAL_STATUS[result.status] : null

  return (
    <section aria-labelledby="public-search" className="public-search">
      <h2 id="public-search" className="font-medium">Consultar estado de un ticket</h2>
      <p className="text-gray-600 text-sm mb-4">Solo se muestra el número y el estado general.</p>
      <form onSubmit={search} noValidate className="flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="flex-1 min-w-0">
          <label htmlFor="public-req" className="block text-sm font-medium text-gray-700 mb-1">Número de ticket</label>
          <input id="public-req" value={value} onChange={e => setValue(e.target.value)} placeholder={`${CURRENT_PREFIX}001`}
            aria-invalid={!!error || undefined} aria-describedby={error ? 'public-req-error' : undefined} className="ui-input w-full" />
        </div>
        <button type="submit" disabled={loading}
          className="ui-button ui-button-secondary">
          {loading ? 'Buscando…' : 'Buscar'}
        </button>
      </form>
      {result && status && (
        <div role="status" className="mt-4 flex flex-wrap items-center justify-between gap-3 bg-white border border-gray-300 rounded-lg px-4 py-3">
          <span className="font-medium font-mono text-brand-700">{result.request_number}</span>
          <span className={`inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1 rounded-full border ${status.tone}`}><Icon name={status.icon} size={14} />{status.label}</span>
        </div>
      )}
      {notFound && <p role="status" className="mt-4 text-sm text-gray-700">No se encontró un ticket con ese número.</p>}
      {error && <p id="public-req-error" role="alert" className="mt-4 text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
    </section>
  )
}
