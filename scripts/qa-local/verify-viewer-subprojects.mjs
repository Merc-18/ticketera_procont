/**
 * Verifica lectura Equipo/RLS y catálogo client_subprojects contra el gateway QA local.
 * El health-check exige PostgreSQL local y rechaza cualquier URL que no sea loopback.
 * La autenticación de prueba es simulada por api-gateway.mjs; datos, RPC y RLS son PostgreSQL 17.
 */
import assert from 'node:assert/strict'

const base = new URL(process.env.QA_GATEWAY_URL ?? 'http://127.0.0.1:54321')
if (!['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)) throw new Error('QA gateway debe ser loopback')
const api = async (path, { method = 'GET', token, body } = {}) => {
  const response = await fetch(new URL(path, base), {
    method,
    redirect: 'error',
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(method === 'PATCH' ? { prefer: 'return=representation' } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const raw = await response.text()
  let data = null
  try { data = raw ? JSON.parse(raw) : null } catch { /* error body intentionally not surfaced */ }
  return { status: response.status, data }
}

const health = await api('/qa/health')
assert.equal(health.status, 200)
assert.equal(health.data?.production, false)
assert.equal(health.data?.database, 'PostgreSQL 17 local')

let staffToken, clientToken
try {
  const login = await api('/auth/v1/token', { method: 'POST', body: {
    email: 'viewer@simulado.invalid', password: 'clave-simulada',
  } })
  assert.equal(login.status, 200)
  staffToken = login.data?.access_token
  assert.ok(staffToken)

  const [users, projects, flows] = await Promise.all([
    api('/rest/v1/users?select=id,role,is_active&order=role', { token: staffToken }),
    api('/rest/v1/projects?select=id,status', { token: staffToken }),
    api('/rest/v1/project_flows?select=id,project_id,assigned_to,current_phase', { token: staffToken }),
  ])
  for (const result of [users, projects, flows]) assert.equal(result.status, 200)
  assert.ok(Array.isArray(users.data) && users.data.length > 0)
  const viewer = users.data.find(user => user.role === 'viewer' && user.is_active)
  assert.ok(viewer, 'viewer activo visible en la lectura autorizada')
  assert.ok(Array.isArray(projects.data) && Array.isArray(flows.data))

  const deniedWrite = await api(`/rest/v1/users?id=eq.${viewer.id}`, {
    method: 'PATCH', token: staffToken, body: { role: 'admin' },
  })
  assert.equal(deniedWrite.status, 403, 'viewer no puede escribir el rol')
  const unchanged = await api(`/rest/v1/users?id=eq.${viewer.id}&select=role`, { token: staffToken })
  assert.equal(unchanged.status, 200)
  assert.equal(unchanged.data?.[0]?.role, 'viewer')
  const deniedProjectWrite = await api('/rest/v1/projects?id=eq.5670456e-6b33-489e-a0ad-8b000d13b1c5', {
    method: 'PATCH', token: staffToken, body: { title: 'QA-FICTICIO viewer write attempt' },
  })
  assert.ok([200, 204, 403].includes(deniedProjectWrite.status), 'viewer write is denied or filtered by RLS')
  assert.ok(!Array.isArray(deniedProjectWrite.data) || deniedProjectWrite.data.length === 0,
    'viewer update returns no modified row')
  const projectUnchanged = await api('/rest/v1/projects?id=eq.5670456e-6b33-489e-a0ad-8b000d13b1c5&select=title', { token: staffToken })
  assert.equal(projectUnchanged.status, 200)
  assert.equal(projectUnchanged.data?.[0]?.title, 'QA-FICTICIO M20 aprobada', 'proyecto/ticket remains unchanged')

  const clientLogin = await api('/functions/v1/client-login', { method: 'POST', body: {
    action: 'login', provider: 'quipu', ruc: '20999999901', username: 'qaficticio', password: 'clave-simulada',
  } })
  assert.equal(clientLogin.status, 200)
  clientToken = clientLogin.data?.session_token
  assert.ok(clientToken)
  const products = await api('/rest/v1/rpc/client_products', {
    method: 'POST', body: { p_session_token: clientToken },
  })
  assert.equal(products.status, 200)
  const productList = products.data?.products ?? products.data
  assert.ok(Array.isArray(productList))
  const quipu = productList.find(product => product.name === 'Quipu')
  assert.ok(quipu)
  let quipuSubprojects = []
  for (const product of productList) {
    const subprojects = await api('/rest/v1/rpc/client_subprojects', {
      method: 'POST', body: { p_session_token: clientToken, p_system_id: product.id },
    })
    assert.equal(subprojects.status, 200, `subproyectos autorizados para ${product.name}`)
    const items = subprojects.data?.subprojects ?? subprojects.data
    assert.ok(Array.isArray(items))
    assert.ok(items.every(item => item.id && item.system_id === product.id && item.name),
      `cada subproyecto pertenece al producto solicitado: ${product.name}`)
    if (product.id === quipu.id) quipuSubprojects = items
  }
  assert.ok(quipuSubprojects.length > 0)
  const invalidSession = await api('/rest/v1/rpc/client_subprojects', {
    method: 'POST', body: { p_session_token: 'invalid-qa-session', p_system_id: quipu.id },
  })
  assert.equal(invalidSession.status, 401, 'la consulta de subproyectos exige sesión vigente')

  console.log(JSON.stringify({
    result: 'PASS', environment: 'QA-FICTICIO local',
    backend: 'PostgreSQL 17 via PostgREST; internal Auth/client-login simulated',
    viewer: { visibleProfiles: users.data.length, visibleProjects: projects.data.length,
      visibleFlows: flows.data.length, roleWriteDeniedHttp: deniedWrite.status,
      projectWriteDeniedHttp: deniedProjectWrite.status, roleUnchanged: true, projectUnchanged: true },
    clientSubprojects: { authorizedProducts: productList.length, quipuCount: quipuSubprojects.length,
      relationshipChecked: true, invalidSessionHttp: invalidSession.status, responseShape: 'id/system_id/name' },
  }))
} finally {
  if (clientToken) await api('/functions/v1/client-login', { method: 'POST', body: { action: 'logout', session_token: clientToken } })
  if (staffToken) await api('/auth/v1/logout', { method: 'POST', token: staffToken, body: {} })
}
