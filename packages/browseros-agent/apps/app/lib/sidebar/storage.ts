import { storage } from '@wxt-dev/storage'
import { sentry } from '@/lib/sentry/sentry'
import {
  type LegacySnapshot,
  type LegacySpace,
  migrate,
  SCHEMA_VERSION,
} from './core/migrations'
import { createInitialState } from './core/model'
import {
  type ArchivedItem,
  DEFAULTS,
  type ItemsState,
  type SidebarSettings,
  type SidebarState,
  type SpaceId,
  type SpacesState,
} from './core/types'

/**
 * The only place that binds the sidebar document to extension storage. Core
 * stays free of `chrome.*`; everything here is a thin read/write of one key.
 */

const EMPTY_STATE = createInitialState({ now: 0, newId: () => 'essentials' })

const schemaVersionStorage = storage.defineItem<number>(
  'local:sidebar:schemaVersion',
  { fallback: 0 },
)

export const sidebarSpacesStorage = storage.defineItem<SpacesState>(
  'local:sidebar:spaces',
  { fallback: { order: [], byId: {} } },
)

export const sidebarActiveSpaceIdStorage = storage.defineItem<SpaceId | null>(
  'local:sidebar:activeSpaceId',
  { fallback: null },
)

export const sidebarItemsStorage = storage.defineItem<ItemsState>(
  'local:sidebar:items',
  { fallback: EMPTY_STATE.items },
)

export const sidebarArchiveStorage = storage.defineItem<ArchivedItem[]>(
  'local:sidebar:archive',
  { fallback: [] },
)

export const sidebarSettingsStorage = storage.defineItem<SidebarSettings>(
  'local:sidebar:settings',
  { fallback: DEFAULTS },
)

/** tabId -> itemId, rebuilt on every browser start. */
export const tabLinksStorage = storage.defineItem<Record<string, string>>(
  'session:sidebar:tabLinks',
  { fallback: {} },
)

/** "<windowId>:<spaceId>" -> groupId. */
export const groupLinksStorage = storage.defineItem<Record<string, number>>(
  'session:sidebar:groupLinks',
  { fallback: {} },
)

export const lastSelectedStorage = storage.defineItem<Record<string, number>>(
  'session:sidebar:lastSelected',
  { fallback: {} },
)

export const unreadStorage = storage.defineItem<number[]>(
  'session:sidebar:unread',
  { fallback: [] },
)

const legacySpacesStorage = storage.defineItem<LegacySpace[]>('local:spaces', {
  fallback: [],
})

const legacyActiveSpaceIdStorage = storage.defineItem<string | null>(
  'local:activeSpaceId',
  { fallback: null },
)

const legacySpacesSettingsStorage = storage.defineItem<{
  wrapAround?: boolean
}>('local:spacesSettings', { fallback: {} })

export async function readSidebarState(): Promise<SidebarState> {
  const [spaces, activeSpaceId, items, archive, settings] = await Promise.all([
    sidebarSpacesStorage.getValue(),
    sidebarActiveSpaceIdStorage.getValue(),
    sidebarItemsStorage.getValue(),
    sidebarArchiveStorage.getValue(),
    sidebarSettingsStorage.getValue(),
  ])
  return {
    spaces,
    activeSpaceId,
    items,
    archive,
    settings: { ...DEFAULTS, ...settings },
  }
}

export async function writeSidebarState(state: SidebarState): Promise<void> {
  await Promise.all([
    sidebarSpacesStorage.setValue(state.spaces),
    sidebarActiveSpaceIdStorage.setValue(state.activeSpaceId),
    sidebarItemsStorage.setValue(state.items),
    sidebarArchiveStorage.setValue(state.archive),
    sidebarSettingsStorage.setValue(state.settings),
  ])
}

/**
 * Runs before any surface reads the store. Idempotent: a second run finds the
 * version already current and writes nothing.
 */
async function runMigrations(): Promise<void> {
  const version = await schemaVersionStorage.getValue()
  if (version >= SCHEMA_VERSION) return

  const [spaces, activeSpaceId, spacesSettings] = await Promise.all([
    legacySpacesStorage.getValue(),
    legacyActiveSpaceIdStorage.getValue(),
    legacySpacesSettingsStorage.getValue(),
  ])
  const legacy: LegacySnapshot = {
    spaces,
    activeSpaceId,
    settings: spacesSettings,
  }

  const current = version === 0 ? null : await readSidebarState()
  const result = migrate({ version, state: current }, { legacy })
  await writeSidebarState(result.state)
  await schemaVersionStorage.setValue(result.version)
  // The Spaces feature now reads the new keys; the old list is dead weight.
  await storage.removeItems(['local:spaces', 'local:activeSpaceId'])
}

let pending: Promise<void> | null = null

/**
 * Every reader goes through this, so background listeners can stay
 * synchronous (MV3 wake-up) while still never seeing a pre-migration store.
 *
 * Concurrent callers share one attempt, but a failed attempt is never cached:
 * it is reported to every caller (so nothing writes against a half-migrated
 * document) and the next call retries.
 */
export function ensureMigrated(): Promise<void> {
  pending ??= runMigrations().catch((error: unknown) => {
    pending = null
    sentry.captureException(error, {
      extra: { message: 'Sidebar storage migration failed' },
    })
    throw error
  })
  return pending
}

/**
 * Test seam: drops the memoized attempt. Production code never needs it,
 * because a failed attempt already clears itself.
 *
 * @public
 */
export function resetMigrationForTests(): void {
  pending = null
}
