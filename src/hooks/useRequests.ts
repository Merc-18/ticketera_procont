import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { operations } from '../lib/api'
import { errorMessage, requireData } from '../lib/supabase-errors'
import type { Request } from '../types/database.types'
import type { ApprovalInput } from '../lib/operations'
import type { RpcAttempt } from '../lib/rpc-attempt'

export function useRequests({ loadInbox = false } = {}) {
  const [requests, setRequests] = useState<Request[]>([])
  const [loading, setLoading] = useState(loadInbox)
  const [error, setError] = useState<string | null>(null)

  const loadRequests = async () => {
    if (!loadInbox) return
    setLoading(true)
    setError(null)
    try {
      const result = await supabase.from('requests').select('*, projects(status)')
        .order('created_at', { ascending: false }).limit(200)
      if (result.error) throw result.error
      setRequests(result.data || [])
    } catch (err) {
      setRequests([])
      setError(errorMessage(err))
    } finally { setLoading(false) }
  }

  useEffect(() => { void loadRequests() }, [loadInbox])

  const createRequest = (data: Partial<Request>, attempt: RpcAttempt) => operations.submitRequest(data, attempt)
  const approveRequest = async (id: string, data: ApprovalInput, attempt: RpcAttempt) => {
    const request = requests.find(item => item.id === id) ?? requireData(
      await supabase.from('requests').select('*').eq('id', id).single(), 'Solicitud') as Request
    await operations.approveRequest(request, data, attempt)
    await loadRequests()
  }
  const rejectRequest = async (id: string, reason: string) => {
    await operations.rejectRequest(id, reason)
    await loadRequests()
  }
  return { requests, loading, error, createRequest, approveRequest, rejectRequest, reload: loadRequests }
}
