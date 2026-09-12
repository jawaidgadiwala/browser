diff --git a/chrome/browser/ui/views/side_panel/side_panel_coordinator.cc b/chrome/browser/ui/views/side_panel/side_panel_coordinator.cc
index 7898391..5081383 100644
--- a/chrome/browser/ui/views/side_panel/side_panel_coordinator.cc
+++ b/chrome/browser/ui/views/side_panel/side_panel_coordinator.cc
@@ -12,6 +12,8 @@
 #include "base/functional/bind.h"
 #include "base/functional/callback.h"
 #include "base/time/time.h"
+#include "chrome/browser/browseros/core/browseros_constants.h"
+#include "chrome/browser/browseros/core/browseros_prefs.h"
 #include "chrome/browser/profiles/profile.h"
 #include "chrome/browser/ui/browser.h"
 #include "chrome/browser/ui/browser_element_identifiers.h"
@@ -264,7 +266,20 @@ void SidePanelCoordinator::PopulateSidePanel(
 
   side_panel->UpdateHorizontalAlignment(entry->key().id());
 
-  if (entry->should_show_header()) {
+  // BrowserOS: the extension panels render their own chrome, so Browser
+  // drops the native header for them (browseros.hide_side_panel_header).
+  // The header is a separate view painted over the border and is not part of
+  // the content layout, and the resize handle is a sibling view, so removing
+  // it leaves resizing intact.
+  const SidePanelEntryKey& browseros_key = entry->key();
+  const bool browseros_hide_header =
+      browseros::ShouldHideSidePanelHeader(
+          browser_->GetProfile()->GetPrefs()) &&
+      browseros_key.id() == SidePanelEntryId::kExtension &&
+      browseros_key.extension_id().has_value() &&
+      browseros::IsActiveBrowserOSExtension(*browseros_key.extension_id());
+
+  if (entry->should_show_header() && !browseros_hide_header) {
     side_panel->AddHeaderView(std::make_unique<SidePanelHeader>(
         std::make_unique<SidePanelHeaderController>(
             &*browser_, side_panel_toolbar_pinning_controller_.get(), entry)));
@@ -335,9 +350,8 @@ void SidePanelCoordinator::PopulateSidePanel(
   entry->OnEntryShown();
   if (previous_entry) {
     previous_entry->OnEntryHidden();
-  } else {
-    content->RequestFocus();
   }
+  content->RequestFocus();
 
   side_panel->UpdateWidthOnEntryChanged();
 
