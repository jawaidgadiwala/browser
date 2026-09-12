import {
  onSidebarMessage,
  SidebarMessageType,
} from '@/lib/messaging/sidebar/sidebarMessages'
import { ensureMigrated } from '@/lib/sidebar/storage'
import { sidebarReconciler } from './sidebar'

/**
 * Archive purge and settings writes. Both are read-modify-writes of the same
 * document the reconciler owns, so they run inside its queue; writing storage
 * directly could put back a snapshot taken before an overlapping tab event.
 */
export function registerSidebarArchive() {
  onSidebarMessage(SidebarMessageType.purgeArchive, async ({ data }) => {
    await ensureMigrated()
    return sidebarReconciler().purgeArchive(data.olderThan)
  })

  onSidebarMessage(SidebarMessageType.updateSettings, async ({ data }) => {
    await ensureMigrated()
    await sidebarReconciler().updateSettings(data.settings)
  })
}
