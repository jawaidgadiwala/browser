import type {
  ContainerRole,
  Item,
  ItemId,
  SidebarState,
  SpaceId,
} from './types'

/**
 * Derived views over `SidebarState`. Nothing here is persisted: zones,
 * visible rows and switch targets are always recomputed from the tree.
 */

/** Walk to the ancestor container to learn which zone an item lives in. */
export function zoneOf(
  state: SidebarState,
  itemId: ItemId,
): ContainerRole | null {
  let current: Item | undefined = state.items.byId[itemId]
  const seen = new Set<ItemId>()
  while (current && !seen.has(current.id)) {
    if (current.data.kind === 'container') return current.data.role
    seen.add(current.id)
    current = current.parentId ? state.items.byId[current.parentId] : undefined
  }
  return null
}

/**
 * Signed shortest distance around the space ring, used for carousel
 * direction. Ties (exactly half a ring) resolve forward.
 */
export function ringDelta(from: number, to: number, count: number): number {
  if (count <= 0) return 0
  const forward = (((to - from) % count) + count) % count
  return forward * 2 > count ? forward - count : forward
}

/**
 * @public
 */
export interface SelectionCandidate {
  tabId: number
  index: number
  pinned: boolean
  essential?: boolean
}

/**
 * Which tab to activate when entering a space: last selected, else the first
 * unpinned tab, else the last visible one. An essential is never the answer.
 */
export function selectionFor(
  candidates: SelectionCandidate[],
  lastSelectedTabId?: number,
): number | null {
  const ordered = [...candidates]
    .filter((candidate) => !candidate.essential)
    .sort((a, b) => a.index - b.index)
  if (ordered.length === 0) return null
  const remembered = ordered.find(
    (candidate) => candidate.tabId === lastSelectedTabId,
  )
  if (remembered) return remembered.tabId
  const firstUnpinned = ordered.find((candidate) => !candidate.pinned)
  if (firstUnpinned) return firstUnpinned.tabId
  return ordered[ordered.length - 1].tabId
}

export function adjacentSpace(
  order: SpaceId[],
  activeId: SpaceId | null,
  direction: -1 | 1,
  wrap: boolean,
): SpaceId | null {
  if (order.length === 0) return null
  const current = order.indexOf(activeId ?? '')
  if (current === -1) return order[direction === 1 ? 0 : order.length - 1]
  let next = current + direction
  if (next < 0 || next >= order.length) {
    if (!wrap) return null
    next = (next + order.length) % order.length
  }
  return order[next]
}

export function spaceIdAtIndex(
  order: SpaceId[],
  index: number,
): SpaceId | null {
  return order[index] ?? null
}

export function essentialsList(state: SidebarState): Item[] {
  const root = state.items.byId[state.items.roots.essentials]
  if (!root) return []
  return root.children.flatMap((id) =>
    state.items.byId[id] ? [state.items.byId[id]] : [],
  )
}

/**
 * @public
 */
export interface TreeRow {
  item: Item
  depth: number
}

/**
 * Flattened pinned rows honouring folder expansion. A `peeked` folder shows
 * only the branch leading to the active item, so a peek never grows the list
 * by more than one row per level.
 */
export function pinnedTree(
  state: SidebarState,
  spaceId: SpaceId,
  activeItemId?: ItemId,
): TreeRow[] {
  const space = state.spaces.byId[spaceId]
  const root = space && state.items.byId[space.containers.pinned]
  if (!root) return []

  const activePath = new Set<ItemId>()
  let cursor = activeItemId ? state.items.byId[activeItemId] : undefined
  while (cursor) {
    activePath.add(cursor.id)
    cursor = cursor.parentId ? state.items.byId[cursor.parentId] : undefined
  }

  const rows: TreeRow[] = []
  const walk = (parentId: ItemId, depth: number) => {
    const parent = state.items.byId[parentId]
    if (!parent) return
    for (const childId of parent.children) {
      const item = state.items.byId[childId]
      if (!item || item.data.kind === 'unknown') continue
      rows.push({ item, depth })
      if (item.data.kind !== 'folder') continue
      if (item.data.expansion === 'collapsed') continue
      if (item.data.expansion === 'peeked' && !activePath.has(item.id)) continue
      walk(item.id, depth + 1)
    }
  }
  walk(root.id, 0)

  if (activeItemId) {
    return rows.filter((row) => {
      const parentId = row.item.parentId
      const parent = parentId ? state.items.byId[parentId] : undefined
      if (parent?.data.kind !== 'folder') return true
      if (parent.data.expansion !== 'peeked') return true
      return activePath.has(row.item.id)
    })
  }
  return rows
}

function normalizeUrl(url: string): string {
  const withoutHash = url.split('#')[0]
  return withoutHash.length > 1 && withoutHash.endsWith('/')
    ? withoutHash.slice(0, -1)
    : withoutHash
}

/** A pinned tab has drifted when its live URL left the canonical one. */
export function isDrifted(canonicalUrl: string, liveUrl: string): boolean {
  return normalizeUrl(canonicalUrl) !== normalizeUrl(liveUrl)
}
