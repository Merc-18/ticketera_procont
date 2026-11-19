/** Development evidence: docs/validation/client-login-dev-api.json (2026-11-19).
 * Only observed fields are configured. No upstream credential/token is bundled.
 * Stable Quipu ID was not established: preserve the existing exact-username scope.
 * QuipuFac evidence: docs/validation/quipufac-login-dev-api.json (2026-11-19).
 */
export const quipuDevelopmentContract = {
  version: 1,
  provider: 'quipu',
  verifiedReference: 'docs/validation/client-login-dev-api.json#quipu',
  success: { path: ['username'], equalsInput: 'username' },
  tokenPath: ['token'],
  allowUsernameFallback: true,
  // Verified 19/11/2026 (docs/validation/provider-failure-responses-20261119.json): wrong password → 400.
  failure: { statuses: [400] },
}

export const quipufacDevelopmentContract = {
  version: 1,
  provider: 'quipufac',
  verifiedReference: 'docs/validation/quipufac-login-dev-api.json',
  success: { path: ['username'], equalsInput: 'ruc' },
  tokenPath: ['token'],
  rucPath: ['businessRuc'],
  namePath: ['businessName'],
  // Verified 19/11/2026: wrong password → 500 with {success:false, message}. A 500 without that
  // marker remains an outage (provider_unavailable).
  failure: { statuses: [500], path: ['success'], equals: false },
}
