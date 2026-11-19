import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
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

const CARDS: { type: AuthType; title: string; subtitle: string; detail: string; icon: string }[] = [
  { type: 'quipu', title: 'Quipu', subtitle: 'Ingreso con usuario', detail: 'RUC, usuario y contraseña', icon: '👤' },
  { type: 'quipufac', title: 'QuipuFac', subtitle: 'Ingreso empresarial', detail: 'RUC y contraseña', icon: '🏢' },
]
const field = 'w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary outline-none bg-white transition'

/**
 * Página pública del cliente: selección del TIPO DE AUTENTICACIÓN (Quipu o QuipuFac), formulario
 * correspondiente y búsqueda general por número REQ (solo número y estado).
 */
export default function ClientHome() {
  const navigate = useNavigate()
  const notice = (useLocation().state as { notice?: string } | null)?.notice ?? null
  const [type, setType] = useState<AuthType | null>(null)
  const [hasSession] = useState(() => clientSessionStore.get() !== null)

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-700 via-brand-800 to-brand-950 flex flex-col">
      <MockBanner />
      <nav className="w-full px-4 sm:px-6 py-4 flex items-center justify-between gap-4 border-b border-white/10">
        <BrandLogo tone="light" size={44} />
        {hasSession && CLIENT_PORTAL_LOGIN_ENABLED && (
          <button onClick={() => navigate('/cliente/nuevo')}
            className="shrink-0 bg-white/10 text-white border border-white/30 px-3 py-2 rounded-lg text-sm font-medium hover:bg-white/20 transition">
            Ir a mi espacio →
          </button>
        )}
      </nav>

      <main className="flex-1 px-4 py-10 sm:py-14">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-3">¿Qué producto utilizas para ingresar?</h1>
            <div className="mx-auto mb-4 h-1 w-16 rounded-full bg-accent-400" aria-hidden="true" />
            <p className="text-brand-100">Elige cómo inicias sesión. Luego podrás registrar y consultar tus tickets.</p>
          </div>

          {notice && (
            <p role="status" className="mb-6 bg-accent-50 border border-accent-300 text-gray-800 px-4 py-3 rounded-lg text-sm text-center">{notice}</p>
          )}
          {!CLIENT_PORTAL_LOGIN_ENABLED && (
            <p role="status" className="mb-6 bg-white rounded-lg p-4 text-center text-gray-800">
              El ingreso todavía no está habilitado. El seguimiento por número REQ sigue disponible.
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6" role="group" aria-label="Tipo de ingreso">
            {CARDS.map(card => {
              const selected = type === card.type
              const dimmed = type !== null && !selected
              return (
                <button key={card.type} type="button" disabled={!CLIENT_PORTAL_LOGIN_ENABLED} aria-pressed={selected} onClick={() => setType(card.type)}
                  className={`group relative bg-white rounded-2xl p-6 sm:p-8 text-left shadow-xl transition-all duration-200 border-b-4
                    ${selected ? 'border-accent-400 ring-4 ring-accent-400/60 -translate-y-1' : 'border-transparent hover:border-accent-400 hover:-translate-y-1 hover:shadow-2xl'}
                    ${dimmed ? 'opacity-60 hover:opacity-100' : ''}`}>
                  <div className="flex items-start gap-4">
                    <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-3xl ${selected ? 'bg-accent-100' : 'bg-brand-50'}`} aria-hidden="true">
                      {card.icon}
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-2xl font-extrabold text-brand-700 tracking-tight">{card.title}</h2>
                      <p className="font-semibold text-gray-800">{card.subtitle}</p>
                      <p className="text-sm text-gray-500 mt-1">{card.detail}</p>
                    </div>
                  </div>
                  {selected && (
                    <span className="absolute top-4 right-4 text-xs font-bold bg-accent-400 text-gray-900 px-2 py-0.5 rounded-full">Seleccionado</span>
                  )}
                </button>
              )
            })}
          </div>

          {type && CLIENT_PORTAL_LOGIN_ENABLED && <LoginForm key={type} type={type} onChange={() => setType(null)}
            onSuccess={() => navigate('/cliente/nuevo')} />}

          <PublicSearch />

          <p className="text-center text-brand-200 text-xs mt-10">© {new Date().getFullYear()} {BRAND.company}</p>
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
    ? <p id={`${name}-error`} className="text-xs text-red-600 mt-1">{errors[name]}</p> : null
  const label = type === 'quipu' ? 'Quipu' : 'QuipuFac'

  return (
    <form onSubmit={submit} noValidate aria-label={`Ingreso con ${label}`}
      className="client-reveal mt-6 bg-white rounded-2xl shadow-2xl p-6 sm:p-8 border-t-4 border-accent-400">
      <div className="flex items-center justify-between gap-3 mb-6">
        <h2 className="text-xl font-bold text-brand-700">
          {type === 'quipu' ? 'Ingreso con usuario Quipu' : 'Ingreso empresarial QuipuFac'}
        </h2>
        <button type="button" onClick={onChange} className="text-sm text-gray-500 hover:text-brand-700 transition whitespace-nowrap">
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
          <input id="client-password" type="password" autoComplete="current-password" maxLength={256} value={password}
            aria-invalid={!!errors.password} aria-describedby={errors.password ? 'password-error' : undefined}
            onChange={e => setPassword(e.target.value)} disabled={loading}
            className={`${field} ${errors.password ? 'border-red-400' : ''}`} />
          {fieldError('password')}
        </div>
      </div>

      {error && <p role="alert" className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</p>}

      <button type="submit" disabled={loading}
        className="mt-6 w-full bg-accent-400 hover:bg-accent-300 text-gray-900 py-3.5 rounded-lg font-bold transition disabled:opacity-50">
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
    setLoading(true); setResult(null); setNotFound(false); setError(null)
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
    <section aria-labelledby="public-search" className="mt-10 rounded-2xl bg-white/10 border border-white/15 p-5 sm:p-6 backdrop-blur-sm">
      <h2 id="public-search" className="text-white font-semibold mb-1">Consultar estado de un ticket</h2>
      <p className="text-brand-100 text-sm mb-4">Ingresa el número REQ. Solo se muestra el número y el estado general.</p>
      <form onSubmit={search} className="flex flex-col sm:flex-row gap-3">
        <input value={value} onChange={e => setValue(e.target.value)} placeholder={`${CURRENT_PREFIX}001`}
          aria-label="Número de ticket" className="flex-1 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-accent-400" />
        <button type="submit" disabled={loading || !value.trim()}
          className="px-6 py-3 bg-accent-400 hover:bg-accent-300 text-gray-900 rounded-lg font-bold transition disabled:opacity-50">
          {loading ? 'Buscando…' : 'Buscar'}
        </button>
      </form>
      {result && status && (
        <div role="status" className="mt-4 flex flex-wrap items-center justify-between gap-3 bg-white rounded-lg px-4 py-3">
          <span className="font-bold text-brand-700">{result.request_number}</span>
          <span className={`text-sm font-semibold px-3 py-1 rounded-full border ${status.tone}`}>{status.icon} {status.label}</span>
        </div>
      )}
      {notFound && <p role="status" className="mt-4 text-sm text-white">No se encontró un ticket con ese número.</p>}
      {error && <p role="alert" className="mt-4 text-sm text-red-100 bg-red-900/40 rounded-lg px-3 py-2">{error}</p>}
    </section>
  )
}
