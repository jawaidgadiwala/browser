import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { type FC, type ReactNode, useEffect, useRef, useState } from 'react'
import { EDGE_HOLD_MS, edgeDirection } from '@/lib/sidebar/core/paging'
import { applyDropIntents } from '@/modules/sidebar/sidebar-actions'
import { type DragSource, type DropTarget, planDrop } from './drop-plan'

/**
 * One drag context for the whole panel. Rows and tiles only declare what they
 * are (`source`) and what a drop on them means (`target`); every cross-zone
 * rule lives in `drop-plan.ts`.
 *
 * @public
 */
export interface SidebarDndData {
  source?: DragSource
  target?: DropTarget
}

/**
 * Pointer first, rects as the fallback. A folder's drop band is inset from the
 * row edges, so whenever it is hit at all the drop means "into this folder";
 * the uncovered edges still resolve to the sortable row between siblings.
 */
const collisionDetection: typeof pointerWithin = (args) => {
  const hits = pointerWithin(args)
  const resolved = hits.length > 0 ? hits : rectIntersection(args)
  const folder = resolved.find((hit) => String(hit.id).startsWith('folder:'))
  return folder ? [folder] : resolved
}

function dataOf(value: unknown): SidebarDndData {
  return (value ?? {}) as SidebarDndData
}

export const SidebarDndContext: FC<{
  children: ReactNode
  /** Held against a panel edge mid-drag, a drag switches space. */
  onEdgeHold?: (direction: -1 | 1) => void
}> = ({ children, onEdgeHold }) => {
  const [dragging, setDragging] = useState<DragSource | null>(null)
  const edgeHandler = useRef(onEdgeHold)
  edgeHandler.current = onEdgeHold

  // dnd-kit reports collisions, not raw coordinates, so the edge zone needs
  // its own pointer stream — only while something is actually being dragged.
  useEffect(() => {
    if (!dragging) return
    let held: -1 | 0 | 1 = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const onPointerMove = (event: PointerEvent) => {
      const direction = edgeDirection(event.clientX, window.innerWidth)
      if (direction === held) return
      held = direction
      clearTimeout(timer)
      if (direction === 0) return
      timer = setTimeout(() => {
        edgeHandler.current?.(direction)
        held = 0
      }, EDGE_HOLD_MS)
    }
    window.addEventListener('pointermove', onPointerMove)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      clearTimeout(timer)
    }
  }, [dragging])
  // dnd-kit keeps sensor instances by identity; recreating them mid-drag
  // aborts it, so `useSensors` is the required memo here.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const onDragStart = (event: DragStartEvent) => {
    setDragging(dataOf(event.active.data.current).source ?? null)
  }

  const onDragEnd = (event: DragEndEvent) => {
    setDragging(null)
    const source = dataOf(event.active.data.current).source
    const target = event.over && dataOf(event.over.data.current).target
    if (!source || !target) return
    void applyDropIntents(planDrop(source, target))
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragCancel={() => setDragging(null)}
      onDragEnd={onDragEnd}
      accessibility={{
        announcements: {
          onDragStart: () => 'Picked up sidebar item',
          onDragOver: () => '',
          onDragEnd: () => 'Dropped sidebar item',
          onDragCancel: () => 'Drag cancelled',
        },
      }}
    >
      {children}
      <DragOverlay dropAnimation={null}>
        {dragging ? (
          <div className="pointer-events-none flex h-9 max-w-[220px] items-center gap-2 rounded-md bg-[var(--sb-bg-toolbar)] px-2 text-xs opacity-70 shadow-lg">
            <span className="truncate">
              {dragging.title ?? dragging.url ?? 'Item'}
            </span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
