/** Server-only provider configuration for client-login. No defaults: without an explicit URL AND
 * an explicit response contract per provider, login fails closed (provider_contract_pending /
 * provider_configuration_required) before contacting any provider.
 *
 * Development APIs (api-gestion-test.quipufac.com, dev.quipufac.com) are never used implicitly.
 * They require CLIENT_LOGIN_ALLOW_DEVELOPMENT_PROVIDERS=1 (local launcher only); otherwise a
 * development URL is discarded even if configured by mistake in a hosted environment.
 */
import { quipuDevelopmentContract, quipufacDevelopmentContract } from './client-provider-contracts.mjs'

const DEVELOPMENT = {
  quipu: { hosts: ['api-gestion-test.quipufac.com'], contract: quipuDevelopmentContract,
    url: 'https://api-gestion-test.quipufac.com/api/users/auth' },
  quipufac: { hosts: ['dev.quipufac.com', 'api-dev.quipufac.com'], contract: quipufacDevelopmentContract,
    url: 'https://dev.quipufac.com/auth/login' },
}
const VARIABLES = {
  quipu: { url: 'QUIPU_AUTH_URL', contract: 'QUIPU_AUTH_RESPONSE_CONTRACT' },
  quipufac: { url: 'QUIPUFAC_AUTH_URL', contract: 'QUIPUFAC_AUTH_RESPONSE_CONTRACT' },
}

function hostOf(url) {
  try { return new URL(url).hostname.toLowerCase() } catch { return null }
}

/**
 * @param {(name: string) => string | undefined} getEnv
 * @returns {{ providerUrls: Record<string, string | undefined>, providerContracts: Record<string, unknown> }}
 */
export function resolveProviderConfig(getEnv) {
  const allowDevelopment = getEnv('CLIENT_LOGIN_ALLOW_DEVELOPMENT_PROVIDERS') === '1'
  /** @type {Record<string, string | undefined>} */
  const providerUrls = {}
  /** @type {Record<string, unknown>} */
  const providerContracts = {}
  for (const provider of ['quipu', 'quipufac']) {
    const url = getEnv(VARIABLES[provider].url)?.trim() || undefined
    const rawContract = getEnv(VARIABLES[provider].contract)?.trim() || undefined
    const development = url !== undefined && DEVELOPMENT[provider].hosts.includes(hostOf(url))
    if (development && !allowDevelopment) {
      // A development API is not production authentication: discard URL and contract.
      providerUrls[provider] = undefined; providerContracts[provider] = undefined
      continue
    }
    providerUrls[provider] = url
    if (rawContract === 'development') {
      // Explicit local opt-in to the reviewed development contract, only for its exact URL.
      providerContracts[provider] = allowDevelopment && url === DEVELOPMENT[provider].url
        ? DEVELOPMENT[provider].contract : undefined
    } else if (rawContract) {
      try { providerContracts[provider] = JSON.parse(rawContract) } catch { providerContracts[provider] = undefined }
    } else providerContracts[provider] = undefined
  }
  return { providerUrls, providerContracts }
}
