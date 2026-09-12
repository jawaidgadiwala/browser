import { defineExtensionMessaging } from '@webext-core/messaging'
import type {
  Expansion,
  ItemId,
  SpaceId,
  TabGroupColor,
  ThemeSpec,
} from '@/lib/sidebar/core/types'

/**
 * Panel → background intents. The background is the only writer of the
 * sidebar store; panels watch storage for results. Tab work stays in the
 * background so it survives panel unmounts mid-operation.
 */
export const SidebarMessageType = {
  switchSpace: 'sidebar.switchSpace',
  createSpace: 'sidebar.createSpace',
  updateSpace: 'sidebar.updateSpace',
  deleteSpace: 'sidebar.deleteSpace',
  moveSpace: 'sidebar.moveSpace',
  /** Move the active tab of the focused window into a space, then switch. */
  assignActiveTab: 'sidebar.assignActiveTab',
  /** Group every ungrouped tab of the focused window into a space. */
  adoptLooseTabs: 'sidebar.adoptLooseTabs',
  activateTab: 'sidebar.activateTab',
  closeTabs: 'sidebar.closeTabs',
  openItem: 'sidebar.openItem',
  moveItem: 'sidebar.moveItem',
  pinTab: 'sidebar.pinTab',
  unpinItem: 'sidebar.unpinItem',
  resetPinned: 'sidebar.resetPinned',
  addEssential: 'sidebar.addEssential',
  removeEssential: 'sidebar.removeEssential',
  createFolder: 'sidebar.createFolder',
  setExpansion: 'sidebar.setExpansion',
  renameItem: 'sidebar.renameItem',
  archiveTabs: 'sidebar.archiveTabs',
  restoreArchived: 'sidebar.restoreArchived',
  tidy: 'sidebar.tidy',
  clear: 'sidebar.clear',
  newTab: 'sidebar.newTab',
  /** Background → mounted panel/new tab: open the space switcher palette. */
  openSwitcher: 'sidebar.openSwitcher',
} as const

export interface CreateSpaceData {
  name: string
  icon?: string
  color?: TabGroupColor
  theme?: ThemeSpec
  switchTo?: boolean
}

export interface UpdateSpaceData {
  spaceId: SpaceId
  name?: string
  icon?: string
  color?: TabGroupColor
  theme?: ThemeSpec
  pinnedCollapsed?: boolean
}

export interface MoveItemData {
  itemId: ItemId
  parentId: ItemId
  index: number
}

type SidebarMessagesProtocol = {
  [SidebarMessageType.switchSpace](data: { spaceId: SpaceId }): void
  [SidebarMessageType.createSpace](data: CreateSpaceData): { spaceId: SpaceId }
  [SidebarMessageType.updateSpace](data: UpdateSpaceData): void
  [SidebarMessageType.deleteSpace](data: { spaceId: SpaceId }): void
  [SidebarMessageType.moveSpace](data: {
    spaceId: SpaceId
    direction: -1 | 1
  }): void
  [SidebarMessageType.assignActiveTab](data: { spaceId: SpaceId }): void
  [SidebarMessageType.adoptLooseTabs](data: { spaceId: SpaceId }): void
  [SidebarMessageType.activateTab](data: { tabId: number }): void
  [SidebarMessageType.closeTabs](data: {
    tabIds: number[]
    source: string
  }): void
  /** Focus the live tab for an item, or open its URL in the item's space. */
  [SidebarMessageType.openItem](data: { itemId: ItemId }): void
  [SidebarMessageType.moveItem](data: MoveItemData): void
  /** Pin a live tab into its space's pinned root (or a folder). */
  [SidebarMessageType.pinTab](data: { tabId: number; parentId?: ItemId }): void
  [SidebarMessageType.unpinItem](data: { itemId: ItemId }): void
  /** Navigate the live tab back to the canonical pinned URL. */
  [SidebarMessageType.resetPinned](data: { itemId: ItemId }): void
  [SidebarMessageType.addEssential](data: {
    tabId?: number
    url?: string
  }): void
  [SidebarMessageType.removeEssential](data: { itemId: ItemId }): void
  [SidebarMessageType.createFolder](data: {
    spaceId: SpaceId
    title: string
    parentId?: ItemId
  }): { itemId: ItemId }
  [SidebarMessageType.setExpansion](data: {
    itemId: ItemId
    expansion: Expansion
  }): void
  [SidebarMessageType.renameItem](data: {
    itemId: ItemId
    title: string | null
  }): void
  [SidebarMessageType.archiveTabs](data: {
    tabIds: number[]
    reason: 'manual' | 'clear'
    source: string
  }): void
  [SidebarMessageType.restoreArchived](data: { itemId: ItemId }): void
  [SidebarMessageType.tidy](data: { spaceId: SpaceId }): void
  [SidebarMessageType.clear](data: { spaceId: SpaceId }): void
  [SidebarMessageType.newTab](data: { spaceId?: SpaceId; url?: string }): void
  [SidebarMessageType.openSwitcher](): boolean
}

const { sendMessage, onMessage } =
  defineExtensionMessaging<SidebarMessagesProtocol>()

export { onMessage as onSidebarMessage, sendMessage as sendSidebarMessage }
