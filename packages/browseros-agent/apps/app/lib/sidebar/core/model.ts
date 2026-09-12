import { nanoid } from 'nanoid'
import { themeSpecForColor } from './theme'
import {
  type ArchivedItem,
  type ArchiveReason,
  DEFAULTS,
  type Expansion,
  type Item,
  type ItemData,
  type ItemId,
  type ItemsState,
  MAX_ARCHIVE,
  MAX_FOLDER_DEPTH,
  type ModelOptions,
  type SidebarState,
  type Space,
  type SpaceId,
  type TabGroupColor,
} from './types'

/**
 * Pure reducers over `SidebarState`. Every function returns a new state and
 * never mutates its input, so the background can keep the previous document
 * around for an undo or a failed write.
 */

interface Ctx {
  now: number
  id: () => ItemId
}

function ctx(opts: ModelOptions = {}): Ctx {
  return { now: opts.now ?? Date.now(), id: opts.newId ?? (() => nanoid(10)) }
}

function container(
  id: ItemId,
  role: 'essentials' | 'pinned' | 'today',
  now: number,
  spaceId?: SpaceId,
): Item {
  return {
    id,
    parentId: null,
    children: [],
    title: null,
    createdAt: now,
    data: { kind: 'container', role, spaceId },
  }
}

export function createInitialState(opts: ModelOptions = {}): SidebarState {
  const { now, id } = ctx(opts)
  const essentials = id()
  return {
    spaces: { order: [], byId: {} },
    activeSpaceId: null,
    items: {
      byId: { [essentials]: container(essentials, 'essentials', now) },
      roots: { essentials },
    },
    archive: [],
    settings: { ...DEFAULTS },
  }
}

/** Ids of `itemId` and everything beneath it, parents before children. */
export function subtreeIds(items: ItemsState, itemId: ItemId): ItemId[] {
  const out: ItemId[] = []
  const stack = [itemId]
  while (stack.length > 0) {
    const current = stack.pop()
    if (current === undefined) continue
    const item = items.byId[current]
    if (!item) continue
    out.push(current)
    stack.push(...item.children)
  }
  return out
}

function detach(byId: Record<ItemId, Item>, itemId: ItemId) {
  const item = byId[itemId]
  const parentId = item?.parentId
  if (!parentId) return
  const parent = byId[parentId]
  if (!parent) return
  byId[parentId] = {
    ...parent,
    children: parent.children.filter((child) => child !== itemId),
  }
}

function attach(
  byId: Record<ItemId, Item>,
  itemId: ItemId,
  parentId: ItemId,
  index: number,
) {
  const parent = byId[parentId]
  if (!parent) throw new Error(`Unknown parent ${parentId}`)
  const children = parent.children.filter((child) => child !== itemId)
  const at = Math.max(0, Math.min(index, children.length))
  children.splice(at, 0, itemId)
  byId[parentId] = { ...parent, children }
  const item = byId[itemId]
  if (item) byId[itemId] = { ...item, parentId }
}

// --- spaces -----------------------------------------------------------------

/**
 * @public
 */
export interface NewSpaceInput {
  name: string
  icon?: string
  color: TabGroupColor
}

/**
 * Build a Space record with fresh container ids. The matching container
 * items are created by `createSpace` or reconciled by `ensureSpaceContainers`.
 */
export function newSpace(input: NewSpaceInput, opts: ModelOptions = {}): Space {
  const { now, id } = ctx(opts)
  return {
    id: id(),
    name: input.name,
    icon: (input.icon ?? '').trim(),
    color: input.color,
    theme: themeSpecForColor(input.color),
    containers: { pinned: id(), today: id() },
    pinnedCollapsed: false,
    createdAt: now,
  }
}

/** New spaces land right after the active one, or at the end. */
export function createSpace(
  state: SidebarState,
  input: NewSpaceInput,
  opts: ModelOptions = {},
): { state: SidebarState; space: Space } {
  const space = newSpace(input, opts)
  const activeIndex = state.spaces.order.indexOf(state.activeSpaceId ?? '')
  const insertAt =
    activeIndex === -1 ? state.spaces.order.length : activeIndex + 1
  const order = [...state.spaces.order]
  order.splice(insertAt, 0, space.id)
  const next: SidebarState = {
    ...state,
    spaces: { order, byId: { ...state.spaces.byId, [space.id]: space } },
  }
  return { state: ensureSpaceContainers(next, opts), space }
}

