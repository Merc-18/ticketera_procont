export function readSupabaseConfig(env: Record<string, unknown>) {
  const url = String(env.VITE_SUPABASE_URL ?? '').trim()
  const key = String(env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_ANON_KEY ?? '').trim()
  const invalid = () => new Error('Configura VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY con el proyecto Supabase independiente en .env.local.')
  if (!url || !key || /[<>\s]/.test(url + key)) throw invalid()
  let parsed: URL
  try { parsed = new URL(url) } catch { throw invalid() }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
  if ((parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:')) ||
      parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') throw invalid()
  if (key.startsWith('sb_secret_')) throw new Error('La configuración del navegador requiere una clave publicable; nunca una clave secreta o service_role.')
  if (!/^sb_publishable_[A-Za-z0-9_-]{12,}$/.test(key)) {
    // Compatibility with legacy anon keys; never permit privileged JWTs.
    try {
      const parts = key.split('.')
      if (parts.length !== 3) throw invalid()
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
      if (payload.role !== 'anon') throw invalid()
    } catch { throw invalid() }
  }
  return { url: parsed.origin, key }
}

/** Optional development-only origin of the existing client-login function. */
export function readClientLoginDevOrigin(env: Record<string, unknown>) {
  const value = String(env.VITE_CLIENT_LOGIN_DEV_ORIGIN ?? '').trim()
  if (!value) return null
  const invalid = () => new Error('VITE_CLIENT_LOGIN_DEV_ORIGIN requiere un origen localhost válido.')
  let url: URL
  try { url = new URL(value) } catch { throw invalid() }
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      !['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash) throw invalid()
  return url.origin
}
