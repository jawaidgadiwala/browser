# Zen Sidebar — Implementation Review (for the BrowserOS side panel)

Companion to `zen-spaces-design-reference.md` (behavior level). This document goes one level deeper: DOM structure,
algorithms, constants, persistence fields, and performance traits of Zen's sidebar, with `file:line` references into the Zen
tree (commit `22961e97`, 2026-09-11). **No Zen code, CSS, or assets are reproduced.** Every section ends with "Our
equivalent:" for a Chrome-extension side panel (React + `chrome.tabs/tabGroups/sessions/sidePanel/storage`) in the BrowserOS
Chromium fork, or "native only".

Paths are relative to the Zen repo root. `M` = `src/zen/spaces/ZenSpaceManager.mjs` (3381 lines), `P` =
`src/zen/tabs/ZenPinnedTabManager.mjs`, `VT` = `src/zen/tabs/zen-tabs/vertical-tabs.css`, `WS` =
`src/zen/spaces/zen-workspaces.css`, `G` = `src/zen/spaces/ZenGradientGenerator.mjs`, `C` =
`src/zen/compact-mode/ZenCompactMode.mjs`, `GL` = `src/zen/glance/ZenGlanceManager.mjs`, `SV` =
`src/zen/split-view/ZenViewSplitter.mjs`, `SM` = `src/zen/sessionstore/ZenSessionManager.sys.mjs`, `WSync` =
`src/zen/sessionstore/ZenWindowSync.sys.mjs`. Default prefs live in `prefs/zen/*.yaml` (162 `zen.*` prefs across 26 files;
`workspaces.yaml` alone has 17).

---

## 1. Sidebar DOM / layout structure

The sidebar **is** Firefox's `#navigator-toolbox`, rotated into a vertical column and given `persist="width style"`
(`src/browser/base/content/navigator-toolbox-inc-xhtml.patch:5`). Tree, with the file that creates each node:

```
#browser
├─ #navigator-toolbox                      ← the sidebar (toolbox patch:5)
│  ├─ #titlebar
│  │  ├─ #zen-toolbar-background          (gradient layer for the sidebar, patch:22)
│  │  └─ #TabsToolbar > #tabbrowser-tabs [orient=vertical, set in JS ZenUIManager.mjs:1337]
│  │     ├─ #zen-essentials               (single, position:absolute, z-index 2; patch:61)
│  │     │  └─ .zen-essentials-container[container=N] × 1 per cookie container (M:410-445)
│  │     └─ #zen-tabs-wrapper > #tabbrowser-arrowscrollbox
│  │        └─ <zen-workspace id=uuid> × N    (M:458-469; template ZenSpace.mjs:53-88)
│  │           ├─ <zen-workspace-collapsible-pins>   (pinned-collapse driver, ZenSpace.mjs:9-46)
│  │           ├─ .zen-current-workspace-indicator   (chevron/icon, name, actions button)
│  │           ├─ arrowscrollbox.workspace-arrowscrollbox   ← the real per-space scroller
│  │           │  ├─ .zen-workspace-pinned-tabs-section (+ fake start div, + separator row
│  │           │  │     with "close unpinned" button)
│  │           │  └─ .zen-workspace-normal-tabs-section (+ periphery: new-tab button)
│  │           └─ .zen-workspace-empty-space (flex filler, window-drag region)
│  └─ #zen-sidebar-foot-buttons  (zen-sidebar-icons.inc.xhtml:8-20)
│     └─ <zen-workspace-icons id="zen-workspaces-button">   ← space dots (§7), between expand + new-space buttons
├─ #zen-sidebar-splitter   (JS-created ZenCustomizableUI.sys.mjs:51-56)
├─ #zen-browser-background (window gradient layer, browser-box patch:10)
└─ #zen-appcontent-wrapper > ... > #tabbrowser-tabbox
```

Mirror-worthy facts: `#zen-essentials` is a single overlay outside the carousel (VT:1135, z-index VT:1102) and each strip
reserves room with an inline `padding-top`; `#tabbrowser-arrowscrollbox` never scrolls — each space owns its scroller and
`gBrowser.tabContainer.arrowScrollbox` is re-pointed per switch (M:2374); the empty tab and glance tabs live inside this tree
(§4, §9).

**Width.** Persisted via XUL store (`width` attr on toolbox); defaults 230px macOS / 186px other
(ZenCustomizableUI.sys.mjs:46-47), double-click on splitter resets. Max from pref `zen.view.sidebar-expanded.max-width` = 500
(inline `maxWidth`, ZenUIManager.mjs:1601-1611). Min 150px (`#titlebar min-width`, VT:528; JS clamp C:434). Collapsed
(icon-only) = 48px tab + 2×6px padding = 60px (VT:696-705). A MutationObserver on the toolbox `width` attribute fires a
synthetic `window.resize` (ZenCustomizableUI.sys.mjs:85-94); a ResizeObserver on the toolbox (debounced by
`zen.view.sidebar-height-throttle`, default 0 — the "throttle" helper is actually a trailing debounce,
ZenCommonUtils.mjs:151-157) measures `getBoundingClientRect().width` and writes `--zen-sidebar-width` /
`--actual-zen-sidebar-width` inline on the toolbox (C:420-459).

**Expanded vs icon-only.** Pref `zen.view.sidebar-expanded` → `_updateEvent` (ZenUIManager.mjs:1309-1583, ~275 lines) sets
`zen-sidebar-expanded` on both toolbox and root plus `expanded` on `#tabbrowser-tabs`, re-inserts the splitter, dispatches
`resize`, remeasures, rebuilds URL-bar menus. CSS on `:root:not([zen-sidebar-expanded])` (VT:696-853) hides labels,
close/reset buttons, centres tabs, collapses the essentials grid to one column, stacks foot buttons vertically, shrinks the
indicator 44→38px.

**Pinned-section collapse.** Attribute `collapsedpinnedtabs` on `<zen-workspace>` (ZenSpace.mjs:35-39); `haspinnedtabs` gates
click-to-toggle on the indicator (:170-175); pinning auto-expands (:269-274). Animation reuses the folder collapse machinery
(ZenFolders.mjs:1532-1627): items animate opacity 1→0 and height auto→0 while the section's fake start element gets a
negative `margin-top` of −(sectionHeight − separatorHeight + 4) measured without flushing; **120 ms easeInOut** (:1528-1530).
The selected pinned tab stays visible (`has-active`, :1583-1590; `tab.visible` patch tab-js.patch:222-240). Persisted per
space as `hasCollapsedPinnedTabs` and restored via a double `setTimeout(0)` (M:762-772).

**Sizing custom properties:** `--zen-sidebar-width`/`--actual-…` (JS, C:437-456); `--zen-toolbox-padding` 5/6px (VT:85-92);
`--zen-element-separation` = clamp(pref, ≤12) inline on root (zenThemeModifier.js:145-166);
`--zen-workspace-indicator-height` 44/38/42px (zen-theme.css:232-255); `--tab-min-height` 36px (46px essentials, VT:570);
`--tab-collapsed-background-width` 48px (tabs-css.patch:9); `--zen-active-tab-scale` 0.985. Tab row: 36px, 8px radius, press
`scale 0.985`; missing favicon = blank SVG over a primary-tinted square (VT:356-364); separator row 22px, collapsed to height
0 under `hide-separator` (VT:141-233); new-tab button at top via `order:-1`.

**Our equivalent:** A React tree `Panel > [SearchBox, EssentialsGrid, SpaceCarousel > SpaceStrip×N > [SpaceHeader,
PinnedSection, Separator, TabList], FooterBar]`. Width is owned by Chromium's side panel (native resize handle); we can only
read `window.innerWidth` and expose `--panel-width` via a single ResizeObserver on `document.documentElement`
(rAF-coalesced). Icon-only mode is a panel-internal `data-collapsed` attribute driven by a width threshold (≤ ~96px) and a
user toggle stored in `chrome.storage.local`. Reserve essentials height with a CSS grid row (`grid-template-rows: auto 1fr`)
instead of measuring; keep the pinned-collapse as a `grid-template-rows: 0fr/1fr` transition (120 ms) with the selected tab
rendered outside the collapsing row. Native only: sidebar-level persisted width and the window-drag region.

---

## 2. Essentials grid

