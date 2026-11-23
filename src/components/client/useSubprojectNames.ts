import { useEffect, useState } from 'react'
import { clientPortal } from '../../lib/client-portal-api'
import { useClientSession } from './ClientWorkspace'

const EMPTY: { system_id: string; requested_subsystem_id: string | null }[] = []
/** Resuelve nombres mediante las opciones autorizadas, sin consultar clasificación interna. */
export function useSubprojectNames(tickets = EMPTY) {
  const { token, handleError } = useClientSession()
  const products = [...new Set(tickets.filter(t => t.requested_subsystem_id).map(t => t.system_id))].sort().join(',')
  const [state, setState] = useState<{ products: string; names: Record<string, string>; loading: boolean }>({ products: '', names: {}, loading: false })
  useEffect(() => {
    let alive = true
    setState({ products, names: {}, loading: !!products })
    if (products) void Promise.all(products.split(',').map(async id => {
      try { return await clientPortal.subprojects(token, id) }
      catch (err) { if (alive) handleError(err); return [] }
    })).then(lists => {
      if (alive) setState({ products, loading: false, names: Object.fromEntries(lists.flat().map(p => [`${p.system_id}:${p.id}`, p.name])) })
    })
    return () => { alive = false }
  }, [products, token, handleError])
  return (systemId: string, subsystemId: string | null) => !subsystemId ? 'Sin subproyecto registrado'
    : state.products !== products || state.loading ? 'Consultando subproyecto…'
    : state.names[`${systemId}:${subsystemId}`] ?? 'No disponible en el catálogo actual'
}
