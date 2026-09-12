import {
  onSpacesMessage,
  SpacesMessageType,
  type SpaceUpdateData,
  sendSpacesMessage,
} from '@/lib/messaging/spaces/spacesMessages'
import {
  adjacentSpaceId,
  findGroupForSpace,
  findSpaceForGroup,
  NO_GROUP,
  pickTabToActivate,
  pruneLastActive,
  removeSpace,
  spaceIdAtIndex,
  updateSpace,
} from '@/lib/spaces/spaces.helpers'
import type { Space } from '@/lib/spaces/spaces.types'
import {
  activeSpaceIdStorage,
  spaceLastActiveTabStorage,
  spacesSettingsStorage,
  spacesStorage,
} from '@/lib/spaces/spaces-storage'

/**
 * Spaces on top of Chromium tab groups.
 *
 * One tab group per space per window, matched by title. Switching expands
 * the target group, activates its remembered tab and collapses the other
 * space groups, which is the closest an extension gets to hiding tabs. Tabs
 * outside any space group stay visible in every space.
 */

const SPACE_COMMANDS = {
  next: 'space-next',
  prev: 'space-prev',
  switcher: 'space-switcher',
} as const

const SPACE_INDEX_COMMAND = /^space-(\d)$/

/** Chrome fires onActivated for our own switches; ignore those. */
let switching = false

type TabIds = [number, ...number[]]

function toTabIds(tabs: Array<{ id?: number }>): TabIds | undefined {
  const ids = tabs.flatMap((tab) => (tab.id === undefined ? [] : [tab.id]))
  return ids.length > 0 ? (ids as TabIds) : undefined
}

async function focusedNormalWindowId(): Promise<number | undefined> {
  try {
    const window = await chrome.windows.getLastFocused({
      windowTypes: ['normal'],
    })
    return window.id
  } catch {
    return undefined
  }
}

async function spaceGroupsInWindow(
  spaces: Space[],
  windowId: number,
): Promise<Array<{ group: chrome.tabGroups.TabGroup; space: Space }>> {
  const groups = await chrome.tabGroups.query({ windowId })
  const result: Array<{ group: chrome.tabGroups.TabGroup; space: Space }> = []
  for (const group of groups) {
    const space = findSpaceForGroup(spaces, group)
    if (space) result.push({ group, space })
  }
  return result
}

async function ensureGroup(
  space: Space,
  windowId: number,
  seedTabIds: TabIds | undefined,
): Promise<number> {
  const groups = await chrome.tabGroups.query({ windowId })
  const existing = findGroupForSpace(groups, space, windowId)
  if (existing) {
    if (seedTabIds) {
      await chrome.tabs.group({ tabIds: seedTabIds, groupId: existing.id })
    }
    return existing.id
  }
  let tabIds = seedTabIds
  if (!tabIds) {
    const tab = await chrome.tabs.create({ windowId, active: true })
    if (tab.id === undefined) throw new Error('New tab has no id')
    tabIds = [tab.id]
  }
  const groupId: number = await chrome.tabs.group({
    tabIds,
    createProperties: { windowId },
  })
  await chrome.tabGroups.update(groupId, {
    title: space.name,
    color: space.color,
    collapsed: false,
  })
  return groupId
}

async function rememberActiveTab(spaces: Space[], windowId: number) {
  const [active] = await chrome.tabs.query({ active: true, windowId })
  if (!active || active.id === undefined || active.groupId === NO_GROUP) return
  const group = await chrome.tabGroups.get(active.groupId).catch(() => null)
  const space = findSpaceForGroup(spaces, group ?? undefined)
  if (!space) return
  const memory = await spaceLastActiveTabStorage.getValue()
  await spaceLastActiveTabStorage.setValue({ ...memory, [space.id]: active.id })
}

async function collapseOtherSpaceGroups(
  spaces: Space[],
  windowId: number,
  keepGroupId: number,
) {
  for (const { group } of await spaceGroupsInWindow(spaces, windowId)) {
    if (group.id === keepGroupId) continue
    await chrome.tabGroups
      .update(group.id, { collapsed: true })
      .catch(() => undefined)
  }
}

