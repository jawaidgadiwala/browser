import { describe, expect, it } from 'bun:test'
import {
  createFolder,
  createInitialState,
  createItem,
  createSpace,
  setExpansion,
} from './model'
import {
  adjacentSpace,
  essentialsList,
  isDrifted,
  pinnedTree,
  ringDelta,
  selectionFor,
  spaceIdAtIndex,
  zoneOf,
} from './selectors'
import type { SidebarState } from './types'

let counter = 0
const opts = () => ({
  now: 1,
  newId: () => {
    counter += 1
    return `id${counter}`
  },
})

function fixture() {
  counter = 0
  const base = createInitialState(opts())
  const { state, space } = createSpace(
    base,
    { name: 'Work', color: 'blue' },
    opts(),
  )
  return { state: { ...state, activeSpaceId: space.id }, space }
}

const tab = (url: string) =>
  ({ kind: 'tab', url, savedTitle: url, lastActiveAt: 0 }) as const

describe('zoneOf', () => {
  it('walks to the ancestor container', () => {
    const { state, space } = fixture()
    const folder = createFolder(state, space.containers.pinned, 'F', opts())
    const leaf = createItem(
      folder.state,
      { parentId: folder.item.id, data: tab('https://a.test') },
      opts(),
    )
    expect(zoneOf(leaf.state, leaf.item.id)).toBe('pinned')
    expect(zoneOf(leaf.state, leaf.state.items.roots.essentials)).toBe(
      'essentials',
    )
    expect(zoneOf(leaf.state, 'nope')).toBeNull()
  })
})

describe('ringDelta', () => {
  it('takes the shortest path and wraps', () => {
    expect(ringDelta(0, 1, 5)).toBe(1)
    expect(ringDelta(0, 4, 5)).toBe(-1)
    expect(ringDelta(4, 0, 5)).toBe(1)
    expect(ringDelta(0, 2, 5)).toBe(2)
    expect(ringDelta(0, 3, 5)).toBe(-2)
    expect(ringDelta(2, 2, 5)).toBe(0)
    expect(ringDelta(0, 0, 0)).toBe(0)
  })

  it('resolves an exact half ring forward', () => {
    expect(ringDelta(0, 2, 4)).toBe(2)
  })
})

describe('selectionFor', () => {
  const candidates = [
    { tabId: 1, index: 0, pinned: true },
    { tabId: 2, index: 1, pinned: false },
    { tabId: 3, index: 2, pinned: false },
  ]

  it('prefers the remembered tab', () => {
    expect(selectionFor(candidates, 3)).toBe(3)
  })

  it('falls back to the first unpinned, then the last row', () => {
    expect(selectionFor(candidates, 99)).toBe(2)
    expect(selectionFor([{ tabId: 7, index: 0, pinned: true }])).toBe(7)
    expect(selectionFor([])).toBeNull()
  })

  it('never picks an essential', () => {
    expect(
      selectionFor(
        [
          { tabId: 1, index: 0, pinned: false, essential: true },
          { tabId: 2, index: 1, pinned: false },
        ],
        1,
      ),
    ).toBe(2)
  })
})

describe('adjacentSpace / spaceIdAtIndex', () => {
  const order = ['a', 'b', 'c']

  it('walks with and without wrap', () => {
    expect(adjacentSpace(order, 'a', 1, true)).toBe('b')
    expect(adjacentSpace(order, 'c', 1, true)).toBe('a')
    expect(adjacentSpace(order, 'c', 1, false)).toBeNull()
    expect(adjacentSpace(order, 'a', -1, true)).toBe('c')
    expect(adjacentSpace(order, 'a', -1, false)).toBeNull()
    expect(adjacentSpace([], 'a', 1, true)).toBeNull()
    expect(adjacentSpace(order, null, 1, true)).toBe('a')
    expect(adjacentSpace(order, null, -1, true)).toBe('c')
  })

  it('indexes', () => {
    expect(spaceIdAtIndex(order, 1)).toBe('b')
    expect(spaceIdAtIndex(order, 9)).toBeNull()
  })
})

describe('essentialsList', () => {
  it('returns children in order', () => {
    const { state } = fixture()
    const first = createItem(
      state,
      { parentId: state.items.roots.essentials, data: tab('https://1.test') },
      opts(),
    )
    const second = createItem(
      first.state,
      { parentId: state.items.roots.essentials, data: tab('https://2.test') },
      opts(),
    )
    expect(essentialsList(second.state).map((item) => item.id)).toEqual([
      first.item.id,
      second.item.id,
    ])
    expect(essentialsList(createInitialState(opts()))).toEqual([])
  })
})

describe('pinnedTree', () => {
  function tree() {
    const { state, space } = fixture()
    const folder = createFolder(state, space.containers.pinned, 'F', opts())
    const a = createItem(
      folder.state,
      { parentId: folder.item.id, data: tab('https://a.test') },
      opts(),
    )
    const b = createItem(
      a.state,
      { parentId: folder.item.id, data: tab('https://b.test') },
      opts(),
    )
    return {
      state: b.state as SidebarState,
      space,
      folder: folder.item,
      a: a.item,
      b: b.item,
    }
  }

  it('flattens expanded folders with depth', () => {
    const { state, space, folder, a, b } = tree()
    expect(
      pinnedTree(state, space.id).map((row) => [row.item.id, row.depth]),
    ).toEqual([
      [folder.id, 0],
      [a.id, 1],
      [b.id, 1],
    ])
  })

  it('hides children of a collapsed folder', () => {
    const { state, space, folder } = tree()
    const collapsed = setExpansion(state, folder.id, 'collapsed')
    expect(pinnedTree(collapsed, space.id).map((row) => row.item.id)).toEqual([
      folder.id,
    ])
  })

  it('peeked shows only the active descendant', () => {
    const { state, space, folder, a, b } = tree()
    const peeked = setExpansion(state, folder.id, 'peeked')
    expect(
      pinnedTree(peeked, space.id, b.id).map((row) => row.item.id),
    ).toEqual([folder.id, b.id])
    expect(
      pinnedTree(peeked, space.id, a.id).map((row) => row.item.id),
    ).toEqual([folder.id, a.id])
    // No active item anywhere inside: the folder stays shut.
    expect(pinnedTree(peeked, space.id).map((row) => row.item.id)).toEqual([
      folder.id,
    ])
  })

  it('returns nothing for an unknown space', () => {
    const { state } = tree()
    expect(pinnedTree(state, 'nope')).toEqual([])
  })
})

describe('isDrifted', () => {
  it('ignores the hash and a trailing slash', () => {
    expect(isDrifted('https://a.test/', 'https://a.test')).toBe(false)
    expect(isDrifted('https://a.test/x', 'https://a.test/x#top')).toBe(false)
    expect(isDrifted('https://a.test/x#a', 'https://a.test/x#b')).toBe(false)
    expect(isDrifted('https://a.test/x', 'https://a.test/y')).toBe(true)
    expect(isDrifted('https://a.test/x', 'https://a.test/x?q=1')).toBe(true)
  })
})
