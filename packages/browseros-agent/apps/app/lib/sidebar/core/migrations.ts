import { nanoid } from 'nanoid'
import { createInitialState, ensureSpaceContainers } from './model'
import { themeSpecForColor } from './theme'
import type {
  ItemId,
  ModelOptions,
  SidebarState,
  Space,
  TabGroupColor,
} from './types'

/**
 * Storage schema ladder. Each step takes the previous document to the next
 * version; `migrate` replays whatever steps are missing and is safe to run on
 * every startup.
 */

export const SCHEMA_VERSION = 2

/**
 * The pre-sidebar Spaces feature, read from `local:spaces` and friends.
 *
 * @public
 */
export interface LegacySpace {
  id: string
  name: string
  emoji?: string
  color: TabGroupColor
  createdAt?: number
}

/**
 * @public
 */
export interface LegacySnapshot {
  spaces: LegacySpace[]
  activeSpaceId: string | null
  settings?: { wrapAround?: boolean }
}

/**
 * @public
 */
export interface MigrationContext extends ModelOptions {
  legacy: LegacySnapshot
}

type Step = (state: SidebarState, context: MigrationContext) => SidebarState

/** Import the old Spaces keys, giving every space containers and a theme. */
const toV2: Step = (state, context) => {
  const now = context.now ?? Date.now()
  const newId = context.newId ?? (() => nanoid(10))
  const order = [...state.spaces.order]
  const byId: Record<string, Space> = { ...state.spaces.byId }

  for (const legacy of context.legacy.spaces) {
    if (byId[legacy.id]) continue
    byId[legacy.id] = {
      id: legacy.id,
      name: legacy.name,
      icon: (legacy.emoji ?? '').trim(),
      color: legacy.color,
      theme: themeSpecForColor(legacy.color),
      containers: { pinned: newId() as ItemId, today: newId() as ItemId },
      pinnedCollapsed: false,
      createdAt: legacy.createdAt ?? now,
    }
    order.push(legacy.id)
  }

  const activeId = context.legacy.activeSpaceId
  const next: SidebarState = {
    ...state,
    spaces: { order, byId },
    activeSpaceId:
      state.activeSpaceId ?? (activeId && byId[activeId] ? activeId : null),
    settings: {
      ...state.settings,
      wrapAround:
        context.legacy.settings?.wrapAround ?? state.settings.wrapAround,
    },
  }
  return ensureSpaceContainers(next, { now, newId })
}

const STEPS: Record<number, Step> = { 2: toV2 }

/**
 * @public
 */
export interface MigrationResult {
  version: number
  state: SidebarState
  migrated: boolean
}

export function migrate(
  input: { version: number; state: SidebarState | null },
  context: MigrationContext,
): MigrationResult {
  let state = input.state ?? createInitialState(context)
  let version = input.state ? input.version : 0
  let migrated = input.state === null

  for (let target = version + 1; target <= SCHEMA_VERSION; target += 1) {
    const step = STEPS[target]
    if (step) {
      state = step(state, context)
      migrated = true
    }
    version = target
  }

  return { version: Math.max(version, SCHEMA_VERSION), state, migrated }
}
