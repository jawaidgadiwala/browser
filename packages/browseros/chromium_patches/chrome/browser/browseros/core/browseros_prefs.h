diff --git a/chrome/browser/browseros/core/browseros_prefs.h b/chrome/browser/browseros/core/browseros_prefs.h
new file mode 100644
index 0000000..b7305c4
--- /dev/null
+++ b/chrome/browser/browseros/core/browseros_prefs.h
@@ -0,0 +1,204 @@
+// Copyright 2025 The Chromium Authors
+// Use of this source code is governed by a BSD-style license that can be
+// found in the LICENSE file.
+
+#ifndef CHROME_BROWSER_BROWSEROS_CORE_BROWSEROS_PREFS_H_
+#define CHROME_BROWSER_BROWSEROS_CORE_BROWSEROS_PREFS_H_
+
+#include <optional>
+#include <string>
+
+#include "components/prefs/pref_service.h"
+#include "third_party/skia/include/core/SkColor.h"
+#include "ui/actions/action_id.h"
+
+namespace user_prefs {
+class PrefRegistrySyncable;
+}  // namespace user_prefs
+
+namespace browseros {
+
+namespace prefs {
+
+// Toolbar visibility prefs
+// Boolean: Show LLM Chat in toolbar (default: true)
+inline constexpr char kShowLLMChat[] = "browseros.show_llm_chat";
+
+// Boolean: Show Assistant in toolbar (default: true)
+inline constexpr char kShowAssistant[] = "browseros.show_assistant";
+
+// Boolean: Show labels on BrowserOS toolbar actions (default: true)
+inline constexpr char kShowToolbarLabels[] = "browseros.show_toolbar_labels";
+
+// Boolean: Enable vertical tabs (default: true)
+inline constexpr char kVerticalTabsEnabled[] =
+    "browseros.vertical_tabs_enabled";
+
+// Boolean: Show saved tab groups in the bookmark bar (default: true, false for
+// BrowserClaw).
+inline constexpr char kShowTabGroupsInBookmarkBar[] =
+    "browseros.show_tab_groups_in_bookmark_bar";
+
+// AI Provider prefs
+// JSON string containing the list of AI providers and configuration
+inline constexpr char kProviders[] = "browseros.providers";
+
+// JSON string containing custom AI providers for BrowserOS
+inline constexpr char kCustomProviders[] = "browseros.custom_providers";
+
+// String containing the default provider ID for BrowserOS
+inline constexpr char kDefaultProviderId[] = "browseros.default_provider_id";
+
+// Boolean: Focus NTP content instead of omnibox on new tab (default: true)
+inline constexpr char kNtpFocusContent[] = "browseros.ntp_focus_content";
+
+inline constexpr char kOnboardingCompleted[] = "browseros.onboarding_completed";
+
+// Boolean: Automation-driven tabs never pull the user's attention. A tab counts
+// as automation-driven while a DevTools client is attached to it, which is
+// every tab the claw-server (or any CDP client) acts on. With the pref on such
+// a tab cannot switch the user's active tab or raise the window, and tabs or
+// popups its pages open land in the background. Gates live in
+// Browser::ActivateContents, Browser::AddNewContents and the DevTools
+// BrowserHandler. Default: true for BrowserClaw, false for BrowserOS.
+inline constexpr char kAutomationNeverStealsFocus[] =
+    "browseros.automation_never_steals_focus";
+
+// Browser product UI prefs. Each defaults to browseros::IsBrowserProduct(),
+// so stock behaviour is one chrome.browserOS.setPref() away.
+
+// Boolean: dock the side panel on the left. Mirrored (inverted) onto the
+// upstream pref ::prefs::kSidePanelHorizontalAlignment. Default: on for the
+// Browser product.
+inline constexpr char kSidePanelLeft[] = "browseros.side_panel_left";
+
+// Boolean: hide the side panel header (title, pin, new-tab, more, close) while
+// a BrowserOS extension panel is shown. The panel is then chrome-less and is
+// closed from the toolbar action or the accelerator. Default: on for the Browser product.
+inline constexpr char kHideSidePanelHeader[] =
+    "browseros.hide_side_panel_header";
+
+// Boolean: do not draw either tab strip (horizontal or vertical). Tab
+// switching is expected to happen from the side panel. Gated at the view
+// layer (BrowserView::ShouldDrawTabStrip) only -- the window still *supports*
+// a tab strip, so tab dragging, session restore and chrome.tabs are
+// unaffected. Default: on for the Browser product.
+inline constexpr char kHideTabStrip[] = "browseros.hide_tab_strip";
+
+// String: per-profile window tint as "#RRGGBB" (a leading "#" is optional).
+// Applied through views::Widget::SetUserColorOverride(), so Chromium
+// regenerates the window's ColorProvider and the frame, toolbar, omnibox,
+// bubbles and side panel all recolour together. Empty (the default) means
+// stock theme colours. The extension sets this per space; a single window can
+// be tinted independently with chrome.browserOS.setWindowTint().
+inline constexpr char kWindowTint[] = "browseros.window_tint";
+
+// Boolean: compact mode. The toolbar (and, while it is hidden, the side panel)
+// is dropped from the browser window layout and comes back while the cursor is
+// within a few pixels of the window's top or left edge, retracting a short
+// while after the cursor leaves. Default: off even for the Browser product --
+// this is the most invasive of the window features and stays opt-in until it
+// has had real use.
+inline constexpr char kCompactMode[] = "browseros.compact_mode";
+
+// Boolean: glance. Gates chrome.browserOS.openGlance(), which floats a URL in
+// a centred overlay over the active window instead of opening a tab.
+// Default: on for the Browser product.
+inline constexpr char kGlance[] = "browseros.glance";
+
+}  // namespace prefs
+
+// Registers BrowserOS profile preferences.
+void RegisterProfilePrefs(user_prefs::PrefRegistrySyncable* registry);
+
+// Check if LLM Chat should be shown in toolbar.
+bool ShouldShowLLMChat(PrefService* pref_service);
+
+// Check if Assistant should be shown in toolbar.
+bool ShouldShowAssistant(PrefService* pref_service);
+
+// Check if toolbar labels should be shown for BrowserOS actions.
+bool ShouldShowToolbarLabels(PrefService* pref_service);
+
+// Check if vertical tabs should be enabled.
+bool IsVerticalTabsEnabled(PrefService* pref_service);
+
+// Check if saved tab groups should be shown in the bookmark bar.
+bool ShouldShowTabGroupsInBookmarkBar(PrefService* pref_service);
+
+// Syncs the BrowserOS vertical tabs pref to the upstream Chrome pref.
+// Call this early (e.g. during controller init) so the upstream pref
+// reflects BrowserOS's default.
+void SyncVerticalTabsPref(PrefService* pref_service);
+
+// Applies the BrowserOS saved tab groups bookmark bar pref to the upstream
+// Chrome pref.
+void ApplyShowTabGroupsInBookmarkBarPref(PrefService* pref_service);
+
+// Syncs the BrowserOS saved tab groups bookmark bar pref to the upstream Chrome
+// pref only while the upstream pref is still at its default value.
+void SyncShowTabGroupsInBookmarkBarPref(PrefService* pref_service);
+
+// Check if the side panel should be docked on the left.
+bool IsSidePanelLeft(PrefService* pref_service);
+
+// Applies the BrowserOS left-dock pref onto the upstream side panel alignment
+// pref (unconditional write; use as a PrefChangeRegistrar callback).
+void ApplySidePanelLeftPref(PrefService* pref_service);
+
+// Seeds the upstream side panel alignment pref from the BrowserOS pref only
+// while the upstream pref is still at its default value, so a user who moved
+// the panel themselves keeps their choice.
+void SyncSidePanelLeftPref(PrefService* pref_service);
+
+// Check if the side panel header should be hidden. Callers additionally
+// verify the shown entry belongs to an active BrowserOS extension.
+bool ShouldHideSidePanelHeader(PrefService* pref_service);
+
+// Check if both tab strips should be hidden.
+bool ShouldHideTabStrip(PrefService* pref_service);
+
+// Parses browseros.window_tint. Returns std::nullopt when the pref is empty or
+// is not a "#RRGGBB" / "RRGGBB" string, which means "use the stock theme".
+std::optional<SkColor> GetWindowTint(PrefService* pref_service);
+
+// Parses an arbitrary "#RRGGBB" / "RRGGBB" string the same way. An empty or
+// whitespace-only string yields std::nullopt (clear the tint); anything else
+// that does not parse also yields std::nullopt, so callers that must tell
+// "clear" from "malformed" should check the string themselves.
+std::optional<SkColor> ParseTintColor(std::string_view value);
+
+// Check if compact mode is on.
+bool IsCompactModeEnabled(PrefService* pref_service);
+
+// Check if the glance overlay is available.
+bool IsGlanceEnabled(PrefService* pref_service);
+
+// Sets the default BrowserOS theme (blue tonal spot) on first run
+// when the user hasn't customized the theme yet.
+void SyncDefaultTheme(PrefService* pref_service);
+
+// Check if a toolbar action should be shown based on its visibility pref.
+// Returns true if:
+//   - Action has no visibility pref
+//   - Action's visibility pref is true
+// Returns false if action's visibility pref is false.
+bool ShouldShowToolbarAction(actions::ActionId id, PrefService* pref_service);
+
+// Check if a BrowserOS extension should be pinned from its catalog metadata.
+bool ShouldPinBrowserOSExtension(const std::string& extension_id,
+                                 PrefService* pref_service);
+
+// Check if NTP content should receive focus instead of the omnibox.
+bool IsNtpFocusContentEnabled(PrefService* pref_service);
+
+// Check if automation-driven tabs must never steal focus. Callers decide per
+// tab by combining this with content::DevToolsAgentHost::IsDebuggerAttached().
+bool AutomationNeverStealsFocus(PrefService* pref_service);
+
+// Get the visibility pref key for an action, or nullptr if none exists.
+const char* GetVisibilityPrefForAction(actions::ActionId id);
+
+}  // namespace browseros
+
+#endif  // CHROME_BROWSER_BROWSEROS_CORE_BROWSEROS_PREFS_H_
