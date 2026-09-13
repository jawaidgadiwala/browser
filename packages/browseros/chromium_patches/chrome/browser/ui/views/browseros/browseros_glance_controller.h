diff --git a/chrome/browser/ui/views/browseros/browseros_glance_controller.h b/chrome/browser/ui/views/browseros/browseros_glance_controller.h
new file mode 100644
index 0000000..704f143
--- /dev/null
+++ b/chrome/browser/ui/views/browseros/browseros_glance_controller.h
@@ -0,0 +1,70 @@
+// Copyright 2025 The Chromium Authors
+// Use of this source code is governed by a BSD-style license that can be
+// found in the LICENSE file.
+
+#ifndef CHROME_BROWSER_UI_VIEWS_BROWSEROS_BROWSEROS_GLANCE_CONTROLLER_H_
+#define CHROME_BROWSER_UI_VIEWS_BROWSEROS_BROWSEROS_GLANCE_CONTROLLER_H_
+
+#include <memory>
+
+#include "base/memory/raw_ptr.h"
+#include "base/memory/weak_ptr.h"
+#include "base/scoped_observation.h"
+#include "ui/gfx/geometry/rect.h"
+#include "ui/views/widget/widget.h"
+#include "ui/views/widget/widget_delegate.h"
+#include "ui/views/widget/widget_observer.h"
+
+class BrowserOSGlanceOverlayView;
+class BrowserView;
+class GURL;
+
+// Owns the glance overlay for one browser window.
+//
+// The overlay is a child views::Widget of the browser widget, centred over the
+// content area, holding an ordinary WebContents. It is a plain popup widget,
+// not a BubbleDialogDelegateView: in Chromium 151 both BubbleDialogDelegateView
+// and WidgetDelegateView are friend-list gated for subclassing, and a popup
+// widget with a client-owned views::WidgetDelegate reaches the same result
+// using only public API and no upstream edits.
+//
+// Ownership follows the CLIENT_OWNS_WIDGET model that upstream now prefers:
+// this controller owns the widget and the delegate, and the delegate owns the
+// contents view.
+class BrowserOSGlanceController : public views::WidgetObserver {
+ public:
+  explicit BrowserOSGlanceController(BrowserView* browser_view);
+  BrowserOSGlanceController(const BrowserOSGlanceController&) = delete;
+  BrowserOSGlanceController& operator=(const BrowserOSGlanceController&) =
+      delete;
+  ~BrowserOSGlanceController() override;
+
+  // Shows `url` in the overlay, creating it if needed. Returns false if the
+  // window cannot host an overlay yet (no widget).
+  bool Show(const GURL& url);
+
+  void Close();
+
+  bool IsShowing() const;
+
+  // views::WidgetObserver:
+  void OnWidgetActivationChanged(views::Widget* widget, bool active) override;
+  void OnWidgetDestroying(views::Widget* widget) override;
+
+ private:
+  // Bounds for the overlay in screen coordinates: 70% of the content area,
+  // capped, centred over it.
+  gfx::Rect CalculateOverlayBounds() const;
+  void PromoteToTab(const GURL& url);
+  void DestroyWidget();
+
+  const raw_ptr<BrowserView> browser_view_;
+  std::unique_ptr<views::WidgetDelegate> widget_delegate_;
+  std::unique_ptr<views::Widget> widget_;
+  raw_ptr<BrowserOSGlanceOverlayView> overlay_view_ = nullptr;
+  base::ScopedObservation<views::Widget, views::WidgetObserver>
+      widget_observation_{this};
+  base::WeakPtrFactory<BrowserOSGlanceController> weak_factory_{this};
+};
+
+#endif  // CHROME_BROWSER_UI_VIEWS_BROWSEROS_BROWSEROS_GLANCE_CONTROLLER_H_
