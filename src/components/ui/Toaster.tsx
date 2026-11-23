import { useState, useEffect } from 'react'
import { subscribeToast } from '../../lib/toast'
import Icon, { type IconName } from './Icon'

interface Toast { id: number; type: 'success' | 'error' | 'info'; message: string }

const STYLES: Record<Toast['type'], string> = {
  success: 'bg-green-700',
  error:   'bg-red-700',
  info:    'bg-gray-800',
}

const ICONS: Record<Toast['type'], IconName> = {
  success: 'check',
  error:   'close',
  info:    'info',
}

export default function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    return subscribeToast(t => {
      setToasts(prev => [...prev, t])
      setTimeout(() => setToasts(prev => prev.filter(x => x.id !== t.id)), 3500)
    })
  }, [])

  if (!toasts.length) return null

  return (
    <div className="fixed bottom-4 right-4 left-4 sm:left-auto max-w-md z-[200] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          role={t.type === 'error' ? 'alert' : 'status'}
          className={`flex items-center gap-2.5 px-4 py-3 rounded-lg shadow-xl text-sm font-medium text-white pointer-events-auto ${STYLES[t.type]}`}
        >
          <Icon name={ICONS[t.type]} size={16} className="shrink-0" />
          {t.message}
        </div>
      ))}
    </div>
  )
}
