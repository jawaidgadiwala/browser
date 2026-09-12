/**
 * Product naming for the personal fork. One constant so an upstream rebase
 * only ever conflicts here, not across every user-facing string.
 *
 * Only the *product* name is renamed. Third-party names stay as upstream ships
 * them: the "BrowserOS-hosted model" provider, `chrome.browserOS` APIs,
 * package names, URLs, env vars and storage keys.
 * @public
 */

import { PERSONAL_BUILD } from './personal-build'

const UPSTREAM_PRODUCT_NAME = 'BrowserOS'

/** @public */
export const PRODUCT_NAME = PERSONAL_BUILD ? 'Browser' : UPSTREAM_PRODUCT_NAME

/** @public */
export const PRODUCT_SHORT = PERSONAL_BUILD ? 'Browser' : UPSTREAM_PRODUCT_NAME

/** Product name for JSX/template copy. @public */
export function productName(): string {
  return PRODUCT_NAME
}