**Layout math** (VT:1104-1153). Grid, 4px gap, `auto-fit` columns of `minmax(max(23.7%, tab-min-height+4px), 1fr)` → ≈4
columns at default width. Count-specific overrides are set as a `data-hack-type` attribute by JS (M:2734-2747), evaluated in
this order: count 6 or 9 → 3 columns (`max(30%, …)`); even count < 8 (2, 4) → exactly 2 tracks; count 5 → 4 columns
(`max(25%, 48px)`), so 5 renders as 4+1; everything else → default. The count is not exposed as a CSS variable, and
`children.length` includes the drag placeholder and the promo card — so the template can flip mid-drag. Collapsed sidebar →
single column, padding 0, width bound to `--zen-sidebar-width` (VT:732-739). Transitions: `max-height 0.3s`,
`grid-template-columns 0.3s`. Tile: 46px min-height, label/close hidden, content centred; selected tile draws a 20px-blurred
copy of the favicon (`--zen-essential-tab-icon`) behind an inner 2px-inset card when `zen.theme.essentials-favicon-bg`
(default true) (VT:1190-1235).

**Container scoping.** One `.zen-essentials-container[container=N]` per `userContextId`, created lazily (M:410-445); with
`zen.workspaces.separate-essentials` (default true). Non-active containers get `hidden` but remain laid out (`position:fixed;
visibility:hidden`, VT:1145-1153) so their height is measurable. On switch (`#animateTabs`, M:2024-2046, 2151-2207) a
container used by both spaces gets `translateX(0)` with no animation; one used only by the new/old space slides in/out ±100%
with the same 250 ms spring as the strips.

**Icon rendering.** Favicon = tab `image` attribute copied to an inline `--zen-essential-tab-icon` (P:112-115) on icon
change/add/drag; `zenStaticIcon` overrides (tabbrowser-js.patch:1512). Fallback = blank SVG + tinted square. Loading =
Firefox `busy` attribute inherited into the icon stack (tab-js.patch:29-42); throbber hidden by
`zen.theme.hide-tab-throbber`. Discarded = `pending` → opacity 0.5; Zen removes Firefox's grayscale filter
(tabs-css.patch:521-525).

**Max count.** `zen.tabs.essentials.max` = 12. Count = `_numZenEssentials`, an O(n) scan of the leading `zen-essential` tabs
in `gBrowser.tabs` (tabbrowser-js.patch:51-59) — relies on essentials always being first in tab order. `canEssentialBeAdded`
(P:1033-1045) = container matches active space (when scoped) and count < max. Enforced in `addToEssentials` (user path only;
`replicating:true` bypasses for sync), the context-menu badge `n/max` (P:722-732), and drag-over
(ZenDragAndDrop.js:1489-1491).

**Add flow** (`addToEssentials`, P:506-566): resolve targets (arg/multiselect/context tab) → gate → set `zen-essential`,
**remove `zen-workspace-id`** → if already pinned, physically move into the container's grid (cross-window adopt if needed),
else `pinTab` (patched to append to the grid, tabbrowser-js.patch:120-135) → mark `zenDefaultUserContextId` → if selected,
`switchTabIfNeeded` → refresh icon var → dispatch `TabAddedToEssentials` (also a session-save trigger) → schedule padding
update. **Remove** (P:568-612): drop attr, stamp active space id, `unpinTab` (prepend to active normal section) or prepend to
pinned section, dispatch `TabRemovedFromEssentials`. `moveTabTo` clamps indices into `[0, numEssentials]` for essentials and
`[numEssentials, visiblePinned]` for pinned (tabbrowser-js.patch:575-590).

**Drag targets.** `ZenDragAndDrop.js` (1835 lines, plus native `nsZenDragAndDrop.cpp` for out-of-window). Pointer inside
`#zen-essentials` routes to a grid handler (:1483-1765): inject the promo if empty, else append a placeholder cell, force
layout, convert the drag image to a tile; `maxTabsPerRow` measured once from cell left edges (:1519-1540); cell pitch = rect
+ 4px; binary search over cell centres for the drop index (:1706-1750); cells shift with inline transforms; haptic per index
change. Drop → `moveToAnotherTabContainerIfNecessary` (P:751-936, ~185 lines) picks essentials/pinned/normal via `closest()`
and midpoint tests.

**Empty-state promo** (`ZenEssentialsPromo.mjs:52-68`): injected only during drag-over when the grid is empty, forces a sync
layout (`offsetHeight`), removed on dragend/drop; content-driven height, dashed outline.

**Reserve-height mechanism.** ResizeObserver on every essentials container (M:199-205, 306-317) → rAF → `onPinnedTabsResize`
(M:2681-2756) → rAF → `paddingTop = max(2, h)px` on each strip using that container (M:1798-1821); `transition: padding-top
0.1s` (WS:346-348); frozen during the switch animation.

**Our equivalent:** `EssentialsGrid` with `grid-template-columns: repeat(3, 1fr)` (the target design is 3-wide, so drop Zen's
5/6/9 special cases entirely); 1 column when collapsed. Data: `essentials: string[]` of stable tab keys in
`chrome.storage.local`, max 12, ordered by array. Icon from `tab.favIconUrl`, fallback letter tile, `tab.status ===
"loading"` for the spinner, `tab.discarded` → 50% opacity. Add = `chrome.tabs.update({pinned:true})` + append key; remove =
splice + optionally unpin. Reorder with `@dnd-kit` (grid sortable); no measurement — the grid is a normal flow row above the
carousel, not an overlay. Container scoping: no Chromium equivalent (drop it, or key by profile if BrowserOS adds one).
Cross-window drag of real tabs: native only.

---

## 3. Pinned tab manager internals

**Canonical snapshot.** `tab._zenPinnedInitialState = { entry: { url, title }, image }` — a JS expando, not an attribute
(WSync:1270-1278, stamped on all synced windows as the *same object reference*). Created on `TabPinned` only if absent
(WSync:1457-1474) from the `TabStateCache` history entry at `index-1`, image = `image` attr or `gBrowser.getIcon`
(WSync:1224-1243); backfilled and re-trimmed to `{url,title}` on `sessionstore-windows-restored` (WSync:284-320). Refresh
paths: "replace with current" (P:238-247), "edit URL" (P:249-297, URL fixup, favicon via Places favicon service — the
**only** remaining Places use; the old `zen_pins` table is read once by the migration in SM:156-249). Deleted on unpin.
Persisted via `TabState.collect` as `tabData._zenPinnedInitialState` (TabState-sys-mjs.patch:28) and restored by
`restoreInitialTabData` before `pinTab` runs (tabbrowser-js.patch:490).

**Drift detection.** A tabs-progress listener (`P:83`, `onLocationChange` P:938-971): top-level only; normalisation = **strip
`#…` only**, then compare canonical URI specs (query strings and trailing slashes count as drift). Mismatch →
`zen-pinned-changed="true"` (or a deferred `had-zen-pinned-changed` if inside a split group) and inline
`--zen-original-tab-icon` (P:982-1008); match → clear (P:973-980). Ghost favicon = the reset-pin button's image reading that
var (VT:957), fading in on hover (VT:657-668). Accel-click on the button duplicates first, then resets (P:117-132).

