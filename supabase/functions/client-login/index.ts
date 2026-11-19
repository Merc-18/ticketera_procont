import { createClient } from 'npm:@supabase/supabase-js@2.98.0'
import { clientLoginHandler } from '../_shared/client-login.mjs'

function responseContract(name: string) {
  const value = Deno.env.get(name)
  if (!value) return undefined
  try { return JSON.parse(value) } catch { return undefined }
}
const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false, autoRefreshToken: false } })
Deno.serve(clientLoginHandler({ client,
  providerUrls: {
    quipu: Deno.env.get('QUIPU_AUTH_URL') ?? 'https://api-gestion-test.quipufac.com/api/users/auth',
    quipufac: Deno.env.get('QUIPUFAC_AUTH_URL') ?? 'https://api-dev.quipufac.com/auth/login',
  },
  providerContracts: {
    quipu: responseContract('QUIPU_AUTH_RESPONSE_CONTRACT'),
    quipufac: responseContract('QUIPUFAC_AUTH_RESPONSE_CONTRACT'),
  },
  platformSecrets: {
    quipu: Deno.env.get('QUIPU_PLATFORM_ENTRY_SECRET'),
    quipufac: Deno.env.get('QUIPUFAC_PLATFORM_ENTRY_SECRET'),
  },
  allowedOrigins: (Deno.env.get('PROCONT_ALLOWED_ORIGINS') ?? '').split(',').map(s => s.trim()).filter(Boolean),
}))
