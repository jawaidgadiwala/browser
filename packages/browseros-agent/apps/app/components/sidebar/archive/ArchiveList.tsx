import type { FC } from 'react'
import type { ArchivedItem, Space, SpaceId } from '@/lib/sidebar/core/types'
import type { ArchiveRow as ArchiveRowData } from '@/modules/sidebar/archive.helpers'
import { useWindowedArchive } from '@/modules/sidebar/archive.hooks'
import { ArchiveDayHeader } from './ArchiveDayHeader'
import { ArchiveRow } from './ArchiveRow'

export interface ArchiveListProps {
  rows: ArchiveRowData[]
  spaces: Record<SpaceId, Space>
  emptyLabel: string
  onRestore: (entry: ArchivedItem) => void
  onRestoreDay: (dayKey: string) => void
}

/** Day headers and entries have different heights, so the hook windows both. */
export const ArchiveList: FC<ArchiveListProps> = ({
  rows,
  spaces,
  emptyLabel,
  onRestore,
  onRestoreDay,
}) => {
  const { ref, range, totalHeight, offsetTop } =
    useWindowedArchive<HTMLDivElement>(rows)

  if (rows.length === 0) {
    return (
      <div ref={ref} className="min-h-0 flex-1 overflow-y-auto px-1">
        <p className="px-2 py-3 text-xs opacity-60">{emptyLabel}</p>
      </div>
    )
  }

  return (
    <div ref={ref} className="min-h-0 flex-1 overflow-y-auto px-1">
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${offsetTop}px)` }}>
          {rows
            .slice(range.start, range.end)
            .map((row) =>
              row.kind === 'header' ? (
                <ArchiveDayHeader
                  key={row.key}
                  label={row.label}
                  count={row.count}
                  onRestoreAll={() => onRestoreDay(row.dayKey)}
                />
              ) : (
                <ArchiveRow
                  key={row.key}
                  entry={row.entry}
                  space={spaces[row.entry.spaceId]}
                  onRestore={() => onRestore(row.entry)}
                />
              ),
            )}
        </div>
      </div>
    </div>
  )
}
