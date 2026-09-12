import { storage } from '@wxt-dev/storage'
import { deleteSpace, ensureSpaceContainers } from '@/lib/sidebar/core/model'
import {
  ensureMigrated,
  readSidebarState,
  sidebarActiveSpaceIdStorage,
  sidebarSpacesStorage,
  writeSidebarState,
} from '@/lib/sidebar/storage'
import {
  DEFAULT_SPACES_SETTINGS,
  type Space,
  type SpacesSettings,
} from './spaces.types'

/**
 * Adapters over the sidebar store. The Spaces surface still thinks in terms
 * of an ordered `Space[]`; the document underneath is `{ order, byId }` plus
 * the item tree, so writes here also keep each space's containers in sync.
 */

function project(state: { order: string[]; byId: Record<string, Space> }) {
  return state.order.flatMap((id) => (state.byId[id] ? [state.byId[id]] : []))
}

export const spacesStorage = {
  async getValue(): Promise<Space[]> {
    await ensureMigrated()
    return project(await sidebarSpacesStorage.getValue())
  },
  async setValue(list: Space[]): Promise<void> {
    await ensureMigrated()
    const order = list.map((space) => space.id)
    const byId = Object.fromEntries(list.map((space) => [space.id, space]))
    let state = await readSidebarState()
    for (const id of state.spaces.order) {
      if (!byId[id]) state = deleteSpace(state, id)
    }
    await writeSidebarState(
      ensureSpaceContainers({ ...state, spaces: { order, byId } }),
    )
  },
  watch(callback: (next: Space[]) => void) {
    return sidebarSpacesStorage.watch((next) =>
      callback(next ? project(next) : []),
    )
  },
}

export const activeSpaceIdStorage = sidebarActiveSpaceIdStorage

/**
 * Per-space memory of the tab to reselect on switch, keyed by space id.
 * Tab ids are session-scoped; stale entries are ignored on read.
 */
export const spaceLastActiveTabStorage = storage.defineItem<
  Record<string, number>
>('local:spaceLastActiveTab', { fallback: {} })

export const spacesSettingsStorage = storage.defineItem<SpacesSettings>(
  'local:spacesSettings',
  { fallback: DEFAULT_SPACES_SETTINGS },
)
