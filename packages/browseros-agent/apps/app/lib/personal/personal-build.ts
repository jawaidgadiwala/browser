/**
 * Single switch for the personal fork. Flip to false to get upstream
 * behaviour back (promos, nags, marketing banners).
 * @public
 */
export const PERSONAL_BUILD = true

export function showUpstreamPromos(): boolean {
  return !PERSONAL_BUILD
}

/**
 * Whether the upstream hosted LLM provider ships in this build.
 *
 * It is a metered service tied to upstream's account and billing system, so
 * this build neither seeds it nor lists it: a user brings their own API key or
 * connects a coding agent, and surfaces that need a model show the
 * "add a provider" notice until one exists. Gated rather than deleted so the
 * upstream code paths stay intact across a rebase.
 * @public
 */
export function hostedProviderEnabled(): boolean {
  return !PERSONAL_BUILD
}
