# Sidebar spec

Build spec for the personal sidebar: essentials grid, spaces with theme, folders, pinned tabs, today tabs, space dots with swipe, archive. Runs as a Chrome extension side panel inside BrowserOS classic today; designed so a native Chromium surface can replace the panel later without touching the model.

Status: v1, 2026-09-12. Inputs: on-disk state model of reference browser A, behavior rules from reference browser Z (open source, MPL), `docs/personal/zen-sidebar-implementation-review.md`, `docs/personal/zen-spaces-design-reference.md`, BrowserOS patch and API audit. No code from either reference is used.

## 1. Goals and non-goals

Goals
- One left sidebar: search, essentials grid, space header, pinned tree with folders, "today" tabs, footer with settings, space dots, `+`, downloads, chat toggle.
- Space switching by click, keyboard, and horizontal two-finger swipe, with theme cross-fade.
- Memory discipline: only the active space and its two neighbours are mounted; inactive spaces' tabs are discarded after a timer.
- Stable across restarts: persist by URL and our own ids, never by Chromium tab or group ids.
- Small upstream footprint: everything under `apps/app/lib/sidebar`, `apps/app/entrypoints/sidepanel` (mode), `apps/app/entrypoints/background/sidebar.ts`, plus registration lines.

Non-goals for v1 (native, later)
- Hiding the Chromium tab strip, docking the panel left by code, removing the panel header, compact hover reveal, glance overlay, whole-window tint, tab drag from strip to panel, more than two split panes.

Known constraints (verified)
- Extension cannot set `side_panel.is_right_aligned`. User sets Appearance → Side panel → Left once.
- One side panel per window. Sidebar and chat share the panel via a mode switch.
- `chrome.browserOS.setPref` only accepts `browseros.*` prefs. Vertical strip stays; it is collapsed to icons.
- Only 9 tab group colors. Group color is a coarse shadow of the space theme.

## 2. Architecture

```
core/        pure TypeScript, no browser APIs, unit tested
host/        HostAdapter interface + ChromeHostAdapter (now) + NativeHostAdapter (later)
background/  reconciler: single writer of storage, owns tab events, timers, migrations
panel/       React surface in the side panel (mode "sidebar"); new-tab bar is a second surface
messaging/   typed protocol between panel and background (existing @webext-core pattern)
```

Rules
- Background is the only writer of persistent state. Panels send intents, watch storage.
- All model functions are pure reducers over plain objects. Selectors derive zones and visibility.
- Every capability behind a flag in `lib/sidebar/flags.ts`: `essentials`, `folders`, `archive`, `swipe`, `theme`, `chatMode`, `glance`, `compact`.
- Storage schema versioned. Migration ladder in `core/migrations.ts`, tested.

## 3. Data model (core)

One homogeneous item tree. Zone membership is derived from the ancestor container, never stored on a node.

```ts
type ItemId = string            // nanoid, ours, stable across restarts
type SpaceId = string

interface Item {
  id: ItemId
  parentId: ItemId | null       // null only for container roots
  children: ItemId[]            // display order
  title: string | null          // user override; null = use live/saved title
  createdAt: number
  data: ItemData
}

type ItemData =
  | { kind: 'tab'; url: string; savedTitle: string; favicon?: string; lastActiveAt: number }
  | { kind: 'folder'; expansion: 'expanded' | 'collapsed' | 'peeked' }
  | { kind: 'container'; role: 'essentials' | 'pinned' | 'today'; spaceId?: SpaceId }
  | { kind: 'unknown'; raw: unknown }   // forward-compat: keep, never render

interface Space {
  id: SpaceId
  name: string
  icon: string                  // emoji or glyph key
  color: TabGroupColor          // existing 9-color enum, for the group
  theme: ThemeSpec
  containers: { pinned: ItemId; today: ItemId }
  pinnedCollapsed: boolean
  createdAt: number
}

interface ThemeSpec {
  keyColors: Array<{ rgb: [number, number, number]; primary?: boolean }>  // 1..3
  wheel: 'analogous' | 'complementary'
  intensity: number             // 0..1
  noise: number                 // 0..1
}

interface ArchivedItem {
  item: Item                    // whole node incl. children
  spaceId: SpaceId
  reason: 'auto' | 'manual' | 'clear' | 'spaceDeleted'
  source: string                // which action closed it (enum string, extensible)
  archivedAt: number
}

interface SidebarSettings {
  autoArchiveAfter: '1h' | '6h' | '12h' | '24h' | '7d' | '30d' | 'never'  // default 12h
  discardInactiveSpacesAfterMin: number   // default 30
  essentialsMax: number                   // default 12
  wrapAround: boolean
  naturalScroll: boolean
  pinnedCloseBehavior: 'reset-unload-switch' | 'reset' | 'unload-switch' | 'close'
}
```

