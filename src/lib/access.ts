import type { User } from '../types/database.types.ts'
import type { SupabaseClient } from '@supabase/supabase-js'
import { errorMessage } from './supabase-errors.ts'

export function canEdit(user: User | null) {
  return !!user?.is_active && ['superadmin', 'admin', 'developer'].includes(user.role)
}
export function canManageProfile(actor: User | null, target: User) {
  return !!actor?.is_active && (actor.role === 'superadmin' ||
    (actor.role === 'admin' && !['superadmin', 'admin'].includes(target.role)))
}
export async function loadActiveProfile(client: Pick<SupabaseClient, 'from'>, id: string): Promise<User> {
  const { data, error } = await client.from('users').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(errorMessage(error))
  if (!data?.is_active || !['superadmin', 'admin', 'developer', 'viewer'].includes(data.role)) {
    throw new Error('Tu cuenta no tiene un perfil activo autorizado. Solicita su habilitación a un administrador.')
  }
  return data as User
}
