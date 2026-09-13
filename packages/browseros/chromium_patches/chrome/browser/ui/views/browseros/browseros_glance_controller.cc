diff --git a/chrome/browser/ui/views/browseros/browseros_glance_controller.cc b/chrome/browser/ui/views/browseros/browseros_glance_controller.cc
new file mode 100644
index 0000000..00b612f
--- /dev/null
+++ b/chrome/browser/ui/views/browseros/browseros_glance_controller.cc
@@ -0,0 +1,148 @@
+// Copyright 2025 The Chromium Authors
+// Use of this source code is governed by a BSD-style license that can be
+// found in the LICENSE file.
+
+#include "chrome/browser/ui/views/browseros/browseros_glance_controller.h"
+
+#include <algorithm>
+#include <memory>
+#include <utility>
+
+#include "base/functional/bind.h"
+#include "base/location.h"
+#include "base/task/single_thread_task_runner.h"
+#include "chrome/browser/browseros/core/browseros_prefs.h"
+#include "chrome/browser/profiles/profile.h"
+#include "chrome/browser/ui/browser.h"
+#include "chrome/browser/ui/browser_tabstrip.h"
+#include "chrome/browser/ui/views/browseros/browseros_glance_overlay_view.h"
+#include "chrome/browser/ui/views/frame/browser_view.h"
+#include "ui/gfx/geometry/size.h"
+#include "ui/views/view.h"
+#include "url/gurl.h"
+
+namespace {
+
+// The overlay takes this much of the content area, capped at a comfortable
+// reading size, and is centred over it.
+constexpr double kContentFraction = 0.7;
+constexpr int kMaxWidthDip = 1000;
+constexpr int kMaxHeightDip = 700;
+constexpr int kMinWidthDip = 320;
+constexpr int kMinHeightDip = 240;
+
+}  // namespace
+
+BrowserOSGlanceController::BrowserOSGlanceController(BrowserView* browser_view)
+    : browser_view_(browser_view) {}
+
+BrowserOSGlanceController::~BrowserOSGlanceController() {
+  widget_observation_.Reset();
+  widget_.reset();
+  widget_delegate_.reset();
+}
+
+bool BrowserOSGlanceController::Show(const GURL& url) {
+  if (!browseros::IsGlanceEnabled(browser_view_->GetProfile()->GetPrefs())) {
+    return false;
+  }
+  if (!url.is_valid() || !url.SchemeIsHTTPOrHTTPS()) {
+    return false;
+  }
+  views::Widget* parent_widget = browser_view_->GetWidget();
+  if (!parent_widget) {
+    return false;
+  }
+
+  if (!widget_) {
+    auto overlay = std::make_unique<BrowserOSGlanceOverlayView>(
+        browser_view_->GetProfile(),
+        base::BindRepeating(&BrowserOSGlanceController::Close,
+                            weak_factory_.GetWeakPtr()),
+        base::BindRepeating(&BrowserOSGlanceController::PromoteToTab,
+                            weak_factory_.GetWeakPtr()));
+
+    widget_delegate_ = std::make_unique<views::WidgetDelegate>();
+    widget_delegate_->SetCanActivate(true);
+    overlay_view_ = widget_delegate_->SetContentsView(std::move(overlay));
+
+    views::Widget::InitParams params(
+        views::Widget::InitParams::CLIENT_OWNS_WIDGET,
+        views::Widget::InitParams::TYPE_POPUP);
+    params.name = "BrowserOSGlance";
+    params.SetParent(parent_widget->GetNativeView());
+    params.delegate = widget_delegate_.get();
+    params.activatable = views::Widget::InitParams::Activatable::kYes;
+    params.bounds = CalculateOverlayBounds();
+
+    widget_ = std::make_unique<views::Widget>();
+    widget_->Init(std::move(params));
+    widget_observation_.Observe(widget_.get());
+  } else {
+    widget_->SetBounds(CalculateOverlayBounds());
+  }
+
+  overlay_view_->Navigate(url);
+  widget_->Show();
+  return true;
+}
+
+void BrowserOSGlanceController::Close() {
+  if (!widget_) {
+    return;
+  }
+  widget_observation_.Reset();
+  overlay_view_ = nullptr;
+  widget_->Hide();
+  // Tear down outside of whatever is on the stack: Close() is reached from the
+  // widget's own deactivation notification and from a button inside the view
+  // that the teardown destroys.
+  base::SingleThreadTaskRunner::GetCurrentDefault()->PostTask(
+      FROM_HERE, base::BindOnce(&BrowserOSGlanceController::DestroyWidget,
+                                weak_factory_.GetWeakPtr()));
+}
+
+bool BrowserOSGlanceController::IsShowing() const {
+  return widget_ && widget_->IsVisible();
+}
+
+void BrowserOSGlanceController::OnWidgetActivationChanged(
+    views::Widget* widget,
+    bool active) {
+  // Clicking anywhere outside the overlay dismisses it.
+  if (!active) {
+    Close();
+  }
+}
+
+void BrowserOSGlanceController::OnWidgetDestroying(views::Widget* widget) {
+  widget_observation_.Reset();
+  overlay_view_ = nullptr;
+}
+
+gfx::Rect BrowserOSGlanceController::CalculateOverlayBounds() const {
+  const views::View* anchor = browser_view_->contents_container();
+  const gfx::Rect area = anchor ? anchor->GetBoundsInScreen()
+                                : browser_view_->GetBoundsInScreen();
+  const int width = std::clamp(static_cast<int>(area.width() * kContentFraction),
+                               kMinWidthDip, kMaxWidthDip);
+  const int height =
+      std::clamp(static_cast<int>(area.height() * kContentFraction),
+                 kMinHeightDip, kMaxHeightDip);
+  gfx::Rect bounds(area.x() + (area.width() - width) / 2,
+                   area.y() + (area.height() - height) / 2, width, height);
+  return bounds;
+}
+
+void BrowserOSGlanceController::PromoteToTab(const GURL& url) {
+  if (url.is_valid()) {
+    chrome::AddTabAt(browser_view_->browser(), url, /*index=*/-1,
+                     /*foreground=*/true);
+  }
+  Close();
+}
+
+void BrowserOSGlanceController::DestroyWidget() {
+  widget_.reset();
+  widget_delegate_.reset();
+}
