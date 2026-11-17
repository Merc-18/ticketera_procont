import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import { errorMessage } from '../lib/supabase-errors'

export function usePendingCount(enabled = true) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!enabled) { setCount(0); return }
    let mounted = true
    let warned = false
    const load = async () => {
      try {
        const result = await supabase.from('requests').select('id', { count: 'exact', head: true }).eq('status', 'pending')
        if (result.error) throw result.error
        if (mounted) { setCount(result.count ?? 0); warned = false }
      } catch (err) {
        if (mounted && !warned) { toast.error(`No se actualizó el contador: ${errorMessage(err)}`); warned = true }
      }
    }
    // requests is not published by 2A; poll only this authorized count.
    void load()
    const onFocus = () => { void load() }
    const timer = setInterval(onFocus, 30000)
    window.addEventListener('focus', onFocus)
    return () => { mounted = false; clearInterval(timer); window.removeEventListener('focus', onFocus) }
  }, [enabled])
  return count
}
