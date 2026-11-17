import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readSupabaseConfig } from './supabase-config'

let client: SupabaseClient | undefined
export let configurationError: string | null = null
try { readSupabaseConfig(import.meta.env) } catch (error) {
  configurationError = error instanceof Error ? error.message : 'Configuración Supabase inválida.'
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, property) {
    if (!client) {
      const { url, key } = readSupabaseConfig(import.meta.env)
      client = createClient(url, key)
    }
    const value = Reflect.get(client, property)
    return typeof value === 'function' ? value.bind(client) : value
  },
})