**Reset** (`P:459-490`): parse the tab's session state, replace `entries` with one entry for the pinned URL carrying a fresh
content principal, `image` = static icon or snapshot image, `index = 0`, `delete scroll` (gh-13024), then
`SessionStore.setTabState` — which reloads the tab (or just replaces cached state if it's discarded). Startup variant pref
`zen.pinned-tab-manager.restore-pinned-tabs-to-pinned-url` (false) loops all tabs at init (P:84-92).

**Unload** (`onCloseTabShortcut`, P:318-457, ~140 lines, complexity-lint disabled). Bound to `cmd_close`, the reset button,
and middle-click (with `wheel-close-if-pending` = true). Expands split groups, filters to pinned. Setting matrix upgrades:
`noClose+close → unload-switch`; `alwaysUnload` promotes any non-unload value. **Glance guard**: if the tab hosts a glance,
closes it and awaits `GlanceClose` or 3000 ms — then `return`s, aborting the unload of *every other* tab in the batch
(P:377-404, a real bug). If all are already `pending` and `closeIfPending` → recursive call with `close`. Unload = Firefox
`explicitUnloadTabs` (beforeunload prompts, then `discardBrowser` sets `pending` + `discarded`); Zen then strips `discarded`
so the tab keeps pinned styling (P:431-433). Rendering: `fadeOutExplicitlyUnloadedTabs=true` → opacity 0.5; reset button
hidden while `pending` (VT:898-907).

**Ordering.** Pin = append to the space's pinned section (tabbrowser-js.patch:112-137), unpin = prepend to the active normal
section (:138-163). Essentials → pinned demotion prepends to the pinned section. Stable id `zenSyncId` =
`Date.now()-rand(0..100)` (WSync:325-332) — **100 buckets per ms**, collision-prone under bulk open; `zenPinnedId` is legacy
read-only. Pinned and essential tabs are restored **lazily** (`restore_pinned_tabs_on_demand=true`,
prefs/firefox/browser.yaml:8) and stay `pending` until selected.

Prefs: `close-shortcut-behavior` = `reset-unload-switch`, `wheel-close-if-pending` true, `restore-pinned-tabs-to-pinned-url`
false, `zen.tabs.essentials.max` 12, `zen.tabs.rename-tabs` true, `zen.tabs.open-pinned-in-new-tab` true.

**Our equivalent:** `pinned: Record<tabKey, {url, title, favIconUrl, pinnedAt}>` in `chrome.storage.local`, keyed by a stable
id we mint (`crypto.randomUUID()`, stored in `chrome.storage.session` map `tabId → key` and re-linked at startup by URL+index
heuristics). Drift: `chrome.tabs.onUpdated` (`changeInfo.url`), compare after stripping hash (and, unlike Zen, also normalise
trailing slash + drop `utm_*`). Reset = `chrome.tabs.update(id, {url})` (history is not collapsible from an extension —
native only if required). Unload = `chrome.tabs.discard`; render `tab.discarded` at 50% opacity. Intercepting Cmd/Ctrl-W:
native only (extension commands cannot shadow the browser accelerator); offer `Cmd+Shift+W`-style alternative via
`chrome.commands`.

---

## 4. Space strip carousel

**DOM and positioning.** Every `<zen-workspace>` is `position:absolute; width:100%(+padding); height:100%; overflow:hidden`
stacked at the same origin (WS:317-324); position is purely an inline `transform: translateX(d×100%)` (M:1856-1857). DOM
order is kept in sync with model order via `moveBefore` (M:1364-1383) but is visually irrelevant. Shortest-path wrap,
duplicated three times (M:1850-1855, 2011-2016, 2105-2110): `d = i_other − i_current; if d > floor(n/2) d −= n; else if d <
−floor(n/2) d += n`. With n=2 both neighbours land on the same side.

**Inactive strips stay mounted** with live browsers. `zen-workspace:not([active])` gets `content-visibility: hidden` +
Gecko's subtree-hidden hint — but only while root has neither `animating-background` nor `swipe-gesture` and no tab drag is
active (WS:405-408). So at rest layout of N−1 strips is skipped, but **every switch or swipe un-hides all strips** and forces
full layout/paint of every space. Tabs are never individually hidden; membership = `zen-workspace-id` attribute + physical
parent. `gBrowser.visibleTabs/allTabs` are rebuilt from the active strip's children (tabs-js.patch:86,155); `allStoredTabs`
(M:3077-3136, cached) walks all containers.

**Switch pipeline.** `changeWorkspace` (M:1659-1683): `complete()` every in-flight Motion animation (jump to end, not
cancel), await the previous switch promise (serialised, never coalesced), set `#inChangingWorkspace`.
`#performWorkspaceChange` (M:1689-1745): same uuid → `_cancelSwipeAnimation` (snap back); else set `active`,
`makeSureEmptyTabIsFirst`, repoint pinned container, `_handleTabSelection`, `warmupTab`, then `#updateWorkspaceState`
(M:2373-2451) → `#animateTabs` (M:1996-2234, ~240 lines, the hotspot). Animation library = vendored **Motion v13.2.0**
(`src/zen/vendor/motion.dep`, loaded lazily ZenUIManager.mjs:35-43). Options: `{type: spring, bounce: 0, duration: 0.25}` —
critically damped, no overshoot; duration from `zen.workspaces.switch-animation-duration` = 250 ms. Only strips within ring
distance ≤ |d| of the old index animate; others get the final transform synchronously (M:2114-2120). The selected tab is
switched at animation **start** (offset 0 branch, M:2124-2129). Completion = `Promise.race(all animations, timeout
duration+50 ms)` watchdog (M:2213-2222, issue #9334). A switch arriving mid-animation runs unanimated (`_animatingChange`,
M:2397). No JS reduced-motion handling (only a CSS media query on padding-top, WS:333-335). Scrollbar hidden during animation
via inline `scrollbarWidth` (M:2003/2232).

**Empty tab** (`#initializeEmptyTab`, M:290-304): one per window, lazy `about:blank` with a transparent browser and
`zen-empty-tab` (tabbrowser-js.patch:247-257, 348-349). Forced to be the first child of the active normal section and
re-stamped with the active space id on every switch (M:1747-1769); `display:none`; excluded from `tab.visible`, remove-all
sweeps, last-tab checks, TabsList, the WebExtension tabs API (`getId → −1`) and Ctrl-Tab. Selected when the last unpinned tab
closes (M:1032-1084) or the target space has no memory; URL-bar loads from it open a *new* tab — it never navigates.

**Last-selected bookkeeping.** `lastSelectedWorkspaceTabs` is a plain object uuid → tab (M:39). Writes: `onBeforeTabSelect`
M:2263, `_handleTabSelection` M:2329, tab insert M:2772, `onLocationChange` M:2835, move-to-space M:2970, `switchTabIfNeeded`
M:3262 (all resolve glance → parent). Deletes: space removed M:1351, tab moved out M:1599-1603. **Never pruned on tab
close**; reads guard on `tab.closing` (M:2287-2289, 2351). Priority (M:2319-2371): memory → empty tab → first visible
non-pinned → last visible → null if pinned+pending or closing.

**Cost model.** Per space ≈15 scaffold nodes + ~17 elements per tab (tab-js.patch:1-24) with a live `<browser>` unless
unloaded; memory is dominated by tab processes, not DOM. Nothing auto-unloads on switch; `unloadWorkspace` (M:1520-1539)
filters by space id, excludes empty/essential/pending, and discards.

**Our equivalent:** Render **only the active strip plus its two ring neighbours** as absolutely stacked React subtrees
(`translateX(d×100%)`, same shortest-path rule), and virtualise the tab list (`@tanstack/virtual`) — this removes Zen's
"un-hide everything during animation" cost. Animate with a CSS transition on `transform` (250 ms, `cubic-bezier(0.2, 0, 0,
1)` approximates a bounce-0 spring) and a 300 ms watchdog. Serialise switches through a single promise but coalesce: if a new
target arrives mid-animation, retarget rather than queue. Empty tab: not needed — the panel's search box opens
`chrome.tabs.create` directly; for "space has no tabs" show an empty state instead. Memory map: `lastSelected:
Record<spaceId, tabId>` in `chrome.storage.session`, pruned on `chrome.tabs.onRemoved`. Inactive spaces' tabs: hide via
`chrome.tabGroups.update ({collapsed:true})` (group-per-space) — the honest analogue of Zen's mounted-but-hidden strips.

---

## 5. Swipe / scroll switching physics

**Mouse wheel** (M:566-625, listener on the toolbox, `passive:true, capture:true`): processes only `deltaMode === 1` (line
mode → real wheels, not trackpads). `isVertical = deltaY && !deltaX`; vertical requires the modifier from
`zen.workspaces.scroll-modifier-key` (`ctrl`; allowed ctrl/alt/shift/meta; any other string = no modifier), horizontal needs
none. **Cooldown 200 ms**, **min |delta| ≥ 1**, direction `sign(delta) × (naturalScroll ? −1 : 1)` (pref `natural-scroll`
false in yaml, code fallback true, M:110). `preventDefault()` at M:610 is a no-op under `passive`. Wrap via `(i+offset+n) %
n` when `wrap-around-navigation` (true), else clamp — at an edge with wrap off it re-selects the same space → snap-back.
Mouse Back/Forward buttons while hovering the toolbox also switch (M:539-564).

**Trackpad swipe** (`ZenSpacesSwipe.mjs`, 211 lines): Gecko's `MozSwipeGestureMayStart / Start / Update / MozSwipeGesture /
MozSwipeGestureEnd` on the toolbox.

| Constant | Value | Where |
|---|---|---|
| delta multiplier | pref `swipe-actions.delta-multiplier` = 100, read **per Update event** | S:134-138 |
| strip width W | toolbox + splitter width, two non-flushing bounds reads per Update | S:27-36, 129 |
| rubber band | `f = min(1, 1 − |x| / (4.5·W))` | S:141-144 |
| direction lock | `|delta| > 0.9` | S:152 |
| commit threshold | none in JS — end event's `direction` decides (Gecko applied its own threshold) | S:171-176 |
| background cross-fade | `opacity = 1 − |x| / 200` | M:1899 |
| cancel | `popupshown` (once) ends the gesture | S:108, 204 |
| translate | each strip `translateX(d×100 + x/2 %)`; x = 200 ≈ one strip | M:1877-1885 |

Update accumulation: `x = lastDelta + delta·mult; f = …; if f > 0.5 { x *= f; lastDelta = delta + (x − delta)·0.5 } else x =
lastDelta` — the accumulator itself decays, so resistance compounds, and there is a hard stop past ≈2.25·W. MayStart bails
while a switch is in flight or over the foot buttons/floating URL bar; Start sets root `swipe-gesture` (disables
content-visibility hiding and scrollbars) and flips the static pref `zen.swipe.is-fast-swipe` (consumed natively). End:
`moveForward = (direction === RIGHT) !== isRTL` → `changeWorkspaceShortcut (±1, whileScrolling=true)` which starts the spring
from the current dragged transform (`existingTransform` keyframe, M:2133-2135). No Escape or reversal cancellation. Per
Update the handler synchronously writes N strip transforms + 2 background opacities + grain (2 props + attr) with no rAF
coalescing; also stashes the *next* space's gradient into the `-old` variables once per gesture (M:1908-1918).

**Our equivalent:** A side panel receives ordinary `wheel` events from a trackpad with `deltaMode 0` and per-frame `deltaX` —
that is enough for a live swipe. Implement: accumulate `deltaX` while `|deltaX| >
|deltaY|·1.5`, rubber-band `f = 1 − |x|/(4.5·W)`, write one `--swipe-x` custom property per rAF (never per
event), commit when `|x| ≥ 0.3·W` **or** velocity > 0.5 px/ms on gesture end (detected by a 80 ms idle timeout since Chromium
gives no end event), else spring back; 200 ms cooldown for discrete wheels (`deltaMode 1` or
|deltaX| ≥ 40 in one event). Modifier-vertical scroll: same `ctrl+wheel` rule. Natural-scroll inversion: read
from the first event's sign only. Native only: OS-level swipe with `is-fast-swipe` hints and Back/Forward button remap.

---

## 6. Theme / gradient engine

**Schema** (`getTheme`, G:1433-1440): `{ type:"gradient", gradientColors: [{ c:[r,g,b] | cssString, isCustom, algorithm,
isPrimary, lightness(0-100), position:{x,y}|null, type: "explicit-lightness"|"explicit-black-white"|null }], opacity, texture
}`. Max 3 colours (`MAX_DOTS`, G:76). `algorithm`/`lightness` are stored per colour but only `[0]` is read (G:1337-1338).
`position` is wheel pixels on a hard-coded 380×380 wheel (G:512-519). Opacity slider `[0.25 (win/linux) | 0.30 (mac), 0.8]`,
default 0.4; texture quantised to 1/16. `rotation` is not persisted (hard-coded −45°, G:1340). Empty `gradientColors` =
default theme. `fixTheme` (G:1807-1816) mutates the stored object to force one `isPrimary`.

**Colour math.** Primary = first `isPrimary`, else the middle item (G:1863-1873); a custom-string primary falls back to the
OS accent, resolved by reading a probe element's computed `color: AccentColor` (G:1818-1841). Dark/light is a **WCAG contrast
contest**, not a luminance threshold (`shouldBeDarkMode`, G:1391-1431): composite white@0.9 and black@0.9 (black's alpha
reduced by `zen.theme.dark-mode-bias` = 0.3 on translucent platforms) over the accent, compute contrast ratios with standard
sRGB linearisation (G:1308-1318), choose dark if white text wins. Result → `zen-should-be-dark-mode` on root, which sets
`color-scheme` **only inside `#browser`** (zen-theme.css:347-353) so popups follow the OS scheme. Text colour
`--toolbox-textcolor` = white/black at 0.9 blended 5-20 % toward the accent; `--zen-primary-color` is boosted in light mode
(`s+0.3`, `l·0.4+0.25`, G:1478-1493); every other token is `color-mix()` off it (zen-theme.css:23-62).

**Gradient string** (`getGradient`, G:1335-1389): 0 colours → flat neutral (`#131313`/`#e9e9e9`, or transparent on vibrancy
platforms); 1 → flat rgba; 2 → two stacked linear layers at 135° and −45° each fading to transparent; 3 → one linear (−5°) +
two radial layers anchored top-right/top-left; any custom colour → evenly spaced −45° linear. "Opacity" is both rgba alpha on
translucent platforms and a blend ratio into a neutral base (dark `[23,23,26]`, light `[240,240,244]`) elsewhere
(G:1258-1306). Texture = a 29 KB PNG grain tile at `opacity: texture` (`zen-browser-ui.css:90-107`). Harmony "algorithms" are
hue offsets from the primary: complementary [180], split [150,210], analogous [50,310], triadic [120,240] (G:197-206).

**Application and cross-fade** (`onWorkspaceChange`, G:1526-1805, 280 lines). Targets are two absolutely positioned layers —
`#zen-browser-background` (window) and `#zen-toolbar-background` (sidebar) — each with `contain: content; isolation: isolate;
will-change`. Steps: copy current `--zen-main-browser-background` → `…-old` (same for toolbar), reset
`--zen-background-opacity`; write new gradient vars; write root attrs/vars (`zen-should-be-dark-mode`, `--zen-primary-color`,
`--toolbox-textcolor`, `--toolbar-color-scheme`); notify content actors. CSS: `::after` = new background at `opacity:
var(--zen-background-opacity)`, `::before` = old at `1 − var`. The switch animates that single custom property 0→1 with
Motion (M:2045-2086) — since it is an unregistered custom property this means **per-frame JS inline style writes** on two
elements (not root). If a switch interrupts one, the start value is `1 − current` so layers swap seamlessly (M:2059-2063).
Swipe writes the property directly per event. Per-space results are memoised in `#gradientsCache` keyed by uuid
(G:1989-2030). Each `<zen-workspace>` also carries its own inline `color-scheme`, `--toolbox-textcolor`,
`--zen-primary-color` (ZenSpace.mjs:385-401) so neighbour strips render in their palette mid-swipe.

**Expensive bits.** Picker dot drag is an unthrottled document `mousemove` → full pipeline for **every window** including
root var writes (whole-chrome restyle) and picker SVG rebuild (G:1173-1218); opacity slider `input` at step 0.001 likewise;
three copies of the dominant/dark/primary decision chain (`onWorkspaceChange`, `getGradient`, `getGradientForWorkspace`).
Multi-window = direct iteration over all windows, each recomputing.

**Our equivalent:** Panel-side: port the pure functions (contrast-based dark decision, primary boost, the 1/2/3-colour layer
recipes) and store the same schema minus `position` and platform branches (`canBeTransparent = false` always; blend into the
neutral base at `opacity`). Cross-fade with two layers and a **registered** `@property --bg-opacity` transitioned over 250 ms
in CSS — no per-frame JS. Set `color-scheme` and 3 tokens on the panel root; derive the rest with `color-mix()`. Throttle
picker drags to rAF. Window/toolbar tint: **native** — add a private API `browserOS.theme.setWindowTint(windowId, {frame,
toolbar, accent, isDark})` that feeds a per-window `ColorProviderKey` user colour (Chromium's dynamic-colour path) and
animates the seed with a 250 ms `gfx::LinearAnimation`; a real gradient in the frame needs a paint shader in the frame view.
`chrome.theme` is static and global — unusable.

---

## 7. Workspaces button bar (space dots)

`<zen-workspace-icons id="zen-workspaces-button">` (`ZenSpaceIcons.mjs`, 218 lines), a CustomizableUI widget in the foot bar,
`container-type: inline-size` (WS:28-29). **Rendering** (`#updateIcons`, I:134-147): `innerHTML = ""` then one
`toolbarbutton` per space carrying `zen-workspace-id`, `tooltiptext` = raw name (no l10n), a context menu, and either an
emoji label, an `<img>` for `.svg` icons, or an 8px dot when no icon (WS:60-65). Rebuilt wholesale on every
`ZenWorkspacesUIUpdate` (add/remove/reorder, I:157-160). Active = `[active]` on the button + `selected=index` on the bar
(I:162-183); `scrollIntoView({smooth, inline: nearest})` on activation and on `mouseover` (I:17-25). **Hidden when ≤1**:
`dont-show` attr + `display:none` (I:141-145, WS:19-21).

**Overflow shrink** (`onWindowResize`, M:3290-3341; on window `resize` and after icon rebuilds; no ResizeObserver): expanded
mode only. `max=32, min=16, gap=3`; overflow ⇔ `n·(16+3) > barWidth` (non-flushing read) → `icons-overflow` attr; per-button
inline `width = clamp(16, (barWidth − 3·(n−1))/n, 32)` — continuous, not stepped. In overflow, non-active/non-hovered buttons
collapse to a 4px dot with the icon scaled to 0, 150 ms transitions (WS:107-127, overflow-icons.inc.css).

**Reorder drag** (`initDragAndDrop`, I:28-104): `mousedown` (button 0, no modifiers) + document `mousemove`/`mouseup`, no
pointer capture. Axis = Y when collapsed, X when expanded. `dragged` set immediately; **5px** threshold → `reorder-mode`
(others at 0.2 opacity). Per mousemove: `getBoundingClientRect()` on **every** sibling, `insertBefore` on midpoint crossing,
haptic when `nextSibling` changes (macOS `NSHapticFeedbackManager` alignment pattern via `Services.zen.playHapticFeedback`,
`cocoa/ZenHapticFeedback.mm:21-27`, gated by `zen.haptic-feedback.enabled`). Mouseup → `reorderWorkspace(id, idx)`
(M:1397-1432) → splice, broadcast to all windows → each window reorders strips with `moveBefore`, rebuilds icons, reruns
strip positioning.

**Our equivalent:** `SpaceDots` React component, keyed list (no innerHTML nuking), `hidden` when `spaces.length ≤ 1`, `title`
tooltip, `scrollIntoView` on active change. Overflow: CSS container query on the footer width with the same `clamp(16px,
calc((100cqw − 3px·(n−1)) / n), 32px)` expressed via a `--n` custom property — zero JS. Reorder: `@dnd-kit/sortable`
horizontal, 5px activation constraint, `navigator.vibrate` is unsupported on desktop → haptics native only.

---

## 8. Compact mode

**Native `ZenMouseTracker`.** An XPCOM service (`src/zen/compact-mode/components.conf:5-13`, IDL
`nsIZenMouseTracker.idl:18-41`): `registerWindow(window, edge, maxEdgeOffsetCssPx)`, `unregisterWindow`, one one-shot
observer topic `zen-mouse-tracker:exited`. macOS uses both a *local* and a *global* `NSEvent` monitor for mouse-moved/dragged
(`ZenMouseTrackerCocoa.mm:29-50`; AppKit routes moves to the key window even outside it); Windows a `WH_MOUSE_LL` hook
(`ZenMouseTrackerWin.cpp:16-41`); Linux throws and JS falls back to a timeout. Event-driven but **coalesced** — latest x/y in
atomics, at most one main-thread runnable pending (`ZenMouseTracker.cpp:27-29,144-164`); the monitor runs only while a window
is registered. Exit test (`:196-228`): pointer inside the window → DOM hover owns it; else it must be within `maxEdgeOffset ×
deviceScale` beyond the registered edge **and** within the window's extent on the other axis. Margins
`outside-window-edge-offset.horizontal` = 200, `.vertical` = 100 (DSF-scaled). Needed because Gecko gets no `mousemove` once
the pointer leaves the OS window and users overshoot the edge.

**State.** Root `zen-compact-mode` (C:173-201) and `zen-compact-animating` (re-entrancy guard + CSS scope). The toolbox is
shown if any of `zen-has-hover`, `zen-user-show` (keyboard pin), `zen-has-empty-tab`, `flash-popup`, `has-popup-menu`,
`movingtab`, `zen-compact-mode-active` is set (`compact-mode/sidebar.inc.css:151-156`); the top toolbar uses the same idea
plus `has-toolbar-hovered` on the tab panels to shift content. Central mutator `_setElementExpandAttribute` (C:734-783) also
unregisters the tracker when hover is removed.

**Timers.** `HOVER_HACK_DELAY` = pref `zen.view.compact.hover-hack-delay`, default **0** (C:70-73): every enter/leave is
deferred and re-checks `:hover`, absorbing the spurious `mouseleave` fired when a window-dragging toolbar hands the mouse to
the OS (Bugzilla 1979340). Sidebar linger `sidebar-keep-hover.duration` = **150 ms** (reuses the flash timer, C:880-886);
toolbar has none. No-tracker fallback `toolbar-hide-after-hover.duration` = **1000 ms** (C:933-942). Flash after tab select
`toolbar-flash-popup` (default **false**), **800 ms** (C:706-727; skipped in split view). Root `mouseleave` (C:902-957):
compute the crossed edge (10px tolerance), require the pointer within the element's extent ±7px, arm the tracker plus a
`{once}` document `mousemove` that collapses if the pointer re-enters elsewhere. `deactivate`/`sizemodechange` clear all
hover state. Popups: document `popupshowing/popuphidden` set `has-popup-menu` on the containing element — a single slot, not
a counter (ZenUIManager.mjs:361-417) — plus a MutationObserver polyfill for `:has([open],[panelopen])`
(ZenHasPolyfill.mjs:17-90). URL-bar focus counts as open; keyboard focus sets `supress-primary-adjustment` so it does not
also reveal the sidebar.

**Geometry / animation.** Hidden = toolbox `position: fixed; z-index 10; left: −width + separation/2 + 1px` — the **hover
strip is the toolbox's own ~4px sliver** left on-screen, full height (`sidebar.inc.css:67-102`); 0.15 s ease to hide, 0.25 s
custom spring `linear()` to show. Mode enter/exit animates `margin-left` 0 → −width with Motion, `spring, bounce 0, 0.12 s`
(C:475-628). Toolbar hidden = height clamped to the separation with contents at opacity 0, 0.15 s.

**Keyboard / edge cases.** `cmd_toggleCompactModeIgnoreHover` = **Accel+S** (sets `_ignoreNextHover` so a pointer resting
over the sidebar does not reopen it), `cmd_zenCompactModeShowSidebar` = **Accel+Alt+S** (`zen-user-show`). DOM fullscreen
excluded via `:not([inDOMFullscreen])` with a flash on exit; popup windows never compact; right-side sidebar registers edge
"right"; macOS traffic lights are a third hoverable with rect exclusion; tab drag keeps it open; background tabs opened while
hidden raise a toast; an "illegal state" fixer forbids collapsed + left window buttons + toolbar-only hide (C:348-374).

**Our equivalent:** native only for the mechanism. An extension cannot hide/reveal the browser's own side panel over content,
read the cursor outside the window, pin the panel open during native menus/tab drags/fullscreen, or shift page content.
Native patch: a `BrowserView` compact mode hosting the side panel as an overlay `views::Widget` with a 4-5 px hit strip,
slide animations (0.25 s show / 0.15 s hide / 0.12 s toggle), a cursor tracker polling
`display::Screen::GetCursorScreenPoint()` (coalesced, armed only while hidden-and-hovered, 200/100 px × DSF), hooks on menu
show/hide, widget activation/bounds, fullscreen and `TabDragController`, plus the two accelerators. The panel itself does the
150 ms linger, 1 s fallback, 800 ms flash, `:hover` re-check after leave, its own menu refcount, its icon-only collapse, and
reports `{pinned, hovered}` to native over messaging.

---

## 9. Glance

**No separate overlay element.** A glance is a real `gBrowser` tab whose standard per-tab panel (`tabpanels >
.browserSidebarContainer > .browserContainer > .browserStack > browser`) is restyled into the overlay (`fillOverlay`,
GL:263-267). Nothing is reparented and no docshell is swapped. Added DOM = three toolbar buttons cloned from a template
(`zen-glance.inc.xhtml:5-11`, GL:466-472) and a transient snapshot `<image src=blob:>` (GL:523-532).

**Tab creation** (`#createTabOptions`, GL:211-222): background, `insertTab`, `ownerTab` = current, `skipRoute`. The `<tab>`
element is **physically appended inside the parent tab's `.tab-content`** with `zen-glance-tab` and a shared `glance-id`
(GL:231-240); registry `#glances: Map<id, {tab, parentTab, browser, snapshot}>`. Strip hiding is structural: the tab counters
skip glance tabs (tabbrowser-js.patch:30-70), `tab.glanceTab` getter (tab-js.patch:164-166), opener/pin/unpin redirect to the
parent.

**Parent dimming and z-order.** Parent panel gets `zen-glance-background`, glance panel `zen-glance-overlay`; **both keep
`deck-selected`** via a `tabbox.js` patch (`toolkit/content/widgets/tabbox-js.patch:33-35`, `shouldShowDeckSelected`
GL:1867-1893). Both browsers keep rendering through a patched `zenModeActive` flag that ORs into
`browsingContext.isActive`/`renderLayers` (browser-custom-element-mjs.patch:10-15) and exempts them from tab unloading. Dim =
Motion spring `scale 1→0.97, opacity 1→0.3, 350 ms, bounce 0.2` (GL:477-494); reverse at duration/1.5. Click-outside = a
click on the overlay panel's own 20 % side gutters (GL:148-155).

**Sizing / animation.** Final `width: 80%; height: 100%`, centred, native inner radius (`zen-glance.css:125-157`). Snapshot =
parent-process `drawSnapshot` of the chrome window at the child-reported link rect, offset by the tab panels' rect
(GL:315-336) → `OffscreenCanvas → blob URL` (GL:1019-1030). Arc = **80 steps**, arc height `min(0.2·distance, 20px,
0.6·available)` toward the roomier side (GL:622-756, 787-799); per-step `easeOutBack (c1 0.4)` opening, `1 − (1−t)^6`
closing; duration `zen.glance.animation-duration` = **350 ms**; output is x/y/scaleX/scaleY so it is compositor-only. Content
fades in over duration/4 ≈ 87 ms when a snapshot exists.

**Actors.** `ZenGlance` JSWindowActor (`ZenActorsManager.sys.mjs:40-59`, capture `mousedown/keydown/click`, all frames).
Child: `mousedown` records the larger of anchor/target rect + pointer; `click` requires button 0, an anchor, not
`defaultPrevented`, **exactly one** modifier (XOR trick, `ZenGlanceChild.sys.mjs:46-48`) matching
`zen.glance.activation-method` = `alt`, drag threshold **4 px** (`:29`), `javascript:` blocked,
`checkLoadURIStrWithPrincipal`; Escape → close with `hasFocused`. Parent re-validates the URL against the principal
(GL:362-376).

**Expand / split.** `fullyOpenGlance` (GL:1619-1652): mark `zen-dont-split-glance`, `moveTabAfter(glance, parent)` (pulls the
`<tab>` out of the parent's content into the strip), strip attrs, select, un-dim, `scale [1, 1.005, 1]` 250 ms, then a
no-animation close that only cleans the map. Accel+O. Split = expand `{forSplit}` then `splitTabs([parent, glance], "vsep")`
(GL:1789-1815), disabled at 4 panes. DOM fullscreen inside a glance auto-expands.

**Close semantics** (all → `closeGlance`, GL:852-895): Escape (3 s `waitconfirmation` on the close button only when content
had focus, GL:930-948), gutter click, close button, parent `TabClose`, `gBrowser.removeTab(glance)` intercepted by
`manageTabClose` (tabbrowser-js.patch:658-660), the pinned-tab unload path, quit. **Selecting another tab does not close it**
— `quickCloseGlance` hides it and it re-shows when parent/glance is reselected (GL:1408-1436, 386-393). Guards `_animating`,
`animatingOpen`, `closingGlance`, `#duringOpening`, `#ignoreClose`; `permitUnload` honoured unless skipped; if closing would
leave one tab, a new tab is opened first. One *visible* glance at a time, one per parent in the map. Persistence:
`zenGlanceId`/`zenIsGlance` are collected but **never read on restore** — a glance comes back as a plain tab.

**Why an iframe is weaker.** A framed document is blocked by `X-Frame-Options`/CSP `frame-ancestors` on most login-bearing
sites, gets partitioned third-party cookies (a different session than the tab), has no tab-level
history/omnibox/find/zoom/PiP, attributes permission prompts and downloads to the panel origin, and lives in the panel's
process rather than under site isolation. Zen avoids all of it because the glance *is* a first-class tab; the overlay is CSS
on the tab's own panel plus two panels kept in the deck.

**Our equivalent:** native only: create a real `WebContents` via `TabStripModel::AddWebContents` flagged as glance (hidden
from the strip by a model observer), host it in a `views::WebView` layered above the active `ContentsWebView` in
`BrowserView`, dim the underlying layer (opacity 0.3, scale 0.97, 350 ms via `ui::LayerAnimator`), arc from a link rect sent
by a renderer IPC on modifier-click (4 px threshold, exactly-one-modifier rule), expand = clear flag + `ActivateTabAt`. The
panel renders the glance child as a nested row under its parent and receives `onGlanceChanged`. Extension-only fallback:
`chrome.windows.create({type: "popup"})` — a real tab, but a separate OS window with none of the overlay semantics.

---

## 10. Split view

**Model** (SV:9-71): `SplitLeafNode {tab, sizeInParent %, positionToRoot {top,right,bottom,left} %, parent}` and `SplitNode
{direction: "row"|"column", children}`. Invariants: a non-leaf never has one child; a node never shares its parent's
direction (`removeNode` collapses, SV:638-677). Group record `{groupId, tabs[], gridType: "grid"|"vsep"|"hsep", layoutTree}`
(SV:1508-1514); **`MAX_TABS = 4`** (SV:87). `calculateLayoutTree` (SV:1632-1664): `vsep`/2-tab grid → row of equal leaves;
`hsep` → column; 3-4 `grid` → row of `ceil(n/2)` columns each holding two 50% leaves, odd tail a single leaf.

**Layout application.** `applyGridLayout` (SV:1729-1781) writes percentage `inset` on each tab's own panel; panels stay
children of the tab panels deck, made absolute by `[is-zen-split]` (zen-split-view.css:53-65), non-split siblings collapse;
visibility for non-selected split panels is granted by a `xul.css` patch (toolkit/content/xul-css.patch:6-12). Gaps = margins
from the element-separation var. Splitters = divs in an overlay layer with `pointer-events: none` wrapper, positioned by
`inset` (SV:1789-1827); thickness = gap. **Resize** (SV:1871-1942): document `mousemove` inside rAF; delta% = px / panelSize
× rootToNodeSize × 100; walk siblings on the drag side shrinking each down to **`min-resize-width` = 7 %** until absorbed,
remainder to the neighbour; `zen-split-resizing` disables the 90 ms inset transition. Rearrange drop zones: edge band 24 %
(pref name mismatch: yaml declares `rearrange-hover-size`, code reads `rearrange-edge-hover-size`, so the yaml value is
dead); centre = swap, edge = remove + split at 0.5. Drag a strip tab onto content (`enable-tab-drop`): 10px dead border,
outer-quarter bands, a fake pane animates the tabbox padding to width/(n+1) in 0.1 s with haptics (SV:325-531);
pinned/essential members are **duplicated** rather than moved (SV:1393-1417).

**Strip grouping.** Members go into a real Firefox tab group with `split-view-group` and no label (SV:2382-2408); CSS renders
it as one pill with `flex:1` members, 1px dividers, close buttons on hover ≥70px (`zen-split-group.inc.css`). Active pane =
`gBrowser.selectedTab` (2px outline); `mousedown` in a pane selects that tab (SV:1858-1869). Selecting any member activates
the group (SV:1541-1630): `zenModeActive` on all, hover headers (rearrange + unsplit), lazy browsers inserted with a
`TabSplitViewActivate` event. Closing a member: <3 left → dissolve; else `removeNode` rebalances by `100/(100−removed)`
(SV:645-646). Alt-click on a strip tab toggles membership (`enable-tab-click-split`).

**Shortcuts / commands.** Accel+Alt+G/V/H/U (`ZenKeyboardShortcuts.mjs:814-858`); "new empty split" Accel+Shift+* splits with
the empty tab and opens the URL bar in new-tab mode, swapping the pane for the resulting tab (SV:2549-2628). Firefox 153's
native split keys are disabled. **Persistence:** `winData.splitViewData = [{groupId, gridType, layoutTree, tabs:[ids]}]`
(SV:2410-2437), restored after workspaces (SessionStore patch:297) with `_sessionRestoring`.

**vs Chromium 151 native split view** (`tabs::SplitTabData`, `MultiContentsView` + `MultiContentsResizeArea`): exactly two
tabs, paired in the strip, draggable divider, swap, ratio persisted in session restore. Zen adds: up to 4 panes in a nested
row/column tree; grid/vsep/hsep presets and shortcuts; drag-to-edge zones on the content; in-pane rearrange with swap/split;
per-group persisted tree with sizes; per-pane hover header; empty-split into the omnibox; Alt-click membership; group pill in
the sidebar.

**Our equivalent:** keep Chromium's 2-pane split natively (already present); expose `browserOS.split.{create(ids, layout),
remove(id), setRatio, onChanged}`. Do presets/shortcuts, the group pill rendering (members rendered as one row with `flex:1`
segments), and Alt-click in the panel. 3-4 panes = a `MultiContentsView` C++ change — defer. Drag-to-edge on content = native
drop target in `BrowserView`.

---

## 11. Persistence & startup

**Per-tab session fields** (`TabState.collect` patch, TabState-sys-mjs.patch:17-30,46-48): `zenWorkspace`, `zenSyncId`,
`zenEssential` (also forces `pinned`), `zenDefaultUserContextId`, `zenPinnedIcon` (**never read**), `zenIsEmpty`,
`zenStaticLabel`, `zenHasStaticIcon` (+ `image` overridden), `zenGlanceId`/ `zenIsGlance` (never restored),
`_zenPinnedInitialState`, `_zenIsActiveTab` (dedupe winner across synced windows), `zenLiveFolderItemId`. Read back in
`ZenSessionStore.mjs:17-41` and SessionStore patch:305-323. **Per-window:** `spaces` (+ `hasCollapsedPinnedTabs`),
`activeZenSpace`, `folders`, `splitViewData`, `isZenUnsynced` (patch:246-256); restored inside `restoreWindow` before tabs
exist, in the order folders → workspaces → split view (patch:292-297).

**Global "sidebar" blob** (`ZenSessionManager.sys.mjs`): `{lastCollected, tabs, folders, splitViewData, groups, spaces}`
(SM:732-789) — folders/groups/spaces/splits from the **first** saveable window only, tabs merged across windows by
`zenSyncId` with `_zenIsActiveTab` winning. File `<profile>/zen-sessions.jsonlz4` (lz4 `JSONFile`, SM:45,126-128), written on
**every** Firefox session save (15 s interval plus Zen's extra triggers
`TabAddedToEssentials/TabRemovedFromEssentials/TabMove/TabGroupMoved/ZenWorkspaceDataChanged`), each save also copying to
`zen-sessions-backup/clean.jsonlz4` (SM:605-611). Rotating backups via a 10-minute `DeferredTask` (SM:54), 3-hour buckets,
keep 20. An empty `spaces` array on read is treated as corrupt → recovery order clean → newest dated backup (SM:134-149,
251-277). At crash-checkpoint time the blob **overwrites** every normal window's tabs/groups/splits/folders/spaces
(SM:798-841). Auto-restore is forced on.

**Startup ordering:**
1. `MozBeforeInitialXULLayout` → `gZenWorkspaces.init()` (ZenStartup.mjs:57): prefs, active id.
2. `gZenPinnedTabManager.init()` resolves `promisePinnedInitialized` **synchronously** (P:81).
3. `restoreWindow` → `restoreWorkspacesFromSessionStore` (M:742-782): cache from window data → migration → default "Space";
   `#initializeWorkspaces` (M:784-824) builds strips + empty tab; then `await Promise.all([promisePinnedInitialized,
   promiseAllWindowsRestored])` (M:79-87) → `changeWorkspace(active, {onInit})` → **`_resolveInitialized()`** →
   `#clearAnyZombieTabs()` (un-awaited) → Tab* listeners.
