import { describe, expect, it } from 'bun:test'
import type { ItemsState, Space } from '@/lib/sidebar/core/types'
import {
  DOT_MAX,
  DOT_MIN,
  dotSize,
  groupIdForSpace,
  ICON_ONLY_WIDTH,
  isIconOnly,
  type LiveGroup,
  type LiveTab,
  pinnedUrls,
  searchRows,
  todayRows,
  windowRange,
} from './sidebar-rows.helpers'

const WINDOW = 1

function space(overrides: Partial<Space> = {}): Space {
  return {
    id: 's1',
    name: 'Work',
    icon: '💼',
    color: 'blue',
    theme: { keyColors: [], wheel: 'analogous', intensity: 0.4, noise: 0 },
    containers: { pinned: 'p1', today: 't1' },
    pinnedCollapsed: false,
    createdAt: 0,
    ...overrides,
  }
}

function tab(overrides: Partial<LiveTab> = {}): LiveTab {
  return {
    id: 1,
    index: 0,
    title: 'Tab',
    url: 'https://example.com/',
    groupId: 7,
    active: false,
    windowId: WINDOW,
    ...overrides,
  }
}

const groups: LiveGroup[] = [
  { id: 7, title: 'Work', color: 'blue', windowId: WINDOW },
  { id: 8, title: 'Home', color: 'green', windowId: WINDOW },
  { id: 9, title: 'Work', color: 'red', windowId: 2 },
]

describe('groupIdForSpace', () => {
  it('matches the group carrying the space name in that window', () => {
    expect(groupIdForSpace(groups, space(), WINDOW)).toBe(7)
  })

  it('ignores groups in other windows', () => {
    expect(groupIdForSpace(groups, space({ name: 'Work' }), 3)).toBeNull()
  })

  it('prefers the colour match when two groups share a title', () => {
    const duplicated: LiveGroup[] = [
      { id: 11, title: 'Work', color: 'grey', windowId: WINDOW },
      { id: 12, title: 'Work', color: 'blue', windowId: WINDOW },
    ]
    expect(groupIdForSpace(duplicated, space(), WINDOW)).toBe(12)
  })
})

describe('todayRows', () => {
  const tabs: LiveTab[] = [
    tab({ id: 3, index: 4, url: 'https://c.test/', title: 'C' }),
    tab({ id: 1, index: 1, url: 'https://a.test/', title: 'A', active: true }),
    tab({ id: 2, index: 2, url: 'https://b.test/', title: 'B' }),
    tab({ id: 4, index: 3, url: 'https://d.test/', groupId: 8 }),
  ]

  it('keeps Chromium index order inside the space group', () => {
    const rows = todayRows(tabs, 7, new Set())
    expect(rows.map((row) => row.tabId)).toEqual([1, 2, 3])
  })

  it('drops tabs a pinned node already represents, hash and slash aside', () => {
    const rows = todayRows(tabs, 7, new Set(['https://b.test']))
    expect(rows.map((row) => row.tabId)).toEqual([1, 3])
  })

  it('returns nothing when the space has no group in this window', () => {
    expect(todayRows(tabs, null, new Set())).toEqual([])
  })

  it('carries the active flag and falls back to the url for a blank title', () => {
    const rows = todayRows(
      [tab({ id: 5, index: 0, title: '  ', url: 'https://x.test/' })],
      7,
      new Set(),
    )
    expect(rows[0]).toMatchObject({
      active: false,
      title: 'https://x.test/',
    })
  })
})

describe('pinnedUrls', () => {
  const items: ItemsState = {
    roots: { essentials: 'e' },
    byId: {
      p1: {
        id: 'p1',
        parentId: null,
        children: ['f1', 'i1'],
        title: null,
        createdAt: 0,
        data: { kind: 'container', role: 'pinned', spaceId: 's1' },
      },
      f1: {
        id: 'f1',
        parentId: 'p1',
        children: ['i2'],
        title: 'Docs',
        createdAt: 0,
        data: { kind: 'folder', expansion: 'expanded' },
      },
      i1: {
        id: 'i1',
        parentId: 'p1',
        children: [],
        title: null,
        createdAt: 0,
        data: {
          kind: 'tab',
          url: 'https://a.test/#frag',
          savedTitle: 'A',
          lastActiveAt: 0,
        },
      },
      i2: {
        id: 'i2',
        parentId: 'f1',
        children: [],
        title: null,
        createdAt: 0,
        data: {
          kind: 'tab',
          url: 'https://nested.test/',
          savedTitle: 'N',
          lastActiveAt: 0,
        },
      },
    },
  }

  it('collects nested pinned urls without the hash or trailing slash', () => {
    expect([...pinnedUrls(items, space())].sort()).toEqual([
      'https://a.test',
      'https://nested.test',
    ])
  })
})

describe('searchRows', () => {
  const tabs: LiveTab[] = [
    tab({ id: 1, index: 0, title: 'Budget sheet', groupId: 8 }),
    tab({ id: 2, index: 1, title: 'Budget notes', groupId: 7 }),
    tab({ id: 3, index: 2, title: 'Unrelated', groupId: 7 }),
  ]
  const spaces = [space(), space({ id: 's2', name: 'Home', color: 'green' })]

  it('puts active-space matches first and labels the rest', () => {
    const rows = searchRows(tabs, groups, spaces, 's1', 'budget', WINDOW)
    expect(rows.map((row) => row.tabId)).toEqual([2, 1])
    expect(rows[0].spaceName).toBeUndefined()
    expect(rows[1].spaceName).toBe('Home')
  })

  it('is empty for a blank query', () => {
    expect(searchRows(tabs, groups, spaces, 's1', '  ', WINDOW)).toEqual([])
  })
})

describe('layout math', () => {
  it('switches to icon-only below the panel threshold', () => {
    expect(isIconOnly(ICON_ONLY_WIDTH - 1)).toBe(true)
    expect(isIconOnly(ICON_ONLY_WIDTH)).toBe(false)
    expect(isIconOnly(0)).toBe(false)
  })

  it('keeps dots at 32 px until they overflow, never below 16 px', () => {
    expect(dotSize(3, 400)).toBe(DOT_MAX)
    expect(dotSize(20, 100)).toBe(DOT_MIN)
    expect(dotSize(4, 100)).toBeGreaterThanOrEqual(DOT_MIN)
    expect(dotSize(4, 100)).toBeLessThanOrEqual(DOT_MAX)
  })

  it('renders every row up to the virtualisation cap', () => {
    expect(windowRange(30, 36, 0, 400)).toEqual({ start: 0, end: 30 })
  })

  it('windows long lists around the scroll offset', () => {
    const range = windowRange(200, 36, 36 * 50, 360, 2)
    expect(range.start).toBe(48)
    expect(range.end).toBe(62)
  })
})
