// Cargadores de las rutas públicas secundarias y del espacio del cliente (carga diferida, App.tsx).
// Se precargan por intención (puntero, foco o toque sobre el acceso) o al entrar al espacio del cliente,
// para que cambiar de vista no muestre un intervalo vacío (rendimiento percibido) sin engordar el
// JavaScript inicial del portal (Taste perf.md).
export const loadClientHome = () => import('../components/client/ClientHome')
export const loadClientLaunch = () => import('../components/client/ClientLaunch')
export const loadClientWorkspace = () => import('../components/client/ClientWorkspace')
export const loadClientNewTicket = () => import('../components/client/ClientNewTicket')
export const loadMyTickets = () => import('../components/client/MyTickets')
export const loadClientTicketDetail = () => import('../components/client/ClientTicketDetail')

const swallow = (p: Promise<unknown>) => { p.catch(() => undefined) }

/** Vistas del espacio autenticado: se piden en segundo plano al entrar al ingreso o al espacio. */
export function preloadClientArea() {
  for (const load of [loadClientWorkspace, loadClientNewTicket, loadMyTickets, loadClientTicketDetail]) swallow(load())
}

/** Eventos de intención para un acceso del portal (no se usa hover solo: también foco y toque). */
export const preloadOnIntent = (load: () => Promise<unknown>) => {
  const go = () => swallow(load())
  return { onPointerEnter: go, onFocus: go, onTouchStart: go }
}
