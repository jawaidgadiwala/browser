import { toast } from 'sonner'
import {
  SidebarMessageType,
  sendSidebarMessage,
} from '@/lib/messaging/sidebar/sidebarMessages'
import type {
  ArchivedItem,
  ItemId,
  SidebarSettings,
} from '@/lib/sidebar/core/types'

/**
 * Archive and settings intents. The background reconciler does the work; a
 * missing handler surfaces as a toast rather than a silent no-op.
 */

async function run<T>(label: string, work: Promise<T>): Promise<T | undefined> {
  try {
    return await work
  } catch {
    toast.error(`${label} is not available yet`)
    return undefined
  }
}

export const archiveActions = {
  restore: (itemId: ItemId) =>
    run(
      'Restoring',
      sendSidebarMessage(SidebarMessageType.restoreArchived, { itemId }),
    ),
  /** Restores oldest first so the reopened tabs keep their archived order. */
  restoreMany: async (entries: ArchivedItem[]) => {
    for (const entry of [...entries].sort(
      (a, b) => a.archivedAt - b.archivedAt,
    )) {
      await archiveActions.restore(entry.item.id)
    }
  },
  purge: (olderThan: number | null) =>
    run(
      'Purging the archive',
      sendSidebarMessage(SidebarMessageType.purgeArchive, { olderThan }),
    ),
  updateSettings: (settings: Partial<SidebarSettings>) =>
    run(
      'Saving sidebar settings',
      sendSidebarMessage(SidebarMessageType.updateSettings, { settings }),
    ),
}
