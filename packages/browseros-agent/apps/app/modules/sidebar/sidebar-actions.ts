import { toast } from 'sonner'
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
