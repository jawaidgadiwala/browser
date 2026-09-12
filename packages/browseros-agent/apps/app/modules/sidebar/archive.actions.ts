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
import { NO_WINDOW_ERROR } from '@/lib/sidebar/reconciler'

/**
 * Archive and settings intents. The background reconciler does the work; a
 * missing handler surfaces as a toast rather than a silent no-op.
 */

async function run<T>(label: string, work: Promise<T>): Promise<T | undefined> {
  try {
    return await work
  } catch (error) {
    toast.error(failureMessage(label, error))
    return undefined
  }
}

/** Reasons the background reports that the user can act on. */
const KNOWN_REASONS: readonly string[] = [NO_WINDOW_ERROR]

/**
 * Our own reason (an archive entry that could not be restored) says more than
 * the generic fallback, which stands in for a background worker that has no
 * handler registered yet.
 */
function failureMessage(label: string, error: unknown): string {
  const detail = error instanceof Error ? error.message.trim() : ''
  return KNOWN_REASONS.includes(detail)
    ? detail
    : `${label} is not available yet`
}

export const archiveActions = {
  restore: (itemId: ItemId) =>
    run(
      'Restoring',
      sendSidebarMessage(SidebarMessageType.restoreArchived, { itemId }),
    ),
  /**
   * Restores oldest first so the reopened tabs keep their archived order. A
   * failed restore keeps its entry, so the loop stops rather than reporting
   * the same problem once per entry.
   */
  restoreMany: async (entries: ArchivedItem[]) => {
    for (const entry of [...entries].sort(
      (a, b) => a.archivedAt - b.archivedAt,
    )) {
      try {
        await sendSidebarMessage(SidebarMessageType.restoreArchived, {
          itemId: entry.item.id,
        })
      } catch (error) {
        toast.error(failureMessage('Restoring', error))
        return
      }
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
