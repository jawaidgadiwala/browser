import {
  addEssential,
  createFolder,
  createSpace,
  deleteSpace,
  moveItem,
  moveSpace,
  pin,
  removeItem,
  restore,
  subtreeIds,
  type TabSnapshot,
  tidy,
  unpin,
  updateSpace,
} from './core/model'
import {
  adjacentSpace,
  essentialsList,
  isDrifted,
  selectionFor,
  zoneOf,
} from './core/selectors'
import type {
  ArchiveReason,
  Expansion,
  Item,
  ItemId,
  SidebarSettings,
  SidebarState,
  Space,
  SpaceId,
  TabGroupColor,
} from './core/types'
import type {
  GroupInfo,
  HostAdapter,
  TabEvent,
  TabInfo,
} from './host/host-adapter'
import { NO_GROUP } from './host/host-adapter'

/**
 * The single writer of sidebar state. It owns the mapping between our item
 * tree and the browser's tabs, tab groups and windows, and it is the only
 * place allowed to mutate either side.
 *
 * Everything it touches the browser with goes through `HostAdapter`, and
 * everything it persists goes through the two store ports, so the whole
 * reducer runs in tests against `FakeHost` plus in-memory stores.
 */

/** `<agent>/<label>` groups belong to an agent session; we never touch them. */
const AGENT_GROUP_TITLE = /^[a-z0-9-]+\//

/**
 * @public
 */
export function isAgentGroupTitle(title: string | undefined): boolean {
  return title !== undefined && AGENT_GROUP_TITLE.test(title)
}

/**
 * @public
 */
export interface SidebarStore {
  read(): Promise<SidebarState>
  write(state: SidebarState): Promise<void>
}

/**
 * Session-scoped links between our ids and the browser's. All of it is
 * rebuilt by `reconcile()` after a restart.
 *
 * @public
 */
export interface SessionState {
  /** tabId -> itemId. */
  tabLinks: Record<string, ItemId>
  /** "<windowId>:<spaceId>" -> groupId. */
  groupLinks: Record<string, number>
  lastSelected: Record<SpaceId, number>
  unread: number[]
  /** tabId -> last time the tab was the active one. */
  tabActiveAt: Record<string, number>
  /** spaceId -> last time the space was active; drives the discard alarm. */
  spaceActiveAt: Record<SpaceId, number>
}

/**
 * @public
 */
export interface SessionStore {
  read(): Promise<SessionState>
  write(patch: Partial<SessionState>): Promise<void>
}

/**
 * Toggles owned by the Spaces settings page, kept out of the sidebar
 * document so that surface keeps writing its own key.
 *
 * @public
 */
export interface ReconcilerBehavior {
  adoptNewTabs: boolean
  followActiveTab: boolean
  wrapAround: boolean
}

const DEFAULT_BEHAVIOR: ReconcilerBehavior = {
  adoptNewTabs: true,
  followActiveTab: true,
  wrapAround: true,
}

/**
 * @public
 */
export interface ReconcilerDeps {
  host: HostAdapter
  store: SidebarStore
  session: SessionStore
  now?: () => number
  /** Chrome groups opener-spawned tabs a moment after `created`. */
  adoptDelayMs?: number
  behavior?: () => Promise<Partial<ReconcilerBehavior>>
}

const ARCHIVE_AFTER_MS: Record<SidebarSettings['autoArchiveAfter'], number> = {
  '1h': 3_600_000,
  '6h': 21_600_000,
  '12h': 43_200_000,
  '24h': 86_400_000,
  '7d': 604_800_000,
  '30d': 2_592_000_000,
  never: Number.POSITIVE_INFINITY,
}

function groupKey(windowId: number, spaceId: SpaceId): string {
  return `${windowId}:${spaceId}`
}

/** The space a group stands for, matched by title then color. */
export function spaceForGroup(
  state: SidebarState,
  group: GroupInfo | undefined,
): Space | undefined {
  if (!group || isAgentGroupTitle(group.title) || !group.title) return undefined
  const spaces = state.spaces.order.flatMap((id) =>
    state.spaces.byId[id] ? [state.spaces.byId[id]] : [],
  )
  return (
    spaces.find(
      (space) => space.name === group.title && space.color === group.color,
    ) ?? spaces.find((space) => space.name === group.title)
  )
}

function tabItems(state: SidebarState, rootId: ItemId) {
  return subtreeIds(state.items, rootId)
    .slice(1)
    .flatMap((id) => {
      const item = state.items.byId[id]
      return item?.data.kind === 'tab' ? [{ id, url: item.data.url }] : []
    })
}

/**
 * Rebuild the tabId -> itemId map from live tabs by URL. Pinned nodes win
 * over essentials, and each tab is claimed at most once, so two windows
 * showing the same site do not both claim the pinned row.
 */
