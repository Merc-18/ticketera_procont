import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import BrandLogo from '../ui/BrandLogo'
import Icon from '../ui/Icon'
import PasswordField from '../ui/PasswordField'
import ModalFocus from '../ui/ModalFocus'
import { BRAND } from '../../theme/brand'

function LoginModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const { signIn } = useAuth()
  const navigate   = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(email, password)
      navigate('/')
    } catch (err: any) {
      setError(err.message || 'Credenciales incorrectas')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="staff-login-heading" className="modal-panel p-6 sm:p-8 w-full max-w-md overflow-y-auto">
        <ModalFocus onDismiss={onClose} />
        <div className="flex items-center justify-between mb-6">
          <h2 id="staff-login-heading" className="text-xl text-brand-700">Ingreso del personal</h2>
          <button
            onClick={onClose}
            aria-label="Cerrar ingreso del personal" className="ui-button ui-button-quiet !px-2"
          >
            <Icon name="close" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="staff-modal-email" className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
            <input
              id="staff-modal-email" type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="tu-email@empresa.com"
              disabled={loading}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition text-sm"
            />
          </div>

          <div>
            <label htmlFor="staff-modal-password" className="block text-sm font-medium text-gray-700 mb-1.5">Contraseña</label>
            <PasswordField
              id="staff-modal-password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={loading}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition text-sm"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="ui-button ui-button-primary w-full"
          >
            {loading ? 'Ingresando...' : 'Ingresar al sistema'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-4">Solo para el {BRAND.teamLabel}</p>
      </div>
    </div>
  )
}

export default function PublicLanding() {
  const navigate    = useNavigate()
  const [showLogin, setShowLogin] = useState(false)

  return (
    <div className="app-surface">
      <nav className="public-nav portal-nav" aria-label="Portal">
        <div className="wrap page-wrap">
          <BrandLogo size={40} />
          <button onClick={() => setShowLogin(true)} className="ui-button ui-button-secondary shrink-0">
            <Icon name="lock" size={18} /><span>Ingreso del personal</span>
          </button>
        </div>
      </nav>
      <main id="main-content" tabIndex={-1} className="wrap page-wrap portal-main">
        <div className="portal-heading">
          <span className="eyebrow">Ticketera Procont</span>
          <h1>Mesa de solicitudes</h1>
          <p>Registra una solicitud o rastrea su estado con tu número REQ.</p>
        </div>
        <div className="portal-options">
          <button onClick={() => navigate('/cliente')} className="portal-option">
            <span className="icon-tile"><Icon name="plus" size={26} /></span>
            <h2>Nueva Solicitud</h2>
            <p>Ingresa con Quipu o QuipuFac y registra tu solicitud al {BRAND.teamLabel}.</p>
            <span className="option-action">Ingresar<Icon name="arrow" /></span>
          </button>
          <button onClick={() => navigate('/tracking')} className="portal-option">
            <span className="icon-tile"><Icon name="search" size={26} /></span>
            <h2>Rastrear Solicitud</h2>
            <p>Consulta el estado de una solicitud existente con tu número de seguimiento.</p>
            <span className="option-action">Ver estado<Icon name="arrow" /></span>
          </button>
        </div>
        <p className="public-footer">© {new Date().getFullYear()} {BRAND.company}</p>
      </main>
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
    </div>
  )
}
