/**
 * Single switch for the personal fork. Flip to false to get upstream
 * behaviour back (promos, nags, marketing banners).
 * @public
 */
export const PERSONAL_BUILD = true

export function showUpstreamPromos(): boolean {
  return !PERSONAL_BUILD
}
