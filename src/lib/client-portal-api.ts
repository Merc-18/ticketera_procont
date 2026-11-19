import { supabase } from './supabase'
import { createClientPortal } from './client-portal'
import type { ClientAccessTransport } from '../../contracts/client-access-client.d.mts'
import { attachmentMetadata, uploadReservedTicketAttachment } from '../../contracts/ticket-security-client.mjs'

/**
 * Transporte real: cliente Supabase anónimo de la app (RPC client_* y Edge Function client-login).
 * La sesión del cliente es una capacidad propia; nunca se usa auth.signIn ni setSession.
 */
const supabaseTransport: ClientAccessTransport = {
  rpc: (name, args) => supabase.rpc(name, args) as unknown as ReturnType<ClientAccessTransport['rpc']>,
  functions: { invoke: (name, options) => supabase.functions.invoke(name, options) },
}

/**
 * Vista de desarrollo aislada con DATOS FICTICIOS: solo con `vite` (DEV) y
 * VITE_CLIENT_PORTAL_MOCK=1. En el build de producción esta rama se elimina.
 */
const useMock = import.meta.env.DEV && import.meta.env.VITE_CLIENT_PORTAL_MOCK === '1'
let mockTransport: Promise<ClientAccessTransport> | undefined
const lazyMock = () => (mockTransport ??= import('../dev/client-portal-mock').then(m => m.createMockClientTransport()))
const transport: ClientAccessTransport = useMock
  ? { rpc: async (n, a) => (await lazyMock()).rpc(n, a),
      functions: { invoke: async (n, o) => (await lazyMock()).functions.invoke(n, o) } }
  : supabaseTransport

export const clientPortal = createClientPortal(transport, {
  metadata: (file, key) => attachmentMetadata(file, key),
  upload: useMock ? async () => undefined : (grant, file) => uploadReservedTicketAttachment(supabase, grant, file),
})
export const CLIENT_PORTAL_MOCK = useMock
