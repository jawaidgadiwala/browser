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

/**
 * Display name of the built-in hosted LLM provider. Upstream names it after
 * the product; the personal build keeps the two apart so "Browser" stays the
 * browser and "Browser AI" is the metered model behind it.
 * @public
 */
export const HOSTED_PROVIDER_NAME = PERSONAL_BUILD
  ? 'Browser AI'
  : UPSTREAM_PRODUCT_NAME

/** Subtitle under the hosted provider in the target list. @public */
export const HOSTED_PROVIDER_DESCRIPTION = PERSONAL_BUILD
  ? 'Hosted model with strict rate limits'
  : `${UPSTREAM_PRODUCT_NAME}-hosted model with strict rate limits`
