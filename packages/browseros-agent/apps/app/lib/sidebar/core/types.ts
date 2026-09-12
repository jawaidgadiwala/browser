/**
 * Pure data model for the sidebar. Nothing in `core/` may touch `chrome.*`
 * so every rule here stays unit testable and reusable by a native surface.
 */

/**
 * @public
 */
export type ItemId = string

/**
 * @public
 */
export type SpaceId = string

/**
 * Tab group colors Chromium accepts, as string literals so core never has to
 * reach for `chrome.tabGroups.ColorEnum`.
 *
 * @public
 */
export const TAB_GROUP_COLORS = [
  'grey',
  'blue',
  'red',
  'yellow',
  'green',
  'pink',
  'purple',
  'cyan',
  'orange',
] as const

/**
 * @public
 */
export type TabGroupColor = (typeof TAB_GROUP_COLORS)[number]

/**
 * @public
 */
export type Expansion = 'expanded' | 'collapsed' | 'peeked'

/**
 * @public
 */
export type ContainerRole = 'essentials' | 'pinned' | 'today'

/**
 * @public
 */
export type ItemData =
  | {
      kind: 'tab'
      url: string
      savedTitle: string
      favicon?: string
      lastActiveAt: number
    }
  | { kind: 'folder'; expansion: Expansion }
  | { kind: 'container'; role: ContainerRole; spaceId?: SpaceId }
  | { kind: 'unknown'; raw: unknown }

/**
 * One homogeneous tree node. Zone membership is derived by walking to the
 * ancestor container, never stored on the node.
 *
 * @public
 */
export interface Item {
  id: ItemId
  parentId: ItemId | null
  children: ItemId[]
  /** User override; null means "use the live or saved title". */
  title: string | null
  createdAt: number
  data: ItemData
}

/**
 * @public
 */
export interface ThemeSpec {
  keyColors: Array<{ rgb: [number, number, number]; primary?: boolean }>
  wheel: 'analogous' | 'complementary'
  intensity: number
  noise: number
}

/**
 * A Space is a named workspace. Tab membership lives on the Chromium tab
 * group that carries the space's name; only pinned nodes are stored here.
 *
 * @public
 */
export interface Space {
  id: SpaceId
  name: string
  /** Emoji or glyph key. */
  icon: string
  color: TabGroupColor
  theme: ThemeSpec
  containers: { pinned: ItemId; today: ItemId }
  pinnedCollapsed: boolean
  createdAt: number
}

/**
 * @public
 */
export type ArchiveReason = 'auto' | 'manual' | 'clear' | 'spaceDeleted'

/**
 * @public
 */
export interface ArchivedItem {
  /** The whole node, including its descendants. */
  item: Item
  children?: Item[]
  spaceId: SpaceId
  reason: ArchiveReason
  source: string
  archivedAt: number
}

/**
 * @public
 */
export interface SidebarSettings {
  autoArchiveAfter: '1h' | '6h' | '12h' | '24h' | '7d' | '30d' | 'never'
  discardInactiveSpacesAfterMin: number
  essentialsMax: number
  wrapAround: boolean
  naturalScroll: boolean
  pinnedCloseBehavior:
    | 'reset-unload-switch'
    | 'reset'
    | 'unload-switch'
    | 'close'
}

/**
 * @public
 */
export const DEFAULTS: SidebarSettings = {
  autoArchiveAfter: '12h',
  discardInactiveSpacesAfterMin: 30,
  essentialsMax: 12,
  wrapAround: true,
  naturalScroll: false,
  pinnedCloseBehavior: 'reset-unload-switch',
}

/** Item tree cap; the panel warns above 80 % of it. */
export const MAX_ITEMS = 5000

/** Archive cap; oldest entries are pruned first. */
export const MAX_ARCHIVE = 2000

/**
 * @public
 */
export interface SpacesState {
  order: SpaceId[]
  byId: Record<SpaceId, Space>
}

/**
 * @public
 */
export interface ItemsState {
  byId: Record<ItemId, Item>
  roots: { essentials: ItemId }
}

/**
 * The whole persistent document, assembled from the `sidebar:*` storage keys.
 *
 * @public
 */
export interface SidebarState {
  spaces: SpacesState
  activeSpaceId: SpaceId | null
  items: ItemsState
  archive: ArchivedItem[]
  settings: SidebarSettings
}

/**
 * Injected so reducers stay deterministic under test.
 *
 * @public
 */
export interface ModelOptions {
  now?: number
  newId?: () => ItemId
}
