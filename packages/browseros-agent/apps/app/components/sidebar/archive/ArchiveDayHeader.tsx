import type { FC } from 'react'
import { ARCHIVE_HEADER_HEIGHT } from '@/modules/sidebar/archive.helpers'

export interface ArchiveDayHeaderProps {
  label: string
  count: number
  onRestoreAll: () => void
}

export const ArchiveDayHeader: FC<ArchiveDayHeaderProps> = ({
  label,
  count,
  onRestoreAll,
}) => (
  <div
    className="flex items-center gap-2 px-2"
    style={{ height: ARCHIVE_HEADER_HEIGHT }}
  >
    <span className="font-medium text-[11px] uppercase tracking-wide opacity-70">
      {label}
    </span>
    <span className="text-[10px] opacity-50">{count}</span>
    <button
      type="button"
      onClick={onRestoreAll}
      className="ml-auto rounded-sm px-1 text-[10px] opacity-70 hover:bg-white/15 hover:opacity-100"
    >
      Restore all
    </button>
  </div>
)
