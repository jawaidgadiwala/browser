import type {
  ItemId,
  ItemsState,
  Space,
  SpaceId,
} from '@/lib/sidebar/core/types'

/**
 * Pure row math for the sidebar panel. Live tabs come in as plain structural
 * shapes so nothing here needs `chrome.*` and every rule stays unit tested.
 */

/** Layout constants from the sidebar spec. */
export const ROW_HEIGHT = 36
export const ICON_ONLY_ROW_HEIGHT = 48
/** Below this panel width only favicons fit. */
export const ICON_ONLY_WIDTH = 120
/** Longer lists are windowed instead of fully rendered. */
const VIRTUALISE_ABOVE = 40
export const DOT_MAX = 32
export const DOT_MIN = 16
export const DOT_GAP = 3

/** Chromium's sentinel for "not in a group". */
const NO_GROUP = -1

/**
 * @public
 */
export interface LiveTab {
  id?: number
  index: number
  title?: string
  url?: string
  favIconUrl?: string
  groupId: number
  active: boolean
  windowId: number
}

/**
 * @public
 */
export interface LiveGroup {
  id: number
  title?: string
  color: string
  windowId: number
}

/**
 * @public
 */
export interface TabRowData {
  tabId: number
  title: string
  url: string
  favIconUrl?: string
  active: boolean
  /** Set only for rows that come from a space other than the active one. */
  spaceName?: string
}

export function isIconOnly(width: number): boolean {
  return width > 0 && width < ICON_ONLY_WIDTH
}

/** Dots keep their 32 px size until the strip overflows, then shrink to 16 px. */
export function dotSize(count: number, available: number): number {
  if (count <= 0) return DOT_MAX
  const perDot = Math.floor((available - DOT_GAP * (count - 1)) / count)
  if (perDot > DOT_MAX) return DOT_MAX
  return perDot < DOT_MIN ? DOT_MIN : perDot
}

function normalizeUrl(url: string): string {
  const withoutHash = url.split('#')[0]
  return withoutHash.length > 1 && withoutHash.endsWith('/')
    ? withoutHash.slice(0, -1)
    : withoutHash
}

/** Canonical URLs of every pinned tab node in a space, folders included. */
export function pinnedUrls(items: ItemsState, space: Space): Set<string> {
  const urls = new Set<string>()
  const seen = new Set<ItemId>()
  const walk = (id: ItemId) => {
    if (seen.has(id)) return
    seen.add(id)
    const item = items.byId[id]
    if (!item) return
    if (item.data.kind === 'tab') urls.add(normalizeUrl(item.data.url))
    for (const child of item.children) walk(child)
  }
  walk(space.containers.pinned)
  return urls
}

/**
 * Same matching rule as `lib/spaces/spaces.helpers#findGroupForSpace`: the
 * group title carries the space name. Colour only breaks ties, because a
 * user can recolour a group by hand without leaving the space.
 */
export function groupIdForSpace(
  groups: LiveGroup[],
  space: Space,
  windowId: number,
): number | null {
  const candidates = groups.filter(
    (group) => group.windowId === windowId && group.title === space.name,
  )
  if (candidates.length === 0) return null
  const exact = candidates.find((group) => group.color === space.color)
  return (exact ?? candidates[0]).id
}

function toRow(tab: LiveTab, spaceName?: string): TabRowData | null {
  if (tab.id === undefined || !tab.url) return null
  return {
    tabId: tab.id,
    title: tab.title?.trim() || tab.url,
    url: tab.url,
    favIconUrl: tab.favIconUrl,
    active: tab.active,
    spaceName,
  }
}

/**
 * Today = live tabs of the space's group in Chromium index order, minus the
 * ones a pinned node already represents.
 */
export function todayRows(
  tabs: LiveTab[],
  groupId: number | null,
  pinned: Set<string>,
): TabRowData[] {
  if (groupId === null || groupId === NO_GROUP) return []
  return tabs
    .filter((tab) => tab.groupId === groupId)
    .filter((tab) => !pinned.has(normalizeUrl(tab.url ?? '')))
    .sort((a, b) => a.index - b.index)
    .flatMap((tab) => {
      const row = toRow(tab)
      return row ? [row] : []
    })
}

function matchesQuery(tab: LiveTab, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return false
  const haystack = `${tab.title ?? ''} ${tab.url ?? ''}`.toLowerCase()
  return haystack.includes(needle)
}

/**
 * Search spans every space in the window. Matches inside the active space
 * come first; the rest carry their space name so the row can label itself.
 */
export function searchRows(
  tabs: LiveTab[],
  groups: LiveGroup[],
  spaces: Space[],
  activeSpaceId: SpaceId | null,
  query: string,
  windowId: number,
): TabRowData[] {
  if (!query.trim()) return []
  const spaceByGroup = new Map<number, Space>()
  for (const space of spaces) {
    const groupId = groupIdForSpace(groups, space, windowId)
    if (groupId !== null) spaceByGroup.set(groupId, space)
  }
  const matches = tabs
    .filter((tab) => matchesQuery(tab, query))
    .sort((a, b) => a.index - b.index)
  const rows: TabRowData[] = []
  for (const inActive of [true, false]) {
    for (const tab of matches) {
      const space = spaceByGroup.get(tab.groupId)
      const isActive = space?.id === activeSpaceId && activeSpaceId !== null
      if (isActive !== inActive) continue
      const row = toRow(tab, isActive ? undefined : space?.name)
      if (row) rows.push(row)
    }
  }
  return rows
}

/**
 * @public
 */
export interface WindowRange {
  start: number
  end: number
}

/** Which slice of a long list to render for a given scroll offset. */
export function windowRange(
  count: number,
  rowHeight: number,
  scrollTop: number,
  viewportHeight: number,
  overscan = 6,
): WindowRange {
  if (count <= VIRTUALISE_ABOVE) return { start: 0, end: count }
  const visible = Math.ceil((viewportHeight || rowHeight) / rowHeight)
  const first = Math.floor(scrollTop / rowHeight) - overscan
  const start = first < 0 ? 0 : first
  const end = Math.min(count, start + visible + overscan * 2)
  return { start, end }
}