async function switchToSpace(spaceId: string, windowId?: number) {
  const spaces = await spacesStorage.getValue()
  const target = spaces.find((space) => space.id === spaceId)
  const window = windowId ?? (await focusedNormalWindowId())
  if (!target || window === undefined) return

  switching = true
  try {
    await rememberActiveTab(spaces, window)

    const groups = await chrome.tabGroups.query({ windowId: window })
    let group = findGroupForSpace(groups, target, window)
    if (group) {
      const tabs = await chrome.tabs.query({ groupId: group.id })
      const memory = await spaceLastActiveTabStorage.getValue()
      const tabId = pickTabToActivate(tabs, memory[target.id])
      await chrome.tabGroups.update(group.id, { collapsed: false })
      if (tabId !== undefined) {
        await chrome.tabs.update(tabId, { active: true })
      }
    } else {
      const groupId = await ensureGroup(target, window, undefined)
      group = await chrome.tabGroups.get(groupId)
    }
    await collapseOtherSpaceGroups(spaces, window, group.id)
    await activeSpaceIdStorage.setValue(target.id)
  } finally {
    switching = false
  }
}

async function assignActiveTab(spaceId: string) {
  const spaces = await spacesStorage.getValue()
  const target = spaces.find((space) => space.id === spaceId)
  const window = await focusedNormalWindowId()
  if (!target || window === undefined) return
  const [active] = await chrome.tabs.query({ active: true, windowId: window })
  if (!active || active.id === undefined) return
  await ensureGroup(target, window, [active.id])
  const memory = await spaceLastActiveTabStorage.getValue()
  await spaceLastActiveTabStorage.setValue({
    ...memory,
    [target.id]: active.id,
  })
  await switchToSpace(target.id, window)
}

async function adoptLooseTabs(spaceId: string) {
  const spaces = await spacesStorage.getValue()
  const target = spaces.find((space) => space.id === spaceId)
  const window = await focusedNormalWindowId()
  if (!target || window === undefined) return
  const loose = await chrome.tabs.query({
    windowId: window,
    groupId: NO_GROUP,
    pinned: false,
  })
  const tabIds = toTabIds(loose)
  if (!tabIds) return
  await ensureGroup(target, window, tabIds)
  await switchToSpace(target.id, window)
}

async function updateSpaceEverywhere(data: SpaceUpdateData) {
  const spaces = await spacesStorage.getValue()
  const before = spaces.find((space) => space.id === data.spaceId)
  if (!before) return
  const next = updateSpace(spaces, data.spaceId, {
    name: data.name,
    icon: data.icon,
    color: data.color,
  })
  const after = next.find((space) => space.id === data.spaceId)
  if (!after) return
  // Groups are matched by the old title, so rename them before storing.
  const groups = await chrome.tabGroups.query({})
  for (const group of groups) {
    if (group.title !== before.name) continue
    await chrome.tabGroups
      .update(group.id, { title: after.name, color: after.color })
      .catch(() => undefined)
  }
  await spacesStorage.setValue(next)
}

async function deleteSpace(spaceId: string) {
  const spaces = await spacesStorage.getValue()
  const target = spaces.find((space) => space.id === spaceId)
  if (!target) return
  // Tabs survive; they become loose tabs visible in every space.
  const groups = await chrome.tabGroups.query({})
  for (const group of groups) {
    if (group.title !== target.name) continue
    const tabIds = toTabIds(await chrome.tabs.query({ groupId: group.id }))
    if (tabIds) {
      await chrome.tabs.ungroup(tabIds).catch(() => undefined)
    }
  }
  const remaining = removeSpace(spaces, spaceId)
  const activeId = await activeSpaceIdStorage.getValue()
  await spacesStorage.setValue(remaining)
  if (activeId === spaceId) {
    const fallback = adjacentSpaceId(spaces, spaceId, 1, true)
    const nextId = fallback === spaceId ? null : fallback
    await activeSpaceIdStorage.setValue(nextId)
    if (nextId) await switchToSpace(nextId)
  }
  const memory = await spaceLastActiveTabStorage.getValue()
  const { [spaceId]: _dropped, ...rest } = memory
  await spaceLastActiveTabStorage.setValue(rest)
}

async function stepSpace(direction: -1 | 1) {
  const [spaces, activeId, settings] = await Promise.all([
    spacesStorage.getValue(),
    activeSpaceIdStorage.getValue(),
    spacesSettingsStorage.getValue(),
  ])
  const nextId = adjacentSpaceId(
    spaces,
    activeId,
    direction,
    settings.wrapAround,
  )
  if (nextId) await switchToSpace(nextId)
}

async function openSwitcher() {
  const window = await focusedNormalWindowId()
  if (window === undefined) return
  const [active] = await chrome.tabs.query({ active: true, windowId: window })
  const appUrl = chrome.runtime.getURL('app.html')
  if (active?.id !== undefined && active.url?.startsWith(appUrl)) {
    const handled = await sendSpacesMessage(
      SpacesMessageType.openSwitcher,
      undefined,
      active.id,
    ).catch(() => false)
    if (handled) return
  }
  await chrome.tabs.create({
    windowId: window,
    url: `${appUrl}#/home?spaces=1`,
  })
}

