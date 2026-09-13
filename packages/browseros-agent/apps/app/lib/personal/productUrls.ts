/**
 * Product links for this fork. One module so an upstream rebase only ever
 * conflicts here, the same way `product.ts` owns product naming.
 *
 * This product has no docs site, marketing site, or chat community, so those
 * links either point at the public repository (which is also the AGPL source
 * offer) or are empty. Every consumer must hide a link whose value is empty
 * rather than render a dead one.
 * @public
 */

/** @public */
export const PERSONAL_REPOSITORY_URL =
  'https://github.com/jawaidgadiwala/browser'

/** @public */
export const PERSONAL_PRODUCT_URLS = {
  docsUrl: PERSONAL_REPOSITORY_URL,
  productWebUrl: PERSONAL_REPOSITORY_URL,
  productRepositoryUrl: PERSONAL_REPOSITORY_URL,
  productRepositoryShortUrl: PERSONAL_REPOSITORY_URL,
  githubOrgUrl: 'https://github.com/jawaidgadiwala',
  issuesUrl: `${PERSONAL_REPOSITORY_URL}/issues`,
  privacyPolicyUrl: `${PERSONAL_REPOSITORY_URL}/blob/main/PRIVACY.md`,
  contributorsUrl: `${PERSONAL_REPOSITORY_URL}/graphs/contributors`,
  changelogUrl: `${PERSONAL_REPOSITORY_URL}/releases`,
  // No community servers and no launch video: hidden wherever they are used.
  discordUrl: '',
  slackUrl: '',
  productVideoUrl: '',
} as const

/** Docs base URL, empty when the product ships no docs site. @public */
export const PERSONAL_DOCS_BASE_URL = ''
