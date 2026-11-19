import { createClient } from 'npm:@supabase/supabase-js@2.98.0'
import { clientLoginHandler } from '../_shared/client-login.mjs'
import { quipuDevelopmentContract } from '../_shared/client-provider-contracts.mjs'

function responseContract(name: string, fallback?: unknown) {
  const value = Deno.env.get(name)
  if (!value) return fallback
  try { return JSON.parse(value) } catch { return undefined }
}
const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false, autoRefreshToken: false } })
const quipuDevelopmentUrl = 'https://api-gestion-test.quipufac.com/api/users/auth'
const quipuAuthUrl = Deno.env.get('QUIPU_AUTH_URL') ?? quipuDevelopmentUrl
Deno.serve(clientLoginHandler({ client,
  providerUrls: {
    quipu: quipuAuthUrl,
    quipufac: Deno.env.get('QUIPUFAC_AUTH_URL') ?? 'https://api-dev.quipufac.com/auth/login',
  },
  providerContracts: {
    quipu: responseContract('QUIPU_AUTH_RESPONSE_CONTRACT',
      quipuAuthUrl === quipuDevelopmentUrl ? quipuDevelopmentContract : undefined),
    quipufac: responseContract('QUIPUFAC_AUTH_RESPONSE_CONTRACT'),
  },
  platformSecrets: {
    quipu: Deno.env.get('QUIPU_PLATFORM_ENTRY_SECRET'),
    quipufac: Deno.env.get('QUIPUFAC_PLATFORM_ENTRY_SECRET'),
  },
  allowedOrigins: (Deno.env.get('PROCONT_ALLOWED_ORIGINS') ?? '').split(',').map(s => s.trim()).filter(Boolean),
}))
