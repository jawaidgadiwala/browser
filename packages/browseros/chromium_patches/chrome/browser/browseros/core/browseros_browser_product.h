diff --git a/chrome/browser/browseros/core/browseros_browser_product.h b/chrome/browser/browseros/core/browseros_browser_product.h
new file mode 100644
index 0000000..68cca66
--- /dev/null
+++ b/chrome/browser/browseros/core/browseros_browser_product.h
@@ -0,0 +1,36 @@
+// Copyright 2025 The Chromium Authors
+// Use of this source code is governed by a BSD-style license that can be
+// found in the LICENSE file.
+
+#ifndef CHROME_BROWSER_BROWSEROS_CORE_BROWSEROS_BROWSER_PRODUCT_H_
+#define CHROME_BROWSER_BROWSEROS_CORE_BROWSEROS_BROWSER_PRODUCT_H_
+
+namespace browseros {
+
+// "Browser" product switch.
+//
+// This tree ships as Browser (KoderLabs): the app is branded "Browser", the
+// update feed is unconfigured by default, and the Browser UI defaults below
+// are on. It is deliberately orthogonal to `browseros_product` (BrowserOS vs
+// BrowserClaw) so that nothing here forks the two-valued product buildflag,
+// the bundled-extension lists or the release slugs.
+//
+// Nothing is gated by `#if` at a call site. IsBrowserProduct() is only ever
+// used as the *default value* of a `browseros.*` preference, so every
+// behaviour below stays reachable in a stock build by flipping one pref via
+// chrome.browserOS.setPref(). That keeps the patches reviewable and testable.
+//
+// Upgrade path: when this needs to be selectable per build, replace the
+// constant with BUILDFLAG(BROWSEROS_BROWSER_PRODUCT) fed by a
+// `browseros_browser_product` GN arg in
+// chrome/browser/browseros/buildflags.gni (and add
+// //chrome/browser/browseros:buildflags to the :core deps). No caller changes.
+inline constexpr bool kBrowserProduct = true;
+
+constexpr bool IsBrowserProduct() {
+  return kBrowserProduct;
+}
+
+}  // namespace browseros
+
+#endif  // CHROME_BROWSER_BROWSEROS_CORE_BROWSEROS_BROWSER_PRODUCT_H_
