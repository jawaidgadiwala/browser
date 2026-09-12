/**
 * Product naming for the cockpit. Embedded mode mounts this extension inside
 * the Browser build, where "BrowserOS neo" is the wrong name for a
 * panel that is simply the agent surface of that browser; a standalone build
 * keeps upstream's name. One constant so an upstream rebase only conflicts
 * here.
 *
 * Only the *product* name is renamed. The Claude Desktop `.mcpb` extension,
 * `chrome.browserOS` APIs, docs URLs and storage keys keep upstream spelling.
 * @public
 */

const UPSTREAM_PRODUCT_NAME = 'BrowserOS neo'

/** @public */
export const EMBEDDED = Boolean(import.meta.env.VITE_BROWSEROS_CLAW_EMBEDDED)

/** @public */
export const PRODUCT_NAME = EMBEDDED ? 'Browser Agents' : UPSTREAM_PRODUCT_NAME
