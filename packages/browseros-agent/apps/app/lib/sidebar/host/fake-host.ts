import type { Space, TabGroupColor } from '../core/types'
import {
  type CreateTabInput,
  type GroupInfo,
  type HostAdapter,
  NO_GROUP,
  type TabChangeInfo,
  type TabEvent,
  type TabInfo,
  type Unsubscribe,
  type WindowInfo,
} from './host-adapter'

/**
 * In-memory `HostAdapter` for tests. Mutating helpers emit the same events a
 * browser would, so a reducer test can replay a recorded session without any
 * `chrome.*` global.
 */

/**
 * @public
 */
export interface FakeTabInput {
  windowId?: number
  url?: string
  title?: string
  groupId?: number
  pinned?: boolean
  active?: boolean
  audible?: boolean
  discarded?: boolean
}

/**
 * @public
 */
export interface FakeGroupInput {
  windowId?: number
  title: string
  color?: TabGroupColor
  collapsed?: boolean
  tabIds?: number[]
}

export class FakeHost implements HostAdapter {
  windows: WindowInfo[] = []
  tabs: TabInfo[] = []
  groups: GroupInfo[] = []
  /** Every event this host emitted, in order, for assertions. */
  emitted: TabEvent[] = []

  private nextTabId = 1
  private nextGroupId = 100
  private nextWindowId = 1
  private tabListeners = new Set<(event: TabEvent) => void>()
  private focusListeners = new Set<(windowId: number) => void>()

  constructor() {
    this.addWindow()
  }

  // --- simulation helpers ---------------------------------------------------

  addWindow(type: WindowInfo['type'] = 'normal'): WindowInfo {
    const window: WindowInfo = {
      id: this.nextWindowId++,
      type,
      focused: this.windows.length === 0,
    }
    this.windows.push(window)
    return window
  }

  addTab(input: FakeTabInput = {}): TabInfo {
    const windowId = input.windowId ?? this.windows[0].id
    const tab: TabInfo = {
      id: this.nextTabId++,
      windowId,
      groupId: input.groupId ?? NO_GROUP,
      index: this.tabs.filter((t) => t.windowId === windowId).length,
      url: input.url ?? 'about:blank',
      title: input.title ?? '',
      pinned: input.pinned ?? false,
      active: input.active ?? false,
      audible: input.audible ?? false,
      discarded: input.discarded ?? false,
    }
    this.tabs.push(tab)
    if (tab.active) this.markActive(tab)
    this.emit({ type: 'created', tab: { ...tab } })
    return tab
  }

  addGroup(input: FakeGroupInput): GroupInfo {
    const group: GroupInfo = {
      id: this.nextGroupId++,
      windowId: input.windowId ?? this.windows[0].id,
      title: input.title,
      color: input.color ?? 'blue',
      collapsed: input.collapsed ?? false,
    }
    this.groups.push(group)
    for (const tabId of input.tabIds ?? []) {
      const tab = this.tab(tabId)
      if (tab) tab.groupId = group.id
    }
    return group
  }

  activateTab(tabId: number): void {
    const tab = this.tab(tabId)
    if (!tab) return
    this.markActive(tab)
    this.emit({ type: 'activated', tabId, windowId: tab.windowId })
  }

  updateTab(tabId: number, changes: TabChangeInfo): void {
    const tab = this.tab(tabId)
    if (!tab) return
    if (changes.url !== undefined) tab.url = changes.url
    if (changes.title !== undefined) tab.title = changes.title
    if (changes.audible !== undefined) tab.audible = changes.audible
    if (changes.discarded !== undefined) tab.discarded = changes.discarded
    if (changes.groupId !== undefined) tab.groupId = changes.groupId
    this.emit({ type: 'updated', tabId, changes, tab: { ...tab } })
  }

  removeTab(tabId: number, windowClosing = false): void {
    const tab = this.tab(tabId)
    if (!tab) return
    this.tabs = this.tabs.filter((candidate) => candidate.id !== tabId)
    this.reindex(tab.windowId)
    this.emit({
      type: 'removed',
      tabId,
      windowId: tab.windowId,
      windowClosing,
    })
  }

  moveTab(tabId: number, toIndex: number): void {
    const tab = this.tab(tabId)
    if (!tab) return
    const fromIndex = tab.index
    tab.index = toIndex
    this.reindex(tab.windowId)
    this.emit({
      type: 'moved',
      tabId,
      windowId: tab.windowId,
      fromIndex,
      toIndex,
    })
  }

  attachTab(tabId: number, windowId: number): void {
    const tab = this.tab(tabId)
    if (!tab) return
    const oldWindowId = tab.windowId
    this.emit({ type: 'detached', tabId, windowId: oldWindowId })
    tab.windowId = windowId
    tab.groupId = NO_GROUP
    this.reindex(oldWindowId)
    this.reindex(windowId)
    this.emit({ type: 'attached', tabId, windowId, index: tab.index })
  }

  replaceTab(removedTabId: number, addedTabId: number): void {
    this.emit({ type: 'replaced', addedTabId, removedTabId })
  }

