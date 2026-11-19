import { Link, useNavigate } from 'react-router-dom'
import PublicRequestForm from '../requests/PublicRequestForm'
import { useClientSession } from './ClientWorkspace'
import { clientPortal } from '../../lib/client-portal-api'
import { productSelection, isClientPortalError } from '../../lib/client-portal'

/**
 * Nuevo ticket del cliente: reutiliza el formulario existente (nombre, tipo, título, descripción,
 * adjuntos y urgencia). Productos según la sesión (client_products): fijo si se abrió desde
 * Quipu/QuipuFac; seleccionable entre los permitidos en el acceso directo. Si la empresa aún no
 * tiene estudio asociado, se informa sin mostrar detalles internos.
 */
export default function ClientNewTicket() {
  const navigate = useNavigate()
  const { session, token, handleError } = useClientSession()
  const { fixed, products } = productSelection(session)

  if (session.studio_mapping === 'required' || products.length === 0) {
    return (
      <div className="max-w-2xl mx-auto bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center">
        <div className="text-5xl mb-4" aria-hidden="true">🏢</div>
        <h1 className="text-xl font-bold text-brand-700 mb-2">
          {session.studio_mapping === 'required' ? 'Tu empresa aún no está habilitada' : 'No hay productos disponibles'}
        </h1>
        <p role="status" className="text-gray-600 mb-6">
          {session.studio_mapping === 'required'
            ? 'Para registrar tickets, el equipo de Procont debe completar la asociación de tu empresa. Comunícate con nosotros; mientras tanto puedes consultar tus tickets.'
            : 'En este momento no hay productos habilitados para este acceso. Intenta más tarde.'}
        </p>
        <Link to="/cliente/tickets" className="inline-block bg-accent-400 hover:bg-accent-300 text-gray-900 px-5 py-2.5 rounded-lg font-bold transition">
          Ver Mis tickets
        </Link>
      </div>
    )
  }

  return (
    <PublicRequestForm client={{
      products,
      fixedProduct: fixed,
      onViewMine: () => navigate('/cliente/tickets'),
      submit: async (input, attempt) => {
        try { return await clientPortal.submitTicket(token, session, input, attempt) }
        catch (err) {
          if (isClientPortalError(err, 'session_expired')) handleError(err)
          throw err
        }
      },
      // Reserva con la sesión del cliente (client_reserve_attachments) y subida a las rutas asignadas.
      deliver: (requestId, _trackingToken, items) => clientPortal.deliverAttachments(token, requestId, items),
    }} />
  )
}
