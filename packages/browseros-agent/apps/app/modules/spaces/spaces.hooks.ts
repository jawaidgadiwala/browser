import { useEffect, useState } from 'react'
import {
  SidebarMessageType,
  sendSidebarMessage,
} from '@/lib/messaging/sidebar/sidebarMessages'
import type { CreateSpaceInput } from '@/lib/spaces/spaces.helpers'
import {
  DEFAULT_SPACES_SETTINGS,
  type Space,
  type SpaceColor,
  type SpacesSettings,
} from '@/lib/spaces/spaces.types'
import {
  activeSpaceIdStorage,
  spacesSettingsStorage,
  spacesStorage,
} from '@/lib/spaces/spaces-storage'

/**
 * Every surface reads spaces from extension storage and watches it, so the
 * new tab, the settings page and the background never disagree. Every
 * mutation is an intent sent to the background, the single writer.
 */
export function useSpaces() {
  const [spaces, setSpaces] = useState<Space[]>([])
  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(null)
  const [settings, setSettingsState] = useState<SpacesSettings>(
    DEFAULT_SPACES_SETTINGS,
  )
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      spacesStorage.getValue(),
      activeSpaceIdStorage.getValue(),
      spacesSettingsStorage.getValue(),
    ]).then(([list, active, prefs]) => {
      if (cancelled) return
      setSpaces(list)
      setActiveSpaceId(active)
      setSettingsState({ ...DEFAULT_SPACES_SETTINGS, ...prefs })
      setReady(true)
    })
    const unwatchSpaces = spacesStorage.watch((next) => setSpaces(next ?? []))
    const unwatchActive = activeSpaceIdStorage.watch((next) =>
      setActiveSpaceId(next ?? null),
    )
    const unwatchSettings = spacesSettingsStorage.watch((next) =>
      setSettingsState({ ...DEFAULT_SPACES_SETTINGS, ...(next ?? {}) }),
    )
    return () => {
      cancelled = true
      unwatchSpaces()
      unwatchActive()
      unwatchSettings()
    }
  }, [])

  return {
    ready,
    spaces,
    activeSpaceId,
    settings,
    ...spacesActions,
  }
}

async function create(input: CreateSpaceInput, switchTo = true): Promise<void> {
  await sendSidebarMessage(SidebarMessageType.createSpace, {
    name: input.name,
    icon: input.icon,
    color: input.color,
    switchTo,
  })
}

async function switchTo(spaceId: string) {
  await sendSidebarMessage(SidebarMessageType.switchSpace, { spaceId })
}

async function update(
  spaceId: string,
  patch: { name?: string; icon?: string; color?: SpaceColor },
) {
  await sendSidebarMessage(SidebarMessageType.updateSpace, {
    spaceId,
    ...patch,
  })
}

async function remove(spaceId: string) {
  await sendSidebarMessage(SidebarMessageType.deleteSpace, { spaceId })
}

async function move(spaceId: string, direction: -1 | 1) {
  await sendSidebarMessage(SidebarMessageType.moveSpace, { spaceId, direction })
}

async function assignActiveTab(spaceId: string) {
  await sendSidebarMessage(SidebarMessageType.assignActiveTab, { spaceId })
}

async function adoptLooseTabs(spaceId: string) {
  await sendSidebarMessage(SidebarMessageType.adoptLooseTabs, { spaceId })
}

async function setSettings(patch: Partial<SpacesSettings>) {
  const current = await spacesSettingsStorage.getValue()
  await spacesSettingsStorage.setValue({
    ...DEFAULT_SPACES_SETTINGS,
    ...current,
    ...patch,
  })
}

/** Module-level so callers get stable references without useCallback. */
const spacesActions = {
  create,
  switchTo,
  update,
  remove,
  move,
  assignActiveTab,
  adoptLooseTabs,
  setSettings,
}

/**
 * @public
 */
export type SpacesApi = ReturnType<typeof useSpaces>
