import { storage } from '@wxt-dev/storage'
import {
  onSidebarMessage,
  SidebarMessageType,
  sendSidebarMessage,
} from '@/lib/messaging/sidebar/sidebarMessages'
import type { HostAdapter } from '@/lib/sidebar/host/host-adapter'
import {
  type SessionState,
  type SessionStore,
  SidebarReconciler,
  type SidebarStore,
} from '@/lib/sidebar/reconciler'
import {
  ensureMigrated,
  groupLinksStorage,
  lastSelectedStorage,
  readSidebarState,
  tabLinksStorage,
  unreadStorage,
  writeSidebarState,
} from '@/lib/sidebar/storage'
import { spacesSettingsStorage } from '@/lib/spaces/spaces-storage'

/**
 * Wiring only: storage ports, listener registration and message routing.
 * Every rule lives in `lib/sidebar/reconciler.ts` so it stays testable.
 *
 * MV3 wakes the worker by dispatching an event, so listeners register
 * synchronously at the top level of `registerSidebar`; migration is awaited
 * inside each handler instead.
 */

const ARCHIVE_ALARM = 'sidebar:archive'
const DISCARD_ALARM = 'sidebar:discard'
const ALARM_PERIOD_MIN = 5

const SPACE_COMMANDS = {
  next: 'space-next',
  prev: 'space-prev',
  switcher: 'space-switcher',
} as const

const SPACE_INDEX_COMMAND = /^space-(\d)$/

/** Last time each tab was active; background-only, session scoped. */
const tabActiveAtStorage = storage.defineItem<Record<string, number>>(
  'session:sidebar:tabActiveAt',
  { fallback: {} },
)

/** Last time each space was active; the discard alarm reads these stamps. */
const spaceActiveAtStorage = storage.defineItem<Record<string, number>>(
  'session:sidebar:spaceActiveAt',
  { fallback: {} },
)

const store: SidebarStore = {
  read: async () => {
    await ensureMigrated()
    return readSidebarState()
  },
  write: (state) => writeSidebarState(state),
}

const session: SessionStore = {
  read: async () => {
    const [
      tabLinks,
      groupLinks,
      lastSelected,
      unread,
      tabActiveAt,
      spaceActiveAt,
    ] = await Promise.all([
      tabLinksStorage.getValue(),
      groupLinksStorage.getValue(),
      lastSelectedStorage.getValue(),
      unreadStorage.getValue(),
      tabActiveAtStorage.getValue(),
      spaceActiveAtStorage.getValue(),
    ])
    return {
      tabLinks,
      groupLinks,
      lastSelected,
      unread,
      tabActiveAt,
      spaceActiveAt,
    }
  },
  write: async (patch: Partial<SessionState>) => {
    const writes: Array<Promise<unknown>> = []
    if (patch.tabLinks) writes.push(tabLinksStorage.setValue(patch.tabLinks))
    if (patch.groupLinks) {
      writes.push(groupLinksStorage.setValue(patch.groupLinks))
    }
    if (patch.lastSelected) {
      writes.push(lastSelectedStorage.setValue(patch.lastSelected))
    }
    if (patch.unread) writes.push(unreadStorage.setValue(patch.unread))
    if (patch.tabActiveAt) {
      writes.push(tabActiveAtStorage.setValue(patch.tabActiveAt))
    }
    if (patch.spaceActiveAt) {
      writes.push(spaceActiveAtStorage.setValue(patch.spaceActiveAt))
    }
    await Promise.all(writes)
  },
}

async function openSwitcher() {
  const window = await chrome.windows
    .getLastFocused({ windowTypes: ['normal'] })
    .catch(() => null)
  if (window?.id === undefined) return
  const [active] = await chrome.tabs.query({
    active: true,
    windowId: window.id,
  })
  const appUrl = chrome.runtime.getURL('app.html')
  if (active?.id !== undefined && active.url?.startsWith(appUrl)) {
    const handled = await sendSidebarMessage(
      SidebarMessageType.openSwitcher,
      undefined,
      active.id,
    ).catch(() => false)
    if (handled) return
  }
  await chrome.tabs.create({
    windowId: window.id,
    url: `${appUrl}#/home?spaces=1`,
  })
}

