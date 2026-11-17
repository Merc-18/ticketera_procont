import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { sendNotification } from '../lib/notifications'
import { useAuth } from './useAuth'
import { canEdit } from '../lib/access'
import { errorMessage } from '../lib/supabase-errors'
import { toast } from '../lib/toast'

const WARNING_DAYS = 3
const CHECK_INTERVAL = 60 * 60 * 1000 // 1 hora

async function checkSlaWarnings(actorId: string) {
  const warningDeadline = new Date(Date.now() + WARNING_DAYS * 86400000).toISOString().slice(0, 10)

  const { data: projects, error: projectsError } = await supabase
    .from('projects')
    .select('id, title, sla_target_date, project_flows(assigned_to)')
    .eq('status', 'active')
    .not('sla_target_date', 'is', null)
    .lte('sla_target_date', warningDeadline)

  if (projectsError) throw projectsError
  if (!projects?.length) return

  // Evitar spam: no reenviar si ya se mandó una advertencia en las últimas 24h
  const { data: recentWarnings, error: warningsError } = await supabase
    .from('notifications')
    .select('project_id')
    .eq('type', 'sla_warning')
    .eq('user_id', actorId)
    .gte('created_at', new Date(Date.now() - 24 * 3600000).toISOString())

  if (warningsError) throw warningsError
  const alreadyWarned = new Set((recentWarnings ?? []).map(n => n.project_id))

  for (const p of projects) {
    if (alreadyWarned.has(p.id)) continue

    const flows: any[] = (p as any).project_flows ?? []
    const userIds = [...new Set(flows.map((f: any) => f.assigned_to).filter(Boolean) as string[])]
    if (!userIds.length) continue

    const daysLeft = Math.ceil((new Date(p.sla_target_date!).getTime() - Date.now()) / 86400000)
    const suffix = daysLeft <= 0 ? 'SLA vencido' : `Vence en ${daysLeft} día${daysLeft !== 1 ? 's' : ''}`

    // RLS only exposes this actor's notification history; do not spam other recipients.
    for (const userId of userIds.filter(id => id === actorId)) {
      await sendNotification({
        userId,
        type:      'sla_warning',
        title:     '⚠️ SLA próximo a vencer',
        message:   `${p.title} — ${suffix}`,
        projectId: p.id,
      })
    }
  }
}

export function useSlaWarnings() {
  const { user } = useAuth()
  useEffect(() => {
    if (!canEdit(user)) return
    const run = () => { void checkSlaWarnings(user!.id).catch(err => toast.error(errorMessage(err))) }
    run()
    const id = setInterval(run, CHECK_INTERVAL)
    return () => clearInterval(id)
  }, [user?.id, user?.role])
}
