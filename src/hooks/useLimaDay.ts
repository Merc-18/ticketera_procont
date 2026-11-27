import { useSyncExternalStore } from 'react'
import { limaToday } from '../lib/ticket-age'
let day = limaToday()
const listeners = new Set<() => void>()
let timer: number | undefined
function refresh() {
  const next = limaToday()
  if (day !== next) { day = next; listeners.forEach(listener => listener()) }
}
function subscribe(listener: () => void) {
  listeners.add(listener)
  if (listeners.size === 1) {
    refresh()
    timer = window.setInterval(refresh, 30_000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
  }
  return () => {
    listeners.delete(listener)
    if (!listeners.size) {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }
}
/** One clock shared by all visible ticket cards; refresh at Lima midnight and on return to the page. */
export const useLimaDay = () => useSyncExternalStore(subscribe, () => day, () => day)
