/** Development evidence: docs/validation/client-login-dev-api.json (2026-11-19).
 * Only observed fields are configured. No upstream credential/token is bundled.
 * Stable Quipu ID was not established: preserve the existing exact-username scope.
 * QuipuFac remains unconfigured: its development hostname did not resolve.
 */
export const quipuDevelopmentContract = {
  version: 1,
  provider: 'quipu',
  verifiedReference: 'docs/validation/client-login-dev-api.json#quipu',
  success: { path: ['username'], equalsInput: 'username' },
  tokenPath: ['token'],
  allowUsernameFallback: true,
}
