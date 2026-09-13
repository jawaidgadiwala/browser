# Native Chromium patches — batch 2

Implements `window-tint`, `glance` and `compact-mode` from
`docs/personal/native-patches-plan.md` (§6–§8) against Chromium
**151.0.7922.137** (`BASE_COMMIT` `8f5d36bc16`), on top of batch 1.

`spaces-menu` (§9) is **not** in this batch: the plan marks it
"Status: later. Do not build in the first pass.", and its 90% is already
covered by the nine `space-1..9` `chrome.commands` entries in `apps/app`.

## Gating model (unchanged from batch 1)

Every feature is a `browseros.*` preference registered in
`browseros::RegisterProfilePrefs`, defaulted from `IsBrowserProduct()` (or from
a hard `false` where the plan asks for opt-in), and readable/writable from the
extension with no IDL or allowlist change because `BrowserOSSetPrefFunction`
allowlists by the `browseros.` prefix alone:

```js
chrome.browserOS.setPref('browseros.window_tint', '#2C6BF2')
chrome.browserOS.setPref('browseros.compact_mode', true)
chrome.browserOS.setPref('browseros.glance', false)
```

New prefs:

| Pref | Type | Default | Effect |
|---|---|---|---|
| `browseros.window_tint` | string | `""` | `"#RRGGBB"` / `"RRGGBB"` tint for every window of the profile; empty = stock theme |
| `browseros.compact_mode` | bool | **false** (even for the Browser product) | toolbar + side panel drop out of the layout until the cursor reaches the window's top or left edge |
| `browseros.glance` | bool | `IsBrowserProduct()` | gates `chrome.browserOS.openGlance()` |

Two new extension functions, added by the same six-step recipe `showInfoBar`
used:

```js
await chrome.browserOS.openGlance('https://example.com')     // -> boolean
await chrome.browserOS.setWindowTint('#2C6BF2')              // -> boolean
await chrome.browserOS.setWindowTint('')                     // clear, -> true
```

Histogram values `BROWSER_OS_OPENGLANCE = 2005` and
`BROWSER_OS_SETWINDOWTINT = 2006` (BrowserOS owns 1978–…; 2004 was the previous
high-water mark), mirrored into
`tools/metrics/histograms/metadata/extensions/enums.xml`.

---

## Where the code lives

All three features share one new directory,
`chrome/browser/ui/views/browseros/`, plus a single toolkit-independent header
at `chrome/browser/ui/browseros_window_ui.h` so that the extension API never
includes a views header. That is the split upstream already uses for
`extension_side_panel_utils.h` / `views/side_panel/extensions/extension_side_panel_utils.cc`.

**No new GN target.** All nine files are added to the existing
`static_library("ui")` in `chrome/browser/ui/BUILD.gn` — the `views/*` ones in
the `toolkit_views` block that already lists `views/frame/browser_view.cc`, the
one non-views header in the `!is_android` block.

The three controllers are owned by `BrowserView`, constructed in its
constructor and wired up from `AddedToWidget()` / `RemovedFromWidget()`.
Deliberately **not** `BrowserWindowFeatures`: its
`InitPostBrowserViewConstruction()` carries a literal
`// WARNING: DO NOT ADD ANY MORE CODE HERE`, and `BrowserView` is a file this
product already patches, so the whole batch stays inside files batch 1 touched.

---

## Features

### `browser-window-tint`

| File | New? | Change |
|---|---|---|
| `chrome/browser/ui/views/browseros/browseros_window_tint_controller.{h,cc}` | **new** | per-window tint controller (~90 lines) |
| `chrome/browser/ui/browseros_window_ui.h` | **new** | `browseros::SetWindowTint()` declaration |
| `chrome/browser/ui/views/browseros/browseros_window_ui.cc` | **new** | its implementation |
| `browseros_prefs.{h,cc}` | edit | `kWindowTint`, `GetWindowTint()`, `ParseTintColor()` |
| `browser_view.{h,cc}` | edit | owns the controller; `Apply()` from `AddedToWidget()` |
| `browser_os.idl`, `browser_os_api.{h,cc}` | edit | `setWindowTint` |