export function updateSpace(
  state: SidebarState,
  spaceId: SpaceId,
  patch: Partial<Omit<Space, 'id' | 'containers' | 'createdAt'>>,
): SidebarState {
  const space = state.spaces.byId[spaceId]
  if (!space) return state
  return {
    ...state,
    spaces: {
      order: state.spaces.order,
      byId: { ...state.spaces.byId, [spaceId]: { ...space, ...patch } },
    },
  }
}

/** Deleting a space archives its pinned nodes; today tabs are not stored. */
export function deleteSpace(
  state: SidebarState,
  spaceId: SpaceId,
  opts: ModelOptions = {},
): SidebarState {
  const space = state.spaces.byId[spaceId]
  if (!space) return state
  const { now } = ctx(opts)

  let next = state
  const pinnedRoot = state.items.byId[space.containers.pinned]
  for (const childId of pinnedRoot?.children ?? []) {
    next = archiveItem(next, childId, 'spaceDeleted', 'deleteSpace', { now })
  }

  const byId = { ...next.items.byId }
  for (const rootId of [space.containers.pinned, space.containers.today]) {
    for (const id of subtreeIds(next.items, rootId)) delete byId[id]
  }

  const order = next.spaces.order.filter((id) => id !== spaceId)
  const { [spaceId]: _removed, ...spacesById } = next.spaces.byId
  const wasActive = next.activeSpaceId === spaceId
  const fallbackIndex = Math.min(
    state.spaces.order.indexOf(spaceId),
    order.length - 1,
  )
  return {
    ...next,
    spaces: { order, byId: spacesById },
    activeSpaceId: wasActive
      ? (order[fallbackIndex] ?? null)
      : next.activeSpaceId,
    items: { ...next.items, byId },
  }
}

export function moveSpace(
  state: SidebarState,
  spaceId: SpaceId,
  toIndex: number,
): SidebarState {
  const from = state.spaces.order.indexOf(spaceId)
  if (from === -1) return state
  const order = [...state.spaces.order]
  order.splice(from, 1)
  order.splice(Math.max(0, Math.min(toIndex, order.length)), 0, spaceId)
  return { ...state, spaces: { ...state.spaces, order } }
}

/**
 * Create container roots for spaces that lack them and drop containers whose
 * space is gone. Keeps the legacy Spaces surface, which only writes the space
 * list, from leaving the item tree inconsistent.
 */
export function ensureSpaceContainers(
  state: SidebarState,
  opts: ModelOptions = {},
): SidebarState {
  const { now } = ctx(opts)
  const byId = { ...state.items.byId }
  let changed = false

  const live = new Set<ItemId>([state.items.roots.essentials])
  for (const spaceId of state.spaces.order) {
    const space = state.spaces.byId[spaceId]
    if (!space) continue
    for (const role of ['pinned', 'today'] as const) {
      const id = space.containers[role]
      live.add(id)
      if (!byId[id]) {
        byId[id] = container(id, role, now, spaceId)
        changed = true
      }
    }
  }

  for (const item of Object.values(state.items.byId)) {
    if (item.data.kind !== 'container' || live.has(item.id)) continue
    for (const id of subtreeIds(state.items, item.id)) delete byId[id]
    changed = true
  }

  return changed ? { ...state, items: { ...state.items, byId } } : state
}

// --- items ------------------------------------------------------------------

/**
 * @public
 */
export interface CreateItemInput {
  parentId: ItemId
  index?: number
  title?: string | null
  data: ItemData
}

export function createItem(
  state: SidebarState,
  input: CreateItemInput,
  opts: ModelOptions = {},
): { state: SidebarState; item: Item } {
  const { now, id } = ctx(opts)
  const item: Item = {
    id: id(),
    parentId: input.parentId,
    children: [],
    title: input.title ?? null,
    createdAt: now,
    data: input.data,
  }
  const byId = { ...state.items.byId, [item.id]: item }
  attach(byId, item.id, input.parentId, input.index ?? Number.MAX_SAFE_INTEGER)
  return { state: { ...state, items: { ...state.items, byId } }, item }
}

/** Folder levels below the nearest container; a container itself is 0. */
function folderLevel(items: ItemsState, itemId: ItemId): number {
  let level = 0
  let cursor: Item | undefined = items.byId[itemId]
  const seen = new Set<ItemId>()
  while (cursor && !seen.has(cursor.id)) {
    if (cursor.data.kind === 'container') return level
    if (cursor.data.kind === 'folder') level += 1
    seen.add(cursor.id)
    cursor = cursor.parentId ? items.byId[cursor.parentId] : undefined
  }
  return level
}

