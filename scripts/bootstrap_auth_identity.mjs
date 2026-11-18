// Internal worker for bootstrap_superadmin.py. Input travels only over stdin.
import { createClient } from '@supabase/supabase-js'

try {
  let raw = ''
  for await (const chunk of process.stdin) {
    raw += chunk
    if (raw.length > 16384) throw new Error('invalid input')
  }
  const input = JSON.parse(raw)
  if (input.url !== 'https://xsxdpaiivklqeudgqoqf.supabase.co') throw new Error('wrong target')
  const client = createClient(input.url, input.key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await client.auth.admin.createUser({ email: input.email,
    password: input.password, email_confirm: true, user_metadata: { full_name: input.full_name } })
  if (error || !data.user?.id) throw new Error('creation outcome not confirmed')
  process.stdout.write(JSON.stringify({ id: data.user.id }))
} catch {
  process.stderr.write('No se confirmó el resultado Auth. Revisar desde el entorno administrativo; no reintentar automáticamente.\n')
  process.exitCode = 1
}
