/**
 * Single switch for the cockpit half of the personal fork, mirroring
 * `apps/app/lib/personal/personal-build.ts`. Flip to false to get upstream
 * naming, marketing banners and upstream-hosted media back.
 * @public
 */
export const PERSONAL_BUILD = true

/**
 * Whether upstream's marketing surfaces (launch banners, upstream-hosted
 * onboarding recordings) ship in this build.
 * @public
 */
export function showUpstreamPromos(): boolean {
  return !PERSONAL_BUILD
}