4. Tabs are created lazily; the pinned snapshot is restored before `pinTab`; selected-tab handling is deferred
   (tabbrowser-js.patch:520-534).
5. `_delayedStartup` → `selectStartPage` (M:826-953) awaits `promiseInitialized`, dedupes homepage tabs unless
   `continue-where-left-off`, dispatches `AfterWorkspacesSessionRestore` (split view activates on it; glance has no hook).
6. `delayedStartupFinished` (ZenStartup.mjs:81-115) → compact mode → `gZenStartup.promiseInitialized` (gates window sync);
   then `sessionstore-windows-restored` → window-sync backfills ids and snapshots.

**Multi-window sync** (`ZenWindowSync.sys.mjs`, 1760 lines): **real tab clones** — `TabOpen` in one window creates a lazy
`about:blank` twin with the same `id` in every other synced window (WSync:1366-1405); content lives in one window and the
**docshell is swapped** between twins on `TabSelect`/`focus` and on window close (WSync:1122-1171, 739-760, 1073-1114).
Synced: open/close, icon/label (owner only), move/pin/unpin/essential (position by previous-sibling id), hide/show,
groups/folders, splits, the spaces list, pinned snapshot. 18 capturing listeners per window. Serialised through one promise
chain; **events from another window arriving mid-flight are dropped** (WSync:401-408). Cost O(windows) per event, O(windows ×
tabs) at startup.

