diff --git a/chrome/browser/ui/views/browseros/browseros_glance_overlay_view.h b/chrome/browser/ui/views/browseros/browseros_glance_overlay_view.h
new file mode 100644
index 0000000..b46e699
--- /dev/null
+++ b/chrome/browser/ui/views/browseros/browseros_glance_overlay_view.h
@@ -0,0 +1,85 @@
+// Copyright 2025 The Chromium Authors
+// Use of this source code is governed by a BSD-style license that can be
+// found in the LICENSE file.
+
+#ifndef CHROME_BROWSER_UI_VIEWS_BROWSEROS_BROWSEROS_GLANCE_OVERLAY_VIEW_H_
+#define CHROME_BROWSER_UI_VIEWS_BROWSEROS_BROWSEROS_GLANCE_OVERLAY_VIEW_H_
+
+#include <memory>
+
+#include "base/functional/callback.h"
+#include "base/memory/raw_ptr.h"
+#include "ui/base/accelerators/accelerator.h"
+#include "ui/base/metadata/metadata_header_macros.h"
+#include "ui/views/view.h"
+#include "url/gurl.h"
+
+class Profile;
+
+namespace content {
+class WebContents;
+}  // namespace content
+
+namespace views {
+class FocusManager;
+class Label;
+class WebView;
+}  // namespace views
+
+// Contents view of the glance overlay: a one-row header ("Open in tab" /
+// "Close") above a views::WebView showing an ordinary WebContents.
+//
+// The WebContents is created here and owned here, and gets the full set of tab
+// helpers so that an arbitrary page behaves the way it would in a tab (zoom,
+// permission prompts, infobars, autofill). That is why this class is on the
+// TabHelpers friend list, next to the other "preview a page, then promote it"
+// callers.
+//
+// Escape is registered on the widget's FocusManager at high priority, so it
+// closes the overlay even while the web contents has focus.
+class BrowserOSGlanceOverlayView : public views::View {
+  METADATA_HEADER(BrowserOSGlanceOverlayView, views::View)
+
+ public:
+  BrowserOSGlanceOverlayView(
+      Profile* profile,
+      base::RepeatingClosure close_callback,
+      base::RepeatingCallback<void(const GURL&)> promote_callback);
+  BrowserOSGlanceOverlayView(const BrowserOSGlanceOverlayView&) = delete;
+  BrowserOSGlanceOverlayView& operator=(const BrowserOSGlanceOverlayView&) =
+      delete;
+  ~BrowserOSGlanceOverlayView() override;
+
+  void Navigate(const GURL& url);
+
+  // The URL the overlay is showing right now, which is what "Open in tab"
+  // promotes. Falls back to the URL it was asked to show if nothing has
+  // committed yet.
+  GURL GetVisibleURL() const;
+
+  // ui::AcceleratorTarget:
+  bool AcceleratorPressed(const ui::Accelerator& accelerator) override;
+  bool CanHandleAccelerators() const override;
+
+ protected:
+  // views::View:
+  void AddedToWidget() override;
+  void RemovedFromWidget() override;
+
+ private:
+  void OnPromotePressed();
+  void OnClosePressed();
+
+  GURL requested_url_;
+  std::unique_ptr<content::WebContents> web_contents_;
+  raw_ptr<views::WebView> web_view_ = nullptr;
+  raw_ptr<views::Label> url_label_ = nullptr;
+  base::RepeatingClosure close_callback_;
+  base::RepeatingCallback<void(const GURL&)> promote_callback_;
+  const ui::Accelerator escape_accelerator_;
+  // The focus manager the Escape accelerator is registered with, so it can
+  // be unregistered even once GetFocusManager() no longer finds it.
+  raw_ptr<views::FocusManager> accelerator_focus_manager_ = nullptr;
+};
+
+#endif  // CHROME_BROWSER_UI_VIEWS_BROWSEROS_BROWSEROS_GLANCE_OVERLAY_VIEW_H_
