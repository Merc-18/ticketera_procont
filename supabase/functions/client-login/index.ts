import { createClient } from 'npm:@supabase/supabase-js@2.98.0'
import { clientLoginHandler } from '../_shared/client-login.mjs'
import { resolveProviderConfig } from '../_shared/client-login-config.mjs'

const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false, autoRefreshToken: false } })
// No automatic fallback to development APIs: each provider needs an explicit URL and an explicit
// response contract (see _shared/client-login-config.mjs); otherwise login fails closed.
const { providerUrls, providerContracts } = resolveProviderConfig(name => Deno.env.get(name))
Deno.serve(clientLoginHandler({ client,
  providerUrls,
  providerContracts,
  platformSecrets: {
    quipu: Deno.env.get('QUIPU_PLATFORM_ENTRY_SECRET'),
    quipufac: Deno.env.get('QUIPUFAC_PLATFORM_ENTRY_SECRET'),
  },
  allowedOrigins: (Deno.env.get('PROCONT_ALLOWED_ORIGINS') ?? '').split(',').map(s => s.trim()).filter(Boolean),
  // M14 (20261119000200_client_login_throttle.sql) must be applied before deploying this function.
  throttle: true,
}))