/** New tabs join the active space unless Chrome already grouped them. */
async function adoptNewTab(tab: chrome.tabs.Tab) {
  const settings = await spacesSettingsStorage.getValue()
  if (!settings.adoptNewTabs || tab.id === undefined || tab.pinned) return
  const activeId = await activeSpaceIdStorage.getValue()
  if (!activeId) return
  const spaces = await spacesStorage.getValue()
  const target = spaces.find((space) => space.id === activeId)
  if (!target) return
  // Chrome adds opener-spawned tabs to the opener's group a moment later.
  await new Promise((resolve) => setTimeout(resolve, 150))
  const fresh = await chrome.tabs.get(tab.id).catch(() => null)
  if (!fresh || fresh.groupId !== NO_GROUP || fresh.windowId === undefined) {
    return
  }
  const window = await chrome.windows.get(fresh.windowId).catch(() => null)
  if (window?.type !== 'normal') return
  await ensureGroup(target, fresh.windowId, [tab.id]).catch(() => undefined)
}

/** Selecting a tab that lives in another space switches to that space. */
async function followActivatedTab(info: chrome.tabs.OnActivatedInfo) {
  if (switching) return
  const tab = await chrome.tabs.get(info.tabId).catch(() => null)
  if (!tab || tab.groupId === NO_GROUP) return
  const [spaces, settings] = await Promise.all([
    spacesStorage.getValue(),
    spacesSettingsStorage.getValue(),
  ])
  const group = await chrome.tabGroups.get(tab.groupId).catch(() => null)
  const space = findSpaceForGroup(spaces, group ?? undefined)
  if (!space) return
  const memory = await spaceLastActiveTabStorage.getValue()
  await spaceLastActiveTabStorage.setValue({
    ...memory,
    [space.id]: info.tabId,
  })
  if (!settings.followActiveTab) return
  const activeId = await activeSpaceIdStorage.getValue()
  if (activeId === space.id) return
  await activeSpaceIdStorage.setValue(space.id)
  await collapseOtherSpaceGroups(spaces, info.windowId, tab.groupId)
}

async function forgetClosedTab(tabId: number) {
  const memory = await spaceLastActiveTabStorage.getValue()
  if (!Object.values(memory).includes(tabId)) return
  const [tabs, spaces] = await Promise.all([
    chrome.tabs.query({}),
    spacesStorage.getValue(),
  ])
  const live = new Set(
    tabs.flatMap((tab) => (tab.id === undefined ? [] : [tab.id])),
  )
  live.delete(tabId)
  await spaceLastActiveTabStorage.setValue(
    pruneLastActive(memory, live, new Set(spaces.map((space) => space.id))),
  )
}

async function handleCommand(command: string) {
  if (command === SPACE_COMMANDS.next) return stepSpace(1)
  if (command === SPACE_COMMANDS.prev) return stepSpace(-1)
  if (command === SPACE_COMMANDS.switcher) return openSwitcher()
  const match = SPACE_INDEX_COMMAND.exec(command)
  if (match) {
    const spaces = await spacesStorage.getValue()
    const id = spaceIdAtIndex(spaces, Number(match[1]) - 1)
    if (id) await switchToSpace(id)
  }
}

export function registerSpaces() {
  chrome.commands?.onCommand.addListener((command) => {
    void handleCommand(command).catch(() => undefined)
  })
  chrome.tabs.onCreated.addListener((tab) => {
    void adoptNewTab(tab).catch(() => undefined)
  })
  chrome.tabs.onActivated.addListener((info) => {
    void followActivatedTab(info).catch(() => undefined)
  })
  chrome.tabs.onRemoved.addListener((tabId) => {
    void forgetClosedTab(tabId).catch(() => undefined)
  })

  onSpacesMessage(SpacesMessageType.switch, ({ data }) =>
    switchToSpace(data.spaceId),
  )
  onSpacesMessage(SpacesMessageType.assignActiveTab, ({ data }) =>
    assignActiveTab(data.spaceId),
  )
  onSpacesMessage(SpacesMessageType.adoptLooseTabs, ({ data }) =>
    adoptLooseTabs(data.spaceId),
  )
  onSpacesMessage(SpacesMessageType.update, ({ data }) =>
    updateSpaceEverywhere(data),
  )
  onSpacesMessage(SpacesMessageType.delete, ({ data }) =>
    deleteSpace(data.spaceId),
  )
}
