import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readSupabaseConfig } from './supabase-config'

// Pick only public Supabase settings; do not bundle unrelated DEV options.
const environment = {
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
}
let client: SupabaseClient | undefined
export let configurationError: string | null = null
try { readSupabaseConfig(environment) } catch (error) {
  configurationError = error instanceof Error ? error.message : 'Configuración Supabase inválida.'
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, property) {
    if (!client) {
      const { url, key } = readSupabaseConfig(environment)
      client = createClient(url, key)
    }
    const value = Reflect.get(client, property)
    return typeof value === 'function' ? value.bind(client) : value
  },
})
