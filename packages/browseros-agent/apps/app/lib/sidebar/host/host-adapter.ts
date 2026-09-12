import type { Space, TabGroupColor } from '../core/types'

/**
 * The only seam between sidebar logic and a browser. `ChromeHostAdapter`
 * implements it over the extension APIs today; a native adapter can replace
 * it later without any change to core or the reconciler.
 */

/** Chromium's sentinel for "not in a group". */
export const NO_GROUP = -1

/**
 * @public
 */
export interface WindowInfo {
  id: number
  type: 'normal' | 'popup' | 'panel' | 'app' | 'devtools'
  focused: boolean
}

/**
 * @public
 */
export interface TabInfo {
  id: number
  windowId: number
  groupId: number
  index: number
  url: string
  title: string
  pinned: boolean
  active: boolean
  audible: boolean
  discarded: boolean
  favIconUrl?: string
}

/**
 * @public
 */
export interface GroupInfo {
  id: number
  windowId: number
  title: string
  color: TabGroupColor
  collapsed: boolean
}

/**
 * @public
 */
export interface TabChangeInfo {
  url?: string
  title?: string
  audible?: boolean
  discarded?: boolean
  groupId?: number
  status?: 'loading' | 'complete' | 'unloaded'
}

/**
 * Every tab-shaped browser event, fanned into one stream so the reconciler
 * keeps a single entry point and panels never add listeners of their own.
 *
 * @public
 */
export type TabEvent =
  | { type: 'created'; tab: TabInfo }
  | { type: 'updated'; tabId: number; changes: TabChangeInfo; tab: TabInfo }
  | { type: 'removed'; tabId: number; windowId: number; windowClosing: boolean }
  | {
      type: 'moved'
      tabId: number
      windowId: number
      fromIndex: number
      toIndex: number
    }
  | { type: 'activated'; tabId: number; windowId: number }
  | { type: 'attached'; tabId: number; windowId: number; index: number }
  | { type: 'detached'; tabId: number; windowId: number }
  | { type: 'replaced'; addedTabId: number; removedTabId: number }

/**
 * @public
 */
export type Unsubscribe = () => void

/**
 * @public
 */
export interface Tint {
  rgb: [number, number, number]
  intensity: number
}

/**
 * @public
 */
export interface CreateTabInput {
  windowId: number
  url?: string
  groupId?: number
  index?: number
  active?: boolean
}

/**
 * @public
 */
export interface HostAdapter {
  listWindows(): Promise<WindowInfo[]>
  listTabs(windowId?: number): Promise<TabInfo[]>
  listGroups(windowId?: number): Promise<GroupInfo[]>
  activate(tabId: number): Promise<void>
  create(input: CreateTabInput): Promise<TabInfo>
  close(tabIds: number[]): Promise<void>
  discard(tabIds: number[]): Promise<void>
  move(tabId: number, to: { windowId?: number; index: number }): Promise<void>
  navigate(tabId: number, url: string): Promise<void>
  /**
   * The group representing `space` in `windowId`, created when missing.
   * `seedTabIds` become its first tabs; without them a blank tab is opened,
   * because Chromium has no empty groups.
   */
  ensureGroup(
    windowId: number,
    space: Space,
    seedTabIds?: number[],
  ): Promise<number>
  updateGroup(
    groupId: number,
    patch: { title?: string; color?: TabGroupColor },
  ): Promise<void>
  setGroupCollapsed(groupId: number, collapsed: boolean): Promise<void>
  groupTabs(tabIds: number[], groupId: number): Promise<void>
  ungroup(tabIds: number[]): Promise<void>
  faviconUrl(pageUrl: string): string
  onTabEvent(cb: (event: TabEvent) => void): Unsubscribe
  onWindowFocus(cb: (windowId: number) => void): Unsubscribe
  // Native-only. Absent in ChromeHostAdapter; callers feature-detect.
  setWindowTint?(windowId: number, tint: Tint): Promise<void>
  openGlance?(tabId: number, url: string): Promise<void>
  setCompact?(pinned: boolean): Promise<void>
  split?(tabIds: number[], layout: 'vertical' | 'horizontal'): Promise<void>
}
