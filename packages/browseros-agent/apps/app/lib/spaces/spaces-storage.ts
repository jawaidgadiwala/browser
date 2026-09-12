import { storage } from '@wxt-dev/storage'
import {
  DEFAULT_SPACES_SETTINGS,
  type Space,
  type SpacesSettings,
} from './spaces.types'

export const spacesStorage = storage.defineItem<Space[]>('local:spaces', {
  fallback: [],
})

export const activeSpaceIdStorage = storage.defineItem<string | null>(
  'local:activeSpaceId',
  { fallback: null },
)

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
