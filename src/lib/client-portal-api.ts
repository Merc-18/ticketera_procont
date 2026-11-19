import { supabase } from './supabase'
import { createClientPortal, type ClientTransport } from './client-portal'

/** Transporte real: RPC de PostgREST y Edge Function de Supabase (contrato de Codex). */
const supabaseTransport: ClientTransport = {
  rpc: (name, args) => supabase.rpc(name, args),
  async invoke(name, body) {
    const { data, error } = await supabase.functions.invoke(name, { body })
    if (!error) return { data, status: 200, error: null }
    // FunctionsHttpError trae la respuesta HTTP en `context`; los errores de red no.
    const status = (error as { context?: { status?: unknown } }).context?.status
    return { data: null, status: typeof status === 'number' ? status : null, error }
  },
}

/**
 * Vista de desarrollo aislada con DATOS FICTICIOS: solo con `vite` (DEV) y
 * VITE_CLIENT_PORTAL_MOCK=1. En el build de producción esta rama se elimina.
 */
const useMock = import.meta.env.DEV && import.meta.env.VITE_CLIENT_PORTAL_MOCK === '1'
let mockTransport: Promise<ClientTransport> | undefined
const lazyMock = () => (mockTransport ??= import('../dev/client-portal-mock').then(m => m.createMockClientTransport()))
const transport: ClientTransport = useMock
  ? { rpc: async (n, a) => (await lazyMock()).rpc(n, a), invoke: async (n, b) => (await lazyMock()).invoke(n, b) }
  : supabaseTransport

export const clientPortal = createClientPortal(transport)
export const CLIENT_PORTAL_MOCK = useMock
