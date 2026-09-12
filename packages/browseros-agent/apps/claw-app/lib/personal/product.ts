/**
 * Product naming for the cockpit. The cockpit is the agent surface of the
 * Browser build, so it carries the product's own name in every mode — the
 * standalone build is the same product, not a different one. One constant so
 * an upstream rebase only conflicts here.
 *
 * Deliberately free of `import.meta` so `wxt.config.ts` (which runs in Node at
 * build time, where `import.meta.env` does not exist) can import it.
 *
 * Only the *product* name is renamed. The Claude Desktop `.mcpb` extension,
 * `chrome.browserOS` APIs, package names, env vars and storage keys keep
 * upstream spelling.
 * @public
 */

import { PERSONAL_BUILD } from './personal-build'

const UPSTREAM_PRODUCT_NAME = 'BrowserOS neo'

/** @public */
export const PRODUCT_NAME = PERSONAL_BUILD
  ? 'Browser Agents'
  : UPSTREAM_PRODUCT_NAME

/**
 * Name of the browser the cockpit is the agent surface of. The cockpit is
 * "Browser Agents"; the browser around it is "Browser".
 * @public
 */
export const BROWSER_PRODUCT_NAME = PERSONAL_BUILD
  ? 'Browser'
  : UPSTREAM_PRODUCT_NAME

/** Extension description in the manifest and the extensions page. @public */
export const PRODUCT_DESCRIPTION = PERSONAL_BUILD
  ? 'Browser agents cockpit: run, watch, and replay browser agents.'
  : `${UPSTREAM_PRODUCT_NAME} — the browser for AI agents.`

/**
 * Where "Read the docs" and help links point. The personal build has no docs
 * site yet, so the public source repository is the documentation of record
 * (and the AGPL source offer).
 * @public
 */
export const PRODUCT_DOCS_URL = PERSONAL_BUILD
  ? 'https://github.com/jawaidgadiwala/browser'
  : 'https://docs.browseros.com/browserclaw'
