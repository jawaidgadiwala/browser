diff --git a/chrome/browser/ui/views/browseros/browseros_window_ui.cc b/chrome/browser/ui/views/browseros/browseros_window_ui.cc
new file mode 100644
index 0000000..3abee4d
--- /dev/null
+++ b/chrome/browser/ui/views/browseros/browseros_window_ui.cc
@@ -0,0 +1,72 @@
+// Copyright 2025 The Chromium Authors
+// Use of this source code is governed by a BSD-style license that can be
+// found in the LICENSE file.
+
+#include "chrome/browser/ui/browseros_window_ui.h"
+
+#include <optional>
+
+#include "base/strings/string_util.h"
+#include "chrome/browser/browseros/core/browseros_prefs.h"
+#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"
+#include "chrome/browser/ui/views/browseros/browseros_glance_controller.h"
+#include "chrome/browser/ui/views/browseros/browseros_window_tint_controller.h"
+#include "chrome/browser/ui/views/frame/browser_view.h"
+#include "url/gurl.h"
+
+namespace browseros {
+
+namespace {
+
+BrowserView* GetBrowserView(BrowserWindowInterface* browser) {
+  return browser ? BrowserView::GetBrowserViewForBrowser(browser) : nullptr;
+}
+
+}  // namespace
+
+bool OpenGlance(BrowserWindowInterface* browser, const GURL& url) {
+  BrowserView* browser_view = GetBrowserView(browser);
+  if (!browser_view) {
+    return false;
+  }
+  BrowserOSGlanceController* controller =
+      browser_view->browseros_glance_controller();
+  return controller && controller->Show(url);
+}
+
+bool CloseGlance(BrowserWindowInterface* browser) {
+  BrowserView* browser_view = GetBrowserView(browser);
+  if (!browser_view) {
+    return false;
+  }
+  BrowserOSGlanceController* controller =
+      browser_view->browseros_glance_controller();
+  if (!controller || !controller->IsShowing()) {
+    return false;
+  }
+  controller->Close();
+  return true;
+}
+
+bool SetWindowTint(BrowserWindowInterface* browser, const std::string& color) {
+  BrowserView* browser_view = GetBrowserView(browser);
+  if (!browser_view) {
+    return false;
+  }
+  BrowserOSWindowTintController* controller =
+      browser_view->browseros_window_tint_controller();
+  if (!controller) {
+    return false;
+  }
+
+  const bool clearing =
+      base::TrimWhitespaceASCII(color, base::TRIM_ALL).empty();
+  std::optional<SkColor> parsed = ParseTintColor(color);
+  if (!clearing && !parsed.has_value()) {
+    return false;
+  }
+  controller->SetWindowOverride(parsed);
+  return true;
+}
+
+}  // namespace browseros