Derived (selectors, never stored)
- `zoneOf(itemId)`: walk parents to the container role.
- `todayTabs(spaceId)`: live tabs in the space's group, in Chromium index order, minus tabs whose URL matches a pinned node.
- `liveTabFor(item)`: session map `itemId → tabId`, else "not open".
- `ringDelta(from, to, count)`: shortest path with wrap for carousel direction.
- `selectionFor(space)`: last selected → first unpinned → last visible, never an essential.

Essentials
- Global container, one per browser. Entries are sites, not tabs. Click focuses an existing tab with that URL in any window, else opens one in the active space's group.
- Max `essentialsMax`. Fixed 3-column grid, no count-specific layouts.

Pinned
- Per-space tree under `containers.pinned`. Tab nodes carry a canonical `{url, savedTitle, favicon}` snapshot at pin time.
- Drift: live URL (hash stripped) differs from canonical → drift flag, reset affordance.
- Close on a pinned tab follows `pinnedCloseBehavior`. Default: reset to canonical URL, discard, select another tab. Never removes the node.
- Folders nest to depth 2. Expansion tri-state; `peeked` shows only the active descendant row.

Today
- Not stored. Derived from the group. Order is Chromium order. "Tidy" archives all today tabs of the active space; "Clear" also closes them.

Archive
- Whole nodes with reason and source. Auto timer on `chrome.alarms` every 5 min: today tabs with `lastActiveAt` older than threshold are archived and closed. Exclusion set: active tab, audible, pinned, tabs in an agent session group.
- Capped at 2,000 entries, oldest pruned. Restore = re-insert node under its container and open the tab.

## 4. Storage schema

`chrome.storage.local` (persistent, single document per key, batched writes, 500 ms debounce)
```json
{
  "sidebar:schemaVersion": 1,
  "sidebar:spaces": { "order": ["s1"], "byId": { "s1": { "…Space" } } },
  "sidebar:activeSpaceId": "s1",
  "sidebar:items": { "byId": { "i1": { "…Item" } }, "roots": { "essentials": "i0" } },
  "sidebar:archive": [ { "…ArchivedItem" } ],
  "sidebar:settings": { "…SidebarSettings" }
}
```
`chrome.storage.session` (cleared on restart)
```json
{
  "sidebar:tabLinks": { "<tabId>": "<itemId>" },
  "sidebar:groupLinks": { "<windowId>:<spaceId>": <groupId> },
  "sidebar:lastSelected": { "<spaceId>": <tabId> },
  "sidebar:unread": [<tabId>]
}
```
Existing `local:spaces` / `local:activeSpaceId` from the current Spaces feature migrate into `sidebar:spaces` in migration 1 → 2; the new-tab pill bar reads the new store.

## 5. Host adapter

