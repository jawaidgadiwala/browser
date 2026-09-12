import type { ItemId } from '@/lib/sidebar/core/types'

/**
 * Pure intent mapping for sidebar drag and drop: (source, target) in, the
 * background messages to send out. Kept free of dnd-kit and React so every
 * cross-zone rule is unit tested without a DOM.
 */

/**
 * @public
 */
export type DropZone = 'essentials' | 'pinned' | 'today'

/**
 * @public
 */
export interface DragSource {
  zone: DropZone
  /** Set for essentials tiles and pinned rows. */
  itemId?: ItemId
  /** Set for today rows, which are live tabs and have no stored node. */
  tabId?: number
  url?: string
  title?: string
  kind?: 'tab' | 'folder'
}

/**
 * @public
 */
export interface DropTarget {
  zone: DropZone
  /** The container or folder receiving the drop; unset for today. */
  parentId?: ItemId
  /** Insert position inside `parentId`; omitted appends. */
  index?: number
}

/**
 * @public
 */
export type DropIntent =
  | { type: 'moveItem'; itemId: ItemId; parentId: ItemId; index: number }
  | {
      type: 'pinTab'
      tabId?: number
      url?: string
      title?: string
      parentId?: ItemId
      index?: number
    }
  | { type: 'unpinItem'; itemId: ItemId }
  | { type: 'addEssential'; tabId?: number; url?: string; title?: string }

const APPEND = Number.MAX_SAFE_INTEGER

/**
 * Today rows are never reordered here: Chromium's tab order is the source of
 * truth for that zone, so a today→today drop is deliberately a no-op.
 */
export function planDrop(source: DragSource, target: DropTarget): DropIntent[] {
  if (target.zone === 'today') {
    if (source.zone === 'pinned' && source.itemId) {
      return [{ type: 'unpinItem', itemId: source.itemId }]
    }
    return []
  }

  if (target.zone === 'essentials') {
    if (source.zone === 'essentials') {
      if (!source.itemId || !target.parentId) return []
      return [
        {
          type: 'moveItem',
          itemId: source.itemId,
          parentId: target.parentId,
          index: target.index ?? APPEND,
        },
      ]
    }
    if (!source.url || source.kind === 'folder') return []
    return [
      {
        type: 'addEssential',
        tabId: source.tabId,
        url: source.url,
        title: source.title,
      },
    ]
  }

  if (!target.parentId) return []

  if (source.zone === 'pinned') {
    if (!source.itemId) return []
    return [
      {
        type: 'moveItem',
        itemId: source.itemId,
        parentId: target.parentId,
        index: target.index ?? APPEND,
      },
    ]
  }

  if (source.zone === 'today') {
    if (source.tabId === undefined) return []
    return [
      {
        type: 'pinTab',
        tabId: source.tabId,
        parentId: target.parentId,
        index: target.index ?? APPEND,
      },
    ]
  }

  // An essential dragged into pinned is copied: the tile stays put.
  if (!source.url) return []
  return [
    {
      type: 'pinTab',
      url: source.url,
      title: source.title,
      parentId: target.parentId,
      index: target.index ?? APPEND,
    },
  ]
}
