import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { requireSuccess, errorMessage } from '../lib/supabase-errors'
import type { ActivityLog } from '../types/database.types'

export async function logActivity(projectId: string, action: string, details: Record<string, unknown> = {}) {
  const { error } = await supabase
    .from('activity_logs')
    .insert([{ project_id: projectId, action, details }])
  if (error) throw new Error(`El cambio principal puede estar guardado, pero falló el registro de actividad: ${errorMessage(error)}`)
}

export function useActivityLog(projectId: string) {
  const [error, setError] = useState<string | null>(null)
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadLogs()
  }, [projectId])

  const loadLogs = async () => {
    try {
      setLoading(true)
      setError(null)
      const { data, error } = await supabase
        .from('activity_logs')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(50)
      requireSuccess({ error })
      setLogs(data || [])
    } catch (err) {
      setError(errorMessage(err))
      setLogs([])
    } finally {
      setLoading(false)
    }
  }

  return { logs, loading, error, reload: loadLogs }
}
