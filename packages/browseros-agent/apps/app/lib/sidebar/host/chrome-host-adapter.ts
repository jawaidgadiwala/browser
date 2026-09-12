import type { Space, TabGroupColor } from '../core/types'
import {
  type CreateTabInput,
  type GroupInfo,
  type HostAdapter,
  NO_GROUP,
  type TabEvent,
  type TabInfo,
  type Unsubscribe,
  type WindowInfo,
} from './host-adapter'

/**
 * `HostAdapter` over the extension APIs. Every method is defensive: tabs and
 * groups vanish between a query and the call that follows it, and a throw
 * here would take down the whole reconcile pass.
 */

function toTab(tab: chrome.tabs.Tab): TabInfo | null {
  if (tab.id === undefined || tab.windowId === undefined) return null
  return {
    id: tab.id,
    windowId: tab.windowId,
    groupId: tab.groupId ?? NO_GROUP,
    index: tab.index,
    url: tab.url ?? tab.pendingUrl ?? '',
    title: tab.title ?? '',
    pinned: tab.pinned ?? false,
    active: tab.active ?? false,
    audible: tab.audible ?? false,
    discarded: tab.discarded ?? false,
    favIconUrl: tab.favIconUrl,
  }
}

function toGroup(group: chrome.tabGroups.TabGroup): GroupInfo {
  return {
    id: group.id,
    windowId: group.windowId,
    title: group.title ?? '',
    color: group.color as TabGroupColor,
    collapsed: group.collapsed,
  }
}

function nonEmpty(tabIds: number[]): [number, ...number[]] | null {
  return tabIds.length > 0 ? (tabIds as [number, ...number[]]) : null
}

export class ChromeHostAdapter implements HostAdapter {
  async listWindows(): Promise<WindowInfo[]> {
    const windows = await chrome.windows.getAll({}).catch(() => [])
    return windows.flatMap((window) =>
      window.id === undefined
        ? []
        : [
            {
              id: window.id,
              type: (window.type ?? 'normal') as WindowInfo['type'],
              focused: window.focused ?? false,
            },
          ],
    )
  }

  async listTabs(windowId?: number): Promise<TabInfo[]> {
    const tabs = await chrome.tabs
      .query(windowId === undefined ? {} : { windowId })
      .catch(() => [])
    return tabs.flatMap((tab) => {
      const info = toTab(tab)
      return info ? [info] : []
    })
  }

  async listGroups(windowId?: number): Promise<GroupInfo[]> {
    const groups = await chrome.tabGroups
      .query(windowId === undefined ? {} : { windowId })
      .catch(() => [])
    return groups.map(toGroup)
  }

  async activate(tabId: number): Promise<void> {
    await chrome.tabs.update(tabId, { active: true }).catch(() => undefined)
  }

  async create(input: CreateTabInput): Promise<TabInfo> {
    const tab = await chrome.tabs.create({
      windowId: input.windowId,
      url: input.url,
      index: input.index,
      active: input.active ?? true,
    })
    const info = toTab(tab)
    if (!info) throw new Error('New tab has no id')
    if (input.groupId !== undefined) {
      await this.groupTabs([info.id], input.groupId)
    }
    return info
  }

  async close(tabIds: number[]): Promise<void> {
    const ids = nonEmpty(tabIds)
    if (!ids) return
    await chrome.tabs.remove(ids).catch(() => undefined)
  }

  async discard(tabIds: number[]): Promise<void> {
    for (const tabId of tabIds) {
      await chrome.tabs.discard(tabId).catch(() => undefined)
    }
  }

  async move(
    tabId: number,
    to: { windowId?: number; index: number },
  ): Promise<void> {
    await chrome.tabs.move(tabId, to).catch(() => undefined)
  }

  async navigate(tabId: number, url: string): Promise<void> {
    await chrome.tabs.update(tabId, { url }).catch(() => undefined)
  }

  async ensureGroup(
    windowId: number,
    space: Space,
    seedTabIds?: number[],
  ): Promise<number> {
    const groups = await this.listGroups(windowId)
    const existing =
      groups.find(
        (group) => group.title === space.name && group.color === space.color,
      ) ?? groups.find((group) => group.title === space.name)
    const seed = nonEmpty(seedTabIds ?? [])
    if (existing) {
      if (seed) await this.groupTabs(seed, existing.id)
      return existing.id
    }
    let tabIds = seed
    if (!tabIds) {
      const tab = await this.create({ windowId, active: true })
      tabIds = [tab.id]
    }
    const groupId = await chrome.tabs.group({
      tabIds,
      createProperties: { windowId },
    })
    await chrome.tabGroups
      .update(groupId, {
        title: space.name,
        color: space.color,
        collapsed: false,
      })
      .catch(() => undefined)
    return groupId
  }

