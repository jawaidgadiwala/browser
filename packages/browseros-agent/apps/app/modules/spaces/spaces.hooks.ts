import { useEffect, useState } from 'react'
import {
  SpacesMessageType,
  sendSpacesMessage,
} from '@/lib/messaging/spaces/spacesMessages'
import {
  type CreateSpaceInput,
  createSpace,
  moveSpace,
} from '@/lib/spaces/spaces.helpers'
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
 * new tab, the settings page and the background never disagree. Mutations
 * that touch tabs go through the background; pure list edits write storage.
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

async function create(
  input: CreateSpaceInput,
  switchTo = true,
): Promise<Space> {
  const [list, active] = await Promise.all([
    spacesStorage.getValue(),
    activeSpaceIdStorage.getValue(),
  ])
  const result = createSpace(list, active, input)
  await spacesStorage.setValue(result.spaces)
  if (switchTo) {
    await sendSpacesMessage(SpacesMessageType.switch, {
      spaceId: result.space.id,
    })
  }
  return result.space
}

async function switchTo(spaceId: string) {
  await sendSpacesMessage(SpacesMessageType.switch, { spaceId })
}

async function update(
  spaceId: string,
  patch: { name?: string; icon?: string; color?: SpaceColor },
) {
  await sendSpacesMessage(SpacesMessageType.update, { spaceId, ...patch })
}

async function remove(spaceId: string) {
  await sendSpacesMessage(SpacesMessageType.delete, { spaceId })
}

async function move(spaceId: string, direction: -1 | 1) {
  const list = await spacesStorage.getValue()
  await spacesStorage.setValue(moveSpace(list, spaceId, direction))
}

async function assignActiveTab(spaceId: string) {
  await sendSpacesMessage(SpacesMessageType.assignActiveTab, { spaceId })
}

async function adoptLooseTabs(spaceId: string) {
  await sendSpacesMessage(SpacesMessageType.adoptLooseTabs, { spaceId })
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
