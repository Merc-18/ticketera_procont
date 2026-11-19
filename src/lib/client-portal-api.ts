import { supabase } from './supabase'
import { createClient } from '@supabase/supabase-js'
import { readClientLoginDevOrigin, readSupabaseConfig } from './supabase-config'
import { createClientPortal } from './client-portal'
import type { ClientAccessTransport } from '../../contracts/client-access-client.d.mts'
import { attachmentMetadata, uploadReservedTicketAttachment } from '../../contracts/ticket-security-client.mjs'

/**
 * Transporte real: cliente Supabase anónimo de la app (RPC client_* y Edge Function client-login).
 * La sesión del cliente es una capacidad propia; nunca se usa auth.signIn ni setSession.
 */
// Local execution of the same Edge handler; RPCs keep their configured M13 backend.
const developmentLoginOrigin = import.meta.env.DEV ? readClientLoginDevOrigin(import.meta.env) : null
let developmentLoginClient: ReturnType<typeof createClient> | undefined
const loginFunctions = () => {
  if (!developmentLoginOrigin) return supabase.functions
  developmentLoginClient ??= createClient(developmentLoginOrigin, readSupabaseConfig(import.meta.env).key,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
  return developmentLoginClient.functions
}
const supabaseTransport: ClientAccessTransport = {
  rpc: (name, args) => supabase.rpc(name, args) as unknown as ReturnType<ClientAccessTransport['rpc']>,
  functions: { invoke: (name, options) => loginFunctions().invoke(name, options) },
}

/**
 * Vista de desarrollo aislada con DATOS FICTICIOS: solo con `vite` (DEV) y
 * VITE_CLIENT_PORTAL_MOCK=1. En el build de producción esta rama se elimina.
 */
const useMock = import.meta.env.DEV && import.meta.env.VITE_CLIENT_PORTAL_MOCK === '1'
export const CLIENT_PORTAL_LOGIN_ENABLED = useMock || import.meta.env.VITE_CLIENT_LOGIN_ENABLED === '1'
let mockTransport: Promise<ClientAccessTransport> | undefined
const lazyMock = () => (mockTransport ??= import('../dev/client-portal-mock').then(m => m.createMockClientTransport()))
const transport: ClientAccessTransport = useMock
  ? { rpc: async (n, a) => (await lazyMock()).rpc(n, a),
      functions: { invoke: async (n, o) => (await lazyMock()).functions.invoke(n, o) } }
  : supabaseTransport

export const clientPortal = createClientPortal(transport, {
  enabled: CLIENT_PORTAL_LOGIN_ENABLED,
  metadata: (file, key) => attachmentMetadata(file, key),
  upload: useMock ? async () => undefined : (grant, file) => uploadReservedTicketAttachment(supabase, grant, file),
})
export const CLIENT_PORTAL_MOCK = useMock
