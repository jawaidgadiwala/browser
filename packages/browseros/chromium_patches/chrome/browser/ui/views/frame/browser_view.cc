diff --git a/chrome/browser/ui/views/frame/browser_view.cc b/chrome/browser/ui/views/frame/browser_view.cc
index 4a2d263..f75e04c 100644
--- a/chrome/browser/ui/views/frame/browser_view.cc
+++ b/chrome/browser/ui/views/frame/browser_view.cc
@@ -43,6 +43,7 @@
 #include "chrome/browser/app_mode/app_mode_utils.h"
 #include "chrome/browser/ash/boca/on_task/on_task_locked_controller.h"
 #include "chrome/browser/browser_process.h"
+#include "chrome/browser/browseros/core/browseros_prefs.h"
 #include "chrome/browser/browsing_data/browsing_data_important_sites_util.h"
 #include "chrome/browser/desktop_to_mobile_promos/promos_utils.h"
 #include "chrome/browser/devtools/devtools_ui_controller.h"
@@ -1057,6 +1058,11 @@ BrowserView::BrowserView(Browser* browser)
       prefs::kFullscreenAllowed,
       base::BindRepeating(&BrowserView::UpdateFullscreenAllowedFromPolicy,
                           base::Unretained(this), CanFullscreen()));
+  // BrowserOS: make browseros.hide_tab_strip live, so toggling the pref
+  // relays the window instead of needing a restart.
+  registrar_.Add(browseros::prefs::kHideTabStrip,
+                 base::BindRepeating(&BrowserView::OnBrowserOSHideTabStripChanged,
+                                     base::Unretained(this)));
   UpdateFullscreenAllowedFromPolicy(CanFullscreen());
 
   WebUIContentsPreloadManager::GetInstance()->WarmupForBrowser(browser_.get());
@@ -1377,7 +1383,21 @@ bool BrowserView::ShouldDrawTabStrokes() const {
 #endif  // !BUILDFLAG(IS_CHROMEOS)
 }
 
+void BrowserView::OnBrowserOSHideTabStripChanged() {
+  ToolbarSizeChanged(/*is_animating=*/false);
+  InvalidateLayout();
+}
+
 bool BrowserView::ShouldDrawTabStrip() const {
+  // BrowserOS: Browser hides both tab strips and drives tab
+  // switching from the side panel. Gating here -- the single choke point for
+  // the horizontal and the vertical strip -- rather than at
+  // Browser::SupportsWindowFeature keeps tab dragging, session restore and
+  // chrome.tabs behaviour untouched.
+  if (browseros::ShouldHideTabStrip(GetProfile()->GetPrefs())) {
+    return false;
+  }
+
   // Return false if this window does not normally display a tabstrip or if the
   // tabstrip is currently hidden, e.g. because we're in fullscreen.
   if (!browser_->SupportsWindowFeature(