/** Deepest folder nesting inside a subtree, counting the root as one level. */
function subtreeFolderDepth(items: ItemsState, itemId: ItemId): number {
  const item = items.byId[itemId]
  if (!item) return 0
  const own = item.data.kind === 'folder' ? 1 : 0
  let deepest = 0
  for (const childId of item.children) {
    deepest = Math.max(deepest, subtreeFolderDepth(items, childId))
  }
  return own + deepest
}

function containerRoleOf(items: ItemsState, itemId: ItemId) {
  let cursor: Item | undefined = items.byId[itemId]
  const seen = new Set<ItemId>()
  while (cursor && !seen.has(cursor.id)) {
    if (cursor.data.kind === 'container') return cursor.data.role
    seen.add(cursor.id)
    cursor = cursor.parentId ? items.byId[cursor.parentId] : undefined
  }
  return null
}

/**
 * Structural rules for a move. Kept separate from `moveItem` so the panel can
 * grey out an illegal drop instead of firing a message the background drops.
 */
function canMoveItem(
  state: SidebarState,
  itemId: ItemId,
  parentId: ItemId,
): boolean {
  const item = state.items.byId[itemId]
  const parent = state.items.byId[parentId]
  if (!item || !parent) return false
  // Moving a node into its own subtree would orphan the tree.
  if (subtreeIds(state.items, itemId).includes(parentId)) return false
  if (parent.data.kind !== 'container' && parent.data.kind !== 'folder') {
    return false
  }
  const targetRole = containerRoleOf(state.items, parentId)
  // Today rows are derived from live tabs, so nothing is ever stored there.
  if (targetRole === 'today') return false
  if (targetRole === 'essentials') {
    if (item.data.kind !== 'tab') return false
    const staying = containerRoleOf(state.items, itemId) === 'essentials'
    const root = state.items.byId[state.items.roots.essentials]
    if (
      !staying &&
      (root?.children.length ?? 0) >= state.settings.essentialsMax
    )
      return false
  }
  const depth =
    folderLevel(state.items, parentId) + subtreeFolderDepth(state.items, itemId)
  return depth <= MAX_FOLDER_DEPTH
}

export function moveItem(
  state: SidebarState,
  itemId: ItemId,
  parentId: ItemId,
  index: number,
): SidebarState {
  if (!canMoveItem(state, itemId, parentId)) return state
  const byId = { ...state.items.byId }
  detach(byId, itemId)
  attach(byId, itemId, parentId, index)
  return { ...state, items: { ...state.items, byId } }
}

export function removeItem(state: SidebarState, itemId: ItemId): SidebarState {
  const item = state.items.byId[itemId]
  if (!item) return state
  const byId = { ...state.items.byId }
  detach(byId, itemId)
  for (const id of subtreeIds(state.items, itemId)) delete byId[id]
  return { ...state, items: { ...state.items, byId } }
}

// --- pinned -----------------------------------------------------------------

/**
 * @public
 */
export interface TabSnapshot {
  url: string
  savedTitle: string
  favicon?: string
  lastActiveAt?: number
}

/** Pinning stores a canonical snapshot; drift is measured against it later. */
export function pin(
  state: SidebarState,
  spaceId: SpaceId,
  snapshot: TabSnapshot,
  opts: ModelOptions = {},
): { state: SidebarState; item: Item } {
  const space = state.spaces.byId[spaceId]
  if (!space) throw new Error(`Unknown space ${spaceId}`)
  const { now } = ctx(opts)
  return createItem(
    state,
    {
      parentId: space.containers.pinned,
      data: {
        kind: 'tab',
        url: snapshot.url,
        savedTitle: snapshot.savedTitle,
        favicon: snapshot.favicon,
        lastActiveAt: snapshot.lastActiveAt ?? now,
      },
    },
    opts,
  )
}

export function unpin(state: SidebarState, itemId: ItemId): SidebarState {
  return removeItem(state, itemId)
}

// --- essentials -------------------------------------------------------------

export function addEssential(
  state: SidebarState,
  snapshot: TabSnapshot,
  opts: ModelOptions = {},
): { state: SidebarState; item: Item | null } {
  const root = state.items.byId[state.items.roots.essentials]
  if (!root) throw new Error('Missing essentials root')
  if (root.children.length >= state.settings.essentialsMax) {
    return { state, item: null }
  }
  const { now } = ctx(opts)
  return createItem(
    state,
    {
      parentId: root.id,
      data: {
        kind: 'tab',
        url: snapshot.url,
        savedTitle: snapshot.savedTitle,
        favicon: snapshot.favicon,
        lastActiveAt: snapshot.lastActiveAt ?? now,
      },
    },
    opts,
  )
}

