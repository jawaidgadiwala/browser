/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Product naming for everything outside the extension bundle (the server, the
 * Rust sidecar's TS callers, build scripts). The extension has its own copy in
 * `apps/app/lib/personal/product.ts`; both exist so an upstream rebase only
 * conflicts in these two files instead of across every user-facing string.
 *
 * Only the *product* name is renamed. Third-party names stay as upstream ships
 * them: `chrome.browserOS` APIs, package names, env vars, storage keys.
 */
export const PRODUCT_NAME = 'Browser'
