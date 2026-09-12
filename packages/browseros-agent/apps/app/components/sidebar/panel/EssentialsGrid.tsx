import { useDndContext, useDroppable } from '@dnd-kit/core'
import {
  rectSortingStrategy,
  SortableContext,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { CSSProperties, FC } from 'react'
import type { SidebarDndData } from '@/components/sidebar/dnd/SidebarDndContext'
import type { Item, ItemId } from '@/lib/sidebar/core/types'
import { cn } from '@/lib/utils'
import {
  ESSENTIAL_GAP,
  ESSENTIAL_TILE,
  essentialsColumns,
} from '@/modules/sidebar/sidebar-rows.helpers'
import { Favicon } from './Favicon'

export interface EssentialsGridProps {
  rootId: ItemId
  items: Item[]
  iconOnly?: boolean
  onOpen: (itemId: ItemId) => void
  onRemove: (itemId: ItemId) => void
}

/**
 * Global essentials: sites, not tabs. Icon-only tiles, the title only as a
 * tooltip, and an empty grid stays invisible until something is dragged.
 */
export const EssentialsGrid: FC<EssentialsGridProps> = ({
  rootId,
  items,
  iconOnly,
  onOpen,
  onRemove,
}) => {
  const { active } = useDndContext()
  const { setNodeRef, isOver } = useDroppable({
    id: `essentials:${rootId}`,
    data: {
      target: { zone: 'essentials', parentId: rootId, index: items.length },
    } satisfies SidebarDndData,
  })

  if (items.length === 0 && !active) return null

  const style: CSSProperties = {
    gridTemplateColumns: `repeat(${essentialsColumns(Boolean(iconOnly))}, ${ESSENTIAL_TILE}px)`,
    gap: ESSENTIAL_GAP,
  }

  return (
    <div
      ref={setNodeRef}
      data-essentials-grid
      className={cn(
        'grid justify-center px-2 pb-2',
        isOver && 'rounded-md outline outline-[var(--sb-accent)]',
      )}
      style={style}
    >
      <SortableContext
        items={items.map((item) => item.id)}
        strategy={rectSortingStrategy}
      >
        {items.map((item, index) => (
          <EssentialTile
            key={item.id}
            item={item}
            index={index}
            rootId={rootId}
            onOpen={onOpen}
            onRemove={onRemove}
          />
        ))}
      </SortableContext>
      {items.length === 0 && (
        <div
          className="flex items-center justify-center rounded-md border border-white/40 border-dashed text-[10px] opacity-70"
          style={{ width: ESSENTIAL_TILE, height: ESSENTIAL_TILE }}
        >
          Drop a tab here
        </div>
      )}
    </div>
  )
}

const EssentialTile: FC<{
  item: Item
  index: number
  rootId: ItemId
  onOpen: (itemId: ItemId) => void
  onRemove: (itemId: ItemId) => void
}> = ({ item, index, rootId, onOpen, onRemove }) => {
  const url = item.data.kind === 'tab' ? item.data.url : ''
  const title =
    item.title ?? (item.data.kind === 'tab' ? item.data.savedTitle : url)
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({
      id: item.id,
      data: {
        source: {
          zone: 'essentials',
          itemId: item.id,
          url,
          title,
          kind: 'tab',
        },
        target: { zone: 'essentials', parentId: rootId, index },
      } satisfies SidebarDndData,
    })

  return (
    <button
      type="button"
      ref={setNodeRef}
      title={title}
      aria-label={title}
      data-essential-tile
      style={{
        width: ESSENTIAL_TILE,
        height: ESSENTIAL_TILE,
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      onClick={() => onOpen(item.id)}
      onContextMenu={(event) => {
        event.preventDefault()
        onRemove(item.id)
      }}
      className="flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20"
      {...attributes}
      {...listeners}
    >
      <Favicon url={url} className="size-6" />
    </button>
  )
}
