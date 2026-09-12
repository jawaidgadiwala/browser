import { REPORTER_EXTENSION_ID } from '@browseros/diagnostics/contract'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'wxt'
import { PRODUCT_DESCRIPTION, PRODUCT_NAME } from './lib/personal/product'

// BROWSEROS_CLAW_EMBEDDED=1 (set by `browseros-dev watch --with-claw`) loads
// this extension next to the BrowserOS classic agent extension in one
// browser: classic keeps the new tab, and the cockpit is reached through
// chrome-extension://<id>/newtab.html instead. The pinned `key` keeps the
// extension id identical in both modes.
const embedded = process.env.BROWSEROS_CLAW_EMBEDDED === '1'

// `entrypoints/newtab/` is WXT's conventional new-tab entrypoint. WXT
// auto-wires manifest.chrome_url_overrides.newtab to point at the
// generated newtab.html, so no hand-rolled override needed.
//
// `browserOS` is BrowserOS Chromium's permission gate for the
// new-tab override and the cockpit-adjacent surfaces.
export default defineConfig({
  outDir: 'dist',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: PRODUCT_NAME,
    externally_connectable: { ids: [REPORTER_EXTENSION_ID] },
    description: PRODUCT_DESCRIPTION,
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAyndydRTtd3xudG65Tj5OURAVUveCV+5WMBDvzqGT6lZ2XMMsE2QaOGqofEfgIZG2fP0oQE3Ckjm8VK62WbZ5e1tUUOnsMQS0CUwJf2TF2ELwonL1XC7OISKYmrCutenPBh3kBMpdMvJWwn7oHddQX2P998TJLUsveeo531P5NEs73/CZ9uZQlPYsg8uLaaJU4ZKzutgvGkngsqbdRnc4e4xCxGa4+2FBcB5M+wzKHBHr0lQpCRgBrTqZL9/uVeKpY38yQF2mOqYqxVAwZDDQfmpAHSHso/yfYeVgtdBXdL5j2cg0dD+YPtDs+gDE1OEC74z21cCL2spgV7M7T8ckkwIDAQAB',
    update_url: 'https://cdn.browseros.com/extensions/update-manifest.xml',
    // Keep shared permissions in sync with apps/app/wxt.config.ts; additions
    // re-prompt or disable existing installs on update.
    permissions: [
      'system.cpu',
      'system.memory',
      'topSites',
      'storage',
      'unlimitedStorage',
      'scripting',
      'tabs',
      'tabGroups',
      'sidePanel',
      'bookmarks',
      'history',
      'browserOS',
      'alarms',
      'webNavigation',
      'downloads',
      'notifications',
    ],
    // Recording is universal; the local server owns tab attribution.
    host_permissions: ['http://127.0.0.1/*', '<all_urls>'],
    action: {
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
        48: 'icon/48.png',
        128: 'icon/128.png',
      },
      default_title: PRODUCT_NAME,
    },
  },
  hooks: {
    'build:manifestGenerated': (_wxt, manifest) => {
      if (embedded) {
        delete manifest.chrome_url_overrides
      }
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
    define: {
      'import.meta.env.VITE_BROWSEROS_CLAW_EMBEDDED': JSON.stringify(
        embedded ? '1' : '',
      ),
    },
  }),
})