```ts
interface HostAdapter {
  listWindows(): Promise<WindowInfo[]>
  listTabs(windowId?: number): Promise<TabInfo[]>
  activate(tabId: number): Promise<void>
  create(input: { windowId: number; url?: string; groupId?: number; index?: number; active?: boolean }): Promise<TabInfo>
  close(tabIds: number[]): Promise<void>
  discard(tabIds: number[]): Promise<void>
  move(tabId: number, to: { windowId?: number; index: number }): Promise<void>
  navigate(tabId: number, url: string): Promise<void>
  ensureGroup(windowId: number, space: Space): Promise<number>
  setGroupCollapsed(groupId: number, collapsed: boolean): Promise<void>
  groupTabs(tabIds: number[], groupId: number): Promise<void>
  ungroup(tabIds: number[]): Promise<void>
  faviconUrl(pageUrl: string): string
  onTabEvent(cb: (e: TabEvent) => void): Unsubscribe
  onWindowFocus(cb: (windowId: number) => void): Unsubscribe
  // native-only, no-ops in ChromeHostAdapter, feature-detected
  setWindowTint?(windowId: number, tint: Tint): Promise<void>
  openGlance?(tabId: number, url: string): Promise<void>
  setCompact?(pinned: boolean): Promise<void>
  split?(tabIds: number[], layout: 'vertical' | 'horizontal'): Promise<void>
}
```
`ChromeHostAdapter` wraps `chrome.tabs`, `chrome.tabGroups`, `chrome.windows`, `chrome://favicon2`. Contract tests run against a `FakeHost` with an in-memory tab list. `NativeHostAdapter` later routes to `chrome.browserOS.*` calls added by patches.

## 6. Background reconciler

Responsibilities, all in `entrypoints/background/sidebar.ts`:
- Startup: load state, run migrations, rebuild `groupLinks` by matching group title + color per window, link live tabs to items by URL (pinned first, then essentials), prune dead links, create missing groups lazily.
- Tab events → reducer: `created` adopt into active space group (existing rule); `updated` drift check + unread mark; `activated` follow-space rule + lastSelected; `removed` unlink; `moved/attached/detached` regroup.
- Switch: record lastSelected, expand target group, activate `selectionFor`, collapse other space groups, set `activeSpaceId`, schedule discard timer for the previous space.
- Timers via `chrome.alarms`: `sidebar:archive` every 5 min, `sidebar:discard` every 5 min (discard tabs of spaces inactive longer than `discardInactiveSpacesAfterMin`, excluding audible and pinned-with-drift).
- Agent-session safety: never touch groups whose title matches `<agent>/<label>` (neo session groups); reconciler ignores them and the archive excludes them.
- Message handlers (typed protocol `lib/messaging/sidebar`): `switch`, `createSpace`, `updateSpace`, `deleteSpace`, `moveItem`, `pin`, `unpin`, `addEssential`, `removeEssential`, `createFolder`, `setExpansion`, `archive`, `restore`, `tidy`, `clear`, `resetPinned`, `openSwitcher`.

## 7. Panel surface

Side panel entrypoint gains a mode: `sidebar` (default) and `chat` (existing). Footer chat button flips modes; ⌥A native shortcut still opens chat mode; a back button returns.

Components
```
PanelRoot            theme vars, mode switch, keyboard handling
SearchBox            filters open tabs + history; Enter opens in active space
EssentialsGrid       3 columns, 46 px tiles, drag reorder
SpaceCarousel        track of strips, translateX(ringDelta*100%), mounts active ±1
  SpaceStrip
    SpaceHeader      icon + name, click toggles pinned collapse, dblclick renames
    PinnedTree       folders (tri-state), pinned rows, drift badge + reset
    Separator        "+ New Tab", Tidy / Clear
    TodayList        virtualised rows
FooterBar            settings, SpaceDots (hidden when ≤1, 32→16 px overflow), +, downloads, chat
ThemePicker          key colors + wheel + intensity + noise
```

Interaction constants (borrowed from reference Z)
| Item | Value |
|---|---|
| Space switch animation | 250 ms, spring, 50 ms watchdog |
| Pinned collapse | 120 ms |
| Wheel switch cooldown / min delta | 200 ms / 1 |
| Swipe rubber band | `1 − |x| / (4.5·W)` |
| Background fade during swipe | `1 − |x| / 200` |
| Dots | 32 → 16 px overflow, 3 px gap, 5 px reorder threshold |
| Essentials | max 12, 46 px tile, 4 px gap |
| Row heights | 36 px tab row, 48 px icon-only |
| Drag-to-edge switch | 20 px zone, 500 ms hold |
| Storage write debounce | 500 ms |

