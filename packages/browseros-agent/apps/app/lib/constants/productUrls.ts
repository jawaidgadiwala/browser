/**
 * Every outbound product link in one place. Values come from
 * `lib/personal/productUrls` for this product and from the upstream properties
 * otherwise, so a rebase touches only the personal module.
 *
 * An empty value means "this product has no such destination": consumers must
 * hide the link instead of rendering a dead one.
 */

import { PERSONAL_BUILD } from '@/lib/personal/personal-build'
import {
  PERSONAL_DOCS_BASE_URL,
  PERSONAL_PRODUCT_URLS,
} from '@/lib/personal/productUrls'

const UPSTREAM_DOCS_BASE_URL = 'https://docs.browseros.com'

const UPSTREAM_PRODUCT_URLS = {
  docsUrl: `${UPSTREAM_DOCS_BASE_URL}/`,
  productWebUrl: 'https://browseros.com',
  productRepositoryUrl: 'https://github.com/browseros-ai/BrowserOS',
  productRepositoryShortUrl: 'https://git.new/browseros',
  githubOrgUrl: 'https://github.com/browseros-ai',
  issuesUrl: 'https://github.com/browseros-ai/BrowserOS/issues',
  privacyPolicyUrl: 'https://browseros.com/privacy',
  contributorsUrl:
    'https://github.com/browseros-ai/BrowserOS/graphs/contributors',
  changelogUrl: `${UPSTREAM_DOCS_BASE_URL}/changelog`,
  discordUrl: 'https://discord.gg/browseros',
  slackUrl: 'https://dub.sh/browserOS-slack',
  productVideoUrl: 'https://youtu.be/J-lFhTP-7is',
} as const

const productUrls = PERSONAL_BUILD
  ? PERSONAL_PRODUCT_URLS
  : UPSTREAM_PRODUCT_URLS

const docsBaseUrl = PERSONAL_BUILD
  ? PERSONAL_DOCS_BASE_URL
  : UPSTREAM_DOCS_BASE_URL

/**
 * Deep link into the product docs, or undefined when the product has no docs
 * site. Callers must treat undefined as "hide this link".
 * @public
 */
export function docsGuideUrl(path: string): string | undefined {
  return docsBaseUrl ? `${docsBaseUrl}/${path}` : undefined
}

/**
 * @public
 */
export const docsUrl = productUrls.docsUrl

/**
 * @public
 */
export const productWebUrl = productUrls.productWebUrl

/**
 * Public source repository. Also the AGPL-3.0 source offer for distributed
 * builds, so it must stay populated.
 * @public
 */
export const productRepositoryUrl = productUrls.productRepositoryUrl

/**
 * @public
 */
export const githubOrgUrl = productUrls.githubOrgUrl

/**
 * @public
 */
export const issuesUrl = productUrls.issuesUrl

/**
 * @public
 */
export const privacyPolicyUrl = productUrls.privacyPolicyUrl

/**
 * Contributor credits for the AGPL source offer; must stay populated.
 * @public
 */
export const contributorsUrl = productUrls.contributorsUrl

/**
 * @public
 */
export const changelogUrl = productUrls.changelogUrl

/**
 * Empty when the product has no community server.
 * @public
 */
export const discordUrl = productUrls.discordUrl

/**
 * Empty when the product has no community server.
 * @public
 */
export const slackUrl = productUrls.slackUrl

/**
 * Empty when the product has no launch video.
 * @public
 */
export const productVideoUrl = productUrls.productVideoUrl

/**
 * @public
 */
export const productRepositoryShortUrl = productUrls.productRepositoryShortUrl

/**
 * Undefined when the product has no docs site.
 * @public
 */
export const scheduledTasksHelpUrl = docsGuideUrl('features/scheduled-tasks')

/**
 * Undefined when the product has no docs site.
 * @public
 */
export const connectionIssuesHelpUrl = docsGuideUrl(
  'troubleshooting/connection-issues',
)

/**
 * Undefined when the product has no docs site.
 * @public
 */
export const claudeCodeHelpUrl = docsGuideUrl('features/use-with-claude-code')