export function removeEssential(
  state: SidebarState,
  itemId: ItemId,
): SidebarState {
  return removeItem(state, itemId)
}

// --- folders ----------------------------------------------------------------

/** A folder fits when its parent is still above the nesting cap. */
function canCreateFolder(state: SidebarState, parentId: ItemId): boolean {
  const parent = state.items.byId[parentId]
  if (!parent) return false
  if (parent.data.kind !== 'container' && parent.data.kind !== 'folder') {
    return false
  }
  if (containerRoleOf(state.items, parentId) !== 'pinned') return false
  return folderLevel(state.items, parentId) + 1 <= MAX_FOLDER_DEPTH
}

export function createFolder(
  state: SidebarState,
  parentId: ItemId,
  title: string,
  opts: ModelOptions = {},
): { state: SidebarState; item: Item } {
  if (!canCreateFolder(state, parentId)) {
    throw new Error(`Cannot create a folder under ${parentId}`)
  }
  return createItem(
    state,
    { parentId, title, data: { kind: 'folder', expansion: 'expanded' } },
    opts,
  )
}

export function setExpansion(
  state: SidebarState,
  folderId: ItemId,
  expansion: Expansion,
): SidebarState {
  const item = state.items.byId[folderId]
  if (item?.data.kind !== 'folder') return state
  return {
    ...state,
    items: {
      ...state.items,
      byId: {
        ...state.items.byId,
        [folderId]: { ...item, data: { ...item.data, expansion } },
      },
    },
  }
}

// --- archive ----------------------------------------------------------------

function spaceIdOf(state: SidebarState, itemId: ItemId): SpaceId | null {
  let current: Item | undefined = state.items.byId[itemId]
  while (current) {
    if (current.data.kind === 'container') return current.data.spaceId ?? null
    current = current.parentId ? state.items.byId[current.parentId] : undefined
  }
  return null
}

export function archiveItem(
  state: SidebarState,
  itemId: ItemId,
  reason: ArchiveReason,
  source: string,
  opts: ModelOptions = {},
): SidebarState {
  const item = state.items.byId[itemId]
  if (!item) return state
  const { now } = ctx(opts)
  const descendants = subtreeIds(state.items, itemId)
    .slice(1)
    .flatMap((id) => (state.items.byId[id] ? [state.items.byId[id]] : []))
  const entry: ArchivedItem = {
    item,
    children: descendants,
    spaceId: spaceIdOf(state, itemId) ?? '',
    reason,
    source,
    archivedAt: now,
  }
  const archive = [...state.archive, entry].slice(-MAX_ARCHIVE)
  return { ...removeItem(state, itemId), archive }
}

/** Re-insert an archived node under the container it came from. */
export function restore(
  state: SidebarState,
  archivedAt: number,
  itemId: ItemId,
): SidebarState {
  const index = state.archive.findIndex(
    (entry) => entry.archivedAt === archivedAt && entry.item.id === itemId,
  )
  const entry = state.archive[index]
  if (!entry) return state
  const parentId = entry.item.parentId
  if (!parentId || !state.items.byId[parentId]) return state

  const byId = { ...state.items.byId, [entry.item.id]: entry.item }
  for (const child of entry.children ?? []) byId[child.id] = child
  attach(byId, entry.item.id, parentId, Number.MAX_SAFE_INTEGER)

  return {
    ...state,
    items: { ...state.items, byId },
    archive: state.archive.filter((_, i) => i !== index),
  }
}

/**
 * Archive a batch of today tabs. Today rows are derived from live tabs, so
 * the caller passes their snapshots; the nodes exist only in the archive.
 */
export function tidy(
  state: SidebarState,
  spaceId: SpaceId,
  tabs: TabSnapshot[],
  reason: ArchiveReason = 'manual',
  opts: ModelOptions = {},
): SidebarState {
  const space = state.spaces.byId[spaceId]
  if (!space || tabs.length === 0) return state
  const { now, id } = ctx(opts)
  const entries: ArchivedItem[] = tabs.map((tab) => ({
    item: {
      id: id(),
      parentId: space.containers.today,
      children: [],
      title: null,
      createdAt: now,
      data: {
        kind: 'tab',
        url: tab.url,
        savedTitle: tab.savedTitle,
        favicon: tab.favicon,
        lastActiveAt: tab.lastActiveAt ?? now,
      },
    },
    children: [],
    spaceId,
    reason,
    source: 'tidy',
    archivedAt: now,
  }))
  return {
    ...state,
    archive: [...state.archive, ...entries].slice(-MAX_ARCHIVE),
  }
}
