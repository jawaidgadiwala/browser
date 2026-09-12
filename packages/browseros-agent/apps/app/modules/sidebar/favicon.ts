/**
 * `_favicon/` serves Chromium's own cache and needs the `favicon` permission.
 * A live tab's icon is the fallback when that lookup misses.
 */
export function faviconUrl(pageUrl: string, size = 32): string | undefined {
  if (!pageUrl) return undefined
  try {
    const url = new URL(chrome.runtime.getURL('/_favicon/'))
    url.searchParams.set('pageUrl', pageUrl)
    url.searchParams.set('size', String(size))
    return url.toString()
  } catch {
    return undefined
  }
}