export function linkTabsToItems(
  state: SidebarState,
  tabs: TabInfo[],
): Record<string, ItemId> {
  const targets: Array<{ id: ItemId; url: string }> = []
  for (const spaceId of state.spaces.order) {
    const space = state.spaces.byId[spaceId]
    if (space) targets.push(...tabItems(state, space.containers.pinned))
  }
  for (const item of essentialsList(state)) {
    if (item.data.kind === 'tab')
      targets.push({ id: item.id, url: item.data.url })
  }

  const links: Record<string, ItemId> = {}
  const claimed = new Set<number>()
  for (const target of targets) {
    const tab = tabs.find(
      (candidate) =>
        !claimed.has(candidate.id) && !isDrifted(target.url, candidate.url),
    )
    if (!tab) continue
    claimed.add(tab.id)
    links[String(tab.id)] = target.id
  }
  return links
}

function snapshotOf(host: HostAdapter, tab: TabInfo, now: number): TabSnapshot {
  return {
    url: tab.url,
    savedTitle: tab.title,
    favicon: tab.url ? host.faviconUrl(tab.url) : undefined,
    lastActiveAt: now,
  }
}

export class SidebarReconciler {
  private deps: ReconcilerDeps
  /** Our own switch fires activation events; they must not follow back. */
  private switching = false
  private queued: Promise<unknown> = Promise.resolve()

  constructor(deps: ReconcilerDeps) {
    this.deps = deps
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now()
  }

