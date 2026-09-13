diff --git a/chrome/browser/ui/views/browseros/browseros_window_tint_controller.cc b/chrome/browser/ui/views/browseros/browseros_window_tint_controller.cc
new file mode 100644
index 0000000..e333c52
--- /dev/null
+++ b/chrome/browser/ui/views/browseros/browseros_window_tint_controller.cc
@@ -0,0 +1,47 @@
+// Copyright 2025 The Chromium Authors
+// Use of this source code is governed by a BSD-style license that can be
+// found in the LICENSE file.
+
+#include "chrome/browser/ui/views/browseros/browseros_window_tint_controller.h"
+
+#include "base/functional/bind.h"
+#include "chrome/browser/browseros/core/browseros_prefs.h"
+#include "chrome/browser/profiles/profile.h"
+#include "chrome/browser/ui/views/frame/browser_view.h"
+#include "ui/views/widget/widget.h"
+
+BrowserOSWindowTintController::BrowserOSWindowTintController(
+    BrowserView* browser_view)
+    : browser_view_(browser_view) {
+  pref_registrar_.Init(browser_view_->GetProfile()->GetPrefs());
+  pref_registrar_.Add(
+      browseros::prefs::kWindowTint,
+      base::BindRepeating(&BrowserOSWindowTintController::Apply,
+                          base::Unretained(this)));
+}
+
+BrowserOSWindowTintController::~BrowserOSWindowTintController() = default;
+
+void BrowserOSWindowTintController::SetWindowOverride(
+    std::optional<SkColor> color) {
+  has_window_override_ = color.has_value();
+  window_override_ = color;
+  Apply();
+}
+
+void BrowserOSWindowTintController::Apply() {
+  views::Widget* widget = browser_view_->GetWidget();
+  if (!widget) {
+    return;
+  }
+  // SetUserColorOverride() no-ops when the value is unchanged, so this is
+  // cheap to call from the pref observer and from AddedToWidget().
+  widget->SetUserColorOverride(EffectiveTint());
+}
+
+std::optional<SkColor> BrowserOSWindowTintController::EffectiveTint() const {
+  if (has_window_override_) {
+    return window_override_;
+  }
+  return browseros::GetWindowTint(browser_view_->GetProfile()->GetPrefs());
+}
