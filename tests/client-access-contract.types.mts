import { createClientAccess, type ClientAccessTransport, type ClientSubmitPayload } from '../contracts/client-access-client.mjs'
import { createClient } from '@supabase/supabase-js'

// Compile-only contract consumer for Claude; no credential literals or network calls.
declare const client: ClientAccessTransport
declare const ruc: string
declare const username: string
declare const password: string
declare const payload: ClientSubmitPayload
declare const projectUrl: string
declare const publishableKey: string
const apiFromSupabase = createClientAccess(createClient(projectUrl, publishableKey, { auth: { persistSession: false } }))
void apiFromSupabase
const api = createClientAccess(client)
async function contractUsage() {
  const direct = await api.login({ provider: 'quipu', ruc, username, password })
  const corporate = await api.login({ provider: 'quipufac', ruc, password })
  const products = await api.products(direct.session_token)
  const subprojects = await api.subprojects(direct.session_token, products[0].id)
  void subprojects
  const receipt = await api.submit(direct.session_token, { ...payload, system_id: products[0].id }, crypto.randomUUID())
  const detail = await api.detail(direct.session_token, receipt.id)
  const declared: boolean = detail.requester_name_verified
  const grants = await api.reserveAttachments(direct.session_token, receipt.id, [])
  const privatePath: string | undefined = grants[0]?.path
  await api.logout(corporate.session_token)
  return { declared, privatePath }
}
void contractUsage
