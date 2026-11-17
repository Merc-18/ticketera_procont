import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import { errorMessage, requireData } from '../lib/supabase-errors'
import type { Notification } from '../types/database.types'

export function useNotifications() {
  const { user } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) { setNotifications([]); setLoading(false); return }

    load()

    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        (payload) => {
          setNotifications(prev => [payload.new as Notification, ...prev])
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        (payload) => {
          setNotifications(prev =>
            prev.map(n => n.id === (payload.new as Notification).id ? (payload.new as Notification) : n)
          )
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user?.id])

  const load = async () => {
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      const result = await supabase.from('notifications').select('*').eq('user_id', user.id)
        .order('created_at', { ascending: false }).limit(30)
      if (result.error) throw result.error
      setNotifications(result.data || [])
    } catch (err) { setError(errorMessage(err)) }
    finally { setLoading(false) }
  }
  const markAsRead = async (id: string) => {
    try {
      requireData(await supabase.from('notifications').update({ read: true }).eq('id', id)
        .eq('user_id', user!.id).select('id').single(), 'Notificación')
      setNotifications(prev => prev.map(item => item.id === id ? { ...item, read: true } : item))
    } catch (err) { setError(errorMessage(err)); throw err }
  }
  const markAllAsRead = async () => {
    if (!user) return
    try {
      const result = await supabase.from('notifications').update({ read: true }).eq('user_id', user.id)
        .eq('read', false).select('id')
      if (result.error) throw result.error
      const ids = new Set((result.data || []).map(item => item.id))
      setNotifications(prev => prev.map(item => ids.has(item.id) ? { ...item, read: true } : item))
    } catch (err) { setError(errorMessage(err)); throw err }
  }

  const unreadCount = notifications.filter(n => !n.read).length

  return { error, notifications, loading, unreadCount, markAsRead, markAllAsRead }
}
