diff --git a/chrome/browser/ui/views/browseros/browseros_compact_mode_controller.h b/chrome/browser/ui/views/browseros/browseros_compact_mode_controller.h
new file mode 100644
index 0000000..b7708a7
--- /dev/null
+++ b/chrome/browser/ui/views/browseros/browseros_compact_mode_controller.h
@@ -0,0 +1,92 @@
+// Copyright 2025 The Chromium Authors
+// Use of this source code is governed by a BSD-style license that can be
+// found in the LICENSE file.
+
+#ifndef CHROME_BROWSER_UI_VIEWS_BROWSEROS_BROWSEROS_COMPACT_MODE_CONTROLLER_H_
+#define CHROME_BROWSER_UI_VIEWS_BROWSEROS_BROWSEROS_COMPACT_MODE_CONTROLLER_H_
+
+#include <memory>
+
+#include "base/memory/raw_ptr.h"
+#include "base/timer/timer.h"
+#include "components/prefs/pref_change_registrar.h"
+#include "ui/events/event_observer.h"
+
+namespace gfx {
+class Point;
+}  // namespace gfx
+
+namespace views {
+class EventMonitor;
+}  // namespace views
+
+class BrowserView;
+
+// Compact mode for one browser window.
+//
+// While browseros.compact_mode is on and the window is not revealed, the
+// toolbar is dropped from the window layout (BrowserView::IsToolbarVisible()
+// returns false, which is the single choke point every BrowserViewLayout impl
+// consults) and the side panel is hidden, so the web contents owns the whole
+// window. Moving the cursor to within a few pixels of the window's top or left
+// edge reveals both again; moving away retracts them after a short linger.
+//
+// Deliberate limitation for this batch: revealing re-runs the window layout,
+// so the contents shrink rather than being covered. A true z-order overlay
+// needs the top container to be reparented out of BrowserView (the mechanism
+// immersive fullscreen uses) and is not attempted here -- see
+// docs/personal/native-patches-batch2.md.
+//
+// Mouse tracking uses views::EventMonitor on the browser widget rather than a
+// sibling hit-strip view: a views::View next to a layer-backed WebView does not
+// reliably see mouse moves that land on the web contents, and the monitor sees
+// events before they are routed anywhere.
+class BrowserOSCompactModeController : public ui::EventObserver {
+ public:
+  explicit BrowserOSCompactModeController(BrowserView* browser_view);
+  BrowserOSCompactModeController(const BrowserOSCompactModeController&) =
+      delete;
+  BrowserOSCompactModeController& operator=(
+      const BrowserOSCompactModeController&) = delete;
+  ~BrowserOSCompactModeController() override;
+
+  // True while the toolbar must be left out of the layout. Called from
+  // BrowserView::IsToolbarVisible(), so it must stay cheap and must not
+  // itself trigger a layout.
+  bool ShouldHideTopChrome() const;
+
+  bool is_revealed_for_testing() const { return revealed_; }
+
+  // Starts watching the mouse and applies the current pref. Called from
+  // BrowserView::AddedToWidget(), once there is a widget to watch.
+  void OnBrowserViewAddedToWidget();
+
+  // Drops the mouse monitor. Called from BrowserView::RemovedFromWidget(), so
+  // the monitor never outlives the window it watches.
+  void OnBrowserViewRemovedFromWidget();
+
+  // ui::EventObserver:
+  void OnEvent(const ui::Event& event) override;
+
+ private:
+  void OnPrefChanged();
+  void SetRevealed(bool revealed);
+  // Recomputes the reveal state from a cursor position in screen coordinates.
+  void UpdateFromCursor(const gfx::Point& screen_point);
+  // Applies side panel visibility for the current state and relayouts.
+  void ApplyWindowState();
+  void StartWatching();
+  void StopWatching();
+
+  const raw_ptr<BrowserView> browser_view_;
+  std::unique_ptr<views::EventMonitor> event_monitor_;
+  base::OneShotTimer retract_timer_;
+  bool enabled_ = false;
+  bool revealed_ = false;
+  // True while this controller, rather than the side panel coordinator, is the
+  // reason the side panel is hidden -- so only a panel we hid is put back.
+  bool side_panel_hidden_by_compact_ = false;
+  PrefChangeRegistrar pref_registrar_;
+};
+
+#endif  // CHROME_BROWSER_UI_VIEWS_BROWSEROS_BROWSEROS_COMPACT_MODE_CONTROLLER_H_
