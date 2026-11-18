/** Internal RPC adapter. Requires the caller's normal authenticated session; never a service key. */
export function createTicketMetrics(client) {
  async function read(name, args) {
    const { data, error } = await client.rpc(name, args)
    // Do not expose server details, requester names, tokens or payloads in errors.
    if (error || data == null) throw new Error('No se pudieron consultar las métricas. Revisa tu sesión y permisos.')
    return data // [] and averages of null are valid; do not synthesize zero.
  }
  return {
    performance: (studioId = null) => read('get_ticket_performance', { p_studio_id: studioId }),
    summary: (studioId = null) => read('get_ticket_performance_summary', { p_studio_id: studioId }),
    requesterUrgencyMonth: (month = null, studioId = null) => read('get_requester_urgency_month', {
      p_month: month, p_studio_id: studioId,
    }),
  }
}
