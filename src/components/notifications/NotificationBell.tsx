import { useState, useRef, useEffect } from 'react'
import { useNotifications } from '../../hooks/useNotifications'
import { toast } from '../../lib/toast'
import { errorMessage } from '../../lib/supabase-errors'
import Icon, { type IconName } from '../ui/Icon'

const TYPE_ICON: Record<string, IconName> = {
  project_assigned: 'user',
  project_blocked:  'block',
  mention:          'comments',
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

interface Props {
  onProjectClick?: (projectId: string) => void
  /** Clases del botón (por defecto, para fondos claros). */
  buttonClassName?: string
}

export default function NotificationBell({ onProjectClick, buttonClassName = 'text-gray-500 hover:text-gray-700 hover:bg-gray-100' }: Props) {
  const { error, notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Notificaciones"
        className={`relative p-2 rounded-lg transition ${buttonClassName}`}
      >
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[18px] h-[18px] bg-red-700 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-surface rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="font-semibold text-gray-900 text-sm">
              Notificaciones
              {unreadCount > 0 && (
                <span className="ml-2 px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-bold">
                  {unreadCount}
                </span>
              )}
            </span>
            {unreadCount > 0 && (
              <button
                onClick={() => { void markAllAsRead().catch(err => toast.error(errorMessage(err))) }}
                className="text-xs text-primary hover:underline"
              >
                Marcar todas leídas
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
            {error ? <p role="alert" className="p-4 text-red-700">{error}</p> : notifications.length === 0 ? (
              <div className="text-center py-10 text-gray-600">
                <Icon name="bell" size={32} className="mx-auto mb-2 text-gray-500" />
                <p className="text-sm">Sin notificaciones</p>
              </div>
            ) : (
              notifications.map(n => (
                <button
                  key={n.id}
                  onClick={async () => {
                    try { if (!n.read) await markAsRead(n.id) } catch (err) { toast.error(errorMessage(err)); return }
                    setOpen(false)
                    if (n.project_id && onProjectClick) onProjectClick(n.project_id)
                  }}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition flex items-start gap-3 ${!n.read ? 'bg-brand-50/50' : ''} ${n.project_id ? 'cursor-pointer' : ''}`}
                >
                  <Icon name={TYPE_ICON[n.type] ?? 'bell'} size={18} className="shrink-0 mt-0.5 text-brand-700" />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm leading-snug ${!n.read ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                      {n.title}
                    </p>
                    {n.message && (
                      <p className="text-sm text-gray-600 mt-0.5 truncate">{n.message}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">{timeAgo(n.created_at)}</p>
                  </div>
                  {!n.read && (
                    <span className="w-2 h-2 bg-brand-500 rounded-full shrink-0 mt-1.5 flex-shrink-0" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
