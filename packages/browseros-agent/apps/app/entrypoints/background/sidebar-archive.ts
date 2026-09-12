import {
  onSidebarMessage,
  SidebarMessageType,
} from '@/lib/messaging/sidebar/sidebarMessages'
import { DEFAULTS } from '@/lib/sidebar/core/types'
import {
  ensureMigrated,
  sidebarArchiveStorage,
  sidebarSettingsStorage,
} from '@/lib/sidebar/storage'

/**
 * Archive purge and settings writes. The reconciler owns tab work; these two
 * intents only rewrite storage, so they live here to keep that file focused.
 * The background stays the single writer of the sidebar document.
 */
export function registerSidebarArchive() {
  onSidebarMessage(SidebarMessageType.purgeArchive, async ({ data }) => {
    await ensureMigrated()
    const archive = await sidebarArchiveStorage.getValue()
    const cutoff = data.olderThan
    const kept =
      cutoff === null
        ? []
        : archive.filter((entry) => entry.archivedAt >= cutoff)
    if (kept.length !== archive.length) {
      await sidebarArchiveStorage.setValue(kept)
    }
    return { removed: archive.length - kept.length }
  })

  onSidebarMessage(SidebarMessageType.updateSettings, async ({ data }) => {
    await ensureMigrated()
    const current = await sidebarSettingsStorage.getValue()
    await sidebarSettingsStorage.setValue({
      ...DEFAULTS,
      ...current,
      ...data.settings,
    })
  })
}