  async updateGroup(
    groupId: number,
    patch: { title?: string; color?: TabGroupColor },
  ): Promise<void> {
    await chrome.tabGroups.update(groupId, patch).catch(() => undefined)
  }

  async setGroupCollapsed(groupId: number, collapsed: boolean): Promise<void> {
    await chrome.tabGroups.update(groupId, { collapsed }).catch(() => undefined)
  }

  async groupTabs(tabIds: number[], groupId: number): Promise<void> {
    const ids = nonEmpty(tabIds)
    if (!ids) return
    await chrome.tabs.group({ tabIds: ids, groupId }).catch(() => undefined)
  }

  async ungroup(tabIds: number[]): Promise<void> {
    const ids = nonEmpty(tabIds)
    if (!ids) return
    await chrome.tabs.ungroup(ids).catch(() => undefined)
  }

  /** MV3 favicon endpoint; needs the `favicon` permission in the manifest. */
  faviconUrl(pageUrl: string): string {
    const url = new URL(chrome.runtime.getURL('/_favicon/'))
    url.searchParams.set('pageUrl', pageUrl)
    url.searchParams.set('size', '32')
    return url.toString()
  }

  onTabEvent(cb: (event: TabEvent) => void): Unsubscribe {
    const onCreated = (tab: chrome.tabs.Tab) => {
      const info = toTab(tab)
      if (info) cb({ type: 'created', tab: info })
    }
    const onUpdated = (
      tabId: number,
      changes: chrome.tabs.OnUpdatedInfo,
      tab: chrome.tabs.Tab,
    ) => {
      const info = toTab(tab)
      if (info) cb({ type: 'updated', tabId, changes, tab: info })
    }
    const onRemoved = (tabId: number, info: chrome.tabs.OnRemovedInfo) => {
      cb({
        type: 'removed',
        tabId,
        windowId: info.windowId,
        windowClosing: info.isWindowClosing,
      })
    }
    const onMoved = (tabId: number, info: chrome.tabs.OnMovedInfo) => {
      cb({
        type: 'moved',
        tabId,
        windowId: info.windowId,
        fromIndex: info.fromIndex,
        toIndex: info.toIndex,
      })
    }
    const onActivated = (info: chrome.tabs.OnActivatedInfo) => {
      cb({ type: 'activated', tabId: info.tabId, windowId: info.windowId })
    }
    const onAttached = (tabId: number, info: chrome.tabs.OnAttachedInfo) => {
      cb({
        type: 'attached',
        tabId,
        windowId: info.newWindowId,
        index: info.newPosition,
      })
    }
    const onDetached = (tabId: number, info: chrome.tabs.OnDetachedInfo) => {
      cb({ type: 'detached', tabId, windowId: info.oldWindowId })
    }
    const onReplaced = (addedTabId: number, removedTabId: number) => {
      cb({ type: 'replaced', addedTabId, removedTabId })
    }

    chrome.tabs.onCreated.addListener(onCreated)
    chrome.tabs.onUpdated.addListener(onUpdated)
    chrome.tabs.onRemoved.addListener(onRemoved)
    chrome.tabs.onMoved.addListener(onMoved)
    chrome.tabs.onActivated.addListener(onActivated)
    chrome.tabs.onAttached.addListener(onAttached)
    chrome.tabs.onDetached.addListener(onDetached)
    chrome.tabs.onReplaced.addListener(onReplaced)

    return () => {
      chrome.tabs.onCreated.removeListener(onCreated)
      chrome.tabs.onUpdated.removeListener(onUpdated)
      chrome.tabs.onRemoved.removeListener(onRemoved)
      chrome.tabs.onMoved.removeListener(onMoved)
      chrome.tabs.onActivated.removeListener(onActivated)
      chrome.tabs.onAttached.removeListener(onAttached)
      chrome.tabs.onDetached.removeListener(onDetached)
      chrome.tabs.onReplaced.removeListener(onReplaced)
    }
  }

  onWindowFocus(cb: (windowId: number) => void): Unsubscribe {
    const listener = (windowId: number) => cb(windowId)
    chrome.windows.onFocusChanged.addListener(listener)
    return () => chrome.windows.onFocusChanged.removeListener(listener)
  }
}
