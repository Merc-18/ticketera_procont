import { supabase } from './supabase'
import type { User } from '../types/database.types'

export type AccountInput = { email: string; full_name: string; role: User['role'] }
export async function administerAccount(input:
  | (AccountInput & { action: 'create'; password: string; request_id: string })
  | (AccountInput & { action: 'invite'; request_id: string })
  | { action: 'resume'; request_id: string }) {
  const { data, error } = await supabase.functions.invoke('admin-users', { body: input })
  if (error) throw new Error(`No se confirmó la cuenta. Solicitud ${input.request_id}: conservar para revisión y no repetir el alta con otro identificador.`)
  if (!data?.id) throw new Error('El backend no confirmó la cuenta.')
  return data as { id: string; request_id: string }
}
