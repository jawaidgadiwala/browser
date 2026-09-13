diff --git a/chrome/browser/ui/views/browseros/browseros_glance_overlay_view.cc b/chrome/browser/ui/views/browseros/browseros_glance_overlay_view.cc
new file mode 100644
index 0000000..408b92f
--- /dev/null
+++ b/chrome/browser/ui/views/browseros/browseros_glance_overlay_view.cc
@@ -0,0 +1,155 @@
+// Copyright 2025 The Chromium Authors
+// Use of this source code is governed by a BSD-style license that can be
+// found in the LICENSE file.
+
+#include "chrome/browser/ui/views/browseros/browseros_glance_overlay_view.h"
+
+#include <memory>
+#include <utility>
+
+#include "base/functional/bind.h"
+#include "base/strings/utf_string_conversions.h"
+#include "chrome/browser/profiles/profile.h"
+#include "chrome/browser/ui/tab_helpers.h"
+#include "content/public/browser/navigation_controller.h"
+#include "content/public/browser/web_contents.h"
+#include "ui/base/accelerators/accelerator_manager.h"
+#include "ui/base/metadata/metadata_impl_macros.h"
+#include "ui/base/page_transition_types.h"
+#include "ui/color/color_id.h"
+#include "ui/events/event_constants.h"
+#include "ui/events/keycodes/keyboard_codes.h"
+#include "ui/gfx/geometry/insets.h"
+#include "ui/views/background.h"
+#include "ui/views/controls/button/md_text_button.h"
+#include "ui/views/controls/label.h"
+#include "ui/views/controls/webview/webview.h"
+#include "ui/views/focus/focus_manager.h"
+#include "ui/views/layout/box_layout.h"
+
+namespace {
+
+constexpr int kHeaderPaddingDip = 8;
+constexpr int kHeaderSpacingDip = 8;
+
+}  // namespace
+
+BrowserOSGlanceOverlayView::BrowserOSGlanceOverlayView(
+    Profile* profile,
+    base::RepeatingClosure close_callback,
+    base::RepeatingCallback<void(const GURL&)> promote_callback)
+    : close_callback_(std::move(close_callback)),
+      promote_callback_(std::move(promote_callback)),
+      escape_accelerator_(ui::VKEY_ESCAPE, ui::EF_NONE) {
+  SetBackground(views::CreateSolidBackground(ui::kColorDialogBackground));
+
+  auto* layout = SetLayoutManager(std::make_unique<views::BoxLayout>(
+      views::BoxLayout::Orientation::kVertical));
+
+  auto header = std::make_unique<views::View>();
+  auto* header_layout =
+      header->SetLayoutManager(std::make_unique<views::BoxLayout>(
+          views::BoxLayout::Orientation::kHorizontal,
+          gfx::Insets(kHeaderPaddingDip), kHeaderSpacingDip));
+  header_layout->set_cross_axis_alignment(
+      views::BoxLayout::CrossAxisAlignment::kCenter);
+
+  url_label_ = header->AddChildView(std::make_unique<views::Label>());
+  header_layout->SetFlexForView(url_label_, 1);
+
+  header->AddChildView(std::make_unique<views::MdTextButton>(
+      base::BindRepeating(&BrowserOSGlanceOverlayView::OnPromotePressed,
+                          base::Unretained(this)),
+      u"Open in tab"));
+  header->AddChildView(std::make_unique<views::MdTextButton>(
+      base::BindRepeating(&BrowserOSGlanceOverlayView::OnClosePressed,
+                          base::Unretained(this)),
+      u"Close"));
+  AddChildView(std::move(header));
+
+  // The WebContents gets the full tab-helper set so that an arbitrary page
+  // behaves the way it would in a tab.
+  web_contents_ =
+      content::WebContents::Create(content::WebContents::CreateParams(profile));
+  TabHelpers::AttachTabHelpers(web_contents_.get());
+
+  web_view_ = AddChildView(std::make_unique<views::WebView>(profile));
+  web_view_->SetWebContents(web_contents_.get());
+  layout->SetFlexForView(web_view_, 1);
+}
+
+BrowserOSGlanceOverlayView::~BrowserOSGlanceOverlayView() {
+  // Normally RemovedFromWidget() has already done this; if the widget is being
+  // torn down around us it may not have. Only touch the focus manager while it
+  // is still reachable, so this can never chase a freed pointer.
+  if (accelerator_focus_manager_ &&
+      GetFocusManager() == accelerator_focus_manager_) {
+    accelerator_focus_manager_->UnregisterAccelerators(this);
+  }
+  accelerator_focus_manager_ = nullptr;
+
+  // Drop the WebView's reference before the WebContents goes away: the WebView
+  // is owned by the view hierarchy and outlives this destructor body.
+  if (web_view_) {
+    web_view_->SetWebContents(nullptr);
+  }
+}
+
+void BrowserOSGlanceOverlayView::Navigate(const GURL& url) {
+  requested_url_ = url;
+  if (url_label_) {
+    url_label_->SetText(base::UTF8ToUTF16(url.spec()));
+  }
+  content::NavigationController::LoadURLParams params(url);
+  params.transition_type = ui::PAGE_TRANSITION_AUTO_TOPLEVEL;
+  web_contents_->GetController().LoadURLWithParams(params);
+}
+
+GURL BrowserOSGlanceOverlayView::GetVisibleURL() const {
+  const GURL committed = web_contents_->GetLastCommittedURL();
+  return committed.is_valid() && !committed.is_empty() ? committed
+                                                       : requested_url_;
+}
+
+void BrowserOSGlanceOverlayView::AddedToWidget() {
+  // High priority, so Escape closes the overlay even while the web contents
+  // has focus and would otherwise consume the key.
+  accelerator_focus_manager_ = GetFocusManager();
+  if (accelerator_focus_manager_) {
+    accelerator_focus_manager_->RegisterAccelerator(
+        escape_accelerator_, ui::AcceleratorManager::kHighPriority, this);
+  }
+}
+
+void BrowserOSGlanceOverlayView::RemovedFromWidget() {
+  // GetFocusManager() may already return null here, so use the one we
+  // registered with.
+  if (accelerator_focus_manager_) {
+    accelerator_focus_manager_->UnregisterAccelerators(this);
+    accelerator_focus_manager_ = nullptr;
+  }
+}
+
+bool BrowserOSGlanceOverlayView::AcceleratorPressed(
+    const ui::Accelerator& accelerator) {
+  if (accelerator != escape_accelerator_) {
+    return false;
+  }
+  close_callback_.Run();
+  return true;
+}
+
+bool BrowserOSGlanceOverlayView::CanHandleAccelerators() const {
+  return GetWidget() != nullptr;
+}
+
+void BrowserOSGlanceOverlayView::OnPromotePressed() {
+  promote_callback_.Run(GetVisibleURL());
+}
+
+void BrowserOSGlanceOverlayView::OnClosePressed() {
+  close_callback_.Run();
+}
+
+BEGIN_METADATA(BrowserOSGlanceOverlayView)
+END_METADATA
