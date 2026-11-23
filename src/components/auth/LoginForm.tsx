import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import PasswordField from '../ui/PasswordField'
import { BRAND } from '../../theme/brand'
import ThemeToggle from '../ui/ThemeToggle'

export default function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await signIn(email, password)
      // Redirigir al dashboard después del login exitoso
      navigate('/')
    } catch (err: any) {
      setError(err.message || 'Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main id="main-content" tabIndex={-1} className="app-surface flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full">
        <div className="theme-row"><ThemeToggle /></div>
        {/* Card */}
        <div className="tracking-panel">
          {/* Logo/Título */}
          <div className="text-center mb-8">
            <img src={BRAND.logoSrc} alt={`Logotipo de ${BRAND.company}`} className="w-16 h-16 rounded-xl mx-auto mb-4" />
            <h1 className="text-3xl font-bold text-brand-700 mb-1">{BRAND.appName}</h1>
            <p className="text-gray-600">{BRAND.tagline}</p>
          </div>

          {/* Formulario */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
                placeholder="tu-email@empresa.com"
                disabled={loading}
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Contraseña
              </label>
              <PasswordField
                id="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
                placeholder="••••••••"
                disabled={loading}
              />
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* Botón */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-white py-3 rounded-lg font-semibold hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition duration-200"
            >
              {loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-6 text-center text-sm text-gray-500">
            <p>Acceso exclusivo para usuarios del {BRAND.teamLabel}</p>
          </div>
        </div>
      </div>
    </main>
  )
}