diff --git a/chrome/browser/ui/tab_helpers.h b/chrome/browser/ui/tab_helpers.h
index ec26ac1..8bbdc0f 100644
--- a/chrome/browser/ui/tab_helpers.h
+++ b/chrome/browser/ui/tab_helpers.h
@@ -80,6 +80,11 @@ class TabHelpers {
   // Link Preview shows a preview of a page, then promote it as a new tab.
   friend class PreviewTab;
 
+  // BrowserOS glance floats a page over the window, then promotes it to a new
+  // tab -- the same "preview a page" shape as the entry above, and it needs
+  // the full helper set so an arbitrary page behaves the way it would in a tab.
+  friend class BrowserOSGlanceOverlayView;
+
   // FYI: Do NOT add any more friends here. The functions above are the ONLY
   // ones that need to call AttachTabHelpers; if you think you do, re-read the
   // design document linked above, especially the section "Reusing tab helpers".
