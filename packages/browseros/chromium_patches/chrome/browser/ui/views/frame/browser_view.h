diff --git a/chrome/browser/ui/views/frame/browser_view.h b/chrome/browser/ui/views/frame/browser_view.h
index c6bcc52..922933b 100644
--- a/chrome/browser/ui/views/frame/browser_view.h
+++ b/chrome/browser/ui/views/frame/browser_view.h
@@ -86,6 +86,9 @@ class LocationBarView;
 class MultiContentsView;
 class ProjectsPanelView;
 class ScrimView;
+class BrowserOSCompactModeController;
+class BrowserOSGlanceController;
+class BrowserOSWindowTintController;
 class SidePanel;
 class TabDragTarget;
 class TabSearchBubbleHost;
@@ -343,6 +346,23 @@ class BrowserView : public BrowserWindow,
   // On macOS, it is possible that the top UI is drawn but hidden.
   bool ShouldDrawTabStrip() const;
 
+  // BrowserOS: relayout when browseros.hide_tab_strip changes.
+  void OnBrowserOSHideTabStripChanged();
+
+  // BrowserOS window features. Each is created unconditionally and gated by
+  // its own browseros.* pref, so flipping a pref is enough to turn the
+  // behaviour on or off without a restart. May be null in unit tests that
+  // build a BrowserView without a profile-backed PrefService.
+  BrowserOSWindowTintController* browseros_window_tint_controller() {
+    return browseros_window_tint_controller_.get();
+  }
+  BrowserOSGlanceController* browseros_glance_controller() {
+    return browseros_glance_controller_.get();
+  }
+  BrowserOSCompactModeController* browseros_compact_mode_controller() {
+    return browseros_compact_mode_controller_.get();
+  }
+
   // Returns whether a vertical tabstrip should be shown.
   bool ShouldDrawVerticalTabStrip() const;
 
@@ -1373,6 +1393,14 @@ class BrowserView : public BrowserWindow,
 
   PrefChangeRegistrar registrar_;
 
+  // BrowserOS window features; see the accessors above. Declared after
+  // `registrar_` so they are torn down before it.
+  std::unique_ptr<BrowserOSWindowTintController>
+      browseros_window_tint_controller_;
+  std::unique_ptr<BrowserOSGlanceController> browseros_glance_controller_;
+  std::unique_ptr<BrowserOSCompactModeController>
+      browseros_compact_mode_controller_;
+
   base::CallbackListSubscription vertical_tab_subscription_;
 
   std::unique_ptr<tabs::VerticalTabStripStateController::ScopedEnableStateLock>
