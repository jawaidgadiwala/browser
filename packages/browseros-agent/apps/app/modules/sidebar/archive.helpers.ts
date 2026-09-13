import dayjs from 'dayjs'
import type { ArchivedItem, ArchiveReason } from '@/lib/sidebar/core/types'

/**
 * Pure math for the archive view: ordering, day buckets, search, undo batches
 * and the row layout the windowing hook reads. Nothing here touches `chrome.*`.
 */

/** Archive rows are taller than panel rows: two lines of text. */
export const ARCHIVE_ROW_HEIGHT = 44
export const ARCHIVE_HEADER_HEIGHT = 32
/** Shorter lists render whole; past this the list is windowed. */
const VIRTUALISE_ABOVE = 60

export const REASON_LABEL: Record<ArchiveReason, string> = {
  auto: 'auto',
  manual: 'manual',
  clear: 'clear',
  spaceDeleted: 'space deleted',
}

const DAY_MS = 86_400_000

/**
 * @public
 */
export interface ArchiveDay {
  key: string
  label: string
  entries: ArchivedItem[]
}

/**
 * @public
 */
export type ArchiveRow =
  | {
      kind: 'header'
      key: string
      dayKey: string
      label: string
      count: number
      height: number
    }
  | { kind: 'entry'; key: string; entry: ArchivedItem; height: number }

/** Identity of one archive entry; `item.id` alone repeats across restores. */
export function entryKey(entry: ArchivedItem): string {
  return `${entry.archivedAt}:${entry.item.id}`
}

/** One Tidy or Clear run: same wall-clock second and same closing action. */
function batchKey(entry: ArchivedItem): string {
  return `${Math.floor(entry.archivedAt / 1000)}:${entry.source}`
}

export function titleOf(entry: ArchivedItem): string {
  if (entry.item.title) return entry.item.title
  if (entry.item.data.kind === 'tab') {
    return entry.item.data.savedTitle || entry.item.data.url
  }
  return 'Untitled'
}

export function urlOf(entry: ArchivedItem): string {
  return entry.item.data.kind === 'tab' ? entry.item.data.url : ''
}

export function hostOf(entry: ArchivedItem): string {
  const url = urlOf(entry)
  if (!url) return ''
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

export function sortedArchive(entries: ArchivedItem[]): ArchivedItem[] {
  return [...entries].sort((a, b) => b.archivedAt - a.archivedAt)
}

function matchesQuery(entry: ArchivedItem, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return (
    titleOf(entry).toLowerCase().includes(needle) ||
    urlOf(entry).toLowerCase().includes(needle)
  )
}

export function filterArchive(
  entries: ArchivedItem[],
  query: string,
): ArchivedItem[] {
  return entries.filter((entry) => matchesQuery(entry, query))
}

export function dayLabel(timestamp: number, now = Date.now()): string {
  const day = dayjs(timestamp)
  const today = dayjs(now)
  if (day.isSame(today, 'day')) return 'Today'
  if (day.isSame(today.subtract(1, 'day'), 'day')) return 'Yesterday'
  return day.format('ddd, MMM D, YYYY')
}

/** Newest day first, newest entry first inside each day. */
export function groupByDay(
  entries: ArchivedItem[],
  now = Date.now(),
): ArchiveDay[] {
  const days = new Map<string, ArchivedItem[]>()
  for (const entry of sortedArchive(entries)) {
    const key = dayjs(entry.archivedAt).format('YYYY-MM-DD')
    const list = days.get(key)
    if (list) list.push(entry)
    else days.set(key, [entry])
  }
  return [...days.entries()].map(([key, list]) => ({
    key,
    label: dayLabel(list[0].archivedAt, now),
    entries: list,
  }))
}

export function flattenDays(days: ArchiveDay[]): ArchiveRow[] {
  return days.flatMap((day): ArchiveRow[] => [
    {
      kind: 'header',
      key: `h:${day.key}`,
      dayKey: day.key,
      label: day.label,
      count: day.entries.length,
      height: ARCHIVE_HEADER_HEIGHT,
    },
    ...day.entries.map(
      (entry): ArchiveRow => ({
        kind: 'entry',
        key: entryKey(entry),
        entry,
        height: ARCHIVE_ROW_HEIGHT,
      }),
    ),
  ])
}

/**
 * @public
 */
export interface RowLayout {
  tops: number[]
  total: number
}

export function layoutRows(rows: ArchiveRow[]): RowLayout {
  const tops: number[] = []
  let total = 0
  for (const row of rows) {
    tops.push(total)
    total += row.height
  }
  return { tops, total }
}

/**
 * @public
 */
export interface RowRange {
  start: number
  end: number
}

/** Rows have two heights, so the visible slice is a scan over the offsets. */
export function visibleRange(
  layout: RowLayout,
  scrollTop: number,
  viewportHeight: number,
  overscan = 6,
): RowRange {
  const count = layout.tops.length
  if (count <= VIRTUALISE_ABOVE) return { start: 0, end: count }
  const height = viewportHeight || ARCHIVE_ROW_HEIGHT
  let start = 0
  while (start < count && layout.tops[start] < scrollTop) start += 1
  start = Math.max(0, start - 1 - overscan)
  let end = start
  const bottom = scrollTop + height
  while (end < count && layout.tops[end] < bottom) end += 1
  return { start, end: Math.min(count, end + overscan) }
}

/** Every entry closed by the same action in the same second. */
export function batchOf(
  entries: ArchivedItem[],
  entry: ArchivedItem,
): ArchivedItem[] {
  const key = batchKey(entry)
  return entries.filter((candidate) => batchKey(candidate) === key)
}

/** Entries present in `next` that `previous` did not have. */
export function newEntries(
  previous: ArchivedItem[],
  next: ArchivedItem[],
): ArchivedItem[] {
  const seen = new Set(previous.map(entryKey))
  return next.filter((entry) => !seen.has(entryKey(entry)))
}

/** Groups fresh entries into the runs a single Undo should restore. */
export function toastBatches(entries: ArchivedItem[]): ArchivedItem[][] {
  const batches = new Map<string, ArchivedItem[]>()
  for (const entry of entries) {
    if (entry.reason !== 'manual' && entry.reason !== 'clear') continue
    const key = batchKey(entry)
    const list = batches.get(key)
    if (list) list.push(entry)
    else batches.set(key, [entry])
  }
  return [...batches.values()]
}

function countSince(entries: ArchivedItem[], since: number): number {
  return entries.filter((entry) => entry.archivedAt >= since).length
}

export function countLast24h(
  entries: ArchivedItem[],
  now = Date.now(),
): number {
  return countSince(entries, now - DAY_MS)
}

/**
 * @public
 */
export type PurgeScope = '7d' | '30d' | 'all'

export const PURGE_DAYS: Record<PurgeScope, number | null> = {
  '7d': 7,
  '30d': 30,
  all: null,
}

/** Entries archived before the cutoff are purged; `null` purges everything. */
export function purgeCutoff(scope: PurgeScope, now = Date.now()): number {
  const days = PURGE_DAYS[scope]
  return days === null ? now : now - days * DAY_MS
}

export function purge(
  entries: ArchivedItem[],
  olderThan: number,
): ArchivedItem[] {
  return entries.filter((entry) => entry.archivedAt >= olderThan)
}

export function relativeTime(timestamp: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}
