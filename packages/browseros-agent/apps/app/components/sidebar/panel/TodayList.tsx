import { useDroppable } from '@dnd-kit/core'
import type { FC } from 'react'
import type { SidebarDndData } from '@/components/sidebar/dnd/SidebarDndContext'
import { cn } from '@/lib/utils'
import { useWindowedRows } from '@/modules/sidebar/sidebar-layout.hooks'
import {
  ICON_ONLY_ROW_HEIGHT,
  ROW_HEIGHT,
  type TabRowData,
} from '@/modules/sidebar/sidebar-rows.helpers'
import { TabRow } from './TabRow'

export interface TodayListProps {
  rows: TabRowData[]
  /** Unique per strip: every mounted space registers its own drop zone. */
  dropId?: string
  iconOnly?: boolean
  emptyLabel?: string
  onActivate: (tabId: number) => void
  onClose: (tabId: number) => void
  onPin: (tabId: number) => void
  onAddEssential: (tabId: number) => void
}

/** Rows are fixed height, so anything past the spec's 40-row cap is windowed. */
export const TodayList: FC<TodayListProps> = ({
  rows,
  dropId = 'today',
  iconOnly,
  emptyLabel = 'No tabs in this space yet',
  onActivate,
  onClose,
  onPin,
  onAddEssential,
}) => {
  const rowHeight = iconOnly ? ICON_ONLY_ROW_HEIGHT : ROW_HEIGHT
  const { ref, range, totalHeight, offsetTop } =
    useWindowedRows<HTMLDivElement>(rows.length, rowHeight)
  const { setNodeRef, isOver } = useDroppable({
    id: dropId,
    data: { target: { zone: 'today' } } satisfies SidebarDndData,
  })

  return (
    <div
      ref={(node) => {
        ref.current = node
        setNodeRef(node)
      }}
      data-today-list
      className={cn(
        'min-h-0 flex-1 overflow-y-auto px-1',
        isOver && 'bg-white/5',
      )}
    >
      {rows.length === 0 ? (
        <p className="px-2 py-3 text-xs opacity-60">{emptyLabel}</p>
      ) : (
        <div style={{ height: totalHeight, position: 'relative' }}>
          <div style={{ transform: `translateY(${offsetTop}px)` }}>
            {rows.slice(range.start, range.end).map((row) => (
              <TabRow
                key={row.tabId}
                row={row}
                iconOnly={iconOnly}
                onActivate={() => onActivate(row.tabId)}
                onClose={() => onClose(row.tabId)}
                onPin={() => onPin(row.tabId)}
                onAddEssential={() => onAddEssential(row.tabId)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
