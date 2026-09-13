diff --git a/chrome/browser/ui/views/browseros/browseros_compact_mode_controller.cc b/chrome/browser/ui/views/browseros/browseros_compact_mode_controller.cc
new file mode 100644
index 0000000..393b5d5
--- /dev/null
+++ b/chrome/browser/ui/views/browseros/browseros_compact_mode_controller.cc
@@ -0,0 +1,200 @@
+// Copyright 2025 The Chromium Authors
+// Use of this source code is governed by a BSD-style license that can be
+// found in the LICENSE file.
+
+#include "chrome/browser/ui/views/browseros/browseros_compact_mode_controller.h"
+
+#include <utility>
+
+#include "base/functional/bind.h"
+#include "base/location.h"
+#include "base/time/time.h"
+#include "chrome/browser/browseros/core/browseros_prefs.h"
+#include "chrome/browser/profiles/profile.h"
+#include "chrome/browser/ui/views/frame/browser_view.h"
+#include "chrome/browser/ui/views/frame/top_container_view.h"
+#include "chrome/browser/ui/views/side_panel/side_panel.h"
+#include "ui/events/event.h"
+#include "ui/events/types/event_type.h"
+#include "ui/gfx/geometry/point.h"
+#include "ui/gfx/geometry/rect.h"
+#include "ui/views/event_monitor.h"
+#include "ui/views/view.h"
+#include "ui/views/widget/widget.h"
+
+namespace {
+
+// How close to the window's top or left edge the cursor has to get before the
+// window chrome comes back.
+constexpr int kRevealEdgeInsetDip = 4;
+
+// How long the chrome lingers after the cursor leaves it, so that crossing a
+// gap on the way to a toolbar button does not retract it.
+constexpr base::TimeDelta kRetractDelay = base::Milliseconds(250);
+
+}  // namespace
+
+BrowserOSCompactModeController::BrowserOSCompactModeController(
+    BrowserView* browser_view)
+    : browser_view_(browser_view) {
+  pref_registrar_.Init(browser_view_->GetProfile()->GetPrefs());
+  pref_registrar_.Add(
+      browseros::prefs::kCompactMode,
+      base::BindRepeating(&BrowserOSCompactModeController::OnPrefChanged,
+                          base::Unretained(this)));
+  enabled_ =
+      browseros::IsCompactModeEnabled(browser_view_->GetProfile()->GetPrefs());
+}
+
+BrowserOSCompactModeController::~BrowserOSCompactModeController() {
+  // The controller lives exactly as long as its BrowserView, so by here the
+  // window is going away: drop the monitor and the timer and touch no views,
+  // which may already be unlinked.
+  StopWatching();
+}
+
+bool BrowserOSCompactModeController::ShouldHideTopChrome() const {
+  return enabled_ && !revealed_;
+}
+
+void BrowserOSCompactModeController::OnBrowserViewRemovedFromWidget() {
+  StopWatching();
+}
+
+void BrowserOSCompactModeController::OnBrowserViewAddedToWidget() {
+  if (enabled_) {
+    StartWatching();
+  }
+  ApplyWindowState();
+}
+
+void BrowserOSCompactModeController::OnEvent(const ui::Event& event) {
+  if (event.type() != ui::EventType::kMouseMoved &&
+      event.type() != ui::EventType::kMouseDragged &&
+      event.type() != ui::EventType::kMouseEntered) {
+    return;
+  }
+  if (!event_monitor_) {
+    return;
+  }
+  // GetLastMouseLocation() is documented to be in screen coordinates on every
+  // platform; the located event's own coordinates are not.
+  UpdateFromCursor(event_monitor_->GetLastMouseLocation());
+}
+
+void BrowserOSCompactModeController::OnPrefChanged() {
+  const bool enabled =
+      browseros::IsCompactModeEnabled(browser_view_->GetProfile()->GetPrefs());
+  if (enabled == enabled_) {
+    return;
+  }
+  enabled_ = enabled;
+  retract_timer_.Stop();
+  revealed_ = false;
+  if (enabled_) {
+    StartWatching();
+  } else {
+    StopWatching();
+  }
+  ApplyWindowState();
+}
+
+void BrowserOSCompactModeController::SetRevealed(bool revealed) {
+  if (revealed == revealed_) {
+    return;
+  }
+  revealed_ = revealed;
+  ApplyWindowState();
+}
+
+void BrowserOSCompactModeController::UpdateFromCursor(
+    const gfx::Point& screen_point) {
+  if (!enabled_) {
+    return;
+  }
+
+  const gfx::Rect window = browser_view_->GetBoundsInScreen();
+  if (!window.Contains(screen_point)) {
+    // The cursor left the window entirely. Retract, but on the same timer, so
+    // that a quick pass over another window does not flash the chrome away.
+    if (revealed_) {
+      retract_timer_.Start(
+          FROM_HERE, kRetractDelay,
+          base::BindOnce(&BrowserOSCompactModeController::SetRevealed,
+                         base::Unretained(this), false));
+    }
+    return;
+  }
+
+  const bool at_top_edge =
+      screen_point.y() - window.y() <= kRevealEdgeInsetDip;
+  const bool at_left_edge =
+      screen_point.x() - window.x() <= kRevealEdgeInsetDip;
+
+  if (!revealed_) {
+    if (at_top_edge || at_left_edge) {
+      retract_timer_.Stop();
+      SetRevealed(true);
+    }
+    return;
+  }
+
+  // Already revealed: stay revealed while the cursor is over the chrome that
+  // the reveal brought back, or still on one of the trigger edges.
+  bool over_chrome = at_top_edge || at_left_edge;
+  if (!over_chrome && browser_view_->top_container()) {
+    over_chrome =
+        browser_view_->top_container()->GetBoundsInScreen().Contains(
+            screen_point);
+  }
+  if (!over_chrome) {
+    if (SidePanel* panel = browser_view_->side_panel();
+        panel && panel->GetVisible()) {
+      over_chrome = panel->GetBoundsInScreen().Contains(screen_point);
+    }
+  }
+
+  if (over_chrome) {
+    retract_timer_.Stop();
+  } else if (!retract_timer_.IsRunning()) {
+    retract_timer_.Start(
+        FROM_HERE, kRetractDelay,
+        base::BindOnce(&BrowserOSCompactModeController::SetRevealed,
+                       base::Unretained(this), false));
+  }
+}
+
+void BrowserOSCompactModeController::ApplyWindowState() {
+  SidePanel* panel = browser_view_->side_panel();
+  if (panel) {
+    if (ShouldHideTopChrome()) {
+      if (panel->GetVisible()) {
+        side_panel_hidden_by_compact_ = true;
+        panel->SetVisible(false);
+      }
+    } else if (side_panel_hidden_by_compact_) {
+      side_panel_hidden_by_compact_ = false;
+      panel->SetVisible(true);
+    }
+  }
+  browser_view_->InvalidateLayout();
+}
+
+void BrowserOSCompactModeController::StartWatching() {
+  if (event_monitor_) {
+    return;
+  }
+  views::Widget* widget = browser_view_->GetWidget();
+  if (!widget) {
+    return;
+  }
+  event_monitor_ = views::EventMonitor::CreateWindowMonitor(
+      this, widget->GetNativeWindow(),
+      {ui::EventType::kMouseMoved, ui::EventType::kMouseDragged,
+       ui::EventType::kMouseEntered});
+}
+
+void BrowserOSCompactModeController::StopWatching() {
+  event_monitor_.reset();
+  retract_timer_.Stop();
+}
