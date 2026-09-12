diff --git a/chrome/browser/ui/views/frame/browser_view.h b/chrome/browser/ui/views/frame/browser_view.h
index c6bcc52..d27849e 100644
--- a/chrome/browser/ui/views/frame/browser_view.h
+++ b/chrome/browser/ui/views/frame/browser_view.h
@@ -343,6 +343,9 @@ class BrowserView : public BrowserWindow,
   // On macOS, it is possible that the top UI is drawn but hidden.
   bool ShouldDrawTabStrip() const;
 
+  // BrowserOS: relayout when browseros.hide_tab_strip changes.
+  void OnBrowserOSHideTabStripChanged();
+
   // Returns whether a vertical tabstrip should be shown.
   bool ShouldDrawVerticalTabStrip() const;
 
