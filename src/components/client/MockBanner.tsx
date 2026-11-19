import { CLIENT_PORTAL_MOCK } from '../../lib/client-portal-api'

/** Aviso visible en la vista de desarrollo con datos ficticios (nunca aparece en el build). */
export default function MockBanner() {
  if (!CLIENT_PORTAL_MOCK) return null
  return (
    <div role="status" className="bg-red-600 text-white text-center text-xs font-bold py-1.5 px-4 tracking-wide">
      VISTA DE DESARROLLO · DATOS FICTICIOS · no es información real
    </div>
  )
}
