/**
 * Extension ids derived from the pinned manifest keys in each app's
 * wxt.config.ts (sha256 of the DER key, first 32 hex chars mapped 0-f -> a-p).
 * @public
 */
export const CLASSIC_EXTENSION_ID = 'lmihdclmhdopaeappmadgmglglcabodf'
export const NEO_EXTENSION_ID = 'jllpmhghjcbaccmpindcmpkddjekbnmm'

/** Hash routes of apps/claw-app/entrypoints/newtab/App.tsx. */
export const NEO_ROUTES = {
  cockpit: '/',
  mcp: '/mcp',
  skills: '/skills',
  audit: '/audit',
  diagnostics: '/diagnostics',
} as const

export function neoCockpitUrl(path: string): string {
  return `chrome-extension://${NEO_EXTENSION_ID}/newtab.html#${path}`
}
