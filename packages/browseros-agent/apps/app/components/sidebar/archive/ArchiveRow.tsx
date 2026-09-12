import type { FC } from 'react'
import { Favicon } from '@/components/sidebar/panel/Favicon'
import type { ArchivedItem, Space } from '@/lib/sidebar/core/types'
import {
  ARCHIVE_ROW_HEIGHT,
  hostOf,
  REASON_LABEL,
  relativeTime,
  titleOf,
  urlOf,
} from '@/modules/sidebar/archive.helpers'

export interface ArchiveRowProps {
  entry: ArchivedItem
  space?: Space
  onRestore: () => void
}

export const ArchiveRow: FC<ArchiveRowProps> = ({
  entry,
  space,
  onRestore,
}) => {
  const title = titleOf(entry)
  const host = hostOf(entry)

  return (
    <button
      type="button"
      onClick={onRestore}
      title={`Restore ${title}`}
      style={{ height: ARCHIVE_ROW_HEIGHT }}
      className="flex w-full items-center gap-2 rounded-md px-2 text-left hover:bg-white/10"
    >
      <Favicon
        url={urlOf(entry)}
        liveIcon={
          entry.item.data.kind === 'tab' ? entry.item.data.favicon : undefined
        }
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-xs">{title}</span>
        <span className="flex min-w-0 items-center gap-1 text-[10px] opacity-70">
          <span className="truncate">{host}</span>
          {space && (
            <span className="shrink-0">
              · {space.icon} {space.name}
            </span>
          )}
        </span>
      </span>
      <span className="shrink-0 rounded-sm bg-white/15 px-1 text-[10px] opacity-80">
        {REASON_LABEL[entry.reason]}
      </span>
      <span className="shrink-0 text-[10px] opacity-60">
        {relativeTime(entry.archivedAt)}
      </span>
    </button>
  )
}
