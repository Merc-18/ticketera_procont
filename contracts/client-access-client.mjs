/** A normal anonymous Supabase client; client sessions never sign in staff Auth. */
export function createClientAccess(client) {
  async function rpc(name, args) {
    const { data, error } = await client.rpc(name, args)
    if (error) {
      const code = error.code === 'PT401' ? 'client_authentication_required'
        : error.code === 'PT403' ? 'client_product_unavailable'
        : error.code === 'PT404' ? 'client_ticket_unavailable'
        : error.code === '42501' ? 'client_request_forbidden'
        : error.code === '23514' ? name === 'client_submit_request' ? 'studio_mapping_required' : 'client_request_rejected'
        : (error.code === '22023' || error.code === '22P02') ? 'invalid_request' : 'client_backend_unavailable'
      throw Object.assign(new Error(code), { code })
    }
    return data
  }
  async function edge(body) {
    const { data, error } = await client.functions.invoke('client-login', { body })
    if (error || !data?.session_token || !data?.session) {
      // Upstream or framework exception detail is never exposed by this adapter.
      let failure = data?.error
      if (!failure && error?.context instanceof Response) {
        try { failure = (await error.context.clone().json()).error } catch { /* fixed error below */ }
      }
      const safeCodes = new Set(['provider_contract_pending', 'invalid_credentials', 'invalid_credentials_input',
        'provider_identity_mismatch', 'provider_response_invalid', 'provider_unavailable', 'provider_configuration_required',
        'invalid_ruc', 'invalid_provider', 'invalid_request', 'invalid_entry_code', 'client_authentication_required',
        'origin_denied', 'client_backend_unavailable', 'body_too_large', 'rate_limited'])
      const code = safeCodes.has(failure) ? failure : 'client_login_failed'
      throw Object.assign(new Error(code), { code })
    }
    return data
  }
  return {
    login: input => edge({ ...input, action: 'login' }),
    exchange: (provider, code) => edge({ action: 'exchange', provider, code }),
    session: token => rpc('client_session_info', { p_session_token: token }),
    products: token => rpc('client_products', { p_session_token: token }),
    subprojects: (token, systemId) => rpc('client_subprojects', { p_session_token: token, p_system_id: systemId }),
    submit: (token, payload, key) => rpc('client_submit_request', {
      p_session_token: token, p_payload: payload, p_idempotency_key: key,
    }),
    tickets: (token, { limit = 50, offset = 0 } = {}) => rpc('client_list_tickets', {
      p_session_token: token, p_limit: limit, p_offset: offset,
    }),
    detail: (token, requestId) => rpc('client_ticket_detail', { p_session_token: token, p_request_id: requestId }),
    reserveAttachments: (token, requestId, files) => rpc('client_reserve_attachments', {
      p_session_token: token, p_request_id: requestId, p_files: files,
    }),
    logout: token => rpc('client_logout', { p_session_token: token }),
  }
}
