import { newSpace } from '@/lib/sidebar/core/model'
import { SPACE_COLORS, type Space, type SpaceColor } from './spaces.types'

/**
 * Minimal shape of a Chromium tab group. Structural so helpers stay pure.
 *
 * @public
 */
export interface GroupLike {
  id: number
  title?: string
  color: string
  windowId: number
}

/**
 * Minimal shape of a Chromium tab. Structural so helpers stay pure.
 *
 * @public
 */
export interface TabLike {
  id?: number
  groupId: number
  index: number
  pinned: boolean
  active: boolean
}

/** Chromium's sentinel for "not in a group". */
export const NO_GROUP = -1

export const MAX_SPACES = 20

/** Space names double as group titles, so they must be unique and non-empty. */
export function normalizeSpaceName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, 40)
}

export function isNameTaken(
  spaces: Space[],
  name: string,
  exceptId?: string,
): boolean {
  const wanted = normalizeSpaceName(name).toLowerCase()
  return spaces.some(
    (space) => space.id !== exceptId && space.name.toLowerCase() === wanted,
  )
}

/** Pick the least-used color so neighbouring spaces stay distinguishable. */
export function nextColor(spaces: Space[]): SpaceColor {
  const counts = new Map<SpaceColor, number>()
  for (const color of SPACE_COLORS) counts.set(color, 0)
  for (const space of spaces) {
    counts.set(space.color, (counts.get(space.color) ?? 0) + 1)
  }
  let best: SpaceColor = SPACE_COLORS[1]
  let bestCount = Number.POSITIVE_INFINITY
  // Skip grey as an automatic pick; it reads as "no space".
  for (const color of SPACE_COLORS.slice(1)) {
    const count = counts.get(color) ?? 0
    if (count < bestCount) {
      best = color
      bestCount = count
    }
  }
  return best
}

export interface CreateSpaceInput {
  name: string
  icon?: string
  color?: SpaceColor
}

/**
 * Create a space and insert it right after the active one,
 * or at the end when nothing is active.
 */
export function createSpace(
  spaces: Space[],
  activeId: string | null,
  input: CreateSpaceInput,
  now: number = Date.now(),
): { spaces: Space[]; space: Space } {
  const name = normalizeSpaceName(input.name)
  if (!name) throw new Error('Space name is required')
  if (isNameTaken(spaces, name)) throw new Error('Space name already in use')
  if (spaces.length >= MAX_SPACES) throw new Error('Too many spaces')
  const space = newSpace(
    { name, icon: input.icon, color: input.color ?? nextColor(spaces) },
    { now },
  )
  const activeIndex = spaces.findIndex((s) => s.id === activeId)
  const insertAt = activeIndex === -1 ? spaces.length : activeIndex + 1
  const next = [...spaces]
  next.splice(insertAt, 0, space)
  return { spaces: next, space }
}

export function updateSpace(
  spaces: Space[],
  id: string,
  patch: Partial<Pick<Space, 'name' | 'icon' | 'color'>>,
): Space[] {
  if (patch.name !== undefined) {
    const name = normalizeSpaceName(patch.name)
    if (!name) throw new Error('Space name is required')
    if (isNameTaken(spaces, name, id))
      throw new Error('Space name already in use')
    patch = { ...patch, name }
  }
  return spaces.map((space) =>
    space.id === id ? { ...space, ...patch } : space,
  )
}

export function removeSpace(spaces: Space[], id: string): Space[] {
  return spaces.filter((space) => space.id !== id)
}

export function moveSpace(
  spaces: Space[],
  id: string,
  direction: -1 | 1,
): Space[] {
  const from = spaces.findIndex((space) => space.id === id)
  const to = from + direction
  if (from === -1 || to < 0 || to >= spaces.length) return spaces
  const next = [...spaces]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/**
 * Id of the space `steps` away from `activeId`. Returns null when there is
 * nothing to switch to (no spaces, or at an edge without wrap).
 */
export function adjacentSpaceId(
  spaces: Space[],
  activeId: string | null,
  direction: -1 | 1,
  wrap: boolean,
): string | null {
  if (spaces.length === 0) return null
  const current = spaces.findIndex((space) => space.id === activeId)
  if (current === -1) return spaces[direction === 1 ? 0 : spaces.length - 1].id
  let next = current + direction
  if (next < 0 || next >= spaces.length) {
    if (!wrap) return null
    next = (next + spaces.length) % spaces.length
  }
  return spaces[next].id
}

export function spaceIdAtIndex(spaces: Space[], index: number): string | null {
  return spaces[index]?.id ?? null
}

/** The group in `windowId` that represents `space`, matched by title. */
export function findGroupForSpace(
  groups: GroupLike[],
  space: Space,
  windowId: number,
): GroupLike | undefined {
  return groups.find(
    (group) => group.windowId === windowId && group.title === space.name,
  )
}

/** The space a group belongs to, or undefined for foreign/ungrouped groups. */
export function findSpaceForGroup(
  spaces: Space[],
  group: Pick<GroupLike, 'title'> | undefined,
): Space | undefined {
  if (!group?.title) return undefined
  return spaces.find((space) => space.name === group.title)
}

/**
 * Which tab to activate when entering a space. Order:
 * last active in that space, else first unpinned tab, else last tab.
 */
export function pickTabToActivate(
  tabsInGroup: TabLike[],
  lastActiveTabId: number | undefined,
): number | undefined {
  const ordered = [...tabsInGroup].sort((a, b) => a.index - b.index)
  if (lastActiveTabId !== undefined) {
    const remembered = ordered.find((tab) => tab.id === lastActiveTabId)
    if (remembered?.id !== undefined) return remembered.id
  }
  const firstUnpinned = ordered.find((tab) => !tab.pinned)
  if (firstUnpinned?.id !== undefined) return firstUnpinned.id
  return ordered.at(-1)?.id
}

/** Display glyph: the icon, else the first character of the name. */
export function spaceGlyph(space: Pick<Space, 'name' | 'icon'>): string {
  if (space.icon) return space.icon
  const first = Array.from(space.name.trim())[0]
  return first ? first.toUpperCase() : '·'
}

/** Drop remembered tabs that no longer exist. */
export function pruneLastActive(
  memory: Record<string, number>,
  liveTabIds: Set<number>,
  liveSpaceIds: Set<string>,
): Record<string, number> {
  const next: Record<string, number> = {}
  for (const [spaceId, tabId] of Object.entries(memory)) {
    if (liveSpaceIds.has(spaceId) && liveTabIds.has(tabId)) {
      next[spaceId] = tabId
    }
  }
  return next
}
