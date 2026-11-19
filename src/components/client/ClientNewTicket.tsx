import { useNavigate } from 'react-router-dom'
import PublicRequestForm from '../requests/PublicRequestForm'
import { useClientSession } from './ClientWorkspace'
import { clientPortal } from '../../lib/client-portal-api'
import { productSelection, isClientPortalError } from '../../lib/client-portal'

/**
 * Nuevo ticket del cliente: reutiliza el formulario existente (nombre, tipo, título, descripción,
 * adjuntos y urgencia). Productos según la sesión: fijo si se abrió desde Quipu/QuipuFac;
 * seleccionable entre los permitidos por el servidor en el acceso directo.
 */
export default function ClientNewTicket() {
  const navigate = useNavigate()
  const { session, token, handleError } = useClientSession()
  const { fixed, products } = productSelection(session)

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
    }} />
  )
}
