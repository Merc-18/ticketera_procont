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
}

export const quipufacDevelopmentContract = {
  version: 1,
  provider: 'quipufac',
  verifiedReference: 'docs/validation/quipufac-login-dev-api.json',
  success: { path: ['username'], equalsInput: 'ruc' },
  tokenPath: ['token'],
  rucPath: ['businessRuc'],
  namePath: ['businessName'],
}
