import { describe, expect, it } from 'bun:test'
import {
  adjacentSpaceId,
  createSpace,
  findGroupForSpace,
  findSpaceForGroup,
  isNameTaken,
  moveSpace,
  nextColor,
  normalizeSpaceName,
  pickTabToActivate,
  pruneLastActive,
  removeSpace,
  spaceGlyph,
  updateSpace,
} from './spaces.helpers'
import type { Space } from './spaces.types'

const space = (id: string, name: string, color: Space['color'] = 'blue') => ({
  id,
  name,
  emoji: '',
  color,
  createdAt: 0,
})

const three = [space('a', 'Work'), space('b', 'Personal'), space('c', 'Dev')]

describe('normalizeSpaceName / isNameTaken', () => {
  it('trims, collapses whitespace and caps length', () => {
    expect(normalizeSpaceName('  Deep   Work  ')).toBe('Deep Work')
    expect(normalizeSpaceName('x'.repeat(100))).toHaveLength(40)
  })

  it('is case-insensitive and can exempt the space being renamed', () => {
    expect(isNameTaken(three, 'work')).toBe(true)
    expect(isNameTaken(three, 'work', 'a')).toBe(false)
    expect(isNameTaken(three, 'Music')).toBe(false)
  })
})

describe('createSpace', () => {
  it('inserts right after the active space', () => {
    const { spaces, space: created } = createSpace(three, 'a', {
      name: 'Music',
    })
    expect(spaces.map((s) => s.name)).toEqual([
      'Work',
      'Music',
      'Personal',
      'Dev',
    ])
    expect(created.name).toBe('Music')
    expect(created.id).toHaveLength(10)
  })

  it('appends when nothing is active', () => {
    const { spaces } = createSpace(three, null, { name: 'Music' })
    expect(spaces.at(-1)?.name).toBe('Music')
  })

  it('rejects empty and duplicate names', () => {
    expect(() => createSpace(three, null, { name: '   ' })).toThrow()
    expect(() => createSpace(three, null, { name: 'dev' })).toThrow()
  })

  it('picks the least used non-grey color', () => {
    expect(nextColor([])).toBe('blue')
    expect(nextColor([space('a', 'A', 'blue')])).toBe('red')
    const { space: created } = createSpace(three, null, { name: 'Music' })
    expect(created.color).not.toBe('blue')
    expect(created.color).not.toBe('grey')
  })
})

describe('updateSpace / removeSpace / moveSpace', () => {
  it('renames with normalization and uniqueness', () => {
    const next = updateSpace(three, 'a', { name: ' Deep  Work ' })
    expect(next[0].name).toBe('Deep Work')
    expect(() => updateSpace(three, 'a', { name: 'personal' })).toThrow()
  })

  it('removes by id', () => {
    expect(removeSpace(three, 'b').map((s) => s.id)).toEqual(['a', 'c'])
  })

  it('moves within bounds only', () => {
    expect(moveSpace(three, 'b', -1).map((s) => s.id)).toEqual(['b', 'a', 'c'])
    expect(moveSpace(three, 'a', -1)).toBe(three)
    expect(moveSpace(three, 'c', 1)).toBe(three)
  })
})

describe('adjacentSpaceId', () => {
  it('walks forward and back, wrapping when allowed', () => {
    expect(adjacentSpaceId(three, 'a', 1, true)).toBe('b')
    expect(adjacentSpaceId(three, 'c', 1, true)).toBe('a')
    expect(adjacentSpaceId(three, 'c', 1, false)).toBeNull()
    expect(adjacentSpaceId(three, 'a', -1, true)).toBe('c')
    expect(adjacentSpaceId(three, 'a', -1, false)).toBeNull()
  })

  it('handles no active space and no spaces', () => {
    expect(adjacentSpaceId(three, null, 1, true)).toBe('a')
    expect(adjacentSpaceId(three, null, -1, true)).toBe('c')
    expect(adjacentSpaceId([], 'a', 1, true)).toBeNull()
  })
})

describe('group matching', () => {
  const groups = [
    { id: 1, title: 'Work', color: 'blue', windowId: 10 },
    { id: 2, title: 'Work', color: 'blue', windowId: 11 },
    { id: 3, title: 'Random', color: 'grey', windowId: 10 },
  ]

  it('matches a space to the group in the right window', () => {
    expect(findGroupForSpace(groups, three[0], 11)?.id).toBe(2)
    expect(findGroupForSpace(groups, three[1], 10)).toBeUndefined()
  })

  it('maps a group back to its space, ignoring foreign groups', () => {
    expect(findSpaceForGroup(three, groups[0])?.id).toBe('a')
    expect(findSpaceForGroup(three, groups[2])).toBeUndefined()
    expect(findSpaceForGroup(three, undefined)).toBeUndefined()
  })
})

describe('pickTabToActivate', () => {
  const tabs = [
    { id: 5, groupId: 1, index: 2, pinned: false, active: false },
    { id: 4, groupId: 1, index: 1, pinned: true, active: false },
    { id: 6, groupId: 1, index: 3, pinned: false, active: false },
  ]

  it('prefers the remembered tab when it still exists', () => {
    expect(pickTabToActivate(tabs, 6)).toBe(6)
  })

  it('falls back to the first unpinned tab, then the last tab', () => {
    expect(pickTabToActivate(tabs, 99)).toBe(5)
    expect(pickTabToActivate([tabs[1]], undefined)).toBe(4)
    expect(pickTabToActivate([], undefined)).toBeUndefined()
  })
})

describe('spaceGlyph / pruneLastActive', () => {
  it('uses the emoji or the first letter', () => {
    expect(spaceGlyph({ name: 'work', emoji: '' })).toBe('W')
    expect(spaceGlyph({ name: 'work', emoji: '🧠' })).toBe('🧠')
    expect(spaceGlyph({ name: '  ', emoji: '' })).toBe('·')
  })

  it('drops dead tabs and dead spaces', () => {
    const pruned = pruneLastActive(
      { a: 1, b: 2, zombie: 3 },
      new Set([1, 3]),
      new Set(['a', 'b', 'zombie']),
    )
    expect(pruned).toEqual({ a: 1, zombie: 3 })
    expect(pruneLastActive({ a: 1 }, new Set([1]), new Set())).toEqual({})
  })
})
