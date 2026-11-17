import { supabase } from './supabase'
import { errorMessage } from './supabase-errors'

export async function sendNotification(params: {
  userId: string
  type: string
  title: string
  message?: string
  projectId?: string
}) {
  const { error } = await supabase.from('notifications').insert([{
    user_id:    params.userId,
    type:       params.type,
    title:      params.title,
    message:    params.message ?? null,
    project_id: params.projectId ?? null,
  }])
  if (error) throw new Error(`El cambio principal puede estar guardado, pero no se envió la notificación: ${errorMessage(error)}`)
}
