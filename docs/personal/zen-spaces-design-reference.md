# Zen "Spaces" — Interaction Design Reference (for re-implementation in BrowserOS)

Behavior-level extraction from the Zen Browser source. **No code, CSS, or assets are
reproduced.** This describes *what the product does* so the same UX can be rebuilt from
scratch on Chromium as an extension + (where flagged) native patches.

Terminology: Zen's internal name is "workspace"; the user-facing name is **Space**. Used
interchangeably below.

---

## 1. Space data model

### 1.1 Fields on a Space

| Field | Type | Notes |
|---|---|---|
| `uuid` | string (v4) | Stable identity. Tabs reference it. |
| `name` | string | User-editable. Default derived from the container/profile label ("Default", or the container's name), or "Space". |
| `icon` | string \| empty | Either an **emoji grapheme** or a path to an SVG glyph. Empty = no icon; UI then falls back to the first grapheme of the name, uppercased. |
| `theme` | object | `{ type: "gradient", gradientColors: [...], opacity: number, texture: number }` (legacy records also carried `rotation`). Drives the whole-window background gradient, accent color, and light/dark scheme for that space. |
| `containerTabId` | int | Link to a **container / contextual identity** (Firefox containers ≈ a cookie-jar profile). `0` = default. This is the "profile link". |
| *position* | implicit | **Ordering is array order**, not a stored integer, in the live model. (The legacy DB migration did have a `position` column.) |
| `hasCollapsedPinnedTabs` | bool | Session-only UI state: was the pinned section collapsed. Stripped from the runtime model after restore. |

Notably **not** on the space: the list of its tabs. Membership is stored on the *tab*.

### 1.2 Derived / runtime state

- `activeWorkspace` — uuid of the current space, also mirrored into a pref so it survives restart.
- `lastSelectedWorkspaceTabs` — map `spaceId → tab`, the per-space "last active tab" memory.
- `creatingWorkspaceId` — the space currently showing the inline creation form (it shows the
  form *instead of* tabs/essentials, and therefore owns no essentials row).

### 1.3 Persistence & restore

- Spaces are **global to the browser, not per-window**. They live in the session store's
  "sidebar" blob and are written into every window's window-data on save, and re-broadcast to
  every open window on change.
- Restore order at startup: read spaces array + `activeZenSpace` from session data → if empty,
  fall back to a one-time migration from the old Places DB table → if still empty, synthesize a
  single default space. Then build one DOM section per space, restore per-space pinned-collapse
  state, select the active space, and only then resolve the "spaces initialized" promise that
  the rest of the browser awaits.
- **Per-tab persisted fields** (this is what makes tabs come back into the right space):
  `zenWorkspace` (space id), `zenEssential` (bool), `zenPinnedId`/`zenSyncId` (stable tab id),
  `zenStaticLabel` (user-renamed title), `zenHasStaticIcon` + `image` (user-set icon),
  `zenDefaultUserContextId`, `_zenPinnedInitialState` (the canonical pinned URL/title/icon),
  `zenIsEmpty`, `zenLiveFolderItemId`.
- **Multi-window**: all windows share the same space list and the same pinned/essential tabs
  ("window sync"). A window can be opted out (`unsynced window`, own shortcut) — it gets no
  spaces UI at all. Private windows are always unsynced/disabled.
- **Zombie cleanup** on startup: any tab whose `zenWorkspace` points at a space that no longer
  exists is unpinned and closed.

---

## 2. Tab ownership & space switching semantics

### 2.1 Ownership rule

- Every non-essential tab carries exactly one `zenWorkspace` id. A tab with no id is silently
  adopted into the currently active space the first time it is evaluated.
- **Essentials carry no space id at all** — they are global (see §3).
- Visibility predicate, evaluated per tab:
  1. Glance child tabs → always visible.
  2. Closing tabs → never visible (deliberate: keeps them out of "last active" memory).
  3. Essentials → visible everywhere, unless *container-specific essentials* is on, in which
     case visible only in spaces whose container matches; in a container-less space, only
     essentials with no container **or** whose container is not claimed by any space.
  4. Everything else → visible iff its space id == active space id.

### 2.2 What actually happens on switch

Zen does **not** hide/show tabs one by one. All spaces exist in the DOM simultaneously as
side-by-side strips; switching translates the strip carousel horizontally by
`index_delta × 100%` (wrapping via shortest-path so 1→N animates one step, not N−1 steps).
Default animation ~250 ms, spring. Consequences to preserve:

- The gradient background, accent color, and color-scheme cross-fade between the two spaces.
- The essentials row only animates/cross-fades when the *container* actually changes.
- The strip is reversible mid-gesture (swipe can be abandoned).

### 2.3 Which tab becomes active

Priority order on switching into space S:

1. Before leaving, the currently selected tab is recorded as `lastSelected[oldSpace]`.
2. `lastSelected[S]` if it still passes the visibility predicate.
3. Otherwise the **empty tab** (see §2.5).
4. Otherwise the first visible non-pinned tab.
5. Otherwise the last visible tab.
6. Never an essential, never a pinned tab that is still unloaded.

Reverse direction: selecting a tab that belongs to another space (Ctrl+Tab, history, a link
handler, `chrome.tabs.update` equivalent) **auto-switches the browser to that tab's space**
first, and records it as that space's last-active.

### 2.4 Moving tabs between spaces

- Entry points: tab context menu → "Move to space" (works on multi-selection); drag the tab
  onto a space icon in the space bar; drag to the left/right edge of the sidebar and hover.
- Moving rewrites the tab's `zenWorkspace`, physically relocates it into the target space's
  pinned or normal section (preserving pinned-ness), and moves its Glance child with it.
- Split-view groups move as a unit (all member tabs rewritten together).
- Essentials refuse to move (they are already global).
- If the moved tab was `lastSelected` for the old space, that memory is cleared.
- After an explicit "move tab to space", the browser switches to the target space and selects
  the moved tab.
- **Drag-to-switch**: hovering a tab drag near the sidebar's left/right edge (20 px padding)
  for 500–1000 ms switches to the prev/next space, without wrap. Hovering over the essentials
  row suppresses this.

### 2.5 New-tab behavior & the "empty tab"

- Each window keeps one hidden, pinned-less **empty tab** (`about:blank`, lazy). It is always
  re-stamped with the active space id and kept first in the strip. It is the target when a
  space has nothing to select, and it is what the URL bar opens onto. It is excluded from every
  count, from close-all sweeps, and from space deletion.
- New tabs inherit the active space and the active space's container. If *force container →
  space* is on and exactly one space matches a requested container, the new tab is routed to
  that space instead.
- Closing the last *visible* tab in a space selects the empty tab rather than closing the
  window (unless the "close window with last tab" setting says otherwise). An optional setting
  makes this trigger even when pinned tabs remain.
- Navigating a **pinned** tab to a different domain opens a new tab instead of navigating
  in place (setting `open-pinned-in-new-tab`, default on).

---

## 3. Pinned tabs vs Essentials

| | Pinned | Essential |
|---|---|---|
| Scope | One space | **Global across all spaces** (optionally scoped by container) |
| Space id | set | removed |
| Where rendered | Per-space pinned section, above normal tabs | Shared grid row above the whole strip |
| Shape | Full row: icon + title | Icon-only tile |
| Max | unbounded | 12 (configurable) |
| Rename / edit title | yes | no |
| Close from context menu | yes | hidden |
| Reset / unload buttons | yes | hidden |
| "URL drifted" indicator | yes | never |
| Can live in a folder | yes | no (adding to a folder demotes it) |
| Ordering | DOM order within section; new pins append | DOM order in the grid |

### 3.1 The pinned "canonical URL" concept

Each pinned tab stores a snapshot `{ url, title, icon }` taken at pin time — the *pinned page*.
It is deliberately trimmed to url+title (no full history) to save memory.

- **Drift indicator**: a navigation listener compares the live URL (hash stripped) to the
  pinned URL. When they differ, the tab is flagged "changed" and shows a reset affordance plus
  the *original* favicon as a ghost. Returning to the pinned URL clears the flag.
- **Reset** replaces the tab's entire history with a single entry for the pinned URL, restores
  the pinned icon, and **discards the saved scroll position** (so it doesn't jump).
- Accel-clicking the reset affordance instead **separates**: duplicates the current page into a
  new normal tab, then resets the pinned one.
- Context menu: "Replace pinned URL with current", "Edit pinned URL" (prompt, URL fixup,
  refetches the favicon), "Reset pinned tab".

### 3.2 Close / reset / unload behavior (the interesting part)

A single setting decides what Ctrl/Cmd-W, the tab's reset button, and middle-click do to a
**pinned** tab. Values:

| Value | Behavior |
|---|---|
| `close` | Actually close it. |
| `reset` | Restore pinned URL; stay selected and loaded. |
| `switch` | Just blur to another tab. |
| `reset-switch` | Both. |
| `unload-switch` | Discard the tab's process and blur away. |
| `reset-unload-switch` | **Default.** Restore the pinned URL, discard, blur away. |

Refinements:
- Middle-clicking an *already unloaded* pinned tab closes it for real (setting-gated).
- If the pinned tab hosts an open Glance, the Glance is force-closed first (awaiting its close
  event, with a 3 s safety timeout) before the unload proceeds.
- After a successful discard the tab keeps its pinned styling (the "discarded" look is
  stripped).
- Optional startup behavior: **restore all pinned tabs to their pinned URL on launch**
  (default off).

### 3.3 Essentials specifics

- Add/remove via tab context menu; the menu item shows an `n/max` badge and disables at max.
- Container gating: with container-specific essentials on (default), a tab can only be added to
  essentials if its container matches the active space's container. Dropping a
  mismatched-container essential into another space's strip **demotes** it out of essentials.
- Adding: sets the essential flag, strips the space id, pins the tab if it wasn't pinned, moves
  it into the container's essentials grid.
- Removing: clears the flag, stamps the *currently active* space id, and either unpins it or
  prepends it to that space's pinned section.
- Layout: a grid, ~4 tiles per row at default sidebar width, with special column treatments at
  5, 6, 9, and small even counts; a single column when the sidebar is collapsed. The strip
  below reserves vertical padding equal to the measured essentials height, animated on switch.
- Empty-state affordance: dragging a tab while the essentials row is empty injects a dashed
  "Add to Essentials" promo card as a drop target.

### 3.4 Section order in the vertical tab bar

1. **Essentials grid** (one per container; all but the active one hidden but still laid out).
2. Per-space strip, containing in order:
   1. **Space indicator** — icon/chevron, name, actions button. Double-click renames (only
      when there are no pinned tabs); single click *toggles pinned-section collapse* when
      there are pinned tabs. It is also a drop target (hover = switch to that space).
   2. **Pinned section** + separator row. The separator carries a "close all unpinned tabs"
      button and is hidden whenever the space has ≤1 visible normal tab.
   3. **Normal tabs section** + new-tab button (optionally reordered to the top).
3. Space icon bar (see §4).

---

## 4. Space switching UI & lifecycle

### 4.1 Ways to switch

| Gesture | Detail |
|---|---|
| Keyboard | Next/prev space; direct switch to index 1–10 (see §6). |
| Space icon bar | A horizontal row of icon buttons, one per space, at the sidebar foot. Hidden entirely when ≤1 space. Click = switch; hover auto-scrolls it into view; overflow shrinks icons from 32 px down to 16 px before setting an overflow flag. |
| Scroll wheel over sidebar | Horizontal scroll switches freely; **vertical** scroll requires a modifier (default Ctrl, configurable ctrl/alt/shift/meta). 200 ms cooldown, min delta threshold, natural-scroll setting inverts. |
| Trackpad swipe | Two-finger horizontal swipe over the sidebar. Live rubber-band: the strip follows the finger with a damping multiplier that stiffens near the edges; backgrounds cross-fade proportionally; releasing commits to next/prev. Any popup opening cancels the gesture. |
| Back/Forward mouse buttons | While hovering the sidebar, app-command Back/Forward map to prev/next space. |
| Drag a tab | To a space icon (instant), or to the sidebar edge (delayed, no wrap). |
| Implicit | Selecting any tab that belongs to another space. |

Wrap-around is a setting (default on) for keyboard/scroll/swipe; drag-to-edge never wraps.

### 4.2 Ordering & reorder

- Order = position in the spaces array. Reorder by **dragging an icon in the space bar**:
  5 px threshold to enter reorder mode, live reinsertion as you cross each sibling's midpoint,
  haptic feedback on each reorder, commit on mouse-up.
- A newly created space is inserted **immediately after** the space you were on, not at the end.

### 4.3 Creation

Creation happens **inline inside the strip**, not in a dialog: a new space is created
immediately (so it can slide in like any other space switch) and shows a form in place of its
tabs — header, icon picker button, name field, container/profile dropdown, "Change theme"
button, Create / Cancel. The sidebar is force-expanded, the URL bar is dimmed, popups are
rolled up, and a set of commands (new tab, new folder, toggle sidebar, open space panel) is
disabled for the duration. Cancel deletes the just-created space and returns to the previous
one. Create button stays disabled until the name is non-empty.

### 4.4 Other space actions (context menu on the indicator or an icon)

Rename inline · Change icon (emoji picker, "none" allowed) · Change theme/gradient ·
Change container ("Open in container tab") · Close all unpinned tabs · Unload this space ·
Unload all other spaces · Space routing settings · Share space · Delete space.

### 4.5 Delete-space behavior

**Tabs do not migrate — they are closed.** Deleting a space:
1. Closes every tab whose space id matches, excluding essentials and the hidden empty tab.
2. Removes the space from the array and broadcasts to all windows.
3. If the deleted space was active, switches to the first remaining space *before* removing its
   strip element, and clears its last-active memory.
4. Confirmed by a modal prompt naming the space.

Related sweeps:
- **Close all unpinned tabs**: closes all unpinned tabs in the space, but *excludes* tabs that
  are selected, multiselected, in PiP, playing sound, screen-sharing, or holding a peer
  connection. If that filter leaves nothing, it force-closes everything. Shows a toast naming
  the undo shortcut.
- **Unload space / unload all others**: discards the tabs' processes; excludes essentials,
  empty tabs, and already-pending tabs.

### 4.6 Containers

If a container is deleted, every space pointing at it silently falls back to the default
container. With *force container → space* on, opening a tab in container C when exactly one
space uses C routes the tab to that space.

---

## 5. Space routing (URL → space rules)

### 5.1 Rule model

| Field | Values |
|---|---|
| `id` | uuid |
| `reference` | the pattern text |
| `matchType` | `contains` \| `equal-to` \| `regex` |
| `openIn` | `most-recent-space` \| a space uuid |

Plus one global `defaultRouteExternal` (same value space) used only for links opened from
other applications.

- No enabled flag (blank text = inert, pruned on save), no priority field — **array order,
  first match wins**.
- `contains` and `equal-to` are case-insensitive; `equal-to` normalizes both sides by stripping
  scheme, leading `www.`, and one trailing slash. `regex` runs against the raw URL and is
  case-sensitive; an invalid pattern is caught and treated as non-matching.
- Matching is against the **whole URL string**, not a parsed host — so `contains` gives
  de-facto subdomain/path matching for free.

### 5.2 When it evaluates

Two hooks:
1. **Tab creation** — before/after the tab exists, covering new tabs from any source including
   external apps.
2. **Top-level navigation start** — link clicks, address bar, form posts, and *each redirect
   hop* (so a redirect target can itself match).

Skips: explicitly opted-out internal features (glance, split view, share, sync), pinned tabs,
tabs in groups, non-http(s) schemes, the hidden empty tab, glance tabs, session-restore loads,
and any case where the destination equals the tab's current URL. Routing only fires when the
target space differs from the tab's current space and that space still exists — this is the
anti-loop guard. **Existing tabs are never retroactively swept when a rule is added.**

### 5.3 What happens on a match

Silent, no prompt.

- *New tab path*: the target space's container is injected as the tab's container before
  creation; after creation the tab is moved into the target space. Foreground tabs also
  **switch the browser to that space**; background tabs move silently and raise a toast
  ("New tab opened in {space}").
- *Navigation path, tab still on blank*: the load is allowed; the tab is moved into the target
  space (and the browser switches if it was selected).
- *Navigation path, tab already has a page*: the load is **stopped**, the original tab stays
  where it was on its old page, and a **new foreground tab** is opened with the destination —
  which then flows through the new-tab routing above.

### 5.4 Rule editing UX

- Entry points: space context menu → "Space routing settings"; a URL-bar action; and a tab
  context-menu item **"Add route for domain(s)"** which pre-fills a rule from the selected
  tab(s) — one tab → `contains` + its host; several tabs → a `regex` alternation of their hosts.
- The editor is a modal window with a scrolling list of rule cards. Each card: match-type
  dropdown, pattern input (placeholder switches to an escaped example in regex mode), remove
  button, and an "Open in" dropdown listing "Most recent space" + every space with its icon.
- Edits apply **per keystroke** to the in-memory rule; an invalid regex tints the field and is
  not written back. Delete is immediate, no confirmation. No Save button — closing persists.
  A footer dropdown sets the external-link default.
- Persistence: a single compressed JSON file in the profile, shared process-wide across
  windows, flushed when the editor closes.

---

## 6. Keyboard shortcuts

Zen ships a fully remappable shortcut system. `Accel` = ⌘ on macOS, Ctrl elsewhere.

### 6.1 Defaults relevant to spaces & tabs

| Action | Default | Notes |
|---|---|---|
| Next space | Accel+Alt+→ | wraps (setting) |
| Previous space | Accel+Alt+← | |
| Switch to space 1–9 | **macOS only: Ctrl+1…9** | unbound on Win/Linux by default |
| Switch to space 10 | macOS: Ctrl+0 | |
| Create new space | unbound | |
| Close all unpinned tabs (this space) | Accel+Shift+K | |
| Toggle pin tab | Accel+Shift+D | resolves a glance child to its parent first |
| Reset pinned tab to pinned URL | unbound | |
| Toggle compact mode | Accel+S | ignores hover state |
| Toggle floating sidebar (compact) | Accel+Alt+S | |
| Toggle sidebar width | unbound | |
| Expand Glance to full tab | Accel+O | |
| Split view: grid / vertical / horizontal / unsplit | Accel+Alt+G / V / H / U | |
| New empty split pane | Accel+Shift+* | |
| Duplicate tab | unbound | |
| New unsynced (blank) window | Accel+Shift+N | no spaces UI |
| Copy current URL | Accel+Shift+C | |
| Copy current URL as Markdown | Accel+Shift+Alt+C | |
| Select tab 1–8 / last tab | Accel+1…8 / Accel+9 | inherited from Firefox |

**Essentials and folders have no keyboard shortcuts** — context-menu only. Folders do have
non-configurable local keys inside their hover popup (arrows/Tab to move, Enter to open).
Glance's activation is a *mouse* modifier, not a keybinding.

### 6.2 Shortcut model

- Record: `id`, `key` (single char) **xor** `keycode` (a named virtual key), `modifiers`,
  `action` (a command id), `group`, `l10nId`, and flags `disabled` / `reserved` / `internal`.
- Modifiers are a value object (`control, alt, shift, meta, accel`) that normalizes `control →
  accel` on non-mac at construction, and compares platform-aware (on mac `meta|accel` are one
  slot; elsewhere `control|accel`).
- Stored as one JSON file in the profile plus an integer schema-version pref. Defaults are
  *computed at runtime* from the browser's own keyset plus Zen's additions, then run through a
  cumulative migration ladder; any default missing from the saved file is appended.
- Capture UI reads the **physical key code** (layout-independent). Escape commits, Backspace
  clears, Tab cancels; uncommitted edits show a warning.
- Conflict detection at commit: linear scan with platform-aware modifier equality + key match;
  a conflict blocks the save and names the conflicting group + shortcut.
- Reset = delete the file and clear the version pref, then restart. There is no per-shortcut
  "restore default"; per-shortcut reset means unbind.
- Groups (also the settings section order): Compact Mode, Workspaces, Split View, Other Zen
  Features, plus inherited Window & Tab Management, Navigation, Search & Find, Page Operations,
  History & Bookmarks, Media & Display, DevTools, Other.

---

## 7. Compact mode (behavior only)

- Two independent toggles: hide the tab sidebar (default on) and hide the top toolbar
  (default off); either, both, or neither. Exposed as a checkbox plus three radios
  (just tabs / just toolbar / both). Persisted across restarts.
- Hidden chrome reveals on hover of the corresponding screen edge; the sidebar lingers ~150 ms
  after mouse-out, the toolbar up to ~1 s when the pointer exits through a window edge, and a
  native cursor tracker keeps it open while the OS pointer stays within ~200 px horizontally /
  ~100 px vertically of the window.
- Open menus/popups and a focused URL bar pin the chrome open; window deactivate, minimize, or
  a move back inside collapse it.
- Compact styling is fully suppressed in DOM fullscreen; exiting fullscreen optionally
  "flashes" the sidebar briefly. Sidebar collapse animates as a negative margin (~120 ms);
  toolbar collapse is a height/opacity transition.
- Background tabs opened while the sidebar is hidden raise a toast offering to switch to them.

## 8. Glance (behavior only)

- Trigger: left-click a link with exactly one modifier (default Alt; configurable
  ctrl/alt/shift/meta). A 4 px drag threshold suppresses it so text selection still works.
  Also available from the context menu, from bookmarks, from context-menu web search, and
  automatically for cross-domain links opened from a pinned app tab.
- It opens a **real background tab** parented to the current tab, rendered as an overlay
  (~80 % width, centered). The underlying tab stays live but is scaled slightly down and dimmed
  as a backdrop. Only one glance at a time.
- Opening animates from the clicked link's rect to center along a short arc, cross-fading a
  snapshot of the link region (~350 ms). Closing reverses it.
- Closes on: backdrop click, Escape (first Escape only arms a 3 s confirm if the page has
  focus), the close button, or the parent tab closing. beforeunload is honored.
- **Expand** promotes the glance to a normal tab placed right after its parent and selects it;
  the parent reverts to an ordinary background tab. A "split" action opens it side-by-side
  instead. Entering DOM fullscreen inside a glance auto-expands it.

## 9. Folders (brief, since they interact with spaces)

- A folder *is* a tab group, always pinned, living in a space's pinned section, tagged with a
  space id. Fields: id, name, collapsed, pinned, essential, parentId (nesting, max 5 deep),
  previous-sibling info for ordering, user icon, and a hidden empty tab so an empty folder stays
  valid. Color inherits the space accent.
- Essentials cannot be inside a folder (adding demotes them). Tabs added to a folder are pinned.
- Collapsing hides members but **keeps the selected tab visible directly under the folder
  label**, with an indent variable showing depth. Hovering a collapsed folder for 500 ms opens a
  filterable list of its hidden tabs.
- "Change folder space" rewrites the space id on the folder and everything inside it and
  switches to that space. "Convert folder to space" creates a new space from the folder's name
  and icon, moves its tabs in, and deletes the folder.

---

## 10. Mapping to Chrome extension APIs

### 10.1 Maps cleanly

| Zen concept | Chromium mechanism |
|---|---|
| Space membership of a tab | `chrome.tabGroups` — one group per space (single-window model), or a `chrome.storage` map `tabId → spaceId` (multi-window model). Groups survive restart in Chrome and carry title+color. |
| Show/hide tabs on switch | `chrome.tabGroups.update({collapsed})` for a group-per-space model; otherwise move the non-active space's tabs to a hidden window (`chrome.windows.create({state:"minimized"})`) — workable but janky. |
| Space list, theme, icon, rules | `chrome.storage.local` (+ `.sync` for cross-device). Emoji icons are just strings. |
| Last-active tab per space | `chrome.storage.session` map, maintained from `chrome.tabs.onActivated`. |
| Move tab between spaces | `chrome.tabs.group` / `chrome.tabs.move` / `chrome.tabs.ungroup`. |
| Delete space → close its tabs | `chrome.tabs.remove(ids)`. |
| Unload space / unload others | **`chrome.tabs.discard(tabId)`** — a direct analogue of Zen's unload. |
| Pinned tabs | `chrome.tabs.update({pinned:true})`. Note Chrome pins are *window-global* and always at the strip head — per-space pinning needs the extension's own bookkeeping. |
| Pinned "canonical URL" + reset | Store `{url,title,favIconUrl}` in `chrome.storage`; reset = `chrome.tabs.update({url})`. Drift detection = `chrome.tabs.onUpdated`. Scroll reset comes free with a fresh navigation. |
| Reset-then-discard on close | Intercept the close command (see below), `tabs.update({url})` then `tabs.discard()`. |
| Space routing | `chrome.tabs.onCreated` + `chrome.tabs.onUpdated` (or `chrome.webNavigation.onBeforeNavigate` / `onCommitted` for redirect hops). Stop-and-reopen = `tabs.update({url:"about:blank"})` + `tabs.create`. Declarative alternative: `declarativeNetRequest` redirect, but that can't choose a space. |
| Keyboard shortcuts | `chrome.commands` — **hard cap of 4 user-visible suggested keys**, and the whole set is remapped only at `chrome://extensions/shortcuts`. |
| Session restore of spaces | `chrome.storage.local` + `chrome.runtime.onStartup`; `chrome.sessions.restore` for undo-close-tab parity. |
| Containers / profile link | Chrome has no containers. Closest analogues: `chrome.contextualIdentities` does **not** exist; use separate Chrome **profiles** (out of extension reach) or a cookie-partition shim. Flag as degraded. |
| Compact-mode chrome hiding | Not possible from an extension. Native only. |

### 10.2 Does NOT map — needs native patches in BrowserOS

1. **The sidebar itself.** Zen's entire spaces UI is the browser's own vertical tab strip.
   An extension can only render a side panel (`chrome.sidePanel`) that cannot replace the tab
   strip, cannot be the drag target for real tabs, and closes on navigation in some contexts.
   The carousel strip, per-space indicator, essentials grid, and space icon bar all need
   browser-UI patches.
2. **Hiding Chrome's native tab strip** (required for the design to make sense) — native.
3. **Compact mode** — hiding/revealing toolbar and tab strip on hover, plus the OS-level cursor
   tracking outside the window. Fully native.
4. **Glance** — an overlaid live tab rendered over a dimmed parent tab. Extensions cannot host
   another tab's renderer. Native (or a much weaker iframe/popup imitation that breaks on
   X-Frame-Options and loses process isolation).
5. **Swipe gestures** — no extension access to trackpad swipe events or their live deltas;
   also the rubber-band strip animation is native UI. Native.
6. **Back/forward mouse buttons over the sidebar** — native.
7. **Scroll-over-sidebar to switch** — depends on owning the sidebar. Native.
8. **Drag a tab onto a space icon / to the sidebar edge** — real tab drags are native drags;
   `chrome.tabs` has no drag events. Native.
9. **Per-space pinned tabs.** Chrome's pinned state is window-scoped and forces strip position.
   Emulating "pinned in space A only" requires either native support or moving tabs in/out of
   groups on every switch (lossy). Recommend native.
10. **Essentials as a grid above the strip** — pure native UI.
11. **Intercepting Ctrl/Cmd-W to reset-and-discard instead of closing.** `chrome.commands`
    cannot rebind the browser's own close-tab accelerator. Native (or accept a different key).
12. **Containers / contextual identities** — no Chromium equivalent; `containerTabId` should
    either be dropped or reinterpreted as a Chrome profile link (native).
13. **Per-space window background gradient / accent / color scheme** — theming the browser
    chrome dynamically per space. `chrome.theme` is not dynamic per-tab. Native.
14. **A tab belonging to a space but invisible without being discarded.** Chrome's only "hide"
    is group-collapse (still in the strip) or moving to another window. True hidden-but-alive
    per-space tab sets need native support.
15. **Folders with nesting, hover-search popup, and keep-active-tab-visible collapse** —
    `chrome.tabGroups` has no nesting and no custom collapse rendering. Native.
16. **Haptic feedback on reorder** — native.

### 10.3 Suggested split for BrowserOS

- **Extension owns**: the data model (spaces, rules, pinned snapshots, last-active memory),
  all persistence and sync, routing evaluation, and the commands layer.
- **Native owns**: the sidebar strip and its animation, essentials/pinned rendering, compact
  mode, glance, drag-and-drop, gestures, and per-space theming.
- **Contract between them**: a small native messaging / internal API surface with
  `getSpaces / setSpaces / setActiveSpace / setTabSpace / getTabSpace`, plus events
  `spaceChanged`, `tabSpaceChanged`, `tabDroppedOnSpace`. Everything in §§1–3 and §5 can then
  live in JS and be iterated without rebuilding the browser.
