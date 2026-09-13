diff --git a/chrome/browser/ui/views/browseros/browseros_window_tint_controller.h b/chrome/browser/ui/views/browseros/browseros_window_tint_controller.h
new file mode 100644
index 0000000..7647560
--- /dev/null
+++ b/chrome/browser/ui/views/browseros/browseros_window_tint_controller.h
@@ -0,0 +1,58 @@
+// Copyright 2025 The Chromium Authors
+// Use of this source code is governed by a BSD-style license that can be
+// found in the LICENSE file.
+
+#ifndef CHROME_BROWSER_UI_VIEWS_BROWSEROS_BROWSEROS_WINDOW_TINT_CONTROLLER_H_
+#define CHROME_BROWSER_UI_VIEWS_BROWSEROS_BROWSEROS_WINDOW_TINT_CONTROLLER_H_
+
+#include <optional>
+
+#include "base/memory/raw_ptr.h"
+#include "components/prefs/pref_change_registrar.h"
+#include "third_party/skia/include/core/SkColor.h"
+
+class BrowserView;
+
+// Tints one browser window. The tint is handed to
+// views::Widget::SetUserColorOverride(), which BrowserWidget re-applies on top
+// of the ThemeService key in GetColorProviderKey(); Chromium then regenerates
+// the window's ColorProvider, so the frame, toolbar, omnibox, tab strip,
+// bubbles and side panel all recolour together and text contrast keeps being
+// computed by the colour pipeline. Nothing is painted over anything.
+//
+// Two sources, in priority order:
+//   1. a per-window override set by chrome.browserOS.setWindowTint(), and
+//   2. the profile-wide browseros.window_tint pref.
+// Clearing the override (an empty colour string) falls back to the pref;
+// clearing the pref with no override falls back to the stock theme.
+class BrowserOSWindowTintController {
+ public:
+  explicit BrowserOSWindowTintController(BrowserView* browser_view);
+  BrowserOSWindowTintController(const BrowserOSWindowTintController&) = delete;
+  BrowserOSWindowTintController& operator=(
+      const BrowserOSWindowTintController&) = delete;
+  ~BrowserOSWindowTintController();
+
+  // Sets the per-window override. `color` of std::nullopt means "no override",
+  // i.e. follow the pref again.
+  void SetWindowOverride(std::optional<SkColor> color);
+
+  // (Re)applies the effective tint. Safe to call before the BrowserView has a
+  // widget -- it is then a no-op, and BrowserView::AddedToWidget() calls it
+  // again once there is one.
+  void Apply();
+
+  std::optional<SkColor> effective_tint_for_testing() const {
+    return EffectiveTint();
+  }
+
+ private:
+  std::optional<SkColor> EffectiveTint() const;
+
+  const raw_ptr<BrowserView> browser_view_;
+  bool has_window_override_ = false;
+  std::optional<SkColor> window_override_;
+  PrefChangeRegistrar pref_registrar_;
+};
+
+#endif  // CHROME_BROWSER_UI_VIEWS_BROWSEROS_BROWSEROS_WINDOW_TINT_CONTROLLER_H_
