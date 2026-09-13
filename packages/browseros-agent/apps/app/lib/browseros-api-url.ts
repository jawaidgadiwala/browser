/**
 * Base URL of the upstream-hosted account/API service.
 *
 * Empty by default: this build ships no hosted service, so nothing seeds a
 * hosted LLM provider and the manifest carries no upstream host permissions.
 * Set `VITE_PUBLIC_BROWSEROS_API` to a base URL to re-enable those surfaces.
 */
export const DEFAULT_BROWSEROS_API_URL = ''

/**
 * Stand-in origin for the one place a match pattern is structurally required
 * (the auth content script) but no hosted API is configured. `.invalid` is
 * reserved and never resolves, so the script can never run.
 */
export const UNCONFIGURED_API_ORIGIN = 'https://hosted-api.invalid'

/**
 * Resolves and validates the hosted API base URL for runtime and build config.
 * Returns an empty string when no hosted API is configured; every caller must
 * treat that as "hosted surfaces are off".
 */
export function parseBrowserOSApiUrl(value: string | undefined): string {
  const rawUrl = value?.trim() || DEFAULT_BROWSEROS_API_URL
  if (!rawUrl) return ''

  let url: URL

  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error(
      'VITE_PUBLIC_BROWSEROS_API must be a valid URL including http:// or https://',
    )
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('VITE_PUBLIC_BROWSEROS_API must use http:// or https://')
  }

  return url.toString().replace(/\/$/, '')
}

/** Whether this build talks to a hosted account/API service at all. */
export function hostedApiConfigured(value: string | undefined): boolean {
  return parseBrowserOSApiUrl(value).length > 0
}

/** Origin safe to embed in a match pattern, even when no hosted API exists. */
export function browserOSApiMatchOrigin(value: string | undefined): string {
  return parseBrowserOSApiUrl(value) || UNCONFIGURED_API_ORIGIN
}
