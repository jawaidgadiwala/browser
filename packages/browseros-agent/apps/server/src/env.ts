/**
 * @license
 * Copyright 2025 BrowserOS
 *
 * Build-time inlined environment variables.
 *
 * IMPORTANT: Values here are replaced at build time by Bun's `--env inline` flag.
 * The `process.env.X` access MUST be direct (not via a variable) for inlining to work.
 *
 * These variables are:
 * - Replaced with literal strings in production builds
 * - Read from actual env vars during development
 *
 * Runtime-only feature toggles should be read at their feature boundary.
 */

export const INLINED_ENV = {
  SENTRY_DSN: process.env.SENTRY_DSN,
  POSTHOG_API_KEY: process.env.POSTHOG_API_KEY,
  BROWSEROS_CONFIG_URL: process.env.BROWSEROS_CONFIG_URL,
} as const

// Every inlined value is opt-in for the Browser product. Telemetry is disabled
// at its feature boundary by an empty SENTRY_DSN / POSTHOG_API_KEY, and an empty
// or unreachable BROWSEROS_CONFIG_URL simply means this build has no hosted
// model gateway: the server boots and never fetches remote config.
export const REQUIRED_FOR_PRODUCTION =
  [] as const satisfies readonly (keyof typeof INLINED_ENV)[]

/**
 * Host suffix used by the placeholder config URL. `.invalid` is reserved and
 * never resolves, so a build carrying the sentinel must not attempt the fetch.
 */
const UNREACHABLE_HOST_SUFFIX = '.invalid'

/**
 * Base URL of the hosted model gateway, or `undefined` when this build has
 * none. Callers must treat `undefined` as "hosted gateway features are off"
 * rather than falling back to any default endpoint.
 */
export function hostedGatewayConfigUrl(): string | undefined {
  const configured = INLINED_ENV.BROWSEROS_CONFIG_URL?.trim()
  if (!configured) return undefined

  try {
    const url = new URL(configured)
    if (url.hostname.endsWith(UNREACHABLE_HOST_SUFFIX)) return undefined
    return configured
  } catch {
    return undefined
  }
}