**Almost entirely upstream API**, exactly as the plan predicted. The whole
mechanism is:

```cpp
browser_view->GetWidget()->SetUserColorOverride(color);
```

`views::Widget::SetUserColorOverride()` (`ui/views/widget/widget.h:1442`) stores
the colour and calls `ThemeChanged()`; `BrowserWidget::GetColorProviderKey()`
(`browser_widget.cc:444`) re-applies `user_color_override()` on top of the
ThemeService key with `UserColorSource::kAccent`. Chromium then regenerates the
window's whole `ColorProvider`, so the frame, toolbar, omnibox, tab strip,
bubbles and side panel recolour together and contrast stays computed by the
colour pipeline. **Nothing is painted over anything**, which is why this is the
low-risk feature of the batch.

Two sources, in priority order: a per-window override from
`chrome.browserOS.setWindowTint()`, then the profile-wide
`browseros.window_tint` pref. Clearing the override (`setWindowTint('')`) falls
back to the pref; clearing the pref with no override falls back to the stock
theme. `SetUserColorOverride()` no-ops on an unchanged value, so the pref
observer is cheap.

The plan's `a` (alpha / tint-strength) parameter is **not** implemented: the
pref and the API take a plain `#RRGGBB`. Pre-blending against `kColorToolbar`
can be added later inside `EffectiveTint()` without touching any other file.

**Verify:**

```js
chrome.browserOS.setPref('browseros.window_tint', '#2C6BF2')   // all windows tint, live
chrome.browserOS.setPref('browseros.window_tint', '')          // back to stock
await chrome.browserOS.setWindowTint('#B04AF0')                // this window only -> true
await chrome.browserOS.setWindowTint('nonsense')               // -> false, nothing changes
await chrome.browserOS.setWindowTint('')                       // -> true, falls back to the pref
```

Observe: toolbar background, window frame, omnibox chip and the side panel
background all move together; open a bubble (e.g. the profile menu) and it is
tinted too; open a second window and it follows the pref, not the per-window
override.

---

### `browser-glance`

| File | New? | Change |
|---|---|---|
| `.../browseros_glance_controller.{h,cc}` | **new** | per-window owner of the overlay widget (~150 lines) |
| `.../browseros_glance_overlay_view.{h,cc}` | **new** | header row + `views::WebView` (~140 lines) |
| `chrome/browser/ui/browseros_window_ui.h` / `views/browseros/browseros_window_ui.cc` | **new** | `browseros::OpenGlance()`, `browseros::CloseGlance()` |
| `chrome/browser/ui/tab_helpers.h` | edit | **one friend entry** (see below) |
| `browseros_prefs.{h,cc}` | edit | `kGlance`, `IsGlanceEnabled()` |
| `browser_view.{h,cc}` | edit | owns the controller |
| `browser_os.idl`, `browser_os_api.{h,cc}` | edit | `openGlance` |

A **full WebContents overlay** — not the picture-in-picture fallback. But it is
built differently from the plan's sketch, because Chromium 151 has locked down
the classes the plan named:

* `views::BubbleDialogDelegateView`'s constructor is gated by a
  `base::PassKey` whose friend list is headed `// DO NOT ADD TO THIS LIST!`.
* `views::WidgetDelegateView` is gated the same way.

So instead of subclassing either, the overlay is a plain child `views::Widget`
(`TYPE_POPUP`, parented to the browser widget) whose delegate is a stock
`views::WidgetDelegate` with `SetContentsView()`. That is 100% public API and
needs no upstream edit. Ownership follows the `CLIENT_OWNS_WIDGET` model
upstream now prefers: the controller owns the widget and the delegate, and the
widget takes the contents view during `Init()` via
`TransferOwnershipOfContentsView()`.

