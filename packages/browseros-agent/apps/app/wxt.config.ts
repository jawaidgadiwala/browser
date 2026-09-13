import { REPORTER_EXTENSION_ID } from '@browseros/diagnostics/contract'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'wxt'
import { parseBrowserOSApiUrl } from './lib/browseros-api-url'
import { archiveSourceMaps } from './lib/build/archive-source-maps'
import { LEGACY_AGENT_EXTENSION_ID } from './lib/constants/legacyAgentExtensionId'
import { PRODUCT_WEB_HOST } from './lib/constants/productWebHost'
import { PRODUCT_NAME } from './lib/personal/product'

// biome-ignore lint/style/noProcessEnv: build config file needs env access
const env = process.env

// No hosted API configured (the default for this product) means no host
// permissions at all: the manifest must not grant a third party's origin.
const apiBaseUrl = parseBrowserOSApiUrl(env.VITE_PUBLIC_BROWSEROS_API)
const apiPattern = apiBaseUrl ? hostPattern(new URL(apiBaseUrl)) : undefined
const apiMatches = apiPattern
  ? [`https://${apiPattern}/*`, `https://*.${apiPattern}/*`]
  : undefined
const webHostMatches = PRODUCT_WEB_HOST
  ? [`https://${PRODUCT_WEB_HOST}/*`, `https://*.${PRODUCT_WEB_HOST}/*`]
  : undefined

function hostPattern(url: URL): string {
  return url.port ? `${url.hostname}:${url.port}` : url.hostname
}

// See https://wxt.dev/api/config.html
// Extension ID will be lmihdclmhdopaeappmadgmglglcabodf
export default defineConfig({
  outDir: 'dist',
  modules: ['@wxt-dev/module-react'],
  hooks: {
    // All Vite builds (including Sentry uploads) finish before this hook; WXT's
    // ZIP and the release CRX packer then consume the extension without maps.
    'build:done': (wxt, output) => archiveSourceMaps(wxt.config, output),
  },
  manifest: {
    name: PRODUCT_NAME,
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAlfNMhaIv8bdRian2xb8+SMXdeOE6DwmdisT4V97qSTlq1gvlS6DrtZvI9u9vC7ZGFCEZ4nXi9S5U9sJxF9HIOA5vG1B6MulGsjB2xdZSRMSUoy2WAJ+e3RphgBKHIN6JtZCPbxkJUGovPtgCaUhG3LbgP6E6JNQFDzfYZrbkXP6K1znl8nkFKc4Q/VNgRRbU+rnhZmvACvF8C0/l/TI8MxpcfNTPqMrRUr/jdNTXOPPWloU/8IIA+NMLZnVlvLzpgCLwjfyShoC98Tnw0XgO3EID6Qo0wKgu4vLRkS/lW1C4qb3kP11bwsYIiQCfQdigGYu4Lt7kmvSc5kVjIqMj/wIDAQAB',
    // No update_url: this build must never auto-update itself from the
    // upstream project's CDN. Set one here once we publish our own feed.
    externally_connectable: {
      ids: [REPORTER_EXTENSION_ID],
      ...(apiMatches ? { matches: apiMatches } : {}),
    },
    web_accessible_resources: webHostMatches
      ? [
          {
            resources: ['app.html'],
            matches: webHostMatches,
            extension_ids: [LEGACY_AGENT_EXTENSION_ID],
          },
        ]
      : [],
    chrome_url_overrides: {
      newtab: 'app.html',
    },
    options_ui: {
      page: 'app.html#/settings',
      open_in_tab: true,
    },
    action: {
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
        48: 'icon/48.png',
        128: 'icon/128.png',
      },
      default_title: `Ask ${PRODUCT_NAME}`,
    },
    // Spaces. Chrome allows default keys on at most four commands; the
    // numbered jumps are assignable at chrome://extensions/shortcuts.
    commands: {
      'capture-page': {
        suggested_key: { default: 'Ctrl+Shift+F', mac: 'Command+Shift+2' },
        description: 'Capture the visible page',
      },
      'space-next': {
        suggested_key: { default: 'Alt+Shift+Right' },
        description: 'Switch to the next space',
      },
      'space-prev': {
        suggested_key: { default: 'Alt+Shift+Left' },
        description: 'Switch to the previous space',
      },
      'space-switcher': {
        suggested_key: { default: 'Alt+Shift+S' },
        description: 'Open the space switcher',
      },
      ...Object.fromEntries(
        Array.from({ length: 9 }, (_, i) => [
          `space-${i + 1}`,
          { description: `Switch to space ${i + 1}` },
        ]),
      ),
    },
    permissions: [
      'system.cpu',
      'system.memory',
      'topSites',
      'storage',
      'unlimitedStorage',
      'scripting',
      'tabs',
      'tabGroups',
      'favicon',
      'sessions',
      'sidePanel',
      'bookmarks',
      'history',
      'browserOS',
      'alarms',
      'webNavigation',
      'downloads',
      'activeTab',
      'offscreen',
      'clipboardWrite',
      'notifications',
      'debugger',
    ],
    host_permissions: ['http://127.0.0.1/*'],
  },
  vite: () => ({
    build: {
      sourcemap: 'hidden',
    },
    plugins: [
      tailwindcss(),
      ...(env.SENTRY_AUTH_TOKEN
        ? [
            sentryVitePlugin({
              org: env.SENTRY_ORG,
              project: env.SENTRY_PROJECT,
              authToken: env.SENTRY_AUTH_TOKEN,
              // archiveSourceMaps retains full maps after every upload finishes.
            }),
          ]
        : []),
    ],
  }),
})
