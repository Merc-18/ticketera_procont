import { createClient } from 'npm:@supabase/supabase-js@2.98.0'
import { accountAdminHandler } from '../_shared/account-admin.mjs'

const url = Deno.env.get('SUPABASE_URL')!
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const allowedOrigins = (Deno.env.get('PROCONT_ALLOWED_ORIGINS') ?? '').split(',').map(s => s.trim()).filter(Boolean)
Deno.serve(accountAdminHandler({ client, allowedOrigins,
  inviteRedirectUrl: Deno.env.get('PROCONT_INVITE_REDIRECT_URL') }))
