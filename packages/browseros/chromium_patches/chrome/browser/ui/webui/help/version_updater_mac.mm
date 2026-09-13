diff --git a/chrome/browser/ui/webui/help/version_updater_mac.mm b/chrome/browser/ui/webui/help/version_updater_mac.mm
index 57648956faf5058fada6b02abd3301deebb5a295..c0e4f6aa2bf4f14ef2df49c692e3601b77054efb 100644
--- a/chrome/browser/ui/webui/help/version_updater_mac.mm
+++ b/chrome/browser/ui/webui/help/version_updater_mac.mm
@@ -6,6 +6,15 @@
 
 #import <Foundation/Foundation.h>
 
+// Include Sparkle updater if available
+#include "base/command_line.h"
+#include "chrome/browser/buildflags.h"
+
+#if BUILDFLAG(ENABLE_SPARKLE)
+#include "chrome/browser/ui/webui/help/sparkle_version_updater_mac.h"
+#include "chrome/browser/mac/sparkle_glue.h"
+#endif
+
 #include <algorithm>
 #include <memory>
 #include <string>
@@ -76,6 +85,8 @@ void UpdateStatus(VersionUpdater::StatusCallback status_callback,
                    : VersionUpdater::Status::UPDATED;
       break;
     case updater::UpdateService::UpdateState::State::kUpdateError:
+      // Log only errors
+      VLOG(1) << "Update error, code: " << update_state.error_code;
       switch (update_state.error_code) {
         case updater::GOOPDATE_E_APP_UPDATE_DISABLED_BY_POLICY:
           status = VersionUpdater::Status::DISABLED_BY_ADMIN;
@@ -133,5 +144,21 @@ void CheckForUpdate(StatusCallback status_callback,
 
 std::unique_ptr<VersionUpdater> VersionUpdater::Create(
     content::WebContents* /* web_contents */) {
+#if BUILDFLAG(ENABLE_SPARKLE)
+  // Sparkle owns updates on macOS for this product, so the About page gets a
+  // SparkleVersionUpdater even when SparkleGlue never came up (no appcast
+  // configured, --disable-updates, read-only mount). It reports DISABLED in
+  // that case and settings/about hides the update row entirely. Keying this
+  // on sparkle_glue::SparkleEnabled() instead would fall through to
+  // VersionUpdaterMac, i.e. Chromium's own (Omaha) updater, which this
+  // product never installs: it answers kUpdateError with error_code 0, which
+  // the About page renders as "An error occurred while checking for updates:
+  // 0 (error code 0)".
+  if (!base::CommandLine::ForCurrentProcess()->HasSwitch(
+          "browseros-use-chromium-updater")) {
+    return base::WrapUnique(new SparkleVersionUpdater());
+  }
+#endif
+
   return base::WrapUnique(new VersionUpdaterMac());
 }
