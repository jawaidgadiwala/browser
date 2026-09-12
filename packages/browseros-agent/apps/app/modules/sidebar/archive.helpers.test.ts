import { describe, expect, it } from 'bun:test'
import type { ArchivedItem, ArchiveReason } from '@/lib/sidebar/core/types'
import {
  batchOf,
  countLast24h,
  dayLabel,
  entryKey,
  filterArchive,
  flattenDays,
  groupByDay,
  hostOf,
  layoutRows,
  newEntries,
  purge,
  purgeCutoff,
  relativeTime,
  sortedArchive,
  titleOf,
  toastBatches,
  visibleRange,
} from './archive.helpers'

const DAY = 86_400_000
const NOW = Date.parse('2026-09-12T12:00:00.000Z')

function entry(
  overrides: {
    id?: string
    url?: string
    savedTitle?: string
    archivedAt?: number
    reason?: ArchiveReason
    source?: string
    spaceId?: string
  } = {},
): ArchivedItem {
  const {
    id = 'i1',
    url = 'https://example.com/docs',
    savedTitle = 'Example docs',
    archivedAt = NOW,
    reason = 'manual',
    source = 'tidy',
    spaceId = 's1',
  } = overrides
  return {
    item: {
      id,
      parentId: 'today',
      children: [],
      title: null,
      createdAt: archivedAt,
      data: { kind: 'tab', url, savedTitle, lastActiveAt: archivedAt },
    },
    children: [],
    spaceId,
    reason,
    source,
    archivedAt,
  }
}

describe('archive rows', () => {
  it('reads title, host and identity off an entry', () => {
    const one = entry()
    expect(titleOf(one)).toBe('Example docs')
    expect(hostOf(one)).toBe('example.com')
    expect(entryKey(one)).toBe(`${NOW}:i1`)
  })

  it('falls back to the URL when no title was saved', () => {
    expect(titleOf(entry({ savedTitle: '' }))).toBe('https://example.com/docs')
  })

  it('sorts newest first', () => {
    const older = entry({ id: 'a', archivedAt: NOW - 1000 })
    const newer = entry({ id: 'b', archivedAt: NOW })
    expect(sortedArchive([older, newer]).map((e) => e.item.id)).toEqual([
      'b',
      'a',
    ])
  })
})

describe('filtering', () => {
  const entries = [
    entry({ id: 'a', savedTitle: 'Release notes' }),
    entry({ id: 'b', savedTitle: 'Inbox', url: 'https://mail.test/inbox' }),
  ]

  it('matches title and url, case insensitively', () => {
    expect(filterArchive(entries, 'release').map((e) => e.item.id)).toEqual([
      'a',
    ])
    expect(filterArchive(entries, 'mail.test').map((e) => e.item.id)).toEqual([
      'b',
    ])
  })

  it('keeps everything for an empty query', () => {
    expect(filterArchive(entries, '   ')).toHaveLength(2)
  })
})

describe('day grouping', () => {
  it('labels today and yesterday, newest day first', () => {
    const days = groupByDay(
      [
        entry({ id: 'old', archivedAt: NOW - 3 * DAY }),
        entry({ id: 'today', archivedAt: NOW }),
        entry({ id: 'yesterday', archivedAt: NOW - DAY }),
      ],
      NOW,
    )
    expect(days.map((day) => day.label)).toEqual([
      'Today',
      'Yesterday',
      dayLabel(NOW - 3 * DAY, NOW),
    ])
    expect(days[0].entries).toHaveLength(1)
  })

  it('keeps entries of one day newest first', () => {
    const days = groupByDay(
      [
        entry({ id: 'a', archivedAt: NOW - 60_000 }),
        entry({ id: 'b', archivedAt: NOW }),
      ],
      NOW,
    )
    expect(days[0].entries.map((e) => e.item.id)).toEqual(['b', 'a'])
  })

  it('flattens into a header row per day', () => {
    const rows = flattenDays(
      groupByDay([entry({ id: 'a' }), entry({ id: 'b' })], NOW),
    )
    expect(rows[0].kind).toBe('header')
    expect(rows).toHaveLength(3)
  })
})

describe('windowing', () => {
  const rows = flattenDays(
    groupByDay(
      Array.from({ length: 120 }, (_, index) =>
        entry({ id: `i${index}`, archivedAt: NOW - index * 1000 }),
      ),
      NOW,
    ),
  )

  it('renders short lists whole', () => {
    const short = rows.slice(0, 20)
    const range = visibleRange(layoutRows(short), 0, 400)
    expect(range).toEqual({ start: 0, end: short.length })
  })

  it('windows long lists around the scroll offset', () => {
    const layout = layoutRows(rows)
    const range = visibleRange(layout, 1000, 400)
    expect(range.start).toBeGreaterThan(0)
    expect(range.end - range.start).toBeLessThan(rows.length)
    expect(layout.tops[range.start]).toBeLessThanOrEqual(1000)
  })
})

describe('undo batches', () => {
  it('groups by wall-clock second and source', () => {
    const entries = [
      entry({ id: 'a', archivedAt: NOW }),
      entry({ id: 'b', archivedAt: NOW + 400 }),
      entry({ id: 'c', archivedAt: NOW + 4000 }),
      entry({ id: 'd', archivedAt: NOW, source: 'clear' }),
    ]
    expect(batchOf(entries, entries[0]).map((e) => e.item.id)).toEqual([
      'a',
      'b',
    ])
  })

  it('finds entries the previous snapshot did not have', () => {
    const before = [entry({ id: 'a' })]
    const after = [...before, entry({ id: 'b', archivedAt: NOW + 10 })]
    expect(newEntries(before, after).map((e) => e.item.id)).toEqual(['b'])
  })

  it('toasts one batch per run and ignores auto archiving', () => {
    const batches = toastBatches([
      entry({ id: 'a', archivedAt: NOW }),
      entry({ id: 'b', archivedAt: NOW + 100 }),
      entry({ id: 'c', archivedAt: NOW, reason: 'clear', source: 'clear' }),
      entry({ id: 'd', reason: 'auto', source: 'archiveAlarm' }),
    ])
    expect(batches).toHaveLength(2)
    expect(batches[0].map((e) => e.item.id)).toEqual(['a', 'b'])
    expect(batches[1].map((e) => e.item.id)).toEqual(['c'])
  })
})

describe('counts and purge', () => {
  const entries = [
    entry({ id: 'a', archivedAt: NOW - 1000 }),
    entry({ id: 'b', archivedAt: NOW - 2 * DAY }),
    entry({ id: 'c', archivedAt: NOW - 40 * DAY }),
  ]

  it('counts the last 24 hours only', () => {
    expect(countLast24h(entries, NOW)).toBe(1)
  })

  it('purges by age', () => {
    expect(
      purge(entries, purgeCutoff('7d', NOW)).map((e) => e.item.id),
    ).toEqual(['a', 'b'])
    expect(purge(entries, purgeCutoff('30d', NOW))).toHaveLength(2)
    expect(purge(entries, purgeCutoff('all', NOW))).toHaveLength(0)
  })
})

describe('relativeTime', () => {
  it('reads in the coarsest useful unit', () => {
    expect(relativeTime(NOW - 5_000, NOW)).toBe('just now')
    expect(relativeTime(NOW - 5 * 60_000, NOW)).toBe('5m ago')
    expect(relativeTime(NOW - 3 * 3_600_000, NOW)).toBe('3h ago')
    expect(relativeTime(NOW - 2 * DAY, NOW)).toBe('2d ago')
  })
})
