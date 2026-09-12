import { X } from 'lucide-react'
import type { FC } from 'react'
import { cn } from '@/lib/utils'
import {
  ICON_ONLY_ROW_HEIGHT,
  ROW_HEIGHT,
  type TabRowData,
} from '@/modules/sidebar/sidebar-rows.helpers'
import { Favicon } from './Favicon'

export interface TabRowProps {
  row: TabRowData
  iconOnly?: boolean
  onActivate: () => void
  onClose: () => void
}

export const TabRow: FC<TabRowProps> = ({
  row,
  iconOnly,
  onActivate,
  onClose,
}) => {
  return (
    <div
      className={cn(
        'group flex w-full items-center gap-2 rounded-md px-2',
        row.active ? 'bg-white/20' : 'hover:bg-white/10',
        iconOnly && 'justify-center px-0',
      )}
      style={{ height: iconOnly ? ICON_ONLY_ROW_HEIGHT : ROW_HEIGHT }}
      onAuxClick={(event) => {
        if (event.button === 1) {
          event.preventDefault()
          onClose()
        }
      }}
    >
      <button
        type="button"
        onClick={onActivate}
        title={row.title}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <Favicon url={row.url} liveIcon={row.favIconUrl} />
        {!iconOnly && (
          <span className="min-w-0 flex-1 truncate text-xs">{row.title}</span>
        )}
        {!iconOnly && row.spaceName && (
          <span className="shrink-0 rounded-sm bg-white/15 px-1 text-[10px] opacity-80">
            {row.spaceName}
          </span>
        )}
      </button>
      {!iconOnly && (
        <button
          type="button"
          aria-label={`Close ${row.title}`}
          onClick={onClose}
          className="shrink-0 rounded-sm p-0.5 opacity-0 hover:bg-white/20 focus:opacity-100 group-hover:opacity-70"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
}