Paging model: position is `(floorSpaceId, ceilSpaceId, progress 0..1)`. Dots, header, and theme all interpolate off that triple. Trackpad input (has `wheel` phases) gets velocity + rubber band + settle; plain wheel gets a cumulative-distance threshold plus the cooldown. Commit threshold 0.35 of width or velocity above 0.5 px/ms.

Theme engine: `computeTheme(spec) → { bg, bgToolbar, accent, text, isDark }`. Palette from key colors via `oklch` ramp; dark/light decided by contrast, not luminance. Cross-fade by rendering old and new gradient layers with one `--fade` custom property registered via `@property`, animated on switch and driven by `progress` during swipe. No per-frame JS style writes; rAF-batched only for the swipe offset.

Keyboard
| Action | Default |
|---|---|
| Next / previous space | ⌥⇧→ / ⌥⇧← (existing) |
| Switcher | ⌥⇧S (existing) |
| Space 1..9 | unbound, assignable |
| Toggle sidebar / chat mode | ⌥⇧B |
| Pin / unpin current tab | ⌥⇧P |
| New folder | ⌥⇧N |

## 8. Performance and memory rules

- Mount only active ±1 strips; virtualise TodayList and PinnedTree beyond 40 rows.
- One storage subscription per panel, one reducer, batched writes.
- Favicons via `chrome://favicon2/?pageUrl=` URLs, never base64 in storage. Requires `favicon` permission.
- Discard tabs of inactive spaces after 30 min; archive today tabs after 12 h.
- No per-tab listeners in the panel; background fans events in.
- Item tree capped at 5,000 nodes; archive at 2,000. Warn in settings above 80 %.

## 9. Testing

- `core/*`: bun unit tests for reducers, selectors, migrations, theme math, paging math.
- `host/ChromeHostAdapter`: contract tests against `FakeHost`.
- `background/sidebar`: reducer tests with recorded event sequences (create, switch, restart reconcile, agent group ignored).
- Panel: CDP smoke via `scripts/dev/inspect-ui.ts` and the `test-ui` skill: open panel, create space, pin, folder, swipe via synthetic wheel, theme change, archive restore.
- Gate: `bun run check` and `bun run test` green before each slice merges.

## 10. Build slices

1. **Core + storage + migration.** Types, reducers, selectors, schema v2, migration from current Spaces, `FakeHost`, tests. No UI change. Acceptance: existing Spaces bar and shortcuts keep working on the new store.
2. **Host adapter + reconciler.** `ChromeHostAdapter`, startup reconcile, tab-link map, group-per-space, agent-group exclusion, discard timer. Acceptance: restart browser, spaces and pinned links rebuild; agent session groups untouched.
3. **Panel skeleton.** Side panel mode switch, search, space header, pinned list, today list (virtualised), footer dots, keyboard. Acceptance: full daily use from the panel with the native strip collapsed.
4. **Essentials, folders, pinned semantics.** Grid, tri-state folders, canonical URL + drift + reset, close behavior, `@dnd-kit` reorder across zones. Acceptance: pin, fold, reorder, restart, all intact.
5. **Carousel, swipe, theme.** Paging triple, trackpad and wheel paths, rubber band, theme picker, cross-fade, dots overflow. Acceptance: swipe feels continuous at 60 fps in a 10-space profile.
6. **Archive and Tidy.** Auto-archive alarm, Tidy / Clear, archive view with restore, close-reason logging. Acceptance: 12 h old today tabs archived and restorable.

Native slices later (need Chromium build): left dock pref, hide strip, hide panel header, compact hover, glance, window tint, split presets.

## 11. Migration from current Spaces

- `local:spaces[]` → `sidebar:spaces`, each gets `containers.pinned/today` roots created, `theme` defaulted from `color`.
- `local:activeSpaceId` → `sidebar:activeSpaceId`.
- `local:spaceLastActiveTab` → `sidebar:lastSelected` (session).
- New-tab `SpacesBar` and `SpacesSwitcher` switch to the new hooks; behaviour unchanged.
- Old keys removed after successful migration; migration idempotent.
