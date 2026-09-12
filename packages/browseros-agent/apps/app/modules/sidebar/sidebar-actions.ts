import { toast } from 'sonner'
import type { DropIntent } from '@/components/sidebar/dnd/drop-plan'
import {
  type CreateSpaceData,
  SidebarMessageType,
  sendSidebarMessage,
  type UpdateSpaceData,
} from '@/lib/messaging/sidebar/sidebarMessages'
import type { Expansion, ItemId, SpaceId } from '@/lib/sidebar/core/types'

/**
 * Every mutation the panel can trigger. The background owns tab work, so a
 * missing handler must surface as a toast instead of a silent no-op.
 */

async function run<T>(label: string, work: Promise<T>): Promise<T | undefined> {
  try {
    return await work
  } catch {
    toast.error(`${label} is not available yet`)
    return undefined
  }
}

export const sidebarActions = {
  switchSpace: (spaceId: SpaceId) =>
    run(
      'Switching spaces',
      sendSidebarMessage(SidebarMessageType.switchSpace, { spaceId }),
    ),
  createSpace: (data: CreateSpaceData) =>
    run(
      'Creating a space',
      sendSidebarMessage(SidebarMessageType.createSpace, data),
    ),
  updateSpace: (data: UpdateSpaceData) =>
    run(
      'Updating the space',
      sendSidebarMessage(SidebarMessageType.updateSpace, data),
    ),
  deleteSpace: (spaceId: SpaceId) =>
    run(
      'Deleting the space',
      sendSidebarMessage(SidebarMessageType.deleteSpace, { spaceId }),
    ),
  moveSpace: (spaceId: SpaceId, direction: -1 | 1) =>
    run(
      'Reordering spaces',
      sendSidebarMessage(SidebarMessageType.moveSpace, { spaceId, direction }),
    ),
  assignActiveTab: (spaceId: SpaceId) =>
    run(
      'Moving the tab',
      sendSidebarMessage(SidebarMessageType.assignActiveTab, { spaceId }),
    ),
  adoptLooseTabs: (spaceId: SpaceId) =>
    run(
      'Adopting tabs',
      sendSidebarMessage(SidebarMessageType.adoptLooseTabs, { spaceId }),
    ),
  activateTab: (tabId: number) =>
    run(
      'Activating the tab',
      sendSidebarMessage(SidebarMessageType.activateTab, { tabId }),
    ),
  closeTabs: (tabIds: number[], source: string) =>
    run(
      'Closing tabs',
      sendSidebarMessage(SidebarMessageType.closeTabs, { tabIds, source }),
    ),
  openItem: (itemId: ItemId) =>
    run(
      'Opening the tab',
      sendSidebarMessage(SidebarMessageType.openItem, { itemId }),
    ),
  unpinItem: (itemId: ItemId) =>
    run(
      'Unpinning',
      sendSidebarMessage(SidebarMessageType.unpinItem, { itemId }),
    ),
  resetPinned: (itemId: ItemId) =>
    run(
      'Resetting the pinned tab',
      sendSidebarMessage(SidebarMessageType.resetPinned, { itemId }),
    ),
  setExpansion: (itemId: ItemId, expansion: Expansion) =>
    run(
      'Folding',
      sendSidebarMessage(SidebarMessageType.setExpansion, {
        itemId,
        expansion,
      }),
    ),
  newTab: (spaceId?: SpaceId, url?: string) =>
    run(
      'Opening a new tab',
      sendSidebarMessage(SidebarMessageType.newTab, { spaceId, url }),
    ),
  tidy: (spaceId: SpaceId) =>
    run('Tidy', sendSidebarMessage(SidebarMessageType.tidy, { spaceId })),
  clear: (spaceId: SpaceId) =>
    run('Clear', sendSidebarMessage(SidebarMessageType.clear, { spaceId })),
  pinTab: (data: {
    tabId?: number
    url?: string
    title?: string
    spaceId?: SpaceId
    parentId?: ItemId
    index?: number
  }) => run('Pinning', sendSidebarMessage(SidebarMessageType.pinTab, data)),
  addEssential: (data: { tabId?: number; url?: string; title?: string }) =>
    run(
      'Adding to essentials',
      sendSidebarMessage(SidebarMessageType.addEssential, data),
    ),
  removeEssential: (itemId: ItemId) =>
    run(
      'Removing the essential',
      sendSidebarMessage(SidebarMessageType.removeEssential, { itemId }),
    ),
  moveItem: (itemId: ItemId, parentId: ItemId, index: number) =>
    run(
      'Moving',
      sendSidebarMessage(SidebarMessageType.moveItem, {
        itemId,
        parentId,
        index,
      }),
    ),
  createFolder: (spaceId: SpaceId, title: string, parentId?: ItemId) =>
    run(
      'Creating a folder',
      sendSidebarMessage(SidebarMessageType.createFolder, {
        spaceId,
        title,
        parentId,
      }),
    ),
  renameItem: (itemId: ItemId, title: string | null) =>
    run(
      'Renaming',
      sendSidebarMessage(SidebarMessageType.renameItem, { itemId, title }),
    ),
}

/** Drop intents are applied in order so a multi-step plan stays atomic-ish. */
export async function applyDropIntents(intents: DropIntent[]): Promise<void> {
  for (const intent of intents) {
    if (intent.type === 'moveItem') {
      await sidebarActions.moveItem(
        intent.itemId,
        intent.parentId,
        intent.index,
      )
    } else if (intent.type === 'pinTab') {
      await sidebarActions.pinTab(intent)
    } else if (intent.type === 'unpinItem') {
      await sidebarActions.unpinItem(intent.itemId)
    } else {
      await sidebarActions.addEssential(intent)
    }
  }
}

/**
 * Browser pages the panel cannot open itself (`chrome://…` is blocked for
 * extension pages) go through the background; anything else falls back to a
 * plain window open so the footer still works before the handler lands.
 */
export async function openUrlInTab(url: string): Promise<void> {
  try {
    await sendSidebarMessage(SidebarMessageType.newTab, { url })
  } catch {
    window.open(url, '_blank')
  }
}