  focusWindow(windowId: number): void {
    for (const window of this.windows) window.focused = window.id === windowId
    for (const listener of this.focusListeners) listener(windowId)
  }

  tab(tabId: number): TabInfo | undefined {
    return this.tabs.find((candidate) => candidate.id === tabId)
  }

  group(groupId: number): GroupInfo | undefined {
    return this.groups.find((candidate) => candidate.id === groupId)
  }

  tabsInGroup(groupId: number): TabInfo[] {
    return this.tabs.filter((tab) => tab.groupId === groupId)
  }

  private markActive(tab: TabInfo) {
    for (const candidate of this.tabs) {
      if (candidate.windowId === tab.windowId) {
        candidate.active = candidate.id === tab.id
      }
    }
  }

  private reindex(windowId: number) {
    const inWindow = this.tabs
      .filter((tab) => tab.windowId === windowId)
      .sort((a, b) => a.index - b.index)
    inWindow.forEach((tab, index) => {
      tab.index = index
    })
  }

  private emit(event: TabEvent) {
    this.emitted.push(event)
    for (const listener of this.tabListeners) listener(event)
  }

  // --- HostAdapter ----------------------------------------------------------

  async listWindows(): Promise<WindowInfo[]> {
    return this.windows.map((window) => ({ ...window }))
  }

  async listTabs(windowId?: number): Promise<TabInfo[]> {
    return this.tabs
      .filter((tab) => windowId === undefined || tab.windowId === windowId)
      .map((tab) => ({ ...tab }))
  }

  async listGroups(windowId?: number): Promise<GroupInfo[]> {
    return this.groups
      .filter((group) => windowId === undefined || group.windowId === windowId)
      .map((group) => ({ ...group }))
  }

  async activate(tabId: number): Promise<void> {
    this.activateTab(tabId)
  }

  async create(input: CreateTabInput): Promise<TabInfo> {
    const tab = this.addTab({
      windowId: input.windowId,
      url: input.url,
      groupId: input.groupId,
      active: input.active ?? true,
    })
    if (input.index !== undefined) this.moveTab(tab.id, input.index)
    return { ...tab }
  }

  async close(tabIds: number[]): Promise<void> {
    for (const tabId of tabIds) this.removeTab(tabId)
  }

  async discard(tabIds: number[]): Promise<void> {
    for (const tabId of tabIds) {
      const tab = this.tab(tabId)
      if (tab) tab.discarded = true
    }
  }

  async move(
    tabId: number,
    to: { windowId?: number; index: number },
  ): Promise<void> {
    if (to.windowId !== undefined) {
      const tab = this.tab(tabId)
      if (tab && tab.windowId !== to.windowId)
        this.attachTab(tabId, to.windowId)
    }
    this.moveTab(tabId, to.index)
  }

  async navigate(tabId: number, url: string): Promise<void> {
    this.updateTab(tabId, { url, status: 'complete' })
  }

  async ensureGroup(
    windowId: number,
    space: Space,
    seedTabIds?: number[],
  ): Promise<number> {
    const inWindow = this.groups.filter((group) => group.windowId === windowId)
    const existing =
      inWindow.find(
        (group) => group.title === space.name && group.color === space.color,
      ) ?? inWindow.find((group) => group.title === space.name)
    if (existing) {
      if (seedTabIds?.length) await this.groupTabs(seedTabIds, existing.id)
      return existing.id
    }
    let tabIds = seedTabIds ?? []
    if (tabIds.length === 0) {
      tabIds = [this.addTab({ windowId, active: true }).id]
    }
    const group = this.addGroup({
      windowId,
      title: space.name,
      color: space.color,
      tabIds,
    })
    return group.id
  }

  async updateGroup(
    groupId: number,
    patch: { title?: string; color?: TabGroupColor },
  ): Promise<void> {
    const group = this.group(groupId)
    if (!group) return
    if (patch.title !== undefined) group.title = patch.title
    if (patch.color !== undefined) group.color = patch.color
  }

  async setGroupCollapsed(groupId: number, collapsed: boolean): Promise<void> {
    const group = this.group(groupId)
    if (group) group.collapsed = collapsed
  }

  async groupTabs(tabIds: number[], groupId: number): Promise<void> {
    const group = this.group(groupId)
    if (!group) return
    for (const tabId of tabIds) {
      const tab = this.tab(tabId)
      if (!tab) continue
      tab.groupId = groupId
      tab.windowId = group.windowId
    }
  }

  async ungroup(tabIds: number[]): Promise<void> {
    for (const tabId of tabIds) {
      const tab = this.tab(tabId)
      if (tab) tab.groupId = NO_GROUP
    }
  }

  faviconUrl(pageUrl: string): string {
    return `chrome-extension://fake/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=32`
  }

  onTabEvent(cb: (event: TabEvent) => void): Unsubscribe {
    this.tabListeners.add(cb)
    return () => this.tabListeners.delete(cb)
  }

  onWindowFocus(cb: (windowId: number) => void): Unsubscribe {
    this.focusListeners.add(cb)
    return () => this.focusListeners.delete(cb)
  }
}
