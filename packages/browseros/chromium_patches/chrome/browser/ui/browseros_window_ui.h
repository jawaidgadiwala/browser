diff --git a/chrome/browser/ui/browseros_window_ui.h b/chrome/browser/ui/browseros_window_ui.h
new file mode 100644
index 0000000..18ed222
--- /dev/null
+++ b/chrome/browser/ui/browseros_window_ui.h
@@ -0,0 +1,37 @@
+// Copyright 2025 The Chromium Authors
+// Use of this source code is governed by a BSD-style license that can be
+// found in the LICENSE file.
+
+#ifndef CHROME_BROWSER_UI_BROWSEROS_WINDOW_UI_H_
+#define CHROME_BROWSER_UI_BROWSEROS_WINDOW_UI_H_
+
+#include <string>
+
+class BrowserWindowInterface;
+class GURL;
+
+// Toolkit-independent entry points into the BrowserOS window features, so that
+// callers outside //chrome/browser/ui/views (notably the chrome.browserOS
+// extension API) never have to include a views header. The implementation
+// lives in //chrome/browser/ui/views/browseros/browseros_window_ui.cc; this
+// mirrors the split already used by extension_side_panel_utils.
+namespace browseros {
+
+// Opens `url` in the glance overlay of `browser`'s window. Returns false when
+// the window has no glance controller, when browseros.glance is off, or when
+// `url` is not http(s).
+bool OpenGlance(BrowserWindowInterface* browser, const GURL& url);
+
+// Closes `browser`'s glance overlay if one is showing. Returns whether an
+// overlay was actually closed.
+bool CloseGlance(BrowserWindowInterface* browser);
+
+// Tints `browser`'s window with `color`, a "#RRGGBB" (or "RRGGBB") string.
+// An empty string drops the per-window override, so the window falls back to
+// the browseros.window_tint pref. Returns false when the string is neither
+// empty nor a valid colour, or when the window has no tint controller.
+bool SetWindowTint(BrowserWindowInterface* browser, const std::string& color);
+
+}  // namespace browseros
+
+#endif  // CHROME_BROWSER_UI_BROWSEROS_WINDOW_UI_H_