**Migrations / zombies.** UI ladder `zen.ui.migration.version`, `MIGRATION_VERSION = 8` (`ZenUIMigration.sys.mjs:14-178`); no
separate workspace schema version; Places → file migration runs when the session file has no spaces (SM:294-307, 485-556).
`#clearAnyZombieTabs` (M:1008-1030): tabs whose space id is unknown (non-essential) or pinned empty tabs → unpin + remove
without session-store; an unknown `activeWorkspace` coerces to the first space (M:631-644). Observed races: snapshot object
shared by reference across windows; `editPinnedUrl` stores `title: undefined`; blob taken from window[0]; IO amplification
per save; `saveState` before `readFile` throws; double `setTimeout(0)` for collapse restore; dead `WeakMap.size` check
(WSync:1592).

**Our equivalent:** `chrome.storage.local` holds the durable model (schema in §14), written only by the background reconciler
with a 500 ms debounced batch write and a `schemaVersion`; `chrome.storage.session` holds runtime maps (`tabId → tabKey`,
`lastSelected`, group ids). Startup reconcile on `chrome.runtime.onStartup`/`onInstalled` and on panel open:
`chrome.tabs.query({})`, re-link keys by `(windowId, index, url)` then group membership (Chrome's session store cannot carry
our fields), create missing groups, drop zombies (keys with no live tab after 24 h, spaces without a group). One cumulative
migration ladder. Multi-window: one tab group per window per space; never clone tabs.

