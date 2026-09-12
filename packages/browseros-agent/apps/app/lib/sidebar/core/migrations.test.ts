import { describe, expect, it } from 'bun:test'
import { type LegacySnapshot, migrate, SCHEMA_VERSION } from './migrations'
import { createInitialState } from './model'
import { zoneOf } from './selectors'

let counter = 0
const context = (legacy: LegacySnapshot) => {
  counter = 0
  return {
    legacy,
    now: 1000,
    newId: () => {
      counter += 1
      return `id${counter}`
    },
  }
}

const LEGACY: LegacySnapshot = {
  spaces: [
    { id: 's1', name: 'Work', emoji: '💼', color: 'blue', createdAt: 10 },
    { id: 's2', name: 'Personal', color: 'green' },
  ],
  activeSpaceId: 's2',
  settings: { wrapAround: false },
}

describe('migrate 1 -> 2', () => {
  it('imports the old spaces with containers, theme and icon', () => {
    const result = migrate({ version: 0, state: null }, context(LEGACY))

    expect(result.migrated).toBe(true)
    expect(result.version).toBe(SCHEMA_VERSION)
    expect(result.state.spaces.order).toEqual(['s1', 's2'])
    expect(result.state.activeSpaceId).toBe('s2')
    expect(result.state.settings.wrapAround).toBe(false)
    expect(result.state.settings.autoArchiveAfter).toBe('12h')

    const work = result.state.spaces.byId.s1
    expect(work.icon).toBe('💼')
    expect(work.color).toBe('blue')
    expect(work.createdAt).toBe(10)
    expect(work.pinnedCollapsed).toBe(false)
    expect(work.theme.keyColors[0].primary).toBe(true)
    expect(zoneOf(result.state, work.containers.pinned)).toBe('pinned')
    expect(zoneOf(result.state, work.containers.today)).toBe('today')

    const personal = result.state.spaces.byId.s2
    expect(personal.icon).toBe('')
    expect(personal.createdAt).toBe(1000)
    expect(personal.containers.pinned).not.toBe(work.containers.pinned)
  })

  it('is idempotent: a second run changes nothing', () => {
    const first = migrate({ version: 0, state: null }, context(LEGACY))
    const second = migrate(
      { version: first.version, state: first.state },
      context(LEGACY),
    )
    expect(second.migrated).toBe(false)
    expect(second.state).toEqual(first.state)
  })

  it('replaying the step does not duplicate spaces', () => {
    const first = migrate({ version: 0, state: null }, context(LEGACY))
    const replayed = migrate(
      { version: 1, state: first.state },
      context(LEGACY),
    )
    expect(replayed.state.spaces.order).toEqual(['s1', 's2'])
    expect(replayed.state.items.byId).toEqual(first.state.items.byId)
  })

  it('handles an empty legacy store', () => {
    const result = migrate(
      { version: 0, state: null },
      context({ spaces: [], activeSpaceId: null }),
    )
    expect(result.state.spaces.order).toEqual([])
    expect(result.state.activeSpaceId).toBeNull()
    expect(result.state.settings.wrapAround).toBe(true)
    expect(Object.keys(result.state.items.byId)).toHaveLength(1)
  })

  it('drops an active id pointing at a missing space', () => {
    const result = migrate(
      { version: 0, state: null },
      context({ spaces: [], activeSpaceId: 'gone' }),
    )
    expect(result.state.activeSpaceId).toBeNull()
  })

  it('leaves an already-current document untouched', () => {
    const state = createInitialState({ now: 1, newId: () => 'root' })
    const result = migrate(
      { version: SCHEMA_VERSION, state },
      context({ spaces: LEGACY.spaces, activeSpaceId: null }),
    )
    expect(result.state).toBe(state)
    expect(result.migrated).toBe(false)
  })
})