Behaviour:

* Sized at 70% of the content area, clamped to 1000×700 (min 320×240), centred
  over `BrowserView::contents_container()`.
* **Escape** is registered on the widget's `FocusManager` at
  `ui::AcceleratorManager::kHighPriority`, so it closes the overlay even while
  the web contents has keyboard focus and would otherwise eat the key. Normal
  `View::AddAccelerator()` would not.
* **Click outside** closes it, via `WidgetObserver::OnWidgetActivationChanged`.
* **"Open in tab"** promotes the currently committed URL with
  `chrome::AddTabAt(browser, url, -1, /*foreground=*/true)` and closes the
  overlay. It re-navigates rather than transferring the WebContents, which
  avoids all of the reparenting complexity for a page that has just loaded.
* Teardown is posted rather than synchronous, because `Close()` is reached both
  from the widget's own deactivation notification and from a button inside the
  view the teardown destroys.
* Only `http` / `https` are accepted; everything else is rejected in the
  extension function *and* again in the controller.

**The one upstream edit: `chrome/browser/ui/tab_helpers.h`.** The glance
WebContents calls `TabHelpers::AttachTabHelpers()`, which is private with a
friend list, so `BrowserOSGlanceOverlayView` is added to it (one line, next to
the existing `friend class PreviewTab;` — "Link Preview shows a preview of a
page, then promote it as a new tab", literally the same shape). Without it an
arbitrary page would render but lose zoom, permission prompts, infobars and
autofill, and a page asking for geolocation would reach a null
`PermissionRequestManager`. That risk in a daily driver is worse than a
one-line friend entry.

**Known gaps (documented, not fixed):**

* No `content::WebContentsDelegate` is installed. `target=_blank` /
  `window.open()` from inside the overlay are suppressed rather than routed to
  a real tab, and `window.close()` does nothing. Adding a delegate means
  matching `AddNewContents()` / `OpenURLFromTab()` signatures that churn every
  milestone; "Open in tab" covers the real need.
* The overlay opens in the **last-active** browser window, like every other
  `browserOS` function. Per-window targeting needs a `windowId` parameter
  resolved through `ExtensionTabUtil` — the pattern in
  `side_panel_service.cc:38-47`. Not needed while the extension acts on the
  focused window.
* The header shows the raw URL in a `views::Label`, not the page title (no
  `WebContentsObserver` yet) — the strings `Open in tab` / `Close` are
  hard-coded `u"..."` literals, following the batch-1 precedent for
  `u"Ask Browser"`, so no `.grd` change.

**Verify:**

```js
await chrome.browserOS.openGlance('https://example.com')   // -> true
await chrome.browserOS.openGlance('chrome://settings')     // -> rejected, error
chrome.browserOS.setPref('browseros.glance', false)
await chrome.browserOS.openGlance('https://example.com')   // -> false
```

Observe: a centred panel over the content area with the URL, "Open in tab" and
"Close"; the page loads and scrolls; **Esc** closes it; clicking the page
behind it closes it; "Open in tab" leaves a real tab on that URL and closes the
overlay; open it twice in a row and the second call reuses the same widget.

---

### `browser-compact-mode`

| File | New? | Change |
|---|---|---|
| `.../browseros_compact_mode_controller.{h,cc}` | **new** | hover state machine (~200 lines) |
| `browseros_prefs.{h,cc}` | edit | `kCompactMode`, `IsCompactModeEnabled()` |
| `browser_view.{h,cc}` | edit | owns the controller; one gate in `IsToolbarVisible()`; hooks in `AddedToWidget()` / `RemovedFromWidget()` |

While `browseros.compact_mode` is on and the window is not revealed:

* `BrowserView::IsToolbarVisible()` returns false. That is the **single** choke
  point — `BrowserViewLayoutDelegate::IsToolbarVisible()` is pure virtual and
  every layout impl (`browser_view_tabbed_layout_impl.cc:221,623,1275`,
  `..._app_layout_impl.cc:232`, `..._popup_layout_impl.cc:124`) routes through
  `BrowserViewLayoutDelegateImpl` to it. Same shape as the batch-1
  `ShouldDrawTabStrip()` gate. **`BrowserViewLayout` is not modified**, exactly
  as the plan insists.
* The side panel is hidden with `side_panel_->SetVisible(false)`. The layout
  reads it through `IsParentedToAndVisible(panel, browser_view)`
  (`browser_view_tabbed_layout_impl.cc:378`), so an invisible panel takes no
  width.

Moving the cursor within **4 dip** of the window's top or left edge reveals
both; moving off retracts them **250 ms** later. The linger also covers the
cursor leaving the window entirely.

**Mouse tracking** is `views::EventMonitor::CreateWindowMonitor()` on the
browser widget, watching `kMouseMoved` / `kMouseDragged` / `kMouseEntered`.
Not a hit-strip `views::View`: the plan flagged that a views sibling of a
layer-backed `WebView` does not reliably see mouse moves over the web contents,
and the monitor sees events before they are routed anywhere. Positions come
from `EventMonitor::GetLastMouseLocation()`, which is documented to be in
**screen** coordinates on every platform (a located event's own coordinates are
not). `views::MouseWatcher` is not used — it only watches exits, and one
monitor covers both directions.

The monitor is dropped in `RemovedFromWidget()` as well as in the destructor,
because `EventMonitor` must not outlive its target window.

**Deliberate deviation from the plan: the reveal is not a z-order overlay.**
Revealing re-runs the window layout, so the web contents shrinks to make room
rather than being covered. A true overlay needs `top_container_` reparented out
of `BrowserView` into `overlay_view_` — the machinery immersive fullscreen uses
(`ReparentTopContainerForStartOfImmersive()`), which on macOS also drags in
`OverlayWidgetMac` and `ImmersiveModeControllerMac`. That is a batch of its own
and is exactly the "most likely thing to need a second attempt" the plan warns
about. What ships here is the hide/reveal state machine, the pref, and the two
gates; upgrading to an overlay later changes only
`browseros_compact_mode_controller.cc` plus a reparenting hook in
`browser_view.cc`.

**No accelerator.** The plan's ⌥⌘S needs a new command id, entries in
`accelerator_table.cc` and `global_keyboard_shortcuts_mac.mm`, and a
`browser_command_controller.cc` case — three more upstream files for a
convenience the plan itself marks optional. The pref is the toggle; the
extension can bind a `chrome.commands` shortcut to it with zero native lines.

**Known gaps:**

* If the side panel coordinator opens the panel *while* compact mode has it
  hidden, the controller's `side_panel_hidden_by_compact_` bookkeeping can
  desync and the panel may stay hidden until the next reveal/retract cycle.
* The retract timer is not animated (`gfx::SlideAnimation` is a later polish).

**Verify:**

```js
chrome.browserOS.setPref('browseros.compact_mode', true)
```

Observe: the toolbar and side panel disappear and the page fills the window,
with no restart; move the cursor to the very top of the window — both come
back; move away and count ~250 ms — they go again; move to the very left edge —
same; ⌘L still focuses the omnibox once revealed. Then:

```js
chrome.browserOS.setPref('browseros.compact_mode', false)
```

— everything returns permanently. Also check: enter and leave fullscreen with
compact mode on, and open a second window (each window has its own controller
and its own reveal state, but shares the pref).

---

## Validation performed (no compile)

```
uv run browseros dev --chromium-src ~/chromium/src doctor   # 0 errors, 1 warning
```

The one warning is the pre-existing batch-1 multi-claim on
`browseros_browser_product.h`.

Every patch in the repo — all **389** of them, batch 2 included — was applied
to a scratch git tree seeded with pristine 151.0.7922.137 blobs
(`git show 8f5d36bc16:<path>` out of `~/chromium/src`, which is not writable
while builds run):

```
git apply --check   # 389/389 clean
git apply           # 389/389 clean, sequentially
```

Every symbol used was grepped in `~/chromium/src` at this revision:
`Widget::SetUserColorOverride` / `BrowserWidget::GetColorProviderKey`,
`BrowserView::{IsToolbarVisible,side_panel,contents_container,top_container,GetProfile,GetWidget,AddedToWidget,RemovedFromWidget,GetBrowserViewForBrowser}`,
`BrowserViewLayoutDelegate::IsToolbarVisible`, `IsParentedToAndVisible`,
`views::EventMonitor::{CreateWindowMonitor,GetLastMouseLocation}`,
`ui::EventType::kMouse*`, `views::WidgetDelegate::{WidgetDelegate,SetContentsView,SetCanActivate}`,
`Widget::InitParams::{InitParams(Ownership,Type),SetParent,name,activatable,Activatable::kYes}`,
`views::{MdTextButton,Label,WebView,BoxLayout,CreateSolidBackground}`,
`FocusManager::{RegisterAccelerator,UnregisterAccelerators}`,
`ui::AcceleratorManager::kHighPriority`, `gfx::Insets(int)`,
`TabHelpers::AttachTabHelpers`, `content::WebContents::{Create,CreateParams}`,
`NavigationController::LoadURLParams`, `chrome::AddTabAt`,
`GURL::SchemeIsHTTPOrHTTPS`, `base::{HexStringToUInt,TrimWhitespaceASCII}`,
`ui::kColorDialogBackground`, `BROWSER_OS_SHOWINFOBAR = 2004` as the previous
histogram high-water mark.

**Not verifiable without a compile:**

* That it builds. In particular: that `gn check` accepts
  `chrome/browser/ui/browseros_window_ui.h` being included from
  `chrome/browser/extensions/api/browser_os/browser_os_api.cc` (that file
  already includes `chrome/browser/ui/browser_window/public/...` headers, so
  the dependency exists) and that the new `views/browseros/*` sources land in
  the right `toolkit_views` branch of the giant `static_library("ui")`.
* That the IDL compiler generates `browser_os::OpenGlance::Params` /
  `::Results::Create` and `browser_os::SetWindowTint::…` under exactly those
  names, and that `DECLARE_EXTENSION_FUNCTION` picks up the new histogram
  values.
* Any runtime behaviour: whether a `TYPE_POPUP` child widget parented to the
  browser widget positions and activates correctly on macOS; whether Escape at
  `kHighPriority` really pre-empts the focused `WebView`; whether the
  `EventMonitor` fires often enough for the 4 dip edge to feel right; whether
  hiding the side panel from outside `SidePanelCoordinator` upsets its own
  state; the visual result of the tint at various colours.
* That `TabHelpers::AttachTabHelpers()` on a WebContents with no
  `tabs::TabInterface` is safe for every helper in 151 (it has no such CHECK at
  the top, and the friend list is explicitly designed for this case, but only a
  run proves it).

## Build command

Unchanged from batch 1; no new `--gn-arg`:

```bash
cd packages/browseros
uv run browseros build --preset release --product browseros --arch arm64 \
  --provision none --no-sign --no-upload --resource-mode published \
  --chromium-src ~/chromium/src
```

## What batch 3 inherits

1. Compact mode as a real z-order overlay (reparent `top_container_`, animate
   with `gfx::SlideAnimation`).
2. A `WebContentsDelegate` for glance (route `target=_blank` to a tab, honour
   `window.close()`), the page title in the header, and an optional `windowId`
   on both new API functions.
3. `spaces-menu` (plan §9) if the menu-bar listing is still wanted.
4. Tint strength (the plan's `a` parameter) by pre-blending against
   `kColorToolbar` inside `EffectiveTint()`.
5. ⌥⌘S for compact mode, if the `chrome.commands` binding proves insufficient.
