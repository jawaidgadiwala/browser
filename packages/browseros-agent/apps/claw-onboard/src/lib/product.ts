/**
 * Product naming for the cockpit's standalone onboarding app. Mirrors
 * `apps/claw-app/lib/personal/product.ts`: one constant so an upstream rebase
 * only ever conflicts here, not across every first-run string. This app is its
 * own Vite package with no path into the extension, hence a local copy rather
 * than an import.
 *
 * Only the *product* name is renamed. `chrome.browserOS` APIs, the
 * `BrowserOS*` bridge message and payload types, package names and storage
 * keys keep upstream spelling.
 */

/** Single switch for the personal fork. */
const PERSONAL_BUILD = true

const UPSTREAM_PRODUCT_NAME = 'BrowserOS neo'

/** The agent cockpit, as the first-run copy names it. */
export const PRODUCT_NAME = PERSONAL_BUILD
  ? 'Browser Agents'
  : UPSTREAM_PRODUCT_NAME

/**
 * The browser the cockpit is the agent surface of. Setup copy that talks about
 * the browser itself (importing a profile, the Keychain prompt) names this, not
 * the cockpit.
 */
const BROWSER_PRODUCT_NAME = PERSONAL_BUILD ? 'Browser' : UPSTREAM_PRODUCT_NAME

/**
 * Name of the macOS helper process the Keychain prompt actually names, so the
 * illustration matches the dialog the reader sees.
 *
 * Chromium derives the helper bundle name from `PRODUCT_FULLNAME` in
 * `chromium_files/products/browseros/chrome/app/theme/chromium/BRANDING.*`
 * (today: `Browser`) — the build this onboarding ships in. Keep
 * `BROWSER_PRODUCT_NAME` in lockstep with that file, and with `display_name`
 * in `bos_build/products/browseros/product.py` once the bundle rename lands —
 * never hardcode the helper name here.
 */
export const HELPER_PROCESS_NAME = `${BROWSER_PRODUCT_NAME} Helper`
