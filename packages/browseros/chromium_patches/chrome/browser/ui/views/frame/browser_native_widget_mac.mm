diff --git a/chrome/browser/ui/views/frame/browser_native_widget_mac.mm b/chrome/browser/ui/views/frame/browser_native_widget_mac.mm
index 46037e7..ff9005d 100644
--- a/chrome/browser/ui/views/frame/browser_native_widget_mac.mm
+++ b/chrome/browser/ui/views/frame/browser_native_widget_mac.mm
@@ -13,9 +13,11 @@
 #include "chrome/browser/app_controller_mac.h"
 #include "chrome/browser/apps/app_shim/app_shim_host_mac.h"
 #include "chrome/browser/apps/app_shim/app_shim_manager_mac.h"
+#include "chrome/browser/browseros/core/browseros_prefs.h"
 #include "chrome/browser/browsing_data/browsing_data_important_sites_util.h"
 #include "chrome/browser/global_keyboard_shortcuts_mac.h"
 #include "chrome/browser/media/router/media_router_feature.h"
+#include "chrome/browser/profiles/profile.h"
 #include "chrome/browser/ui/actions/chrome_action_id.h"
 #include "chrome/browser/ui/actions/chrome_action_properties.h"
 #include "chrome/browser/ui/browser_actions.h"
@@ -195,7 +197,14 @@ void BrowserNativeWidgetMac::GetWindowFrameTitlebarHeight(
         std::max(top_element_info.tabstrip_preferred_height,
                  top_element_info.toolbar_minimum_height) +
         browser_view_->browser_widget()->GetFrameView()->GetTopInset(true);
-    if (!browser_view_->ShouldDrawTabStrip()) {
+    // BrowserOS: the extra web app menu margin belongs to windows whose top
+    // row is the web app frame toolbar. A Browser window with
+    // browseros.hide_tab_strip set has no tab strip either, but its top row is
+    // the ordinary toolbar, already reported as `toolbar_minimum_height`, so
+    // adding the margin here would push the traffic lights below it.
+    if (!browser_view_->ShouldDrawTabStrip() &&
+        !browseros::ShouldHideTabStrip(
+            browser_view_->GetProfile()->GetPrefs())) {
       *titlebar_height += kWebAppMenuMargin * 2;
     }
   } else {