---

## 12. Performance and memory techniques

Worth adopting from Zen: non-flushing bounds reads and rAF-wrapped ResizeObserver callbacks; lazy browsers for
pinned/essentials; `content-visibility` on inactive strips at rest; `contain`/`isolation`/`will-change` on the two gradient
layers; PNG grain instead of an SVG filter; per-space gradient memo; a watchdog race on every animation promise; explicit
discard as the memory lever; coalesced native mouse tracking that costs nothing when unarmed; drift checks limited to
top-level navigations.

Pitfalls to avoid (with Zen's location):
- **Un-hiding every strip during switch/swipe** (WS:405-408) — full layout of all spaces per gesture.
- Per-event synchronous style writes with no rAF batching in swipe (S:122-160) and per-mousemove root variable writes in the
  theme picker (G:1173-1218) — whole-tree restyle.
- `getBoundingClientRect` per sibling per mousemove in dot reorder (I:62), per browser in drop-edge animation (SV:435-452),
  per group in collapse relayout (ZenFolders.mjs:496-534).
- O(n) counters (`_numZenEssentials`, `pinnedTabCount`) called inside drag loops and index clamps.
- Synthetic `resize` cascades guarded by boolean flags (`_processingResize` never set, M:3298).
- `innerHTML=""` rebuild of the dot bar on every model change (I:134-147).
- Unbounded/unpruned maps: `lastSelectedWorkspaceTabs` (never pruned on close), dangling `{once}` key listeners per hover
  (P:185-198).
- Switch serialisation without coalescing; animations `complete()`d (jump) rather than retargeted.
- Copying `_workspaceCache` on every `getWorkspaces()` call, including per swipe frame (M:705).
- Session IO amplification (write + copy on every save at 15 s).
- Prefs read inside hot handlers (`getIntPref` per swipe Update, S:136).

**Our equivalent:** virtualised tab lists; mount ≤3 strips; one rAF scheduler for all gesture writes (`--swipe-x`,
`--bg-opacity`); registered `@property` transitions instead of JS-driven custom properties; counts kept in the store (not
recomputed); a single ResizeObserver on the panel root; `chrome.tabs` events fed through one reducer with
`requestIdleCallback`-batched storage writes; prune maps on `tabs.onRemoved`; `chrome.tabs.discard` for inactive spaces on a
timer (e.g. 15 min idle) instead of hiding.

---

## 13. Complexity hotspots to simplify

| Hotspot | Lines | Simplification |
|---|---|---|
| `#animateTabs` M:1996-2234 | 240 | Split into `planSwitch(prev, next) → {stripTransforms, essentialsMotion, bgFade}` (pure) and `applyPlan()`. |
| `_updateEvent` ZenUIManager.mjs:1309-1583 | 275 | Derive layout attrs from one state object; no synthetic resize. |
| `onWorkspaceChange` G:1526-1805 + 2 duplicate decision chains | 280 | One pure `computeTheme(theme, scheme) → tokens`, memoised. |
| `onCloseTabShortcut` P:318-457 | 140 | Table-driven `{reset, unload, switch, close}` bits per setting; no early return. |
| `moveToAnotherTabContainerIfNecessary` P:751-936, `applyDragoverClass` P:1047-1176 | 185/130 | One drop-target resolver returning `{section, index}`. |
| Essentials visibility rule duplicated 6× (getEssentialsSection, strip organiser, animateTabs, `_shouldShowTab`, `canEssentialBeAdded`, drop) | — | Single `isEssentialVisible(tab, space)` selector. |
| Shortest-path wrap duplicated 3× | — | One `ringDelta(i, j, n)`. |
| 162 prefs, 17 for workspaces alone; several with yaml/code default mismatches (`natural-scroll`, `sync-only-pinned-tabs`, `rearrange-hover-size`, `drag-over-split-*`) | — | ≤12 user settings with typed defaults in one module. |
| Container-scoped essentials (per-container grids, cross-fade rules, drop demotion) | — | Drop; no Chromium containers. |
| 5/6/9 essentials column hacks, `data-hack-type` | — | Fixed 3-column grid. |
| Window-sync tab cloning + docshell swapping (1760 lines) | — | Never clone; per-window groups. |
| Empty-tab special-casing across ~12 patch sites | — | No empty tab. |
| Glance tab-inside-tab DOM + counter exclusions | — | Native overlay; panel shows a nested row. |
| Double `setTimeout(0)`, `HOVER_HACK_DELAY`, `_ignoreNextResize` flags | — | State machine with explicit phases. |

**Our equivalent:** a single typed store + pure selectors (no DOM-as-model), ≤12 settings, fixed 3-column essentials, group-per-space instead of tab cloning, and native APIs for glance/split/compact so the panel never special-cases them.

---

## 14. Blueprint for our side panel

**Modules**
- `core/model.ts` — types + pure reducers: `spaces`, `tabs` (keyed), `essentials`, `pinned`, `theme`. Selectors:
  `visibleTabs(spaceId)`, `isEssentialVisible`, `ringDelta`, `selectionFor(space)`.
- `core/theme.ts` — `computeTheme(themeSpec) → {bg, toolbarBg, accent, text, isDark, grain}`.
- `host/HostAdapter.ts` — interface; `ChromeHostAdapter` (extension APIs) and `BrowserOSHostAdapter` (private APIs), method
  list: `listTabs(windowId)`, `activate(tabId)`, `create({url, spaceId, pinned})`, `close(ids)`, `discard(ids)`, `move(tabId,
  {index, groupId})`, `setPinned(tabId, bool)`, `navigate(tabId,url)`, `ensureGroup(windowId, spaceId) → groupId`,
  `setGroupCollapsed(groupId, bool)`, `getFavicon(url)`, `setWindowTint(windowId, tint)` (native), `openGlance(tabId, url,
  rect)` (native), `split(ids, layout)` / `unsplit(id)` (native), `setCompact(pinned)` (native), `onTabEvent(cb)`,
  `onWindowFocus(cb)`, `onGlanceChanged(cb)`, `onSplitChanged(cb)`.
- `background/reconciler.ts` — service worker: owns `chrome.storage` writes, startup reconcile, zombie cleanup,
  group-per-space maintenance, drift detection, discard timer, migrations.
- `panel/` (React): `PanelRoot`, `SearchBox`, `EssentialsGrid`, `SpaceCarousel`, `SpaceStrip`, `SpaceHeader`,
  `PinnedSection`, `Separator`, `TabList` (virtualised), `TabRow`, `FooterBar`, `SpaceDots`, `ThemePicker`, `useSwipe`,
  `useTheme`, `useCompactTimers`.

**Storage schema** (`chrome.storage.local`)
```json
{ "schemaVersion": 1,
  "spaces": [{ "id": "uuid", "name": "Work", "icon": "💼", "pinnedCollapsed": false, "createdAt": 0,
               "theme": { "colors": [{ "c": [r,g,b], "isPrimary": true }], "opacity": 0.4, "texture": 0 } }],
  "activeSpaceId": "uuid",
  "essentials": ["tabKey1", "tabKey2"],
  "tabs": { "tabKey1": { "spaceId": "uuid|null", "pinned": true, "essential": true, "order": 3, "lastSeenAt": 0,
                         "snapshot": { "url": "", "title": "", "favIconUrl": "" }, "staticTitle": null } },
  "settings": { "closeBehavior": "reset-unload-switch", "wrap": true, "naturalScroll": false,
                "scrollModifier": "ctrl", "essentialsMax": 12, "switchMs": 250 } }
```
`chrome.storage.session`: `{ "tabIdToKey": {}, "lastSelected": { "spaceId": tabId }, "groupIds": { "windowId:spaceId":
groupId }, "compact": { "pinned": false } }`.

**Event flow**
```
chrome.tabs.on{Created,Updated,Removed,Moved,Activated,Detached,Attached}
  → background reducer (assign/lookup tabKey, drift check, lastSelected)
  → debounced storage write (500 ms) + runtime message "state" to open panels
panel: user action → HostAdapter call → (host event above) → state → React render
panel: switch(space) → plan = ringDelta/theme → CSS vars (--strip-x, --bg-opacity) →
  HostAdapter.setGroupCollapsed(old,true)/(new,false) + activate(selectionFor(new)) →
  native setWindowTint (fire-and-forget)
panel: swipe wheel → rAF-batched --swipe-x → commit/cancel → switch(space)
native: glance/split/compact events → HostAdapter callbacks → state
```

**Constants borrowed from Zen**
| Constant | Value |
|---|---|
| Space switch / cross-fade / essentials slide | 250 ms, bounce-0 spring (+50 ms watchdog) |
| Pinned-section collapse | 120 ms easeInOut |
| Compact: sidebar linger / toolbar fallback / flash / mode toggle / show / hide | 150 ms / 1000 ms / 800 ms / 120 ms / 250 ms / 150 ms |
| Compact outside-window margin | 200 px horizontal, 100 px vertical, DSF-scaled; hover strip 4-5 px |
| Wheel switch cooldown / min delta | 200 ms / 1 |
| Swipe rubber band / bg fade unit | `1 − |x|/(4.5·W)`; `1 − |x|/200` |
| Glance | 350 ms arc, 80 steps, 80 % width, scale 0.97 + opacity 0.3 backdrop, 4 px drag threshold, 3 s Escape confirm |
| Split | max 4 panes, min pane 7 %, edge zone 24 %, drag-over delay 500 ms |
| Essentials | max 12, tile 46 px, gap 4 px, grid transition 300 ms |
| Dots | 32→16 px, gap 3 px, 5 px reorder threshold, 150 ms transitions |
| Sidebar | 230/186 px default, 150 min, 500 max, 60 px icon-only, 48 px tab square, 36 px row |
| Drag-to-edge switch | 20 px zone, 500 ms hold |
| Session write debounce / backup | 15 s cadence (ours: 500 ms batched), 10 min rotation |

**Build order (6 slices)**
1. **Model + reconciler + group-per-space**: storage schema, tabKey linking, startup reconcile, zombie cleanup,
   `activeSpaceId`, `lastSelected`, collapse/expand groups on switch.
2. **Panel skeleton**: search box, space header, pinned/normal sections with virtualised `TabList`, footer dots (hidden ≤1),
   keyboard next/prev, icon-only mode.
3. **Essentials + pinned semantics**: 3-wide grid, max 12, snapshot/drift/reset, discard-on-close (`Cmd+Shift+W`), `@dnd-kit`
   reorder across essentials/pinned/normal.
4. **Carousel + swipe + theme**: ±1 neighbour strips, `translateX` switch, wheel/trackpad physics, two-layer gradient
   cross-fade with registered `@property`, theme picker; native `setWindowTint` hook.
5. **Native slice A**: compact mode (overlay panel, hit strip, cursor tracker, two accelerators) and split-view bridge
   (2-pane native + presets in panel).
6. **Native slice B**: glance overlay `WebContents`, tab-drop targets on content, per-window frame gradient painting; then
   polish (haptics, toasts, multi-window audits).

