import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import BrandLogo from '../ui/BrandLogo'
import MockBanner from './MockBanner'
import { clientPortal } from '../../lib/client-portal-api'
import { clientSessionStore } from '../../lib/client-session-store'
import { AUTH_TYPE_LABEL, identityLabel, type ClientSession } from '../../lib/client-portal'

/** Lee y borra de inmediato el código del fragmento (#code=…): no queda en el historial ni en el Referer. */
function takeLaunchCode(): string | null {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const code = params.get('code')
  if (window.location.hash) window.history.replaceState(null, '', window.location.pathname)
  return code
}

/**
 * Acceso desde la plataforma Quipu o QuipuFac. Canjea el código temporal y pide confirmación
 * antes de activar la sesión (evita quedar dentro de una sesión ajena con un enlace reenviado).
 * La sesión resultante tiene el producto del ticket fijado en la plataforma de origen.
 */
export default function ClientLaunch() {
  const navigate = useNavigate()
  const { provider = '' } = useParams()
  const started = useRef(false)
  const [pending, setPending] = useState<{ token: string; session: ClientSession } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const code = takeLaunchCode()
    if (!code) { setError('El enlace de acceso no es válido. Vuelve a abrir Ticketera desde tu sistema.'); return }
    clientPortal.exchangeLaunch(provider, code)
      .then(setPending)
      .catch(err => setError(err instanceof Error ? err.message : 'No se pudo validar el acceso.'))
  }, [provider])

  const confirm = () => {
    if (!pending) return
    clientSessionStore.set(pending.token)
    navigate('/cliente/nuevo', { replace: true })
  }
  const reject = async () => {
    if (pending) await clientPortal.logout(pending.token)
    clientSessionStore.clear()
    navigate('/cliente', { replace: true })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-700 via-brand-800 to-brand-950 flex flex-col">
      <MockBanner />
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 border-t-4 border-accent-400">
          <BrandLogo size={44} className="justify-center mb-6" />
          {error ? (
            <div role="alert" className="text-center">
              <p className="text-gray-700 mb-6">{error}</p>
              <button onClick={() => navigate('/cliente', { replace: true })}
                className="w-full bg-accent-400 hover:bg-accent-300 text-gray-900 py-3 rounded-lg font-bold transition">
                Ir al ingreso de Ticketera
              </button>
            </div>
          ) : !pending ? (
            <p className="text-center text-gray-500" role="status">Validando el acceso…</p>
          ) : (
            <div>
              <h1 className="text-xl font-bold text-brand-700 text-center mb-1">Confirma tu ingreso</h1>
              <p className="text-sm text-gray-500 text-center mb-6">Desde {AUTH_TYPE_LABEL[pending.session.origin!]}</p>
              <dl className="bg-brand-50 border border-brand-100 rounded-lg p-4 space-y-2 text-sm mb-4">
                <div><dt className="text-gray-500">Empresa</dt><dd className="font-semibold text-gray-900">RUC {pending.session.ruc}</dd></div>
                <div><dt className="text-gray-500">Identidad</dt><dd className="font-semibold text-gray-900">{identityLabel(pending.session)}</dd></div>
                <div><dt className="text-gray-500">Producto de los tickets</dt><dd className="font-semibold text-gray-900">🔒 {pending.session.products[0]?.name ?? 'No disponible'}</dd></div>
              </dl>
              <p className="text-xs text-gray-500 mb-6">Si estos datos no son tuyos, elige «No soy yo».</p>
              <div className="space-y-3">
                <button onClick={confirm} className="w-full bg-accent-400 hover:bg-accent-300 text-gray-900 py-3 rounded-lg font-bold transition">
                  Continuar
                </button>
                <button onClick={() => void reject()} className="w-full bg-gray-100 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-200 transition">
                  No soy yo
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
