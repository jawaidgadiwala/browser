diff --git a/chrome/browser/ui/views/frame/browser_view.cc b/chrome/browser/ui/views/frame/browser_view.cc
index 4a2d263..f7d6aae 100644
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
@@ -133,6 +134,9 @@
 #include "chrome/browser/ui/views/accessibility/caret_browsing_dialog_delegate.h"
 #include "chrome/browser/ui/views/autofill/autofill_bubble_handler_impl.h"
 #include "chrome/browser/ui/views/bookmarks/bookmark_bar_view.h"
+#include "chrome/browser/ui/views/browseros/browseros_compact_mode_controller.h"
+#include "chrome/browser/ui/views/browseros/browseros_glance_controller.h"
+#include "chrome/browser/ui/views/browseros/browseros_window_tint_controller.h"
 #include "chrome/browser/ui/views/bookmarks/bookmark_bubble_view.h"
 #include "chrome/browser/ui/views/bookmarks/bookmark_page_action_controller.h"
 #include "chrome/browser/ui/views/bubble_anchor_util_views.h"
@@ -1057,6 +1061,21 @@ BrowserView::BrowserView(Browser* browser)
       prefs::kFullscreenAllowed,
       base::BindRepeating(&BrowserView::UpdateFullscreenAllowedFromPolicy,
                           base::Unretained(this), CanFullscreen()));
+  // BrowserOS: make browseros.hide_tab_strip live, so toggling the pref
+  // relays the window instead of needing a restart.
+  registrar_.Add(browseros::prefs::kHideTabStrip,
+                 base::BindRepeating(&BrowserView::OnBrowserOSHideTabStripChanged,
+                                     base::Unretained(this)));
+  // BrowserOS window features. Constructing them here (rather than from
+  // BrowserWindowFeatures, whose BrowserView-dependent phase is explicitly
+  // closed to new code) keeps the whole batch inside files this product
+  // already patches. Each one is inert until its own browseros.* pref is on.
+  browseros_window_tint_controller_ =
+      std::make_unique<BrowserOSWindowTintController>(this);
+  browseros_glance_controller_ =
+      std::make_unique<BrowserOSGlanceController>(this);
+  browseros_compact_mode_controller_ =
+      std::make_unique<BrowserOSCompactModeController>(this);
   UpdateFullscreenAllowedFromPolicy(CanFullscreen());
 
   WebUIContentsPreloadManager::GetInstance()->WarmupForBrowser(browser_.get());
@@ -1242,7 +1261,16 @@ ClientFrameElementInfo BrowserView::GetFrameElementInfo() const {
                 ->GetPreferredSize()
                 .height()
           : 0;
-  if (toolbar_ && ShouldDrawVerticalTabStrip()) {
+  // BrowserOS: with the tab strip hidden the toolbar becomes the top row of
+  // the window, exactly as it is when the tab strip is vertical. Reporting the
+  // toolbar height on that path too is what makes the frame reserve a
+  // toolbar-sized top area instead of a zero-height one -- on macOS this is
+  // the value BrowserNativeWidgetMac::GetWindowFrameTitlebarHeight() uses for
+  // the NSWindow titlebar the traffic lights are centred in.
+  const bool toolbar_is_top_row =
+      ShouldDrawVerticalTabStrip() ||
+      browseros::ShouldHideTabStrip(GetProfile()->GetPrefs());
+  if (toolbar_ && toolbar_is_top_row) {
     info.toolbar_minimum_height = toolbar_->GetMinimumSize().height();
   } else if (web_app_frame_toolbar_ && ShouldDrawWebAppFrameToolbar()) {
     info.toolbar_minimum_height =
@@ -1377,7 +1405,21 @@ bool BrowserView::ShouldDrawTabStrokes() const {
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
@@ -2956,6 +2998,14 @@ void BrowserView::DisableTabStripEditingForTesting() {
 }
 
 bool BrowserView::IsToolbarVisible() const {
+  // BrowserOS: compact mode drops the toolbar out of the window layout until
+  // the cursor reaches the window edge. Every BrowserViewLayout implementation
+  // consults this one method, so this is the whole gate.
+  if (browseros_compact_mode_controller_ &&
+      browseros_compact_mode_controller_->ShouldHideTopChrome()) {
+    return false;
+  }
+
 #if BUILDFLAG(IS_MAC)
   // Immersive full screen makes it possible to display the toolbar when
   // kShowFullscreenToolbar is not set.
@@ -4993,10 +5043,26 @@ void BrowserView::AddedToWidget() {
   dialog_anchor_ = std::make_unique<views::ViewSubregionAnchor>(
       kBrowserDialogAnchorElementId, *this);
 
+  // BrowserOS: the window features need a widget -- for the color provider
+  // override and for the mouse monitor -- so they are wired up here rather
+  // than in the constructor.
+  if (browseros_window_tint_controller_) {
+    browseros_window_tint_controller_->Apply();
+  }
+  if (browseros_compact_mode_controller_) {
+    browseros_compact_mode_controller_->OnBrowserViewAddedToWidget();
+  }
+
   initialized_ = true;
 }
 
 void BrowserView::RemovedFromWidget() {
+  // BrowserOS: the compact-mode mouse monitor must not outlive the window it
+  // watches.
+  if (browseros_compact_mode_controller_) {
+    browseros_compact_mode_controller_->OnBrowserViewRemovedFromWidget();
+  }
+
   CHECK(GetFocusManager());
 #if BUILDFLAG(IS_WIN)
   pip_exclusion_observer_.reset();