export function registerSidebar(host: HostAdapter) {
  const reconciler = new SidebarReconciler({
    host,
    store,
    session,
    behavior: () => spacesSettingsStorage.getValue(),
  })

  const ready = ensureMigrated()
  const guard = <T>(task: () => Promise<T>) =>
    ready.then(task).catch(() => undefined)

  void guard(() => reconciler.reconcile())
  chrome.runtime.onStartup.addListener(() => {
    void guard(() => reconciler.reconcile())
  })

  host.onTabEvent((event) => {
    void guard(() => reconciler.handleTabEvent(event))
  })

  chrome.commands?.onCommand.addListener((command) => {
    void guard(async () => {
      if (command === SPACE_COMMANDS.next) return reconciler.stepSpace(1)
      if (command === SPACE_COMMANDS.prev) return reconciler.stepSpace(-1)
      if (command === SPACE_COMMANDS.switcher) return openSwitcher()
      const match = SPACE_INDEX_COMMAND.exec(command)
      if (match) return reconciler.switchToIndex(Number(match[1]) - 1)
    })
  })

  chrome.alarms.create(ARCHIVE_ALARM, { periodInMinutes: ALARM_PERIOD_MIN })
  chrome.alarms.create(DISCARD_ALARM, { periodInMinutes: ALARM_PERIOD_MIN })
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ARCHIVE_ALARM) {
      void guard(() => reconciler.runArchiveAlarm())
    }
    if (alarm.name === DISCARD_ALARM) {
      void guard(() => reconciler.runDiscardAlarm())
    }
  })

  onSidebarMessage(SidebarMessageType.switchSpace, ({ data }) =>
    guard(() => reconciler.switchSpace(data.spaceId)),
  )
  onSidebarMessage(SidebarMessageType.createSpace, async ({ data }) => {
    await ready
    return reconciler.createSpaceFromPanel(data)
  })
  onSidebarMessage(SidebarMessageType.updateSpace, ({ data }) =>
    guard(() => reconciler.updateSpaceEverywhere(data)),
  )
  onSidebarMessage(SidebarMessageType.deleteSpace, ({ data }) =>
    guard(() => reconciler.deleteSpaceEverywhere(data.spaceId)),
  )
  onSidebarMessage(SidebarMessageType.moveSpace, ({ data }) =>
    guard(() => reconciler.moveSpaceBy(data.spaceId, data.direction)),
  )
  onSidebarMessage(SidebarMessageType.assignActiveTab, ({ data }) =>
    guard(() => reconciler.assignActiveTab(data.spaceId)),
  )
  onSidebarMessage(SidebarMessageType.adoptLooseTabs, ({ data }) =>
    guard(() => reconciler.adoptLooseTabs(data.spaceId)),
  )
  onSidebarMessage(SidebarMessageType.activateTab, ({ data }) =>
    guard(() => reconciler.activateTab(data.tabId)),
  )
  onSidebarMessage(SidebarMessageType.closeTabs, ({ data }) =>
    guard(() => reconciler.closeTabs(data.tabIds)),
  )
  onSidebarMessage(SidebarMessageType.openItem, ({ data }) =>
    guard(() => reconciler.openItem(data.itemId)),
  )
  onSidebarMessage(SidebarMessageType.moveItem, ({ data }) =>
    guard(() => reconciler.moveItemTo(data.itemId, data.parentId, data.index)),
  )
  onSidebarMessage(SidebarMessageType.pinTab, ({ data }) =>
    guard(() => reconciler.pinTab(data)),
  )
  onSidebarMessage(SidebarMessageType.unpinItem, ({ data }) =>
    guard(() => reconciler.unpinItem(data.itemId)),
  )
  onSidebarMessage(SidebarMessageType.resetPinned, ({ data }) =>
    guard(() => reconciler.resetPinned(data.itemId)),
  )
  onSidebarMessage(SidebarMessageType.addEssential, ({ data }) =>
    guard(() => reconciler.addEssentialFrom(data)),
  )
  onSidebarMessage(SidebarMessageType.removeEssential, ({ data }) =>
    guard(() => reconciler.removeEssentialItem(data.itemId)),
  )
  onSidebarMessage(SidebarMessageType.createFolder, async ({ data }) => {
    await ready
    return reconciler.createFolderIn(data.spaceId, data.title, data.parentId)
  })
  onSidebarMessage(SidebarMessageType.setExpansion, ({ data }) =>
    guard(() => reconciler.setItemExpansion(data.itemId, data.expansion)),
  )
  onSidebarMessage(SidebarMessageType.renameItem, ({ data }) =>
    guard(() => reconciler.renameItem(data.itemId, data.title)),
  )
  onSidebarMessage(SidebarMessageType.archiveTabs, ({ data }) =>
    guard(() => reconciler.archiveTabs(data.tabIds, data.reason, data.source)),
  )
  onSidebarMessage(SidebarMessageType.restoreArchived, ({ data }) =>
    guard(() => reconciler.restoreArchived(data.itemId)),
  )
  onSidebarMessage(SidebarMessageType.tidy, ({ data }) =>
    guard(() => reconciler.tidySpace(data.spaceId, 'manual')),
  )
  onSidebarMessage(SidebarMessageType.clear, ({ data }) =>
    guard(() => reconciler.tidySpace(data.spaceId, 'clear')),
  )
  onSidebarMessage(SidebarMessageType.newTab, ({ data }) =>
    guard(() => reconciler.newTab(data)),
  )
}