  /** Serialises every mutation so no two passes interleave read and write. */
  private run<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queued.then(task, task)
    this.queued = next.catch(() => undefined)
    return next
  }

  private async behavior(): Promise<ReconcilerBehavior> {
    const overrides = (await this.deps.behavior?.()) ?? {}
    return { ...DEFAULT_BEHAVIOR, ...overrides }
  }

  private async normalWindowIds(): Promise<number[]> {
    const windows = await this.deps.host.listWindows()
    return windows
      .filter((window) => window.type === 'normal')
      .map((window) => window.id)
  }

  private async targetWindowId(
    preferred?: number,
  ): Promise<number | undefined> {
    if (preferred !== undefined) return preferred
    const windows = await this.deps.host.listWindows()
    const normal = windows.filter((window) => window.type === 'normal')
    return (normal.find((window) => window.focused) ?? normal[0])?.id
  }

  /** The group for a space in a window, created on demand. */
  private async ensureSpaceGroup(
    space: Space,
    windowId: number,
    seedTabIds?: number[],
  ): Promise<number> {
    const groupId = await this.deps.host.ensureGroup(
      windowId,
      space,
      seedTabIds,
    )
    const session = await this.deps.session.read()
    await this.deps.session.write({
      groupLinks: {
        ...session.groupLinks,
        [groupKey(windowId, space.id)]: groupId,
      },
    })
    return groupId
  }

  private async spaceGroupIds(
    state: SidebarState,
    spaceId: SpaceId,
  ): Promise<number[]> {
    const space = state.spaces.byId[spaceId]
    if (!space) return []
    const groups = await this.deps.host.listGroups()
    return groups
      .filter((group) => spaceForGroup(state, group)?.id === spaceId)
      .map((group) => group.id)
  }

  private async tabsOfSpace(
    state: SidebarState,
    spaceId: SpaceId,
  ): Promise<TabInfo[]> {
    const groupIds = new Set(await this.spaceGroupIds(state, spaceId))
    const tabs = await this.deps.host.listTabs()
    return tabs.filter((tab) => groupIds.has(tab.groupId))
  }

  // --- startup --------------------------------------------------------------

  /**
   * Rebuild every session link from what the browser actually has open.
   * Group ids and tab ids do not survive a restart; titles and URLs do.
   */
  reconcile(): Promise<void> {
    return this.run(async () => {
      const { host, store, session: sessionStore } = this.deps
      const now = this.now()
      const state = await store.read()
      const session = await sessionStore.read()
      const windowIds = await this.normalWindowIds()

      const groupLinks: Record<string, number> = {}
      for (const windowId of windowIds) {
        const groups = await host.listGroups(windowId)
        for (const spaceId of state.spaces.order) {
          const space = state.spaces.byId[spaceId]
          if (!space) continue
          const match = groups.find(
            (group) => spaceForGroup(state, group)?.id === spaceId,
          )
          if (match) groupLinks[groupKey(windowId, spaceId)] = match.id
        }
      }

      const tabs = await host.listTabs()
      const liveTabIds = new Set(tabs.map((tab) => tab.id))
      const tabLinks = linkTabsToItems(state, tabs)

      const lastSelected: Record<SpaceId, number> = {}
      for (const [spaceId, tabId] of Object.entries(session.lastSelected)) {
        if (state.spaces.byId[spaceId] && liveTabIds.has(tabId)) {
          lastSelected[spaceId] = tabId
        }
      }

      const tabActiveAt: Record<string, number> = {}
      for (const tab of tabs) {
        tabActiveAt[String(tab.id)] = session.tabActiveAt[String(tab.id)] ?? now
      }

      const spaceActiveAt: Record<SpaceId, number> = {}
      for (const spaceId of state.spaces.order) {
        spaceActiveAt[spaceId] = session.spaceActiveAt[spaceId] ?? now
      }

      await sessionStore.write({
        groupLinks,
        tabLinks,
        lastSelected,
        tabActiveAt,
        spaceActiveAt,
        unread: session.unread.filter((tabId) => liveTabIds.has(tabId)),
      })
    })
  }

  // --- tab events -----------------------------------------------------------

  handleTabEvent(event: TabEvent): Promise<void> {
    return this.run(async () => {
      switch (event.type) {
        case 'created':
          return this.onCreated(event.tab.id)
        case 'updated':
          return this.onUpdated(event.tabId, event.changes, event.tab)
        case 'activated':
          return this.onActivated(event.tabId)
        case 'removed':
          return this.onRemoved(event.tabId)
        case 'moved':
        case 'attached':
          return this.onRegroup(event.tabId)
        case 'detached':
          return undefined
        case 'replaced':
          return this.onReplaced(event.removedTabId, event.addedTabId)
      }
    })
  }

  /** New tabs join the active space unless the browser already grouped them. */
  private async onCreated(tabId: number): Promise<void> {
    const { adoptNewTabs } = await this.behavior()
    if (!adoptNewTabs) return
    const delay = this.deps.adoptDelayMs ?? 150
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))
    await this.adopt(tabId)
  }

  private async onRegroup(tabId: number): Promise<void> {
    const { adoptNewTabs } = await this.behavior()
    if (adoptNewTabs) await this.adopt(tabId)
  }

  private async adopt(tabId: number): Promise<void> {
    const { host, store } = this.deps
    const tab = (await host.listTabs()).find(
      (candidate) => candidate.id === tabId,
    )
    if (!tab || tab.pinned || tab.groupId !== NO_GROUP) return
    const windowIds = await this.normalWindowIds()
    if (!windowIds.includes(tab.windowId)) return
    const state = await store.read()
    const space = state.activeSpaceId
      ? state.spaces.byId[state.activeSpaceId]
      : undefined
    if (!space) return
    await this.ensureSpaceGroup(space, tab.windowId, [tabId])
  }

  private async onUpdated(
    tabId: number,
    changes: { url?: string; title?: string; status?: string },
    tab: TabInfo,
  ): Promise<void> {
    const { store, session: sessionStore } = this.deps
    const state = await store.read()
    const session = await sessionStore.read()
    const key = String(tabId)
    const patch: Partial<SessionState> = {}

    const linkedId = session.tabLinks[key]
    const linked = linkedId ? state.items.byId[linkedId] : undefined
    if (changes.url !== undefined) {
      if (linked?.data.kind === 'tab') {
        // Drift is derived from canonical vs live URL; the link survives it so
        // the row keeps its place and can offer a reset.
      } else {
        const claimed = new Set(
          Object.entries(session.tabLinks).flatMap(([id, itemId]) =>
            id === key ? [] : [itemId],
          ),
        )
        const match = this.matchItemByUrl(state, tab.url, claimed)
        if (match) patch.tabLinks = { ...session.tabLinks, [key]: match }
      }
    }

    const finished =
      changes.status === 'complete' || changes.title !== undefined
    if (finished && !tab.active && !session.unread.includes(tabId)) {
      patch.unread = [...session.unread, tabId]
    }
    if (tab.active) {
      patch.tabActiveAt = { ...session.tabActiveAt, [key]: this.now() }
    }
    if (Object.keys(patch).length > 0) await sessionStore.write(patch)
  }

  private matchItemByUrl(
    state: SidebarState,
    url: string,
    claimed: Set<ItemId>,
  ): ItemId | undefined {
    const targets: Array<{ id: ItemId; url: string }> = []
    for (const spaceId of state.spaces.order) {
      const space = state.spaces.byId[spaceId]
      if (space) targets.push(...tabItems(state, space.containers.pinned))
    }
    for (const item of essentialsList(state)) {
      if (item.data.kind === 'tab') {
        targets.push({ id: item.id, url: item.data.url })
      }
    }
    return targets.find(
      (target) => !claimed.has(target.id) && !isDrifted(target.url, url),
    )?.id
  }

  /** Selecting a tab that lives in another space switches to that space. */
  private async onActivated(tabId: number): Promise<void> {
    if (this.switching) return
    const { host, store, session: sessionStore } = this.deps
    const now = this.now()
    const tab = (await host.listTabs()).find(
      (candidate) => candidate.id === tabId,
    )
    if (!tab) return
    const session = await sessionStore.read()
    const patch: Partial<SessionState> = {
      tabActiveAt: { ...session.tabActiveAt, [String(tabId)]: now },
      unread: session.unread.filter((id) => id !== tabId),
    }
    if (tab.groupId === NO_GROUP) {
      await sessionStore.write(patch)
      return
    }

    const state = await store.read()
    const group = (await host.listGroups(tab.windowId)).find(
      (candidate) => candidate.id === tab.groupId,
    )
    const space = spaceForGroup(state, group)
    if (!space) {
      await sessionStore.write(patch)
      return
    }

    patch.lastSelected = { ...session.lastSelected, [space.id]: tabId }
    patch.spaceActiveAt = { ...session.spaceActiveAt, [space.id]: now }
    await sessionStore.write(patch)

    const { followActiveTab } = await this.behavior()
    if (!followActiveTab || state.activeSpaceId === space.id) return
    await store.write({ ...state, activeSpaceId: space.id })
    await this.collapseOtherSpaceGroups(state, tab.windowId, tab.groupId)
  }

  private async onRemoved(tabId: number): Promise<void> {
    const session = await this.deps.session.read()
    const key = String(tabId)
    const { [key]: _link, ...tabLinks } = session.tabLinks
    const { [key]: _active, ...tabActiveAt } = session.tabActiveAt
    const lastSelected = Object.fromEntries(
      Object.entries(session.lastSelected).filter(([, id]) => id !== tabId),
    )
    await this.deps.session.write({
      tabLinks,
      tabActiveAt,
      lastSelected,
      unread: session.unread.filter((id) => id !== tabId),
    })
  }

  private async onReplaced(
    removedTabId: number,
    addedTabId: number,
  ): Promise<void> {
    const session = await this.deps.session.read()
    const from = String(removedTabId)
    const to = String(addedTabId)
    const itemId = session.tabLinks[from]
    const { [from]: _link, ...tabLinks } = session.tabLinks
    if (itemId) tabLinks[to] = itemId
    const lastSelected = Object.fromEntries(
      Object.entries(session.lastSelected).map(([spaceId, tabId]) => [
        spaceId,
        tabId === removedTabId ? addedTabId : tabId,
      ]),
    )
    await this.deps.session.write({ tabLinks, lastSelected })
  }

  private async collapseOtherSpaceGroups(
    state: SidebarState,
    windowId: number,
    keepGroupId: number,
  ): Promise<void> {
    for (const group of await this.deps.host.listGroups(windowId)) {
      if (group.id === keepGroupId || isAgentGroupTitle(group.title)) continue
      if (!spaceForGroup(state, group)) continue
      await this.deps.host.setGroupCollapsed(group.id, true)
    }
  }

  // --- switching ------------------------------------------------------------

  switchSpace(spaceId: SpaceId, windowId?: number): Promise<void> {
    return this.run(() => this.switchNow(spaceId, windowId))
  }

  private async switchNow(spaceId: SpaceId, windowId?: number): Promise<void> {
    const { host, store, session: sessionStore } = this.deps
    const state = await store.read()
    const space = state.spaces.byId[spaceId]
    const target = await this.targetWindowId(windowId)
    if (!space || target === undefined) return

    this.switching = true
    try {
      const now = this.now()
      const session = await sessionStore.read()
      const lastSelected = { ...session.lastSelected }

      const before = await host.listTabs(target)
      const active = before.find((tab) => tab.active)
      if (active && active.groupId !== NO_GROUP) {
        const groups = await host.listGroups(target)
        const current = spaceForGroup(
          state,
          groups.find((group) => group.id === active.groupId),
        )
        if (current) lastSelected[current.id] = active.id
      }

      const groupId = await this.ensureSpaceGroup(space, target)
      await host.setGroupCollapsed(groupId, false)

      const inGroup = (await host.listTabs(target)).filter(
        (tab) => tab.groupId === groupId,
      )
      const pick = selectionFor(
        inGroup.map((tab) => ({
          tabId: tab.id,
          index: tab.index,
          pinned: tab.pinned,
        })),
        lastSelected[spaceId],
      )
      if (pick !== null) {
        await host.activate(pick)
        lastSelected[spaceId] = pick
      }

      await this.collapseOtherSpaceGroups(state, target, groupId)

      const previous = state.activeSpaceId
      await store.write({ ...state, activeSpaceId: spaceId })
      // Stamping the previous space is the discard "timer": the alarm reads
      // these stamps instead of holding a live setTimeout across MV3 sleeps.
      const spaceActiveAt = { ...session.spaceActiveAt, [spaceId]: now }
      if (previous && previous !== spaceId) spaceActiveAt[previous] = now
      await sessionStore.write({ lastSelected, spaceActiveAt })
    } finally {
      this.switching = false
    }
  }

  stepSpace(direction: -1 | 1): Promise<void> {
    return this.run(async () => {
      const state = await this.deps.store.read()
      const { wrapAround } = await this.behavior()
      const next = adjacentSpace(
        state.spaces.order,
        state.activeSpaceId,
        direction,
        wrapAround,
      )
      if (next) await this.switchNow(next)
    })
  }

  switchToIndex(index: number): Promise<void> {
    return this.run(async () => {
      const state = await this.deps.store.read()
      const spaceId = state.spaces.order[index]
      if (spaceId) await this.switchNow(spaceId)
    })
  }

  // --- space CRUD -----------------------------------------------------------

  createSpaceFromPanel(input: {
    name: string
    icon?: string
    color?: TabGroupColor
    switchTo?: boolean
  }): Promise<{ spaceId: SpaceId }> {
    return this.run(async () => {
      const state = await this.deps.store.read()
      const used = state.spaces.order.flatMap((id) =>
        state.spaces.byId[id] ? [state.spaces.byId[id].color] : [],
      )
      const color = input.color ?? leastUsedColor(used)
      const result = createSpace(
        state,
        { name: input.name.trim(), icon: input.icon, color },
        { now: this.now() },
      )
      await this.deps.store.write(result.state)
      if (input.switchTo !== false) await this.switchNow(result.space.id)
      return { spaceId: result.space.id }
    })
  }

  updateSpaceEverywhere(input: {
    spaceId: SpaceId
    name?: string
    icon?: string
    color?: TabGroupColor
    theme?: Space['theme']
    pinnedCollapsed?: boolean
  }): Promise<void> {
    return this.run(async () => {
      const { host, store } = this.deps
      const state = await store.read()
      const before = state.spaces.byId[input.spaceId]
      if (!before) return
      const { spaceId, ...patch } = input
      const next = updateSpace(state, spaceId, patch)
      const after = next.spaces.byId[spaceId]
      if (!after) return
      // Groups are found by the old title, so rename them before storing.
      for (const group of await host.listGroups()) {
        if (spaceForGroup(state, group)?.id !== spaceId) continue
        await host.updateGroup(group.id, {
          title: after.name,
          color: after.color,
        })
      }
      await store.write(next)
    })
  }

  deleteSpaceEverywhere(spaceId: SpaceId): Promise<void> {
    return this.run(async () => {
      const { host, store, session: sessionStore } = this.deps
      const state = await store.read()
      if (!state.spaces.byId[spaceId]) return

      // Tabs survive a deleted space; they become loose tabs in every space.
      const tabs = await this.tabsOfSpace(state, spaceId)
      await host.ungroup(tabs.map((tab) => tab.id))

      const next = deleteSpace(state, spaceId, { now: this.now() })
      await store.write(next)

      const session = await sessionStore.read()
      await sessionStore.write({
        groupLinks: Object.fromEntries(
          Object.entries(session.groupLinks).filter(
            ([key]) => !key.endsWith(`:${spaceId}`),
          ),
        ),
        lastSelected: Object.fromEntries(
          Object.entries(session.lastSelected).filter(([id]) => id !== spaceId),
        ),
      })

      if (state.activeSpaceId === spaceId && next.activeSpaceId) {
        await this.switchNow(next.activeSpaceId)
      }
    })
  }

  moveSpaceBy(spaceId: SpaceId, direction: -1 | 1): Promise<void> {
    return this.run(async () => {
      const state = await this.deps.store.read()
      const from = state.spaces.order.indexOf(spaceId)
      if (from === -1) return
      await this.deps.store.write(moveSpace(state, spaceId, from + direction))
    })
  }

  // --- tabs and items -------------------------------------------------------

  activateTab(tabId: number): Promise<void> {
    return this.run(() => this.deps.host.activate(tabId))
  }

  closeTabs(tabIds: number[]): Promise<void> {
    return this.run(() => this.deps.host.close(tabIds))
  }

  newTab(input: { spaceId?: SpaceId; url?: string }): Promise<void> {
    return this.run(async () => {
      const state = await this.deps.store.read()
      const spaceId = input.spaceId ?? state.activeSpaceId
      const space = spaceId ? state.spaces.byId[spaceId] : undefined
      const windowId = await this.targetWindowId()
      if (windowId === undefined) return
      const groupId = space
        ? await this.ensureSpaceGroup(space, windowId)
        : undefined
      await this.deps.host.create({ windowId, url: input.url, groupId })
    })
  }

  /** Focus the live tab for an item, else open its URL in the item's space. */
  openItem(itemId: ItemId): Promise<void> {
    return this.run(async () => {
      const state = await this.deps.store.read()
      const session = await this.deps.session.read()
      const item = state.items.byId[itemId]
      if (item?.data.kind !== 'tab') return
      const linked = Object.entries(session.tabLinks).find(
        ([, id]) => id === itemId,
      )
      const live = linked
        ? (await this.deps.host.listTabs()).find(
            (tab) => tab.id === Number(linked[0]),
          )
        : undefined
      if (live) {
        await this.deps.host.activate(live.id)
        return
      }
      const spaceId = this.spaceIdOfItem(state, itemId)
      const windowId = await this.targetWindowId()
      if (windowId === undefined) return
      const space = spaceId
        ? state.spaces.byId[spaceId]
        : state.activeSpaceId
          ? state.spaces.byId[state.activeSpaceId]
          : undefined
      const groupId = space
        ? await this.ensureSpaceGroup(space, windowId)
        : undefined
      const tab = await this.deps.host.create({
        windowId,
        url: item.data.url,
        groupId,
      })
      await this.deps.session.write({
        tabLinks: { ...session.tabLinks, [String(tab.id)]: itemId },
      })
    })
  }

  moveItemTo(itemId: ItemId, parentId: ItemId, index: number): Promise<void> {
    return this.run(async () => {
      const state = await this.deps.store.read()
      await this.deps.store.write(moveItem(state, itemId, parentId, index))
    })
  }

  pinTab(tabId: number, parentId?: ItemId): Promise<void> {
    return this.run(async () => {
      const { host, store, session: sessionStore } = this.deps
      const state = await store.read()
      const tab = (await host.listTabs()).find(
        (candidate) => candidate.id === tabId,
      )
      if (!tab) return
      const groups = await host.listGroups(tab.windowId)
      const space =
        spaceForGroup(
          state,
          groups.find((group) => group.id === tab.groupId),
        ) ??
        (state.activeSpaceId
          ? state.spaces.byId[state.activeSpaceId]
          : undefined)
      if (!space) return

      const now = this.now()
      const pinned = pin(state, space.id, snapshotOf(host, tab, now), { now })
      const next =
        parentId && pinned.state.items.byId[parentId]
          ? moveItem(
              pinned.state,
              pinned.item.id,
              parentId,
              Number.MAX_SAFE_INTEGER,
            )
          : pinned.state
      await store.write(next)
      const session = await sessionStore.read()
      await sessionStore.write({
        tabLinks: { ...session.tabLinks, [String(tabId)]: pinned.item.id },
      })
    })
  }

  unpinItem(itemId: ItemId): Promise<void> {
    return this.run(async () => {
      const state = await this.deps.store.read()
      await this.deps.store.write(unpin(state, itemId))
      await this.dropLinksTo(itemId)
    })
  }

  /** Navigate the live tab back to the canonical pinned URL. */
  resetPinned(itemId: ItemId): Promise<void> {
    return this.run(async () => {
      const state = await this.deps.store.read()
      const session = await this.deps.session.read()
      const item = state.items.byId[itemId]
      if (item?.data.kind !== 'tab') return
      const entry = Object.entries(session.tabLinks).find(
        ([, id]) => id === itemId,
      )
      if (!entry) return
      await this.deps.host.navigate(Number(entry[0]), item.data.url)
    })
  }

  addEssentialFrom(input: { tabId?: number; url?: string }): Promise<void> {
    return this.run(async () => {
      const { host, store } = this.deps
      const state = await store.read()
      const now = this.now()
      let snapshot: TabSnapshot | undefined
      if (input.tabId !== undefined) {
        const tab = (await host.listTabs()).find(
          (candidate) => candidate.id === input.tabId,
        )
        if (tab) snapshot = snapshotOf(host, tab, now)
      } else if (input.url) {
        snapshot = {
          url: input.url,
          savedTitle: input.url,
          favicon: host.faviconUrl(input.url),
          lastActiveAt: now,
        }
      }
      if (!snapshot) return
      const result = addEssential(state, snapshot, { now })
      if (result.item) await store.write(result.state)
    })
  }

  removeEssentialItem(itemId: ItemId): Promise<void> {
    return this.run(async () => {
      const state = await this.deps.store.read()
      await this.deps.store.write(removeItem(state, itemId))
      await this.dropLinksTo(itemId)
    })
  }

  createFolderIn(
    spaceId: SpaceId,
    title: string,
    parentId?: ItemId,
  ): Promise<{ itemId: ItemId }> {
    return this.run(async () => {
      const state = await this.deps.store.read()
      const space = state.spaces.byId[spaceId]
      if (!space) throw new Error(`Unknown space ${spaceId}`)
      const parent =
        parentId && state.items.byId[parentId]
          ? parentId
          : space.containers.pinned
      const result = createFolder(state, parent, title, { now: this.now() })
      await this.deps.store.write(result.state)
      return { itemId: result.item.id }
    })
  }

  setItemExpansion(itemId: ItemId, expansion: Expansion): Promise<void> {
    return this.run(async () => {
      const state = await this.deps.store.read()
      const item = state.items.byId[itemId]
      if (item?.data.kind !== 'folder') return
      await this.deps.store.write({
        ...state,
        items: {
          ...state.items,
          byId: {
            ...state.items.byId,
            [itemId]: { ...item, data: { ...item.data, expansion } },
          },
        },
      })
    })
  }

  renameItem(itemId: ItemId, title: string | null): Promise<void> {
    return this.run(async () => {
      const state = await this.deps.store.read()
      const item = state.items.byId[itemId]
      if (!item) return
      await this.deps.store.write({
        ...state,
        items: {
          ...state.items,
          byId: { ...state.items.byId, [itemId]: { ...item, title } },
        },
      })
    })
  }

  private spaceIdOfItem(
    state: SidebarState,
    itemId: ItemId,
  ): SpaceId | undefined {
    let cursor: Item | undefined = state.items.byId[itemId]
    while (cursor) {
      if (cursor.data.kind === 'container') return cursor.data.spaceId
      cursor = cursor.parentId ? state.items.byId[cursor.parentId] : undefined
    }
    return undefined
  }

  private async dropLinksTo(itemId: ItemId): Promise<void> {
    const session = await this.deps.session.read()
    await this.deps.session.write({
      tabLinks: Object.fromEntries(
        Object.entries(session.tabLinks).filter(([, id]) => id !== itemId),
      ),
    })
  }

  // --- archive --------------------------------------------------------------

  archiveTabs(
    tabIds: number[],
    reason: ArchiveReason,
    source: string,
  ): Promise<void> {
    return this.run(async () => {
      const tabs = (await this.deps.host.listTabs()).filter((tab) =>
        tabIds.includes(tab.id),
      )
      await this.archiveAndClose(tabs, reason, source)
    })
  }

  private async archiveAndClose(
    tabs: TabInfo[],
    reason: ArchiveReason,
    _source: string,
  ): Promise<void> {
    if (tabs.length === 0) return
    const { host, store } = this.deps
    const now = this.now()
    let state = await store.read()
    const groups = await host.listGroups()

    const bySpace = new Map<SpaceId, TabSnapshot[]>()
    for (const tab of tabs) {
      const group = groups.find((candidate) => candidate.id === tab.groupId)
      const space = spaceForGroup(state, group)
      if (!space) continue
      const list = bySpace.get(space.id) ?? []
      list.push(snapshotOf(host, tab, now))
      bySpace.set(space.id, list)
    }
    for (const [spaceId, snapshots] of bySpace) {
      state = tidy(state, spaceId, snapshots, reason, { now })
    }
    if (bySpace.size > 0) await store.write(state)
    await host.close(tabs.map((tab) => tab.id))
  }

  restoreArchived(itemId: ItemId): Promise<void> {
    return this.run(async () => {
      const state = await this.deps.store.read()
      const entry = [...state.archive]
        .reverse()
        .find((candidate) => candidate.item.id === itemId)
      if (!entry) return
      const zone = entry.item.parentId
        ? zoneOf(state, entry.item.parentId)
        : null
      if (zone === 'pinned' || zone === 'essentials') {
        await this.deps.store.write(restore(state, entry.archivedAt, itemId))
        return
      }
      // Today rows are derived from live tabs, so a restore reopens the tab
      // and drops the entry rather than re-inserting a node nothing renders.
      await this.deps.store.write({
        ...state,
        archive: state.archive.filter((candidate) => candidate !== entry),
      })
      if (entry.item.data.kind === 'tab') {
        await this.newTabIn(entry.spaceId, entry.item.data.url)
      }
    })
  }

  private async newTabIn(spaceId: SpaceId, url: string): Promise<void> {
    const state = await this.deps.store.read()
    const space = state.spaces.byId[spaceId]
    const windowId = await this.targetWindowId()
    if (windowId === undefined) return
    const groupId = space
      ? await this.ensureSpaceGroup(space, windowId)
      : undefined
    await this.deps.host.create({ windowId, url, groupId, active: false })
  }

  /** Today tabs of a space: everything in its groups that is not pinned. */
  private async todayTabs(
    state: SidebarState,
    spaceId: SpaceId,
    session: SessionState,
  ): Promise<TabInfo[]> {
    const tabs = await this.tabsOfSpace(state, spaceId)
    return tabs.filter((tab) => {
      if (tab.pinned) return false
      const itemId = session.tabLinks[String(tab.id)]
      return !itemId || zoneOf(state, itemId) !== 'pinned'
    })
  }

  tidySpace(spaceId: SpaceId, reason: 'manual' | 'clear'): Promise<void> {
    return this.run(async () => {
      const state = await this.deps.store.read()
      const session = await this.deps.session.read()
      const tabs = (await this.todayTabs(state, spaceId, session)).filter(
        (tab) => !tab.active,
      )
      await this.archiveAndClose(
        tabs,
        reason,
        reason === 'clear' ? 'clear' : 'tidy',
      )
    })
  }

  /** `sidebar:archive` alarm: retire today tabs nobody has touched. */
  runArchiveAlarm(): Promise<void> {
    return this.run(async () => {
      const state = await this.deps.store.read()
      const threshold = ARCHIVE_AFTER_MS[state.settings.autoArchiveAfter]
      if (!Number.isFinite(threshold)) return
      const session = await this.deps.session.read()
      const cutoff = this.now() - threshold

      const stale: TabInfo[] = []
      for (const spaceId of state.spaces.order) {
        for (const tab of await this.todayTabs(state, spaceId, session)) {
          if (tab.active || tab.audible || tab.pinned) continue
          const lastActiveAt = session.tabActiveAt[String(tab.id)]
          if (lastActiveAt === undefined || lastActiveAt > cutoff) continue
          stale.push(tab)
        }
      }
      await this.archiveAndClose(stale, 'auto', 'archiveAlarm')
    })
  }

  /** `sidebar:discard` alarm: free memory held by spaces nobody visits. */
  runDiscardAlarm(): Promise<void> {
    return this.run(async () => {
      const state = await this.deps.store.read()
      const session = await this.deps.session.read()
      const cutoff =
        this.now() - state.settings.discardInactiveSpacesAfterMin * 60_000

      const victims: number[] = []
      for (const spaceId of state.spaces.order) {
        if (spaceId === state.activeSpaceId) continue
        const activeAt = session.spaceActiveAt[spaceId]
        if (activeAt === undefined || activeAt > cutoff) continue
        for (const tab of await this.tabsOfSpace(state, spaceId)) {
          if (tab.active || tab.audible || tab.discarded) continue
          const itemId = session.tabLinks[String(tab.id)]
          const item = itemId ? state.items.byId[itemId] : undefined
          const isPinnedRow = itemId
            ? zoneOf(state, itemId) === 'pinned'
            : false
          if (
            isPinnedRow &&
            item?.data.kind === 'tab' &&
            isDrifted(item.data.url, tab.url)
          ) {
            continue
          }
          victims.push(tab.id)
        }
      }
      await this.deps.host.discard(victims)
    })
  }

  // --- legacy Spaces actions ------------------------------------------------

  /** Move the active tab of the focused window into a space, then switch. */
  assignActiveTab(spaceId: SpaceId): Promise<void> {
    return this.run(async () => {
      const state = await this.deps.store.read()
      const space = state.spaces.byId[spaceId]
      const windowId = await this.targetWindowId()
      if (!space || windowId === undefined) return
      const active = (await this.deps.host.listTabs(windowId)).find(
        (tab) => tab.active,
      )
      if (!active) return
      await this.ensureSpaceGroup(space, windowId, [active.id])
      const session = await this.deps.session.read()
      await this.deps.session.write({
        lastSelected: { ...session.lastSelected, [spaceId]: active.id },
      })
      await this.switchNow(spaceId, windowId)
    })
  }

  /** Group every ungrouped tab of the focused window into a space. */
  adoptLooseTabs(spaceId: SpaceId): Promise<void> {
    return this.run(async () => {
      const state = await this.deps.store.read()
      const space = state.spaces.byId[spaceId]
      const windowId = await this.targetWindowId()
      if (!space || windowId === undefined) return
      const loose = (await this.deps.host.listTabs(windowId)).filter(
        (tab) => tab.groupId === NO_GROUP && !tab.pinned,
      )
      if (loose.length === 0) return
      await this.ensureSpaceGroup(
        space,
        windowId,
        loose.map((tab) => tab.id),
      )
      await this.switchNow(spaceId, windowId)
    })
  }
}

/** Least-used color, skipping grey, so neighbours stay distinguishable. */
function leastUsedColor(used: TabGroupColor[]): TabGroupColor {
  const palette: TabGroupColor[] = [
    'blue',
    'red',
    'yellow',
    'green',
    'pink',
    'purple',
    'cyan',
    'orange',
  ]
  let best = palette[0]
  let bestCount = Number.POSITIVE_INFINITY
  for (const color of palette) {
    const count = used.filter((candidate) => candidate === color).length
    if (count < bestCount) {
      best = color
      bestCount = count
    }
  }
  return best
}

/**
 * In-memory stores, used by tests and by any surface that wants to drive the
 * reconciler without extension storage.
 *
 * @public
 */
export function createMemoryStores(initial: SidebarState): {
  store: SidebarStore
  session: SessionStore
} {
  let state = initial
  let session: SessionState = {
    tabLinks: {},
    groupLinks: {},
    lastSelected: {},
    unread: [],
    tabActiveAt: {},
    spaceActiveAt: {},
  }
  return {
    store: {
      read: async () => state,
      write: async (next) => {
        state = next
      },
    },
    session: {
      read: async () => session,
      write: async (patch) => {
        session = { ...session, ...patch }
      },
    },
  }
}
