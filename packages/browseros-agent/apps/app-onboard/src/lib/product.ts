/**
 * Product naming for the standalone onboarding app. Mirrors
 * `apps/app/lib/personal/product.ts`: one constant so an upstream rebase only
 * ever conflicts here, not across every first-run string. This app is its own
 * Vite package with no path into the extension, hence a local copy rather than
 * an import.
 *
 * Only the *product* name is renamed. `chrome.browserOS` APIs, the
 * `BrowserOS*` bridge message and payload types, package names and storage
 * keys keep upstream spelling.
 */

/**
 * Single switch for the personal fork, mirroring
 * `apps/app/lib/personal/personal-build.ts`.
 */
export const PERSONAL_BUILD = true

const UPSTREAM_PRODUCT_NAME = 'BrowserOS'

/** The browser being set up, as the first-run copy names it. */
export const PRODUCT_NAME = PERSONAL_BUILD ? 'Browser' : UPSTREAM_PRODUCT_NAME

/**
 * Name of the macOS helper process the Keychain prompt actually names, so the
 * illustration matches the dialog the reader sees.
 *
 * Chromium derives the helper bundle name from `PRODUCT_FULLNAME` in
 * `chromium_files/products/browseros/chrome/app/theme/chromium/BRANDING.*`
 * (today: `Browser`). Keep `PRODUCT_NAME` in lockstep with that file, and with
 * `display_name` in `bos_build/products/browseros/product.py` once the bundle
 * rename lands — never hardcode the helper name here.
 */
export const HELPER_PROCESS_NAME = `${PRODUCT_NAME} Helper`
